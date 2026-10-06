import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Version D (/v4/): the original look, with before-and-after grids.
// Structure per Kyle (2026-10-03): the homepage is the title banner, then Start here with search and the
// eight numbered topics, walked first to last. Every subpage uses the same guide navigation.
// The top navigation has three entries (Field guide, Characters, Audio guide) plus the Join button.
// Characters is its own section with its own sidebar; the field guide sidebar lists the eight topics and the lookup.
// There are no quick-answer boxes: every fact lives once, in the page body.
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

// The one external embed on the site: the teaser on the home page. Replace the placeholder with the video id.
export const TRAILER_VIDEO_ID = 'e19Oz6DDCis';
const trailerEmbed = `<div class="d-trailer"><iframe src="https://www.youtube-nocookie.com/embed/${TRAILER_VIDEO_ID}" title="Skyrim Together teaser" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;

const css = `/* Version D: grids on the original look. */
.d-trailer{position:relative;aspect-ratio:16/9;width:100%;max-width:960px;margin:0 auto 32px;background:#000}.d-trailer iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.hero h1 em,em{font-style:normal}
.d-hero .hero-inner{grid-template-columns:minmax(0,1fr);padding-top:72px;padding-bottom:64px}
.d-page{max-width:1236px;margin:auto;padding:48px 42px 64px;min-width:0}
.d-page h1{font-size:clamp(2.2rem,4vw,3.2rem);letter-spacing:-.035em;margin:.4rem 0 .6rem}
.d-section{margin-top:40px}.d-section:first-of-type{margin-top:24px}
.d-section h2{font-size:1.6rem;margin:0 0 .8rem}
.d-wrap{overflow-x:auto}
.d-steps{list-style:none;margin:0;padding:0;counter-reset:step;max-width:70ch}.d-step{counter-increment:step;display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:20px;padding:22px 0;border-bottom:1px solid var(--line)}.d-step::before{content:counter(step);grid-row:1/span 4;font:400 3.2rem/1 Georgia,'Times New Roman',serif;color:var(--gold-dark);text-align:right}.d-step>*{grid-column:2;min-width:0}.d-step h2{font:600 1.15rem/1.35 var(--sans);margin:4px 0 6px;color:#f6f2e9}.d-step p{margin:0 0 6px;color:#c2cdcd;line-height:1.6}.d-step a,.d-block a{color:var(--gold)}.d-substeps{margin:6px 0 4px;padding:0 0 0 1.4rem;color:#c2cdcd}.d-substeps>li{margin:0 0 6px;padding-left:4px;line-height:1.6}.d-substeps>li::marker{color:var(--gold);font-weight:600}.d-subpoints{margin:4px 0 0;padding:0 0 0 1.1rem;list-style:disc}.d-subpoints li{margin:0 0 4px}.d-step-struck h2,.d-step-struck p,.d-step-struck .d-substeps{text-decoration:line-through;color:#8a9a9e}.d-step-struck::before{text-decoration:line-through;opacity:.55}.d-block+.d-lead{margin-top:24px}.d-block{max-width:70ch}.d-block p{margin:0 0 8px;color:#c2cdcd;line-height:1.6}.d-block ul{margin:0;padding:0 0 0 1.2rem;color:#c2cdcd}.d-block li{margin:0 0 8px;line-height:1.6}@media (max-width:700px){.d-step{grid-template-columns:44px minmax(0,1fr);column-gap:12px}.d-step::before{font-size:2.2rem}.d-substeps{padding-left:1.2rem}}
.d-grid{width:100%;min-width:0;border-collapse:collapse;font-size:.95rem;line-height:1.55}
.d-grid caption{text-align:left;caption-side:top;padding:0 0 10px;color:#b2bfc2;font-size:.9rem}
.d-grid th,.d-grid td{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid var(--line)}
.d-grid thead th{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;border-bottom:1px solid var(--gold-dark);white-space:nowrap}
.d-grid tbody th{font-weight:600;color:#f6f2e9;width:22%}
.d-grid.cols-3 td:nth-child(2){color:#b2bfc2;width:28%}
.d-grid a{color:var(--gold)}
.d-grid tr.d-urgent th,.d-grid tr.d-urgent td{color:#f0d099}
.d-quotes .d-grid tbody th{width:46%;font-weight:400;font-family:Georgia,'Times New Roman',serif;font-size:1.02rem;line-height:1.55}
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
.d-card img{width:min(100%,560px)}.d-shot img{width:min(100%,720px)}.d-figure details{margin-top:8px;max-width:70ch;font-size:.9rem;color:#c2cdcd}.d-figure summary{color:var(--gold);cursor:pointer;min-height:44px;padding:10px 0}.d-figure details p{margin:0 0 8px}
.d-callouts{margin-top:40px}.d-callouts>h2{font-size:1.6rem;margin:0 0 .8rem}
.d-callout{max-width:70ch;margin:0 0 16px;padding:14px 18px;border-left:3px solid var(--gold);background:#16242b}.d-callout h3{margin:0 0 4px;font:600 1.05rem/1.4 var(--sans);color:#f6f2e9}.d-callout p{margin:0 0 6px;color:#c2cdcd;line-height:1.6}.d-callout .d-callout-src{margin:0;font-size:.85rem;color:#b2bfc2}.d-callout a{color:var(--gold)}
.d-plain-note{max-width:70ch;margin:24px 0 0;color:#c2cdcd}.d-plain-note+.d-plain-note{margin-top:4px;font-size:.9rem;color:#b2bfc2}.d-plain-note a{color:var(--gold)}
.d-card-text p{max-width:70ch;margin:0 0 8px;color:#c2cdcd;line-height:1.6}
.d-figure{margin:24px 0}.d-figure img{display:block;max-width:100%;height:auto}.d-emblem img{width:140px}.d-figure figcaption{margin-top:8px;max-width:70ch;font-size:.85rem;color:#b2bfc2}
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
/* The page strip repeats the sidebar, so it shows only where the sidebar is collapsed (narrow screens), and then in a compact form. */
.d-page-strip{display:none;flex-wrap:wrap;align-items:baseline;gap:0 10px;margin:0 0 12px;font-size:.8rem;line-height:1.9;color:#b2bfc2}
.d-page-strip a{color:var(--gold);text-underline-offset:3px}.d-page-strip a:hover{color:#f6f2e9}
.d-page-strip strong{color:#f6f2e9}.d-page-count{white-space:nowrap}.d-page-next{margin-left:4px}
.header-inner .d-join{margin-left:0}
.d-release{margin:0 0 18px;max-width:none;font-size:.9rem}
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
.d-footer nav{display:flex;flex-wrap:wrap;gap:4px 20px}
.d-listen{margin:0 0 20px;font-size:.85rem;line-height:1.65;color:#b2bfc2}.d-listen a{color:var(--gold);text-underline-offset:3px}.d-listen a:hover{color:#f6f2e9}
.d-chapters-head .d-home-audio a,.d-home-links a{color:var(--gold);text-underline-offset:3px}
.d-home-links p{margin:0 0 4px;text-align:right}.d-home-links p:last-child{margin-bottom:0}
.d-lead{margin:0 0 6px;max-width:70ch;color:#c2cdcd}.d-lead a{color:var(--gold);text-underline-offset:3px}
.d-vote label{color:#f6f2e9}.d-vote select,.d-vote textarea,.d-vote input[type="text"]{background:#0c1418;color:#e5e9e5;border:1px solid var(--gold-dark);border-radius:2px;font:inherit;font-size:1rem}
.d-vote select{min-height:44px;min-width:88px;padding:6px 10px}
.d-vote textarea{display:block;width:100%;max-width:40rem;min-height:7rem;padding:12px 14px;line-height:1.5;resize:vertical}
.d-vote select:focus-visible,.d-vote textarea:focus-visible,.d-vote input:focus-visible,.d-linkbtn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.d-vote-code{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;margin:16px 0 4px}
.d-vote-code input{flex:1 1 14rem;min-width:0;max-width:22rem;min-height:44px;padding:8px 12px;letter-spacing:.06em}
.d-linkbtn{background:none;border:0;padding:0 6px;min-height:44px;color:var(--gold);font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.d-linkbtn:hover{color:#f6f2e9}.d-linkbtn:disabled{color:#78888c;cursor:default;text-decoration:none}
.d-absol-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;margin:16px 0 8px}
.d-absol-controls label{color:#f6f2e9}.d-absol-controls input[type="search"],.d-absol-controls select{background:#0c1418;color:#e5e9e5;border:1px solid var(--gold-dark);border-radius:2px;font:inherit;font-size:1rem;min-height:44px;padding:6px 10px}
.d-absol-controls input[type="search"]{flex:1 1 16rem;min-width:0;max-width:26rem}.d-absol-controls select{max-width:100%}
.d-absol-check{display:inline-flex;align-items:center;gap:8px;min-height:44px}.d-absol-check input{width:20px;height:20px;accent-color:var(--gold)}
.d-absol-controls input:focus-visible,.d-absol-controls select:focus-visible,.d-absol-check input:focus-visible,.d-sort:focus-visible,.d-absol-scroll:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
#absol-status{margin:8px 0;color:#b2bfc2;min-height:1.6rem}
.d-absol-scroll{overflow-x:auto;max-width:100%}
.d-absol{width:100%;min-width:64rem;border-collapse:collapse;font-size:.92rem;line-height:1.5}
.d-absol th,.d-absol td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}
.d-absol thead th{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);font-weight:600;border-bottom:1px solid var(--gold-dark);white-space:nowrap;padding:0 4px}
.d-absol tbody th{font-weight:600;width:17%}.d-absol a{color:var(--gold)}
.d-sort{background:none;border:0;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;min-height:44px;padding:0 8px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.d-sort:hover{color:#f6f2e9}.d-absol th[aria-sort="ascending"] .d-sort::after{content:" B2"}.d-absol th[aria-sort="descending"] .d-sort::after{content:" BC"}
.d-absol td:nth-child(2){width:6%}.d-absol td:nth-child(3){width:9%}.d-absol td:nth-child(4){width:32%}.d-absol td:nth-child(5),.d-absol td:nth-child(7){width:7%}
.d-key{margin-top:24px}
.d-vote-note{margin:6px 0;max-width:70ch;color:#b2bfc2}.d-vote-win{font-size:1.2rem;margin:12px 0}
#vote-result{margin-top:16px;min-height:2rem}
@media (max-width:700px){.d-home-links p{text-align:left}}
.d-guide-intro{margin:0 0 8px;max-width:70ch;color:#c2cdcd}.d-guide-gap{margin:0 0 16px;max-width:70ch;color:#b2bfc2}
.d-jump{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 8px;font-size:.9rem;color:#b2bfc2}.d-jump a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;color:var(--gold)}
.d-episode{margin:24px 0;padding:24px;border:1px solid var(--line);border-top:2px solid var(--gold);border-radius:3px;background:#16242b;scroll-margin-top:calc(var(--d-header-height,95px) + 16px)}
.d-episode:target{border-color:var(--gold)}
.d-episode-kicker{margin:0 0 4px;color:var(--gold);font-size:.7rem;letter-spacing:.13em;text-transform:uppercase}
.d-episode h2{margin:0 0 .5rem;font:400 1.45rem/1.3 Georgia,'Times New Roman',serif;color:#f6f2e9;overflow-wrap:anywhere}
.d-episode-summary{margin:0 0 4px;max-width:70ch;color:#c2cdcd}
.d-episode .d-audio{margin:16px 0;padding:0;border:0}
.d-episode-related{margin:0;font-size:.9rem;line-height:1.9;color:#b2bfc2}.d-episode-related a{color:var(--gold);text-underline-offset:3px}.d-episode-related a:hover{color:#f6f2e9}
.d-episode .d-transcript{margin-top:16px}
@media (max-width:700px){.d-episode{padding:16px}.d-episode h2{font-size:1.25rem}}
@media (max-width:700px){.d-audio{gap:12px}.d-audio[data-enhanced]{grid-template-columns:52px minmax(0,1fr) auto}.d-audio-play{width:52px;height:52px}.d-audio h2{font-size:1.05rem}}
@media (max-width:1000px){.d-chapters{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:900px){.d-page>.eyebrow{display:none}.d-side-title{pointer-events:none}.d-guide:not([open])>nav{display:block}}
@media (max-width:820px){.header-inner{min-height:80px;padding-top:12px;padding-bottom:12px}}
@media (max-width:899px){.d-layout:has(.d-guide:not([open])) .d-page-strip{display:flex}.d-page-strip .d-page-next{display:none}.d-layout{display:block;padding:0}.d-layout .d-page{padding:24px 16px 48px}.d-side{position:static;margin:0;padding:16px 16px 0;max-height:none;overflow:visible}.d-side-title{display:flex;align-items:center;justify-content:space-between;min-height:44px;margin:0;cursor:pointer;border-bottom:1px solid var(--line)}.d-side-title::after{content:'Show +';font-size:.75rem;letter-spacing:0;text-transform:none}.d-guide[open]>.d-side-title::after{content:'Hide −'}.d-side li a{min-height:44px}.primary-nav{flex-wrap:wrap}}
@media (max-width:700px){.d-lookup{padding:24px;gap:16px}.d-lookup .lookup-icon{width:40px;height:40px}.d-lookup .eyebrow{font-size:.6rem}.d-lookup h1{font-size:1.8rem}.d-lookup .home-search{flex-wrap:wrap}.d-lookup input{flex-basis:100%}.d-lookup .button{width:100%}.d-join{flex-wrap:wrap;white-space:normal;text-align:center;max-width:150px;gap:2px 6px}.d-join small{display:block;font-size:.62rem;line-height:1.2}}
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
    ? `<section class="d-section${g.cls ? ` ${g.cls}` : ''}" id="${esc(g.id)}" aria-label="${esc(g.title)}">`
    : `<section class="d-section${g.cls ? ` ${g.cls}` : ''}" aria-labelledby="${esc(g.id)}"><h2 id="${esc(g.id)}">${esc(g.title)}</h2>`;
  return `${open}
<div class="d-wrap"><table class="d-grid${cls}">${g.note ? `<caption>${esc(g.note)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>
${rows}
</tbody></table></div></section>`;
};
// Step layout: a big number on the left, a title, a line or two, and a numbered sub-list when a step has several actions.
// Items are cells (text, {text, href}, or a list of both); an item may also be {text, sub: [...]} for a short bulleted list.
const subItem = (item) => item && typeof item === 'object' && !Array.isArray(item) && item.sub
  ? `<li>${cell(item.text)}<ul class="d-subpoints">${item.sub.map((x) => `<li>${cell(x)}</li>`).join('')}</ul></li>`
  : `<li>${cell(item)}</li>`;
const stepList = (steps) => steps?.length ? `<section class="d-section d-steps-section" id="steps" aria-label="Steps"><ol class="d-steps">
${steps.map((st) => `<li class="d-step${st.struck ? ' d-step-struck' : ''}"><h2>${esc(st.title)}${st.struck ? '<span class="d-sr-only"> (crossed out: not needed)</span>' : ''}</h2>${st.text ? `<p>${cell(st.text)}</p>` : ''}${st.list?.length ? `<ol class="d-substeps">${st.list.map(subItem).join('')}</ol>` : ''}${st.note ? `<p>${cell(st.note)}</p>` : ''}</li>`).join('\n')}
</ol></section>` : '';
const textBlocks = (blocks) => (blocks ?? []).map((b) => `<section class="d-section d-block" id="${esc(b.id)}" aria-labelledby="${esc(b.id)}-title"><h2 id="${esc(b.id)}-title">${esc(b.title)}</h2>${(b.paragraphs ?? []).map((t) => `<p>${cell(t)}</p>`).join('')}${b.items?.length ? `<ul>${b.items.map((t) => `<li>${cell(t)}</li>`).join('')}</ul>` : ''}</section>`).join('\n');
const sources = (list) => list?.length ? `<p class="d-sources">Sources: ${list.map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join('')}</p>` : '';
const audioTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const audioBar = (audio) => audio ? `<section class="d-audio" aria-labelledby="audio-title" data-transcript="${esc(audio.transcriptAnchor)}">
<button type="button" class="d-audio-play" data-audio-play data-audio-custom hidden aria-label="Play ${esc(audio.title)}" aria-controls="listen-audio">${playIcon}${pauseIcon}</button>
<div class="d-audio-main"><p class="d-audio-kicker">Listen along</p><h2 id="audio-title">${esc(audio.title)}</h2><div class="d-audio-timeline" data-audio-custom hidden><input type="range" data-audio-seek min="0" max="${esc(audio.duration)}" step="0.1" value="0" disabled aria-label="Seek audio (available after pressing Play)" aria-controls="listen-audio"><div class="d-audio-time" aria-hidden="true"><span data-audio-elapsed>0:00</span><span data-audio-total>${audioTime(audio.duration)}</span></div></div></div>
<div class="d-audio-actions"><button type="button" class="d-audio-speed" data-audio-speed data-audio-custom hidden aria-label="Playback speed: 1 times. Change speed" aria-controls="listen-audio">1×</button><a class="d-audio-transcript-link" href="#${esc(audio.transcriptAnchor)}">Transcript</a></div>
<audio id="listen-audio" controls preload="none" src="${esc(audio.src)}" aria-label="Listen to ${esc(audio.title)}"></audio><p class="d-audio-status" role="status" hidden></p></section>` : '';
const episodeTime = audioTime;
const listenLink = (file, hash, text) => `<a href="${file}${hash}" target="_blank" rel="noopener">${text}</a>`;
const episodePlayer = (ep) => `<div class="d-audio" data-transcript="${ep.id}-transcript" data-remember="${ep.id}" data-title="${esc(ep.title)}">
<button type="button" class="d-audio-play" data-audio-play data-audio-custom hidden aria-label="Play ${esc(ep.title)}" aria-controls="audio-${ep.id}">${playIcon}${pauseIcon}</button>
<div class="d-audio-main"><div class="d-audio-timeline" data-audio-custom hidden><input type="range" data-audio-seek min="0" max="${esc(ep.duration)}" step="0.1" value="0" disabled aria-label="Seek audio (available after pressing Play)" aria-controls="audio-${ep.id}"><div class="d-audio-time" aria-hidden="true"><span data-audio-elapsed>0:00</span><span data-audio-total>${episodeTime(ep.duration)}</span></div></div></div>
<div class="d-audio-actions"><button type="button" class="d-audio-speed" data-audio-speed data-audio-custom hidden aria-label="Playback speed: 1 times. Change speed" aria-controls="audio-${ep.id}">1×</button><a class="d-audio-transcript-link" href="#${ep.id}-transcript">Transcript</a></div>
<audio id="audio-${ep.id}" controls preload="none" src="${esc(ep.src)}" aria-label="Listen to ${esc(ep.title)}"></audio><p class="d-audio-status" role="status" hidden></p></div>`;
const audioTranscript = (audio) => audio ? `<details class="d-transcript" id="${esc(audio.transcriptAnchor)}"><summary>Audio transcript: ${esc(audio.title)}</summary>${audio.transcript.map(p => `<p>${esc(p)}</p>`).join('')}</details>` : '';

export async function renderV4(root) {
  const shared = JSON.parse(await readFile(path.join(root, 'src/variants/v4/grids.json'), 'utf8'));
  const data = JSON.parse(await readFile(path.join(root, 'src/variants/v4/pages.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'src/variants/v4/content/catalog.json'), 'utf8'));
  const audioScript = await readFile(path.join(root, 'scripts/lib/v4-audio.js'), 'utf8');
  const guide = JSON.parse(await readFile(path.join(root, 'src/variants/v4/audio-guide.json'), 'utf8'));
  const purpose = JSON.parse(await readFile(path.join(root, 'src/variants/v4/purpose.json'), 'utf8'));
  const voteCore = await readFile(path.join(root, 'scripts/lib/v4-vote-core.js'), 'utf8').then((text) => text.replace(/\r\n/g, '\n'));
  const voteScript = await readFile(path.join(root, 'scripts/lib/v4-vote.js'), 'utf8').then((text) => text.replace(/\r\n/g, '\n'));
  const absolScript = await readFile(path.join(root, 'scripts/lib/v4-absol.js'), 'utf8').then((text) => text.replace(/\r\n/g, '\n'));
  const absolData = await readFile(path.join(root, 'src/variants/v4/absol-list.json'), 'utf8').then((text) => text.replace(/\r\n/g, '\n'));
  const absolCount = JSON.parse(absolData).rows.length;
  const absolOurs = JSON.parse(absolData).rows.filter((r) => r[4] === 1).length;
  const vigilant = JSON.parse(await readFile(path.join(root, 'src/variants/v4/vigilant/vigilant.json'), 'utf8'));
  const byId = new Map(shared.grids.map((g) => [g.id, g]));
  const resolve = (g) => {
    const found = typeof g === 'string' ? byId.get(g) : g;
    if (!found) throw new Error(`Version D: unknown grid ${g}`);
    return found;
  };
  const chapters = data.chapters;
  if (chapters.length !== 8) throw new Error('Version D must have exactly eight chapters');
  for (const c of chapters) if (!c.pages.length || c.pages.length > 5) throw new Error(`Chapter ${c.num} must have 1 to 5 pages`);
  const characters = data.characters;
  if (!characters?.pages?.length) throw new Error('Version D: the Characters section needs pages');
  const label = (p) => p.navLabel ?? p.title;
  // While revision 7 is not on Nexus, pages with install or join steps say so. Set "release" to false (or remove it) once the owner gives the go-ahead.
  const releaseNote = (flag) => flag ? `<p class="d-lead d-release">Revision 7 is being prepared. Wait for the owner's go-ahead before you install it. <a href="${esc(data.collectionUrl)}">Our Nexus collection page</a> still shows revision 6.</p>` : '';

  // Audio guide: which episodes relate to which content page, so each page can offer "Listen to this section".
  const pageTitles = new Map([...chapters.flatMap((c) => c.pages), ...characters.pages, ...data.rules.pages].map((p) => [p.file, p.title]));
  const episodesByPage = new Map();
  for (const ep of guide.episodes) {
    for (const file of ep.related) {
      if (!pageTitles.has(file)) throw new Error(`Audio guide: episode ${ep.number} names an unknown page ${file}`);
      episodesByPage.set(file, [...(episodesByPage.get(file) ?? []), ep]);
    }
  }
  const listenLinks = (file) => {
    const list = episodesByPage.get(file);
    return list ? `<p class="d-listen">Listen to this section: ${list.map((ep) => listenLink('audio-guide.html', `#${ep.id}`, `Episode ${ep.number}, ${esc(ep.title)}`)).join(' · ')} <span aria-hidden="true">(opens in a new tab)</span><span class="d-sr-only">(each opens the Audio guide in a new tab)</span></p>` : '';
  };

  // Which top-navigation entry is current for a page.
  const sectionOf = (file) => file === 'audio-guide.html' ? 'audio'
    : characters.pages.some((p) => p.file === file) ? 'characters'
    : file === 'index.html' ? ''
    : 'guide';
  const topNav = (file) => {
    const section = sectionOf(file);
    const entries = [['guide', 'Field guide', chapters[0].pages[0].file], ['characters', 'Characters', characters.pages[0].file], ['audio', 'Audio guide', 'audio-guide.html']];
    return `<nav class="primary-nav" aria-label="Main">${entries.map(([key, text, href]) => `<a href="${esc(href)}"${section === key ? ' aria-current="true"' : ''}>${text}</a>`).join('')}</nav>`;
  };
  const shell = ({ file, title, description, body }) => {
    return `<!doctype html>
<html lang="en" id="top"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#101a20"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Fellowship</title><meta name="description" content="${esc(description)}"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/d.css"><script src="assets/d.js" defer></script></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="header-inner"><a class="brand" href="index.html" aria-label="Fellowship, home">${mark}<span>Fellowship<small>A Skyrim Together field guide</small></span></a>${topNav(file)}<a class="leave-link d-join" href="${esc(data.collectionUrl)}">${joinIcon}<span>Join us <small>· revision 7 is being prepared: wait for the go-ahead</small></span></a></div></header><main id="main" tabindex="-1">
${body}
</main><footer class="d-footer"><span>Updated <time datetime="${esc(data.updated)}">${esc(data.updated)}</time></span><nav aria-label="Site"><a href="audio-guide.html">Audio guide</a><a href="#top">Back to top ↑</a></nav></footer></body></html>
`;
  };

  const searchForm = (id) => `<p class="d-search-hint" id="${id}-hint">Check if a spell, perk, power or mod is allowed.</p><form class="d-search" action="rules.html" method="get" role="search"><label class="d-sr-only" for="${id}">Can I use this?</label><div class="d-search-row"><input id="${id}" name="q" type="search" placeholder="Type a spell, perk, power or mod" aria-describedby="${id}-hint" autocomplete="off"><button type="submit">Search</button></div></form>`;
  const pages = new Map();
  // The same topic order powers the field guide sidebar and the page strip, including the lookup.
  // Characters is a separate section with its own sidebar and strip.
  const groups = [...chapters, { label: 'Can I use this?', pages: data.rules.pages }];
  const charGroup = { label: characters.label, pages: characters.pages };
  const guideSidebar = (file) => {
    const topics = groups.map(group => {
      const active = group.pages.some(p => p.file === file);
      const expanded = active && group.pages.length > 1;
      const current = active ? ` aria-current="${expanded ? 'location' : 'page'}"` : '';
      const children = expanded ? `<ol class="d-side-subpages" aria-label="${esc(group.label)} pages">${group.pages.map(p => `<li><a href="${esc(p.file)}"${p.file === file ? ' aria-current="page"' : ''}>${esc(label(p))}</a></li>`).join('')}</ol>` : '';
      return `<li><a href="${esc(group.pages[0].file)}"${current}>${group.num ? `${esc(group.num)} · ` : ''}${esc(group.label)}</a>${children}</li>`;
    }).join('');
    return `<aside class="d-side" aria-label="Field guide"><details class="d-guide" open><summary class="d-side-title">Field guide</summary><nav aria-label="Guide topics"><ol>${topics}</ol><p class="d-side-home"><a href="index.html#topics">Guide home</a></p></nav></details></aside>`;
  };
  const charSidebar = (file) => `<aside class="d-side" aria-label="Characters"><details class="d-guide" open><summary class="d-side-title">Characters</summary><nav aria-label="Characters pages"><ol>${characters.pages.map(p => `<li><a href="${esc(p.file)}"${p.file === file ? ' aria-current="page"' : ''}>${esc(label(p))}</a></li>`).join('')}</ol></nav></details></aside>`;
  const sidebar = (file) => characters.pages.some(p => p.file === file) ? charSidebar(file) : guideSidebar(file);
  const pageStrip = (file) => {
    const gi = groups.findIndex(group => group.pages.some(p => p.file === file));
    const inCharacters = gi < 0 && charGroup.pages.some(p => p.file === file);
    const group = inCharacters ? charGroup : groups[gi];
    if (!group || group.pages.length < 2) return '';
    const pi = group.pages.findIndex(p => p.file === file);
    const links = group.pages.map(p => p.file === file
      ? `<strong aria-current="page">${esc(label(p))}</strong>`
      : `<a href="${esc(p.file)}">${esc(label(p))}</a>`).join(' <span aria-hidden="true">·</span> ');
    // After the last topic, continue to the lookup; after the lookup, restart the guide. Characters has no next topic.
    const nextPage = group.pages[pi + 1];
    const nextGroup = inCharacters ? null : groups[(gi + 1) % groups.length];
    const next = nextPage
      ? ` <a class="d-page-next" href="${esc(nextPage.file)}">Next: ${esc(label(nextPage))} →</a>`
      : nextGroup ? ` <a class="d-page-next" href="${esc(nextGroup.pages[0].file)}">Next topic: ${esc(nextGroup.label)} →</a>` : '';
    return `<nav class="d-page-strip" aria-label="${esc(group.label)} pages"><span class="d-page-count d-sr-only">Page ${pi + 1} of ${group.pages.length}:</span> ${links}${next}</nav>`;
  };

  // Homepage: title banner, then the seven topics, then search, within Start here.
  const h = data.home;
  const tiles = chapters.map((c) => `<a class="d-chapter" href="${esc(c.pages[0].file)}"><span class="d-chapter-num">${esc(c.num)}</span><span class="d-chapter-label">${esc(c.label)}</span><h3>${esc(c.headline)}</h3>${svg(c.icon)}</a>`).join('');
  pages.set('index.html', shell({
    file: 'index.html',
    title: 'The North is better together',
    description: 'Compare single player with co-op, and vanilla with our mods.',
    body: `<section class="hero d-hero"><div class="hero-inner"><div class="hero-copy"><h1>${esc(h.titleBefore)} <em>${esc(h.titleAccent)}</em></h1></div></div></section>
<div class="d-page">${trailerEmbed}${releaseNote(h.release)}${audioBar(h.audio)}
<section aria-labelledby="topics"><div class="d-chapters-head"><h2 id="topics">${esc(h.chaptersTitle)}</h2><div class="d-home-links"><p class="d-home-audio">Prefer to listen? <a href="audio-guide.html">Audio guide</a></p></div></div><div class="d-chapters">${tiles}</div>${searchForm('home-search')}</section>${audioTranscript(h.audio)}</div>${h.audio ? `<script>${audioScript}</script>` : ''}`
  }));

  // Our purpose: six orders as plain grids. Vote: rank, code, and count up to four codes. Both stay in the browser.
  const purposeBody = () => {
    const overview = grid({ id: 'orders', title: 'The six orders', note: purpose.overviewNote, columns: ['Order', 'Kind', 'The idea'],
      rows: purpose.orders.map((o) => [{ text: o.name, href: `#order-${o.id}` }, o.kind, o.idea]) }, 'Our purpose');
    const sections = purpose.orders.map((o) => grid({ id: `order-${o.id}`, title: o.name, columns: ['Part', 'In this order'], rows: [
      ['Long goal', o.goal],
      ...o.rules.map((r, i) => [`House rule ${i + 1}`, r]),
      ...o.roles.map((r, i) => [purpose.roleLabels[i], r])
    ] }, 'Our purpose')).join('\n');
    return { html: `${purpose.lead.map((line, i) => `<p class="d-lead">${esc(line)}${i === 0 ? ' Read all six, then <a href="vote.html">vote</a>.' : ''}</p>`).join('')}
${overview}
${sections}` };
  };
  const voteBody = () => {
    const options = `<option value="">Pick</option>${purpose.orders.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}`;
    const rows = purpose.orders.map((o) => `<tr><th scope="row"><a href="purpose.html#order-${o.id}">${esc(o.name)}</a></th><td data-label="Your number"><label class="d-sr-only" for="rank-${o.letter}">Your number for ${esc(o.name)}</label><select id="rank-${o.letter}" name="rank-${o.letter}">${options}</select></td></tr>`).join('\n');
    const orderData = JSON.stringify(purpose.orders.map((o) => ({ letter: o.letter, name: o.name }))).replace(/</g, '\\u003c');
    return { html: `<div class="d-vote">
<p class="d-lead">Give each order a number. 1 is your favorite. Each number is used once.</p>
<p class="d-vote-note">Nothing leaves your browser. This device keeps only your own ranking.</p>
<noscript><p class="d-vote-note">Voting needs JavaScript. Without it, tell the group your order in chat.</p></noscript>
<section class="d-section" aria-labelledby="vote-rank-title"><h2 id="vote-rank-title">Your ranking</h2>
<form id="vote-rank" onsubmit="return false"><div class="d-wrap"><table class="d-grid"><thead><tr><th scope="col">Order</th><th scope="col">Your number</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<div class="d-vote-code"><label for="vote-code">Your code</label><input type="text" id="vote-code" readonly autocomplete="off" spellcheck="false" placeholder="Rank all six first"><button type="button" class="d-linkbtn" id="vote-copy" disabled>Copy code</button><button type="button" class="d-linkbtn" id="vote-clear">Clear my ranking</button></div>
<p class="d-vote-note" id="vote-code-status" role="status" aria-live="polite"></p><p class="d-vote-note" id="vote-your-order"></p></form></section>
<section class="d-section" aria-labelledby="vote-count-title"><h2 id="vote-count-title">Count the codes</h2>
<p class="d-vote-note">Paste up to four codes from the group chat. The count shows round by round. A tie is settled by a coin flip or a group gut pick.</p>
<label for="vote-paste">Pasted codes</label><textarea id="vote-paste" autocomplete="off" spellcheck="false" placeholder="V1-ABCDEF-0"></textarea>
<div id="vote-result" role="status" aria-live="polite"></div></section>
<script type="application/json" id="vote-orders">${orderData}</script>
</div>`, script: `<script>${voteCore}</script><script>${voteScript}</script>` };
  };

  // absol89's list: the whole community list as one table. Rows load from absol-list.json; search, filters and sorting run in the browser.
  const absolBody = () => {
    const keyRows = [
      ['Fit', 'Looks right for us. It still needs a co-op test. Not installed.'],
      ['Maybe', 'No co-op proof either way. Not installed.'],
      ['Avoid', 'A known problem. Do not use it.'],
      ['Earn-it candidate', 'A mod that could make rewards feel earned: levels, loot or standing.']
    ].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td data-label="Means">${esc(v)}</td></tr>`).join('\n');
    const columns = [['name', 'Mod'], ['id', 'Nexus id'], ['category', 'Category'], ['adds', 'What it adds'], ['ours', 'In our game?'], ['reason', 'Why we are not using it'], ['earn', 'Earn-it candidate?']];
    const head = columns.map(([key, label]) => `<th scope="col" data-sort="${key}" aria-sort="none"><button type="button" class="d-sort">${esc(label)}</button></th>`).join('');
    return { html: `<p class="d-lead">absol89 wrote a big Skyrim Together mod list. This page shows all ${absolCount} mods on it.</p>
<p class="d-lead">It was built for a different game version. Most of it does not fit our setup.</p>
<p class="d-lead">Only rows marked <strong>In our game</strong> are in our pack. No other row is installed. Nothing is recommended unless the row says Fit.</p>
<p class="d-lead">Our revision 7 pack has ${byId.get('mods').rows.length} mods. ${absolOurs} of them are on this list. The rest are not on absol89's list.</p>
<p class="d-lead">Being on absol89's list means the mod was in his pack, built for game version 1.6.1170; it does not prove it works in co-op or on our game version.</p>
<section class="d-section d-key" aria-labelledby="absol-key-title"><h2 id="absol-key-title">How to read it</h2>
<div class="d-wrap"><table class="d-grid"><thead><tr><th scope="col">Word</th><th scope="col">Means</th></tr></thead><tbody>
${keyRows}
</tbody></table></div>
<p class="d-vote-note">Rows that say Candidate are earn-it mods we looked at but have not rated.</p></section>
<section class="d-section" id="absol" aria-busy="true" aria-labelledby="absol-list-title"><h2 id="absol-list-title">The list</h2>
<form class="d-absol-controls" role="search" onsubmit="return false">
<label class="d-sr-only" for="absol-q">Search the list</label><input type="search" id="absol-q" placeholder="Search by name, id or words" autocomplete="off">
<label class="d-sr-only" for="absol-cat">Category</label><select id="absol-cat"><option value="">All categories</option></select>
<label class="d-absol-check"><input type="checkbox" id="absol-ours">In our game</label>
<label class="d-absol-check"><input type="checkbox" id="absol-earn">Earn-it candidate</label>
<button type="button" class="d-linkbtn" id="absol-clear">Clear filters</button>
</form>
<p id="absol-status" role="status" aria-live="polite">Loading the list…</p>
<noscript><p class="d-vote-note">The list needs JavaScript to show here. Without it, ask the host for the list.</p></noscript>
<div class="d-absol-scroll" tabindex="0" role="region" aria-label="absol89's list. This table scrolls sideways.">
<table class="d-absol"><caption class="d-sr-only">absol89's list of ${absolCount} Skyrim Together mods</caption><thead><tr>${head}</tr></thead><tbody id="absol-body"></tbody></table></div>
<p class="d-vote-note">List by absol89. Each mod name opens its Nexus Mods page.</p></section>`, script: `<script>${absolScript}</script>` };
  };

  // Topic subpages: expanded guide, page strip (narrow screens only) and the bottom pager.
  const topicPage = (p, eyebrow, pager) => {
    const side = sidebar(p.file);
    if (p.kind === 'purpose' || p.kind === 'vote' || p.kind === 'absol') {
      const custom = p.kind === 'purpose' ? purposeBody() : p.kind === 'absol' ? absolBody() : voteBody();
      pages.set(p.file, shell({
        file: p.file,
        title: p.title,
        description: p.kind === 'absol' ? `absol89's list of ${absolCount} Skyrim Together mods, with search and filters. Only rows marked In our game are in our pack.` : p.kind === 'purpose' ? 'Six ways our party could play the campaign, with house rules and a place for every role.' : 'Rank the six orders, get a short code, and count up to four codes. Nothing leaves your browser.',
        body: `<div class="d-layout">${side}<div class="d-page"><p class="eyebrow">${eyebrow}</p><h1>${esc(p.title)}</h1>${pageStrip(p.file)}
${custom.html}
${pager}</div></div>${custom.script ?? ''}`
      }));
      return;
    }
    // Extra voiced clips on a content page use the Audio guide's boxed player. Each keeps its transcript on the same page.
    // A grids entry of {"clip": "<id>"} places that clip's box at that point (a divider between grids); clips not placed come last.
    // "Listen n of N" counts the clips in the order they appear on the page.
    const placedClips = (p.grids ?? []).filter((g) => g && typeof g === 'object' && g.clip).map((g) => g.clip);
    for (const id of placedClips) if (!(p.clips ?? []).some((clip) => clip.id === id)) throw new Error(`Version D: ${p.file} places an unknown clip ${id}`);
    const clipsInOrder = [...placedClips.map((id) => p.clips.find((clip) => clip.id === id)), ...(p.clips ?? []).filter((clip) => !placedClips.includes(clip.id))];
    const clipBox = (clip) => `<section class="d-episode" id="${clip.id}" aria-labelledby="${clip.id}-title">
<p class="d-episode-kicker">Listen ${clipsInOrder.indexOf(clip) + 1} of ${clipsInOrder.length} · ${episodeTime(clip.duration)}</p>
<h2 id="${clip.id}-title">${esc(clip.title)}</h2>
<p class="d-episode-summary">${esc(clip.summary)}</p>
${episodePlayer(clip)}
${audioTranscript({ transcriptAnchor: `${clip.id}-transcript`, title: clip.title, transcript: clip.transcript })}
</section>`;
    const clipBoxes = clipsInOrder.filter((clip) => !placedClips.includes(clip.id)).map(clipBox).join('\n');
    pages.set(p.file, shell({
      file: p.file,
      title: p.title,
      description: p.description ?? `${p.title}: comparisons for our Skyrim Together campaign.`,
      body: `<div class="d-layout">${side}<div class="d-page"><p class="eyebrow">${eyebrow}</p><h1>${esc(p.title)}</h1>${pageStrip(p.file)}${listenLinks(p.file)}${releaseNote(p.release)}${p.seeAlso ? `<p class="d-lead">${esc(p.seeAlso.lead)} <a href="${esc(p.seeAlso.href)}">${esc(p.seeAlso.text)}</a></p>` : ''}
${audioBar(p.audio)}
${textBlocks(p.before)}
${p.lead ? `<p class="d-lead">${cell(p.lead)}</p>` : ''}
${stepList(p.steps)}
${p.grids.map((g) => g.clip ? clipBox(p.clips.find((clip) => clip.id === g.clip)) : grid(resolve(g), p.title)).join('\n')}
${textBlocks(p.after)}
${clipBoxes}
${audioTranscript(p.audio)}
${sources(p.sources)}
${pager}</div></div>${p.audio || p.clips?.length ? `<script>${audioScript}</script>` : ''}`
    }));
  };
  chapters.forEach((c, ci) => {
    c.pages.forEach((p, pi) => {
      const prevChapter = ci > 0 ? chapters[ci - 1] : null;
      const prev = pi > 0
        ? `<a href="${esc(c.pages[pi - 1].file)}">← Previous page: ${esc(label(c.pages[pi - 1]))}</a>`
        : prevChapter
          ? `<a href="${esc(prevChapter.pages[prevChapter.pages.length - 1].file)}">← ${esc(prevChapter.num)} ${esc(prevChapter.label)}</a>`
          : '';
      const next = pi < c.pages.length - 1
        ? `<a class="d-next" href="${esc(c.pages[pi + 1].file)}">Next page: ${esc(label(c.pages[pi + 1]))} →</a>`
        : ci < chapters.length - 1
          ? `<a class="d-next" href="${esc(chapters[ci + 1].pages[0].file)}">${esc(chapters[ci + 1].num)} ${esc(chapters[ci + 1].label)} →</a>`
          : `<a class="d-next" href="index.html#topics">Back to the guide →</a>`;
      topicPage(p, `${esc(c.num)} · ${esc(c.label)}`, `<nav class="d-pager" aria-label="Guide progress">${prev}${next}</nav>`);
    });
  });

  // Characters: its own section. Each page renders from its own source (see below), the roster as an ordinary grid page.
  const charPager = (pi) => {
    const prev = pi > 0 ? `<a href="${esc(characters.pages[pi - 1].file)}">← Previous page: ${esc(label(characters.pages[pi - 1]))}</a>` : '';
    const next = pi < characters.pages.length - 1
      ? `<a class="d-next" href="${esc(characters.pages[pi + 1].file)}">Next page: ${esc(label(characters.pages[pi + 1]))} →</a>`
      : `<a class="d-next" href="index.html#topics">Back to the guide →</a>`;
    return `<nav class="d-pager" aria-label="Characters progress">${prev}${next}</nav>`;
  };
  characters.pages.forEach((p, pi) => {
    if (p.kind === 'vigilant') return;
    topicPage(p, esc(characters.label), charPager(pi));
  });
  if (!characters.pages.some((p) => p.file === 'ledger.html')) throw new Error('Version D: the roster (ledger.html) must belong to Characters');

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
  const rulesRelease = data.rules.pages.find(p => p.file === 'rules.html')?.release;
  pages.set('rules.html', shell({
    file: 'rules.html',
    title: 'Can I use this?',
    description: 'Check whether a spell, perk, power or mod is okay to use in our campaign.',
    body: `<div class="d-layout">${sidebar('rules.html')}<div class="d-page">${lookup}
${releaseNote(rulesRelease)}${audioBar(rulesAudio)}
${ruleGrid(entries, { search: true })}
<section class="d-section" aria-labelledby="key"><h2 id="key">What the statuses mean</h2><div class="d-wrap"><table class="d-grid cols-3"><thead><tr><th scope="col">Status</th><th scope="col">How many</th><th scope="col">Means</th></tr></thead><tbody>${keyRows}</tbody></table></div></section>
${audioTranscript(rulesAudio)}</div></div>${rulesAudio ? `<script>${audioScript}</script>` : ''}`
  }));
  for (const p of data.rules.pages.filter(p => p.categories)) {
    const list = entries.filter(e => p.categories.includes(e.category));
    pages.set(p.file, shell({
      file: p.file, title: p.title, description: `${p.title}: what you can use in our campaign.`,
      body: `<div class="d-layout">${sidebar(p.file)}<div class="d-page"><p class="eyebrow">Can I use this?</p><h1>${esc(p.title)}</h1>${pageStrip(p.file)}${listenLinks(p.file)}${releaseNote(p.release)}${audioBar(p.audio)}${ruleGrid(list)}${audioTranscript(p.audio)}</div></div>${p.audio ? `<script>${audioScript}</script>` : ''}`
    }));
  }

  // Audio guide: one boxed segment per episode. Related pages open in a new tab so the audio keeps playing.
  const totalSeconds = guide.episodes.reduce((sum, ep) => sum + ep.duration, 0);
  const episodeBoxes = guide.episodes.map((ep) => {
    const related = ep.related.map((file) => listenLink(file, '', esc(pageTitles.get(file)))).join(' · ');
    return `<section class="d-episode" id="${ep.id}" aria-labelledby="${ep.id}-title">
<p class="d-episode-kicker">Episode ${ep.number} of ${guide.episodes.length} · ${episodeTime(ep.duration)}</p>
<h2 id="${ep.id}-title">${esc(ep.title)}</h2>
<p class="d-episode-summary">${esc(ep.summary)}</p>
${episodePlayer(ep)}
<p class="d-episode-related">Related pages (each opens in a new tab): ${related}</p>
${audioTranscript({ transcriptAnchor: `${ep.id}-transcript`, title: ep.title, transcript: ep.transcript })}
</section>`;
  }).join('\n');
  pages.set('audio-guide.html', shell({
    file: 'audio-guide.html',
    title: guide.title,
    description: 'Twelve short listens about our Skyrim Together setup, with a transcript for each.',
    body: `<div class="d-page"><h1>${esc(guide.title)}</h1>
<p class="d-guide-intro">${esc(guide.recordedFor)} ${audioTime(Math.round(totalSeconds))} in all. Links to related pages open in a new tab, so the audio keeps playing. This page remembers where you stopped in each episode on this device, if your browser allows it.</p>
<p class="d-guide-gap">${esc(guide.gap)}</p>
<nav class="d-jump" aria-label="Episodes"><span>Jump to episode:</span>${guide.episodes.map((ep) => `<a href="#${ep.id}" aria-label="Episode ${ep.number}: ${esc(ep.title)}">${ep.number}</a>`).join('')}</nav>
${episodeBoxes}</div><script>${audioScript}</script>`
  }));

  // Kyle's character: the first page of Characters (its own sidebar, strip and pager). Lore builds also links to it.
  if (vigilant.file !== characters.pages[0].file || vigilant.title !== characters.pages[0].title) throw new Error('Version D: the owner page must be the first Characters page');
  const figure = (cls, file, size, alt, caption, { id = '', extra = '', lazy = false } = {}) => `<figure class="d-figure ${cls}"${id ? ` id="${id}"` : ''}><img src="assets/${file}" width="${size[0]}" height="${size[1]}" alt="${esc(alt)}" decoding="async"${lazy ? ' loading="lazy"' : ''}><figcaption>${esc(caption)}</figcaption>${extra}</figure>`;
  const vigilantFigures = {
    screenshot: figure('d-shot', 'skyrim-vigilant-screenshot.webp', [1024, 572], 'A hooded man in a tan tabard over chain mail, holding a mace and a round shield, on a snowy cobbled road in front of a wooden house, with snowy mountains behind.', 'In-game screenshot from The Elder Scrolls V: Skyrim (Bethesda). Chosen by Kyle as the look for his character. Original source not found. The armor looks like a mod’s, not the base game’s robes. We do not know which mod.', { id: 'look' }),
    emblem: figure('d-emblem', 'stendarr-emblem.svg', [140, 140], 'A mace in front of a shield, under five short rays of light, inside a double ring.', "Emblem: an original drawing made for this page. It is not Stendarr's official symbol and uses no game art."),
    map: figure('d-map', 'shrine-map.svg', [640, 580], "A north-up plot of Helgen, Riverwood, Whiterun, Rorikstead, Falkreath and Bleak Falls Barrow. The Two Pillars shrine is marked 23 cells from Helgen. Edge labels give the distance to the Hall of the Vigilant, Fort Greenwall, Stendarr's Beacon and the Solitude temple.", 'Map: an original drawing, plotted from the game location data in our install. The grid above gives the same distances.', { lazy: true })
  };
  const callouts = (c) => `<section class="d-callouts" id="${esc(c.id)}" aria-labelledby="${esc(c.id)}-title"><h2 id="${esc(c.id)}-title">${esc(c.title)}</h2>${c.items.map((item) => `<aside class="d-callout"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><p class="d-callout-src">Source: ${cell(item.source)}</p></aside>`).join('')}</section>`;
  // The card is text only: the owner dislikes the drawn card picture. The name slot stays open.
  const cardText = () => `<section class="d-section d-card-text" id="card" aria-labelledby="card-title"><h2 id="card-title">Character card</h2><p>Name: [NAME], left open.</p>${vigilant.card.text.map((line) => `<p>${esc(line)}</p>`).join('')}</section>`;
  const vigilantItem = (item) => item.cardText ? cardText() : item.figure ? vigilantFigures[item.figure] : item.callouts ? callouts(item.callouts) : item.paragraphs ? item.paragraphs.map((line) => `<p class="d-plain-note">${cell(line)}</p>`).join('') : grid(item, vigilant.title) + (item.id === 'shrines' ? `\n${vigilantFigures.map}` : '');
  const vigilantJump = `<nav class="d-jump" aria-label="On this page"><span>On this page:</span>${vigilant.jump.map(([id, label]) => `<a href="#${esc(id)}">${esc(label)}</a>`).join('')}</nav>`;
  pages.set(vigilant.file, shell({
    file: vigilant.file,
    title: vigilant.title,
    description: vigilant.description,
    body: `<div class="d-layout">${sidebar(vigilant.file)}<div class="d-page"><p class="eyebrow">${esc(vigilant.eyebrow)}</p><h1>${esc(vigilant.title)}</h1>${pageStrip(vigilant.file)}
${vigilant.lead.map((line) => `<p class="d-lead">${esc(line)}</p>`).join('')}
${vigilantJump}
${vigilant.grids.map(vigilantItem).join('\n')}
${charPager(0)}</div></div>`
  }));

  pages.set('404.html', shell({
    file: '404.html',
    title: 'Page not found',
    description: 'This page does not exist.',
    body: `<div class="d-layout">${sidebar('404.html')}<div class="d-page"><h1>Page not found</h1>${grid({ id: 'try', title: 'Try one of these', columns: ['Go to', 'What it is'], rows: [[{ text: 'The field guide', href: 'index.html#topics' }, 'Eight topics, start to finish'], [{ text: 'Can I use this?', href: 'rules.html' }, 'Check a spell, perk, power or mod'], [{ text: 'Joining a session', href: 'join.html' }, 'How to join a session']] })}</div></div>`
  }));

  pages.set('assets/d.css', css);
  pages.set('absol-list.json', absolData);
  pages.set('assets/d.js', await readFile(path.join(root, 'scripts/lib/v4-browser.js'), 'utf8'));
  return pages;
}
