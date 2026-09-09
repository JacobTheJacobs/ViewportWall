// Viewport Wall core: state, CDP targets, emulation, sync, capture, screenshots, sessions.
// UI code registers hooks in `ui`; the core never touches DOM structure directly except through them.
import { DEVICES, SETS, UA } from './devices.js';

export const state = {
  url: '',
  devices: [],
  activeId: null,
  sync: { navigation: true, scroll: true, clicks: false, input: false, reload: true },
  layout: { type: 'auto', zoom: 'fit', frames: 'realistic', browser: 'auto', theme: 'dark', sidebar: true },
  windowId: null,
  autoReload: 0,
};
export let customDevices = [];
export let savedSets = [];
export let sessions = [];
export let favorites = new Set();
let uid = 0;

// Hooks the UI layer fills in.
export const ui = {
  renderPanelState() {}, relayout() {}, mount() {}, unmount() {}, setUrl() {}, renderIssues() {},
  countChanged() {}, toast() {}, renderRecent() {}, frameUpdated() {}, setActive() {},
};

const INJECT = `(function(){
  if (window.__vwInstalled) return; window.__vwInstalled = true;
  const report = (type, data) => { try { __vwReport(JSON.stringify(Object.assign({type}, data))); } catch (e) {} };
  let t; addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => {
    const de = document.documentElement; const max = de.scrollHeight - innerHeight;
    report('scroll', { ratio: max > 0 ? scrollY / max : 0 });
  }, 60); }, { passive: true });
  const wrap = k => { const o = history[k]; history[k] = function() { const r = o.apply(this, arguments); report('nav', { url: location.href }); return r; }; };
  wrap('pushState'); wrap('replaceState');
  addEventListener('popstate', () => report('nav', { url: location.href }));
  addEventListener('hashchange', () => report('nav', { url: location.href }));
  const check = () => {
    const de = document.documentElement; const issues = [];
    if (de.scrollWidth > de.clientWidth) issues.push({ kind: 'overflow', msg: 'Horizontal overflow: ' + de.scrollWidth + 'px content in ' + de.clientWidth + 'px viewport' });
    const label = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '')) + (el.textContent ? ' "' + el.textContent.trim().slice(0, 30) + '"' : '');
    let n = 0;
    for (const el of document.querySelectorAll('button,a,h1,h2,h3,label,[role=button],input[type=submit]')) {
      if (n > 5) break;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && (cs.overflow !== 'visible' || cs.whiteSpace === 'nowrap')) { issues.push({ kind: 'clip', msg: 'Text clipped: ' + label(el) }); n++; }
    }
    n = 0;
    for (const el of document.querySelectorAll('*')) {
      if (n > 5) break;
      const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.right > innerWidth + 1 || r.left < -1) { issues.push({ kind: 'fixed', msg: 'Fixed element exceeds viewport: ' + label(el) }); n++; }
    }
    const cands = [...document.querySelectorAll('nav,header,button,a,h1,h2,img,[role=button],input')].filter(e => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.opacity !== '0' && e.getClientRects().length; }).slice(0, 80);
    const rects = cands.map(e => [e, e.getBoundingClientRect()]);
    let found = 0;
    for (let i = 0; i < rects.length && found < 3; i++) for (let j = i + 1; j < rects.length && found < 3; j++) {
      const [a, ra] = rects[i], [b, rb] = rects[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 8 && iy > 8 && ix * iy > 0.3 * Math.min(ra.width * ra.height, rb.width * rb.height)) { issues.push({ kind: 'overlap', msg: 'Elements overlap: ' + label(a) + ' and ' + label(b) }); found++; }
    }
    for (const img of document.images) { const r = img.getBoundingClientRect(); if (r.width && r.right > innerWidth + 1) { issues.push({ kind: 'image', msg: 'Image exceeds viewport: ' + (img.alt || img.src.split('/').pop().slice(0, 30)) }); break; } }
    report('check', { issues });
  };
  let c; const sched = () => { clearTimeout(c); c = setTimeout(check, 300); };
  addEventListener('load', sched); addEventListener('resize', sched); document.readyState === 'complete' && sched();
  new MutationObserver(sched).observe(document.documentElement, { childList: true, subtree: true, attributes: false });
})();`;

