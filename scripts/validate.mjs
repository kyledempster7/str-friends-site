import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertFrozen } from './lib/frozen.mjs';
import { stripVersionBar, VERSIONS } from './lib/version-bar.mjs';
import { outputBudgetFindings } from './lib/output-budgets.mjs';

// Independently transcribed campaign restrictions. A named hold must remain
// searchable and may not be weakened to an allowed/conditional search result.
export const requiredHolds = [
  ['Strong Reflexes 2', 'Strong Reflexes rank 2'],
  ['Steady Hand'], ['Dark Souls 2', 'Dark Souls rank 2'],
  ['Dragonborn 4', 'Dragonborn rank 4', 'spectral drum'],
  ['Dragonborn 5', 'Dragonborn rank 5', 'Dremora Merchant'],
  ['extra summons', 'extra summon capacity'],
  ['torch auto-unlock', 'automatic unlock', 'auto-unlock', 'torch unlocking'],
  ['Red Sand Dance'], ['Contingency'], ['Beast Tongue'], ['Spirit Walk'],
  ['Mark'], ['Recall'],
  ['corpse reanimation', 'reanimation', 'raise dead', 'corpse raising'],
  ['Resurgence'],
];
// Kyle (2026-10-03): only things actually in our game belong in "Can I use this?".
// Mods we don't run (Ordinator, Apocalypse, combat and display mods) must not appear.
const notInOurGame = /\b(Ordinator|Apocalypse|BFCO|MCO|ADXP|Scrambled Bugs|Spell Perk Item Distributor|Immersive Equipment Displays|All Geared Up|Visible Favorited Gear|Simple Dual Sheath|Become a Bard|Bards Reborn|Adamant|Blade and Blunt|Valhalla)\b/;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (message) => errors.push(message);
const normalize = (value) => String(value).toLowerCase().replace(/[’‘]/g, "'")
  .replace(/\branks?\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const mentions = (text, term) => (` ${normalize(text)} `).includes(` ${normalize(term)} `);
const textOf = (value) => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(textOf).join(' ') : value && typeof value === 'object'
    ? Object.values(value).map(textOf).join(' ') : '';

function readJson(relative) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch { fail(`${relative}: missing or invalid JSON`); return null; }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const location = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) { fail('Symbolic links require a separate publication audit'); return []; }
    return entry.isDirectory() ? walk(location) : [location];
  });
}

function privacy(relative, value) {
  const checks = [
    ['email address', /[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ['absolute device path', /(?:\b[A-Z]:[\\/]|file:\/\/|\/(?:Users|home)\/[A-Za-z0-9_.-]+)/i],
    ['private credential', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{15,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[A-Z0-9]{16})/],
    ['credential-bearing URL', /https?:\/\/[^\s/<>]+:[^\s/<>]+@/],
  ];
  for (const [label, expression] of checks) if (expression.test(value)) fail(`${relative}: possible ${label}; value withheld`);
  for (const match of value.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)) {
    if (match[0].split('.').every((part) => Number(part) <= 255)) fail(`${relative}: possible IP address; value withheld`);
  }
}

const mediaMetadata = new Map();
const allFiles = walk(root);
for (const file of allFiles) {
  const relative = path.relative(root, file);
  if (!/\.mp3$/i.test(file)) {
    privacy(relative, fs.readFileSync(file).toString('utf8'));
    continue;
  }
  // Compressed audio is not UTF-8: random frame bytes can resemble device paths.
  // Inspect every MP3's actual metadata; its spoken transcript is scanned as JSON
  // and rendered HTML by the unchanged text checks above. Probe failures fail closed.
  const probe = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:format_tags:stream=codec_type:stream_tags', '-of', 'json', file
  ], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  if (probe.error || probe.status !== 0) {
    fail(`${relative}: cannot inspect audio; install ffprobe or set FFPROBE_PATH to its executable`);
    continue;
  }
  try {
    const metadata = JSON.parse(probe.stdout);
    privacy(relative, JSON.stringify(metadata));
    if (metadata.streams?.some(stream => stream.codec_type !== 'audio')) fail(`${relative}: MP3 must contain only audio`);
    mediaMetadata.set(file, metadata);
  } catch { fail(`${relative}: invalid ffprobe result`); }
}
const rules = readJson('src/content/rules.json');
const play = readJson('src/content/play.json');
const catalog = readJson('src/content/catalog.json');
const sections = [...(rules?.sections ?? []), ...(play?.sections ?? [])];
const expectedSections = ['together', 'skills', 'spells', 'rules', 'leave-now', 'tonight', 'builds', 'party', 'ownership', 'chronicle', 'ledger'];
for (const id of expectedSections) if (sections.filter((section) => section.id === id).length !== 1) fail(`Content requires exactly one ${id} section`);
for (const [filename, document] of [['rules', rules], ['play', play], ['catalog', catalog]]) {
  if (document && !/^\d{4}-\d{2}-\d{2}$/.test(document.updated ?? '')) fail(`${filename}: needs a last-reviewed date`);
}

