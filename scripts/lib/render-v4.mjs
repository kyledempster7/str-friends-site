import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Version D (/v4/): the original v1 look (colors, header, art), with every
// piece of content as a grid. Kyle: "Every single thing you're trying to do: grids."
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: 'Hold — do not use', blocked: 'Blocked' };
const statusMeaning = {
  hold: "Don't use it until we test it together and change the rule.",
  blocked: "Not part of our setup. Don't install it on your own.",
  conditional: 'Only within the stated limits. Not tested yet.',
  allowed: 'Permitted. Multiplayer is not guaranteed.'
};
const statusOrder = ['hold', 'blocked', 'conditional', 'allowed'];
const mark = '<svg class="icon brand-mark" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m6.5 11.5 2.5 2 2.5-2"/></svg>';
const exitIcon = '<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v16h5m5-13 5 5-5 5M8 12h11"/></svg>';

const css = `/* Version D: grids on the original look. */
.hero h1 em,em{font-style:normal}
.d-hero .hero-inner{grid-template-columns:minmax(0,1fr);padding-top:72px;padding-bottom:64px}
.d-page{max-width:1236px;margin:auto;padding:48px 42px 64px}
.d-page h1{font-size:clamp(2.2rem,4vw,3.2rem);letter-spacing:-.035em;margin:.4rem 0 .6rem}
.d-section{margin-top:48px}.d-section:first-of-type{margin-top:24px}
.d-section h2{font-size:1.6rem;margin:0 0 .8rem}
.d-wrap{overflow-x:auto}
.d-grid{width:100%;border-collapse:collapse;font-size:.95rem;line-height:1.55}
.d-grid th,.d-grid td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}
.d-grid thead th{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;border-bottom:1px solid var(--gold-dark);white-space:nowrap}
.d-grid tbody th{font-weight:600;color:#f6f2e9;width:22%}
.d-grid.cols-3 td:nth-child(2){color:#b2bfc2;width:28%}
.d-grid a{color:var(--gold)}
.d-grid caption{text-align:left;caption-side:top;padding:0 0 10px;color:#b2bfc2;font-size:.9rem}
.d-grid tr.d-urgent th,.d-grid tr.d-urgent td{color:#f0d099}
.s-hold{color:#f0d099}.s-blocked{color:#efb9b1}.s-conditional{color:#bddce5}.s-allowed{color:#b5dac4}
.d-filter{display:block;margin:0 0 16px;color:#b2bfc2;font-size:.95rem}
.d-filter input{display:block;margin-top:6px;width:100%;max-width:28rem;padding:8px 0;background:transparent;color:inherit;border:0;border-bottom:1px solid var(--gold-dark);font:inherit}
.d-sources{margin-top:40px;font-size:.85rem;color:#b2bfc2}.d-sources a{margin-right:16px;color:var(--gold)}
.d-versions{max-width:1236px;margin:auto;padding:0 0 18px;font-size:.85rem;color:#b2bfc2}.d-versions a{margin-right:12px;color:var(--gold)}
@media (max-width:700px){.d-page{padding:32px 16px 48px}.d-grid,.d-grid thead,.d-grid tbody,.d-grid tr,.d-grid th,.d-grid td{display:block}.d-grid thead{position:absolute;left:-9999px}.d-grid tr{padding:10px 0;border-bottom:1px solid var(--line)}.d-grid th,.d-grid td{border:0;padding:2px 0;width:auto!important}.d-grid td[data-label]::before{content:attr(data-label) ": ";color:var(--gold);font-size:.8rem}.d-versions{padding:0 16px 18px}}`;

