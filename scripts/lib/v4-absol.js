// absol89's list: search, filters and sorting over a small JSON file. Nothing is sent anywhere.
(() => {
  const root = document.getElementById('absol');
  if (!root) return;
  const body = document.getElementById('absol-body');
  const status = document.getElementById('absol-status');
  const search = document.getElementById('absol-q');
  const category = document.getElementById('absol-cat');
  const ours = document.getElementById('absol-ours');
  const earn = document.getElementById('absol-earn');
  const clear = document.getElementById('absol-clear');
  const heads = [...root.querySelectorAll('th[data-sort]')];
  const nexus = 'https://www.nexusmods.com/skyrimspecialedition/mods/';
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const keys = ['name', 'id', 'category', 'adds', 'ours', 'reason', 'earn'];
  let rows = [];
  let sortKey = 'name';
  let sortDir = 1;

  const params = new URLSearchParams(location.search);
  search.value = params.get('q') ?? '';
  ours.checked = params.get('ours') === '1';
  earn.checked = params.get('earn') === '1';
  if (keys.includes(params.get('sort'))) sortKey = params.get('sort');
  if (params.get('dir') === 'desc') sortDir = -1;
  const wantedCategory = params.get('cat') ?? '';

  const compare = (a, b) => {
    const x = a[sortKey], y = b[sortKey];
    const result = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { sensitivity: 'base' });
    return (result || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })) * sortDir;
  };

  const saveUrl = () => {
    const next = new URLSearchParams();
    if (search.value.trim()) next.set('q', search.value.trim());
    if (category.value) next.set('cat', category.value);
    if (ours.checked) next.set('ours', '1');
    if (earn.checked) next.set('earn', '1');
    if (sortKey !== 'name' || sortDir !== 1) { next.set('sort', sortKey); if (sortDir === -1) next.set('dir', 'desc'); }
    const text = next.toString();
    try { history.replaceState(null, '', location.pathname + (text ? '?' + text : '') + location.hash); } catch (error) { /* the address stays as it is */ }
  };

  const render = () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = rows.filter((r) => (!category.value || r.category === category.value) && (!ours.checked || r.ours) && (!earn.checked || r.earn)
      && words.every((w) => r.haystack.includes(w))).sort(compare);
    body.innerHTML = shown.map((r) => `<tr><th scope="row"><a data-mod="${r.id}">${esc(r.name)}</a></th><td>${r.id}</td><td>${esc(r.category)}</td><td>${esc(r.adds)}</td><td>${r.ours ? 'Yes' : 'No'}</td><td>${esc(r.reason || 'In our pack')}</td><td>${r.earn ? 'Yes' : ''}</td></tr>`).join('');
    for (const link of body.querySelectorAll('a[data-mod]')) link.href = nexus + link.dataset.mod;
    status.textContent = shown.length ? `Showing ${shown.length} of ${rows.length} mods.` : 'No mods match. Clear a filter or search for fewer words.';
    for (const th of heads) {
      const active = th.dataset.sort === sortKey;
      th.setAttribute('aria-sort', active ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');
    }
    saveUrl();
  };

  for (const th of heads) {
    th.querySelector('button').addEventListener('click', () => {
      if (sortKey === th.dataset.sort) sortDir = -sortDir; else { sortKey = th.dataset.sort; sortDir = 1; }
      render();
    });
  }
  for (const el of [search, category, ours, earn]) el.addEventListener('input', render);
  clear.addEventListener('click', () => { search.value = ''; category.value = ''; ours.checked = false; earn.checked = false; render(); search.focus(); });

  fetch('absol-list.json').then((response) => {
    if (!response.ok) throw new Error('bad response');
    return response.json();
  }).then((data) => {
    rows = data.rows.map(([name, id, cat, adds, inGame, reason, candidate]) => ({
      name, id, category: cat, adds, ours: inGame === 1, reason, earn: candidate === 1,
      haystack: `${name} ${id} ${cat} ${adds} ${inGame === 1 ? 'in our game' : ''} ${reason}`.toLowerCase()
    }));
    const names = [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    category.insertAdjacentHTML('beforeend', names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join(''));
    if (names.includes(wantedCategory)) category.value = wantedCategory;
    root.removeAttribute('aria-busy');
    render();
  }).catch(() => {
    status.textContent = 'The list could not load. Reload the page to try again.';
    root.removeAttribute('aria-busy');
  });
})();