// Runs inside a target: collect min/max-width media query breakpoints from same-origin stylesheets + inline styles.
const DETECT_BP = `(()=>{const out=new Set();const re=/\\((?:min|max)-width\\s*:\\s*([\\d.]+)(px|em|rem)\\)/g;
  const walk=r=>{for(const x of r){if(x.media){let m;const t=x.media.mediaText;while((m=re.exec(t)))out.add(m[2]==='px'?+m[1]:Math.round(+m[1]*16));}
    if(x.cssRules){try{walk(x.cssRules)}catch(e){}}}};
  for(const sh of document.styleSheets){try{walk(sh.cssRules)}catch(e){}}
  return [...out].filter(n=>n>=200&&n<=3000).sort((a,b)=>a-b)})()`;


// ---------- persistence ----------
export async function loadPrefs() {
  const p = await chrome.storage.local.get(['customDevices', 'savedSets', 'prefs', 'lastDevices', 'recentUrls', 'sessions', 'favorites', 'onboarded']);
  sessions = p.sessions || []; favorites = new Set(p.favorites || []);
  customDevices = p.customDevices || [];
  savedSets = p.savedSets || [];
  if (p.prefs) { Object.assign(state.sync, p.prefs.sync || {}); Object.assign(state.layout, p.prefs.layout || {}); }
  if (!['auto', 'horizontal', 'grid', 'free', 'focus'].includes(state.layout.type)) state.layout.type = 'auto';
  if (typeof state.layout.frames === 'boolean') state.layout.frames = state.layout.frames ? 'realistic' : 'none';
  return p;
}
export function savePrefs() {
  chrome.storage.local.set({ prefs: { sync: state.sync, layout: state.layout }, lastDevices: state.devices.map(instToPreset) });
}
export const persist = obj => chrome.storage.local.set(obj);
export const allPresets = () => [...DEVICES, ...customDevices];
export const findPreset = id => allPresets().find(d => d.id === id);
export function addCustomDevice(dev) { customDevices.push(dev); persist({ customDevices }); }
export function removeCustomDevice(id) { customDevices = customDevices.filter(d => d.id !== id); persist({ customDevices }); }
export function toggleFavorite(id) { favorites.has(id) ? favorites.delete(id) : favorites.add(id); persist({ favorites: [...favorites] }); }
export function instToPreset(i) {
  return { id: i.presetId, name: i.name, width: i.baseW, height: i.baseH, dpr: i.dpr, mobile: i.mobile, touch: i.touch, os: i.os, category: i.category, brand: i.brand, orientation: i.orientation, zoom: i.zoom, net: i.net, cpu: i.cpu, note: i.note || '' };
}

// ---------- CDP ----------
export const send = (tabId, method, params = {}) => chrome.debugger.sendCommand({ tabId }, method, params);

function makeInstance(preset) {
  return {
    instanceId: 'd' + (++uid) + '_' + Date.now().toString(36),
    presetId: preset.id, name: preset.name, os: preset.os || 'any', category: preset.category || 'custom', brand: preset.brand || '',
    baseW: preset.width, baseH: preset.height, dpr: preset.dpr || 1,
    mobile: !!preset.mobile, touch: !!preset.touch,
    orientation: preset.orientation || 'portrait',
    zoom: preset.zoom || 1, net: preset.net || 'none', cpu: preset.cpu || 1, note: preset.note || '',
    tabId: null, status: 'loading', error: '', errorKind: '', url: '', frame: '', paused: false, capturing: false, dirty: true, issues: [],
  };
}
export const dims = i => i.orientation === 'portrait' ? [i.baseW, i.baseH] : [i.baseH, i.baseW];

