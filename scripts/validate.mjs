import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isUtf8 } from 'node:buffer';
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
    const bytes = fs.readFileSync(file);
    // Compressed images can coincidentally contain a drive-letter marker. Like the publish scan, check a binary
    // file's readable strings (runs of 16 or more printable bytes), not its random compressed data.
    privacy(relative, !isUtf8(bytes) || bytes.includes(0) ? (bytes.toString('latin1').match(/[\x20-\x7e\t]{16,}/g) ?? []).join('\n') : bytes.toString('utf8'));
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
const MAX_CLIP_SECONDS = 660;
const audioPages = readJson('src/variants/v4/pages.json');
const audioGuide = readJson('src/variants/v4/audio-guide.json');
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
    if (duration > MAX_CLIP_SECONDS) fail(`${label}: audio exceeds 11 minutes`);
    audioMetadata.set(file, duration);
  }
  const outputFile = path.join(audioOutput, path.relative(audioSource, file));
  if (!fs.existsSync(outputFile) || !fs.readFileSync(file).equals(fs.readFileSync(outputFile))) fail(`${label}: built audio is missing or differs from its source; rebuild`);
}
const compactText = value => value.replace(/\s+/g, ' ').trim();
const plainSentences = value => value.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean);
// Check navigation where it is rendered, so unrelated links elsewhere cannot
// conceal a missing sidebar list or numbered strip. Single-page topics omit both.
const guideGroups = [...(audioPages?.chapters ?? []), { label: 'Can I use this?', pages: audioPages?.rules?.pages ?? [] }];
// Characters (2026-10-05) is a separate section with its own sidebar and strip; it is not part of the guide's topic chain.
const characterGroup = { label: 'Characters', pages: audioPages?.characters?.pages ?? [] };
const navLabel = page => page.navLabel ?? page.title;
const visibleText = value => compactText(decode(value.replace(/<[^>]*>/g, ' ')));
const navLinks = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, body]) => ({
  href: decode(attributes.match(/\bhref="([^"]*)"/)?.[1] ?? ''),
  current: attributes.match(/\baria-current="([^"]*)"/)?.[1],
  text: visibleText(body)
}));
for (const [gi, group] of [...guideGroups, characterGroup].entries()) {
  const inCharacters = group === characterGroup;
  for (const [pi, page] of group.pages.entries()) {
    const label = `v4/${page.file}`;
    const html = documents.get(path.join(dist, 'v4', page.file)) ?? '';
    const aside = html.match(/<aside class="d-side"[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? '';
    const asideOpen = html.match(/<aside class="d-side"[^>]*>/)?.[0] ?? '';
    const expanded = [...aside.matchAll(/<ol class="d-side-subpages"[^>]*>([\s\S]*?)<\/ol>/g)];
    const strips = [...html.matchAll(/<nav class="d-page-strip"[^>]*>([\s\S]*?)<\/nav>/g)];
    if (inCharacters) {
      if (!asideOpen.includes('aria-label="Characters"') || expanded.length) fail(`${label}: Characters pages use the Characters sidebar`);
    } else if (!asideOpen.includes('aria-label="Field guide"')) fail(`${label}: guide pages use the Field guide sidebar`);
    if (group.pages.length < 2) {
      if (strips.length || expanded.length) fail(`${label}: single-page topic must not render a page strip or duplicate sidebar list`);
      continue;
    }
    const sideLinks = navLinks(inCharacters ? aside : expanded[0]?.[1] ?? '');
    if (!inCharacters && expanded.length !== 1) fail(`${label}: exactly the current topic must expand in the sidebar`);
    if (sideLinks.length !== group.pages.length || group.pages.some((p, i) => sideLinks[i]?.href !== p.file || sideLinks[i]?.text !== navLabel(p) || sideLinks[i]?.current !== (i === pi ? 'page' : undefined))) {
      fail(`${label}: the sidebar must list every sibling in order and mark only the current page`);
    }
    // The strip repeats the sidebar. It stays in the page for narrow screens (CSS shows it only there).
    if (strips.length !== 1 || !/<\/h1>\s*<nav class="d-page-strip"/.test(html)) fail(`${label}: a numbered page strip is required directly under the H1`);
    const strip = strips[0]?.[1] ?? '';
    const count = strip.match(/<span class="d-page-count d-sr-only">([^<]*)<\/span>/)?.[1];
    if (count !== `Page ${pi + 1} of ${group.pages.length}:`) fail(`${label}: page strip has the wrong position or total`);
    const current = [...strip.matchAll(/<strong aria-current="page">([^<]*)<\/strong>/g)];
    if (current.length !== 1 || decode(current[0]?.[1] ?? '') !== navLabel(page)) fail(`${label}: page strip must mark the current page in bold`);
    const links = navLinks(strip);
    const siblings = group.pages.filter(p => p.file !== page.file);
    const nextGroup = inCharacters ? null : guideGroups[(gi + 1) % guideGroups.length];
    const nextPage = group.pages[pi + 1];
    const nextHref = nextPage?.file ?? nextGroup?.pages[0]?.file;
    const nextText = nextPage ? `Next: ${navLabel(nextPage)} →` : nextGroup ? `Next topic: ${nextGroup.label} →` : null;
    if (links.length !== siblings.length + (nextText ? 1 : 0) || siblings.some((p, i) => links[i]?.href !== p.file || links[i]?.text !== navLabel(p)) || links.some(link => link.href === page.file || link.current)) {
      fail(`${label}: page strip must link every other sibling, with no link on the current page`);
    }
    const h2Titles = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(([, body]) => visibleText(body).toLowerCase());
    const pageTitle = page.title.toLowerCase();
    if (h2Titles.some(title => title === pageTitle || title.startsWith(`${pageTitle} `))) fail(`${label}: a section heading only repeats the page title`);
    if (nextText && (links.at(-1)?.href !== nextHref || links.at(-1)?.text !== nextText)) fail(`${label}: page strip must end with the next page or topic link`);
  }
}
{
  const home = documents.get(path.join(dist, 'v4', 'index.html')) ?? '';
  const tilesAt = home.lastIndexOf('class="d-chapter"');
  const searchAt = home.indexOf('role="search"');
  if (tilesAt < 0 || searchAt < 0 || searchAt < tilesAt) fail('v4/index.html: the search box must sit below the chapter cards');
  const tileCount = (home.match(/class="d-chapter"/g) ?? []).length;
  if (tileCount !== 8 || audioPages?.chapters?.length !== 8) fail('v4/index.html: eight chapter cards are required (the field guide has eight chapters)');
  const last = audioPages?.chapters?.at(-1);
  if (last?.num !== '08' || last?.label !== 'Our purpose' || last?.pages?.map(p => p.file).join() !== 'purpose.html,vote.html') fail('Chapter 08 must be Our purpose, with the purpose and vote pages');
  if (!new RegExp('<a class="d-chapter" href="purpose\.html"><span class="d-chapter-num">08</span><span class="d-chapter-label">Our purpose</span>').test(home)) fail('v4/index.html: Our purpose needs its own card (chapter 08) on the home page');
  if (audioPages?.chapters?.[5]?.pages?.some(p => ['purpose.html', 'vote.html'].includes(p.file))) fail('Chapter 06 must no longer hold Our purpose or Vote');
}
for (const page of [
  { ...audioPages?.home, file: 'index.html' },
  ...(audioPages?.chapters?.flatMap(chapter => chapter.pages) ?? []),
  ...(audioPages?.characters?.pages ?? []),
  ...(audioPages?.rules?.pages ?? []),
  ...[...(audioPages?.chapters?.flatMap(chapter => chapter.pages) ?? []), ...(audioPages?.characters?.pages ?? [])]
    .flatMap(page => (page.clips ?? []).map(clip => ({ file: page.file, audio: { title: clip.title, duration: clip.duration, src: clip.src, transcript: clip.transcript, transcriptAnchor: `${clip.id}-transcript` } }))),
  ...(audioGuide?.episodes ?? []).map(ep => ({ file: 'audio-guide.html', audio: { title: ep.title, duration: ep.duration, src: ep.src, transcript: ep.transcript, transcriptAnchor: `${ep.id}-transcript` } }))
]) {
  if (!page.audio) continue;
  const audio = page.audio;
  const label = `v4/${page.file}: audio`;
  if (typeof audio.title !== 'string' || !audio.title.trim()) fail(`${label}: missing title`);
  if (typeof audio.duration !== 'number' || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > MAX_CLIP_SECONDS) fail(`${label}: duration must be seconds between 0 and ${MAX_CLIP_SECONDS}`);
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
  const audioTag = [...html.matchAll(/<audio\b[^>]*>/g)].map(item => item[0]).find(tag => tag.includes(`src="${audio.src}"`)) ?? '';
  if (!audioTag.includes(`src="${audio.src}"`) || !/\bcontrols(?:\s|>)/.test(audioTag) || !audioTag.includes('preload="none"')) fail(`${label}: native fallback with preload="none" is required`);
}
{
  const episodes = audioGuide?.episodes ?? [];
  const guidePage = documents.get(path.join(dist, 'v4', 'audio-guide.html')) ?? '';
  if (episodes.length !== 12) fail('Audio guide: expected twelve episodes');
  if (!guidePage) fail('v4/audio-guide.html: page missing');
  if (!/<h1\b[^>]*>Audio guide<\/h1>/.test(guidePage)) fail('v4/audio-guide.html: the page title must be Audio guide');
  if (!/recorded for revision 7 of the collection/i.test(guidePage)) fail('v4/audio-guide.html: must say the set was recorded for revision 7');
  if (!/Not covered yet: the newest gear mods/.test(guidePage)) fail('v4/audio-guide.html: must state the known gap');
  if ((guidePage.match(/<section class="d-episode"/g) ?? []).length !== episodes.length) fail('v4/audio-guide.html: one boxed segment per episode is required');
  const known = new Map([...(audioPages?.chapters?.flatMap(chapter => chapter.pages) ?? []), ...(audioPages?.characters?.pages ?? []), ...(audioPages?.rules?.pages ?? [])].map(page => [page.file, page.title]));
  for (const ep of episodes) {
    const box = guidePage.match(new RegExp(`<section class="d-episode" id="${ep.id}"[\\s\\S]*?<\\/section>`))?.[0] ?? '';
    if (!box) { fail(`v4/audio-guide.html: segment ${ep.id} missing`); continue; }
    if (!box.includes(ep.title.replace(/&/g, '&amp;')) || !box.includes(`<p class="d-episode-summary">`) || !/\d+:\d\d/.test(box)) fail(`v4/audio-guide.html: ${ep.id} needs its title, length and summary`);
    if (!ep.related?.length) fail(`Audio guide: ${ep.id} needs related pages`);
    for (const file of ep.related ?? []) {
      if (!known.has(file)) { fail(`Audio guide: ${ep.id} relates to unknown page ${file}`); continue; }
      if (!box.includes(`<a href="${file}" target="_blank" rel="noopener">`)) fail(`v4/audio-guide.html: ${ep.id} link to ${file} must open in a new tab with rel="noopener"`);
      const page = documents.get(path.join(dist, 'v4', file)) ?? '';
      if (!page.includes(`<a href="audio-guide.html#${ep.id}" target="_blank" rel="noopener">`)) fail(`v4/${file}: missing the "Listen to this section" link to ${ep.id}`);
    }
  }
  for (const [file, html] of documents) {
    if (path.dirname(file) !== path.join(dist, 'v4')) continue;
    if (!html.includes('href="audio-guide.html"')) fail(`${path.relative(dist, file)}: the Audio guide must be reachable from every page`);
  }
}
// Our purpose and Vote (2026-10-05): six orders, plain short sentences, only installed content, and a vote that never sends data.
{
  const purpose = readJson('src/variants/v4/purpose.json');
  const orders = purpose?.orders ?? [];
  const purposePage = documents.get(path.join(dist, 'v4', 'purpose.html')) ?? '';
  const votePage = documents.get(path.join(dist, 'v4', 'vote.html')) ?? '';
  if (!purposePage) fail('v4/purpose.html: page missing');
  if (!votePage) fail('v4/vote.html: page missing');
  if (orders.length !== 6 || orders.map(o => o.letter).join('') !== 'ABCDEF' || new Set(orders.map(o => o.id)).size !== 6) fail('Our purpose: exactly six orders with letters A to F are required');
  if (purpose?.roleLabels?.length !== 4) fail('Our purpose: four role labels are required');
  // Quarantined or uninstalled things are never recommended. "Never raise corpses" is the one allowed mention of the topic.
  const quarantined = /Steady Hand|Strong Reflexes (?:rank )?2|Resurgence|Necromage|\b(?:Mark|Recall)\b|Red Sand Dance|Contingency|Beast Tongue|Spirit Walk|Dark Souls|Dremora Merchant|spectral drum/;
  for (const order of orders) {
    const label = `Our purpose: ${order.name ?? order.id}`;
    if (order.rules?.length !== 3) fail(`${label}: three house rules are required`);
    if (order.roles?.length !== 4) fail(`${label}: a line for each of the four roles is required`);
    const text = textOf(order);
    if (notInOurGame.test(text)) fail(`${label}: names a mod we don't run`);
    if (quarantined.test(text)) fail(`${label}: recommends something quarantined`);
    if (!/walk/i.test(textOf(order.rules)) ) fail(`${label}: house rules must keep travel on foot`);
    // Short plain sentences, about ten words each.
    for (const part of [order.idea, order.goal, ...order.rules, ...order.roles]) {
      for (const sentence of plainSentences(textOf(part))) if (sentence.split(/\s+/).length > 20) fail(`${label}: sentence over 20 words: "${sentence.slice(0, 40)}..."`);
    }
    if (!purposePage.includes(`id="order-${order.id}"`)) fail(`v4/purpose.html: section for ${order.name} missing`);
  }
  if ((purposePage.match(/<table class="d-grid/g) ?? []).length !== 7) fail('v4/purpose.html: one overview grid and six order grids are required');
  if (/class="d-(?:chapter|episode|lookup)\b/.test(purposePage) || /<button\b/.test(purposePage)) fail('v4/purpose.html: grids and text links only, no cards or buttons');
  if (!/<h1\b[^>]*>Our purpose<\/h1>/.test(purposePage)) fail('v4/purpose.html: the page title must be Our purpose');
  if (!/<h1\b[^>]*>Vote<\/h1>/.test(votePage)) fail('v4/vote.html: the page title must be Vote');
  if ((votePage.match(/<select id="rank-[A-F]"/g) ?? []).length !== 6) fail('v4/vote.html: one number box per order is required');
  if (!votePage.includes('id="vote-paste"') || !votePage.includes('id="vote-code"')) fail('v4/vote.html: the code box and the paste box are required');
  if (!/A tie is settled by a coin flip or a group gut pick\./.test(votePage)) fail('v4/vote.html: must say how a tie is settled');
  if (!/Nothing leaves your browser/.test(votePage)) fail('v4/vote.html: must say nothing leaves the browser');
  const voteScripts = [...votePage.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  if (!voteScripts) fail('v4/vote.html: vote script missing');
  if (/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\b|navigator\.share|\.src\s*=|new Image|<form[^>]*action/i.test(voteScripts + votePage.replace(/<script[\s\S]*?<\/script>/g, ''))) fail('v4/vote.html: the vote must not send data anywhere');
  const storageUses = (voteScripts.match(/localStorage\./g) ?? []).length;
  const tried = (voteScripts.match(/try \{[^}]*localStorage\.[^}]*\} catch/g) ?? []).length;
  if (!storageUses || storageUses !== tried) fail('v4/vote.html: every localStorage use must sit inside try/catch');
  if (/sessionStorage|indexedDB|document\.cookie/.test(voteScripts)) fail('v4/vote.html: only localStorage may hold the friend\'s own draft');
  const home = documents.get(path.join(dist, 'v4', 'index.html')) ?? '';
  if (!home.includes('href="purpose.html"')) fail('v4/index.html: missing link to purpose.html');
  for (const [file, html] of documents) {
    if (path.dirname(file) !== path.join(dist, 'v4') || !html.includes('aria-label="Field guide"><details')) continue;
    const aside = html.match(/<aside class="d-side"[^>]*>[\s\S]*?<\/aside>/)?.[0] ?? '';
    if (!/href="purpose\.html"[^>]*>08 · Our purpose<\/a>/.test(aside)) fail(`${path.relative(dist, file)}: the field guide sidebar must list 08 · Our purpose`);
    if (/Audio guide/.test(aside)) fail(`${path.relative(dist, file)}: the Audio guide belongs in the top navigation, not the sidebar`);
  }
}
// absol89's list (2026-10-05): one table of the whole community list, loaded from a small JSON file, searchable, filterable and sortable.
{
  const list = readJson('src/variants/v4/absol-list.json');
  const rows = list?.rows ?? [];
  const page = documents.get(path.join(dist, 'v4', 'absol-list.html')) ?? '';
  const mods = documents.get(path.join(dist, 'v4', 'mods.html')) ?? '';
  const builtData = path.join(dist, 'v4', 'absol-list.json');
  if (!page) fail("v4/absol-list.html: page missing");
  if (!fs.existsSync(builtData) || fs.readFileSync(builtData, 'utf8') !== JSON.stringify(list) + '\n' && fs.readFileSync(builtData, 'utf8') !== fs.readFileSync(path.join(root, 'src/variants/v4/absol-list.json'), 'utf8')) fail('v4/absol-list.json: missing or different from its source');
  if (rows.length < 700) fail(`absol-list.json: expected the whole list (about 756 rows), found ${rows.length}`);
  if (new Set(rows.map(r => r[1])).size !== rows.length) fail('absol-list.json: duplicate Nexus ids');
  const byId = new Map(rows.map(r => [r[1], r]));
  rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length !== 7 || typeof r[0] !== 'string' || !r[0].trim() || !Number.isInteger(r[1]) || r[1] < 1 || typeof r[2] !== 'string' || !r[2].trim() || typeof r[3] !== 'string' || ![0, 1].includes(r[4]) || typeof r[5] !== 'string' || ![0, 1].includes(r[6])) fail(`absol-list.json: row ${i + 1} is malformed`);
    else if (!r[4] && !r[5].trim()) fail(`absol-list.json: ${r[0]} has no reason for not using it`);
  });
  if (!rows.some(r => r[4] === 1)) fail('absol-list.json: no row is marked In our game');
  if (!rows.some(r => r[6] === 1)) fail('absol-list.json: no earn-it candidates');
  // Corrections the owner asked for (2026-10-05).
  if (byId.get(667)?.[5] !== 'Not for our co-op: other players cannot see tents (Skyrim Together reports)') fail('absol-list.json: Campfire must say other players cannot see tents');
  if (byId.get(108618)?.[2] !== 'Fixes') fail('absol-list.json: Quest Journal Fix for SkyUI is a fix, not visual');
  for (const [id, verdict] of [[17751, 'Fit'], [21296, 'Maybe'], [33256, 'Maybe'], [21744, 'Maybe'], [85212, 'Maybe'], [67956, 'Avoid']]) {
    if (!byId.get(id)?.[5].startsWith(`${verdict}:`)) fail(`absol-list.json: ${byId.get(id)?.[0] ?? id} must show the verdict ${verdict}`);
  }
  if (/tailscale|\.ts\.net|\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+/i.test(JSON.stringify(list))) fail('absol-list.json: no Tailscale links or addresses');
  if (!/<h1\b[^>]*>absol89&#39;s list<\/h1>|<h1\b[^>]*>absol89's list<\/h1>/.test(page)) fail("v4/absol-list.html: the page title must be absol89's list");
  for (const id of ['absol-q', 'absol-cat', 'absol-ours', 'absol-earn', 'absol-body']) if (!page.includes(`id="${id}"`)) fail(`v4/absol-list.html: missing ${id}`);
  if ((page.match(/<th scope="col" data-sort=/g) ?? []).length !== 7) fail('v4/absol-list.html: seven sortable columns are required');
  if (!/class="d-absol-scroll"/.test(page)) fail('v4/absol-list.html: the table must scroll sideways inside its own box');
  if (!/List by absol89/.test(page)) fail('v4/absol-list.html: credit absol89 as the list author');
  if (!/Only rows marked <strong>In our game<\/strong> are in our pack/.test(page)) fail('v4/absol-list.html: the intro must say only In our game rows are in our pack');
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const fetches = scripts.match(/\bfetch\(([^)]*)\)/g) ?? [];
  if (fetches.length !== 1 || fetches[0] !== "fetch('absol-list.json')") fail('v4/absol-list.html: the only network request allowed is absol-list.json');
  if (/XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|localStorage|sessionStorage|indexedDB|document\.cookie/.test(scripts)) fail('v4/absol-list.html: the list must not send or store anything');
  if (!/href="absol-list\.html"[^>]*>absol89&#39;s list<\/a>/.test(mods) && !/href="absol-list\.html"[^>]*>absol89's list<\/a>/.test(mods)) fail('v4/mods.html: missing link to absol89\'s list');
  // The sidebar lists it under topic 01 (Multiplayer and mods), on that topic's pages.
  for (const name of ['together.html', 'mods.html', 'absol-list.html']) {
    const html = documents.get(path.join(dist, 'v4', name)) ?? '';
    if (!/<aside class="d-side"[\s\S]*?<ol class="d-side-subpages"[\s\S]*?href="absol-list\.html"/.test(html)) fail(`v4/${name}: the sidebar must list absol89's list under Multiplayer and mods`);
  }
}
// Kyle's character (2026-10-05): one standalone page of grids, callouts and text, linked from Lore builds only.
// Images: two original drawings, the card, and one credited in-game screenshot (the only game image). Facts must name where they came from.
{
  const data = readJson('src/variants/v4/vigilant/vigilant.json');
  const page = documents.get(path.join(dist, 'v4', 'vigilant.html')) ?? '';
  if (!page) fail('v4/vigilant.html: page missing');
  else if (data) {
    const main = page.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
    const plainText = visibleText(main);
    if (!new RegExp('<h1\\b[^>]*>' + data.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "(?:'|&#39;)") + '</h1>').test(page)) fail('v4/vigilant.html: the page title must be ' + data.title);
    if (!/<p class="eyebrow">Kyle(?:'|&#39;)s character<\/p>/.test(page)) fail("v4/vigilant.html: the page must be marked as Kyle's character");
    if (/class="d-(?:chapter|episode|lookup)\b/.test(main) || /<button\b/.test(main) || /<script\b/.test(main)) fail('v4/vigilant.html: grids, callouts and text links only; no cards, buttons or scripts');
    const images = [...main.matchAll(/<img\b[^>]*>/g)].map(item => item[0]);
    const imageNames = images.map(tag => tag.match(/\bsrc="assets\/([a-z-]+\.(?:svg|webp))"/)?.[1]).sort();
    if (images.length !== 3 || imageNames.join() !== ['shrine-map.svg', 'skyrim-vigilant-screenshot.webp', 'stendarr-emblem.svg'].join() || images.some(tag => !/\balt="[^"]{20,}"/.test(tag))) fail('v4/vigilant.html: exactly three local images (emblem, map, screenshot), each with real alternative text. The drawn character card picture is removed and no portrait is added.');
    if (/character-card/.test(page) || published.some(file => /character-card/.test(file))) fail('v4/vigilant.html: the drawn character card picture must not be published');
    for (const name of ['skyrim-vigilant-screenshot.webp']) {
      const built = path.join(dist, 'v4', 'assets', name);
      if (!fs.existsSync(built) || fs.statSync(built).size > 250 * 1024) fail('v4/vigilant.html: ' + name + ' is missing or too large for the web (over 250 KB)');
    }
    for (const phrase of ['The Elder Scrolls V: Skyrim (Bethesda)', 'Original source not found', 'The only game image on this page', 'original drawings made for this page']) {
      if (!plainText.includes(phrase)) fail('v4/vigilant.html: the image credits must say: ' + phrase);
    }
    for (const external of [...main.matchAll(/\bhref="(https:\/\/[^"]+)"/g)].map(item => decode(item[1]))) {
      if (!/^https:\/\/en\.uesp\.net\//.test(external) && external !== 'https://www.youtube.com/watch?v=04nIaNV7d-8' && !/^https:\/\/github\.com\/tiltedphoques\/TiltedEvolution\/issues\/(?:435|365)$/.test(external)) fail('v4/vigilant.html: unexpected outside link ' + external);
    }
    for (const shrine of ['The Two Pillars', 'Hall of the Vigilant', 'Fort Greenwall', "Stendarr's Beacon", 'Temple of the Divines, Solitude']) {
      if (!plainText.includes(shrine)) fail('v4/vigilant.html: shrine list is missing ' + shrine);
    }
    if (!/Which is closest\? The Two Pillars, in Whiterun Hold\./.test(plainText)) fail('v4/vigilant.html: must name the closest shrine to Helgen');
    for (const phrase of ['Not yet tested in play', 'Fan video only', 'Yes, the clip names alchemy, restoration and destruction', 'UESP gives positions, not the bends of the road']) {
      if (!plainText.includes(phrase)) fail('v4/vigilant.html: missing honest label: ' + phrase);
    }
    for (const id of ['card', 'glance', 'key-facts', 'look', 'lore-beliefs', 'lore-traits', 'lore-behaviour', 'lore-hunt', 'lore-relations', 'lore-knowledge', 'lore-history', 'line-to-know', 'quotes-game', 'quotes-books', 'play-breton', 'play-build', 'play-armor', 'shrines', 'road', 'hooks', 'sources']) {
      if (!page.includes('id="' + id + '"')) fail('v4/vigilant.html: missing section ' + id);
    }
    // The character is a Breton man; the card keeps its open name slot.
    if (!/A Breton man\. A Vigilant of Stendarr, from Cyrodiil\./.test(plainText) || !plainText.includes('[NAME]')) fail('v4/vigilant.html: must show a Breton man and keep the [NAME] slot on the card');
    const ownText = [...data.lead, ...data.card.text, JSON.stringify(data.grids.find(g => g.id === 'glance')?.rows ?? '')].join(' ');
    if (/\b(?:she|her|hers)\b/i.test(ownText)) fail('v4/vigilant.html: his own lead, glance and card must never call him her');
    // Callouts, quotes and the crafting note.
    if ((page.match(/<aside class="d-callout">/g) ?? []).length < 5) fail('v4/vigilant.html: at least five callouts are required');
    for (const phrase of ['His vow', 'The closest shrine', 'Heavy armor and his spells']) if (!plainText.includes(phrase)) fail('v4/vigilant.html: missing callout ' + phrase);
    for (const id of ['quotes-game', 'quotes-books']) {
      const rows = data.grids.find(g => g.id === id)?.rows ?? [];
      if (rows.length < 8) fail('v4/vigilant.html: ' + id + ' needs at least eight quotes');
      for (const row of rows) {
        if (!/^\u201c.+\u201d$/.test(row[0]) || !JSON.stringify(row[2]).includes('https://en.uesp.net/')) fail('v4/vigilant.html: every quote needs quote marks and a UESP source: ' + String(row[0]).slice(0, 40));
      }
    }
    if (!plainText.includes('\u201cWalk always in the light, or we will drag you to it.\u201d')) fail('v4/vigilant.html: missing the Vigilant greeting about walking in the light');
    if (!/not in Skyrim/.test(plainText)) fail('v4/vigilant.html: lore books from the online game must be labelled as not in Skyrim');
    for (const phrase of ['Potions he brews and gear he enchants may not pass between players under Skyrim Together', 'Wednesday\u2019s test checks it']) {
      if (!plainText.includes(phrase)) fail('v4/vigilant.html: missing the crafting note: ' + phrase);
    }
    if (/\b(?:Ordinator|Apocalypse|Adamant|Blade and Blunt|Valhalla)\b/.test(plainText)) fail("v4/vigilant.html: lists a mod we don't run");
    const linkers = [...documents].filter(([file, html]) => html.includes('href="vigilant.html"')).map(([file]) => path.relative(dist, file)).sort();
    // Linked from the top navigation (Characters), the Characters sidebar and roster, and Lore builds: every v4 page carries the top link.
    if (!linkers.includes(path.join('v4', 'lore-builds.html')) || !linkers.includes(path.join('v4', 'ledger.html'))) fail('v4/vigilant.html: it must be linked from Lore builds and the roster (found: ' + linkers.join(', ') + ')');
    if (!/<section class="d-section d-card-text" id="card"/.test(page) || !plainText.includes('Name: [NAME], left open.')) fail('v4/vigilant.html: the card text stays, with its open name slot');
  }
}
// Site structure (2026-10-05): Builds, Characters with the roster, Our purpose as chapter 08, a strip that shows only on narrow screens.
{
  const v4 = name => documents.get(path.join(dist, 'v4', name)) ?? '';
  const chapters = audioPages?.chapters ?? [];
  const builds = chapters[4];
  if (builds?.num !== '05' || builds?.label !== 'Builds' || builds?.pages?.map(p => p.title).join('|') !== 'Build ideas|Build sheets|Lore builds') fail('Chapter 05 must be Builds, with Build ideas, Build sheets and Lore builds');
  if (!/aria-current="location"[^>]*>05 · Builds<\/a>/.test(v4('builds.html'))) fail('v4/builds.html: the sidebar must show 05 · Builds');
  if (/Build ideas<\/a><ol class="d-side-subpages"/.test(v4('builds.html')) || /05 · Build ideas/.test(v4('builds.html'))) fail('v4/builds.html: the chapter must not repeat the Build ideas name');
  // Build ideas order: traditional warrior, heavy fighter and bow builds first; necromancer-healer, healer, paladin last. Same order wherever the list repeats.
  const first = ['Two-handed guardian', 'Death knight', 'Stealth ranger'];
  const last = ['Necromancer-healer', 'Healer', 'Paladin'];
  const orders = [];
  for (const [file, id] of [['builds.html', 'builds'], ['build-sheets.html', 'build-sheets']]) {
    const grid = builds?.pages?.find(p => p.file === file)?.grids?.find(g => g.id === id);
    const names = (grid?.rows ?? []).map(row => textOf(row[0]));
    orders.push(names);
    if (names.length < 8 || first.some((n, i) => names[i] !== n) || last.some((n, i) => names[names.length - 3 + i] !== n)) fail(`${file}: build order must start with ${first.join(', ')} and end with ${last.join(', ')}`);
    const page = v4(file);
    const positions = names.map(n => page.indexOf(`<th scope="row">${n}</th>`));
    if (positions.some((p, i) => p < 0 || (i && p < positions[i - 1]))) fail(`${file}: the rendered build rows must follow the source order`);
  }
  if (orders[0].join('|') !== orders[1].join('|')) fail('Build ideas and Build sheets must list builds in the same order');
  // The roster (the old party ledger, same URL) lives in Characters.
  const roster = v4('ledger.html');
  const rosterGrid = audioPages?.characters?.pages?.find(p => p.file === 'ledger.html')?.grids?.find(g => g.id === 'roster');
  if (!rosterGrid || rosterGrid.rows.map(r => r[0]).join() !== 'Kyle,Mac,Skylur,DK') fail('Roster: rows for Kyle, Mac, Skylur and DK are required');
  const kyleRow = textOf(rosterGrid?.rows?.[0] ?? '');
  for (const phrase of ['male Breton', 'Vigilant of Stendarr', 'Healer and protector', 'heavy armor', 'mace and shield', 'Restoration']) if (!kyleRow.includes(phrase)) fail(`Roster: the owner's row must say ${phrase}`);
  if (!/<th scope="row">Kyle<\/th><td data-label="Plays">[^<]*<\/td><td data-label="Page"><a href="vigilant\.html">/.test(roster)) fail('v4/ledger.html: the owner\'s roster row must link his page');
  if (!/<h1\b[^>]*>Roster<\/h1>/.test(roster)) fail('v4/ledger.html: the page title must be Roster');
  for (const name of ['Skylur', 'Mac', 'DK']) if (!roster.includes(`<th scope="row">${name}</th>`)) fail(`v4/ledger.html: missing roster row ${name}`);
  for (const [file, html] of documents) {
    if (/Skyler/.test(html)) fail(`${path.relative(dist, file)}: Skylur is spelled with a U`);
    if (path.dirname(file) === path.join(dist, 'v4') && /Party ledger/i.test(html.replace(/<style[\s\S]*?<\/style>/g, ''))) fail(`${path.relative(dist, file)}: the party ledger is now the roster in Characters`);
  }
  // The strip repeats the sidebar: hidden by default, shown (compact) only where the guide sidebar is collapsed, never with it open.
  const css = fs.existsSync(path.join(dist, 'v4/assets/d.css')) ? fs.readFileSync(path.join(dist, 'v4/assets/d.css'), 'utf8') : '';
  if (!/\.d-page-strip\{display:none/.test(css)) fail('v4/assets/d.css: the page strip must be hidden by default');
  if (!/@media \(max-width:899px\)\{\.d-layout:has\(\.d-guide:not\(\[open\]\)\) \.d-page-strip\{display:flex\}/.test(css)) fail('v4/assets/d.css: the page strip may show only on narrow screens where the sidebar is collapsed');
  if (/\.d-page-strip\{[^}]*display:(?:flex|block)/.test(css.replace(/@media[^{]*\{[^{}]*(?:\{[^}]*\}[^{}]*)*\}/g, ''))) fail('v4/assets/d.css: the page strip must not be visible on wide screens');
  // The absol89 list says what being on it means.
  if (!/Being on absol89&#39;s list means the mod was in his pack, built for game version 1\.6\.1170; it does not prove it works in co-op or on our game version\./.test(v4('absol-list.html')) && !/Being on absol89's list means the mod was in his pack, built for game version 1\.6\.1170; it does not prove it works in co-op or on our game version\./.test(v4('absol-list.html'))) fail('v4/absol-list.html: must say what being on the list means (game version 1.6.1170, not proof for co-op)');
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
    if (headerLinks.length !== 5) fail(`${relative}: header must contain only the home brand, the three top navigation links and the Nexus join link`);
    const topNav = html.match(/<nav class="primary-nav" aria-label="Main">([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const topLinks = navLinks(topNav);
    const expectTop = [['Field guide', audioPages?.chapters?.[0]?.pages?.[0]?.file], ['Characters', audioPages?.characters?.pages?.[0]?.file], ['Audio guide', 'audio-guide.html']];
    if (topLinks.length !== 3 || expectTop.some(([text, href], i) => topLinks[i]?.text !== text || topLinks[i]?.href !== href)) fail(`${relative}: top navigation must be Field guide, Characters, Audio guide`);
    if (!/<header\b[\s\S]*?<\/a><nav class="primary-nav"[\s\S]*?<\/nav><a class="leave-link d-join"/.test(html)) fail(`${relative}: header order must be brand, top navigation, Join us`);
    if (!headerLinks.some(([, attributes, href]) => /class="brand"/.test(attributes) && href === 'index.html')) fail(`${relative}: header brand must link home`);
    if (!headerLinks.some(([, attributes, href, body]) => /class="[^"]*\bd-join\b/.test(attributes) && decode(href) === audioPages?.collectionUrl && compactText(decode(body.replace(/<[^>]*>/g, ' '))) === 'Join us · setup on Nexus')) fail(`${relative}: header must retain Join us · setup on Nexus and its collection link`);
    for (const [, attributes, href] of headerLinks) {
      if (href.startsWith('leave-now.html')) fail(`${relative}: header must not link to Leave now`);
      if (/^(?:index\.html(?:[?#]|$)|\.\/|\/$)/.test(href) && !/class="brand"/.test(attributes)) fail(`${relative}: only the header brand may link home`);
    }
    if (!file.endsWith(`${path.sep}index.html`) && !file.endsWith(`${path.sep}audio-guide.html`) && !/<aside class="d-side"[^>]*><details class="d-guide" open><summary class="d-side-title">/.test(html)) fail(`${relative}: shared collapsible guide missing`);
    if (file.endsWith(`${path.sep}audio-guide.html`) && /<aside class="d-side"/.test(html)) fail(`${relative}: the Audio guide has no sidebar`);
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
