
document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('.brand-logo-container');
    const logoHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-accent);"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
          <span style="font-family: var(--font-heading); font-size:18px; font-weight:600; color:var(--text-bright, white); letter-spacing:1px; margin-top:2px;">REVITAL <span style="color:var(--color-accent); font-weight:400; font-family:var(--font-mono); font-size:14px;">HUB</span></span>
        </div>
    `;
    containers.forEach(container => {
        container.innerHTML = logoHTML;
    });
});