async function ensureWindow() {
  if (state.windowId != null) { try { await chrome.windows.get(state.windowId); return; } catch {} }
  const win = await chrome.windows.create({ url: 'about:blank', focused: false, width: 520, height: 640, top: 40, left: 40 });
  state.windowId = win.id;
  state.spareTabId = win.tabs && win.tabs[0] ? win.tabs[0].id : null;
  chrome.runtime.sendMessage({ type: 'register-window', windowId: win.id });
}

const NET = {
  none: null,
  fast4g: { latency: 40, downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8 },
  slow4g: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 },
  '3g': { latency: 300, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};
export async function applyProfiles(inst) {
  if (inst.tabId == null) return;
  const n = NET[inst.net];
  await send(inst.tabId, 'Network.enable');
  await send(inst.tabId, 'Network.emulateNetworkConditions', n ? { offline: !!n.offline, latency: n.latency, downloadThroughput: n.downloadThroughput, uploadThroughput: n.uploadThroughput } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send(inst.tabId, 'Emulation.setCPUThrottlingRate', { rate: inst.cpu || 1 });
}
export async function applyEmulation(inst) {
  const [w, h] = dims(inst);
  await send(inst.tabId, 'Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: inst.dpr, mobile: inst.mobile, screenWidth: w, screenHeight: h,
    screenOrientation: inst.orientation === 'portrait' ? { type: 'portraitPrimary', angle: 0 } : { type: 'landscapePrimary', angle: 90 },
  });
  await send(inst.tabId, 'Emulation.setTouchEmulationEnabled', { enabled: inst.touch, maxTouchPoints: inst.touch ? 5 : 1 });
  if (inst.mobile) await send(inst.tabId, 'Emulation.setUserAgentOverride', { userAgent: UA[inst.os] || UA.mobile, platform: inst.os === 'ios' ? 'iPhone' : 'Linux armv8l' });
}

// Chrome net error → product copy.
export function classifyError(text) {
  const t = (text || '').toUpperCase();
  if (t.includes('CONNECTION_REFUSED')) return { kind: 'refused', title: "Couldn't load page", msg: 'refused the connection.' };
  if (t.includes('NAME_NOT_RESOLVED')) return { kind: 'dns', title: "Couldn't find server", msg: 'could not be resolved.' };
  if (t.includes('TIMED_OUT')) return { kind: 'timeout', title: 'Page timed out', msg: 'took too long to respond.' };
  if (t.includes('BLOCKED') || t.includes('CERT') || t.includes('UNSAFE')) return { kind: 'blocked', title: 'Page blocked', msg: 'was blocked by the browser.' };
  if (t.includes('INTERNET_DISCONNECTED')) return { kind: 'offline', title: 'You are offline', msg: 'could not be reached.' };
  if (t.includes('TARGET') || t.includes('CLOSED')) return { kind: 'closed', title: 'Target closed', msg: 'browser target was closed.' };
  if (t.includes('DETACH') || t.includes('CANCEL')) return { kind: 'detached', title: 'Debugger detached', msg: 'Chrome stopped the debugging session.' };
  return { kind: 'failed', title: 'Navigation failed', msg: /^[A-Z_:]+$/.test(text || '') ? 'could not be loaded.' : (text || 'could not be loaded.') };
}
export function setError(inst, msg, kind) {
  const c = classifyError(kind || msg);
  inst.status = 'error'; inst.error = msg; inst.errorKind = c.kind; inst.errorTitle = c.title; inst.errorMsg = c.msg;
  ui.renderPanelState(inst);
}

