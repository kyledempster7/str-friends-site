import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// One version bar at the bottom of EVERY page in EVERY version (Kyle: every page must reach
// every version), inserted immediately before </body>.
// Kyle (2026-10-03): "keep B and D, and delete the others." D is the current main site; B is the
// older card layout kept for comparison. The bar says so in words (Kyle: "I don't know if there's
// a newer one for me to see, but that would be nice").
export const VERSIONS = [['v2b', 'B'], ['v4', 'D']];
const NEWEST = 'v4';
const DESCRIBE = { v2b: 'the older card layout', v4: 'the current main site' };
// D pages that have no page of the same name in B map to B's closest page.
const EQUIVALENT = {
  v2b: { 'mods.html': 'together.html', 'races.html': 'skills.html', 'cannot-use.html': 'skills.html', 'magic-friends.html': 'spells.html', 'setup.html': 'tonight.html', 'tailscale.html': 'tonight.html', 'join.html': 'tonight.html', 'build-sheets.html': 'builds.html', 'lore-builds.html': 'builds.html', 'leader.html': 'party.html', 'chat.html': 'party.html', 'agreement.html': 'ownership.html', 'rules-perks.html': 'rules.html', 'rules-spells.html': 'rules.html', 'rules-powers.html': 'rules.html', 'rules-mods.html': 'rules.html' }
};
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
  const label = (folder) => VERSIONS.find(([f]) => f === folder)[1];
  for (const location of ['', ...VERSIONS.map(([folder]) => folder)]) {
    // Root pages (the forwarder and the site-wide 404) can be served at any depth, so use absolute links.
    const prefix = location ? '../' : 'https://kyledempster7.github.io/str-friends-site/';
    for (const name of await htmlFiles(path.join(output, location))) {
      const file = path.join(output, location, name);
      const html = (await readFile(file, 'utf8')).replace(/<nav class="version-switcher"[\s\S]*?<\/nav>/, '');
      const link = (folder) => {
        const pages = pagesByVersion.get(folder);
        let target = name !== '404.html' && pages.has(name) ? name : EQUIVALENT[folder]?.[name];
        const home = !target || !pages.has(target);
        if (home) target = 'index.html';
        return `<a href="${prefix}${folder}/${target}" style="color:#d8bc87">${label(folder)}</a>${home && name !== 'index.html' ? ' (its home page)' : ''}`;
      };
      let text;
      if (!location) {
        text = `Site versions: ${link(NEWEST)}, ${DESCRIBE[NEWEST]} · ${VERSIONS.filter(([f]) => f !== NEWEST).map(([f]) => `${link(f)}, ${DESCRIBE[f]}`).join(' · ')}`;
      } else {
        const others = VERSIONS.filter(([f]) => f !== location).map(([f]) => `${f === NEWEST ? 'Newer: ' : 'Also: '}${link(f)}, ${DESCRIBE[f]}`).join(' · ');
        text = `You're on version <strong style="color:#f6f2e9">${label(location)}</strong>, ${DESCRIBE[location]}${location === NEWEST ? ' and the newest' : ''}. · ${others}`;
        if (location === 'v4') text = `<strong style="color:#f6f2e9">D</strong> · Main site, newest · ${link('v2b')} · Older version`;
      }
      await writeFile(file, stripVersionBar(html).replace('</body>', `<nav class="all-versions" aria-label="Site versions" style="${style}">${text}</nav></body>`));
    }
  }
}
