import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Version D (/v4/): the original look, with before-and-after grids.
// Structure per Kyle (2026-10-03): the homepage is the banner, the "Can I use this?" search and the
// seven numbered chapters, walked first to last. Each chapter has its own subpages; the left guide
// lists only that chapter's subpages (five at most). Quick answers live on the subpage that owns them.
// The big header button is Join, linking to the Nexus collection.
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: 'Hold — do not use', blocked: 'Blocked' };
const statusMeaning = {
  hold: "Don't use it yet. We'll test it together first.",
  blocked: "Not part of our setup. Don't install it on your own.",
  conditional: 'Fine within the limit stated. Not tested in co-op yet.',
  allowed: 'Go ahead. Not every one has been tested with four players.'
};
const categoryLabels = { spell: 'spell', perk: 'perk', race: 'race power', mod: 'mod', mechanic: 'game rule' };
const statusOrder = ['hold', 'blocked', 'conditional', 'allowed'];
const svg = (inner, cls = 'icon') => `<svg class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const mark = svg('<path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m6.5 11.5 2.5 2 2.5-2"/>', 'icon brand-mark');
const joinIcon = svg('<path d="M15 4h5v16h-5M3 12h11m-4-5 5 5-5 5"/>');
const searchIcon = svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>');

const css = `/* Version D: grids on the original look. */
.hero h1 em,em{font-style:normal}
.d-hero .hero-inner{grid-template-columns:minmax(0,1fr);padding-top:72px;padding-bottom:64px}
.d-page{max-width:1236px;margin:auto;padding:48px 42px 64px;min-width:0}
.d-page h1{font-size:clamp(2.2rem,4vw,3.2rem);letter-spacing:-.035em;margin:.4rem 0 .6rem}
.d-section{margin-top:40px}.d-section:first-of-type{margin-top:24px}
.d-section h2{font-size:1.6rem;margin:0 0 .8rem}
.d-wrap{overflow-x:auto}
.d-grid{width:100%;border-collapse:collapse;font-size:.95rem;line-height:1.55}
.d-grid caption{text-align:left;caption-side:top;padding:0 0 10px;color:#b2bfc2;font-size:.9rem}
.d-grid th,.d-grid td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}
.d-grid thead th{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;border-bottom:1px solid var(--gold-dark);white-space:nowrap}
.d-grid tbody th{font-weight:600;color:#f6f2e9;width:22%}
.d-grid.cols-3 td:nth-child(2){color:#b2bfc2;width:28%}
.d-grid a{color:var(--gold)}
.d-grid tr.d-urgent th,.d-grid tr.d-urgent td{color:#f0d099}
.d-quick .d-grid tbody th{width:32%}
.s-hold{color:#f0d099}.s-blocked{color:#efb9b1}.s-conditional{color:#bddce5}.s-allowed{color:#b5dac4}
.d-search{margin:8px 0 8px}.d-search label{display:block;font:400 1.6rem/1.25 Georgia,'Times New Roman',serif;color:#f6f2e9;margin-bottom:10px}
.d-search-row{display:flex;gap:8px;max-width:40rem}
.d-search input{flex:1;min-width:0;padding:12px 14px;background:#0c1418;color:#e5e9e5;border:1px solid var(--gold-dark);border-radius:2px;font:inherit;font-size:1rem}
.d-search input:focus{outline:2px solid var(--gold);outline-offset:1px}
.d-search button{padding:12px 18px;background:var(--gold);color:#101a20;border:0;border-radius:2px;font:inherit;font-weight:600;cursor:pointer}
.d-count{margin:10px 0 0;color:#b2bfc2;font-size:.9rem}
.d-sources{margin-top:32px;font-size:.85rem;color:#b2bfc2}.d-sources a{margin-right:16px;color:var(--gold)}
.d-chapters-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 24px;margin:48px 0 20px}
.d-chapters-head h2{margin:0;font-size:1.8rem}.d-chapters-head p{margin:0;color:#b2bfc2}
.d-chapters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.d-chapter{display:flex;flex-direction:column;min-width:0;min-height:168px;padding:24px;border:1px solid var(--line);border-top:2px solid var(--gold);border-radius:3px;background:#16242b;text-decoration:none;color:inherit}
.d-chapter:hover{background:#1c2c33}
.d-chapter-num{font:400 1.5rem/1.25 Georgia,'Times New Roman',serif;color:var(--gold-dark)}
.d-chapter-label{display:block;margin-top:16px;font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold)}
.d-chapter h3{margin:6px 0 0;font:400 1.25rem/1.3 Georgia,'Times New Roman',serif;color:#f6f2e9}
.d-chapter .icon{width:40px;height:40px;align-self:end;margin-top:auto;padding-top:12px;color:var(--gold);opacity:.5}
.d-layout{max-width:1320px;margin:auto;display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;padding:0 0 0 42px}
.d-layout .d-page{padding-left:0}
.d-side{position:sticky;top:16px;align-self:start;padding-top:48px;font-size:.95rem}
.d-side-title{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;margin:0 0 10px}
.d-side ol{list-style:none;margin:0;padding:0}
.d-side li a{display:block;padding:8px 10px;color:#c2cdcd;text-decoration:none;border-left:2px solid transparent}
.d-side li a:hover{color:#f6f2e9}
.d-side li a[aria-current]{color:#f6f2e9;border-left-color:var(--gold)}
.d-side-home{margin:14px 0 0;font-size:.85rem}.d-side-home a{color:var(--gold);text-decoration:none;padding:0 10px}
.d-pager{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;margin-top:48px;padding-top:20px;border-top:1px solid var(--line)}
.d-pager a{color:var(--gold);text-decoration:none}.d-pager a:hover{color:#f6f2e9}
.d-pager .d-next{margin-left:auto;text-align:right}
.d-join{display:inline-flex;align-items:center;gap:8px}.d-join small{font-size:.75rem;opacity:.8}
@media (max-width:1000px){.d-chapters{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.d-layout{display:block;padding:0}.d-side{position:static;padding:24px 16px 0}}
@media (max-width:700px){.d-page{padding:32px 16px 48px}.d-chapters{grid-template-columns:minmax(0,1fr)}.d-grid,.d-grid thead,.d-grid tbody,.d-grid tr,.d-grid th,.d-grid td{display:block}.d-grid thead{position:absolute;left:-9999px}.d-grid tr{padding:10px 0;border-bottom:1px solid var(--line)}.d-grid th,.d-grid td{border:0;padding:2px 0;width:auto!important}.d-grid td[data-label]::before{content:attr(data-label) ": ";color:var(--gold);font-size:.8rem}}`;

// A cell is text, a link {text, href}, or a list of both (one link per named ability).
const cell = (value) => {
  if (Array.isArray(value)) return value.map(cell).join('');
  if (value && typeof value === 'object') return `<a href="${esc(value.href)}">${esc(value.text)}</a>`;
  return esc(value);
};
const plain = (value) => (Array.isArray(value) ? value.map(plain).join('') : value && typeof value === 'object' ? value.text : String(value));

const grid = (g) => {
  const cls = g.columns.length === 3 ? ' cols-3' : '';
  const head = g.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('');
  const rows = g.rows.map((r) => {
    const urgent = /^(Leave NOW|Leaving, now or later)$/.test(plain(r[0])) ? ' class="d-urgent"' : '';
    const cells = r.slice(1).map((value, i) => `<td data-label="${esc(g.columns[i + 1])}">${cell(value)}</td>`).join('');
    return `<tr${urgent}><th scope="row">${cell(r[0])}</th>${cells}</tr>`;
  }).join('\n');
  return `<section class="d-section${g.quick ? ' d-quick' : ''}" aria-labelledby="${esc(g.id)}"><h2 id="${esc(g.id)}">${esc(g.title)}</h2>
<div class="d-wrap"><table class="d-grid${cls}">${g.note ? `<caption>${esc(g.note)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>
${rows}
</tbody></table></div></section>`;
};
const quickGrid = (q) => q ? grid({ id: 'quick-answer', quick: true, title: 'Quick answer', columns: ['Question', 'Short answer'], rows: [q] }) : '';
const sources = (list) => list?.length ? `<p class="d-sources">Sources: ${list.map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join('')}</p>` : '';

export async function renderV4(root) {
  const shared = JSON.parse(await readFile(path.join(root, 'src/variants/v4/grids.json'), 'utf8'));
  const data = JSON.parse(await readFile(path.join(root, 'src/variants/v4/pages.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'src/variants/v4/content/catalog.json'), 'utf8'));
  const byId = new Map(shared.grids.map((g) => [g.id, g]));
  const resolve = (g) => {
    const found = typeof g === 'string' ? byId.get(g) : g;
    if (!found) throw new Error(`Version D: unknown grid ${g}`);
    return found;
  };
  const chapters = data.chapters;
  if (chapters.length !== 7) throw new Error('Version D must have exactly seven chapters');
  for (const c of chapters) if (!c.pages.length || c.pages.length > 5) throw new Error(`Chapter ${c.num} must have 1 to 5 pages`);

  const shell = ({ title, description, body, current }) => {
    const nav = [['index.html#chapters', 'Chapters', 'chapters'], ['rules.html', 'Can I use this?', 'rules'], ['ledger.html', 'Party ledger', 'ledger'], ['leave-now.html', 'Leave now', 'leave']]
      .map(([href, label, key]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    return `<!doctype html>
<html lang="en" id="top"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#101a20"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Fellowship</title><meta name="description" content="${esc(description)}"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/d.css"></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="index.html" aria-label="Fellowship, home">${mark}<span>Fellowship<small>A Skyrim Together field guide</small></span></a><nav class="primary-nav" aria-label="Main navigation">${nav}</nav><a class="leave-link d-join" href="${esc(data.collectionUrl)}">${joinIcon}<span>Join us <small>· setup on Nexus</small></span></a></div></header><main id="main" tabindex="-1">
${body}
</main><footer class="site-footer"><div class="footer-top"><a class="brand" href="index.html">${mark}<span>Fellowship<small>A shared adventure. Your own story.</small></span></a><a class="back-top" href="#top">Back to top <span aria-hidden="true">↑</span></a></div><div class="footer-bottom"><p>A friends’ guide to Skyrim Together Reborn. Unofficial and made for our campaign.</p><p>Guide updated <time datetime="${esc(data.updated)}">${esc(data.updated)}</time></p></div></footer></body></html>
`;
  };

  const searchForm = (id) => `<form class="d-search" action="rules.html" method="get" role="search"><label for="${id}">Can I use this?</label><div class="d-search-row"><input id="${id}" name="q" type="search" placeholder="Type a spell, perk, power or mod" autocomplete="off"><button type="submit">Search</button></div></form>`;
  const pages = new Map();

  // Homepage: banner, search, seven chapters in order. Nothing else.
  const h = data.home;
  const tiles = chapters.map((c) => `<a class="d-chapter" href="${esc(c.pages[0].file)}"><span class="d-chapter-num">${esc(c.num)}</span><span class="d-chapter-label">${esc(c.label)}</span><h3>${esc(c.headline)}</h3>${svg(c.icon)}</a>`).join('');
  pages.set('index.html', shell({
    title: 'The North is better together', current: '',
    description: 'Our field guide to a shared Skyrim adventure: seven chapters of before-and-after grids.',
    body: `<section class="hero d-hero"><div class="hero-inner"><div class="hero-copy"><p class="eyebrow">${esc(h.eyebrow)}</p><h1>${esc(h.titleBefore)} <em>${esc(h.titleAccent)}</em></h1><p class="hero-intro">${esc(h.intro)}</p></div></div></section>
<div class="d-page">${searchForm('home-search')}
<section aria-labelledby="chapters"><div class="d-chapters-head"><h2 id="chapters">${esc(h.chaptersTitle)}</h2><p>${esc(h.chaptersIntro)}</p></div><div class="d-chapters">${tiles}</div></section></div>`
  }));

  // Chapter subpages: left guide = this chapter's pages only; pager at the end walks first to last.
  chapters.forEach((c, ci) => {
    c.pages.forEach((p, pi) => {
      const side = `<aside class="d-side" aria-label="Chapter ${esc(c.num)} pages"><p class="d-side-title">${esc(c.num)} · ${esc(c.label)}</p><ol>${c.pages.map((sp) => `<li><a href="${esc(sp.file)}"${sp.file === p.file ? ' aria-current="page"' : ''}>${esc(sp.title)}</a></li>`).join('')}</ol><p class="d-side-home"><a href="index.html#chapters">All chapters</a></p></aside>`;
      const prevChapter = ci > 0 ? chapters[ci - 1] : null;
      const prev = pi > 0
        ? `<a href="${esc(c.pages[pi - 1].file)}">← Previous page: ${esc(c.pages[pi - 1].title)}</a>`
        : prevChapter
          ? `<a href="${esc(prevChapter.pages[prevChapter.pages.length - 1].file)}">← Previous chapter: ${esc(prevChapter.num)} ${esc(prevChapter.label)}</a>`
          : '';
      const next = pi < c.pages.length - 1
        ? `<a class="d-next" href="${esc(c.pages[pi + 1].file)}">Next page: ${esc(c.pages[pi + 1].title)} →</a>`
        : ci < chapters.length - 1
          ? `<a class="d-next" href="${esc(chapters[ci + 1].pages[0].file)}">Next chapter: ${esc(chapters[ci + 1].num)} ${esc(chapters[ci + 1].label)} →</a>`
          : `<a class="d-next" href="index.html#chapters">You've reached the end. Back to the chapters →</a>`;
      const pager = `<nav class="d-pager" aria-label="Chapter progress">${prev}${next}</nav>`;
      pages.set(p.file, shell({
        title: p.title, current: p.file === 'leave-now.html' ? 'leave' : p.file === 'ledger.html' ? 'ledger' : 'chapters',
        description: `${p.title}: before-and-after grids for our Skyrim Together campaign.`,
        body: `<div class="d-layout">${side}<div class="d-page"><p class="eyebrow">Chapter ${esc(c.num)} · ${esc(c.label)}</p><h1>${esc(p.title)}</h1>
${quickGrid(p.quick)}
${p.grids.map((g) => grid(resolve(g))).join('\n')}
${sources(p.sources)}
${pager}</div></div>`
      }));
    });
  });

  // The party ledger is the last page of chapter 05 (rendered above), with a header shortcut.
  if (!chapters.some((c) => c.pages.some((p) => p.file === 'ledger.html'))) throw new Error('Version D: the party ledger must belong to a chapter');

  // Can I use this?: standalone lookup with an honest scope, a live count and an empty state.
  const entries = [...catalog.entries].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name));
  const present = statusOrder.filter((s) => catalog.entries.some((e) => e.status === s));
  const keyRows = present.map((s) => `<tr><th scope="row" class="s-${s}">${esc(statusLabels[s])}</th><td data-label="How many">${catalog.entries.filter((e) => e.status === s).length}</td><td data-label="Means">${esc(statusMeaning[s])}</td></tr>`).join('');
  const ruleRows = entries.map((e) => {
    const search = esc([e.name, ...(e.aliases ?? []), e.category, categoryLabels[e.category] ?? '', e.status].join(' '));
    const source = e.sourceUrl ? ` <a href="${esc(e.sourceUrl)}">Source</a>` : '';
    return `<tr id="rule-${esc(e.id)}" data-status="${e.status}" data-search="${search}"><th scope="row">${esc(e.name)}</th><td data-label="Type">${esc(categoryLabels[e.category] ?? e.category)}</td><td data-label="Status" class="s-${e.status}">${esc(statusLabels[e.status])}</td><td data-label="What to know">${esc(e.summary)} ${esc(e.detail)}${source}</td></tr>`;
  }).join('\n');
  pages.set('rules.html', shell({
    title: 'Can I use this?', current: 'rules',
    description: 'Check whether a spell, perk, power or mod is okay to use in our campaign.',
    body: `<div class="d-page"><p class="eyebrow">Before you spend a perk point</p><h1>Can I use this?</h1>
${quickGrid(['Can I use this spell or perk?', 'Search below. Hold means not yet; Allowed means go ahead. If it isn\'t listed, we haven\'t checked it, so ask the host.'])}
<form class="d-search" role="search" onsubmit="return false"><label for="filter">Search the ${catalog.entries.length} spells, perks, powers and mods we've checked</label><div class="d-search-row"><input id="filter" name="q" type="search" placeholder="Type a spell, perk, power or mod" autocomplete="off"></div><p class="d-count" id="count" role="status" aria-live="polite">Showing all ${catalog.entries.length}.</p></form>
<section class="d-section" aria-labelledby="key"><h2 id="key">What the statuses mean</h2><div class="d-wrap"><table class="d-grid cols-3"><thead><tr><th scope="col">Status</th><th scope="col">How many</th><th scope="col">Means</th></tr></thead><tbody>${keyRows}</tbody></table></div></section>
<section class="d-section" aria-labelledby="all"><h2 id="all">Everything we've checked</h2>
<div class="d-wrap"><table class="d-grid"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">What to know</th></tr></thead><tbody>
${ruleRows}
<tr id="no-match" hidden><td colspan="4">No match. If it isn't listed, we haven't checked it yet. Ask the host before using it.</td></tr>
</tbody></table></div></section></div>
<script>
(function(){var f=document.getElementById('filter'),count=document.getElementById('count'),none=document.getElementById('no-match');var rows=document.querySelectorAll('tr[data-search]');var total=rows.length;var q=new URLSearchParams(location.search).get('q');if(q){f.value=q}
function run(){var v=f.value.trim().toLowerCase(),shown=0;rows.forEach(function(r){var on=!v||r.getAttribute('data-search').toLowerCase().indexOf(v)>-1;r.style.display=on?'':'none';if(on)shown++});none.hidden=shown>0;count.textContent=v?('Showing '+shown+' of '+total+' for "'+f.value.trim()+'".'):('Showing all '+total+'.');try{var u=new URL(location.href);if(v){u.searchParams.set('q',f.value.trim())}else{u.searchParams.delete('q')}history.replaceState(null,'',u)}catch(e){}}
f.addEventListener('input',run);run()})();
</script>`
  }));

  pages.set('404.html', shell({
    title: 'Page not found', current: '',
    description: 'This page does not exist.',
    body: `<div class="d-page"><h1>Page not found</h1>${grid({ id: 'try', title: 'Try one of these', columns: ['Go to', 'What it is'], rows: [[{ text: 'The seven chapters', href: 'index.html#chapters' }, 'The field guide, start to finish'], [{ text: 'Can I use this?', href: 'rules.html' }, 'Check a spell, perk, power or mod'], [{ text: 'Leave now', href: 'leave-now.html' }, 'How to leave a session quickly']] })}</div>`
  }));

  pages.set('assets/d.css', css);
  return pages;
}