export async function createTarget(inst) {
  inst.status = 'loading'; inst.error = ''; ui.renderPanelState(inst);
  try {
    await ensureWindow();
    let tabId;
    if (state.spareTabId != null) { tabId = state.spareTabId; state.spareTabId = null; }
    else tabId = (await chrome.tabs.create({ windowId: state.windowId, url: 'about:blank', active: false })).id;
    inst.tabId = tabId; inst.url = state.url;
    await chrome.debugger.attach({ tabId }, '1.3');
    await send(tabId, 'Page.enable');
    await send(tabId, 'Runtime.enable');
    await send(tabId, 'Runtime.addBinding', { name: '__vwReport' });
    await send(tabId, 'Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
    await applyEmulation(inst); await applyProfiles(inst);
    const r = await send(tabId, 'Page.navigate', { url: state.url });
    if (r && r.errorText) setError(inst, r.errorText);
    inst.dirty = true;
  } catch (e) { setError(inst, e && e.message ? e.message : String(e)); }
}
export async function destroyTarget(inst) {
  const tabId = inst.tabId; inst.tabId = null;
  if (tabId == null) return;
  try { await chrome.debugger.detach({ tabId }); } catch {}
  try { await chrome.tabs.remove(tabId); } catch {}
}

chrome.debugger.onEvent.addListener((src, method, params) => {
  const inst = state.devices.find(d => d.tabId === src.tabId);
  if (!inst) return;
  const isActive = inst.instanceId === state.activeId;
  if (method === 'Page.frameNavigated' && !params.frame.parentId) {
    const url = params.frame.url;
    if (params.frame.unreachableUrl) { inst.url = params.frame.unreachableUrl; if (inst.status !== 'error') setError(inst, 'Chrome could not load ' + params.frame.unreachableUrl, 'NAVIGATION_FAILED'); return; }
    if (url === 'about:blank') return;
    inst.url = url; inst.status = 'loading'; inst.errorKind = ''; ui.renderPanelState(inst);
    if (isActive) onActiveNavigated(url);
  } else if (method === 'Page.loadEventFired') {
    if (inst.status !== 'error') { inst.status = 'ready'; ui.renderPanelState(inst); }
    inst.dirty = true; setTimeout(() => { inst.dirty = true; }, 400);
  } else if (method === 'Runtime.bindingCalled' && params.name === '__vwReport') {
    let data; try { data = JSON.parse(params.payload); } catch { return; }
    inst.dirty = true;
    if (data.type === 'check') { inst.issues = data.issues || []; ui.renderPanelState(inst); ui.renderIssues(); return; }
    if (!isActive) return;
    if (data.type === 'scroll' && state.sync.scroll) syncScroll(inst, data.ratio);
    if (data.type === 'nav') onActiveNavigated(data.url);
  }
});
chrome.debugger.onDetach.addListener((src, reason) => {
  const inst = state.devices.find(d => d.tabId === src.tabId);
  if (!inst) return;
  inst.tabId = null;
  setError(inst, reason === 'canceled_by_user' ? 'Debugging was cancelled in Chrome.' : reason === 'target_closed' ? 'Browser target closed.' : 'Debugger detached: ' + reason, reason === 'target_closed' ? 'TARGET_CLOSED' : 'DETACHED');
});
chrome.tabs.onRemoved.addListener(tabId => {
  const inst = state.devices.find(d => d.tabId === tabId);
  if (inst) { inst.tabId = null; setError(inst, 'Browser target closed.', 'TARGET_CLOSED'); }
});

let navGuard = '';
function onActiveNavigated(url) {
  if (!url || url === state.url) return;
  state.url = url; ui.setUrl(url); pushRecent(url);
  if (!state.sync.navigation) return;
  if (navGuard === url) return; navGuard = url;
  for (const d of state.devices) {
    if (d.instanceId === state.activeId || d.tabId == null || d.url === url) continue;
    d.url = url; send(d.tabId, 'Page.navigate', { url }).catch(() => {});
  }
}
let scrollTimer = null, pendingRatio = null;
function syncScroll(from, ratio) {
  pendingRatio = ratio;
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    scrollTimer = null; const r = pendingRatio;
    for (const d of state.devices) {
      if (d === from || d.tabId == null || d.paused) continue;
      send(d.tabId, 'Runtime.evaluate', { expression: `(()=>{const de=document.documentElement;const max=de.scrollHeight-innerHeight;window.scrollTo({top:max*${r},behavior:'instant'})})()` }).then(() => { d.dirty = true; }).catch(() => {});
    }
  }, 80);
}

