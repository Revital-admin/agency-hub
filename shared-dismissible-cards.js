/* ============================================================
   shared-dismissible-cards.js
   Opt-in × button for secondary/auxiliary cards across the Hub - NOT
   meant for a tool's main/only content (a client list, a form that's
   the whole point of the page), just the "extra" cards that pile up
   above or around it and make a page feel longer than it needs to be
   day-to-day. Team Roster's Contractor Documents and "Signed Into the
   Hub, Not on This Roster" callout were the first two - both long, both
   sitting above the actual New Team Member form, both something you
   want out of the way most of the time but don't want to lose entirely
   (see the Add-to-Roster scroll bug fixed alongside this).

   Usage, per card a tool wants to make dismissible:
     <div class="step-card" data-dismiss-key="unique-name-for-this-card">
       <h2>Card Title</h2>
       ...
     </div>
   then, once after the card (and anything that re-renders its contents)
   is in the DOM:
     initDismissibleCards();

   - The × button and the collapsed-state bar are injected automatically
     - no markup changes needed beyond the data-dismiss-key attribute.
   - The card's own first heading (h2/h3/.section-title) supplies the
     label shown in the collapsed bar ("Card Title (hidden) · Show").
   - Collapsed/expanded state persists per-browser via localStorage,
     keyed by data-dismiss-key, so it survives reloads but is local to
     whoever collapsed it (not synced through Firestore - this is a
     view preference, not shared team data).
   - Safe to call initDismissibleCards() more than once (e.g. after a
     re-render that rebuilds a card's innerHTML) - already-wired cards
     are skipped via a data-dismiss-init marker, but if a re-render
     replaced the whole card element, wire it again after.
   ============================================================ */

(function () {
  function labelFor(card) {
    const heading = card.querySelector('h2, h3, .section-title h2, .section-title');
    const text = heading ? heading.textContent.trim() : '';
    return text || 'This section';
  }

  function wireCard(card) {
    if (card.dataset.dismissInit === '1') return;
    card.dataset.dismissInit = '1';
    card.classList.add('dismissible-card');

    const storageKey = 'hub-dismissed-card:' + card.getAttribute('data-dismiss-key');
    const label = labelFor(card);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dismissible-card-close';
    closeBtn.setAttribute('aria-label', 'Hide ' + label);
    closeBtn.title = 'Hide this section';
    closeBtn.textContent = '✕';

    const bar = document.createElement('div');
    bar.className = 'dismissible-card-collapsed-bar';
    const barLabel = document.createElement('span');
    barLabel.textContent = label + ' (hidden)';
    const barShow = document.createElement('span');
    barShow.className = 'dismissible-card-collapsed-bar-show';
    barShow.textContent = 'Show';
    bar.appendChild(barLabel);
    bar.appendChild(barShow);

    card.appendChild(closeBtn);
    card.appendChild(bar);

    function setCollapsed(collapsed) {
      card.classList.toggle('is-collapsed', collapsed);
      try { localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch (e) { /* private browsing etc - just won't persist */ }
    }

    closeBtn.addEventListener('click', () => setCollapsed(true));
    bar.addEventListener('click', () => setCollapsed(false));

    let stored = null;
    try { stored = localStorage.getItem(storageKey); } catch (e) {}
    if (stored === '1') setCollapsed(true);
  }

  window.initDismissibleCards = function (scopeEl) {
    const root = scopeEl || document;
    root.querySelectorAll('[data-dismiss-key]').forEach(wireCard);
  };
})();
