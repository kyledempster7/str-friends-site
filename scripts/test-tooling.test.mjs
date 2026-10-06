import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parsePasswords, privacyFindings, sha256, treeManifest, mirrorDist, manifestDifference, compareLive, identity, repository, verifyIdentityLog, verifyRemoteUrls, complaintScan, doneCheck, releaseGateDefault } from './lib/publish-checks.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { proseHolds, compareSharedFacts, readSharedFacts, catalogRevisions } from './check-shared-facts.mjs';
import { checkCommittedDocs } from './publish.mjs';
import { outputBudgetFindings } from './lib/output-budgets.mjs';
import './lib/v4-vote-core.js';

test('audio clips do not consume the 2 MiB static output budget', () => {
  assert.deepEqual(outputBudgetFindings([
    { name: 'v4/index.html', size: 2 * 1024 * 1024 },
    { name: 'v4/audio/first.mp3', size: 913_000 },
    { name: 'v4/audio/second.mp3', size: 913_000 },
  ]), []);
});

test('non-audio output still fails at one byte over 2 MiB, including files in audio directories', () => {
  assert.deepEqual(outputBudgetFindings([
    { name: 'v4/index.html', size: 2 * 1024 * 1024 },
    { name: 'v4/audio/transcript.txt', size: 1 },
    { name: 'v4/audio/first.mp3', size: 913_000 },
  ]), ['Non-audio static output exceeds the two-megabyte budget']);
});

test('all published audio shares an inclusive 300 MB budget across directories', () => {
  const clips = Array.from({ length: 30 }, (_, i) => ({ name: `v${i % 2 ? '4' : '2b'}/audio/clip-${i}.mp3`, size: 10_000_000 }));
  assert.deepEqual(outputBudgetFindings(clips), []);
  assert.deepEqual(outputBudgetFindings([...clips, { name: 'extra.MP3', size: 1 }]), ['Total audio output exceeds 300 MB']);
});

test('both output budget violations are reported independently', () => {
  assert.deepEqual(outputBudgetFindings([
    { name: 'index.html', size: 2 * 1024 * 1024 + 1 },
    { name: 'audio.mp3', size: 300_000_001 },
  ]), ['Non-audio static output exceeds the two-megabyte budget', 'Total audio output exceeds 300 MB']);
});

test('catalog revision metadata supplements prose without hiding conflicts', () => {
  assert.deepEqual(catalogRevisions({ collectionRevision: 6, entries: [] }), [6]);
  assert.deepEqual(catalogRevisions({ entries: [{ detail: 'Our revision 6 perk overhaul.' }] }), [6]);
  assert.deepEqual(catalogRevisions({ collectionRevision: 6, entries: [{ detail: 'revision 6' }] }), [6]);
  assert.deepEqual(catalogRevisions({ collectionRevision: 6, entries: [{ detail: 'revision 5 and revision 10' }] }), [5, 6, 10]);
  for (const value of [0, -1, 6.5, '6', null]) assert.throws(() => catalogRevisions({ collectionRevision: value, entries: [] }));
});

test('B and D catalog revisions agree and B no longer has a missing-revision finding', () => {
  const input = readSharedFacts({ artifacts: path.join(os.tmpdir(), 'absent-str-artifacts'), brain: path.join(os.tmpdir(), 'absent-str-brain') });
  const label = 'src/variants/v2b/content/catalog.json';
  assert.deepEqual(input.sources.find(source => source.label === label).revisions, [7]);
  assert.deepEqual(input.sources.find(source => source.label === 'src/variants/v4/content/catalog.json').revisions, []); // v4 pages carry no revision numbers (only patch-notes.html does)
  assert.ok(!compareSharedFacts(input).findings.some(finding => finding.source === label && finding.fact === 'collection revision'));
});

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