// ---------- capture loop ----------
async function capture(inst, force = false) {
  if (inst.tabId == null || inst.capturing || inst.paused || inst.offscreen || inst.status === 'error') return;
  if (!force && !inst.dirty) return;
  inst.capturing = true; inst.dirty = false;
  try {
    const [w, h] = dims(inst);
    const r = await send(inst.tabId, 'Page.captureScreenshot', { format: 'jpeg', quality: 65, optimizeForSpeed: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    inst.frame = 'data:image/jpeg;base64,' + r.data;
    ui.frameUpdated(inst);
    if (inst.status === 'loading') { inst.status = 'ready'; ui.renderPanelState(inst); }
  } catch { inst.dirty = true; }
  finally { inst.capturing = false; }
}
let tick = 0;
setInterval(() => {
  tick++;
  for (const d of state.devices) {
    if (d.instanceId === state.activeId) capture(d, tick % 2 === 0);
    else if (d.dirty || tick % 10 === 0) capture(d, tick % 10 === 0);
  }
}, 250);

// ---------- device operations ----------
export async function addDevices(presets) {
  const added = [];
  for (const p of presets) { const inst = makeInstance(p); state.devices.push(inst); ui.mount(inst); added.push(inst); }
  if (!state.activeId && state.devices.length) setActive(state.devices[0].instanceId);
  ui.countChanged(); ui.relayout(); savePrefs();
  for (const inst of added) await createTarget(inst);
  return added;
}
export async function removeDevice(inst) {
  state.devices = state.devices.filter(d => d !== inst);
  ui.unmount(inst);
  await destroyTarget(inst);
  if (state.activeId === inst.instanceId) setActive(state.devices[0]?.instanceId || null);
  ui.countChanged(); ui.relayout(); savePrefs();
}
export async function clearDevices() { for (const d of [...state.devices]) await removeDevice(d); }
export async function rotate(inst) {
  inst.orientation = inst.orientation === 'portrait' ? 'landscape' : 'portrait';
  ui.renderPanelState(inst); ui.relayout(); savePrefs();
  if (inst.tabId != null) { try { await applyEmulation(inst); inst.dirty = true; } catch (e) { setError(inst, e.message); } }
}
export function setActive(id) { state.activeId = id; ui.setActive(id); }
export function togglePause(inst) { inst.paused = !inst.paused; ui.renderPanelState(inst); if (!inst.paused) inst.dirty = true; }
export function retry(inst) { destroyTarget(inst).then(() => createTarget(inst)); }
export async function reloadOne(inst, hard = false) {
  if (inst.tabId == null) return retry(inst);
  inst.status = 'loading'; inst.errorKind = ''; ui.renderPanelState(inst);
  send(inst.tabId, 'Page.reload', { ignoreCache: hard }).catch(() => {});
}
export function setViewport(inst, w, h, dpr) {
  if (w) { if (inst.orientation === 'portrait') inst.baseW = w; else inst.baseH = w; }
  if (h) { if (inst.orientation === 'portrait') inst.baseH = h; else inst.baseW = h; }
  if (dpr) inst.dpr = dpr;
  if (inst.tabId != null) applyEmulation(inst).then(() => { inst.dirty = true; }).catch(() => {});
}
export async function navigateAll(url) {
  url = normalizeUrl(url); if (!url) return;
  state.url = url; navGuard = url; ui.setUrl(url); pushRecent(url);
  for (const d of state.devices) {
    d.url = url; d.errorKind = '';
    if (d.tabId != null) { d.status = 'loading'; ui.renderPanelState(d); send(d.tabId, 'Page.navigate', { url }).then(r => { if (r && r.errorText) setError(d, r.errorText); }).catch(() => {}); }
    else retry(d);
  }
}
export function normalizeUrl(u) {
  u = (u || '').trim(); if (!u) return '';
  if (!/^[a-z]+:\/\//i.test(u)) u = (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u) ? 'http://' : 'https://') + u;
  return u;
}
function pushRecent(url) {
  chrome.storage.local.get('recentUrls').then(({ recentUrls = [] }) => {
    recentUrls = [url, ...recentUrls.filter(u => u !== url)].slice(0, 20);
    chrome.storage.local.set({ recentUrls }); ui.renderRecent(recentUrls);
  });
}
export function navHistory(dir) {
  for (const d of state.devices) if (d.tabId != null) send(d.tabId, 'Runtime.evaluate', { expression: dir > 0 ? 'history.forward()' : 'history.back()' }).catch(() => {});
}
export function reloadAll(hard = false) {
  const list = state.sync.reload ? state.devices : state.devices.filter(d => d.instanceId === state.activeId);
  for (const d of list) reloadOne(d, hard);
}
let autoTimer = null;
export function setAutoReload(sec) {
  clearInterval(autoTimer); autoTimer = null; state.autoReload = sec;
  if (sec > 0) autoTimer = setInterval(() => reloadAll(false), sec * 1000);
}
export async function reorder(fromId, toId) {
  const from = state.devices.findIndex(d => d.instanceId === fromId), to = state.devices.findIndex(d => d.instanceId === toId);
  if (from < 0 || to < 0) return;
  const [m] = state.devices.splice(from, 1); state.devices.splice(to, 0, m); savePrefs();
}

// ---------- input forwarding ----------
const KEYS = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34, ' ': 32 };
function wireInput(inst, screen) {
  // Map panel pixels to target CSS px via the target's visual viewport (mobile emulation zooms out on overflowing pages).
  const pos = e => {
    const r = screen.getBoundingClientRect(); const [w, h] = dims(inst); const vv = inst.vv;
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    return vv ? { x: Math.round(vv.offsetX + fx * vv.clientWidth), y: Math.round(vv.offsetY + fy * vv.clientHeight) } : { x: Math.round(fx * w), y: Math.round(fy * h) };
  };
  const refreshVV = async () => { try { inst.vv = (await send(inst.tabId, 'Page.getLayoutMetrics')).cssVisualViewport; } catch {} };
  const mods = e => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  const fin = () => { inst.dirty = true; };
  // Input events are serialized per device so a down/up pair never arrives out of order.
  const queue = fn => { inst.q = (inst.q || Promise.resolve()).then(fn).then(fin).catch(() => {}); };
  const mouse = (type, e, extra = {}) => {
    if (inst.tabId == null || inst.paused) return;
    queue(() => send(inst.tabId, 'Input.dispatchMouseEvent', { type, ...pos(e), modifiers: mods(e), button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra }));
  };
  const touch = (type, e) => {
    if (inst.tabId == null || inst.paused) return;
    queue(() => send(inst.tabId, 'Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [pos(e)], modifiers: mods(e) }));
  };
  let down = false;
  screen.addEventListener('mousedown', e => {
    if (e.button !== 0 || inst.tabId == null) return; screen.focus(); down = true;
    queue(refreshVV);
    inst.touch ? touch('touchStart', e) : mouse('mousePressed', e);
    if (state.sync.clicks) queue(() => syncClick(inst, pos(e)));
  });
  screen.addEventListener('mouseup', e => { if (e.button !== 0) return; down = false; inst.touch ? touch('touchEnd', e) : mouse('mouseReleased', e); });
  screen.addEventListener('mousemove', e => { if (down) inst.touch ? touch('touchMove', e) : mouse('mouseMoved', e, { button: 'left' }); });
  screen.addEventListener('mouseleave', e => { if (down) { down = false; inst.touch ? touch('touchEnd', e) : mouse('mouseReleased', e); } });
  screen.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { inst.zoom = Math.max(0.25, Math.min(3, +((inst.zoom || 1) * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))); ui.relayout(); return; }
    if (inst.tabId == null || inst.paused) return;
    if (!inst.vv) refreshVV();
    queue(() => send(inst.tabId, 'Input.dispatchMouseEvent', { type: 'mouseWheel', ...pos(e), deltaX: e.deltaX, deltaY: e.deltaY, modifiers: mods(e) }));
  }, { passive: false });
  screen.addEventListener('keydown', e => {
    if (inst.tabId == null || inst.paused) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { queue(() => send(inst.tabId, 'Input.insertText', { text: e.key }).then(() => state.sync.input && syncInput(inst))); return; }
    const code = KEYS[e.key]; if (!code && e.key.length !== 1) return;
    const base = { key: e.key, code: e.code, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods(e) };
    queue(() => send(inst.tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }).then(() => send(inst.tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base })));
  });
}

