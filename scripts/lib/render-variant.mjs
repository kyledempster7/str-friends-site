import { readFile } from 'node:fs/promises';
import path from 'node:path';

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attrId = value => value ? ` id="${esc(value)}"` : '';
const icons = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  moon:'<path d="M20 15.5A8.7 8.7 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>',
  mountain:'<path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m6.5 11.5 2.5 2 2.5-2"/>',
  book:'<path d="M12 6v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Z"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  exit:'<path d="M9 4H4v16h5m5-13 5 5-5 5M8 12h11"/>',
  door:'<path d="M4 4h10v16H4zM14 12h7m-4-3 3 3-3 3"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  helm:'<path d="M5 18V9a7 7 0 0 1 14 0v9l-7 3-7-3ZM5 10l5 3v4m9-7-5 3v4M12 2v8"/>',
  chest:'<path d="M3 9h18v11H3zM3 9l2-4h14l2 4M10 13h4v3h-4z"/>',
  skills:'<path d="M6 3v18M12 3v18M18 3v18M4 8h4m2 7h4m2-9h4"/>',
  star:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  tent:'<path d="m3 21 9-17 9 17H3Zm9-17v17m-5 0 5-9 5 9"/>',
  house:'<path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7"/>',
  shield:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Zm0 4v12"/>',
  healer:'<circle cx="10" cy="8" r="3"/><path d="M10 2V1m0 13v7M4 8H2m16 0h-2M5 3 4 2m11 1 1-1M6 12l-2 2m10-2 2 2M7 18h6"/>',
  greatsword:'<path d="m15 3 6-1-1 6-10 10-5-5L15 3ZM3 12l9 9M5 17l-3 3 2 2 3-3"/>',
  bow:'<path d="M6 2c14 4 14 16 0 20L6 2Zm0 0 6 10-6 10M2 12h19m-3-3 3 3-3 3"/>',
  wizard:'<path d="m15 2 1.5 4.5L21 8l-4.5 1.5L15 14l-1.5-4.5L9 8l4.5-1.5L15 2ZM11 12 4 22m-1-5 5 3"/>',
  gravewarden:'<path d="M9 4V2h6v2M8 7l-3 3v10h14V10l-3-3H8ZM9 7V4h6v3"/><path d="M9 14a3 3 0 1 1 6 0v2h-1v2h-4v-2H9v-2Zm1 0h.1m3.9 0h.1"/>',
  mask:'<path d="M3 4c6 3 12 3 18 0v8c0 5-9 10-9 10S3 17 3 12V4Zm3 6 4 1m4 0 4-1m-10 6q4-3 8 0"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const labels = {allowed:'Allowed',conditional:'Conditional',hold:'Hold — do not use',blocked:'Blocked'};