test('privacy scan decodes common entities and percent runs beside ordinary percentages', () => {
  for (const [value, secret] of [['dummy&amp;pass', 'dummy&pass'], ['dummy&quot;pass', 'dummy"pass'], ['dummy&lt;pass', 'dummy<pass']]) {
    assert.ok(privacyFindings(value, [secret]).includes('server/admin password'));
  }
  const email = ['person', 'example.invalid'].join('@');
  assert.ok(privacyFindings(`<p>30% boost</p><p>${encodeURIComponent(email)}</p>`, []).includes('email address'));
  const local = ['C:', 'Users', 'example', 'file'].join('\\');
  assert.ok(privacyFindings(`30% boost ${encodeURIComponent(local)}`, []).includes('local file path'));
  const secret = 'Synthetic42';
  const unicodeEscaped = [...secret].map(char => '\\u' + char.codePointAt(0).toString(16).padStart(4, '0')).join('');
  assert.ok(privacyFindings(unicodeEscaped, [secret]).includes('server/admin password'));
});

test('binary scans distinguish random path markers from readable metadata and secrets', () => {
  const marker = ['C:', ''].join('\\');
  const noise = Buffer.concat([Buffer.from([255, 3]), Buffer.from(marker), Buffer.from([255, 3])]);
  assert.deepEqual(privacyFindings(noise, []), []);
  const local = ['C:', 'Users', 'example', 'file'].join('\\');
  const metadata = Buffer.concat([Buffer.from([255, 3]), Buffer.from(local), Buffer.from([255])]);
  assert.ok(privacyFindings(metadata, []).includes('local file path'));
  const secret = 'Synthetic42';
  assert.ok(privacyFindings(Buffer.concat([noise, Buffer.from(secret), noise]), [secret]).includes('server/admin password'));
  // A short printable run inside compressed audio is chance, not a path.
  const shortRun = Buffer.concat([Buffer.from([255, 3]), Buffer.from(['`,C', ':', '/F`B'].join('')), Buffer.from([255, 3])]);
  assert.deepEqual(privacyFindings(shortRun, []), []);
});

test('UNC scan requires a real share and does not mistake escaped regex classes for paths', () => {
  const slash = String.fromCharCode(92);
  const unc = slash.repeat(2) + ['machine', 'share', 'file'].join(slash);
  for (const value of [unc, JSON.stringify(unc)]) assert.ok(privacyFindings(value, []).includes('local file path'));
  const regexSource = '[' + slash.repeat(2) + 's' + slash.repeat(2) + 'S]*?';
  assert.deepEqual(privacyFindings(regexSource, []), []);
});

test('identity parser cannot mistake embedded tabs for approved fields', () => {
  const hash = 'a'.repeat(40);
  const valid = [hash, identity.name, identity.email, identity.name, identity.email, ''].join('\0');
  assert.equal(verifyIdentityLog(valid + valid), 2);
  const maliciousName = [identity.name, identity.email, identity.name, identity.email].join('\t');
  assert.throws(() => verifyIdentityLog([hash, maliciousName, ['wrong', 'example.invalid'].join('@'), 'Wrong', 'wrong', ''].join('\0')), /unapproved/);
  assert.throws(() => verifyIdentityLog(valid.replace(/\0/g, '\t')), /parse/);
});

test('remote validation rejects alternate and multiple effective push destinations', () => {
  const approved = `https://github.com/${repository}.git`;
  assert.doesNotThrow(() => verifyRemoteUrls(approved, [approved]));
  assert.throws(() => verifyRemoteUrls(approved, ['https://github.com/synthetic-other/site.git']));
  assert.throws(() => verifyRemoteUrls(approved, [approved, approved]));
});

test('committed-byte gate rejects Git normalization and passes generated-byte attributes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'str-tooling-git-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email };
  const git = (...args) => execFileSync('git', args, { cwd: root, env, windowsHide: true, stdio: 'pipe' });
  git('init', '-b', 'feature/test');
  git('config', 'core.autocrlf', 'true');
  await fs.mkdir(path.join(root, 'docs'));
  await fs.writeFile(path.join(root, 'docs', 'index.html'), '<html>test</html>\r\n');
  const manifest = await treeManifest(path.join(root, 'docs'));
  git('add', 'docs');
  git('commit', '-m', 'normalized fixture');
  assert.throws(() => checkCommittedDocs(root, 'HEAD', manifest), /Committed docs bytes differ/);
  await fs.writeFile(path.join(root, '.gitattributes'), 'docs/** -text\n');
  git('add', '--renormalize', 'docs');
  git('add', '.gitattributes');
  git('commit', '-m', 'preserve generated bytes');
  assert.doesNotThrow(() => checkCommittedDocs(root, 'HEAD', manifest));
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

