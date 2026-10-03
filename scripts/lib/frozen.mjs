import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function inventory(directory, excludedDirectories = []) {
  const files = [];
  async function walk(current, prefix = '') {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Frozen inventory rejects symlink: ${relative}`);
      if (entry.isDirectory()) {
        if (!prefix && excludedDirectories.includes(entry.name)) continue;
        if (relative !== 'assets') throw new Error(`Unexpected frozen directory: ${relative}`);
        await walk(path.join(current, entry.name), relative + '/');
      } else files.push(relative);
    }
  }
  await walk(directory);
  return files.sort();
}

export async function assertFrozen(directory, manifest, { excludedDirectories = [], allowMissing = false, bytes = true } = {}) {
  const actual = await inventory(directory, excludedDirectories);
  const expected = Object.keys(manifest.files).sort();
  const extra = actual.filter(name => !expected.includes(name));
  const missing = expected.filter(name => !actual.includes(name));
  if (extra.length || (!allowMissing && missing.length)) throw new Error(`Frozen inventory mismatch in ${path.basename(directory)}: extra [${extra.join(', ')}], missing [${missing.join(', ')}]`);
  if (bytes) for (const name of actual) {
    const value = await readFile(path.join(directory, name));
    if (createHash('sha256').update(value).digest('hex') !== manifest.files[name]) throw new Error(`Frozen byte mismatch: ${path.basename(directory)}/${name}`);
  }
}

export async function materializeFrozen(root, output, manifest) {
  const source = path.join(root, 'src/variants/frozen-v1');
  await assertFrozen(source, manifest);
  await assertFrozen(output, manifest, { excludedDirectories: ['v1', 'v2a', 'v2b', 'v3', 'v4'], allowMissing: true, bytes: false });
  await assertFrozen(path.join(output, 'v1'), manifest, { allowMissing: true, bytes: false });
  const originals = new Map();
  for (const name of Object.keys(manifest.files)) {
    const bytes = await readFile(path.join(source, name));
    originals.set(name, bytes);
    for (const directory of [output, path.join(output, 'v1')]) {
      const destination = path.join(directory, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
  }
  return originals;
}