// Element descriptor of what was clicked in the active device; matched in others by id > data-testid > href > aria-label > text.
const DESCRIBE = (x, y) => `(()=>{let el=document.elementFromPoint(${x},${y});if(!el)return null;const t=el.closest('a,button,[role=button],input,select,textarea,label,summary')||el;
  return {id:t.id||'',testid:t.getAttribute('data-testid')||'',href:t.getAttribute('href')||'',aria:t.getAttribute('aria-label')||'',text:(t.innerText||t.value||'').trim().slice(0,80),tag:t.tagName}})()`;
const FIND = `(d)=>{const vis=e=>e&&e.getClientRects().length;let el=null;
  if(d.id)el=document.getElementById(d.id);
  if(!vis(el)&&d.testid)el=document.querySelector('[data-testid="'+d.testid.replace(/"/g,'')+'"]');
  if(!vis(el)&&d.href)el=[...document.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===d.href&&vis(a));
  if(!vis(el)&&d.aria)el=document.querySelector('[aria-label="'+d.aria.replace(/"/g,'')+'"]');
  if(!vis(el)&&d.text)el=[...document.querySelectorAll(d.tag+',a,button,[role=button]')].find(e=>vis(e)&&(e.innerText||e.value||'').trim().slice(0,80)===d.text);
  return vis(el)?el:null}`;
