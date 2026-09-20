// A small Chrome DevTools Protocol client. No dependencies: Node's built-in WebSocket drives the Chrome that is
// already installed, so this file plus Node is the whole runtime.
import { existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = {
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/opt/google/chrome/chrome'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
};

export function findChrome(explicit) {
  for (const p of [explicit, process.env.CHROME_PATH, ...(CANDIDATES[process.platform] || [])].filter(Boolean)) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try { const p = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' }).split('\n')[0].trim(); if (p && existsSync(p)) return p; } catch {}
  }
  throw new Error('Could not find Chrome. Install Google Chrome or Chromium, or set CHROME_PATH to the executable.');
}

class Connection {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Set();
    ws.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id); this.pending.delete(msg.id); clearTimeout(timer);
        msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) for (const fn of this.listeners) fn(msg);
    });
    ws.addEventListener('close', () => { for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Chrome connection closed')); } this.pending.clear(); });
  }
  send(method, params = {}, sessionId, timeout = 45000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out after ${timeout}ms`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close() { try { this.ws.close(); } catch {} }
}

// One browser per process, started on first use.
let browser = null, opts = {};
export function configure(o) { opts = { ...opts, ...o }; }

async function wsFromEndpoint(endpoint) {
  const base = endpoint.startsWith('http') ? endpoint : `http://${endpoint}`;
  const r = await fetch(new URL('/json/version', base));
  if (!r.ok) throw new Error(`Chrome at ${base} did not answer /json/version (${r.status}).`);
  return (await r.json()).webSocketDebuggerUrl;
}

async function connect(url) {
  if (typeof WebSocket !== 'function') throw new Error('This Node build has no WebSocket. Node 22 or newer is required.');
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Timed out connecting to Chrome')), 20000);
    ws.addEventListener('open', () => { clearTimeout(t); res(); });
    ws.addEventListener('error', () => { clearTimeout(t); rej(new Error('Could not connect to Chrome')); });
  });
  return new Connection(ws);
}

export async function getBrowser() {
  if (browser) return browser;
  if (opts.connect) { browser = { conn: await connect(await wsFromEndpoint(opts.connect)), attached: true }; return browser; }
  const bin = findChrome(opts.chromePath);
  const profile = opts.profile || mkdtempSync(join(tmpdir(), 'viewport-wall-'));
  const args = [
    opts.headed ? '--remote-debugging-port=0' : '--headless=new', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=Translate',
    ...(opts.args || []), 'about:blank',
  ].filter((a, i, all) => all.indexOf(a) === i);
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error('Chrome did not report a debugging port in 30s')), 30000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(timer); res(m[0]); } });
    proc.on('exit', c => { clearTimeout(timer); rej(new Error(`Chrome exited (${c}) before it was ready. ${buf.split('\n').slice(-3).join(' ')}`)); });
  });
  browser = { conn: await connect(url), proc, profile, temp: !opts.profile };
  return browser;
}

export async function closeBrowser() {
  const b = browser; browser = null;
  if (!b) return;
  try { if (!b.attached) await b.conn.send('Browser.close').catch(() => {}); } catch {}
  b.conn.close();
  if (b.proc) { try { b.proc.kill(); } catch {} }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => closeBrowser().finally(() => process.exit(0)));

// One tab, with the CDP calls the audit needs.
export class Page {
  static async open() {
    const { conn } = await getBrowser();
    const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(conn, targetId, sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    page.offEvent = conn.on(msg => { if (msg.sessionId === sessionId) page.handle(msg); });
    return page;
  }
  constructor(conn, targetId, sessionId) {
    this.conn = conn; this.targetId = targetId; this.sessionId = sessionId;
    this.inflight = 0; this.waiters = new Set();
  }
  send(method, params, timeout) { return this.conn.send(method, params, this.sessionId, timeout); }
  handle(msg) {
    if (msg.method === 'Network.requestWillBeSent') this.inflight++;
    else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') this.inflight = Math.max(0, this.inflight - 1);
    for (const w of this.waiters) w(msg);
  }
  once(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(w); reject(new Error(`Timed out waiting for ${method}`)); }, timeout);
      const w = msg => { if (msg.method === method) { clearTimeout(timer); this.waiters.delete(w); resolve(msg.params); } };
      this.waiters.add(w);
    });
  }
  async setViewport({ width, height, dpr = 1, mobile = false, touch = false }) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: !!mobile, screenWidth: width, screenHeight: height });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 }).catch(() => {});
  }
  setUserAgent(ua) { return this.send('Network.setUserAgentOverride', { userAgent: ua }); }
  async goto(url, { waitUntil = 'networkidle2', timeout = 30000, settle = 400 } = {}) {
    const load = waitUntil === 'domcontentloaded' ? this.once('Page.domContentEventFired', timeout) : this.once('Page.loadEventFired', timeout);
    const res = await this.send('Page.navigate', { url }, timeout);
    if (res.errorText) throw new Error(`${res.errorText} for ${url}`);
    await load.catch(() => {});                       // a page that never fires load is still worth checking
    if (waitUntil.startsWith('networkidle')) await this.waitIdle(waitUntil === 'networkidle0' ? 0 : 2, timeout);
    if (settle) await new Promise(r => setTimeout(r, settle));
    return res;
  }
  async waitIdle(max = 2, timeout = 15000) {
    const start = Date.now();
    let quietSince = null;
    while (Date.now() - start < timeout) {
      if (this.inflight <= max) { quietSince ??= Date.now(); if (Date.now() - quietSince > 500) return; }
      else quietSince = null;
      await new Promise(r => setTimeout(r, 60));
    }
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('Page script failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async screenshot({ format = 'jpeg', quality = 75, fullPage = false } = {}) {
    const params = { format, ...(format === 'jpeg' ? { quality } : {}), optimizeForSpeed: true };
    if (fullPage) {
      const m = await this.send('Page.getLayoutMetrics');
      const w = Math.ceil(m.cssContentSize.width), h = Math.min(Math.ceil(m.cssContentSize.height), 16000);
      Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    }
    return (await this.send('Page.captureScreenshot', params, 60000)).data;
  }
  async close() {
    this.offEvent?.();
    await this.conn.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }
}
