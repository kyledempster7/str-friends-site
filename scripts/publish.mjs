import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { identity, repository, liveBase, parsePasswords, privacyFindings, treeManifest, manifestDifference, mirrorDist, compareLive, sha256, verifyIdentityLog, verifyRemoteUrls } from './lib/publish-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' };
const receipt = { mode: 'publish', result: 'FAILED', pushed: false, prCreated: false };
let secrets = [], scratch, lock, lockHandle;
const redacted = text => secrets.reduce((output, secret) => output.split(secret).join('[WITHHELD]'), String(text));
function run(program, args, cwd, { echo = false, accepted = [0] } = {}) {
  const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || !accepted.includes(result.status)) {
    // Never expose child output on failure: it may contain a credential or an
    // identity we are specifically rejecting. A phase label supplies context.
    throw new Error(`${path.basename(program)} command failed (exit ${result.status ?? 'spawn'}); output withheld.`);
  }
  if (echo) process.stdout.write(redacted(result.stdout + result.stderr));
  return result.stdout.trim();
}
const git = (cwd, args, options) => run('git', args, cwd, options);
const phase = label => { receipt.phase = label; console.log(`[publish] ${label}`); };

function options() {
  const result = { dryRun: false, timeout: 600, worktree: undefined, branch: undefined, serverIni: undefined };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--help') {
      console.log('Usage: node scripts/publish.mjs [--branch feature/name | --worktree PATH] [--dry-run] [--server-ini PATH] [--timeout-seconds 600]');
      console.log('Requires committed feature work. Dry-run builds, validates, mirrors and commits in a disposable clone; it performs read-only live comparison. Pushes, PR creation and waiting for an unpublished deployment are skipped.');
      return;
    } else if (['--branch', '--worktree', '--server-ini', '--timeout-seconds'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const value = args[++i];
      if (arg === '--timeout-seconds') result.timeout = Number(value);
      else result[{ '--branch': 'branch', '--worktree': 'worktree', '--server-ini': 'serverIni' }[arg]] = value;
    } else throw new Error('Unknown or incomplete argument; use --help.');
  }
  if (result.branch && result.worktree) throw new Error('Choose --branch or --worktree, not both.');
  if (!Number.isInteger(result.timeout) || result.timeout < 1 || result.timeout > 3600) throw new Error('timeout-seconds must be an integer from 1 to 3600.');
  return result;
}

async function serverIni(explicit) {
  const modding = path.join(process.env.SystemDrive ?? 'C:', path.sep, 'Modding');
  const preferred = path.join(modding, 'STR-Kit', 'server', 'STServer.ini');
  if (explicit) return fs.readFile(path.resolve(explicit), 'utf8');
  try { return await fs.readFile(preferred, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read server configuration.'); }
  const matches = [];
  async function find(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) await find(location);
      else if (entry.name.toLowerCase() === 'stserver.ini') matches.push(location);
    }
  }
  await find(modding);
  if (matches.length !== 1) throw new Error('Server configuration discovery was missing or ambiguous; use --server-ini.');
  return fs.readFile(matches[0], 'utf8');
}

