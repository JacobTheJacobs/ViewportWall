// Bundles the package into one file that runs straight from Node, with no install step:
//   node viewport-wall-mcp.mjs
// Everything is plain ESM with no dependencies, so bundling is inlining in dependency order.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDER = ['src/devices.js', 'src/checks.mjs', 'src/cdp.mjs', 'src/audit.mjs', 'src/rpc.mjs', 'src/index.mjs'];
const nodeImports = new Set();
const bodies = [];

for (const file of ORDER) {
  const lines = readFileSync(new URL(file, import.meta.url), 'utf8').split('\n');
  const kept = [];
  for (const line of lines) {
    if (/^import .* from '\.\//.test(line)) continue;                       // local import: the code is inlined below
    if (/^import .* from 'node:/.test(line)) { nodeImports.add(line); continue; }
    if (line.startsWith('#!')) continue;
    kept.push(line.replace(/^export (const|let|function|async function|class) /, '$1 '));
  }
  bodies.push(`// ---------- ${file} ----------\n` + kept.join('\n').trim());
}

const out = [
  '#!/usr/bin/env node',
  '// viewport-wall-mcp — single file build. Run it directly: node viewport-wall-mcp.mjs',
  '// Source: https://github.com/JacobTheJacobs/ViewportWall/tree/master/mcp',
  [...nodeImports].join('\n'),
  '',
  bodies.join('\n\n'),
  '',
].join('\n');

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
const dest = new URL('./dist/viewport-wall-mcp.mjs', import.meta.url);
writeFileSync(dest, out);
console.log('built dist/viewport-wall-mcp.mjs', (out.length / 1024).toFixed(1) + ' KB');