async function syncClick(from, { x, y }) {
  let desc; try { desc = (await send(from.tabId, 'Runtime.evaluate', { expression: DESCRIBE(x, y), returnByValue: true })).result.value; } catch { return; }
  if (!desc || !(desc.id || desc.testid || desc.href || desc.aria || desc.text)) return;
  for (const d of state.devices) {
    if (d === from || d.tabId == null || d.paused) continue;
    send(d.tabId, 'Runtime.evaluate', { expression: `(${FIND})(${JSON.stringify(desc)})?.click()` }).then(() => { d.dirty = true; }).catch(() => {});
  }
}
async function syncInput(from) {
  let f; try { f = (await send(from.tabId, 'Runtime.evaluate', { expression: `(()=>{const a=document.activeElement;if(!a||!('value' in a))return null;return {id:a.id,name:a.name||'',testid:a.getAttribute('data-testid')||'',ph:a.placeholder||'',type:a.type||'',value:a.value}})()`, returnByValue: true })).result.value; } catch { return; }
  if (!f) return;
  const expr = `((f)=>{let el=null;if(f.id)el=document.getElementById(f.id);if(!el&&f.name)el=document.querySelector('[name="'+f.name+'"]');if(!el&&f.testid)el=document.querySelector('[data-testid="'+f.testid+'"]');if(!el&&f.ph)el=document.querySelector('[placeholder="'+f.ph.replace(/"/g,'')+'"]');
    if(!el)return;const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value')?.set;setter?setter.call(el,f.value):el.value=f.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})(${JSON.stringify(f)})`;
  for (const d of state.devices) { if (d === from || d.tabId == null || d.paused) continue; send(d.tabId, 'Runtime.evaluate', { expression: expr }).then(() => { d.dirty = true; }).catch(() => {}); }
}


export { wireInput };

