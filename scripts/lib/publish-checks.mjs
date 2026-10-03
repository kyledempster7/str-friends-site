import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export const account = 'kyledempster7';
export const identity = { name: account, email: `${account}@${'users.noreply.github.com'}` };
export const repository = `${account}/str-friends-site`;
export const liveBase = new URL(`https://${account}.github.io/str-friends-site/`);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parsePasswords(ini) {
  const found = new Map();
  for (const line of ini.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*((?:s)?(?:admin)?password)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const quoted = match[2].match(/^(["'])(.*?)\1\s*(?:[;#].*)?$/);
    const value = quoted ? quoted[2] : match[2].replace(/\s+[;#].*$/, '').trim();
    found.set(/admin/i.test(match[1]) ? 'admin' : 'server', value);
  }
  if (!found.has('server') || !found.has('admin') || [...found.values()].some(value => !value)) {
    throw new Error('Both nonempty server and admin passwords must be readable from STServer.ini; values withheld.');
  }
  return [...new Set(found.values())];
}

function decode(text) {
  let result = text.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => {
    const point = parseInt(hex ?? dec, hex ? 16 : 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/&(?:commat|colon|sol|bsol|period);/gi, value => ({ '&commat;': '@', '&colon;': ':', '&sol;': '/', '&bsol;': '\\', '&period;': '.' })[value.toLowerCase()]);
  result = result.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\\\/g, '\\');
  try { result = decodeURIComponent(result); } catch { /* Unencoded percent signs are ordinary prose. */ }
  return result;
}

export function privacyFindings(bytes, secrets, { allowIdentity = false } = {}) {
  const raw = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const variants = [raw, decode(raw), Buffer.isBuffer(bytes) ? bytes.toString('utf16le') : raw];
  const labels = new Set();
  for (const text of variants) {
    for (const secret of secrets) {
      const forms = [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1), Buffer.from(secret).toString('base64')];
      if (forms.some(form => form && text.includes(form))) labels.add('server/admin password');
    }
    for (const match of text.matchAll(/[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (!(allowIdentity && match[0] === identity.email)) labels.add('email address');
    }
    if (/(?:\b[A-Z]:[\\/]|file:\/\/|\/(?:Users|home|mnt|Volumes)\/|\\\\[A-Za-z0-9_.-]+\\)/i.test(text)) labels.add('local file path');
    if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text)) labels.add('credential token');
    for (const match of text.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)) {
      if (isIP(match[0]) !== 4) continue;
      const [a, b] = match[0].split('.').map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) labels.add('private/local IP address');
    }
    for (const match of text.matchAll(/(?<![\w:])(?:[a-f0-9]{0,4}:){2,}[a-f0-9:.%]+/gi)) {
      const ip = match[0].split('%')[0].toLowerCase();
      if (isIP(ip) !== 6) continue;
      if (/^(?:f[cd]|fe[89ab])/.test(ip) || ip === ['', '', '1'].join(':') || ip === '::' || ip.startsWith('::ffff:')) labels.add('private/local IP address');
    }
  }
  return [...labels].sort();
}

export async function treeManifest(directory) {
  const root = await fs.realpath(directory);
  const result = new Map();
  async function walk(folder) {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      const location = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error('Publish trees must not contain symbolic links or junctions.');
      if (item.isDirectory()) await walk(location);
      else if (item.isFile()) result.set(path.relative(root, location).split(path.sep).join('/'), sha256(await fs.readFile(location)));
      else throw new Error('Unsupported file in publish tree.');
    }
  }
  await walk(root);
  return new Map([...result].sort(([a], [b]) => a.localeCompare(b)));
}

export function manifestDifference(expected, actual) {
  return [...new Set([...expected.keys(), ...actual.keys()])].filter(name => expected.get(name) !== actual.get(name));
}

export async function mirrorDist(root) {
  const dist = path.join(root, 'dist'), docs = path.join(root, 'docs');
  const expected = await treeManifest(dist);
  if (!expected.size || !expected.has('index.html')) throw new Error('dist is empty or lacks index.html.');
  // Resolve and contain the deletion target before recursively replacing it.
  const resolvedRoot = await fs.realpath(root);
  const stat = await fs.lstat(docs).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (stat) {
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(docs) !== path.join(resolvedRoot, 'docs')) throw new Error('Unsafe docs destination; mirror refused.');
    await treeManifest(docs); // Reject nested links before any deletion.
    await fs.rm(docs, { recursive: true });
  }
  await fs.cp(dist, docs, { recursive: true });
  const actual = await treeManifest(docs);
  if (manifestDifference(expected, actual).length) throw new Error('dist/docs parity failed.');
  return expected;
}

export async function compareLive(manifest, { base = liveBase, fetcher = fetch, deadline = Date.now() + 60000 } = {}) {
  const html = [...manifest].filter(([name]) => name.endsWith('.html'));
  const failures = [];
  let matched = 0;
  // Bounded concurrency keeps a full 41-page pass quick without hammering Pages.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, html.length) }, async () => {
    while (cursor < html.length) {
      const [name, hash] = html[cursor++];
      const url = new URL(name.split('/').map(encodeURIComponent).join('/'), base);
      url.searchParams.set('build', hash);
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('deadline');
        const response = await fetcher(url, { headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(Math.min(15000, remaining)) });
        // GitHub Pages serves the real custom error document with status 404.
        if (!response.ok && !(name === '404.html' && response.status === 404)) throw new Error('HTTP failure');
        if (sha256(Buffer.from(await response.arrayBuffer())) === hash) matched++;
        else failures.push(name);
      } catch { failures.push(name); }
    }
  }));
  return { total: html.length, matched, failures: failures.sort() };
}