test('live build parity cannot pass an asset-only change against old deployed HTML', async () => {
  const manifest = new Map([['index.html', sha256('same html')], ['asset.css', sha256('new css')], ['.nojekyll', sha256('')]]);
  const urls = [];
  const result = await compareLive(manifest, { allPublicFiles: true, fetcher: async url => {
    urls.push(url.pathname);
    return new Response(url.pathname.endsWith('asset.css') ? 'old css' : 'same html');
  } });
  assert.equal(result.total, 2);
  assert.equal(result.htmlMatched, 1);
  assert.deepEqual(result.failures, ['asset.css']);
  assert.equal(urls.length, 2);
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

test('lifted restrictions and mixed clauses do not silently retain quarantine membership', () => {
  assert.deepEqual(proseHolds(['Resurgence is no longer held.']), []);
  assert.deepEqual(proseHolds(['Mark is allowed; Recall remains held.']), ['recall']);
  const warnings = [];
  assert.deepEqual(proseHolds(['Mark is allowed, Recall remains held.'], { warnings }), []);
  assert.equal(warnings.length, 1);
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

const vote = globalThis.StrVote;
const ballot = (letters) => letters.split('');

test('vote codes round-trip, tolerate chat punctuation and reject typos and swaps', () => {
  const code = vote.encode(ballot('CAEBFD'));
  assert.match(code, /^V1-CAEBFD-\d$/);
  assert.deepEqual(vote.parse(code), { ok: true, ranking: ballot('CAEBFD') });
  assert.equal(vote.parse(code.toLowerCase()).ok, true);
  assert.equal(vote.parse(code.replace(/-/g, '–')).ok, true);
  assert.deepEqual(vote.tokens(`here: "${code}", and (v1-abcdef-${vote.encode(ballot('ABCDEF')).slice(-1)}).`), [code, `v1-abcdef-${vote.encode(ballot('ABCDEF')).slice(-1)}`]);
  // Every adjacent swap changes the check digit, so it is always caught.
  const letters = 'ABCDEF'.split('');
  for (let i = 0; i < 5; i++) {
    const swapped = letters.slice(); [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    assert.equal(vote.parse(code.replace('CAEBFD', swapped.join(''))).ok, false);
    assert.equal(vote.parse(vote.encode(letters).replace('ABCDEF', swapped.join(''))).ok, false);
  }
  assert.equal(vote.parse('V1-AACDEF-0').ok, false);
  assert.equal(vote.parse('V1-ABCDE-0').ok, false);
  assert.throws(() => vote.encode(ballot('AACDEF')));
});

test('runoff: a first-round majority wins at once', () => {
  const result = vote.runoff([ballot('ABCDEF'), ballot('ACBDEF'), ballot('BACDEF')]);
  assert.equal(result.winner, 'A');
  assert.equal(result.rounds.length, 1);
  assert.equal(result.pending, null);
});

test('runoff: orders with no first choices go out together, then ties wait for the group', () => {
  const ballots = [ballot('ABCDEF'), ballot('BACDEF'), ballot('CABDEF'), ballot('DABCEF')];
  const first = vote.runoff(ballots);
  assert.deepEqual(first.rounds[0].out, ['E', 'F']);
  assert.equal(first.winner, null);
  assert.deepEqual(first.pending, ['A', 'B', 'C', 'D']);
  // Group picks: D out (its ballot moves to A), then C out (its ballot moves to A), then A has 3 of 4.
  const done = vote.runoff(ballots, ['D', 'C']);
  assert.equal(done.winner, 'A');
  assert.equal(done.pending, null);
  assert.deepEqual(done.rounds.map((r) => r.out), [['E', 'F'], ['D'], ['C'], []]);
  // A choice that is not among the tied orders does not count.
  assert.deepEqual(vote.runoff(ballots, ['E']).pending, ['A', 'B', 'C', 'D']);
});

test('runoff: a two-way tie for the lead is left to a coin flip or gut pick', () => {
  const ballots = [ballot('ABCDEF'), ballot('ABCDEF'), ballot('BACDEF'), ballot('BACDEF')];
  const waiting = vote.runoff(ballots);
  assert.equal(waiting.winner, null);
  assert.deepEqual(waiting.pending, ['A', 'B']);
  assert.equal(vote.runoff(ballots, ['A']).winner, 'B');
  assert.equal(vote.runoff(ballots, ['B']).winner, 'A');
});

test('runoff: one code decides by its first choice, and a transfer follows later choices', () => {
  assert.equal(vote.runoff([ballot('FEDCBA')]).winner, 'F');
  // C is out by group choice; its ballot moves to its next remaining choice, B, which then has the majority.
  const ballots = [ballot('ABCDEF'), ballot('BACDEF'), ballot('CBADEF')];
  const result = vote.runoff(ballots, ['A', 'C']);
  assert.equal(result.winner, 'B');
});

// --- owner-complaint gate wiring (2026-10-06) ---------------------------------------------------------------
// A stand-in gate is a small node script run with node itself, so these tests need no Python and no network.
async function fakeGate(body) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'str-gate-'));
  const gate = path.join(directory, 'fake_gate.mjs');
  await fs.writeFile(gate, body);
  return { directory, gate, options: { python: process.execPath, gate } };
}
const gateReplies = (lines, code = 0) => `console.log(${JSON.stringify(lines.join('\n'))}); process.exit(${code});`;

test('complaint scan passes only on exit 0 with the SCAN-DIR: PASS line, and hands the gate the folder', async () => {
  const stub = await fakeGate(`if (process.argv[2] !== '--scan-dir' || !process.argv[3]) process.exit(9);\n${gateReplies(['5 complaint checks x 36 built pages: no hits', 'SCAN-DIR: PASS'])}`);
  const result = complaintScan('some/docs/v4', stub.options);
  assert.equal(result.ok, true);
  assert.equal(result.status, 0);
  await fs.rm(stub.directory, { recursive: true, force: true });
});

test('complaint scan fails with the hit listed when the gate exits 1', async () => {
  const stub = await fakeGate(gateReplies(['status-version-words on mods.html x1: ...revision 7 is live...', 'SCAN-DIR: FAIL - fix every hit before pushing'], 1));
  const result = complaintScan('x', stub.options);
  assert.equal(result.ok, false);
  assert.match(result.output, /status-version-words on mods\.html/);
  await fs.rm(stub.directory, { recursive: true, force: true });
});

test('complaint scan fails closed: exit 0 without the PASS line, a crash, and a missing gate are all failures', async () => {
  const quiet = await fakeGate(gateReplies(['nothing useful'], 0));
  assert.equal(complaintScan('x', quiet.options).ok, false);
  const crash = await fakeGate('throw new Error("boom");');
  assert.equal(complaintScan('x', crash.options).ok, false);
  const missing = complaintScan('x', { python: process.execPath, gate: path.join(quiet.directory, 'no-such-gate.py') });
  assert.equal(missing.ok, false);
  assert.match(missing.output, /not found/);
  const noPython = complaintScan('x', { python: path.join(quiet.directory, 'no-such-python'), gate: quiet.gate });
  assert.equal(noPython.ok, false);
  await fs.rm(quiet.directory, { recursive: true, force: true });
  await fs.rm(crash.directory, { recursive: true, force: true });
});

test('done-check needs exit 0, the DONE CHECK: PASS line and a DONE-RECEIPT id; it returns every receipt id', async () => {
  const stub = await fakeGate(`if (process.argv[2] !== '--done-check') process.exit(9);\n${gateReplies(['PASS  owner-complaints-live  DONE-RECEIPT 5f5d4b798458  5 complaint checks x 35 live pages: no hits', 'DONE CHECK: PASS - you may report DONE (quote the DONE-RECEIPT line)'])}`);
  const result = doneCheck(stub.options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.receipts, ['5f5d4b798458']);
  await fs.rm(stub.directory, { recursive: true, force: true });
});

test('done-check fails on a FAIL exit, on a PASS line with no receipt, and when the gate is missing', async () => {
  const failing = await fakeGate(gateReplies(['FAIL  owner-complaints-live  DONE-RECEIPT 0123456789ab  1 complaint hit(s)', 'DONE CHECK: FAIL - not done; fix the hits and re-run'], 1));
  assert.equal(doneCheck(failing.options).ok, false);
  const noReceipt = await fakeGate(gateReplies(['DONE CHECK: PASS'], 0));
  assert.equal(doneCheck(noReceipt.options).ok, false);
  assert.equal(doneCheck({ python: process.execPath, gate: path.join(failing.directory, 'gone.py') }).ok, false);
  await fs.rm(failing.directory, { recursive: true, force: true });
  await fs.rm(noReceipt.directory, { recursive: true, force: true });
});

test('publish --done-check runs only the gate: prints the receipt, exits 0 on PASS and 1 on FAIL, and takes no other option', async () => {
  const publish = fileURLToPath(new URL('./publish.mjs', import.meta.url));
  const pass = await fakeGate(gateReplies(['PASS  owner-complaints-live  DONE-RECEIPT abcdef012345  ok', 'DONE CHECK: PASS - you may report DONE']));
  const fail = await fakeGate(gateReplies(['FAIL  owner-complaints-live  DONE-RECEIPT 111111111111  hit', 'DONE CHECK: FAIL - not done'], 1));
  const run = (stub, args = ['--done-check']) => spawnSync(process.execPath, [publish, ...args], { encoding: 'utf8', env: { ...process.env, STR_PYTHON: process.execPath, STR_RELEASE_GATE: stub.gate } });
  const ok = run(pass);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /"result":"DONE_CHECK_PASS"/);
  assert.match(ok.stdout, /"doneReceipt":"abcdef012345"/);
  const bad = run(fail);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /NOT DONE/);
  assert.doesNotMatch(bad.stdout, /DONE_CHECK_PASS/);
  const mixed = run(pass, ['--done-check', '--dry-run']);
  assert.equal(mixed.status, 1);
  assert.match(mixed.stdout, /stands alone/);
  await fs.rm(pass.directory, { recursive: true, force: true });
  await fs.rm(fail.directory, { recursive: true, force: true });
});

