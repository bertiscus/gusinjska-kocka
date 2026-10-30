// Bundles the game into one self-contained HTML page.
// Each ES module is wrapped in its own function scope, so modules can reuse helper names
// (the tracker's `dot`, `cross`, ... ) without clashing. Only plain `import { a, b as c } from './x.js'`
// and `export function|class|const|let` are used in src/, and that is all this handles.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const page = readFileSync('src/page.html', 'utf8').replace('/*__SCRIPT__*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/gusinjska-kocka.html', page);

// GitHub Pages entry point: the same page inside the skeleton the artifact host adds.
const skeleton = `<!doctype html><html lang="sr-Latn-ME"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${page}\n</body></html>`;
writeFileSync('dist/test.html', skeleton);
writeFileSync('index.html', skeleton);
console.log('built', (page.length / 1024).toFixed(1), 'KB from', order.length, 'modules');
