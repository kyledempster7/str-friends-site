import { readFile, writeFile, mkdir, unlink, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { materializeFrozen } from './lib/frozen.mjs';
import { renderVariant } from './lib/render-variant.mjs';
import { renderV4 } from './lib/render-v4.mjs';
import { addVersionBars } from './lib/version-bar.mjs';

// Kyle (2026-10-03): "keep B and D, and delete the others." Only /v2b/ (B) and /v4/ (D)
// are published. The site root forwards to D. "Our story" is removed and archived in archive/our-story/.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
const manifest = JSON.parse(await readFile(path.join(root, 'src/variants/frozen-v1.json'), 'utf8'));
// B is rendered on top of the original release files, so materialize them first, then drop them.
const original = await materializeFrozen(root, output, manifest);
for (const [name, bytes] of original) {
  const destination = path.join(output, 'v2b', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
const stylesheet = await readFile(path.join(root, 'src/variants/site.css'), 'utf8');
const campfire = await readFile(path.join(root, 'src/variants/campfire.svg'), 'utf8');
const renderInputs = new Map(original);
renderInputs.set('campfire-inline', campfire);
for (const [name, html] of await renderVariant({ root, variant: 'v2b', originals: renderInputs })) await writeFile(path.join(output, 'v2b', name), html);
await writeFile(path.join(output, 'v2b', 'assets/site.css'), stylesheet);
await unlink(path.join(output, 'v2b', 'assets/variant.css')).catch(error => { if (error.code !== 'ENOENT') throw error; });
await writeFile(path.join(output, 'v2b', 'assets/campfire.svg'), campfire);
await writeFile(path.join(output, 'v2b', 'assets/horizon.svg'), await readFile(path.join(root, 'src/variants/horizon.svg')));
for (const name of ['north.svg', 'favicon.svg']) {
  const svg = original.get('assets/' + name).toString('utf8').replace(/(<svg[^>]*>)/, '$1<title>Fellowship northern landscape and mountain mark</title><!-- original, Fellowship, 2026 -->');
  await writeFile(path.join(output, 'v2b', 'assets', name), svg);
}
// Remove "Our story" from B: its page, header links and the home-page card.
await unlink(path.join(output, 'v2b', 'chronicle.html'));
for (const name of (await readdir(path.join(output, 'v2b'))).filter((n) => n.endsWith('.html'))) {
  const file = path.join(output, 'v2b', name);
  const html = (await readFile(file, 'utf8'))
    .replace(/<a href="chronicle\.html"[^>]*>Our story<\/a>/g, '')
    .replace(/ Do not combine this with Ordinator\./g, '').replace(/ Extra staff skill experience from Scrambled Bugs is not included\./g, '')
    .replace(/Check the mod name: this is not Apocalypse(?:&#39;|')s travel spell\./g, 'Invisibility that refreshes after it breaks.')
    .replace(/ Its exact co-op behavior is not tested yet; the Apocalypse travel hold is a different spell\./g, ' Its exact co-op behavior is not tested yet.')
    .replace(/<section class="section story-section"[\s\S]*?<\/section>/g, '')
    .replace(/<article class="story-card[^"]*">(?:(?!<\/article>)[\s\S])*?href="chronicle\.html"[\s\S]*?<\/article>/g, '');
  await writeFile(file, html);
}

// Version D (/v4/): every piece of content as a grid, on the original look.
for (const [name, content] of await renderV4(root)) {
  const destination = path.join(output, 'v4', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}
for (const name of ['assets/site.css', 'assets/north.svg', 'assets/favicon.svg']) await writeFile(path.join(output, 'v4', name), original.get(name));

// The original release (root and /v1/) is no longer published. The root forwards to D.
for (const name of original.keys()) await rm(path.join(output, name), { force: true });
await rm(path.join(output, 'v1'), { recursive: true, force: true });
await rm(path.join(output, 'assets'), { recursive: true, force: true });
const forward = (title, target) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0; url=${target}"><title>${title} · Fellowship</title><style>body{margin:0;background:#101a20;color:#e5e9e5;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}main{max-width:40rem;margin:auto;padding:48px 24px}a{color:#d8bc87}h1{font:400 2rem/1.2 Georgia,serif;color:#f6f2e9}</style></head>
<body><main><h1>${title}</h1><p><a href="${target}">Open the Fellowship field guide</a></p></main></body></html>
`;
await writeFile(path.join(output, 'index.html'), forward('Fellowship', 'v4/index.html'));
// A real missing-page response (served for any bad address), with absolute links so it works at any depth.
const site = 'https://kyledempster7.github.io/str-friends-site/v4/';
await writeFile(path.join(output, '404.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · Fellowship</title><style>body{margin:0;background:#101a20;color:#e5e9e5;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}main{max-width:40rem;margin:auto;padding:48px 24px}a{color:#d8bc87}h1{font:400 2rem/1.2 Georgia,serif;color:#f6f2e9}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #34434a}</style></head>
<body><main><h1>Page not found</h1><p>That address doesn't exist, or it belonged to a version of the site we've retired.</p><table><tbody>
<tr><th scope="row"><a href="${site}index.html#chapters">The seven chapters</a></th><td>The field guide, start to finish</td></tr>
<tr><th scope="row"><a href="${site}rules.html">Can I use this?</a></th><td>Check a spell, perk, power or mod</td></tr>
<tr><th scope="row"><a href="${site}leave-now.html">Leave now</a></th><td>How to leave a session quickly</td></tr>
</tbody></table></main></body></html>
`);
for (const dir of ['', 'v2b', 'v4']) await writeFile(path.join(output, dir, '.nojekyll'), '');

await addVersionBars(output);
console.log('Built B (/v2b/) and D (/v4/); the root forwards to D.');