const entries = catalog?.entries;
if (!Array.isArray(entries) || !entries.length) fail('Catalog requires nonempty entries');
else {
  const ids = new Set();
  for (const entry of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id ?? '') || ids.has(entry.id)) fail('Catalog IDs must be unique stable slugs');
    ids.add(entry.id);
    for (const field of ['name', 'summary', 'detail']) if (typeof entry[field] !== 'string' || !entry[field].trim()) fail(`Catalog ${entry.id}: missing ${field}`);
    if (!['allowed', 'hold', 'blocked', 'conditional'].includes(entry.status)) fail(`Catalog ${entry.id}: invalid status`);
    if (!['spell', 'perk', 'race', 'mod', 'mechanic'].includes(entry.category)) fail(`Catalog ${entry.id}: invalid category`);
    if (!Array.isArray(entry.aliases) || entry.aliases.some((alias) => typeof alias !== 'string')) fail(`Catalog ${entry.id}: aliases must be text array`);
    if (entry.sourceUrl && !/^https:\/\//.test(entry.sourceUrl)) fail(`Catalog ${entry.id}: source URL must be public HTTPS`);
    if (notInOurGame.test(entry.name)) fail(`Catalog ${entry.id}: lists a mod we don't run`);
  }
  for (const alternatives of requiredHolds) {
    const matches = entries.filter((entry) => [entry.name, ...(entry.aliases ?? [])].some((name) => alternatives.some((term) => mentions(name, term))));
    if (!matches.length) fail(`Missing searchable restriction: ${alternatives[0]}`);
    else if (matches.some((entry) => !['hold', 'blocked'].includes(entry.status))) fail(`Restriction weakened: ${alternatives[0]}`);
  }
}

const contentText = textOf([rules, play, catalog]);
if (!/one active (?:summon|summoned actor) per player/i.test(contentText)) fail('Campaign must explicitly retain one active summon per player');
for (const forbidden of [/all defaults accepted/i, /(?:fully|completely) (?:tested|validated|compatible)/i, /(?:guaranteed|crash[- ]free|bug[- ]free) multiplayer/i, /revision 6 (?:is )?(?:published|live|ready)/i]) {
  if (forbidden.test(contentText)) fail('Content includes an unsupported blanket approval or validation claim');
}
const leave = textOf(sections.find((section) => section.id === 'leave-now'));
for (const phrase of ['Save if possible', 'Let it finish', 'Disconnect', 'Proceed', 'Quit the game', 'no fix is proven']) {
  if (!mentions(leave, phrase)) fail(`Quick-exit card missing: ${phrase}`);
}
if (!/F\s*(?:two|2)/i.test(leave)) fail('Quick-exit card must identify F two / F2');
const ownership = textOf(sections.find((section) => section.id === 'ownership'));
if (!/propos(?:al|ed)/i.test(ownership)) fail('Ownership etiquette must be labeled proposed');
const chronicle = textOf(sections.find((section) => section.id === 'chronicle'));
if (!mentions(chronicle, 'Our first adventure is still ahead')) fail('Chronicle must retain its honest empty state');

