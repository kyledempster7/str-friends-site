import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Version C: Kyle asked for "before and after charts for everything" and
// "just a couple of grids": rows and columns only. No cards, tiles or buttons.
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const statusLabels = { allowed: 'Allowed', conditional: 'Conditional', hold: 'Hold — do not use', blocked: 'Blocked' };
const statusOrder = ['hold', 'blocked', 'conditional', 'allowed'];

const css = `:root{--bg:#101a20;--line:#34434a;--muted:#b2bfc2;--text:#e5e9e5;--bright:#f6f2e9;--gold:#d8bc87;--gold-dark:#9c8050;--hold:#f0d099;--blocked:#efb9b1;--conditional:#bddce5;--allowed:#b5dac4;--serif:Georgia,'Times New Roman',serif;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 var(--sans)}
a{color:var(--gold)}a:hover{color:var(--bright)}
header{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--line);max-width:1240px;margin:0 auto}
header .brand{font:20px/1 var(--serif);color:var(--bright);text-decoration:none;letter-spacing:.02em}
header nav{display:flex;flex-wrap:wrap;gap:4px 20px;font-size:15px}header nav a{text-decoration:none}header nav .leave{color:var(--hold)}
main{max-width:1240px;margin:0 auto;padding:32px 24px 48px}
h1{font:400 clamp(2rem,4vw,2.75rem)/1.15 var(--serif);color:var(--bright);margin:0 0 8px}
h2{font:400 1.5rem/1.25 var(--serif);color:var(--bright);margin:48px 0 4px}
.lede{color:var(--muted);margin:0 0 16px}.note{color:var(--muted);margin:0 0 8px;font-size:15px}
.toc{columns:2 16rem;column-gap:32px;margin:16px 0 0;padding:0;list-style:none;font-size:15px}.toc li{padding:3px 0}
.grid-wrap{overflow-x:auto;margin-top:12px}
table{width:100%;border-collapse:collapse;font-size:15px}
caption{text-align:left}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}
thead th{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-weight:600;border-bottom:1px solid var(--gold-dark);white-space:nowrap}
tbody th{font-weight:600;color:var(--bright);width:20%}
td:nth-child(2){color:var(--muted);width:28%}
tr#leave-now th,tr#leave-now td{color:var(--hold)}
.s-hold{color:var(--hold)}.s-blocked{color:var(--blocked)}.s-conditional{color:var(--conditional)}.s-allowed{color:var(--allowed)}
.filter{margin:16px 0 0;display:block;font-size:15px;color:var(--muted)}
.filter input{display:block;margin-top:6px;width:100%;max-width:28rem;padding:8px 0;background:transparent;color:var(--text);border:0;border-bottom:1px solid var(--gold-dark);font:inherit}
footer{max-width:1240px;margin:0 auto;padding:24px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
footer a{margin-right:12px}
@media (max-width:640px){header,main,footer{padding-left:16px;padding-right:16px}table,thead,tbody,tr,th,td{display:block}thead{position:absolute;left:-9999px}tr{border-bottom:1px solid var(--line);padding:8px 0}th,td{border:0;padding:2px 0;width:auto!important}td[data-label]::before{content:attr(data-label) ": ";color:var(--gold);font-size:13px}}`;

const shell = ({ title, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Skyrim Together field guide: before and after grids for our co-op setup.">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/v3.css">
</head>
<body>
<header>
<a class="brand" href="index.html">Fellowship</a>
<nav aria-label="Main">
<a href="index.html">Before and after</a>
<a href="rules.html">Can I use this?</a>
<a class="leave" href="index.html#leave-now">Leave now</a>
</nav>
</header>
<main>
${body}
</main>
<footer>Version: <a href="../index.html">v1</a><a href="../v2a/index.html">A</a><a href="../v2b/index.html">B</a><strong>C</strong> · Unofficial fan guide, not an official Skyrim Together or Bethesda product.</footer>
</body>
</html>
`;

const grid = (g) => {
  const head = g.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('');
  const rows = g.rows.map((r) => {
    const rowId = r[0] === 'Leave NOW' ? ' id="leave-now"' : '';
    const cells = r.slice(1).map((cell, i) => `<td data-label="${esc(g.columns[i + 1])}">${esc(cell)}</td>`).join('');
    return `<tr${rowId}><th scope="row">${esc(r[0])}</th>${cells}</tr>`;
  }).join('\n');
  return `<section aria-labelledby="${g.id}">
<h2 id="${g.id}">${esc(g.title)}</h2>
${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}
<div class="grid-wrap"><table>
<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
</section>`;
};

export async function renderV3(root) {
  const data = JSON.parse(await readFile(path.join(root, 'src/variants/v3/grids.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(root, 'src/variants/v2a/content/catalog.json'), 'utf8'));
  const pages = new Map();

  const toc = data.grids.map((g) => `<li><a href="#${g.id}">${esc(g.title)}</a></li>`).join('');
  pages.set('index.html', shell({
    title: 'Fellowship · before and after',
    body: `<h1>Skyrim co-op, before and after</h1>
<p class="lede">${esc(data.intro)}</p>
<ul class="toc">${toc}</ul>
${data.grids.map(grid).join('\n')}`
  }));

  const entries = [...catalog.entries].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name));
  const counts = statusOrder.map((s) => `${catalog.entries.filter((e) => e.status === s).length} ${statusLabels[s].split(' —')[0].toLowerCase()}`).join(', ');
  const rows = entries.map((e) => {
    const search = esc([e.name, ...(e.aliases ?? []), e.category, e.status].join(' ').toLowerCase());
    return `<tr id="rule-${esc(e.id)}" data-search="${search}"><th scope="row">${esc(e.name)}</th><td data-label="Type">${esc(e.category)}</td><td data-label="Status" class="s-${e.status}">${esc(statusLabels[e.status])}</td><td data-label="What to know">${esc(e.summary)} ${esc(e.detail)}</td></tr>`;
  }).join('\n');
  pages.set('rules.html', shell({
    title: 'Fellowship · can I use this?',
    body: `<h1>Can I use this?</h1>
<p class="lede">All ${catalog.entries.length} spells, perks, powers and mods we have checked: ${counts}. Holds come first.</p>
<label class="filter">Filter by name<input id="filter" type="search" autocomplete="off"></label>
<div class="grid-wrap"><table>
<thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">What to know</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
<script>
(function(){var f=document.getElementById('filter');var rows=document.querySelectorAll('tbody tr');var q=new URLSearchParams(location.search).get('q');if(q){f.value=q}
function run(){var v=f.value.trim().toLowerCase();rows.forEach(function(r){r.style.display=!v||r.getAttribute('data-search').indexOf(v)>-1?'':'none'})}
f.addEventListener('input',run);run()})();
</script>`
  }));

  pages.set('assets/v3.css', css);
  return pages;
}