const chip = status => labels[status] ? `<span class="status status-${esc(status)}">${labels[status]}</span>` : '';
const list = (items = [], ordered = false, id = '') => `<${ordered ? 'ol' : 'ul'}${attrId(id)}>${items.map(item => `<li>${esc(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const arrow = icon('arrow');
const chapterEmblems = ['compass','skills','star','moon','people','tent','house'];
const chapterIds = ['together','skills','spells','tonight','builds','party','ownership'];

function url(value) {
  if (typeof value !== 'string') throw new Error('Link URL must be a string');
  if (/^https:\/\//.test(value)) return esc(value);
  if (/^(?:[a-z0-9-]+\.html)?(?:#[a-z0-9-]+)?$/.test(value) && value) return esc(value);
  throw new Error(`Unsupported content link: ${value}`);
}

export async function renderVariant({root,variant,originals}) {
  const isB = variant === 'v2b';
  const read = async filename => JSON.parse((await readFile(path.join(root, 'src/variants', variant, 'content', filename + '.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const [rules,play,catalog,home] = await Promise.all(['rules','play','catalog','home'].map(read));
  const sections = [...rules.sections,...play.sections];
  const byId = new Map(sections.map(section => [section.id,section]));
  const pages = new Map();

  function renderBlocks(blocks = []) {
    return blocks.map((block, bi) => {
      const id = attrId(block.id);
      if (block.type === 'text') return `<p${id}>${esc(block.text)}</p>`;
      if (block.type === 'list') return list(block.items,block.ordered,block.id);
      if (block.type === 'callout') return `<aside class="callout tone-${['urgent','hold','note'].includes(block.tone) ? block.tone : 'note'}"${id}>${block.title ? `<h2>${esc(block.title)}</h2>` : ''}${block.text ? `<p>${esc(block.text)}</p>` : ''}${block.items?.length ? list(block.items) : ''}</aside>`;
      if (block.type === 'cards') return `<div class="content-cards"${id}>${block.items.map((item, i) => `<section class="content-card"${attrId(item.id)}>${isB && item.icon ? icon(item.icon,'card-art') : ''}<h2>${esc(item.title)}</h2>${item.text ? `<p>${esc(item.text)}</p>` : ''}${item.items?.length ? list(item.items) : ''}${chip(item.status)}</section>`).join('')}</div>`;
      if (block.type === 'steps') return `<section class="procedure"${id}>${block.title ? `<h2>${esc(block.title)}</h2>` : ''}<ol class="steps-strip">${block.items.map((item,i) => `<li><span class="step-number" aria-hidden="true">${i+1}</span><p>${esc(typeof item === 'string' ? item : item.text)}</p></li>`).join('')}</ol></section>`;
      if (block.type === 'comparison') return `<section class="comparison-section"${id}>${block.title ? `<h2>${esc(block.title)}</h2>` : ''}<div class="comparison-grid" role="table" aria-label="${esc(block.title || block.columns.join(', '))}"><div class="comparison-row comparison-head" role="row">${block.columns.map(column=>`<div role="columnheader">${esc(column)}</div>`).join('')}</div>${block.rows.map(row=>`<div class="comparison-row" role="row">${row.map((cell,i)=>i===0 ? `<div role="rowheader">${esc(cell)}</div>` : `<div role="cell"><span class="comparison-label" aria-hidden="true">${esc(block.columns[i])}</span><p>${esc(cell)}</p></div>`).join('')}</div>`).join('')}</div></section>`;
      if (block.type === 'table') return `<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table: ${esc(block.columns.join(', '))}"${id}><table><thead><tr>${block.columns.map(column=>`<th scope="col">${esc(column)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row=>`<tr>${row.map((cell,i)=>i===0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      if (block.type === 'links') {
        const links = `<ul>${block.items.map(item=>`<li><a href="${url(item.url)}" rel="noreferrer">${esc(item.label)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`;
        return isB ? `<details class="source-links"${id}><summary>Read at the source</summary>${links}</details>` : `<nav class="source-links" aria-label="Sources ${bi+1}"${id}><span class="eyebrow">Read at the source</span>${links}</nav>`;
      }
      throw new Error(`Unsupported variant block ${block.type}`);
    }).join('\n');
  }

  function quickAnswers(section) {
    if (!isB || !section.quickAnswers?.length) return '';
    if (section.quickAnswers.some(item => !item.href)) throw new Error(`Quick-answer target missing in ${section.id}`);
    return `<div class="quick-answers" aria-label="Quick answers">${section.quickAnswers.map(item => `<${item.href ? 'a' : 'div'} class="quick-tile"${item.href ? ` href="${url(item.href)}"` : ''}><span class="quick-key">${item.icon ? icon(item.icon,'tile-emblem') : esc(item.label)}</span><p>${esc(item.text)}</p>${chip(item.status)}</${item.href ? 'a' : 'div'}>`).join('')}</div>`;
  }

  function exitCard(standalone=false) {
    const section = byId.get('leave-now');
    if (!section) throw new Error('Missing quick-exit content');
    const heading = standalone ? 'h1' : 'h2';
    return `<section class="exit-card" id="leave-now" tabindex="-1" aria-labelledby="exit-title"><div class="exit-heading">${icon('exit')}<span class="eyebrow">${esc(section.eyebrow)}</span></div><${heading} id="exit-title">${esc(section.title)}</${heading}><div class="exit-copy">${renderBlocks(section.blocks)}</div></section>`;
  }

  function shell(filename,main) {
    let html = originals.get(filename)?.toString('utf8');
    if (!html) throw new Error(`No frozen shell for ${filename}`);
    html = html.replace(/<main id="main" tabindex="-1">[\s\S]*?<\/main>/,`<main id="main" tabindex="-1">${main}</main>`);
    html = html.replace('href="#leave-now"', 'href="tonight.html#leave-now"');
    html = html.replace(/<body class="([^"]+)"/,`<body class="$1 variant-${variant}"`);
    html = html.replace('aria-label="Fellowship, home"','aria-label="Fellowship, a Skyrim Together field guide, home"');
    const switcher = `<nav class="version-switcher" aria-label="Site version"><span>Version:</span>${[['v1','v1'],['v2a','A'],['v2b','B']].map(([folder,label])=>`<a href="../${folder}/${filename}"${folder===variant ? ' aria-current="true"' : ''}>${label}</a>`).join('<span aria-hidden="true">·</span>')}</nav>`;
    html = html.replace(/(<div class="footer-bottom"><p>[\s\S]*?<\/p>)/,`$1${switcher}`);
    if (filename==='404.html') html=html.replace('https://kyledempster7.github.io/str-friends-site/','https://kyledempster7.github.io/str-friends-site/'+variant+'/');
    return html;
  }

  function homePage() {
    const routes=home.routes;
    const story=home.story;
    const guide=home.guide;
    const sectionHeading = (data,id) => `<div class="section-heading"><div><p class="eyebrow">${esc(data.eyebrow)}</p><h2 id="${id}">${esc(data.title)}</h2></div>${data.text ? `<p>${esc(data.text)}</p>` : ''}</div>`;
    const title=esc(home.hero.title).replace('The North is ','The North is<br>').replace('together.','<span class="hero-emphasis">together.</span>');
    const hero=`<section class="hero"><div class="hero-inner"><div class="hero-copy"><p class="eyebrow"><span class="tiny-diamond" aria-hidden="true">◆</span> ${esc(home.hero.eyebrow)}</p><h1>${title}</h1><p class="hero-intro">${esc(home.hero.intro)}</p><div class="hero-actions"><a class="button" href="tonight.html#join">${esc(home.hero.buttonLabel || "Join tonight's game")} ${arrow}</a></div></div>${isB ? '<img class="campfire-art" src="assets/campfire.svg" width="500" height="400" alt="Four companions gathered around a campfire beneath a winter moon">' : ''}</div>${isB ? '' : '<div class="hero-caption"><span aria-hidden="true">——</span> The road is long. Bring good company.</div>'}</section>`;
    const routesMarkup=`<section class="section routes-section" aria-labelledby="routes-title">${sectionHeading(routes,'routes-title')}<div class="route-grid${isB ? ' question-grid' : ''}">${routes.items.map((item,i)=>`<a class="route-card" href="${url(item.href)}">${icon(item.icon || chapterEmblems[i])}<span class="route-number">${esc(item.eyebrow)}</span><h3>${esc(item.title)}</h3>${item.text ? `<p>${esc(item.text)}</p>` : ''}<span class="route-cta">${esc(item.cta)} ${arrow}</span></a>`).join('')}</div></section>`;
    const lookup=`<section class="lookup-banner" aria-labelledby="lookup-title"><div class="lookup-icon">${icon('search')}</div><div><p class="eyebrow">${esc(home.lookup.eyebrow)}</p><h2 id="lookup-title">${esc(home.lookup.title)}</h2><p>${esc(home.lookup.text)}</p></div>${isB ? `<form class="home-search" action="rules.html" method="get" role="search"><label class="sr-only" for="home-query">Spell, perk, power or mod</label><input id="home-query" type="search" name="q" placeholder="${esc(home.lookup.placeholder || 'Strong Reflexes or Ghostwalk')}" required><button class="button" type="submit">${esc(home.lookup.buttonLabel || 'Check')} ${arrow}</button></form>` : `<a class="button secondary" href="rules.html">${esc(home.lookup.buttonLabel || 'Check the rules')} ${arrow}</a>`}</section>`;
    const storyMarkup=`<section class="section story-section" aria-labelledby="story-title">${sectionHeading(story,'story-title')}<div class="story-grid">${story.items.map((item,i)=>`<article class="${i===0 ? 'story-card' : 'ledger-card'}"><span class="eyebrow">${esc(item.eyebrow)}</span>${i===0 ? icon('book','story-symbol') : ''}<h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><a class="text-link" href="${url(item.href)}">${esc(item.cta)} ${arrow}</a>${!isB && i===1 ? `<div class="ledger-motif" aria-hidden="true">${icon('people')}<span>CHARACTERS · PROMISES · POSSIBILITIES</span></div>` : ''}</article>`).join('')}</div></section>`;
    const guideMarkup=`<section class="section guide-section" id="guide" aria-labelledby="guide-title">${sectionHeading(guide,'guide-title')}<div class="${isB ? 'chapter-grid' : 'guide-list'}">${guide.items.map((item,i)=>`<a class="${isB ? 'chapter-tile' : 'guide-row'}" href="${url(`${item.id}.html`)}"><span class="chapter-number">0${i+1}</span><div><span class="guide-label">${esc(item.label)}</span><h3>${esc(item.title)}</h3>${!isB && item.text ? `<p>${esc(item.text)}</p>` : ''}</div>${isB ? icon(chapterEmblems[i],'tile-emblem') : arrow}</a>`).join('')}</div></section>`;
    return hero+routesMarkup+lookup+(isB ? guideMarkup+storyMarkup : storyMarkup+guideMarkup);
  }

  function catalogMarkup() {
    const frozen=originals.get('rules.html').toString('utf8');
    const cards=[...frozen.matchAll(/<article class="rule-card"[\s\S]*?<\/article>/g)].map(match=>match[0]);
    if (cards.length !==116 || catalog.entries.length!==116) throw new Error('Expected the full adopted catalog');
    const legend=isB ? `<div class="rules-legend" aria-label="Rule statuses">${[['allowed','Within stated limits'],['conditional','Conditions apply'],['hold','Do not use'],['blocked','Outside our setup']].map(([status,text])=>`<div>${chip(status)}<p>${text}</p></div>`).join('')}</div>` : '';
    return `<section class="catalog" aria-label="Campaign rules catalog"><div class="search-panel" data-search-controls hidden><form class="search-form" role="search"><label for="rule-search">Find a spell, perk, race, or mod</label><div class="search-input-wrap">${icon('search')}<input type="search" id="rule-search" name="q" placeholder="Strong Reflexes or Ghostwalk" autocomplete="off" spellcheck="false" aria-describedby="search-help"></div><p id="search-help">Match the name and mod.</p></form><div class="filter-group" role="group" aria-label="Filter by rule status">${[['all','All rules'],['allowed','Allowed'],['conditional','Conditional'],['hold','On hold'],['blocked','Blocked']].map(([value,label])=>`<button type="button" data-filter="${value}" aria-pressed="${value==='all'}">${label}</button>`).join('')}</div><p class="result-count" role="status" aria-live="polite" aria-atomic="true" data-result-count>116 rules</p></div><noscript><p class="callout">All rules appear below. Use your browser’s Find command.</p></noscript>${legend}<div class="no-results callout tone-hold" data-no-results hidden><h2>No matching rule — unverified</h2><p>Unlisted means unverified. Check spelling and mod; ask before using.</p><button type="button" class="button secondary" data-clear-search>Show all rules</button></div><div class="rule-list">${cards.join('')}</div></section>`;
  }

  function nav(current) {
    return `<aside class="chapter-nav"><span class="eyebrow">The field guide</span><nav aria-label="Guide chapters">${home.guide.items.map((item,i)=>`<a href="${item.id}.html"${current===item.id ? ' aria-current="page"' : ''}><span aria-hidden="true">0${i+1}</span>${esc(item.label)}</a>`).join('')}<a href="rules.html"${current==='rules' ? ' aria-current="page"' : ''}>${icon('search')}Can I use this?</a></nav></aside>`;
  }

  function chapter(section) {
    const index=chapterIds.indexOf(section.id);
    const hasExit=!isB || section.id==='tonight';
    const next=index>=0 ? home.guide.items[(index+1)%7] : null;
    let content=renderBlocks(section.blocks);
    if (section.id==='rules') content=catalogMarkup()+`<div class="catalog-explainer">${renderBlocks(section.blocks)}</div>`;
    const heading=`<div class="page-heading"><a class="breadcrumb" href="index.html">${icon('arrow')} Back to the campfire</a><p class="eyebrow">${esc(section.eyebrow)}</p><h1>${esc(section.title)}</h1>${section.intro ? `<p class="page-intro">${esc(section.intro)}</p>` : ''}${isB ? `<div class="horizon horizon-${index+1}" aria-hidden="true"></div>` : ''}</div>`;
    let artwork='';
    if (isB && section.id==='chronicle') artwork=`<figure class="unlit campfire-empty">${originals.get('campfire-inline')?.toString('utf8') || ''}<figcaption>Our first adventure is still ahead.</figcaption></figure>`;
    return `<div class="page-layout${['chronicle','ledger'].includes(section.id) ? ' story-layout' : ''}">${nav(section.id)}<article class="page-content">${heading}${quickAnswers(section)}${artwork}<div class="prose">${content}</div>${next ? `<nav class="next-chapter" aria-label="Next chapter"><span class="eyebrow">Keep exploring</span><a href="${next.id}.html">${esc(next.label)} ${arrow}</a></nav>` : ''}</article></div>${hasExit ? `<div class="exit-section">${exitCard()}</div>` : ''}`;
  }
  pages.set('index.html',shell('index.html',homePage()));
  for (const section of sections.filter(section=>section.id!=='leave-now')) pages.set(`${section.id}.html`,shell(`${section.id}.html`,chapter(section)));
  pages.set('leave-now.html',shell('leave-now.html',`<div class="standalone-exit">${exitCard(true)}<a class="text-link" href="index.html">Back to the field guide ${arrow}</a></div>`));
  pages.set('404.html',shell('404.html','<section class="not-found"><p class="eyebrow">A little off the path</p><h1>Let’s find the road.</h1><p>This page isn’t in the field guide.</p><a class="button" href="index.html">Back to the campfire</a></section>'));
  return pages;
}
