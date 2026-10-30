// Bundles the game into one self-contained HTML file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const strip = (src) => src
  .replace(/^import[^;]*;\s*$/gm, '')
  .replace(/^export (const|function|class|let) /gm, '$1 ');

const js = ['core.js', 'render.js', 'sound.js', 'main.js'].map((f) => `// ---- ${f} ----\n` + strip(readFileSync(`src/${f}`, 'utf8'))).join('\n');
const page = readFileSync('src/page.html', 'utf8').replace('/*__SCRIPT__*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/gusinjska-kocka.html', page);

// Local test copy: the same page inside the skeleton the artifact host adds.
const skeleton = `<!doctype html><html lang="sr-Latn-ME"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${page}\n</body></html>`;
writeFileSync('dist/test.html', skeleton);
writeFileSync('index.html', skeleton); // GitHub Pages entry point
console.log('built', (page.length / 1024).toFixed(1), 'KB');