const dist = path.join(root, 'dist');
const published = walk(dist);
const htmlFiles = published.filter((file) => file.endsWith('.html'));
if (!htmlFiles.length) fail('Build dist before validation; no HTML output exists');
for (const finding of outputBudgetFindings(published.map(file => ({ name: file, size: fs.statSync(file).size })))) fail(finding);
const decode = (value) => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const documents = new Map(htmlFiles.map((file) => [path.resolve(file), fs.readFileSync(file, 'utf8')]));
// Probe real media rather than trusting the declared player duration. These
// per-clip limits apply in addition to the separate total audio budget.
const audioPages = readJson('src/variants/v4/pages.json');
const declaredAudio = new Set();
const audioMetadata = new Map();
const audioSource = path.join(root, 'src/variants/v4/audio');
const audioOutput = path.join(dist, 'v4/audio');
const audioFiles = walk(audioSource);
for (const file of audioFiles) {
  const label = path.relative(root, file);
  if (!file.endsWith('.mp3')) { fail(`${label}: only MP3 audio is supported`); continue; }
  if (fs.statSync(file).size > 10_000_000) fail(`${label}: audio exceeds 10 MB`);
  const metadata = mediaMetadata.get(file);
  if (!metadata) continue;
  const duration = Number(metadata.format?.duration);
  if (!metadata.streams?.some(stream => stream.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0) fail(`${label}: no valid audio duration`);
  else {
    if (duration > 600) fail(`${label}: audio exceeds 10 minutes`);
    audioMetadata.set(file, duration);
  }
  const outputFile = path.join(audioOutput, path.relative(audioSource, file));
  if (!fs.existsSync(outputFile) || !fs.readFileSync(file).equals(fs.readFileSync(outputFile))) fail(`${label}: built audio is missing or differs from its source; rebuild`);
}
const compactText = value => value.replace(/\s+/g, ' ').trim();
// Check navigation where it is rendered, so unrelated links elsewhere cannot
// conceal a missing sidebar list or numbered strip. Single-page topics omit both.
const guideGroups = [...(audioPages?.chapters ?? []), { label: 'Can I use this?', pages: audioPages?.rules?.pages ?? [] }];
const visibleText = value => compactText(decode(value.replace(/<[^>]*>/g, ' ')));
const navLinks = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, body]) => ({
  href: decode(attributes.match(/\bhref="([^"]*)"/)?.[1] ?? ''),
  current: attributes.match(/\baria-current="([^"]*)"/)?.[1],
  text: visibleText(body)
}));
for (const [gi, group] of guideGroups.entries()) {
  for (const [pi, page] of group.pages.entries()) {
    const label = `v4/${page.file}`;
    const html = documents.get(path.join(dist, 'v4', page.file)) ?? '';
    const aside = html.match(/<aside class="d-side"[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? '';
    const expanded = [...aside.matchAll(/<ol class="d-side-subpages"[^>]*>([\s\S]*?)<\/ol>/g)];
    const strips = [...html.matchAll(/<nav class="d-page-strip"[^>]*>([\s\S]*?)<\/nav>/g)];
    if (group.pages.length < 2) {
      if (strips.length || expanded.length) fail(`${label}: single-page topic must not render a page strip or duplicate sidebar list`);
      continue;
    }
    if (expanded.length !== 1) fail(`${label}: exactly the current topic must expand in the sidebar`);
    const sideLinks = navLinks(expanded[0]?.[1] ?? '');
    if (sideLinks.length !== group.pages.length || group.pages.some((p, i) => sideLinks[i]?.href !== p.file || sideLinks[i]?.text !== p.title || sideLinks[i]?.current !== (i === pi ? 'page' : undefined))) {
      fail(`${label}: expanded sidebar must list every sibling in order and mark only the current page`);
    }
    if (strips.length !== 1 || !/<\/h1>\s*<nav class="d-page-strip"/.test(html)) fail(`${label}: a numbered page strip is required directly under the H1`);
    const strip = strips[0]?.[1] ?? '';
    const count = strip.match(/<span class="d-page-count">([^<]*)<\/span>/)?.[1];
    if (count !== `Page ${pi + 1} of ${group.pages.length}:`) fail(`${label}: page strip has the wrong position or total`);
    const current = [...strip.matchAll(/<strong aria-current="page">([^<]*)<\/strong>/g)];
    if (current.length !== 1 || decode(current[0]?.[1] ?? '') !== page.title) fail(`${label}: page strip must mark the current page in bold`);
    const links = navLinks(strip);
    const siblings = group.pages.filter(p => p.file !== page.file);
    if (links.length !== siblings.length + 1 || siblings.some((p, i) => links[i]?.href !== p.file || links[i]?.text !== p.title) || links.some(link => link.href === page.file || link.current)) {
      fail(`${label}: page strip must link every other sibling, with no link on the current page`);
    }
    const nextGroup = guideGroups[(gi + 1) % guideGroups.length];
    const nextPage = group.pages[pi + 1];
    const nextHref = nextPage?.file ?? nextGroup.pages[0]?.file;
    const nextText = nextPage ? `Next: ${nextPage.title} →` : `Next topic: ${nextGroup.label} →`;
    if (links.at(-1)?.href !== nextHref || links.at(-1)?.text !== nextText) fail(`${label}: page strip must end with the next page or topic link`);
  }
}
for (const page of [
  { ...audioPages?.home, file: 'index.html' },
  ...(audioPages?.chapters?.flatMap(chapter => chapter.pages) ?? []),
  ...(audioPages?.rules?.pages ?? [])
]) {
  if (!page.audio) continue;
  const audio = page.audio;
  const label = `v4/${page.file}: audio`;
  if (typeof audio.title !== 'string' || !audio.title.trim()) fail(`${label}: missing title`);
  if (typeof audio.duration !== 'number' || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 600) fail(`${label}: duration must be seconds between 0 and 600`);
  if (typeof audio.src !== 'string' || !/^audio\/[a-z0-9]+(?:-[a-z0-9]+)*\.mp3$/.test(audio.src)) fail(`${label}: src must name an MP3 in audio/`);
  else {
    const file = path.join(root, 'src/variants/v4', audio.src);
    declaredAudio.add(file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`${label}: missing audio file ${audio.src}`);
    const duration = audioMetadata.get(file);
    if (duration !== undefined && Math.abs(duration - audio.duration) > 1) fail(`${label}: declared duration differs from the MP3`);
  }
  const paragraphs = audio.transcript;
  if (!Array.isArray(paragraphs) || !paragraphs.length || paragraphs.some(text => typeof text !== 'string' || !text.trim())) {
    fail(`${label}: missing transcript text`);
    continue;
  }
  if (typeof audio.transcriptAnchor !== 'string' || !/^[a-z][a-z0-9-]*$/.test(audio.transcriptAnchor)) {
    fail(`${label}: missing or invalid transcript anchor`);
    continue;
  }
  const html = documents.get(path.join(dist, 'v4', page.file)) ?? '';
  const transcript = html.match(new RegExp(`<details class="d-transcript" id="${audio.transcriptAnchor}">([\\s\\S]*?)<\\/details>`));
  const renderedParagraphs = [...(transcript?.[1] ?? '').matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map(match => compactText(decode(match[1].replace(/<[^>]*>/g, ' '))));
  if (!transcript || JSON.stringify(renderedParagraphs) !== JSON.stringify(paragraphs.map(compactText))) fail(`${label}: matching transcript text must be on the same page`);
  const audioTag = html.match(/<audio\b[^>]*>/)?.[0] ?? '';
  if (!audioTag.includes(`src="${audio.src}"`) || !/\bcontrols(?:\s|>)/.test(audioTag) || !audioTag.includes('preload="none"')) fail(`${label}: native fallback with preload="none" is required`);
}
for (const file of audioFiles) if (!declaredAudio.has(file)) fail(`${path.relative(root, file)}: audio needs a page with a transcript`);
for (const file of walk(audioOutput)) {
  if (!audioFiles.includes(path.join(audioSource, path.relative(audioOutput, file)))) fail(`${path.relative(dist, file)}: audio has no source with a transcript`);
}
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: "Quarantined — don't use yet", blocked: 'Blocked' };
// Check the full lookup and each category grid against the same adopted records.
function checkRenderedCatalog(catalogPath, catalogHtml, variantEntries) {
  const renderedRuleIds = [...catalogHtml.matchAll(/<(?:article|tr)\b[^>]*\bid=["']rule-([^"']+)["'][^>]*>/g)].map(match => match[1]);
  if (renderedRuleIds.length !== variantEntries.length || renderedRuleIds.some(id => !variantEntries.some(entry => entry.id === id))) fail(`${catalogPath}: rendered catalog inventory differs from its catalog file`);
  for (const entry of catalogHtml ? variantEntries : []) {
    // The outer page article can contain the first rule card, so locate the
    // uniquely identified opening tag, then bound it at its own closing tag.
    const escapedId = String(entry.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openings = [...catalogHtml.matchAll(new RegExp(`<(article|tr)\\b([^>]*\\bid=["']rule-${escapedId}["'][^>]*)>`, 'g'))];
    if (openings.length !== 1) { fail(`${catalogPath}: ${entry.id} must render exactly once`); continue; }
    const [whole, tag, attributes] = openings[0];
    const opening = Object.assign([whole, attributes], { index: openings[0].index });
    const end = catalogHtml.indexOf(`</${tag}>`, opening.index + opening[0].length);
    if (end < 0) { fail(`Catalog ${entry.id}: rendered article is not closed`); continue; }
    const body = catalogHtml.slice(opening.index + opening[0].length, end);
    const visible = decode(body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    const status = opening[1].match(/\bdata-status=["']([^"']+)["']/)?.[1];
    const search = decode(opening[1].match(/\bdata-search="([^"]*)"/)?.[1] ?? '');
    for (const alias of entry.aliases ?? []) if (!search.includes(alias)) fail(`${catalogPath}: ${entry.id} missing searchable alias`);
    if (status !== entry.status) fail(`Catalog ${entry.id}: rendered status does not match the source`);
    for (const value of [entry.name, entry.summary, entry.detail, statusLabels[entry.status]]) {
      if (typeof value !== 'string' || !visible.includes(value.replace(/\s+/g, ' ').trim())) fail(`Catalog ${entry.id}: visible name, status or guidance missing from rendered output`);
    }
    if (/\bhidden(?:\s|=|$)/.test(opening[1]) || /\baria-hidden=["']true["']/.test(opening[1])) fail(`Catalog ${entry.id}: rule hidden in static output`);
  }
}
// Kyle (2026-10-03): "keep B and D, and delete the others". Only /v2b/ (B) and /v4/ (D) are published.
const variantPaths = VERSIONS.map(([folder]) => folder);
for (const gone of ['v1', 'v2a', 'v3']) if (fs.existsSync(path.join(dist, gone))) fail(`/${gone}/ must not be published`);
for (const variant of variantPaths) {
const catalogPath = path.join(variant, 'rules.html');
const catalogHtml = documents.get(path.join(dist, catalogPath)) ?? '';
if (!catalogHtml) fail(`${catalogPath}: missing rendered catalog`);
// Each version renders its own catalog file. D (the main site) must equal the adopted master exactly;
// B (the older layout) keeps its own wording but may not list anything the master lacks or rule it differently.
const sourcePath = `src/variants/${variant}/content/catalog.json`;
const variantEntries = readJson(sourcePath)?.entries ?? [];
if (variant === 'v4') {
  if (variantEntries.length !== entries?.length) fail(`${sourcePath}: expected all ${entries?.length} adopted entries`);
  for (const entry of entries ?? []) {
    const matches = variantEntries.filter(item => item.id === entry.id);
    if (matches.length !== 1 || Object.keys(entry).some(key => JSON.stringify(matches[0][key]) !== JSON.stringify(entry[key]))) fail(`${sourcePath}: adopted record changed: ${entry.id}`);
  }
} else {
  for (const item of variantEntries) {
    const master = entries?.find(entry => entry.id === item.id);
    if (!master) fail(`${sourcePath}: ${item.id} is not in the adopted catalog`);
    else if (master.status !== item.status) fail(`${sourcePath}: ${item.id} is ruled differently from the adopted catalog`);
  }
}
checkRenderedCatalog(catalogPath, catalogHtml, variantEntries);
if (variant === 'v4') {
  const categories = [
    ['rules-perks.html', ['perk']], ['rules-spells.html', ['spell']],
    ['rules-powers.html', ['race']], ['rules-mods.html', ['mod', 'mechanic']]
  ];
  for (const [file, types] of categories) {
    const subset = variantEntries.filter(entry => types.includes(entry.category));
    const html = documents.get(path.join(dist, variant, file)) ?? '';
    checkRenderedCatalog(variant + '/' + file, html, subset);
  }
}
}
for (const [file, html] of documents) {
  const relative = path.relative(dist, file);
  if (path.dirname(file) === path.join(dist, 'v4')) {
    const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? '';
    const headerLinks = [...header.matchAll(/<a\b([^>]*)href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    if (headerLinks.length !== 2) fail(`${relative}: header must contain only the home brand and Nexus join link`);
    if (!headerLinks.some(([, attributes, href]) => /class="brand"/.test(attributes) && href === 'index.html')) fail(`${relative}: header brand must link home`);
    if (!headerLinks.some(([, attributes, href, body]) => /class="[^"]*\bd-join\b/.test(attributes) && decode(href) === audioPages?.collectionUrl && compactText(decode(body.replace(/<[^>]*>/g, ' '))) === 'Join us · setup on Nexus')) fail(`${relative}: header must retain Join us · setup on Nexus and its collection link`);
    for (const [, attributes, href] of headerLinks) {
      if (href.startsWith('leave-now.html')) fail(`${relative}: header must not link to Leave now`);
      if (/^(?:index\.html(?:[?#]|$)|\.\/|\/$)/.test(href) && !/class="brand"/.test(attributes)) fail(`${relative}: only the header brand may link home`);
    }
    if (!file.endsWith(`${path.sep}index.html`) && !/<aside class="d-side"[^>]*><details class="d-guide" open><summary class="d-side-title">/.test(html)) fail(`${relative}: shared collapsible guide missing`);
    if (/rules(?:-(?:perks|spells|powers|mods))?\.html$/.test(file)) {
      for (const route of ['rules.html', 'rules-perks.html', 'rules-spells.html', 'rules-powers.html', 'rules-mods.html']) {
        if (!html.includes(`href="${route}"`)) fail(`${relative}: missing rules page link ${route}`);
      }
    }
  }
  // Kyle: every page must reach every version.
  const bar = html.match(/<nav class="all-versions"[^>]*>([\s\S]*?)<\/nav><\/body>/);
  if (!bar) fail(`${relative}: missing the all-versions bar`);
  else for (const [, label] of VERSIONS) if (!new RegExp(`>${label}</(?:a|strong)>`).test(bar[1])) fail(`${relative}: version bar missing ${label}`);
  if (!/<html\b[^>]*lang=["']en["']/i.test(html)) fail(`${relative}: missing English document language`);
  if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) fail(`${relative}: missing responsive viewport`);
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) fail(`${relative}: exactly one H1 is required`);
  if (!/<main\b/i.test(html)) fail(`${relative}: main landmark missing`);
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  if (new Set(ids).size !== ids.length) fail(`${relative}: duplicate element IDs`);
  if (/<(?:iframe|object|embed)\b/i.test(html) || /<form\b[^>]*\baction=["'](?:https?:)?\/\//i.test(html)) fail(`${relative}: unexpected embedded service or external form`);
  if (/<(?:script|img|source|audio|video|link)\b[^>]*\b(?:src|href)=["'](?:https?:)?\/\//i.test(html)) fail(`${relative}: external loaded resource`);
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
    const url = decode(match[1]);
    if (/^https:\/\//i.test(url)) continue;
    if (/^(?:[a-z]+:|\/\/)/i.test(url)) { fail(`${relative}: unsupported link/resource scheme`); continue; }
    const [pathname, fragment] = url.split('#');
    const target = pathname ? path.resolve(path.dirname(file), decodeURIComponent(pathname.split('?')[0])) : file;
    if (target !== dist && !target.startsWith(dist + path.sep)) { fail(`${relative}: link escapes deployed directory`); continue; }
    const resolved = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, 'index.html') : target;
    if (!fs.existsSync(resolved)) { fail(`${relative}: missing local link target ${pathname}`); continue; }
    if (fragment && documents.has(resolved)) {
      const targetIds = [...documents.get(resolved).matchAll(/\bid=["']([^"']+)["']/g)].map((item) => item[1]);
      if (!targetIds.includes(decodeURIComponent(fragment))) fail(`${relative}: missing local anchor ${fragment}`);
    }
  }
  for (const image of html.matchAll(/<img\b[^>]*>/gi)) if (!/\balt=["']/i.test(image[0])) fail(`${relative}: image missing alternative text`);
}
for (const file of published) {
  const relative = path.relative(dist, file);
  const text = fs.readFileSync(file, 'utf8');
  if (/\.(?:css|js|html)$/.test(file) && /(?:google-analytics|googletagmanager|clarity\.ms|hotjar|segment\.com|plausible\.io|fonts\.googleapis|fonts\.gstatic)/i.test(text)) fail(`${relative}: external tracking/font service found`);
  if (file.endsWith('.css') && /(?:@import|url\(\s*["']?https?:)/i.test(text)) fail(`${relative}: stylesheet loads an external resource`);
}
if (errors.length) {
  console.error(`Validation failed (${errors.length}):\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${entries.length} catalog records, ${requiredHolds.length} restriction groups, ${htmlFiles.length} pages; privacy, content and static-link checks.`);
  console.log('Browser behavior, live links, exact private-secret comparison and Git history require the separate release review.');
}
