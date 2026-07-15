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
  const editorToolbar = document.getElementById('editorToolbar');
  const closeEditorBtn = document.getElementById('closeEditorBtn');
  const cancelEditorBtn = document.getElementById('cancelEditorBtn');
  const saveSopBtn = document.getElementById('saveSopBtn');

  let sops = [];
  let activeSopId = null;
  let editingSopId = null; // null while creating a new SOP, set while editing an existing one

  // ── Firestore-backed storage ──
  // SOPs live in a single agency/sops document ({ list: [...] }), the same
  // pattern the rest of the hub uses for agency/clientsDb and
  // agency/activityLog. That means they fall under the existing
  // "match /agency/{document} { allow read, write: if isAdmin(); }" rule
  // automatically - no Firestore rules changes needed for this feature.
  function getSopsDocRef() {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc) return null;
    return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "sops");
  }

  function saveSopsToFirestore() {
    const docRef = getSopsDocRef();
    if (!docRef || !window.parent.firebaseSetDocFromJSON) {
      alert("Couldn't reach the Hub's database - try reopening this tab from the Hub.");
      return;
    }
    // Pass a JSON string, not an object literal, across the iframe
    // boundary. An object built in this iframe's own JS realm gets
    // rejected by Firestore ("a custom Object object") when handed
    // straight to a Firestore call bound to the parent page - a string is
    // a primitive with no realm identity problem, and firebaseSetDocFromJSON
    // parses it in the parent's own realm before writing.
    const jsonString = JSON.stringify({ list: sops });
    try {
      window.parent.firebaseSetDocFromJSON(docRef, jsonString).catch(err => {
        console.error("Failed to save SOPs:", err);
        alert("Couldn't save to the cloud: " + err.message);
      });
    } catch (err) {
      console.error("Failed to save SOPs:", err);
      alert("Couldn't save to the cloud: " + err.message);
    }
  }

  function initSops() {
    const docRef = getSopsDocRef();
    if (!docRef || !window.parent.firebaseOnSnapshot) {
      // No parent Firebase access (e.g. this file opened directly outside
      // the Hub) - fall back to the bundled starter content, read-only.
      sops = typeof SOPS !== "undefined" && Array.isArray(SOPS) ? SOPS : [];
      renderSopList(sops);
      return;
    }

    window.parent.firebaseOnSnapshot(docRef, (docSnap) => {
      if (docSnap.exists) {
        const data = docSnap.data();
        sops = Array.isArray(data.list) ? data.list : [];
      } else {
        // First run ever: migrate the bundled starter SOPs into Firestore
        // once, so nothing already written is lost and everything becomes
        // editable going forward.
        sops = typeof SOPS !== "undefined" && Array.isArray(SOPS) ? JSON.parse(JSON.stringify(SOPS)) : [];
        try {
          saveSopsToFirestore();
        } catch (err) {
          // Even if the migration save fails for some reason, still show
          // the bundled content below rather than leaving the sidebar
          // blank with no explanation.
          console.error("SOP migration save failed:", err);
        }
      }

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
    }, (err) => {
      console.error("SOP listener error:", err);
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

      // Images are deliberately dropped, not just unwrapped: SOPs share one
      // Firestore document, and a pasted screenshot as a base64 data URL
      // could blow past Firestore's per-document size limit and break
      // every SOP at once, not just this one.
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
  unwrapEmptyHeadingShells(editorContent); });

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
  function openNewSopForm() {
    editingSopId = null;
    editorModalTitle.textContent = 'New SOP';
    editorCategory.value = '';
    editorTitle.value = '';
    editorContent.innerHTML = '';
    editorOverlay.style.display = 'flex';
    editorCategory.focus();
  }

  function openEditForm(sop) {
    editingSopId = sop.id;
    editorModalTitle.textContent = 'Edit SOP';
    editorCategory.value = sop.category;
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

  function handleSaveSop() {
    const category = editorCategory.value.trim();
    const title = editorTitle.value.trim();
    const content = editorContent.innerHTML.trim();

    if (!category || !title) {
      alert('Category and Title are required.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (editingSopId) {
      const existing = sops.find(s => s.id === editingSopId);
      if (existing) {
        existing.category = category;
        existing.title = title;
        existing.content = content;
        existing.format = 'html';
        existing.date = today;
        activeSopId = existing.id;
      }
    } else {
      const baseId = 'sop-' + slugify(title);
      let id = baseId;
      let suffix = 2;
      while (sops.find(s => s.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix++;
      }
      const newSop = { id, category, title, content, format: 'html', date: today };
      sops.push(newSop);
      activeSopId = id;
    }

    saveSopsToFirestore();
    closeEditor();

    const sop = sops.find(s => s.id === activeSopId);
    if (sop) loadSop(sop);
    renderSopList(sops);
  }

  function handleDeleteSop() {
    if (!activeSopId) return;
    const sop = sops.find(s => s.id === activeSopId);
    if (!sop) return;

    const ok = confirm(`Delete "${sop.title}"? This can't be undone.`);
    if (!ok) return;

    sops = sops.filter(s => s.id !== activeSopId);
    activeSopId = null;
    viewerState.style.display = 'none';
    welcomeState.style.display = 'block';
    saveSopsToFirestore();
    renderSopList(sops);
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
