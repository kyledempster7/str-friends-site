import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const epicId = '2e965f62-2d96-4a52-a5df-faad6c8f4ac6';
const textOf = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(textOf).join(' ') : value && typeof value === 'object'
    ? Object.entries(value).filter(([key]) => !/href|url/i.test(key)).map(([, v]) => textOf(v)).join(' ') : '';
const plain = value => textOf(value).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`_]/g, '').replace(/[–—]/g, '-');
const normalized = value => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const modAliases = [
  ['Skyrim Together Reborn', 'Skyrim Together'],
  ['SKSE64', 'SKSE', 'Skyrim Script Extender (SKSE)'],
  ['Address Library', 'Address Library All in One', 'Address Library for SKSE Plugins'],
  ['Mortal Enemies SE', 'Mortal Enemies'],
  ['True Directional Movement', 'True Directional Movement (TDM)'],
  ['Better Third Person Selection', 'Better Third Person Selection (BTPS)'],
  ['Imperious', 'Imperious - Races of Skyrim'],
];
const canonicalMod = value => modAliases.find(group => group.some(alias => normalized(alias) === normalized(value)))?.[0] ?? plain(value).trim();
const sorted = values => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const difference = (a, b) => a.filter(value => !b.includes(value));

// Atomic restrictions: grouped prose can cover several entries, but a mere
// mention or "untested" is deliberately not interpreted as a quarantine.
const holdDefinitions = [
  ['strong-reflexes-2', 'Strong Reflexes rank 2', /strong reflexes (?:rank )?2/i],
  ['steady-hand-1', 'Steady Hand rank 1', /steady hand(?:.{0,30}(?:rank 1|whole|branch|both ranks))/i],
  ['steady-hand-2', 'Steady Hand rank 2', /steady hand(?:.{0,60}(?:rank 2|whole|branch|both ranks))/i],
  ['dark-souls-2', 'Dark Souls rank 2', /dark souls (?:rank )?2/i],
  ['dragonborn-4-drum', 'Dragonborn rank 4 drum', /dragonborn(?: speech)? ranks? 4/i],
  ['dragonborn-5-merchant', 'Dragonborn rank 5 merchant', /dragonborn(?: speech)? ranks? (?:5|4\s*(?:-|and)\s*5)|rank 5.{0,20}merchant/i],
  ['torch-auto-unlock', 'Torch auto-unlock', /torch.{0,24}(?:unlock|lock)|locks (?:are |remain )?(?:manually picked|picked manually)/i],
  ['extra-summons', 'More than one active summon', /one (?:controlled |active )?summon per player|summon limit remains one per player/i],
  ['resurgence', 'Resurgence', /resurgence/i],
  ['red-sand-dance', 'Red Sand Dance', /red sand dance/i],
  ['contingency', 'Contingency', /contingency/i],
  ['beast-tongue', 'Beast Tongue', /beast tongue/i],
  ['spirit-walk', 'Spirit Walk', /spirit walk/i],
  ['mark', 'Mark', /\bmark\b/i], ['recall', 'Recall', /\brecall\b/i],
  ['corpse-reanimation', 'Corpse reanimation', /corpse (?:reanimation|raising)/i],
];
const holdName = id => holdDefinitions.find(([key]) => key === id)?.[1] ?? id;
const restrictionLanguage = /\b(?:held|holds?|quarantin\w*|skip|don't use|remain excluded)\b|one (?:controlled |active )?summon per player|summon limit remains one|locks (?:are |remain )?(?:manually picked|picked manually)/i;

export function proseHolds(blocks, { warnings = [] } = {}) {
  const found = new Set();
  for (const input of blocks) {
    const block = plain(typeof input === 'string' ? input : input.text);
    if (/^\s*-?\s*still untested:/i.test(block)) continue;
    for (const clause of block.split(/[.;\n]|\s+but\s+/i)) {
      const mentioned = holdDefinitions.filter(([, , expression]) => expression.test(clause));
      if (!mentioned.length) continue;
      const cleared = /(?:no longer|not) (?:held|quarantined)|(?:hold|quarantine)(?: has been| is)? (?:lifted|removed)|\b(?:cleared|unquarantined)\b|(?<!not )\ballowed\b/i.test(clause);
      if (cleared) {
        if (mentioned.length > 1 && restrictionLanguage.test(clause)) warnings.push(`Mixed restriction wording for ${mentioned.map(([, name]) => name).join(', ')}; quarantine membership not inferred from that clause.`);
        continue;
      }
      if (!restrictionLanguage.test(clause) && !input.impliedHold) continue;
      for (const [id] of mentioned) found.add(id);
    }
  }
  return sorted(found);
}

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => /^#{1,6} /.test(line) && line.replace(/^#+ /, '').trim() === heading);
  if (start < 0) return '';
  const depth = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((line, i) => i > start && new RegExp(`^#{1,${depth}} `).test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

