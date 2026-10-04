import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Version D (/v4/): the original look, with before-and-after grids.
// Structure per Kyle (2026-10-03): the homepage is the title banner, then Start here with search and the
// seven numbered topics, walked first to last. Every subpage uses the same guide navigation.
// Quick answers live on the subpage that owns them.
// The big header button is Join, linking to the Nexus collection.
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: "Quarantined — don't use yet", blocked: 'Blocked' };
const statusMeaning = {
  hold: "Don't use yet. Wait for our co-op test.",
  blocked: "Outside our setup. Don't install it yourself.",
  conditional: 'Fine within the limit stated. Not tested in co-op yet.',
  allowed: 'Go ahead. Four-player testing is incomplete.'
};
const categoryLabels = { spell: 'spell', perk: 'perk', race: 'race power', mod: 'mod', mechanic: 'game rule' };
const statusOrder = ['hold', 'blocked', 'conditional', 'allowed'];
const svg = (inner, cls = 'icon') => `<svg class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const mark = svg('<path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m6.5 11.5 2.5 2 2.5-2"/>', 'icon brand-mark');
const joinIcon = svg('<path d="M15 4h5v16h-5M3 12h11m-4-5 5 5-5 5"/>');
const searchIcon = svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>');
const arrowIcon = svg('<path d="M4 12h15m-6-6 6 6-6 6"/>');
const playIcon = svg('<path d="m9 5 11 7-11 7Z" fill="currentColor"/>', 'icon d-audio-play-icon');
const pauseIcon = svg('<path d="M8 5v14M16 5v14" stroke-width="4"/>', 'icon d-audio-pause-icon');

const css = `/* Version D: grids on the original look. */
.hero h1 em,em{font-style:normal}
.d-hero .hero-inner{grid-template-columns:minmax(0,1fr);padding-top:72px;padding-bottom:64px}
.d-page{max-width:1236px;margin:auto;padding:48px 42px 64px;min-width:0}
.d-page h1{font-size:clamp(2.2rem,4vw,3.2rem);letter-spacing:-.035em;margin:.4rem 0 .6rem}
.d-section{margin-top:40px}.d-section:first-of-type{margin-top:24px}
.d-section h2{font-size:1.6rem;margin:0 0 .8rem}
.d-wrap{overflow-x:auto}
.d-grid{width:100%;min-width:0;border-collapse:collapse;font-size:.95rem;line-height:1.55}
.d-grid caption{text-align:left;caption-side:top;padding:0 0 10px;color:#b2bfc2;font-size:.9rem}
.d-grid th,.d-grid td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}
.d-grid thead th{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;border-bottom:1px solid var(--gold-dark);white-space:nowrap}
.d-grid tbody th{font-weight:600;color:#f6f2e9;width:22%}
.d-grid.cols-3 td:nth-child(2){color:#b2bfc2;width:28%}
.d-grid a{color:var(--gold)}
.d-grid tr.d-urgent th,.d-grid tr.d-urgent td{color:#f0d099}
.d-quick .d-grid tbody th{width:32%}
.s-hold{color:#f0d099}.s-blocked{color:#efb9b1}.s-conditional{color:#bddce5}.s-allowed{color:#b5dac4}
.d-search{margin:8px 0 32px}.d-chapters+.d-search-hint{margin-top:40px}.d-chapters~.d-search{margin-bottom:0}.d-search-hint{margin:0 0 12px;color:#b2bfc2}
.d-search-row{display:flex;gap:8px;max-width:40rem}
.d-search input{flex:1;min-width:0;padding:12px 14px;background:#0c1418;color:#e5e9e5;border:1px solid var(--gold-dark);border-radius:2px;font:inherit;font-size:1rem}
.d-search input:focus{outline:2px solid var(--gold);outline-offset:1px}
.d-search button{padding:12px 18px;background:var(--gold);color:#101a20;border:0;border-radius:2px;font:inherit;font-weight:600;cursor:pointer}
.d-count{margin:10px 0 0;color:#b2bfc2;font-size:.9rem}
/* B's lookup-banner, lookup-icon and home-search, scoped to D's content column. */
.d-lookup{display:flex;flex-wrap:wrap;align-items:center;gap:24px;padding:32px;margin:0;background:var(--surface-raised);border:1px solid var(--line);border-radius:3px}
.d-lookup .lookup-icon{width:56px;height:56px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--gold);border:1px solid var(--gold-dark);border-radius:50%}
.d-lookup-copy{flex:1;min-width:0}.d-lookup .eyebrow,.d-lookup h1{margin:0 0 8px}.d-lookup h1{font-size:2rem}.d-lookup-copy>p:last-child{font-size:.875rem;line-height:1.65;color:var(--muted);margin:0}
.d-lookup .home-search{display:flex;gap:8px;flex-basis:100%;min-width:0;margin:0}
.d-lookup input{min-width:0;width:100%;min-height:48px;padding:12px 16px;border:1px solid var(--line);border-radius:3px;background:var(--bg);color:var(--bright);font-size:.875rem}
.d-lookup .button{display:inline-flex;align-items:center;justify-content:center;gap:16px;flex-shrink:0;min-height:48px;padding:12px 24px;border:1px solid var(--gold);border-radius:3px;background:var(--gold);color:var(--bg);font:600 .875rem/1.65 var(--sans)}
.d-lookup .button:hover{background:var(--bright);border-color:var(--bright)}.d-lookup .button .icon{width:20px;height:20px}
.d-lookup .d-count{flex-basis:100%;margin:-12px 0 0}
.d-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.d-sources{margin-top:32px;font-size:.85rem;color:#b2bfc2}.d-sources a{margin-right:16px;color:var(--gold)}
.d-chapters-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px 24px;margin:0 0 16px}
.d-chapters-head h2{margin:0;font-size:1.8rem}.d-chapters-head p{margin:0;color:#b2bfc2}
.d-chapters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.d-chapter{display:flex;flex-direction:column;min-width:0;min-height:168px;padding:24px;border:1px solid var(--line);border-top:2px solid var(--gold);border-radius:3px;background:#16242b;text-decoration:none;color:inherit}
.d-chapter:hover{background:#1c2c33}
.d-chapter-num{font:400 1.5rem/1.25 Georgia,'Times New Roman',serif;color:var(--gold-dark)}
.d-chapter-label{display:block;margin-top:16px;font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold)}
.d-chapter h3{margin:6px 0 0;font:400 1.25rem/1.3 Georgia,'Times New Roman',serif;color:#f6f2e9}
.d-chapter .icon{width:40px;height:40px;align-self:end;margin-top:auto;padding-top:12px;color:var(--gold);opacity:.5}
.d-layout{max-width:1320px;margin:auto;display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;padding:0 0 0 42px}
.d-layout .d-page{padding-left:0;width:100%}
/* Keep the whole aside below the sticky header. Grid spacing is outside its scroll box. */
.d-side{position:sticky;top:calc(var(--d-header-height,95px) + 16px);align-self:start;margin-top:48px;max-height:calc(100vh - var(--d-header-height,95px) - 32px);max-height:calc(100dvh - var(--d-header-height,95px) - 32px);overflow-y:auto;overscroll-behavior:contain;font-size:.95rem}
.d-side-title{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;margin:0 0 10px;list-style:none}
.d-side-title::-webkit-details-marker{display:none}.d-side-title:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.d-side ol{list-style:none;margin:0;padding:0}
.d-side li a{display:block;padding:8px 10px;color:#c2cdcd;text-decoration:none;border-left:2px solid transparent}
.d-side li a:hover{color:#f6f2e9}
.d-side li a[aria-current]{color:#f6f2e9;border-left-color:var(--gold)}
.d-side .d-side-subpages{margin:0 0 8px 16px;font-size:.85rem}
.d-side-subpages a[aria-current="page"]{font-weight:700}
.d-page-strip{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 20px;font-size:.85rem;line-height:1.65;color:#b2bfc2}
.d-page-strip a{color:var(--gold);text-underline-offset:3px}.d-page-strip a:hover{color:#f6f2e9}
.d-page-strip strong{color:#f6f2e9}.d-page-count{white-space:nowrap}.d-page-next{margin-left:4px}
.d-footer{max-width:1236px;margin:auto;padding:16px 42px;font-size:.8rem;color:#b2bfc2;display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}.d-footer a{color:var(--gold)}
.d-side-home{margin:14px 0 0;font-size:.85rem}.d-side-home a{color:var(--gold);text-decoration:none;padding:0 10px}
.d-pager{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;margin-top:48px;padding-top:20px;border-top:1px solid var(--line)}
.d-pager a{color:var(--gold);text-decoration:none}.d-pager a:hover{color:#f6f2e9}
.d-pager .d-next{margin-left:auto;text-align:right}
.d-join{display:inline-flex;align-items:center;gap:8px;margin-left:auto}.d-join small{font-size:.75rem;opacity:.8}
.d-audio{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px 16px;margin:24px 0;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.d-audio[data-enhanced]{grid-template-columns:56px minmax(0,1fr) auto}
.d-audio [hidden]{display:none!important}.d-audio-main{min-width:0}.d-audio-kicker{margin:0 0 3px;color:var(--gold);font-size:.65rem;letter-spacing:.12em;text-transform:uppercase}
.d-audio h2{margin:0;font:400 1.15rem/1.3 Georgia,'Times New Roman',serif;color:var(--bright);overflow-wrap:anywhere}
.d-audio button{font:inherit;cursor:pointer}.d-audio-play{display:flex;align-items:center;justify-content:center;width:56px;height:56px;padding:0;border:0;border-radius:50%;background:var(--gold);color:var(--bg)}
.d-audio-play:hover{background:var(--bright)}.d-audio-play .icon{width:24px;height:24px}.d-audio-pause-icon{display:none}.d-audio[data-playing="true"] .d-audio-play-icon{display:none}.d-audio[data-playing="true"] .d-audio-pause-icon{display:block}
.d-audio-timeline{margin-top:6px}.d-audio input[type="range"]{display:block;width:100%;min-width:0;height:24px;margin:0;accent-color:var(--gold);cursor:pointer}.d-audio input:disabled{cursor:default;opacity:.55}
.d-audio-time{display:flex;justify-content:space-between;gap:8px;color:#b2bfc2;font-size:.75rem;font-variant-numeric:tabular-nums;line-height:1.4}
.d-audio-actions{display:flex;flex-direction:column;align-items:center;gap:2px}.d-audio-speed{min-width:48px;min-height:44px;padding:4px 8px;border:1px solid var(--gold-dark);border-radius:3px;color:var(--gold);background:transparent}
.d-audio-transcript-link{display:flex;align-items:center;min-height:44px;color:var(--gold);font-size:.8rem}.d-audio audio{grid-column:1/-1;width:100%;max-width:420px}.d-audio-status{grid-column:1/-1;margin:0;color:#b2bfc2;font-size:.9rem}
.d-audio button:focus-visible,.d-audio input:focus-visible,.d-audio a:focus-visible,.d-transcript summary:focus-visible{outline:2px solid var(--gold);outline-offset:4px}
.d-transcript{margin-top:32px;scroll-margin-top:calc(var(--d-header-height,95px) + 16px)}.d-transcript summary{color:var(--gold);cursor:pointer;min-height:44px;padding:10px 0}.d-transcript p{max-width:70ch;color:#c2cdcd}
@media (max-width:700px){.d-audio{gap:12px}.d-audio[data-enhanced]{grid-template-columns:52px minmax(0,1fr) auto}.d-audio-play{width:52px;height:52px}.d-audio h2{font-size:1.05rem}}
@media (max-width:1000px){.d-chapters{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:900px){.d-page>.eyebrow{display:none}.d-side-title{pointer-events:none}.d-guide:not([open])>nav{display:block}}
@media (max-width:820px){.header-inner{min-height:80px;padding-top:12px;padding-bottom:12px}}
@media (max-width:899px){.d-layout{display:block;padding:0}.d-layout .d-page{padding:24px 16px 48px}.d-side{position:static;margin:0;padding:16px 16px 0;max-height:none;overflow:visible}.d-side-title{display:flex;align-items:center;justify-content:space-between;min-height:44px;margin:0;cursor:pointer;border-bottom:1px solid var(--line)}.d-side-title::after{content:'Show +';font-size:.75rem;letter-spacing:0;text-transform:none}.d-guide[open]>.d-side-title::after{content:'Hide −'}.d-side li a{min-height:44px}.primary-nav{flex-wrap:wrap}}
@media (max-width:700px){.d-lookup{padding:24px;gap:16px}.d-lookup .lookup-icon{width:40px;height:40px}.d-lookup .eyebrow{font-size:.6rem}.d-lookup h1{font-size:1.8rem}.d-lookup .home-search{flex-wrap:wrap}.d-lookup input{flex-basis:100%}.d-lookup .button{width:100%}.d-join small{display:none}}
@media (max-width:700px){.d-page{padding:32px 16px 48px}.d-chapters{grid-template-columns:minmax(0,1fr)}.d-grid,.d-grid caption,.d-grid thead,.d-grid tbody,.d-grid tr,.d-grid th,.d-grid td{display:block}.d-grid thead{position:absolute;left:-9999px}.d-grid tr{padding:10px 0;border-bottom:1px solid var(--line)}.d-grid th,.d-grid td{border:0;padding:2px 0;width:auto!important}.d-grid td[data-label]::before{content:attr(data-label) ": ";color:var(--gold);font-size:.8rem}}`;

// A cell is text, a link {text, href}, or a list of both (one link per named ability).
const cell = (value) => {
  if (Array.isArray(value)) return value.map(cell).join('');
  if (value && typeof value === 'object') return `<a href="${esc(value.href)}">${esc(value.text)}</a>`;
  return esc(value);
};
const plain = (value) => (Array.isArray(value) ? value.map(plain).join('') : value && typeof value === 'object' ? value.text : String(value));

// A section heading that only repeats the page title directly above it is dropped; the section keeps its id and name.
const norm = (value) => String(value).toLowerCase().replace(/\s+/g, ' ').trim();
const repeatsTitle = (heading, pageTitle) => !!pageTitle && (norm(heading) === norm(pageTitle) || norm(heading).startsWith(`${norm(pageTitle)} `));
const grid = (g, pageTitle) => {
  const cls = g.columns.length === 3 ? ' cols-3' : '';
  const head = g.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('');
  const rows = g.rows.map((r) => {
    const urgent = /^(Leave NOW|Leaving, now or later)$/.test(plain(r[0])) ? ' class="d-urgent"' : '';
    const cells = r.slice(1).map((value, i) => `<td data-label="${esc(g.columns[i + 1])}">${cell(value)}</td>`).join('');
    return `<tr${urgent}><th scope="row">${cell(r[0])}</th>${cells}</tr>`;
  }).join('\n');
  const open = repeatsTitle(g.title, pageTitle)
    ? `<section class="d-section${g.quick ? ' d-quick' : ''}" id="${esc(g.id)}" aria-label="${esc(g.title)}">`
    : `<section class="d-section${g.quick ? ' d-quick' : ''}" aria-labelledby="${esc(g.id)}"><h2 id="${esc(g.id)}">${esc(g.title)}</h2>`;
  return `${open}
<div class="d-wrap"><table class="d-grid${cls}">${g.note ? `<caption>${esc(g.note)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>
${rows}
</tbody></table></div></section>`;
};
const quickGrid = (q) => q ? grid({ id: 'quick-answer', quick: true, title: 'Quick answer', columns: ['Question', 'Short answer'], rows: [q] }) : '';
const sources = (list) => list?.length ? `<p class="d-sources">Sources: ${list.map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join('')}</p>` : '';
const audioTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const audioBar = (audio) => audio ? `<section class="d-audio" aria-labelledby="audio-title" data-transcript="${esc(audio.transcriptAnchor)}">
<button type="button" class="d-audio-play" data-audio-play data-audio-custom hidden aria-label="Play ${esc(audio.title)}" aria-controls="listen-audio">${playIcon}${pauseIcon}</button>
<div class="d-audio-main"><p class="d-audio-kicker">Listen along</p><h2 id="audio-title">${esc(audio.title)}</h2><div class="d-audio-timeline" data-audio-custom hidden><input type="range" data-audio-seek min="0" max="${esc(audio.duration)}" step="0.1" value="0" disabled aria-label="Seek audio (available after pressing Play)" aria-controls="listen-audio"><div class="d-audio-time" aria-hidden="true"><span data-audio-elapsed>0:00</span><span data-audio-total>${audioTime(audio.duration)}</span></div></div></div>
<div class="d-audio-actions"><button type="button" class="d-audio-speed" data-audio-speed data-audio-custom hidden aria-label="Playback speed: 1 times. Change speed" aria-controls="listen-audio">1×</button><a class="d-audio-transcript-link" href="#${esc(audio.transcriptAnchor)}">Transcript</a></div>
<audio id="listen-audio" controls preload="none" src="${esc(audio.src)}" aria-label="Listen to ${esc(audio.title)}"></audio><p class="d-audio-status" role="status" hidden></p></section>` : '';
const audioTranscript = (audio) => audio ? `<details class="d-transcript" id="${esc(audio.transcriptAnchor)}"><summary>Audio transcript: ${esc(audio.title)}</summary>${audio.transcript.map(p => `<p>${esc(p)}</p>`).join('')}</details>` : '';

export async function renderV4(root) {
  const shared = JSON.parse(await readFile(path.join(root, 'src/variants/v4/grids.json'), 'utf8'));
  const data = JSON.parse(await readFile(path.join(root, 'src/variants/v4/pages.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'src/variants/v4/content/catalog.json'), 'utf8'));
  const audioScript = await readFile(path.join(root, 'scripts/lib/v4-audio.js'), 'utf8');
  const byId = new Map(shared.grids.map((g) => [g.id, g]));
  const resolve = (g) => {
    const found = typeof g === 'string' ? byId.get(g) : g;
    if (!found) throw new Error(`Version D: unknown grid ${g}`);
    return found;
  };
  const chapters = data.chapters;
  if (chapters.length !== 7) throw new Error('Version D must have exactly seven chapters');
  for (const c of chapters) if (!c.pages.length || c.pages.length > 5) throw new Error(`Chapter ${c.num} must have 1 to 5 pages`);

  const shell = ({ title, description, body }) => {
    return `<!doctype html>
<html lang="en" id="top"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#101a20"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Fellowship</title><meta name="description" content="${esc(description)}"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/d.css"><script src="assets/d.js" defer></script></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="index.html" aria-label="Fellowship, home">${mark}<span>Fellowship<small>A Skyrim Together field guide</small></span></a><a class="leave-link d-join" href="${esc(data.collectionUrl)}">${joinIcon}<span>Join us <small>· setup on Nexus</small></span></a></div></header><main id="main" tabindex="-1">
${body}
</main><footer class="d-footer"><span>Updated <time datetime="${esc(data.updated)}">${esc(data.updated)}</time></span><a href="#top">Back to top ↑</a></footer></body></html>
`;
  };

  const searchForm = (id) => `<p class="d-search-hint" id="${id}-hint">Check if a spell, perk, power or mod is allowed.</p><form class="d-search" action="rules.html" method="get" role="search"><label class="d-sr-only" for="${id}">Can I use this?</label><div class="d-search-row"><input id="${id}" name="q" type="search" placeholder="Type a spell, perk, power or mod" aria-describedby="${id}-hint" autocomplete="off"><button type="submit">Search</button></div></form>`;
  const pages = new Map();
  // The same topic order powers the sidebar and top strip, including the lookup.
  const groups = [...chapters, { label: 'Can I use this?', pages: data.rules.pages }];
  const sidebar = (file) => {
    const topics = groups.map(group => {
      const active = group.pages.some(p => p.file === file);
      const expanded = active && group.pages.length > 1;
      const current = active ? ` aria-current="${expanded ? 'location' : 'page'}"` : '';
      const children = expanded ? `<ol class="d-side-subpages" aria-label="${esc(group.label)} pages">${group.pages.map(p => `<li><a href="${esc(p.file)}"${p.file === file ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`).join('')}</ol>` : '';
      return `<li><a href="${esc(group.pages[0].file)}"${current}>${group.num ? `${esc(group.num)} · ` : ''}${esc(group.label)}</a>${children}</li>`;
    }).join('');
    return `<aside class="d-side" aria-label="Field guide"><details class="d-guide" open><summary class="d-side-title">Field guide</summary><nav aria-label="Guide topics"><ol>${topics}</ol><p class="d-side-home"><a href="index.html#topics">Guide home</a></p></nav></details></aside>`;
  };
  const pageStrip = (file) => {
    const gi = groups.findIndex(group => group.pages.some(p => p.file === file));
    const group = groups[gi];
    if (!group || group.pages.length < 2) return '';
    const pi = group.pages.findIndex(p => p.file === file);
    const links = group.pages.map(p => p.file === file
      ? `<strong aria-current="page">${esc(p.title)}</strong>`
      : `<a href="${esc(p.file)}">${esc(p.title)}</a>`).join(' <span aria-hidden="true">·</span> ');
    // After topic 07, continue to the lookup; after the lookup, restart the guide.
    const nextGroup = groups[(gi + 1) % groups.length];
    const nextPage = group.pages[pi + 1];
    const next = nextPage
      ? `<a class="d-page-next" href="${esc(nextPage.file)}">Next: ${esc(nextPage.title)} →</a>`
      : `<a class="d-page-next" href="${esc(nextGroup.pages[0].file)}">Next topic: ${esc(nextGroup.label)} →</a>`;
    return `<nav class="d-page-strip" aria-label="${esc(group.label)} pages"><span class="d-page-count d-sr-only">Page ${pi + 1} of ${group.pages.length}:</span> ${links} ${next}</nav>`;
  };

  // Homepage: title banner, then the seven topics, then search, within Start here.
  const h = data.home;
  const tiles = chapters.map((c) => `<a class="d-chapter" href="${esc(c.pages[0].file)}"><span class="d-chapter-num">${esc(c.num)}</span><span class="d-chapter-label">${esc(c.label)}</span><h3>${esc(c.headline)}</h3>${svg(c.icon)}</a>`).join('');
  pages.set('index.html', shell({
    title: 'The North is better together',
    description: 'Compare single player with co-op, and vanilla with our mods.',
    body: `<section class="hero d-hero"><div class="hero-inner"><div class="hero-copy"><h1>${esc(h.titleBefore)} <em>${esc(h.titleAccent)}</em></h1></div></div></section>
<div class="d-page">${audioBar(h.audio)}
<section aria-labelledby="topics"><div class="d-chapters-head"><h2 id="topics">${esc(h.chaptersTitle)}</h2></div><div class="d-chapters">${tiles}</div>${searchForm('home-search')}</section>${audioTranscript(h.audio)}</div>${h.audio ? `<script>${audioScript}</script>` : ''}`
  }));

  // Topic subpages: expanded guide, numbered page strip and the bottom pager.
  chapters.forEach((c, ci) => {
    c.pages.forEach((p, pi) => {
      const side = sidebar(p.file);
      const prevChapter = ci > 0 ? chapters[ci - 1] : null;
      const prev = pi > 0
        ? `<a href="${esc(c.pages[pi - 1].file)}">← Previous page: ${esc(c.pages[pi - 1].title)}</a>`
        : prevChapter
          ? `<a href="${esc(prevChapter.pages[prevChapter.pages.length - 1].file)}">← ${esc(prevChapter.num)} ${esc(prevChapter.label)}</a>`
          : '';
      const next = pi < c.pages.length - 1
        ? `<a class="d-next" href="${esc(c.pages[pi + 1].file)}">Next page: ${esc(c.pages[pi + 1].title)} →</a>`
        : ci < chapters.length - 1
          ? `<a class="d-next" href="${esc(chapters[ci + 1].pages[0].file)}">${esc(chapters[ci + 1].num)} ${esc(chapters[ci + 1].label)} →</a>`
          : `<a class="d-next" href="index.html#topics">Back to the guide →</a>`;
      const pager = `<nav class="d-pager" aria-label="Guide progress">${prev}${next}</nav>`;
      pages.set(p.file, shell({
        title: p.title,
        description: `${p.title}: comparisons for our Skyrim Together campaign.`,
        body: `<div class="d-layout">${side}<div class="d-page"><p class="eyebrow">${esc(c.num)} · ${esc(c.label)}</p><h1>${esc(p.title)}</h1>${pageStrip(p.file)}
${audioBar(p.audio)}
${quickGrid(p.quick)}
${p.grids.map((g) => grid(resolve(g), p.title)).join('\n')}
${audioTranscript(p.audio)}
${sources(p.sources)}
${pager}</div></div>${p.audio ? `<script>${audioScript}</script>` : ''}`
      }));
    });
  });

  // The party ledger is the last page of chapter 05 (rendered above).
  if (!chapters.some((c) => c.pages.some((p) => p.file === 'ledger.html'))) throw new Error('Version D: the party ledger must belong to a chapter');

  // Keep every legacy rules.html#rule-* target in the searchable HTML. Category pages
  // offer shorter grids; enhancement hides the full search grid until a query or anchor needs it.
  const entries = [...catalog.entries].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name));
  const present = statusOrder.filter((s) => catalog.entries.some((e) => e.status === s));
  const keyRows = present.map((s) => `<tr><th scope="row" class="s-${s}">${esc(statusLabels[s])}</th><td data-label="How many">${catalog.entries.filter((e) => e.status === s).length}</td><td data-label="Means">${esc(statusMeaning[s])}</td></tr>`).join('');
  const ruleRows = (list) => list.map((e) => {
    const search = esc([e.name, ...(e.aliases ?? []), e.category, categoryLabels[e.category] ?? '', e.status].join(' '));
    const source = e.sourceUrl ? ` <a href="${esc(e.sourceUrl)}">Source</a>` : '';
    return `<tr id="rule-${esc(e.id)}" data-status="${e.status}" data-search="${search}"><th scope="row">${esc(e.name)}</th><td data-label="Type">${esc(categoryLabels[e.category] ?? e.category)}</td><td data-label="Status" class="s-${e.status}">${esc(statusLabels[e.status])}</td><td data-label="What to know">${esc(e.summary)} ${esc(e.detail)}${source}</td></tr>`;
  }).join('\n');
  const ruleGrid = (list, { search = false } = {}) => `<section class="d-section"${search ? ' id="results"' : ''} aria-labelledby="all"><h2 id="all">${search ? 'Search results' : "What we've checked"}</h2>
<div class="d-wrap"><table class="d-grid"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">What to know</th></tr></thead><tbody>
${ruleRows(list)}
${search ? '<tr id="no-match" hidden><td colspan="4">No match. Unlisted means unchecked. Ask the host before using it.</td></tr>' : ''}
</tbody></table></div></section>`;
  const lookup = `<section class="lookup-banner d-lookup" aria-labelledby="lookup-title"><div class="lookup-icon">${searchIcon}</div><div class="d-lookup-copy"><p class="eyebrow">Before you spend that perk point</p><h1 id="lookup-title">Can I use this?</h1>${pageStrip('rules.html')}<p>Search a spell, perk, power or mod. Unlisted? Ask the host.</p></div><form class="home-search" action="rules.html" method="get" role="search"><label class="d-sr-only" for="filter">Spell, perk, power or mod</label><input id="filter" type="search" name="q" placeholder="Try Strong Reflexes or Ghostwalk" autocomplete="off"><button class="button" type="submit">Check ${arrowIcon}</button></form><p class="d-count" id="count" role="status" aria-live="polite">Showing all ${catalog.entries.length}.</p></section>`;
  const rulesAudio = data.rules.pages.find(p => p.file === 'rules.html')?.audio;
  pages.set('rules.html', shell({
    title: 'Can I use this?',
    description: 'Check whether a spell, perk, power or mod is okay to use in our campaign.',
    body: `<div class="d-layout">${sidebar('rules.html')}<div class="d-page">${lookup}
${audioBar(rulesAudio)}
${ruleGrid(entries, { search: true })}
${quickGrid(['Can I use this spell or perk?', "Quarantined: don't use yet. Allowed: go ahead. Conditional: follow the stated limit. Unlisted: ask the host."])}
<section class="d-section" aria-labelledby="key"><h2 id="key">What the statuses mean</h2><div class="d-wrap"><table class="d-grid cols-3"><thead><tr><th scope="col">Status</th><th scope="col">How many</th><th scope="col">Means</th></tr></thead><tbody>${keyRows}</tbody></table></div></section>
${audioTranscript(rulesAudio)}</div></div>${rulesAudio ? `<script>${audioScript}</script>` : ''}`
  }));
  for (const p of data.rules.pages.filter(p => p.categories)) {
    const list = entries.filter(e => p.categories.includes(e.category));
    pages.set(p.file, shell({
      title: p.title, description: `${p.title}: what you can use in our campaign.`,
      body: `<div class="d-layout">${sidebar(p.file)}<div class="d-page"><p class="eyebrow">Can I use this?</p><h1>${esc(p.title)}</h1>${pageStrip(p.file)}${audioBar(p.audio)}${ruleGrid(list)}${audioTranscript(p.audio)}</div></div>${p.audio ? `<script>${audioScript}</script>` : ''}`
    }));
  }

  pages.set('404.html', shell({
    title: 'Page not found',
    description: 'This page does not exist.',
    body: `<div class="d-layout">${sidebar('404.html')}<div class="d-page"><h1>Page not found</h1>${grid({ id: 'try', title: 'Try one of these', columns: ['Go to', 'What it is'], rows: [[{ text: 'The field guide', href: 'index.html#topics' }, 'Seven topics, start to finish'], [{ text: 'Can I use this?', href: 'rules.html' }, 'Check a spell, perk, power or mod'], [{ text: 'Joining a session', href: 'join.html' }, 'How to join a session']] })}</div></div>`
  }));

  pages.set('assets/d.css', css);
  pages.set('assets/d.js', await readFile(path.join(root, 'scripts/lib/v4-browser.js'), 'utf8'));
  return pages;
}
