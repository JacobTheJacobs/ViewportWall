// The actual work: emulate a device, load a page, run the checks, take pictures.
import { DEVICES, SETS, UA, QUICK_WIDTHS } from './devices.js';
import { CHECKS, DEFAULT_OPTS, SIGNATURE, DECLARED } from './checks.mjs';
import { getBrowser } from './browser.mjs';

export const allDevices = () => DEVICES;
export const findDevice = id => DEVICES.find(d => d.id === id) || DEVICES.find(d => d.name.toLowerCase() === String(id).toLowerCase());
export const findSet = id => SETS.find(s => s.id === id || s.name.toLowerCase() === String(id).toLowerCase());

export function widthDevice(w, h = w < 700 ? 800 : 900) {
  return { id: `w-${w}`, name: `${w}px`, brand: 'Width', category: 'breakpoint', os: 'any', width: w, height: h, dpr: w < 700 ? 2 : 1, mobile: w < 1024, touch: w < 1024 };
}

// Accepts device ids, set ids, or plain numbers ("390") and returns device profiles.
export function resolveDevices(list) {
  const out = [];
  for (const raw of list) {
    const item = String(raw).trim();
    if (/^\d+$/.test(item)) { out.push(widthDevice(+item)); continue; }
    const set = findSet(item);
    if (set) { for (const id of set.deviceIds) { const d = findDevice(id); if (d) out.push(d); } continue; }
    const d = findDevice(item);
    if (d) out.push(d); else throw new Error(`Unknown device or set: "${item}". Call list_devices to see valid ids.`);
  }
  const seen = new Set();
  return out.filter(d => !seen.has(d.id) && seen.add(d.id));
}

const uaFor = d => d.mobile ? (UA[d.os] || UA.mobile) : undefined;

async function withPage(device, fn, { mobileUA = false } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: device.width, height: device.height, deviceScaleFactor: device.dpr || 1, isMobile: !!device.mobile, hasTouch: !!device.touch });
    if (mobileUA && uaFor(device)) await page.setUserAgent(uaFor(device));
    return await fn(page);
  } finally { await page.close().catch(() => {}); }
}

async function load(page, url, { waitUntil = 'networkidle2', timeout = 30000, settle = 400 } = {}) {
  const res = await page.goto(url, { waitUntil, timeout }).catch(e => { throw new Error(`Could not load ${url}: ${e.message}`); });
  if (settle) await new Promise(r => setTimeout(r, settle));
  return { status: res?.status() ?? null };
}

export async function auditDevice(url, device, opts = {}) {
  const checkOpts = { ...DEFAULT_OPTS, ...opts.checks, touch: opts.checks?.touch ?? !!device.mobile };
  return withPage(device, async page => {
    const { status } = await load(page, url, opts);
    const result = await page.evaluate(`${CHECKS}(${JSON.stringify(checkOpts)})`);
    const out = { device: { id: device.id, name: device.name, width: device.width, height: device.height, dpr: device.dpr || 1, mobile: !!device.mobile }, status, ...result };
    if (opts.screenshot) out.screenshot = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: !!opts.fullPage, encoding: 'base64' });
    return out;
  }, opts);
}

export async function audit(url, devices, opts = {}) {
  const results = [];
  const limit = Math.max(1, Math.min(opts.concurrency || 3, 6));
  const queue = [...devices];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const d = queue.shift();
      try { results.push(await auditDevice(url, d, opts)); }
      catch (e) { results.push({ device: { id: d.id, name: d.name, width: d.width, height: d.height }, error: String(e.message || e), issues: [] }); }
    }
  }));
  results.sort((a, b) => devices.findIndex(d => d.id === a.device.id) - devices.findIndex(d => d.id === b.device.id));
  return results;
}

export async function shoot(url, device, opts = {}) {
  return withPage(device, async page => {
    await load(page, url, opts);
    const data = await page.screenshot({ type: opts.format === 'png' ? 'png' : 'jpeg', quality: opts.format === 'png' ? undefined : (opts.quality || 75), fullPage: !!opts.fullPage, encoding: 'base64' });
    return { device, data, mimeType: opts.format === 'png' ? 'image/png' : 'image/jpeg' };
  }, opts);
}

// Two answers: what the stylesheets declare, and what the layout actually does when swept.
export async function breakpoints(url, { min = 320, max = 1600, step = 16, ...opts } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: max, height: 900, deviceScaleFactor: 1 });
    await load(page, url, opts);
    const declared = await page.evaluate(`${DECLARED}()`);
    const inRange = declared.widths.filter(w => w >= min && w <= max);

    const sigAt = async w => {
      await page.setViewport({ width: w, height: w < 700 ? 800 : 900, deviceScaleFactor: 1, isMobile: w < 1024, hasTouch: w < 1024 });
      await new Promise(r => setTimeout(r, 110));
      return (await page.evaluate(`${SIGNATURE}()`)).hash;
    };
    const changes = [];
    let prev = await sigAt(min), prevW = min;
    for (let w = min + step; w <= max; w += step) {
      const sig = await sigAt(w);
      if (sig !== prev) changes.push([prevW, w]);
      prev = sig; prevW = w;
    }
    const exact = [];
    for (const [lo0, hi0] of changes.slice(0, 40)) {      // bisect each change to the exact pixel
      let lo = lo0, hi = hi0;
      const loSig = await sigAt(lo);
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (await sigAt(mid) === loSig) lo = mid; else hi = mid;
      }
      exact.push(hi);
    }
    return { url, range: [min, max], declared: inRange, observed: [...new Set(exact)].sort((a, b) => a - b), stylesheets: { readable: declared.readable, blocked: declared.blocked } };
  } finally { await page.close().catch(() => {}); }
}

export const commonWidths = QUICK_WIDTHS;
