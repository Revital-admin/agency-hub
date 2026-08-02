/* ============================================================
   MARKETING NEWS — APP LOGIC
   Pure read-only fetch of /api/marketing-news (handleMarketingNews in
   _worker.js), which does all the actual RSS fetching/parsing/caching
   server-side. This file only renders whatever JSON comes back and
   applies the on-screen source/text filters - it doesn't touch clientsDb
   or any parent Hub state at all, so there's no isEmbedded/getActiveClient
   dance like most other tools here.
   ============================================================ */

let allItems = [];
let failedSources = [];

function el(id) { return document.getElementById(id); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function relativeTime(isoDate) {
  if (!isoDate) return '';
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 14) return `${diffDays}d ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function populateSourceFilter() {
  const select = el('sourceFilter');
  const prevValue = select.value;
  const sources = Array.from(new Set(allItems.map(i => i.source))).sort();
  select.innerHTML = '<option value="">All sources</option>' +
    sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if (sources.includes(prevValue)) select.value = prevValue;
}

function renderList() {
  const filterText = (el('filterInput').value || '').trim().toLowerCase();
  const sourceFilter = el('sourceFilter').value;

  const visible = allItems.filter(item => {
    if (sourceFilter && item.source !== sourceFilter) return false;
    if (filterText) {
      const haystack = (item.title + ' ' + item.description).toLowerCase();
      if (!haystack.includes(filterText)) return false;
    }
    return true;
  });

  const listEl = el('newsList');
  listEl.innerHTML = '';
  el('emptyState').style.display = (allItems.length > 0 && visible.length === 0) ? 'block' : 'none';

  visible.forEach(item => {
    const card = document.createElement('a');
    card.className = 'news-card';
    card.href = item.link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.innerHTML = `
      <div class="news-card-meta">
        <span class="news-source-badge">${escapeHtml(item.source)}</span>
        <span>${escapeHtml(relativeTime(item.date))}</span>
      </div>
      <h3 class="news-card-title">${escapeHtml(item.title)}</h3>
      ${item.description ? `<p class="news-card-desc">${escapeHtml(item.description)}</p>` : ''}
    `;
    listEl.appendChild(card);
  });
}

function showFailedSourcesNotice() {
  const notice = el('failedSourcesNotice');
  if (!failedSources.length) {
    notice.style.display = 'none';
    return;
  }
  notice.style.display = 'block';
  // Each entry is now { name, error } (was just a name string before) so
  // the actual failure reason - a real HTTP status, a timeout, whatever -
  // shows up here instead of a bare "couldn't load" with no clue why.
  const summary = failedSources
    .map(f => (f && typeof f === 'object') ? `${f.name} (${f.error})` : f)
    .join(', ');
  notice.textContent = `Couldn't load: ${summary} — showing headlines from the sources that did load.`;
}

async function loadNews(forceRefresh) {
  el('loadingState').style.display = 'block';
  el('errorState').style.display = 'none';
  el('newsList').innerHTML = '';
  el('refreshBtn').disabled = true;
  if (forceRefresh) el('refreshBtn').textContent = 'Refreshing…';

  try {
    // ?refresh=1 tells the Worker to bypass its 30-minute edge cache and
    // actually re-check every feed right now, instead of just re-serving
    // whatever was cached from the last time anyone loaded this tool -
    // see the forceRefresh handling in handleMarketingNews (_worker.js).
    const res = await fetch(forceRefresh ? '/api/marketing-news?refresh=1' : '/api/marketing-news');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    const data = await res.json();
    allItems = Array.isArray(data.items) ? data.items : [];
    failedSources = Array.isArray(data.failedSources) ? data.failedSources : [];

    el('lastFetchedLabel').textContent = data.fetchedAt
      ? `Updated ${relativeTime(data.fetchedAt)}`
      : '';

    populateSourceFilter();
    showFailedSourcesNotice();
    renderList();
  } catch (e) {
    console.error('Failed to load marketing news:', e);
    el('errorState').textContent = "Couldn't load headlines: " + e.message;
    el('errorState').style.display = 'block';
  } finally {
    el('loadingState').style.display = 'none';
    el('refreshBtn').disabled = false;
    el('refreshBtn').textContent = 'Refresh';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadNews(false);
  el('filterInput').addEventListener('input', renderList);
  el('sourceFilter').addEventListener('change', renderList);
  // Wrapped in an arrow function rather than passed directly - a raw
  // click-event listener would otherwise hand loadNews() the click Event
  // object as its forceRefresh argument, which is truthy and would force
  // a full re-check (bypassing the shared cache) on every single page
  // load's initial call too, not just on this deliberate button click.
  el('refreshBtn').addEventListener('click', () => loadNews(true));
});
