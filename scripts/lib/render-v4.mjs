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
.d-search{margin:8px 0 8px}.d-search label{display:block;font:400 1.6rem/1.25 var(--serif,Georgia,serif);color:#f6f2e9;margin-bottom:10px}
.d-search-row{display:flex;gap:8px;max-width:40rem}
.d-search input{flex:1;min-width:0;padding:12px 14px;background:#0c1418;color:#e5e9e5;border:1px solid var(--gold-dark);border-radius:2px;font:inherit;font-size:1rem}
.d-search input:focus{outline:2px solid var(--gold);outline-offset:1px}
.d-search button{padding:12px 18px;background:var(--gold);color:#101a20;border:0;border-radius:2px;font:inherit;font-weight:600;cursor:pointer}
.d-layout{max-width:1320px;margin:auto;display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;padding:0 0 0 42px}
.d-layout .d-page{padding-left:0}
.d-side{position:sticky;top:16px;align-self:start;padding-top:48px;font-size:.95rem}
.d-side-title{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;margin:0 0 10px}
.d-side ol{list-style:none;margin:0;padding:0}
.d-side li a{display:block;padding:8px 10px;color:#c2cdcd;text-decoration:none;border-left:2px solid transparent}
.d-side li a:hover{color:#f6f2e9}
.d-side li a[aria-current]{color:#f6f2e9;border-left-color:var(--gold)}
.d-num{display:inline-block;width:2em;color:var(--gold-dark)}
.d-side-search a,.d-side-back a{display:flex;gap:8px;align-items:center;padding:8px 10px;color:var(--gold);text-decoration:none}
.d-side-back{margin:4px 0 0;font-size:.85rem}
@media (max-width:900px){.d-layout{display:block;padding:0}.d-side{position:static;padding:24px 16px 0}.d-side ol{columns:2}}
.d-sources{margin-top:40px;font-size:.85rem;color:#b2bfc2}.d-sources a{margin-right:16px;color:var(--gold)}
.d-versions{max-width:1236px;margin:auto;padding:0 0 18px;font-size:.85rem;color:#b2bfc2}.d-versions a{margin-right:12px;color:var(--gold)}
@media (max-width:700px){.d-page{padding:32px 16px 48px}.d-grid,.d-grid thead,.d-grid tbody,.d-grid tr,.d-grid th,.d-grid td{display:block}.d-grid thead{position:absolute;left:-9999px}.d-grid tr{padding:10px 0;border-bottom:1px solid var(--line)}.d-grid th,.d-grid td{border:0;padding:2px 0;width:auto!important}.d-grid td[data-label]::before{content:attr(data-label) ": ";color:var(--gold);font-size:.8rem}.d-versions{padding:0 16px 18px}}`;

const shell = ({ title, description, body, current }) => {
  const nav = [['index.html#guide', 'The guide', 'home'], ['rules.html', 'Can I use this?', 'rules'], ['ledger.html', 'Party ledger', 'ledger']]
    .map(([href, label, key]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en" id="top"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#101a20"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Fellowship</title><meta name="description" content="${esc(description)}"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/d.css"></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="index.html" aria-label="Fellowship, home">${mark}<span>Fellowship<small>A Skyrim Together field guide</small></span></a><nav class="primary-nav" aria-label="Main navigation">${nav}</nav><a class="leave-link" href="leave-now.html">${exitIcon}<span>Leave now</span></a></div></header><main id="main" tabindex="-1">
${body}
</main><footer class="site-footer"><div class="footer-top"><a class="brand" href="index.html">${mark}<span>Fellowship<small>A shared adventure. Your own story.</small></span></a><a class="back-top" href="#top">Back to top <span aria-hidden="true">↑</span></a></div><div class="footer-bottom"><p>A friends’ guide to Skyrim Together Reborn. Unofficial and made for our campaign.</p><p>Guide updated <time datetime="2026-10-03">October 3, 2026</time></p></div></footer></body></html>
`;
};

const linkCell = (value) => /^[a-z0-9-]+\.html(\?[^#\s]*)?(#\S*)?$/.test(value) ? `<a href="${esc(value)}">Open</a>` : esc(value);

// Left sidebar on guide pages. Kyle: the field guide on the left whenever you're in the guide;
// arrive from a quick answer and it becomes the "Quick answers guide".
const searchIcon = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const sidebar = (file, guide, answers) => {
  const chapters = guide.rows.filter((r) => r[2] !== 'rules.html');
  const item = (href, label, num, on) => `<li><a href="${esc(href)}"${on ? ' aria-current="page"' : ''}>${num ? `<span class="d-num">${esc(num)}</span>` : ''}${esc(label)}</a></li>`;
  const fieldList = chapters.map((r) => { const [num, ...rest] = r[0].split(' '); return item(r[2], rest.join(' '), num, r[2] === file); }).join('');
  const answerList = answers.rows.map((r) => item(r[2], r[0], '', r[2].split(/[?#]/)[0] === file)).join('');
  return `<aside class="d-side" aria-label="Guide">
<nav class="d-side-field" aria-label="The field guide"><p class="d-side-title">The field guide</p><ol>${fieldList}</ol></nav>
<nav class="d-side-answers" aria-label="Quick answers guide" hidden><p class="d-side-title">Quick answers guide</p><ol>${answerList}</ol><p class="d-side-back"><a href="${esc(file)}">Show the field guide</a></p></nav>
<p class="d-side-search"><a href="rules.html${file === 'rules.html' ? '' : ''}">${searchIcon}Can I use this?</a></p>
</aside>
<script>(function(){if(new URLSearchParams(location.search).get('guide')==='answers'){var s=document.querySelector('.d-side');s.querySelector('.d-side-field').hidden=true;s.querySelector('.d-side-answers').hidden=false;}})();</script>`;
};
const searchForm = (id) => `<form class="d-search" action="rules.html" method="get" role="search"><label for="${id}">Can I use this?</label><div class="d-search-row"><input id="${id}" name="q" type="search" placeholder="Type a spell, perk, power or mod" autocomplete="off"><button type="submit">Search</button></div></form>`;

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
  const shared = JSON.parse(await readFile(path.join(root, 'src/variants/v4/grids.json'), 'utf8'));
  const data = JSON.parse(await readFile(path.join(root, 'src/variants/v4/pages.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'src/variants/v4/content/catalog.json'), 'utf8'));
  const inGuide = new Set(data.home.guide.rows.map((r) => r[2]).concat(['leave-now.html']));
  const withSide = (file, inner) => inGuide.has(file) ? `<div class="d-layout">${sidebar(file, data.home.guide, data.home.answers)}${inner}</div>` : inner;
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
<div class="d-page">${searchForm('home-search')}
${grid(h.guide)}
${grid(h.answers)}</div>`
  }));

  for (const p of data.pages) {
    pages.set(p.file, shell({
      title: p.title, current: p.file.replace('.html', ''),
      description: `${p.title}: before-and-after grids for our Skyrim Together campaign.`,
      body: withSide(p.file, `<div class="d-page"><p class="eyebrow">${esc(p.eyebrow)}</p><h1>${esc(p.title)}</h1>
${p.grids.map((g) => grid(resolve(g))).join('\n')}
${sources(p.sources)}</div>`)
    }));
  }

  const entries = [...catalog.entries].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name));
  const keyRows = statusOrder.map((s) => `<tr><th scope="row" class="s-${s}">${esc(statusLabels[s])}</th><td data-label="Count">${catalog.entries.filter((e) => e.status === s).length}</td><td data-label="Means">${esc(statusMeaning[s])}</td></tr>`).join('');
  const ruleRows = entries.map((e) => {
    const search = esc([e.name, ...(e.aliases ?? []), e.category, e.status].join(' '));
    return `<tr id="rule-${esc(e.id)}" data-status="${e.status}" data-search="${search}"><th scope="row">${esc(e.name)}</th><td data-label="Type">${esc(e.category)}</td><td data-label="Status" class="s-${e.status}">${esc(statusLabels[e.status])}</td><td data-label="What to know">${esc(e.summary)} ${esc(e.detail)}</td></tr>`;
  }).join('\n');
  pages.set('rules.html', shell({
    title: 'Can I use this?', current: 'rules',
    description: 'Every spell, perk, power and mod we checked, in one grid.',
    body: withSide('rules.html', `<div class="d-page"><p class="eyebrow">Before you spend a perk point</p><h1>Can I use this?</h1>
<form class="d-search" role="search" onsubmit="return false"><label for="filter">Search everything in our game</label><div class="d-search-row"><input id="filter" name="q" type="search" placeholder="Type a spell, perk, power or mod" autocomplete="off"></div></form>
<section class="d-section" aria-labelledby="all"><h2 id="all">All ${catalog.entries.length} things we checked</h2>
<div class="d-wrap"><table class="d-grid"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">What to know</th></tr></thead><tbody>
${ruleRows}
</tbody></table></div></section>
<section class="d-section" aria-labelledby="key"><h2 id="key">What the statuses mean</h2><div class="d-wrap"><table class="d-grid cols-3"><thead><tr><th scope="col">Status</th><th scope="col">Count</th><th scope="col">Means</th></tr></thead><tbody>${keyRows}</tbody></table></div></section></div>`) + `
<script>
(function(){var f=document.getElementById('filter');var rows=document.querySelectorAll('tr[data-search]');var q=new URLSearchParams(location.search).get('q');if(q){f.value=q}
function run(){var v=f.value.trim().toLowerCase();rows.forEach(function(r){r.style.display=!v||r.getAttribute('data-search').toLowerCase().indexOf(v)>-1?'':'none'})}
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
