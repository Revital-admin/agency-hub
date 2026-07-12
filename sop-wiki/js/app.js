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
  const editorContent = document.getElementById('editorContent');
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
  // Talks to Firebase through window.parent because this tool runs in an
  // iframe and shares the hub's already-authenticated Firebase session
  // rather than creating its own.
  function getSopsDocRef() {
    if (!window.parent || !window.parent.firebaseDb || !window.parent.firebaseDoc) return null;
    return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "sops");
  }

  function saveSopsToFirestore() {
    const docRef = getSopsDocRef();
    if (!docRef || !window.parent.firebaseSetDoc) {
      alert("Couldn't reach the Hub's database - try reopening this tab from the Hub.");
      return;
    }
    const clean = JSON.parse(JSON.stringify(sops));
    window.parent.firebaseSetDoc(docRef, { list: clean }).catch(err => {
      console.error("Failed to save SOPs:", err);
      alert("Couldn't save to the cloud: " + err.message);
    });
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
        saveSopsToFirestore();
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

  function filterSops(query) {
    return sops.filter(sop =>
      sop.title.toLowerCase().includes(query) ||
      sop.category.toLowerCase().includes(query) ||
      sop.content.toLowerCase().includes(query)
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

    // Parse Markdown to HTML
    marked.setOptions({ breaks: true });
    docBody.innerHTML = marked.parse(sop.content);
  }

  // ── Editor ──
  function openNewSopForm() {
    editingSopId = null;
    editorModalTitle.textContent = 'New SOP';
    editorCategory.value = '';
    editorTitle.value = '';
    editorContent.value = '';
    editorOverlay.style.display = 'flex';
    editorCategory.focus();
  }

  function openEditForm(sop) {
    editingSopId = sop.id;
    editorModalTitle.textContent = 'Edit SOP';
    editorCategory.value = sop.category;
    editorTitle.value = sop.title;
    editorContent.value = sop.content;
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
    const content = editorContent.value;

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
      const newSop = { id, category, title, content, date: today };
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
