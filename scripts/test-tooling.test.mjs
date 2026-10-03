import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parsePasswords, privacyFindings, sha256, treeManifest, mirrorDist, manifestDifference, compareLive, identity } from './lib/publish-checks.mjs';
import { proseHolds, compareSharedFacts, readSharedFacts } from './check-shared-facts.mjs';

test('INI password reading includes quoted punctuation and rejects absent/empty credentials', () => {
  assert.deepEqual(parsePasswords('[general]\nsPassword = "dummy;#pass" ; comment\nsAdminPassword = another-test\n'), ['dummy;#pass', 'another-test']);
  assert.throws(() => parsePasswords('sPassword = "dummy"'));
  assert.throws(() => parsePasswords('sPassword = ""\nsAdminPassword="dummy"'));
});

test('privacy scan redacts by category and catches encoded secrets, addresses and paths', () => {
  const secret = ['dummy', 'pass', '&?', 'word'].join('');
  for (const value of [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]) assert.ok(privacyFindings(value, [secret]).includes('server/admin password'));
  for (const octets of [[10, 2, 3, 4], [172, 16, 2, 3], [172, 31, 2, 3], [192, 168, 2, 3], [100, 64, 2, 3], [100, 127, 2, 3], [127, 0, 0, 1], [169, 254, 2, 3]]) assert.ok(privacyFindings(octets.join('.'), []).includes('private/local IP address'));
  for (const octets of [[172, 32, 2, 3], [100, 128, 2, 3], [999, 1, 2, 3]]) assert.deepEqual(privacyFindings(octets.join('.'), []), []);
  for (const parts of [['fd00', '', '12'], ['fe80', '', '12'], ['', '', '1']]) assert.ok(privacyFindings(parts.join(':'), []).includes('private/local IP address'));
  const email = ['person', 'example.invalid'].join('@');
  assert.ok(privacyFindings(email, []).includes('email address'));
  assert.ok(privacyFindings(email.replace('@', '&#64;'), []).includes('email address'));
  assert.deepEqual(privacyFindings(identity.email, [], { allowIdentity: true }), []);
  assert.ok(privacyFindings(identity.email, []).includes('email address'));
  const local = ['C:', 'Users', 'example', 'file'].join('\\');
  assert.ok(privacyFindings(local, []).includes('local file path'));
  assert.ok(privacyFindings(JSON.stringify(local), []).includes('local file path'));
});

test('privacy scan catches form-encoded passwords and expanded IPv6 loopback', () => {
  const secret = ['Synthetic', 'Password&42'].join(' ');
  assert.ok(privacyFindings(new URLSearchParams({ password: secret }).toString(), [secret]).includes('server/admin password'));
  const expanded = [0, 0, 0, 0, 0, 0, 0, 1].join(':');
  assert.ok(privacyFindings(expanded, []).includes('private/local IP address'));
});

test('mirror removes stale output, preserves hidden files and proves bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'str-tooling-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'dist'));
  await fs.mkdir(path.join(root, 'docs'));
  await fs.writeFile(path.join(root, 'dist', 'index.html'), '<html>new</html>');
  await fs.writeFile(path.join(root, 'dist', '.nojekyll'), '');
  await fs.writeFile(path.join(root, 'docs', 'old.html'), 'old');
  const expected = await mirrorDist(root);
  assert.deepEqual(manifestDifference(expected, await treeManifest(path.join(root, 'docs'))), []);
  await assert.rejects(fs.access(path.join(root, 'docs', 'old.html')));
  assert.ok(expected.has('.nojekyll'));
  await fs.writeFile(path.join(root, 'docs', 'index.html'), 'tampered');
  assert.deepEqual(manifestDifference(expected, await treeManifest(path.join(root, 'docs'))), ['index.html']);
});

test('mirror refuses a junction destination without deleting its target', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'str-tooling-link-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'dist'));
  await fs.mkdir(path.join(root, 'outside'));
  await fs.writeFile(path.join(root, 'dist', 'index.html'), 'new');
  await fs.writeFile(path.join(root, 'outside', 'keep'), 'preserved');
  await fs.symlink(path.join(root, 'outside'), path.join(root, 'docs'), 'junction');
  await assert.rejects(mirrorDist(root), /Unsafe docs/);
  assert.equal(await fs.readFile(path.join(root, 'outside', 'keep'), 'utf8'), 'preserved');
});

test('live comparison checks all HTML including custom 404 and rejects stale or failed pages', async () => {
  const manifest = new Map([['index.html', sha256('home')], ['v4/a.html', sha256('page')], ['404.html', sha256('error')], ['asset.css', sha256('ignored')]]);
  const fetcher = async url => new Response(url.pathname.endsWith('404.html') ? 'error' : url.pathname.endsWith('a.html') ? 'stale' : 'home', { status: url.pathname.endsWith('404.html') ? 404 : 200 });
  const result = await compareLive(manifest, { fetcher });
  assert.equal(result.total, 3);
  assert.equal(result.matched, 2);
  assert.deepEqual(result.failures, ['v4/a.html']);
  const failed = await compareLive(manifest, { fetcher: async () => { throw new Error('offline'); } });
  assert.equal(failed.matched, 0);
  assert.equal(failed.failures.length, 3);
});

test('grouped restrictions expand without interpreting untested healing as held', () => {
  const result = proseHolds(['Strong Reflexes rank 2 and the whole Steady Hand branch remain held.', 'Dragonborn Speech ranks 4 and 5 remain held.', 'Mark/Recall and corpse reanimation remain held.', 'Resurgence scaling is untested.', '- **Still untested:** Resurgence scaling. A community positive report does not lift a hold.', 'Initial summon limit remains one per player; locks are picked manually.']);
  assert.ok(result.includes('strong-reflexes-2'));
  assert.ok(result.includes('steady-hand-1') && result.includes('steady-hand-2'));
  assert.ok(result.includes('dragonborn-4-drum') && result.includes('dragonborn-5-merchant'));
  assert.ok(result.includes('mark') && result.includes('recall'));
  assert.ok(result.includes('extra-summons') && result.includes('torch-auto-unlock'));
  assert.ok(!result.includes('resurgence'));
});

test('shared-facts reports changed names, counts, quarantines and revisions together', () => {
  const mods = Array.from({ length: 19 }, (_, i) => `Mod ${i}`);
  const sources = [
    { label: 'installed mod list', mods, count: 19, holds: ['mark'], revisions: [6] },
    { label: 'src/variants/v4/content/catalog.json', catalog: [], mods, holds: ['mark'], revisions: [6] },
    { label: 'changed source', mods: [...mods.slice(1), 'Unexpected'], count: 18, holds: ['recall'], revisions: [5] },
  ];
  const { findings } = compareSharedFacts({ sources });
  assert.ok(findings.some(x => x.detail.includes('Missing') && x.detail.includes('Mod 0')));
  assert.ok(findings.some(x => x.detail.includes('Extra') && x.detail.includes('Unexpected')));
  assert.equal(findings.filter(x => x.source === 'changed source' && x.fact === 'quarantine').length, 2);
  assert.ok(findings.some(x => x.fact === 'collection revision'));
  assert.ok(findings.some(x => x.fact === 'installed count'));
});

test('missing external sources produce warnings while available repo comparisons continue', () => {
  const result = readSharedFacts({ artifacts: path.join(os.tmpdir(), 'absent-str-artifacts'), brain: path.join(os.tmpdir(), 'absent-str-brain') });
  assert.equal(result.sources.length, 4);
  assert.equal(result.warnings.length, 4);
  assert.ok(compareSharedFacts(result).findings.length > 0);
});
