document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const sopListEl = document.getElementById('sopList');
  
  const welcomeState = document.getElementById('welcomeState');
  const viewerState = document.getElementById('viewerState');
  
  const docCategory = document.getElementById('docCategory');
  const docTitle = document.getElementById('docTitle');
  const docDate = document.getElementById('docDate');
  const docBody = document.getElementById('docBody');

  let activeSopId = null;

  // Initialize
  renderSopList(SOPS);

  // Search functionality (Debounced for performance)
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    
    if (searchTimeout) clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
      if (!query) {
        renderSopList(SOPS);
        return;
      }

      const filtered = SOPS.filter(sop => {
        return sop.title.toLowerCase().includes(query) || 
               sop.category.toLowerCase().includes(query) ||
               sop.content.toLowerCase().includes(query);
      });
      renderSopList(filtered);
    }, 300); // 300ms debounce
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
});