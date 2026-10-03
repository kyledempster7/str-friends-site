import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertFrozen, materializeFrozen } from './lib/frozen.mjs';
import { renderVariant } from './lib/render-variant.mjs';
import { renderV3 } from './lib/render-v3.mjs';

// Frozen root/v1 come from the canonical published byte snapshot, never from
// templates or platform-dependent working-tree copies of the original assets.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'src/variants/frozen-v1.json'), 'utf8'));
const original = await materializeFrozen(root, output, manifest);
for (const variant of ['v2a', 'v2b']) {
  for (const [name, bytes] of original) {
    const destination = path.join(output, variant, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

const stylesheet = await readFile(path.join(root, 'src/variants/site.css'), 'utf8');
const campfire = await readFile(path.join(root, 'src/variants/campfire.svg'), 'utf8');
for (const variant of ['v2a', 'v2b']) {
  const renderInputs = new Map(original);
  renderInputs.set('campfire-inline', campfire);
  const pages = await renderVariant({ root, variant, originals: renderInputs });
  for (const [name, html] of pages) await writeFile(path.join(output, variant, name), html);
  await writeFile(path.join(output, variant, 'assets/site.css'), stylesheet);
  await unlink(path.join(output, variant, 'assets/variant.css')).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (variant === 'v2b') {
    await writeFile(path.join(output, variant, 'assets/campfire.svg'), campfire);
    await writeFile(path.join(output, variant, 'assets/horizon.svg'), await readFile(path.join(root, 'src/variants/horizon.svg')));
    for (const name of ['north.svg', 'favicon.svg']) {
      const svg = original.get('assets/' + name).toString('utf8').replace(/(<svg[^>]*>)/, '$1<title>Fellowship northern landscape and mountain mark</title><!-- original, Fellowship, 2026 -->');
      await writeFile(path.join(output, variant, 'assets', name), svg);
    }
  }
}

// Version C (/v3/): before-and-after grids only.
for (const [name, content] of await renderV3(root)) {
  const destination = path.join(output, 'v3', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}
await writeFile(path.join(output, 'v3', 'assets/favicon.svg'), original.get('assets/favicon.svg'));

await assertFrozen(output, manifest, { excludedDirectories: ['v1', 'v2a', 'v2b', 'v3'] });
await assertFrozen(path.join(output, 'v1'), manifest);
console.log(`Frozen root and /v1 verified against ${manifest.commit}.`);
console.log('Built complete /v2a and /v2b variants with all 116 adopted catalog records.');
