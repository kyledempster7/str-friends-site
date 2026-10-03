import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// One version bar at the bottom of EVERY page in EVERY version (Kyle: every page must reach
// every version). Inserted immediately before </body> with no extra whitespace, so stripping
// it restores the frozen original bytes exactly.
// Kyle (2026-10-03): "keep B and D, and delete the others."
export const VERSIONS = [['v2b', 'B'], ['v4', 'D']];
const BAR = /<nav class="all-versions"[^>]*>[\s\S]*?<\/nav>(?=<\/body>)/;
export const stripVersionBar = (html) => html.replace(BAR, '');

const style = 'max-width:1236px;margin:0 auto;padding:16px 24px 28px;font:15px/1.6 -apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;color:#b2bfc2;border-top:1px solid #34434a';

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => e.name);
}

export async function addVersionBars(output) {
  const pagesByVersion = new Map();
  for (const [folder] of VERSIONS) pagesByVersion.set(folder, new Set(await htmlFiles(path.join(output, folder))));
  for (const location of ['', ...VERSIONS.map(([folder]) => folder)]) {
    const current = location;
    const prefix = location ? '../' : '';
    for (const name of await htmlFiles(path.join(output, location))) {
      const file = path.join(output, location, name);
      let html = (await readFile(file, 'utf8')).replace(/<nav class="version-switcher"[\s\S]*?<\/nav>/, '');
      const links = VERSIONS.map(([folder, label]) => {
        const target = pagesByVersion.get(folder).has(name) && name !== '404.html' ? name : 'index.html';
        const href = prefix + `${folder}/` + target;
        return folder === current
          ? `<strong style="color:#f6f2e9">${label}</strong>`
          : `<a href="${href}" style="color:#d8bc87;margin:0 2px">${label}</a>`;
      }).join(' · ');
      html = stripVersionBar(html).replace('</body>', `<nav class="all-versions" aria-label="All versions" style="${style}">Versions: ${links}</nav></body>`);
      await writeFile(file, html);
    }
  }
}
