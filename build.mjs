// Bundles the game into one self-contained HTML page.
// Each ES module is wrapped in its own function scope, so modules can reuse helper names
// (the tracker's `dot`, `cross`, ... ) without clashing. Only plain `import { a, b as c } from './x.js'`
// and `export function|class|const|let` are used in src/, and that is all this handles.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, normalize } from 'node:path';

const ENTRY = 'src/main.js';
const mods = new Map(); // path -> { code, deps, exports }

function load(path) {
  if (mods.has(path)) return;
  let src = readFileSync(path, 'utf8');
  const deps = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"];?\s*$/gm, (_, names, rel) => {
    const dep = normalize(join(dirname(path), rel));
    deps.push(dep);
    const list = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${list.join(', ')} } = __mods[${JSON.stringify(dep)}];`;
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`${path}: unsupported import form`);
  const exports = [];
  src = src.replace(/^export\s+((?:async\s+)?function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => { exports.push(name); return `${kind} ${name}`; });
  if (/^\s*export\s/m.test(src)) throw new Error(`${path}: unsupported export form`);
  mods.set(path, null);
  deps.forEach(load);
  mods.set(path, { code: src, exports });
}
load(ENTRY);

// dependency order = insertion order of completed modules (deps load before their importer finishes)
const order = [];
const seen = new Set();
(function visit(p) {
  if (seen.has(p)) return; seen.add(p);
  const src = readFileSync(p, 'utf8');
  for (const m of src.matchAll(/^import\s*\{[^}]*\}\s*from\s*['"](\.[^'"]+)['"]/gm)) visit(normalize(join(dirname(p), m[1])));
  order.push(p);
})(ENTRY);

let js = 'const __mods = {};\n';
for (const p of order) {
  const m = mods.get(p);
  js += `// ---- ${p} ----\n__mods[${JSON.stringify(p)}] = (() => {\n${m.code}\nreturn { ${m.exports.join(', ')} };\n})();\n`;
}
const logo = readFileSync('src/xp-logo.svg', 'utf8').trim();   // Xplore Prokletije logo (tools/trace_logo.py)
const page = readFileSync('src/page.html', 'utf8').replaceAll('<!--XP_LOGO-->', () => logo).replace('/*__SCRIPT__*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/gusinjska-kocka.html', page);

// GitHub Pages entry point: the same page inside the skeleton the artifact host adds.
const skeleton = `<!doctype html><html lang="sr-Latn-ME"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${page}\n</body></html>`;
writeFileSync('dist/test.html', skeleton);
// GitHub Pages copy is also an installable app: web app manifest, icons and an offline copy (sw.js).
const appHead = '<title>Gusinjska kocka</title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0e2427">'
  + '<link rel="icon" href="icons/favicon-32.png" sizes="32x32"><link rel="icon" href="icons/icon-192.png" sizes="192x192">'
  + '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-title" content="Gusinjska kocka">';
writeFileSync('index.html', skeleton.replace('</head>', appHead + '</head>'));
const offline = ['index.html', 'manifest.webmanifest', ...readdirSync('icons').sort().map((f) => `icons/${f}`), 'ar/layout.json',
  ...readdirSync('models').filter((f) => /\.(json|jpg)$/.test(f)).sort().map((f) => `models/${f}`)];
const hash = createHash('sha1');
for (const f of offline) hash.update(readFileSync(f));
writeFileSync('sw.js', readFileSync('src/sw.js', 'utf8').replace('__VERSION__', hash.digest('hex').slice(0, 10)).replace('__FILES__', JSON.stringify(offline, null, 2)));
console.log('built', (page.length / 1024).toFixed(1), 'KB from', order.length, 'modules');