// ---------- screenshots ----------
export function download(name, dataUrl) { const a = document.createElement('a'); a.href = dataUrl; a.download = name; a.click(); }
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export async function screenshotDevice(inst) {
  if (inst.tabId == null) return;
  const [w, h] = dims(inst);
  const r = await send(inst.tabId, 'Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: inst.dpr } });
  download(`${slug(inst.name)}-${w}x${h}.png`, 'data:image/png;base64,' + r.data);
}
export async function screenshotFullPage(inst) {
  if (inst.tabId == null) return;
  const m = await send(inst.tabId, 'Page.getLayoutMetrics');
  const [w] = dims(inst); const h = Math.min(Math.ceil(m.cssContentSize.height), 16000);
  const r = await send(inst.tabId, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: inst.dpr } });
  download(`${slug(inst.name)}-${w}x${h}-full.png`, 'data:image/png;base64,' + r.data);
  inst.dirty = true;
}
export async function screenshotAll(full = false) {
  for (const d of state.devices) if (d.tabId != null) { await (full ? screenshotFullPage(d) : screenshotDevice(d)); await new Promise(r => setTimeout(r, 300)); }
}
export async function detectBreakpoints() {
  const src = state.devices.find(d => d.instanceId === state.activeId && d.tabId != null) || state.devices.find(d => d.tabId != null);
  if (!src) return [];
  try { const r = await send(src.tabId, 'Runtime.evaluate', { expression: DETECT_BP, returnByValue: true }); return r.result.value || []; } catch { return []; }
}
export const widthPreset = w => ({ id: 'bp-' + w, name: w + 'px', brand: 'Breakpoint', category: 'breakpoint', os: 'any', width: w, height: w < 700 ? 800 : w < 1100 ? 1024 : 900, dpr: w < 700 ? 2 : 1, mobile: w < 1024, touch: w < 1024 });

// ---------- report ----------
export function buildReport() {
  const lines = ['## Responsive QA', '', `URL: ${state.url}`, `Date: ${new Date().toLocaleString()}`, ''];
  let n = 0;
  for (const d of state.devices) {
    const [w, h] = dims(d); const iss = d.issues || [];
    const probs = [...iss.map(i => i.msg), ...(d.note ? [d.note] : [])]; n += iss.length;
    lines.push(probs.length ? `⚠ ${d.name} (${w}×${h}) — ${probs.join('; ')}` : `✓ ${d.name} (${w}×${h})`);
  }
  lines.push('', `${n} responsive issue${n === 1 ? '' : 's'} found.`, '', 'Made with Viewport Wall');
  return lines.join('\n');
}

// ---------- sets & sessions ----------
export function allSets() { return [...SETS, ...savedSets]; }
export async function applySet(id, replace = true) {
  const s = allSets().find(x => x.id === id); if (!s) return;
  if (replace) await clearDevices();
  await addDevices(s.deviceIds.map(findPreset).filter(Boolean));
}
export function saveSet(name) {
  const ids = state.devices.map(d => {
    if (findPreset(d.presetId)) return d.presetId;
    const dev = { ...instToPreset(d), id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), brand: 'Custom', custom: true, tags: ['custom'] };
    customDevices.push(dev); return dev.id;
  });
  persist({ customDevices });
  const set = { id: 'set-' + Date.now().toString(36), name, deviceIds: ids };
  savedSets.push(set); persist({ savedSets }); return set;
}
export function deleteSet(id) { savedSets = savedSets.filter(s => s.id !== id); persist({ savedSets }); }
export function saveSession(name) {
  const s = { id: 's' + Date.now().toString(36), name, ts: Date.now(), url: state.url, devices: state.devices.map(instToPreset), layout: { ...state.layout }, sync: { ...state.sync } };
  sessions.push(s); persist({ sessions }); return s;
}
export function deleteSession(id) { sessions = sessions.filter(s => s.id !== id); persist({ sessions }); }
export async function loadSession(id) {
  const x = sessions.find(v => v.id === id); if (!x) return null;
  await clearDevices();
  Object.assign(state.layout, x.layout); Object.assign(state.sync, x.sync);
  state.url = x.url; ui.setUrl(x.url);
  await addDevices(x.devices);
  return x;
}

window.addEventListener('beforeunload', () => { for (const d of state.devices) if (d.tabId != null) chrome.debugger.detach({ tabId: d.tabId }); });
