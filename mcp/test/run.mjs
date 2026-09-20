// End-to-end checks: the engine finds the planted bugs, stays quiet on a clean page,
// and the MCP server answers a real tools/list and tools/call over stdio.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// Run against the source by default, or the single-file build: node test/run.mjs dist
const target = process.argv[2] === 'dist' ? ['dist', 'viewport-wall-mcp.mjs'] : ['src', 'index.mjs'];
const ENTRY = path.join(here, '..', ...target);
console.log('testing', target.join('/'));
let failed = [];
const ok = (name, cond, detail) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : ` — ${detail}`)); if (!cond) failed.push(name); };

const server = http.createServer((req, res) => {
  const file = req.url.startsWith('/clean') ? 'clean.html' : 'fixture.html';
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(readFileSync(path.join(here, file)));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// --- MCP over stdio ---
function rpc(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + '\n');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for id ' + msg.id)), 120000);
    const onData = buf => {
      for (const line of buf.toString().split('\n')) {
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === msg.id) { clearTimeout(timer); proc.stdout.off('data', onData); resolve(m); }
      }
    };
    proc.stdout.on('data', onData);
  });
}

const proc = spawn(process.execPath, [ENTRY], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffered = '';
proc.stdout.on('data', d => { buffered += d; });
const init = await rpc(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
ok('MCP initialize', init.result?.serverInfo?.name === 'viewport-wall', JSON.stringify(init.result?.serverInfo));
proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const tools = await rpc(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
const names = (tools.result?.tools || []).map(t => t.name).sort();
ok('MCP lists four tools', JSON.stringify(names) === JSON.stringify(['audit_responsive', 'find_breakpoints', 'list_devices', 'screenshot']), names);
ok('tools carry input schemas', (tools.result.tools || []).every(t => t.inputSchema?.type === 'object'));

const call = await rpc(proc, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'audit_responsive', arguments: { url: base + '/fixture', devices: ['iphone-se', '1440'] } } });
const text = call.result?.content?.[0]?.text || '';
ok('audit returns text', text.includes('Responsive audit'), text.slice(0, 80));
for (const kind of ['viewport-meta', 'overflow', 'clipped-text', 'small-text', 'tap-target', 'image-overflow', 'fixed-overflow'])
  ok(`finds ${kind}`, text.includes(kind), text.slice(0, 400));
ok('names the element behind an issue', /element: (div|p|button|a|img)/.test(text), text.slice(0, 300));
const phonePart = text.split('1440px')[0], deskPart = text.split('1440px')[1] || '';
ok('phone-only rules stay off the desktop viewport', !/tap-target|small-text/.test(deskPart) && /tap-target/.test(phonePart), deskPart.slice(0, 200));
ok('desktop reports fewer issues than the phone', (deskPart.match(/- \[/g) || []).length < (phonePart.match(/- \[/g) || []).length, [(phonePart.match(/- \[/g) || []).length, (deskPart.match(/- \[/g) || []).length]);

const clean = await rpc(proc, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'audit_responsive', arguments: { url: base + '/clean', devices: ['iphone-se', 'ipad-pro-11'] } } });
const cleanText = clean.result.content[0].text;
ok('clean page reports no issues', /0 issues found/.test(cleanText), cleanText.slice(0, 200));

const shot = await rpc(proc, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'screenshot', arguments: { url: base + '/clean', devices: ['iphone-se'] } } });
const img = (shot.result?.content || []).find(c => c.type === 'image');
ok('screenshot returns an image', !!img && img.data.length > 2000 && img.mimeType === 'image/jpeg', img && img.data.length);

const bp = await rpc(proc, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'find_breakpoints', arguments: { url: base + '/clean', min: 600, max: 1200, step: 16 } } });
const bpText = bp.result.content[0].text;
ok('finds the 700px and 1100px breakpoints', /\b700\b/.test(bpText) && /\b1100\b/.test(bpText), bpText);

const bad = await rpc(proc, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'audit_responsive', arguments: { url: base + '/clean', devices: ['not-a-device'] } } });
ok('unknown device is an error, not a crash', bad.result?.isError === true && /Unknown device/.test(bad.result.content[0].text), JSON.stringify(bad.result).slice(0, 200));

proc.kill();

// --- CLI ---
const run = (args) => new Promise(res => {
  const p = spawn(process.execPath, [ENTRY, ...args], { encoding: 'utf8' });
  let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', code => res({ code, out }));
});
const cliAudit = await run(['audit', base + '/fixture', '--devices', 'iphone-se', '--json']);
ok('CLI --json is valid JSON', (() => { try { return JSON.parse(cliAudit.out).results.length === 1; } catch { return false; } })(), cliAudit.out.slice(0, 120));
ok('CLI exits non-zero when the page is broken', cliAudit.code === 1, cliAudit.code);
const cliClean = await run(['audit', base + '/clean', '--devices', 'iphone-se']);
ok('CLI exits zero when the page is clean', cliClean.code === 0, cliClean.out.slice(0, 200));

server.close();
console.log('SUMMARY:', failed.length ? `${failed.length} failed: ${failed.join(', ')}` : 'all passed');
process.exit(failed.length ? 1 : 0);
