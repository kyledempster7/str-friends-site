import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFrozen } from './lib/frozen.mjs';
import { stripVersionBar, VERSIONS } from './lib/version-bar.mjs';

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

const allFiles = walk(root);
for (const file of allFiles) privacy(path.relative(root, file), fs.readFileSync(file).toString('utf8'));
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
if (published.reduce((total, file) => total + fs.statSync(file).size, 0) > 2 * 1024 * 1024) fail('Static output exceeds the two-megabyte budget');
const decode = (value) => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const documents = new Map(htmlFiles.map((file) => [path.resolve(file), fs.readFileSync(file, 'utf8')]));
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: 'Hold — do not use', blocked: 'Blocked' };
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
for (const [file, html] of documents) {
  const relative = path.relative(dist, file);
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