const shell = ({ title, description, body, current }) => {
  const nav = [['index.html#guide', 'The guide', 'home'], ['rules.html', 'Can I use this?', 'rules'], ['chronicle.html', 'Our story', 'chronicle'], ['ledger.html', 'Party ledger', 'ledger']]
    .map(([href, label, key]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en" id="top"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#101a20"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Fellowship</title><meta name="description" content="${esc(description)}"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/d.css"></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="index.html" aria-label="Fellowship, home">${mark}<span>Fellowship<small>A Skyrim Together field guide</small></span></a><nav class="primary-nav" aria-label="Main navigation">${nav}</nav><a class="leave-link" href="leave-now.html">${exitIcon}<span>Leave now</span></a></div></header><main id="main" tabindex="-1">
${body}
</main><footer class="site-footer"><div class="footer-top"><a class="brand" href="index.html">${mark}<span>Fellowship<small>A shared adventure. Your own story.</small></span></a><a class="back-top" href="#top">Back to top <span aria-hidden="true">↑</span></a></div><div class="footer-bottom"><p>A friends’ guide to Skyrim Together Reborn. Unofficial and made for our campaign.</p><p>Guide updated <time datetime="2026-10-03">October 3, 2026</time></p></div></footer>
<p class="d-versions">Version: <a href="../index.html">v1</a><a href="../v2a/index.html">A</a><a href="../v2b/index.html">B</a><a href="../v3/index.html">C</a><strong>D</strong></p></body></html>
`;
};

const linkCell = (value) => /\.html(#.*)?$/.test(value) ? `<a href="${esc(value)}">Open</a>` : esc(value);

const grid = (g) => {
  const cls = g.columns.length === 3 ? ' cols-3' : '';
  const head = g.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('');
  const rows = g.rows.map((r) => {
    const urgent = /^Leave NOW$|^Heads-up$/.test(r[0]) ? ' class="d-urgent"' : '';
    const cells = r.slice(1).map((cell, i) => `<td data-label="${esc(g.columns[i + 1])}">${linkCell(cell)}</td>`).join('');
    return `<tr${urgent}><th scope="row">${esc(r[0])}</th>${cells}</tr>`;
  }).join('\n');
  return `<section class="d-section" aria-labelledby="${esc(g.id)}"><h2 id="${esc(g.id)}">${esc(g.title)}</h2>
<div class="d-wrap"><table class="d-grid${cls}">${g.note ? `<caption>${esc(g.note)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>
${rows}
</tbody></table></div></section>`;
};

const sources = (list) => list?.length ? `<p class="d-sources">Sources: ${list.map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join('')}</p>` : '';

export async function renderV4(root) {
  const shared = JSON.parse(await readFile(path.join(root, 'src/variants/v3/grids.json'), 'utf8'));
  const data = JSON.parse(await readFile(path.join(root, 'src/variants/v4/pages.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'src/variants/v2a/content/catalog.json'), 'utf8'));
  const byId = new Map(shared.grids.map((g) => [g.id, g]));
  for (const p of data.pages) for (const g of p.grids) if (typeof g === 'object') byId.set(g.id, g);
  byId.set('lineup-ref', { ...byId.get('lineup'), id: 'planned-roles', title: 'Planned roles' });
  const resolve = (g) => {
    const found = typeof g === 'string' ? byId.get(g) : g;
    if (!found) throw new Error(`Version D: unknown grid ${g}`);
    return found;
  };
  const pages = new Map();

  const h = data.home;
  pages.set('index.html', shell({
    title: 'The North is better together', current: 'home',
    description: 'Our field guide to a shared Skyrim adventure, in before-and-after grids.',
    body: `<section class="hero d-hero"><div class="hero-inner"><div class="hero-copy"><p class="eyebrow">${esc(h.eyebrow)}</p><h1>${esc(h.titleBefore)} <em>${esc(h.titleAccent)}</em></h1><p class="hero-intro">${esc(h.intro)}</p></div></div></section>
<div class="d-page">${grid(h.guide)}
${grid(h.answers)}</div>`
  }));

  for (const p of data.pages) {
    pages.set(p.file, shell({
      title: p.title, current: p.file.replace('.html', ''),
      description: `${p.title}: before-and-after grids for our Skyrim Together campaign.`,
      body: `<div class="d-page"><p class="eyebrow">${esc(p.eyebrow)}</p><h1>${esc(p.title)}</h1>
${p.grids.map((g) => grid(resolve(g))).join('\n')}
${sources(p.sources)}</div>`
    }));
  }

  const entries = [...catalog.entries].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name));
  const keyRows = statusOrder.map((s) => `<tr><th scope="row" class="s-${s}">${esc(statusLabels[s])}</th><td data-label="Count">${catalog.entries.filter((e) => e.status === s).length}</td><td data-label="Means">${esc(statusMeaning[s])}</td></tr>`).join('');
  const ruleRows = entries.map((e) => {
    const search = esc([e.name, ...(e.aliases ?? []), e.category, e.status].join(' ').toLowerCase());
    return `<tr id="rule-${esc(e.id)}" data-search="${search}"><th scope="row">${esc(e.name)}</th><td data-label="Type">${esc(e.category)}</td><td data-label="Status" class="s-${e.status}">${esc(statusLabels[e.status])}</td><td data-label="What to know">${esc(e.summary)} ${esc(e.detail)}</td></tr>`;
  }).join('\n');
  pages.set('rules.html', shell({
    title: 'Can I use this?', current: 'rules',
    description: 'Every spell, perk, power and mod we checked, in one grid.',
    body: `<div class="d-page"><p class="eyebrow">Before you spend a perk point</p><h1>Can I use this?</h1>
<section class="d-section" aria-labelledby="key"><h2 id="key">What the statuses mean</h2><div class="d-wrap"><table class="d-grid cols-3"><thead><tr><th scope="col">Status</th><th scope="col">Count</th><th scope="col">Means</th></tr></thead><tbody>${keyRows}</tbody></table></div></section>
<section class="d-section" aria-labelledby="all"><h2 id="all">All ${catalog.entries.length} checked</h2>
<label class="d-filter">Filter by name<input id="filter" type="search" autocomplete="off"></label>
<div class="d-wrap"><table class="d-grid"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">What to know</th></tr></thead><tbody>
${ruleRows}
</tbody></table></div></section></div>
<script>
(function(){var f=document.getElementById('filter');var rows=document.querySelectorAll('#all ~ .d-wrap tbody tr, .d-section:last-of-type tbody tr');var q=new URLSearchParams(location.search).get('q');if(q){f.value=q}
function run(){var v=f.value.trim().toLowerCase();rows.forEach(function(r){var s=r.getAttribute('data-search');if(s===null)return;r.style.display=!v||s.indexOf(v)>-1?'':'none'})}
f.addEventListener('input',run);run()})();
</script>`
  }));

  pages.set('404.html', shell({
    title: 'Page not found', current: '',
    description: 'This page does not exist.',
    body: `<div class="d-page"><h1>Page not found</h1>${grid({ id: 'try', title: 'Try one of these', columns: ['Page', 'Open'], rows: [['The guide', 'index.html'], ['Can I use this?', 'rules.html'], ['I have to go NOW', 'leave-now.html']] })}</div>`
  }));

  pages.set('assets/d.css', css);
  return pages;
}