function firstColumn(markdown, header) {
  const result = [];
  let table = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(x => plain(x).trim());
      if (cells[0] === header) { table = true; continue; }
      if (table && cells[0] && !/^[-: ]+$/.test(cells[0])) result.push(cells[0]);
    } else { table = false; }
  }
  return result;
}

const revisions = value => [...new Set([...plain(value).matchAll(/\brevision\s+(\d+)\b/gi)].map(match => Number(match[1])))].sort((a, b) => a - b);
export function catalogRevisions(catalog) {
  const explicit = catalog.collectionRevision;
  if (explicit !== undefined && (!Number.isInteger(explicit) || explicit < 1)) throw new Error('Invalid collection revision');
  // Keep prose evidence too, so metadata cannot hide a contradictory revision.
  return [...new Set([...revisions(catalog.entries), ...(explicit === undefined ? [] : [explicit])])].sort((a, b) => a - b);
}
const source = (label, facts) => ({ label, ...facts });

export function readSharedFacts({ root = repoRoot, artifacts = process.env.STR_ARTIFACTS_ROOT ?? path.join(os.homedir(), '.traycer', 'epics', epicId, 'artifacts'), brain = process.env.STR_BRAIN_ROOT ?? path.join(process.env.SystemDrive ?? 'C:', path.sep, 'Modding', 'STR-Kit', 'brain') } = {}) {
  const sources = [], warnings = [];
  function read(label, filename, adapter, json = false) {
    try {
      const content = fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '');
      sources.push(source(label, adapter(json ? JSON.parse(content) : content)));
    } catch (error) {
      warnings.push(`${label}: skipped (${error.code === 'ENOENT' ? 'missing source' : 'unreadable source or changed schema'}).`);
    }
  }
  for (const filename of ['src/content/catalog.json', 'src/variants/v4/content/catalog.json', 'src/variants/v2b/content/catalog.json']) {
    read(filename, path.join(root, filename), catalog => ({
      mods: catalog.entries.filter(entry => entry.category === 'mod').map(entry => canonicalMod(entry.name)),
      holds: sorted(catalog.entries.filter(entry => entry.status === 'hold').map(entry => entry.id)),
      revisions: catalogRevisions(catalog),
      catalog: catalog.entries.map(({ id, name, category, status }) => ({ id, name, category, status })),
      scope: 'catalog mod records (a partial index is reported as a coverage gap)',
    }), true);
  }
  read('website grids', path.join(root, 'src/variants/v4/grids.json'), document => {
    const mods = document.grids.find(grid => grid.id === 'mods');
    if (!mods) throw new Error('Missing mods grid');
    // Only labels and co-op rules, never vanilla effect descriptions.
    const blocks = document.grids.filter(grid => ['skills', 'races', 'spells', 'cannot-use'].includes(grid.id))
      .flatMap(grid => grid.rows.map(row => textOf([row[0], row.at(-1)])));
    const notes = [];
    return { mods: mods.rows.map(row => canonicalMod(textOf(row[0]))), count: Number(plain(mods.note).match(/(\d+) installed mods/)?.[1]),
      holds: proseHolds(blocks, { warnings: notes }), revisions: revisions(document.grids.map(grid => grid.note ?? '')), notes };
  }, true);
  read('installed mod list', path.join(artifacts, 'delivery-plan', '06-mod-list-v1', 'index.md'), markdown => {
    const notes = [];
    return { mods: firstColumn(section(markdown, 'Installed release'), 'Installed mod').map(canonicalMod),
      count: Number(plain(markdown).match(/installed campaign pack is (\d+) mods/i)?.[1]),
      holds: proseHolds(section(markdown, 'Adopted campaign restrictions').split(/\r?\n/), { warnings: notes }),
      revisions: revisions(markdown.split(/^## /m)[0]), notes };
  });
  read('mod guide', path.join(artifacts, 'mod-guide', 'index.md'), markdown => {
    const grid = section(markdown, 'Grid');
    const intro = markdown.split(/^## /m)[0];
    // The guide intentionally omits foundation rows; count named exclusions too.
    const exclusions = plain(intro).match(/server run \(([^)]+)\)/i)?.[1]?.split(',').map(x => canonicalMod(x.trim())) ?? [];
    const published = plain(intro).match(/revision (\d+)[^;.]*?\bis published/i);
    const notes = /strong reflexes/i.test(grid) && !/strong reflexes(?:\*\*)? rank 2/i.test(grid)
      ? ['Strong Reflexes is named without rank 2; Block 50 alone does not identify the quarantined rank.'] : [];
    return { mods: [...firstColumn(grid, 'Mod').map(canonicalMod), ...exclusions],
      count: Number(plain(intro).match(/revision 6 \((\d+) mods\)/i)?.[1]),
      holds: proseHolds(grid.split(/\r?\n/), { warnings: notes }), revisions: published ? [Number(published[1])] : revisions(intro), notes };
  });
  read('STR-Kit brain/BRAIN.md', path.join(brain, 'BRAIN.md'), markdown => {
    const notes = [];
    const blocks = section(markdown, 'Gameplay holds').split(/\r?\n/).flatMap(line => {
      // This bullet lists adopted BVP holds in its first sentence without
      // repeating "held" for each semicolon item. Later commentary is explicit.
      if (/^- \*\*Better Vanilla Perks:\*\*/.test(line)) {
        const dot = line.indexOf('.');
        return [{ text: line.slice(0, dot < 0 ? undefined : dot), impliedHold: true }, dot < 0 ? '' : line.slice(dot + 1)];
      }
      return [line];
    });
    return { mods: firstColumn(section(markdown, 'Installed baseline'), 'Installed mod').map(canonicalMod),
      count: Number(plain(section(markdown, 'Current release')).match(/(\d+) mods/)?.[1]),
      holds: proseHolds(blocks, { warnings: notes }),
      revisions: revisions(section(markdown, 'Current release').split(/Revision 5 is historical/i)[0]), notes };
  });
  read('STR-Kit brain/SESSIONS.md', path.join(brain, 'SESSIONS.md'), markdown => {
    // Historical revisions elsewhere in the log are not current-state claims.
    const release = section(markdown, 'Release published');
    return { revisions: revisions(release), count: Number(plain(release).match(/(\d+) mods/)?.[1]),
      scope: 'release record only; historical sessions, immutable observations and community reports are not current installed-state lists' };
  });
  return { sources, warnings };
}

export function compareSharedFacts({ sources, warnings = [] }) {
  const findings = [];
  const add = (label, fact, detail) => findings.push({ source: label, fact, detail });
  const installed = sources.find(item => item.label === 'installed mod list') ?? sources.find(item => item.label === 'STR-Kit brain/BRAIN.md') ?? sources.find(item => item.label === 'website grids');
  const catalog = sources.find(item => item.label === 'src/variants/v4/content/catalog.json') ?? sources.find(item => item.catalog);
  if (!installed) warnings.push('No installed-mod reference could be read; installed names and revision cannot be compared.');
  if (!catalog) warnings.push('No catalog reference could be read; quarantine comparison unavailable.');
  const expectedMods = sorted(installed?.mods ?? []);
  const expectedHolds = catalog?.holds ?? [];
  const expectedRevisions = installed?.revisions ?? [];
  for (const item of sources) {
    if (item.mods) {
      const actual = sorted(item.mods);
      if (actual.length !== 19) add(item.label, 'installed mods', `${actual.length}/19 names recorded${item.scope ? `; ${item.scope}` : ''}.`);
      const duplicates = item.mods.filter((name, i) => item.mods.indexOf(name) !== i);
      if (duplicates.length) add(item.label, 'installed mods', `Duplicate names: ${sorted(duplicates).join(', ')}.`);
      if (expectedMods.length) {
        const missing = difference(expectedMods, actual), extra = difference(actual, expectedMods);
        if (missing.length) add(item.label, 'installed mods', `Missing versus ${installed.label}: ${missing.join(', ')}.`);
        if (extra.length) add(item.label, 'installed mods', `Extra versus ${installed.label}: ${extra.join(', ')}.`);
      }
    }
    if ('count' in item && (!Number.isFinite(item.count) || item.count !== 19)) add(item.label, 'installed count', `Declared count ${Number.isFinite(item.count) ? item.count : 'not found'}; expected 19.`);
    if (item.holds && catalog) {
      const missing = difference(expectedHolds, item.holds), extra = difference(item.holds, expectedHolds);
      if (missing.length) add(item.label, 'quarantine', `Not explicitly quarantined versus ${catalog.label}: ${missing.map(holdName).join(', ')}.`);
      if (extra.length) add(item.label, 'quarantine', `Additional quarantines versus ${catalog.label}: ${extra.map(holdName).join(', ')}.`);
    }
    if (!item.revisions.length) add(item.label, 'collection revision', 'No current revision could be extracted; check source/schema.');
    else if (expectedRevisions.length && JSON.stringify(item.revisions) !== JSON.stringify(expectedRevisions)) add(item.label, 'collection revision', `Reports ${item.revisions.join(', ')}; ${installed.label} reports ${expectedRevisions.join(', ')}.`);
    for (const note of item.notes ?? []) add(item.label, 'quarantine ambiguity', note);
    if (item.catalog && catalog && item !== catalog) {
      const actual = new Map(item.catalog.map(entry => [entry.id, entry]));
      const expected = new Map(catalog.catalog.map(entry => [entry.id, entry]));
      for (const [id, entry] of expected) {
        if (entry.category !== 'mod' && entry.status !== 'hold') continue;
        if (!actual.has(id)) add(item.label, 'catalog', `Missing entry: ${id}.`);
        else for (const field of ['name', 'category', 'status']) if (actual.get(id)[field] !== entry[field]) add(item.label, 'catalog', `${id}: ${field} differs from v4 catalog.`);
      }
      for (const [id, entry] of actual) if ((entry.category === 'mod' || entry.status === 'hold') && !expected.has(id)) add(item.label, 'catalog', `Additional mod/quarantine entry: ${id}.`);
    }
  }
  return { reference: { installed: installed?.label, quarantines: catalog?.label }, sources, warnings, findings };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--json', '--help'].includes(arg))) throw new Error('Usage: node scripts/check-shared-facts.mjs [--json]');
  if (args.includes('--help')) { console.log('Read-only, warning-only comparison. Optional STR_ARTIFACTS_ROOT and STR_BRAIN_ROOT override local source folders.'); return; }
  const report = compareSharedFacts(readSharedFacts());
  if (args.includes('--json')) { console.log(JSON.stringify(report, null, 2)); return; }
  for (const warning of report.warnings) console.warn(`[shared-facts] WARNING ${warning}`);
  for (const item of report.findings) console.warn(`[shared-facts] WARNING ${item.source} / ${item.fact}: ${item.detail}`);
  console.log(`[shared-facts] ${report.sources.length} sources; ${report.findings.length} discrepancies; ${report.warnings.length} skipped/unavailable checks. Warning-only; no content changed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.warn(`[shared-facts] WARNING check unavailable: ${error.message}`); }
}