function origin(cwd) {
  const url = git(cwd, ['remote', 'get-url', 'origin']);
  verifyRemoteUrls(url, git(cwd, ['remote', 'get-url', '--push', '--all', 'origin']).split('\n'));
  return url;
}
function clean(cwd) {
  if (git(cwd, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Feature worktree must be clean and committed before publication.');
}
function fetchMain(cwd) {
  git(cwd, ['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main']);
  try { git(cwd, ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']); }
  catch { throw new Error('origin/main is not an ancestor of feature HEAD; fast-forward-only publication refused.'); }
  return git(cwd, ['rev-parse', 'origin/main']);
}
function checkIdentities(cwd) {
  return verifyIdentityLog(git(cwd, ['log', '-z', 'origin/main..HEAD', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce']));
}
function gitBlob(cwd, hash) {
  const result = spawnSync('git', ['cat-file', 'blob', hash], { cwd, env, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Cannot inspect public Git content.');
  return result.stdout;
}
function gitTree(cwd, tree) {
  return git(cwd, ['ls-tree', '-rz', tree]).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t');
    const [mode, type, hash] = entry.slice(0, tab).split(' ');
    if (tab < 0 || type !== 'blob' || mode === '120000') throw new Error('Publication history contains an unsupported tree entry.');
    return { hash, filename: entry.slice(tab + 1) };
  });
}
export function checkCommittedDocs(cwd, release, manifest) {
  const committed = new Map(gitTree(cwd, `${release}:docs`).map(({ hash, filename }) => [filename, sha256(gitBlob(cwd, hash))]));
  if (manifestDifference(manifest, committed).length) throw new Error('Committed docs bytes differ from dist; check Git attributes/clean filters before any push.');
}
async function scanDocs(cwd, manifest) {
  let scanned = 0;
  for (const filename of manifest.keys()) {
    const labels = privacyFindings(await fs.readFile(path.join(cwd, 'docs', filename)), secrets);
    if (labels.length || privacyFindings(filename, secrets).length) throw new Error(`Published-file privacy scan failed (${labels.join(', ') || 'filename'}); values and filename withheld.`);
    scanned++;
  }
  return scanned;
}
function scanHistory(cwd) {
  const commits = git(cwd, ['rev-list', 'origin/main..HEAD']).split('\n').filter(Boolean);
  const checked = new Set();
  for (const commit of commits) {
    const message = git(cwd, ['show', '-s', '--format=%B', commit]);
    if (privacyFindings(message, secrets, { allowIdentity: true }).length) throw new Error('New commit message failed privacy scan; contents withheld.');
    for (const { hash, filename } of gitTree(cwd, commit)) {
      if (privacyFindings(filename, secrets, { allowIdentity: true }).length) throw new Error('New public filename failed privacy scan; filename withheld.');
      if (checked.has(hash)) continue;
      if (privacyFindings(gitBlob(cwd, hash), secrets, { allowIdentity: true }).length) throw new Error('New public Git content failed privacy scan; values and filename withheld.');
      checked.add(hash);
    }
  }
  return checked.size;
}

async function main() {
  const config = options();
  if (!config) { receipt.result = 'HELP'; return; }
  receipt.mode = config.dryRun ? 'dry-run' : 'publish';
  phase('preflight');
  secrets = parsePasswords(await serverIni(config.serverIni));
  const original = path.resolve(config.worktree ?? root);
  const common = git(original, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  lock = path.join(common, 'str-site-publish.lock');
  lockHandle = await fs.open(lock, 'wx').catch(() => { throw new Error('Another publisher owns the lock; do not run concurrently.'); });
  const branch = config.branch ?? git(original, ['branch', '--show-current']);
  if (!/^feature\/[A-Za-z0-9._/-]+$/.test(branch)) throw new Error('Publication requires a local feature/* branch.');
  git(original, ['check-ref-format', '--branch', branch]);
  const hash = git(original, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]);
  const remote = origin(original);
  receipt.branch = branch;
  receipt.sourceCommit = hash;
  let cwd = original;
  const worktrees = git(original, ['worktree', 'list', '--porcelain']).split('\n\n');
  const selected = worktrees.find(block => block.split('\n').includes(`branch refs/heads/${branch}`));
  if (selected) {
    cwd = selected.split('\n')[0].slice('worktree '.length);
    clean(cwd);
  } else if (!config.dryRun) {
    cwd = path.join(common, `publish-worktree-${randomUUID()}`);
    git(original, ['worktree', 'add', cwd, branch]);
    receipt.createdWorktree = true;
  }
  if (config.dryRun) {
    scratch = path.join(common, `publish-dry-run-${randomUUID()}`);
    // A separate repository keeps the source branch, docs, main, index and even
    // remote-tracking refs untouched. No secrets/config files are copied here.
    git(original, ['clone', '--no-hardlinks', '--single-branch', '--branch', branch, original, scratch]);
    cwd = scratch;
    git(cwd, ['remote', 'set-url', 'origin', remote]);
  }
  clean(cwd);
  if (git(cwd, ['branch', '--show-current']) !== branch || git(cwd, ['rev-parse', 'HEAD']) !== hash) throw new Error('Selected branch moved during preflight.');
  origin(cwd);
  fetchMain(cwd);
  checkIdentities(cwd);
  if (!config.dryRun) run('gh', ['auth', 'status', '--hostname', 'github.com'], cwd);
  const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  phase('build');
  run(process.execPath, [npmCli, 'run', 'build'], cwd, { echo: true });
  phase('validate');
  run(process.execPath, [npmCli, 'run', 'validate'], cwd, { echo: true });
  // Build/validate may only create ignored output, never edit tracked sources.
  clean(cwd);
  phase('mirror dist to docs and prove byte parity');
  const manifest = await mirrorDist(cwd);
  receipt.files = manifest.size;
  phase('privacy scan');
  receipt.scannedFiles = await scanDocs(cwd, manifest);
  receipt.secretHits = 0;
  phase('commit docs with noreply author and committer');
  git(cwd, ['add', '--', 'docs']);
  const docsChanged = git(cwd, ['diff', '--cached', '--name-only']);
  if (docsChanged.split('\n').filter(Boolean).some(name => !name.startsWith('docs/'))) throw new Error('Staged changes outside docs; commit refused.');
  // Allow an empty release commit for unchanged builds: identity/commit handling
  // is still exercised in dry-run, without rewriting any existing history.
  git(cwd, ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`, 'commit', '--allow-empty', '-m', 'Publish friends site build', '--only', '--', 'docs']);
  const release = git(cwd, ['rev-parse', 'HEAD']);
  receipt.releaseCommit = release;
  checkCommittedDocs(cwd, release, manifest);
  receipt.committedByteParity = true;
  phase('fast-forward and public-history checks');
  fetchMain(cwd);
  receipt.checkedCommits = checkIdentities(cwd);
  receipt.scannedGitBlobs = scanHistory(cwd);
  if (manifestDifference(manifest, await treeManifest(path.join(cwd, 'docs'))).length) throw new Error('docs changed after privacy scan.');
  clean(cwd);
  if (config.dryRun) {
    phase('read-only live build comparison (deployment skipped)');
    const result = await compareLive(manifest, { deadline: Date.now() + config.timeout * 1000, allPublicFiles: true });
    receipt.live = { ...result, status: result.failures.length ? 'DIFFERENT_OR_UNAVAILABLE_NOT_PUBLISHED' : 'MATCH' };
    receipt.result = 'PASS_LOCAL';
    receipt.skipped = ['branch push', 'PR creation', 'main push', 'deployment wait'];
    return;
  }
  phase('push feature branch');
  origin(cwd);
  git(cwd, ['push', '-u', 'origin', `HEAD:refs/heads/${branch}`]);
  receipt.pushed = true;
  phase('create PR record');
  const existing = JSON.parse(run('gh', ['pr', 'list', '--repo', repository, '--state', 'open', '--head', branch, '--base', 'main', '--json', 'url'], cwd));
  if (existing.length > 1) throw new Error('Multiple open PR records for this branch.');
  receipt.pr = existing[0]?.url ?? run('gh', ['pr', 'create', '--repo', repository, '--head', branch, '--base', 'main', '--title', 'Publish friends site build', '--body', 'Build and validation passed. Published files match dist byte for byte and passed privacy checks. All new commits use the approved noreply identity. Publication uses a local fast-forward push; no GitHub merge operation.'], cwd);
  receipt.prCreated = !existing.length;
  phase('recheck ancestry, then fast-forward main');
  fetchMain(cwd);
  checkIdentities(cwd);
  if (git(cwd, ['rev-parse', 'HEAD']) !== release) throw new Error('Release HEAD moved before publication.');
  origin(cwd);
  // No force flag, merge API, merge commit or local main checkout. A concurrent
  // main update that breaks ancestry is rejected by Git itself.
  git(cwd, ['push', 'origin', 'HEAD:main']);
  receipt.mainPushed = true;
  if (git(cwd, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0] !== release) throw new Error('Remote main no longer equals the release commit.');
  phase('wait for live build and HTML parity');
  const deadline = Date.now() + config.timeout * 1000;
  while (true) {
    const result = await compareLive(manifest, { deadline, allPublicFiles: true });
    receipt.live = result;
    console.log(`[publish] Live files ${result.matched}/${result.total}; HTML ${result.htmlMatched}/${result.htmlTotal} matches.`);
    if (!result.failures.length) break;
    if (Date.now() >= deadline) throw new Error('Deployment did not reach full HTML parity before the deadline; publication occurred, verification failed.');
    await delay(Math.min(10000, deadline - Date.now()));
  }
  receipt.site = liveBase.href;
  receipt.result = 'PUBLISHED_AND_VERIFIED';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
try { await main(); }
catch (error) {
  receipt.error = redacted(error.message);
  process.exitCode = 1;
} finally {
  if (scratch) {
    // Only our generated child of this repository's common Git directory can
    // be removed. realpath containment also rejects a replaced symlink.
    try {
      const resolved = await fs.realpath(scratch);
      const parent = await fs.realpath(path.dirname(scratch));
      if (resolved !== path.join(parent, path.basename(scratch)) || !/^publish-dry-run-[0-9a-f-]+$/.test(path.basename(scratch))) throw new Error('Unsafe scratch cleanup target.');
      await fs.rm(scratch, { recursive: true, force: true });
      receipt.scratchRemoved = true;
    } catch { receipt.cleanup = 'Scratch cleanup failed; retained for inspection.'; process.exitCode = 1; }
  }
  if (lockHandle) { await lockHandle.close(); await fs.unlink(lock); }
  if (receipt.result !== 'HELP') console.log(`[publish] RECEIPT ${JSON.stringify(receipt)}`);
}
}
