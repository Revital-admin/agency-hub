// nav-reorder.js
//
// Moves the "Budget Pacing" nav item out of "Agency Globals" (bottom of
// the sidebar) into "Core", right after "Ad Account Setup" — so the
// person managing a client's ad accounts sees budget pacing right next
// to it instead of buried at the bottom of the nav.
//
// Runs once after the Hub's own nav is built. Pure DOM move, no new
// tab content, no Firestore/data changes — safe to remove any time by
// deleting the <script> line that loads this file.

(function () {
  function moveBudgetPacingNavItem() {
    const budgetBtn = document.querySelector('.nav-item-btn[data-tab="tab-budgetpacing"]');
    const adAccountBtn = document.querySelector('.nav-item-btn[data-tab="tab-adaccountsetup"]');
    if (!budgetBtn || !adAccountBtn) return false;

    const budgetLi = budgetBtn.closest("li");
    const adAccountLi = adAccountBtn.closest("li");
    if (!budgetLi || !adAccountLi) return false;

    // Already in the right place - nothing to do.
    if (budgetLi.previousElementSibling === adAccountLi) return true;

    adAccountLi.after(budgetLi);
    return true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    // The Hub builds its nav asynchronously (after auth resolves), so
    // poll briefly until both nav items exist rather than assuming a
    // fixed delay.
    let attempts = 0;
    const interval = setInterval(function () {
      attempts++;
      if (moveBudgetPacingNavItem() || attempts > 40) {
        clearInterval(interval);
      }
    }, 250);
  });
})();