test('publish.mjs runs the scan after the privacy scan and before any commit, and the done-check after the live parity wait', async () => {
  const source = await fs.readFile(new URL('./publish.mjs', import.meta.url), 'utf8');
  const at = text => source.indexOf(text);
  assert.ok(at("phase('privacy scan')") > 0);
  assert.ok(at("complaintScan(builtV4)") > at("phase('privacy scan')"));
  assert.ok(at("complaintScan(builtV4)") < at("git(cwd, ['add', '--', 'docs'])"));
  assert.ok(source.indexOf('doneCheck()', at("phase('wait for live build and HTML parity')")) > at("phase('wait for live build and HTML parity')"));
  assert.ok(at("receipt.result = 'PUBLISHED_AND_VERIFIED'") > at("PUBLISHED_NOT_DONE"));
  // Pushing happens before the done-check, never after the result is declared.
  assert.ok(at("git(cwd, ['push', 'origin', 'HEAD:main'])") < at("receipt.result = 'PUBLISHED_AND_VERIFIED'"));
});

// The real gate, when this machine has it: a clean page passes the scan and a banned status note fails it.
const realGate = spawnSync(process.env.STR_PYTHON ?? 'python', ['--version'], { encoding: 'utf8' }).status === 0
  && await fs.stat(process.env.STR_RELEASE_GATE ?? releaseGateDefault).then(() => true, () => false);
test('the real release gate passes a clean page and fails a built page that says "revision 7 is live"', { skip: !realGate && 'release gate or python not on this machine' }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'str-built-'));
  const page = body => `<!doctype html><html><head><title>t</title></head><body><main><h1>Mods</h1>${body}</main></body></html>`;
  await fs.writeFile(path.join(directory, 'join.html'), page('<p>Pick your race on the start screen.</p>'));
  assert.equal(complaintScan(directory).ok, true);
  await fs.writeFile(path.join(directory, 'join.html'), page('<p>Join us · revision 7 is live</p>'));
  const bad = complaintScan(directory);
  assert.equal(bad.ok, false);
  assert.match(bad.output, /status-version-words on join\.html/);
  await fs.writeFile(path.join(directory, 'join.html'), page('<p>Coming soon: new builds</p>'));
  assert.equal(complaintScan(directory).ok, false);
  await fs.rm(directory, { recursive: true, force: true });
});
