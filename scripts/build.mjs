import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escape(url.href) : ''; }
  catch { return ''; }
};
const slug = value => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`Invalid public content ID: ${value}`);
  return value;
};
async function readContent(name, fallback) {
  try { return JSON.parse((await readFile(path.join(root, 'src/content', name), 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.warn(`Content not yet supplied: ${name}`);
    return fallback;
  }
}
const [rules, play, catalog] = await Promise.all([
  readContent('rules.json', { sections: [] }), readContent('play.json', { sections: [] }), readContent('catalog.json', { entries: [] })
]);
const sections = [...rules.sections, ...play.sections];
const byId = new Map();
for (const section of sections) {
  slug(section.id);
  if (byId.has(section.id)) throw new Error(`Duplicate section ${section.id}`);
  byId.set(section.id, section);
}
const updated = [rules.updated, play.updated, catalog.updated].filter(Boolean).sort().at(-1) || '';
const dateLabel = updated ? new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${updated}T12:00:00Z`)) : '';
const topics = [
  ['together', 'A shared world', 'What changes in multiplayer', 'Start with what feels familiar, and what works differently.'],
  ['skills', 'Skills & races', 'Make your character your own', 'The eighteen skills, new perks, racial powers, and limits.'],
  ['spells', 'Spells & magic', 'Find your kind of magic', 'Mysticism, the five schools, and the spells we are holding.'],
  ['tonight', 'A night of adventure', 'Join, play, and leave well', 'A simple rhythm for arriving, adventuring, and signing off.'],
  ['builds', 'Unusual builds', 'Bring something unexpected', 'Find a role you enjoy and a reason to depend on each other.'],
  ['party', 'Playing as a party', 'Make room for everyone', 'One campaign leader, shared decisions, and room to take a break.'],
  ['ownership', 'What belongs to you', 'Gear, gold, and a place to call home', 'Our agreements for loot, lending, homes, and private storage.']
];
const icons = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  moon: '<path d="M20 15.5A8.7 8.7 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>',
  mountain: '<path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m6.5 11.5 2.5 2 2.5-2"/>',
  book: '<path d="M12 6v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  exit: '<path d="M9 4H4v16h5m5-13 5 5-5 5M8 12h11"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>'
};
const icon = (name, className = '') => `<svg class="icon ${className}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.compass}</svg>`;
const list = (items = [], ordered = false) => `<${ordered ? 'ol' : 'ul'}>${items.map(item => `<li>${escape(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
function blocks(items = [], { compact = false } = {}) {
  return items.map((block, index) => {
    switch (block.type) {
      case 'text': return `<p>${escape(block.text)}</p>`;
      case 'list': return list(block.items, block.ordered);
      case 'callout': return `<aside class="callout tone-${['urgent', 'hold', 'note'].includes(block.tone) ? block.tone : 'note'}">${block.title ? `<h2>${escape(block.title)}</h2>` : ''}${block.text ? `<p>${escape(block.text)}</p>` : ''}${block.items?.length ? list(block.items) : ''}</aside>`;
      case 'table': return `<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table: ${escape(block.columns.join(', '))}"><table><thead><tr>${block.columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${escape(cell)}</th>` : `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      case 'cards': return `<div class="content-cards${compact ? ' compact' : ''}">${block.items.map(item => `<section class="content-card"><h2>${escape(item.title)}</h2>${item.text ? `<p>${escape(item.text)}</p>` : ''}${item.items?.length ? list(item.items) : ''}</section>`).join('')}</div>`;
      case 'links': return `<nav class="source-links" aria-label="Sources ${index + 1}"><span class="eyebrow">Read at the source</span><ul>${block.items.map(item => { const url = safeUrl(item.url); return url ? `<li><a href="${url}" rel="noreferrer">${escape(item.label)} <span aria-hidden="true">↗</span></a></li>` : ''; }).join('')}</ul></nav>`;
      default: throw new Error(`Unknown content block: ${block.type}`);
    }
  }).join('\n');
}
const fallbackExit = {
  id: 'leave-now', title: 'I have to go NOW', eyebrow: 'Real life comes first',
  blocks: [
    { type: 'text', text: 'Save if possible. Let it finish. Press F two, choose Disconnect, then Proceed. Quit the game. Quitting may still crash; no fix is proven.' },
    { type: 'text', text: "If you can't save, your latest progress may be lost. Tell Kyle when you can. You don't need to stay for a recap." }
  ]
};
function exitCard(standalone = false) {
  const section = byId.get('leave-now') || fallbackExit;
  const heading = standalone ? 'h1' : 'h2';
  return `<section class="exit-card" id="leave-now" tabindex="-1" aria-labelledby="exit-title"><div class="exit-heading">${icon('exit')}<span class="eyebrow">${escape(section.eyebrow || 'Real life comes first')}</span></div><${heading} id="exit-title">I have to go NOW</${heading}>${section.intro ? `<p>${escape(section.intro)}</p>` : ''}<div class="exit-copy">${blocks(section.blocks, { compact: true })}</div></section>`;
}
function header(current) {
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="index.html" aria-label="Fellowship, home">${icon('mountain', 'brand-mark')}<span>Fellowship<small>A Skyrim Together field guide</small></span></a><nav class="primary-nav" aria-label="Main navigation">${[['index', 'The guide'], ['rules', 'Can I use this?'], ['chronicle', 'Our story'], ['ledger', 'Party ledger']].map(([id, label]) => `<a href="${id === 'index' ? 'index.html#guide' : `${id}.html`}"${current === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><a class="leave-link" href="#leave-now">${icon('exit')}<span>Leave now</span></a></div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="footer-top"><a class="brand" href="index.html">${icon('mountain', 'brand-mark')}<span>Fellowship<small>A shared adventure. Your own story.</small></span></a><a class="back-top" href="#top">Back to top <span aria-hidden="true">↑</span></a></div><div class="footer-bottom"><p>A friends’ guide to Skyrim Together Reborn. Unofficial and made for our campaign.</p>${dateLabel ? `<p>Guide updated <time datetime="${escape(updated)}">${dateLabel}</time></p>` : ''}</div></footer>`;
}
function document({ title, description, body, current = '', home = false, baseUrl = '' }) {
  return `<!doctype html>
<html lang="en" id="top"><head><meta charset="utf-8">${baseUrl ? `<base href="${escape(baseUrl)}">` : ''}<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#101a20"><meta name="referrer" content="no-referrer"><title>${escape(title)} · Fellowship</title><meta name="description" content="${escape(description)}"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><script src="assets/site.js" defer></script></head><body class="${home ? 'home-page' : 'inner-page'}">${header(current)}<main id="main" tabindex="-1">${body}</main>${footer()}</body></html>`;
}
const arrow = icon('arrow');
function home() {
  const chronicle = byId.get('chronicle');
  const ledger = byId.get('ledger');
  return document({ title: 'The North is better together', description: 'Our field guide to a shared Skyrim adventure. Get ready, find your role, check the rules, and know how to leave quickly.', current: 'index', home: true, body: `
    <section class="hero"><div class="hero-inner"><div class="hero-copy"><p class="eyebrow"><span class="tiny-diamond" aria-hidden="true">◆</span> Skyrim Together Reborn</p><h1>The North is<br>better <em>together.</em></h1><p class="hero-intro">A few friends. A whole province.<br>Make a character, find your place, and share the adventure.</p><div class="hero-actions"><a class="button" href="tonight.html">Play tonight ${arrow}</a><a class="text-link" href="together.html">New to co-op? ${arrow}</a></div></div>${exitCard()}</div><div class="hero-caption"><span aria-hidden="true">——</span> The road is long. Bring good company.</div></section>
    <section class="section routes-section" aria-labelledby="routes-title"><div class="section-heading"><div><p class="eyebrow">Choose your path</p><h2 id="routes-title">A good place to begin.</h2></div><p>You don’t need to read everything.<br>Start with what you need tonight.</p></div><div class="route-grid">
      <a class="route-card" href="together.html">${icon('compass')}<span class="route-number">01 / GET READY</span><h3>A familiar world.<br>A different rhythm.</h3><p>What changes when your Skyrim adventure becomes ours.</p><span class="route-cta">Get your bearings ${arrow}</span></a>
      <a class="route-card" href="tonight.html">${icon('moon')}<span class="route-number">02 / PLAY TONIGHT</span><h3>From joining in<br>to heading home.</h3><p>The simple steps for a good night, even when life interrupts.</p><span class="route-cta">Plan your evening ${arrow}</span></a>
      <a class="route-card" href="builds.html">${icon('people')}<span class="route-number">03 / FIND YOUR ROLE</span><h3>Be someone<br>you haven’t been.</h3><p>Unusual builds, useful skills, and a place in the party.</p><span class="route-cta">Meet your next character ${arrow}</span></a>
    </div></section>
    <section class="lookup-banner" aria-labelledby="lookup-title"><div class="lookup-icon">${icon('search')}</div><div><p class="eyebrow">Before you spend that perk point</p><h2 id="lookup-title">Can I use this?</h2><p>Check a spell, perk, power, or mod against our campaign rules.</p></div><a class="button secondary" href="rules.html">Check the rules ${arrow}</a></section>
    <section class="section" aria-labelledby="story-title"><div class="section-heading"><div><p class="eyebrow">Around the campfire</p><h2 id="story-title">This will be our story.</h2></div><span class="small-label">No adventure invented. No hero left out.</span></div><div class="story-grid"><article class="story-card"><span class="eyebrow">The campaign chronicle</span>${icon('book', 'story-symbol')}<h3>Our first adventure<br>is still ahead.</h3><p>${escape(chronicle?.intro || 'The places we go, the choices we make, and the little moments worth remembering.')}</p><a class="text-link" href="chronicle.html">Open the chronicle ${arrow}</a></article><article class="ledger-card"><span class="eyebrow">The party ledger</span><h3>People before<br>damage numbers.</h3><p>${escape(ledger?.intro || 'Our characters, promises, wanted things, and next small adventures.')}</p><a class="text-link" href="ledger.html">Meet the party ${arrow}</a><div class="ledger-motif" aria-hidden="true">${icon('people')}<span>CHARACTERS · PROMISES · POSSIBILITIES</span></div></article></div></section>
    <section class="section guide-section" id="guide" aria-labelledby="guide-title"><div class="section-heading"><div><p class="eyebrow">Keep this close</p><h2 id="guide-title">Your field guide.</h2></div><span class="small-label">Seven chapters for the road ahead</span></div><div class="guide-list">${topics.map(([id, label, title, description], i) => `<a class="guide-row" href="${id}.html"><span class="chapter-number">0${i + 1}</span><div><span class="guide-label">${escape(label)}</span><h3>${escape(title)}</h3><p>${escape(description)}</p></div>${arrow}</a>`).join('')}</div></section>` });
}
function chapterNav(current) {
  return `<aside class="chapter-nav"><span class="eyebrow">The field guide</span><nav aria-label="Guide chapters">${topics.map(([id, label], i) => `<a href="${id}.html"${current === id ? ' aria-current="page"' : ''}><span aria-hidden="true">0${i + 1}</span>${escape(label)}</a>`).join('')}<a href="rules.html"${current === 'rules' ? ' aria-current="page"' : ''}>${icon('search')}Can I use this?</a></nav><p>Not sure about a spell or mod?<br><a href="rules.html">Check before you try it.</a></p></aside>`;
}
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: 'Hold — do not use', blocked: 'Blocked' };
function catalogMarkup() {
  const ids = new Set();
  const entries = catalog.entries.map(entry => {
    slug(entry.id);
    if (ids.has(entry.id)) throw new Error(`Duplicate catalog ID ${entry.id}`);
    ids.add(entry.id);
    if (!statusLabels[entry.status]) throw new Error(`Invalid catalog status for ${entry.id}`);
    const search = [entry.name, entry.category, entry.status, entry.summary, entry.detail, ...(entry.aliases || [])].join(' ');
    const source = safeUrl(entry.sourceUrl);
    return `<article class="rule-card" id="rule-${entry.id}" data-rule data-status="${escape(entry.status)}" data-search="${escape(search)}"><div class="rule-meta"><span class="status status-${escape(entry.status)}">${statusLabels[entry.status]}</span><span class="rule-category">${escape(entry.category)}</span></div><h2><a href="#rule-${entry.id}">${escape(entry.name)}</a></h2><p class="rule-summary">${escape(entry.summary)}</p>${entry.detail ? `<p class="rule-detail">${escape(entry.detail)}</p>` : ''}${source ? `<a class="rule-source" href="${source}" rel="noreferrer" aria-label="Source for ${escape(entry.name)}">Read the source <span aria-hidden="true">↗</span></a>` : ''}</article>`;
  }).join('');
  return `<section class="catalog" aria-label="Campaign rules catalog"><div class="search-panel" data-search-controls hidden><form class="search-form" role="search"><label for="rule-search">Find a spell, perk, race, or mod</label><div class="search-input-wrap">${icon('search')}<input type="search" id="rule-search" name="q" placeholder="Try Strong Reflexes or Ghostwalk" autocomplete="off" spellcheck="false" aria-describedby="search-help"></div><p id="search-help">Names can overlap. Check which mod the result belongs to.</p></form><div class="filter-group" role="group" aria-label="Filter by rule status">${[['all', 'All rules'], ['allowed', 'Allowed'], ['conditional', 'Conditional'], ['hold', 'On hold'], ['blocked', 'Blocked']].map(([value, label]) => `<button type="button" data-filter="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}</div><p class="result-count" role="status" aria-live="polite" aria-atomic="true" data-result-count>${catalog.entries.length} rules</p></div><noscript><p class="callout">All campaign rules are listed below. You can use your browser’s Find command to look up a name. Interactive search requires JavaScript.</p></noscript><div class="no-results callout tone-hold" data-no-results hidden><h2>No matching rule — unverified</h2><p>A missing result is not permission to use something. Try another spelling or the mod’s name. If it is still unlisted, check with the group before using it.</p><button type="button" class="button secondary" data-clear-search>Show all rules</button></div><div class="rule-list">${entries}</div></section>`;
}
function sectionPage(section) {
  const isRules = section.id === 'rules';
  const isStory = ['chronicle', 'ledger'].includes(section.id);
  const content = `<div class="page-heading"><a class="breadcrumb" href="index.html">${icon('arrow')} Back to the campfire</a><p class="eyebrow">${escape(section.eyebrow || 'The field guide')}</p><h1>${escape(section.title)}</h1>${section.intro ? `<p class="page-intro">${escape(section.intro)}</p>` : ''}</div><div class="prose">${isRules ? catalogMarkup() + '<div class="catalog-explainer"><h2>How to read these rules</h2>' + blocks(section.blocks) + '</div>' : blocks(section.blocks)}</div>`;
  return document({ title: section.title, description: section.intro || section.title, current: section.id, body: `<div class="page-layout${isStory ? ' story-layout' : ''}">${chapterNav(section.id)}<article class="page-content">${content}${topics.some(t => t[0] === section.id) ? `<nav class="next-chapter" aria-label="Next chapter"><span class="eyebrow">Keep exploring</span>${(() => { const next = topics[(topics.findIndex(t => t[0] === section.id) + 1) % topics.length]; return `<a href="${next[0]}.html">${escape(next[1])} ${arrow}</a>`; })()}</nav>` : ''}</article></div><div class="exit-section">${exitCard()}</div>` });
}
await mkdir(path.join(output, 'assets'), { recursive: true });
for (const filename of ['site.css', 'site.js', 'north.svg', 'favicon.svg']) {
  await copyFile(path.join(root, 'src/assets', filename), path.join(output, 'assets', filename));
}
await writeFile(path.join(output, 'index.html'), home());
for (const section of sections.filter(section => section.id !== 'leave-now')) {
  await writeFile(path.join(output, `${section.id}.html`), sectionPage(section));
}
await writeFile(path.join(output, 'leave-now.html'), document({ title: 'I have to go NOW', description: 'The quick exit steps for our Skyrim Together campaign.', body: `<div class="standalone-exit">${exitCard(true)}<a class="text-link" href="index.html">Back to the field guide ${arrow}</a></div>` }));
await writeFile(path.join(output, '404.html'), document({ title: 'A little off the path', description: 'Find your way back to the Fellowship field guide.', baseUrl: 'https://kyledempster7.github.io/str-friends-site/', body: '<section class="not-found"><p class="eyebrow">A little off the path</p><h1>Let’s find the road.</h1><p>This page isn’t in the field guide.</p><a class="button" href="index.html">Back to the campfire</a></section><div class="exit-section">' + exitCard() + '</div>' }));
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${sections.filter(section => section.id !== 'leave-now').length + 3} static pages and four local assets.`);
