document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const sopListEl = document.getElementById('sopList');

  const welcomeState = document.getElementById('welcomeState');
  const viewerState = document.getElementById('viewerState');

  const docCategory = document.getElementById('docCategory');
  const docTitle = document.getElementById('docTitle');
  const docDate = document.getElementById('docDate');
  const docBody = document.getElementById('docBody');

  const newSopBtn = document.getElementById('newSopBtn');
  const editSopBtn = document.getElementById('editSopBtn');
  const deleteSopBtn = document.getElementById('deleteSopBtn');

  const editorOverlay = document.getElementById('editorOverlay');
  const editorModalTitle = document.getElementById('editorModalTitle');
  const editorCategory = document.getElementById('editorCategory');
  const editorTitle = document.getElementById('editorTitle');
  const editorContent = document.getElementById('editorContent'); // contenteditable rich-text area
  const editorNewCategory = document.getElementById('editorNewCategory');
  const editorToolbar = document.getElementById('editorToolbar');
  const closeEditorBtn = document.getElementById('closeEditorBtn');
  const cancelEditorBtn = document.getElementById('cancelEditorBtn');
  const saveSopBtn = document.getElementById('saveSopBtn');

  let sops = [];
  let activeSopId = null;
  let editingSopId = null; // null while creating a new SOP, set while editing an existing one

  // ── Non-blocking status toasts ──
  //
  // The old failure path was a native window.alert(), which blocks all page
  // JavaScript until a human clicks OK - that's what made the original
  // Firestore size-limit bug look like an unresponsive freeze instead of a
  // reported error. This toast is a plain DOM element with no blocking
  // behavior, so a failed save is visible without halting the page for
  // anyone (including automated tooling, screen readers, or anyone away
  // from the keyboard when it happens).
  function ensureToastContainer() {
    let container = document.getElementById('sopToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'sopToastContainer';
      container.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px; max-width:360px; pointer-events:none;';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    const isError = type === 'error';
    toast.style.cssText = [
      'pointer-events:auto',
      'background:' + (isError ? '#3f1d1d' : '#16321f'),
      'border:1px solid ' + (isError ? '#ef4444' : '#22c55e'),
      'color:#f3f4f6',
      'padding:12px 14px',
      'border-radius:8px',
      'font-size:0.85rem',
      'line-height:1.4',
      'box-shadow:0 4px 14px rgba(0,0,0,0.45)',
      'font-family:inherit'
    ].join(';');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, isError ? 9000 : 3500);
  }

  // ── Firestore-backed storage ──
  //
  // HISTORY: SOPs originally lived in a single agency/sops document
  // ({ list: [...] }), the same pattern the rest of the hub uses for
  // agency/clientsDb and agency/activityLog, so everything fell under the
  // existing "match /agency/{document} { allow read, write: if isAdmin(); }"
  // rule automatically. That worked fine while the wiki was small, but
  // Firestore caps every document at 1,048,576 bytes, and once the combined
  // text of every SOP crossed that ceiling, EVERY save (and delete) started
  // failing outright - the whole document is rewritten on every write, so
  // one oversized document blocks all future changes to any SOP, not just
  // the newest one.
  //
  // FIX: split the same { list: [...] } payload across as many
  // agency/sops-shard-N documents as needed to keep each one safely under
  // the limit, plus one tiny agency/sopShardMeta document ({ count: N })
  // recording how many shards currently exist. Every shard is still a
  // single document directly under /agency/, so this still needs no
  // Firestore rules changes. Everything below this storage layer -
  // rendering, search, the editor, save/delete button handlers - keeps
  // working against the same in-memory `sops` array as before and doesn't
  // need to know shards exist at all.
  const SOP_SHARD_PREFIX = "sops-shard-";
  // Comfortably under Firestore's 1,048,576-byte hard limit, leaving
  // headroom for Firestore's own per-field/document storage overhead
  // (actual on-disk document size isn't identical to JSON.stringify().length).
  const MAX_SHARD_BYTES = 700000;

  let shardData = {};           // { [shardIndex]: [...sopsInThatShard] }
  let shardUnsubscribers = [];  // active onSnapshot unsubscribe fns, one per shard
  let lastKnownShardCount = 0;  // shard count as of the last successful sync

  function getSopShardMetaDocRef() {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc) return null;
    return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "sopShardMeta");
  }

  function getSopShardDocRef(shardIndex) {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc) return null;
    return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", SOP_SHARD_PREFIX + shardIndex);
  }

  // Legacy pre-sharding location. Only ever read once, during the one-time
  // migration in initSops() below - never written to again after that.
  function getLegacySopsDocRef() {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc) return null;
    return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "sops");
  }

  // Greedily bin-packs the full SOP list into shard-sized chunks, each kept
  // under MAX_SHARD_BYTES when serialized the same way it's actually saved
  // (JSON.stringify({ list: [...] })). Blob's UTF-8 byte length matches
  // what Firestore actually stores far more accurately than .length would
  // for any SOP containing non-ASCII characters (emoji, curly quotes, etc.
  // are all over these SOPs).
  function packSopsIntoShards(allSops) {
    const shards = [];
    let current = [];
    for (const sop of allSops) {
      const trial = [...current, sop];
      const size = new Blob([JSON.stringify({ list: trial })]).size;
      if (size > MAX_SHARD_BYTES && current.length > 0) {
        shards.push(current);
        current = [sop];
      } else {
        current = trial;
      }
    }
    if (current.length > 0 || shards.length === 0) shards.push(current);
    return shards;
  }

  // Returns the underlying Promise so callers can await real confirmation
  // of a successful write instead of assuming success the moment this
  // function is called. Previously this function swallowed the result
  // itself (fire-and-forget + its own alert() on failure), which is what
  // let the UI show "saved" before the cloud write had actually landed -
  // callers now decide what "saved" and "failed" should look like.
  function saveSopsToFirestore() {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc || !window.parent.firebaseSetDocFromJSON) {
      return Promise.reject(new Error("Couldn't reach the Hub's database - try reopening this tab from the Hub."));
    }

    const shards = packSopsIntoShards(sops);

    // Pass a JSON string, not an object literal, across the iframe
    // boundary. An object built in this iframe's own JS realm gets
    // rejected by Firestore ("a custom Object object") when handed
    // straight to a Firestore call bound to the parent page - a string is
    // a primitive with no realm identity problem, and firebaseSetDocFromJSON
    // parses it in the parent's own realm before writing.
    const writes = shards.map((shardList, i) => {
      const docRef = getSopShardDocRef(i);
      return window.parent.firebaseSetDocFromJSON(docRef, JSON.stringify({ list: shardList }));
    });

    // If the list just got shorter/smaller and now needs fewer shards than
    // last time, blank out the now-unused trailing shard documents instead
    // of leaving stale content sitting in them.
    for (let i = shards.length; i < lastKnownShardCount; i++) {
      const docRef = getSopShardDocRef(i);
      writes.push(window.parent.firebaseSetDocFromJSON(docRef, JSON.stringify({ list: [] })));
    }

    const metaRef = getSopShardMetaDocRef();
    writes.push(window.parent.firebaseSetDocFromJSON(metaRef, JSON.stringify({ count: shards.length })));

    return Promise.all(writes);
  }

  function rebuildSopsFromShards() {
    const merged = [];
    for (let i = 0; i < lastKnownShardCount; i++) {
      if (Array.isArray(shardData[i])) merged.push(...shardData[i]);
    }
    sops = merged;

    const query = searchInput.value.trim().toLowerCase();
    renderSopList(query ? filterSops(query) : sops);

    // If the currently-open SOP changed or was deleted (e.g. from another
    // tab), refresh the reading pane to match.
    if (activeSopId) {
      const stillExists = sops.find(s => s.id === activeSopId);
      if (stillExists) {
        loadSop(stillExists);
      } else {
        activeSopId = null;
        viewerState.style.display = 'none';
        welcomeState.style.display = 'block';
      }
    }
  }

  function listenToShard(shardIndex) {
    const docRef = getSopShardDocRef(shardIndex);
    if (!docRef || !window.parent.firebaseOnSnapshot) return;
    const unsubscribe = window.parent.firebaseOnSnapshot(docRef, (docSnap) => {
      shardData[shardIndex] = docSnap.exists && Array.isArray(docSnap.data().list) ? docSnap.data().list : [];
      rebuildSopsFromShards();
    }, (err) => {
      console.error("SOP shard listener error:", err);
    });
    shardUnsubscribers.push(unsubscribe);
  }

  function setShardListenerCount(count) {
    if (count === lastKnownShardCount && shardUnsubscribers.length === count) return;
    shardUnsubscribers.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') unsubscribe();
    });
    shardUnsubscribers = [];
    shardData = {};
    lastKnownShardCount = count;
    for (let i = 0; i < count; i++) listenToShard(i);
  }

  function initSops() {
    const metaRef = getSopShardMetaDocRef();
    if (!metaRef || !window.parent.firebaseOnSnapshot || !window.parent.firebaseGetDoc) {
      // No parent Firebase access (e.g. this file opened directly outside
      // the Hub) - fall back to the bundled starter content, read-only.
      sops = typeof SOPS !== "undefined" && Array.isArray(SOPS) ? SOPS : [];
      renderSopList(sops);
      return;
    }

    window.parent.firebaseOnSnapshot(metaRef, async (metaSnap) => {
      if (metaSnap.exists && typeof metaSnap.data().count === 'number') {
        setShardListenerCount(metaSnap.data().count);
        return;
      }

      // No shard metadata yet - either a brand-new install, or a Hub still
      // on the old single-document format that needs a one-time migration
      // into shards.
      try {
        const legacyRef = getLegacySopsDocRef();
        const legacySnap = legacyRef ? await window.parent.firebaseGetDoc(legacyRef) : null;
        const legacyList = legacySnap && legacySnap.exists && Array.isArray(legacySnap.data().list)
          ? legacySnap.data().list
          : null;

        sops = legacyList
          ? legacyList
          : (typeof SOPS !== "undefined" && Array.isArray(SOPS) ? JSON.parse(JSON.stringify(SOPS)) : []);

        // Writes the migrated list into shards + shard metadata. The
        // metadata write above will re-trigger this listener with
        // metaSnap.exists === true next time, switching over to the normal
        // per-shard listeners.
        saveSopsToFirestore().catch(err => {
          console.error("SOP migration save failed:", err);
          showToast("Couldn't migrate the SOP library to the new format: " + err.message, 'error');
        });
        renderSopList(sops);
      } catch (err) {
        // Even if migration fails for some reason, still show the bundled
        // content below rather than leaving the sidebar blank with no
        // explanation.
        console.error("SOP migration failed:", err);
        sops = typeof SOPS !== "undefined" && Array.isArray(SOPS) ? JSON.parse(JSON.stringify(SOPS)) : [];
        renderSopList(sops);
      }
    }, (err) => {
      console.error("SOP shard meta listener error:", err);
    });
  }

  // Legacy entries (created before the rich-text editor) store Markdown in
  // `content` and have no `format` field. New/edited entries store real
  // HTML from the contenteditable area and are marked format: 'html'.
  function sopContentAsHtml(sop) {
    if (sop.format === 'html') return sop.content || '';
    marked.setOptions({ breaks: true });
    return marked.parse(sop.content || '');
  }

  function getPlainTextForSearch(sop) {
    const html = sopContentAsHtml(sop);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || '').toLowerCase();
  }

  function filterSops(query) {
    return sops.filter(sop =>
      sop.title.toLowerCase().includes(query) ||
      sop.category.toLowerCase().includes(query) ||
      getPlainTextForSearch(sop).includes(query)
    );
  }

  // Search functionality (Debounced for performance)
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderSopList(query ? filterSops(query) : sops);
    }, 300);
  });

  function renderSopList(sopsToRender) {
    sopListEl.innerHTML = '';

    if (sopsToRender.length === 0) {
      sopListEl.innerHTML = '<p style="color:var(--color-text-secondary); text-align:center; padding: 20px; font-size: 0.9rem;">No SOPs found.</p>';
      return;
    }

    // Group by category
    const grouped = sopsToRender.reduce((acc, sop) => {
      if (!acc[sop.category]) acc[sop.category] = [];
      acc[sop.category].push(sop);
      return acc;
    }, {});

    Object.keys(grouped).sort().forEach(category => {
      const groupEl = document.createElement('div');
      groupEl.className = 'category-group';

      const titleEl = document.createElement('div');
      titleEl.className = 'category-title';
      titleEl.textContent = category;
      groupEl.appendChild(titleEl);

      grouped[category].forEach(sop => {
        const itemEl = document.createElement('div');
        itemEl.className = `sop-item ${activeSopId === sop.id ? 'active' : ''}`;

        // Icon
        const icon = document.createElement('div');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';

        const text = document.createElement('span');
        text.textContent = sop.title;

        itemEl.appendChild(icon);
        itemEl.appendChild(text);

        itemEl.addEventListener('click', () => {
          activeSopId = sop.id;
          renderSopList(sopsToRender); // Refresh active state
          loadSop(sop);
        });

        groupEl.appendChild(itemEl);
      });

      sopListEl.appendChild(groupEl);
    });
  }

  function loadSop(sop) {
    welcomeState.style.display = 'none';
    viewerState.style.display = 'block';

    docCategory.textContent = sop.category;
    docTitle.textContent = sop.title;
    docDate.textContent = `Last updated: ${sop.date}`;

    docBody.innerHTML = sopContentAsHtml(sop);
  }

  // ── Rich-text paste sanitization ──
  // ClickUp, Google Docs, and Word all paste as HTML full of inline
  // styles, spans, and classes that would fight the wiki's own design.
  // Strip everything down to a small whitelist of semantic tags so pasted
  // content picks up the wiki's styling instead of bringing its own.
  const ALLOWED_TAGS = new Set([
    'H1', 'H2', 'H3', 'H4', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U',
    'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY',
    'TR', 'TH', 'TD', 'CODE', 'PRE', 'HR'
  ]);
  const ALLOWED_ATTRS = { A: ['href'] };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeNode(node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) return;

      if (child.nodeType !== Node.ELEMENT_NODE) {
        node.removeChild(child);
        return;
      }

      const tag = child.tagName;

      // Images are deliberately dropped, not just unwrapped: SOPs share a
      // handful of Firestore documents, and a pasted screenshot as a
      // base64 data URL could still blow past a single shard's size limit
      // and break every SOP in that shard at once, not just this one.
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG' || tag === 'META' || tag === 'LINK' || tag === 'IFRAME') {
        child.remove();
        return;
      }

      // Block-level wrapper tags (div, section, etc.) from ClickUp/Word
      // usually represent one line, table cell, or field - not just
      // decoration. Splicing their content straight into whatever
      // surrounds them (the old behavior) throws away that line break,
      // so two adjacent fields like "...ahead of the Welcome Guide email"
      // and "Deadline: Client must submit..." end up glued together as
      // "...emailDeadline: Client must submit..." with no space at all.
      // Wrap the block's content in its own <p> instead so the break is
      // preserved and it picks up normal paragraph spacing.
      const BLOCK_LEVEL_TAGS = new Set([
        'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE',
        'FIGURE', 'FIGCAPTION', 'MAIN', 'NAV', 'DD', 'DT', 'DL'
      ]);
      if (!ALLOWED_TAGS.has(tag)) {
        sanitizeNode(child);
        if (BLOCK_LEVEL_TAGS.has(tag) && child.textContent.trim() !== '') {
          const wrapped = document.createElement('p');
          while (child.firstChild) {
            wrapped.appendChild(child.firstChild);
          }
          node.insertBefore(wrapped, child);
        } else {
          // Genuinely inline wrappers (span, font, etc.) - unwrap flat,
          // no break needed, they sit mid-sentence.
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }
        }
        node.removeChild(child);
        return;
      }

      // ClickUp/Word/Google Docs heading tags aren't a reliable signal on
      // their own - some exports wrap entire multi-sentence paragraphs (or
      // even a whole "step" block) in <h1> even though nothing about that
      // text is actually a heading. Left alone, that paragraph renders at
      // the oversized heading font-size, making pasted SOP updates look
      // "very big" compared to hand-authored ones. Real headings are short
      // labels, so demote any heading-tagged block that reads like running
      // prose down to a plain paragraph before it keeps its tag.
      //
      // Length alone isn't enough of a signal - a short block like
      // "<h1><strong>Owner:</strong> Account Manager<strong>Trigger:</strong>
      // Client gives notice...</h1>" is only ~80 characters (under a
      // pure length cutoff) but is clearly two merged "Label: value"
      // fields, not a heading. Multiple bold sub-labels or multiple
      // colons inside one heading tag are just as strong a signal as
      // raw length, so any of the three trips the demotion.
      const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4']);
      if (HEADING_TAGS.has(tag)) {
        const headingText = child.textContent.trim();
        const boldSubLabels = child.querySelectorAll('strong, b').length;
        const colonCount = (headingText.match(/:/g) || []).length;
        const looksLikeMergedFields =
          headingText.length > 120 || boldSubLabels > 1 || colonCount > 1;
        if (looksLikeMergedFields) {
          const demoted = document.createElement('p');
          while (child.firstChild) {
            demoted.appendChild(child.firstChild);
          }
          node.replaceChild(demoted, child);
          sanitizeNode(demoted);
          return;
        }
      }

      const allowedAttrs = ALLOWED_ATTRS[tag] || [];
      Array.from(child.attributes).forEach(attr => {
        if (!allowedAttrs.includes(attr.name)) {
          child.removeAttribute(attr.name);
        }
      });

      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) {
          child.removeAttribute('href');
        }
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener');
      }

      sanitizeNode(child);
    });
  }

  // ClickUp/Word/Google Docs don't consistently mark a pasted table's
  // header row as <th> - some exports use a plain <td> row styled bold
  // instead. Left alone, that means some pasted tables get the wiki's
  // indigo-tinted header background/color (.doc-body th) and others render
  // with plain, uncolored cells for their header row, so tables end up
  // looking inconsistent from one SOP to the next. Force the first row of
  // every table to real <th> cells so every pasted table's header looks
  // the same regardless of how the source app marked it up.
  function normalizeTableHeaders(container) {
    container.querySelectorAll('table').forEach(table => {
      const firstRow = table.querySelector('tr');
      if (!firstRow) return;
      Array.from(firstRow.children).forEach(cell => {
        if (cell.tagName === 'TD') {
          const th = document.createElement('th');
          th.innerHTML = cell.innerHTML;
          cell.replaceWith(th);
        }
      });
    });
  }

  // Some source apps glue adjacent inline runs together with zero
  // separating space at all - e.g. ClickUp exporting
  // "<strong>Owner:</strong> Account Manager<strong>Trigger:</strong> ..."
  // as one flat run. Unlike the block-level-unwrap case above (which has
  // a wrapper tag to convert into a <p>), there's no wrapper here to hang
  // a fix on - it's just two inline elements sitting shoulder to shoulder.
  // Walk every text node in document order and insert a line break
  // wherever one run ends and the next begins with no whitespace between
  // them at all, so "...Account Manager" and "Trigger:..." don't render
  // as "...Account ManagerTrigger:...". Table cells are skipped since
  // their own cell boundaries already provide real separation.
  function preserveGluedInlineRuns(container) {
    const PROTECTED_WORDS = ['ClickUp'];
    function isProtectedBoundary(beforeText, afterText) {
      return PROTECTED_WORDS.some(word => {
        const splitPoint = word.length - 1;
        return beforeText.endsWith(word.slice(0, splitPoint)) &&
          afterText.startsWith(word.slice(splitPoint));
      });
    }
    const BLOCK_GROUPING_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'TD', 'TH', 'PRE']);
    function nearestBlock(node) {
      let el = node.parentNode;
      while (el && el !== container) {
        if (BLOCK_GROUPING_TAGS.has(el.tagName)) return el;
        el = el.parentNode;
      }
      return container;
    }
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) {
      let inTable = false;
      let anc = n.parentNode;
      while (anc && anc !== container) {
        if (anc.tagName === 'TABLE') { inTable = true; break; }
        anc = anc.parentNode;
      }
      if (!inTable) textNodes.push(n);
    }
    for (let i = 0; i < textNodes.length - 1; i++) {
      const cur = textNodes[i];
      const next = textNodes[i + 1];
      if (nearestBlock(cur) !== nearestBlock(next)) continue;
      const curVal = cur.nodeValue;
      const nextVal = next.nodeValue;
      if (!curVal || !nextVal) continue;
      const lastChar = curVal[curVal.length - 1];
      const firstChar = nextVal[0];
      if (/[a-z\)\]:]/.test(lastChar) && /[A-Z]/.test(firstChar)) {
        if (isProtectedBoundary(curVal, nextVal)) continue;
        const br = document.createElement('br');
        next.parentNode.insertBefore(br, next);
      }
    }
  }

  function sanitizeHtml(rawHtml) {
    const container = document.createElement('div');
    container.innerHTML = rawHtml;
    sanitizeNode(container);
    normalizeTableHeaders(container);
    preserveGluedInlineRuns(container);
    return container.innerHTML;
  }

  editorContent.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    let toInsert;
    if (html) {
      toInsert = sanitizeHtml(html);
    } else {
      toInsert = text
        .split(/\r?\n/)
        .filter(line => line.trim() !== '')
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('') || '<p></p>';
    }
    function unwrapEmptyHeadingShells(container) {
      const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4'));
      headings.forEach(h => {
        const hasOwnText = Array.from(h.childNodes).some(
          n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
        );
        if (!hasOwnText && h.children.length > 0) {
          while (h.firstChild) h.parentNode.insertBefore(h.firstChild, h);
          h.parentNode.removeChild(h);
        }
      });
    }
    document.execCommand('insertHTML', false, toInsert);
    unwrapEmptyHeadingShells(editorContent);
  });

  // ── Toolbar ──
  editorToolbar.querySelectorAll('button').forEach(btn => {
    // Prevent the button from stealing focus away from the contenteditable
    // before the click fires - otherwise the text selection needed for
    // execCommand to apply to the right spot gets lost.
    btn.addEventListener('mousedown', (e) => e.preventDefault());

    btn.addEventListener('click', () => {
      editorContent.focus();
      const cmd = btn.getAttribute('data-cmd');
      const block = btn.getAttribute('data-block');

      if (block) {
        document.execCommand('formatBlock', false, block);
      } else if (cmd === 'createLink') {
        const url = prompt('Link URL:');
        if (url && url.trim()) {
          let safeUrl = url.trim();
          if (!/^https?:\/\//i.test(safeUrl)) safeUrl = 'https://' + safeUrl;
          document.execCommand('createLink', false, safeUrl);
        }
      } else if (cmd) {
        document.execCommand(cmd);
      }
    });
  });

  // ── Editor open/close/save/delete ──
  function getDistinctCategories() {
    const set = new Set();
    sops.forEach(s => { if (s.category) set.add(s.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function populateCategoryDropdown(selectedValue) {
    const categories = getDistinctCategories();
    editorCategory.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a category…';
    editorCategory.appendChild(placeholder);
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      editorCategory.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Add new category…';
    editorCategory.appendChild(newOpt);

    if (selectedValue && categories.includes(selectedValue)) {
      editorCategory.value = selectedValue;
    } else if (selectedValue) {
      const opt = document.createElement('option');
      opt.value = selectedValue;
      opt.textContent = selectedValue;
      editorCategory.insertBefore(opt, editorCategory.lastChild);
      editorCategory.value = selectedValue;
    } else {
      editorCategory.value = '';
    }
    toggleNewCategoryInput();
  }

  function toggleNewCategoryInput() {
    const isNew = editorCategory.value === '__new__';
    editorNewCategory.style.display = isNew ? 'block' : 'none';
    if (isNew) {
      editorNewCategory.value = '';
      editorNewCategory.focus();
    }
  }

  editorCategory.addEventListener('change', toggleNewCategoryInput);

  function openNewSopForm() {
    editingSopId = null;
    editorModalTitle.textContent = 'New SOP';
    populateCategoryDropdown('');
    editorTitle.value = '';
    editorContent.innerHTML = '';
    editorOverlay.style.display = 'flex';
    editorCategory.focus();
  }

  function openEditForm(sop) {
    editingSopId = sop.id;
    editorModalTitle.textContent = 'Edit SOP';
    populateCategoryDropdown(sop.category);
    editorTitle.value = sop.title;
    // Legacy Markdown entries get auto-converted to HTML the moment they're
    // opened in the editor; saving completes the one-time migration for
    // that entry.
    editorContent.innerHTML = sopContentAsHtml(sop);
    editorOverlay.style.display = 'flex';
    editorCategory.focus();
  }

  function closeEditor() {
    editorOverlay.style.display = 'none';
  }

  function slugify(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'sop';
  }

  // Both handlers below follow the same shape: mutate the local `sops`
  // array, THEN await the actual Firestore write, and only treat the
  // action as done (close the editor, drop the confirmed view, etc.) once
  // that write has genuinely confirmed. If it rejects, the local mutation
  // is rolled back and an error toast explains why - the editor/viewer
  // stays exactly where the user left it instead of quietly pretending the
  // save worked. This replaces the old fire-and-forget pattern, where
  // saveSopsToFirestore() was called without waiting for it and the editor
  // closed immediately regardless of whether the write behind it actually
  // succeeded - so a failed save and a successful one looked identical
  // until the next reload.
  async function handleSaveSop() {
    let category = editorCategory.value === '__new__'
      ? editorNewCategory.value.trim()
      : editorCategory.value.trim();
    if (category) {
      const existingMatch = getDistinctCategories().find(c => c.toLowerCase() === category.toLowerCase());
      if (existingMatch) category = existingMatch;
    }
    const title = editorTitle.value.trim();
    const content = editorContent.innerHTML.trim();

    if (!category || !title) {
      showToast('Category and Title are required.', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // Snapshot so a failed write can be rolled back cleanly - sops holds
    // the same object references used elsewhere (renderSopList, loadSop),
    // so this is a shallow copy of the array with shallow-cloned entries,
    // not a deep clone of everything.
    const previousSops = sops.map(s => ({ ...s }));
    const wasEditing = !!editingSopId;
    let targetId;

    if (editingSopId) {
      const existing = sops.find(s => s.id === editingSopId);
      if (existing) {
        existing.category = category;
        existing.title = title;
        existing.content = content;
        existing.format = 'html';
        existing.date = today;
        targetId = existing.id;
      }
    } else {
      const baseId = 'sop-' + slugify(title);
      let id = baseId;
      let suffix = 2;
      while (sops.find(s => s.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix++;
      }
      sops.push({ id, category, title, content, format: 'html', date: today });
      targetId = id;
    }

    const originalBtnLabel = saveSopBtn.textContent;
    saveSopBtn.disabled = true;
    saveSopBtn.textContent = 'Saving…';

    try {
      await saveSopsToFirestore();

      activeSopId = targetId;
      closeEditor();
      const sop = sops.find(s => s.id === activeSopId);
      if (sop) loadSop(sop);
      renderSopList(sops);
      showToast(wasEditing ? 'SOP updated.' : 'SOP saved.', 'success');
    } catch (err) {
      console.error('Failed to save SOP:', err);
      sops = previousSops;
      showToast("Couldn't save to the cloud: " + err.message + " - your edits are still in the form, try again.", 'error');
      // Editor deliberately stays open - the title/category/content fields
      // are untouched, so nothing typed is lost and Save can just be
      // clicked again once the underlying problem (usually connectivity,
      // or a still-oversized shard) is sorted out.
    } finally {
      saveSopBtn.disabled = false;
      saveSopBtn.textContent = originalBtnLabel;
    }
  }

  async function handleDeleteSop() {
    if (!activeSopId) return;
    const sop = sops.find(s => s.id === activeSopId);
    if (!sop) return;

    // A native confirm() here is fine - it's a deliberate yes/no decision
    // point, not a failure notification, so blocking is the expected UX
    // and there's no ambiguity about whether an action already happened.
    const ok = confirm(`Delete "${sop.title}"? This can't be undone.`);
    if (!ok) return;

    const previousSops = sops.map(s => ({ ...s }));
    const deletedId = activeSopId;

    sops = sops.filter(s => s.id !== deletedId);

    const originalBtnLabel = deleteSopBtn.textContent;
    deleteSopBtn.disabled = true;
    deleteSopBtn.textContent = 'Deleting…';

    try {
      await saveSopsToFirestore();

      activeSopId = null;
      viewerState.style.display = 'none';
      welcomeState.style.display = 'block';
      renderSopList(sops);
      showToast('SOP deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete SOP:', err);
      sops = previousSops;
      renderSopList(sops);
      showToast("Couldn't delete from the cloud: " + err.message + " - it's still here, try again.", 'error');
      // Viewer pane deliberately left showing the (still-undeleted) SOP.
    } finally {
      deleteSopBtn.disabled = false;
      deleteSopBtn.textContent = originalBtnLabel;
    }
  }

  newSopBtn.addEventListener('click', openNewSopForm);

  editSopBtn.addEventListener('click', () => {
    const sop = sops.find(s => s.id === activeSopId);
    if (sop) openEditForm(sop);
  });

  deleteSopBtn.addEventListener('click', handleDeleteSop);
  closeEditorBtn.addEventListener('click', closeEditor);
  cancelEditorBtn.addEventListener('click', closeEditor);
  saveSopBtn.addEventListener('click', handleSaveSop);

  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) closeEditor();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorOverlay.style.display === 'flex') {
      closeEditor();
    }
  });

  // Wait a tiny bit for the parent to fully inject its Firebase globals if
  // this iframe just loaded fresh (same pattern used by Client Portal
  // Manager for the same reason).
  setTimeout(initSops, 300);
});
