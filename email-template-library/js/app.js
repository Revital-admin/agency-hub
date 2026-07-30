document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const sopListEl = document.getElementById('sopList');

  const welcomeState = document.getElementById('welcomeState');
  const viewerState = document.getElementById('viewerState');

  const docCategory = document.getElementById('docCategory');
  const docNumber = document.getElementById('docNumber');
  const docTitle = document.getElementById('docTitle');
  const docDate = document.getElementById('docDate');
  const docSubject = document.getElementById('docSubject');
  const docBody = document.getElementById('docBody');

  const newSopBtn = document.getElementById('newSopBtn');
  const editSopBtn = document.getElementById('editSopBtn');
  const deleteSopBtn = document.getElementById('deleteSopBtn');
  const copyTemplateBtn = document.getElementById('copyTemplateBtn');

  const editorOverlay = document.getElementById('editorOverlay');
  const editorModalTitle = document.getElementById('editorModalTitle');
  const editorCategory = document.getElementById('editorCategory');
  const editorNumber = document.getElementById('editorNumber');
  const editorTitle = document.getElementById('editorTitle');
  const editorSubject = document.getElementById('editorSubject');
  const editorContent = document.getElementById('editorContent'); // contenteditable rich-text area
  const editorNewCategory = document.getElementById('editorNewCategory');
  const editorToolbar = document.getElementById('editorToolbar');
  const closeEditorBtn = document.getElementById('closeEditorBtn');
  const cancelEditorBtn = document.getElementById('cancelEditorBtn');
  const saveSopBtn = document.getElementById('saveSopBtn');

  let templates = [];
  let activeId = null;
  let editingId = null; // null while creating a new template, set while editing an existing one
  let docVersion = 0; // optimistic-concurrency guard, see saveTemplates() below

  // ── Non-blocking status toasts ──
  function ensureToastContainer() {
    let container = document.getElementById('templateToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'templateToastContainer';
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
  // Single doc (agency/emailTemplates = { list: [...], version: N }) with
  // an optimistic-concurrency guard, the same pattern used by the other
  // agency-wide standalone trackers this session. No sharding like SOP
  // Wiki needs - individual templates are short, so the 1MB Firestore
  // document ceiling isn't a realistic concern here.
  function getDocRef() {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc) return null;
    return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "emailTemplates");
  }

  function loadTemplates() {
    const ref = getDocRef();
    if (!ref || !window.parent.firebaseOnSnapshot) {
      // No parent Firebase access (e.g. opened directly outside the Hub) -
      // fall back to the bundled starter content, read-only.
      templates = typeof EMAIL_TEMPLATES !== "undefined" && Array.isArray(EMAIL_TEMPLATES) ? EMAIL_TEMPLATES : [];
      renderList(templates);
      return;
    }
    window.parent.firebaseOnSnapshot(ref, (docSnap) => {
      const data = docSnap && docSnap.exists ? docSnap.data() : null;
      if (data && Array.isArray(data.list)) {
        templates = data.list;
        docVersion = data.version || 0;
      } else if (!data) {
        // Brand-new install - seed with the starter templates so the
        // library isn't empty. Doesn't block rendering on the write.
        templates = typeof EMAIL_TEMPLATES !== "undefined" && Array.isArray(EMAIL_TEMPLATES) ? JSON.parse(JSON.stringify(EMAIL_TEMPLATES)) : [];
        docVersion = 0;
        saveTemplates().catch(err => console.error("Seeding starter templates failed:", err));
      }

      const query = searchInput.value.trim().toLowerCase();
      renderList(query ? filterTemplates(query) : templates);

      if (activeId) {
        const stillExists = templates.find(t => t.id === activeId);
        if (stillExists) {
          loadTemplate(stillExists);
        } else {
          activeId = null;
          viewerState.style.display = 'none';
          welcomeState.style.display = 'block';
        }
      }
    }, (err) => {
      console.error("Email template listener error:", err);
    });
  }

  // Optimistic-concurrency guard - re-check the doc's version right before
  // writing so two people editing templates at once can't silently
  // clobber each other's changes.
  async function saveTemplates() {
    if (!window.parent || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.saveVersionedAgencyDoc) {
      throw new Error("Couldn't reach the Hub's database - try reopening this tab from the Hub.");
    }
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: templates, version: v }),
    });
    if (!result.ok) {
      throw new Error(result.reason === 'conflict'
        ? "Someone else updated the template library while you had it open. Reload the page to see their changes, then redo your edit."
        : result.error.message);
    }
    docVersion = result.version;
  }

  function templateContentAsHtml(t) {
    if (t.format === 'html') return t.content || '';
    marked.setOptions({ breaks: true });
    return marked.parse(t.content || '');
  }

  function getPlainTextForSearch(t) {
    const html = templateContentAsHtml(t);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || '').toLowerCase();
  }

  function filterTemplates(query) {
    return templates.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query) ||
      (t.subjectLine || '').toLowerCase().includes(query) ||
      (t.templateNumber || '').toLowerCase().includes(query) ||
      getPlainTextForSearch(t).includes(query)
    );
  }

  // Search functionality (Debounced for performance)
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderList(query ? filterTemplates(query) : templates);
    }, 300);
  });

  function renderList(templatesToRender) {
    sopListEl.innerHTML = '';

    if (templatesToRender.length === 0) {
      sopListEl.innerHTML = '<p style="color:var(--color-text-secondary); text-align:center; padding: 20px; font-size: 0.9rem;">No templates found.</p>';
      return;
    }

    const grouped = templatesToRender.reduce((acc, t) => {
      if (!acc[t.category]) acc[t.category] = [];
      acc[t.category].push(t);
      return acc;
    }, {});

    Object.keys(grouped).sort().forEach(category => {
      const groupEl = document.createElement('div');
      groupEl.className = 'category-group';

      const titleEl = document.createElement('div');
      titleEl.className = 'category-title';
      titleEl.textContent = category;
      groupEl.appendChild(titleEl);

      grouped[category].forEach(t => {
        const itemEl = document.createElement('div');
        itemEl.className = `sop-item ${activeId === t.id ? 'active' : ''}`;

        const icon = document.createElement('div');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><polyline points="3 7 12 13 21 7"></polyline></svg>';

        const text = document.createElement('span');
        text.textContent = t.templateNumber ? `${t.templateNumber} — ${t.title}` : t.title;

        itemEl.appendChild(icon);
        itemEl.appendChild(text);

        itemEl.addEventListener('click', () => {
          activeId = t.id;
          renderList(templatesToRender);
          loadTemplate(t);
        });

        groupEl.appendChild(itemEl);
      });

      sopListEl.appendChild(groupEl);
    });
  }

  function loadTemplate(t) {
    welcomeState.style.display = 'none';
    viewerState.style.display = 'block';

    docCategory.textContent = t.category;
    if (t.templateNumber) {
      docNumber.textContent = t.templateNumber;
      docNumber.style.display = '';
    } else {
      docNumber.style.display = 'none';
    }
    docTitle.textContent = t.title;
    docDate.textContent = `Last updated: ${t.date}`;
    docSubject.textContent = t.subjectLine || '(no subject set)';

    docBody.innerHTML = templateContentAsHtml(t);
  }

  copyTemplateBtn.addEventListener('click', async () => {
    const t = templates.find(x => x.id === activeId);
    if (!t) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = templateContentAsHtml(t);
    const plainBody = (tmp.textContent || '').trim();
    const text = `Subject: ${t.subjectLine || ''}\n\n${plainBody}`;
    try {
      await navigator.clipboard.writeText(text);
      const orig = copyTemplateBtn.innerHTML;
      copyTemplateBtn.innerHTML = 'Copied!';
      setTimeout(() => { copyTemplateBtn.innerHTML = orig; }, 2000);
    } catch (err) {
      showToast("Couldn't copy to clipboard: " + err.message, 'error');
    }
  });

  // ── Rich-text paste sanitization (same as SOP Wiki) ──
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
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG' || tag === 'META' || tag === 'LINK' || tag === 'IFRAME') {
        child.remove();
        return;
      }
      const BLOCK_LEVEL_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'MAIN', 'NAV', 'DD', 'DT', 'DL']);
      if (!ALLOWED_TAGS.has(tag)) {
        sanitizeNode(child);
        if (BLOCK_LEVEL_TAGS.has(tag) && child.textContent.trim() !== '') {
          const wrapped = document.createElement('p');
          while (child.firstChild) wrapped.appendChild(child.firstChild);
          node.insertBefore(wrapped, child);
        } else {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
        }
        node.removeChild(child);
        return;
      }
      const allowedAttrs = ALLOWED_ATTRS[tag] || [];
      Array.from(child.attributes).forEach(attr => {
        if (!allowedAttrs.includes(attr.name)) child.removeAttribute(attr.name);
      });
      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) child.removeAttribute('href');
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener');
      }
      sanitizeNode(child);
    });
  }

  function sanitizeHtml(rawHtml) {
    const container = document.createElement('div');
    container.innerHTML = rawHtml;
    sanitizeNode(container);
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
      toInsert = text.split(/\r?\n/).filter(line => line.trim() !== '').map(line => `<p>${escapeHtml(line)}</p>`).join('') || '<p></p>';
    }
    document.execCommand('insertHTML', false, toInsert);
  });

  // ── Toolbar ──
  editorToolbar.querySelectorAll('button').forEach(btn => {
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
    templates.forEach(t => { if (t.category) set.add(t.category); });
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

  function openNewForm() {
    editingId = null;
    editorModalTitle.textContent = 'New Template';
    populateCategoryDropdown('');
    editorNumber.value = '';
    editorTitle.value = '';
    editorSubject.value = '';
    editorContent.innerHTML = '';
    editorOverlay.style.display = 'flex';
    editorCategory.focus();
  }

  function openEditForm(t) {
    editingId = t.id;
    editorModalTitle.textContent = 'Edit Template';
    populateCategoryDropdown(t.category);
    editorNumber.value = t.templateNumber || '';
    editorTitle.value = t.title;
    editorSubject.value = t.subjectLine || '';
    editorContent.innerHTML = templateContentAsHtml(t);
    editorOverlay.style.display = 'flex';
    editorCategory.focus();
  }

  function closeEditor() {
    editorOverlay.style.display = 'none';
  }

  function slugify(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'template';
  }

  async function handleSave() {
    let category = editorCategory.value === '__new__' ? editorNewCategory.value.trim() : editorCategory.value.trim();
    if (category) {
      const existingMatch = getDistinctCategories().find(c => c.toLowerCase() === category.toLowerCase());
      if (existingMatch) category = existingMatch;
    }
    const title = editorTitle.value.trim();
    const subjectLine = editorSubject.value.trim();
    const templateNumber = editorNumber.value.trim();
    const content = editorContent.innerHTML.trim();

    if (!category || !title) {
      showToast('Category and Internal Name are required.', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const previousTemplates = templates.map(t => ({ ...t }));
    const wasEditing = !!editingId;
    let targetId;

    if (editingId) {
      const existing = templates.find(t => t.id === editingId);
      if (existing) {
        existing.category = category;
        existing.templateNumber = templateNumber;
        existing.title = title;
        existing.subjectLine = subjectLine;
        existing.content = content;
        existing.format = 'html';
        existing.date = today;
        targetId = existing.id;
      }
    } else {
      const baseId = 'tpl-' + slugify(title);
      let id = baseId;
      let suffix = 2;
      while (templates.find(t => t.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix++;
      }
      templates.push({ id, category, templateNumber, title, subjectLine, content, format: 'html', date: today });
      targetId = id;
    }

    const originalBtnLabel = saveSopBtn.textContent;
    saveSopBtn.disabled = true;
    saveSopBtn.textContent = 'Saving…';

    try {
      await saveTemplates();
      activeId = targetId;
      closeEditor();
      const t = templates.find(x => x.id === activeId);
      if (t) loadTemplate(t);
      renderList(templates);
      showToast(wasEditing ? 'Template updated.' : 'Template saved.', 'success');
    } catch (err) {
      console.error('Failed to save template:', err);
      templates = previousTemplates;
      showToast("Couldn't save to the cloud: " + err.message, 'error');
    } finally {
      saveSopBtn.disabled = false;
      saveSopBtn.textContent = originalBtnLabel;
    }
  }

  async function handleDelete() {
    if (!activeId) return;
    const t = templates.find(x => x.id === activeId);
    if (!t) return;

    const ok = confirm(`Delete "${t.title}"? This can't be undone.`);
    if (!ok) return;

    const previousTemplates = templates.map(x => ({ ...x }));
    const deletedId = activeId;
    templates = templates.filter(x => x.id !== deletedId);

    const originalBtnLabel = deleteSopBtn.textContent;
    deleteSopBtn.disabled = true;
    deleteSopBtn.textContent = 'Deleting…';

    try {
      await saveTemplates();
      activeId = null;
      viewerState.style.display = 'none';
      welcomeState.style.display = 'block';
      renderList(templates);
      showToast('Template deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete template:', err);
      templates = previousTemplates;
      renderList(templates);
      showToast("Couldn't delete from the cloud: " + err.message, 'error');
    } finally {
      deleteSopBtn.disabled = false;
      deleteSopBtn.textContent = originalBtnLabel;
    }
  }

  newSopBtn.addEventListener('click', openNewForm);
  editSopBtn.addEventListener('click', () => {
    const t = templates.find(x => x.id === activeId);
    if (t) openEditForm(t);
  });
  deleteSopBtn.addEventListener('click', handleDelete);
  closeEditorBtn.addEventListener('click', closeEditor);
  cancelEditorBtn.addEventListener('click', closeEditor);
  saveSopBtn.addEventListener('click', handleSave);

  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) closeEditor();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorOverlay.style.display === 'flex') closeEditor();
  });

  // ── Edit permission (admin/leadership only) ──
  // Everyone with Hub access can still read and copy every template -
  // this only hides New/Edit/Delete for teammates who have a Team Access
  // restriction on their account, same rule used by SOP Wiki, Team Access
  // Manager, and Service Pricing Admin.
  function applyEditPermission() {
    if (!window.parent || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
    window.parent.firebaseOnSnapshot(ref, (docSnap) => {
      const data = docSnap && docSnap.exists ? docSnap.data() : null;
      const users = (data && data.users) ? data.users : {};
      const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
      const isRestricted = currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail);

      newSopBtn.style.display = isRestricted ? 'none' : '';
      editSopBtn.style.display = isRestricted ? 'none' : '';
      deleteSopBtn.style.display = isRestricted ? 'none' : '';
    }, (err) => {
      console.error("Edit-permission listener error:", err);
    });
  }
  applyEditPermission();

  // Wait a tiny bit for the parent to fully inject its Firebase globals if
  // this iframe just loaded fresh (same pattern used elsewhere in the Hub).
  setTimeout(loadTemplates, 300);
});
