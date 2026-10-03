(() => {
  const controls = document.querySelector('[data-search-controls]');
  if (!controls) return;
  const input = document.querySelector('#rule-search');
  const cards = [...document.querySelectorAll('[data-rule]')];
  const count = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-no-results]');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const searchable = cards.map(card => ({ card, text: normalize(card.dataset.search) }));
  let status = 'all';
  function update() {
    const words = normalize(input.value).split(' ').filter(Boolean);
    let visible = 0;
    for (const { card, text } of searchable) {
      const match = (status === 'all' || card.dataset.status === status) && words.every(word => text.includes(word));
      card.hidden = !match;
      visible += Number(match);
    }
    count.textContent = `${visible} of ${cards.length} rules${status !== 'all' ? ` · ${status === 'hold' ? 'on hold' : status}` : ''}${words.length ? ` matching “${input.value.trim()}”` : ''}`;
    empty.hidden = visible !== 0;
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter.dataset.filter === status));
  }
  controls.hidden = false;
  const query = new URLSearchParams(location.search).get('q');
  if (query) input.value = query;
  input.addEventListener('input', update);
  controls.querySelector('form').addEventListener('submit', event => { event.preventDefault(); update(); });
  for (const filter of filters) filter.addEventListener('click', () => { status = filter.dataset.filter; update(); });
  document.querySelector('[data-clear-search]').addEventListener('click', () => { input.value = ''; status = 'all'; update(); input.focus(); });
  update();
})();
