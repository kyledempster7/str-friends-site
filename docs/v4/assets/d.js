// A single sticky box holds the title and links, below the actual header height.
const header = document.querySelector('.site-header');
const measureHeader = () => document.documentElement.style.setProperty('--d-header-height', `${header.getBoundingClientRect().height}px`);
measureHeader();
new ResizeObserver(measureHeader).observe(header);

const guide = document.querySelector('.d-guide');
if (guide) {
  const desktop = matchMedia('(min-width: 900px)');
  const adaptGuide = () => {
    guide.open = desktop.matches;
    guide.querySelector('summary').tabIndex = desktop.matches ? -1 : 0;
  };
  adaptGuide();
  desktop.addEventListener('change', adaptGuide);
}

const filter = document.getElementById('filter');
if (filter) {
  const count = document.getElementById('count');
  const none = document.getElementById('no-match');
  const results = document.getElementById('results');
  const rows = [...results.querySelectorAll('tr[data-search]')];
  const targetRow = () => rows.find(row => `#${row.id}` === location.hash);

  const run = () => {
    const query = filter.value.trim();
    const value = query.toLowerCase();
    let shown = 0;
    for (const row of rows) {
      row.hidden = !!value && !row.dataset.search.toLowerCase().includes(value);
      if (!row.hidden) shown++;
    }
    results.hidden = !value;
    none.hidden = shown > 0;
    count.textContent = value ? `Showing ${shown} of ${rows.length} for "${query}".` : `Search all ${rows.length} entries.`;
    const url = new URL(location.href);
    if (value) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    // A newly typed search must not leave an unrelated, hidden anchor in the URL.
    if (targetRow() && (targetRow().hidden || results.hidden)) url.hash = '';
    history.replaceState(null, '', url);
  };

  const restoreLocation = () => {
    const target = targetRow();
    filter.value = target ? target.querySelector('th').textContent : new URLSearchParams(location.search).get('q') || '';
    run();
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  filter.addEventListener('input', run);
  filter.form.addEventListener('submit', event => { event.preventDefault(); run(); });
  window.addEventListener('hashchange', restoreLocation);
  window.addEventListener('popstate', restoreLocation);
  restoreLocation();
}
