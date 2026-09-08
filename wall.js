import { DEVICES, SETS, QUICK_WIDTHS, UA } from './devices.js';

// ---------- state ----------
const state = {
  url: '',
  devices: [],           // DeviceInstance[]
  activeId: null,
  sync: { navigation: true, scroll: true, clicks: false, input: false },
  layout: { type: 'grid', zoom: 'fit', frames: false },
  windowId: null,
};
let customDevices = [];
let savedSets = [];
let uid = 0;

const $ = (s, el = document) => el.querySelector(s);
const wallEl = $('#wall');
const panels = new Map(); // instanceId -> element

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
async function loadPrefs() {
  const p = await chrome.storage.local.get(['customDevices', 'savedSets', 'prefs', 'lastDevices', 'recentUrls', 'sessions', 'favorites', 'onboarded']);
  sessions = p.sessions || []; favorites = new Set(p.favorites || []);
  customDevices = p.customDevices || [];
  savedSets = p.savedSets || [];
  if (p.prefs) { Object.assign(state.sync, p.prefs.sync || {}); Object.assign(state.layout, p.prefs.layout || {}); }
  return p;
}
function savePrefs() {
  chrome.storage.local.set({
    prefs: { sync: state.sync, layout: state.layout },
    lastDevices: state.devices.map(instToPreset),
  });
}
const allPresets = () => [...DEVICES, ...customDevices];
const findPreset = id => allPresets().find(d => d.id === id);
function instToPreset(i) {
  return { id: i.presetId, name: i.name, width: i.baseW, height: i.baseH, dpr: i.dpr, mobile: i.mobile, touch: i.touch, os: i.os, category: i.category, orientation: i.orientation, zoom: i.zoom, net: i.net, cpu: i.cpu };
}

// ---------- CDP helpers ----------
const send = (tabId, method, params = {}) => chrome.debugger.sendCommand({ tabId }, method, params);

function makeInstance(preset) {
  const inst = {
    instanceId: 'd' + (++uid) + '_' + Date.now().toString(36),
    presetId: preset.id, name: preset.name, os: preset.os || 'any', category: preset.category || 'custom',
    baseW: preset.width, baseH: preset.height, dpr: preset.dpr || 1,
    mobile: !!preset.mobile, touch: !!preset.touch,
    orientation: preset.orientation || 'portrait',
    zoom: preset.zoom || 1, net: preset.net || 'none', cpu: preset.cpu || 1,
    zoom: 1, net: 'none', cpu: 1,
    tabId: null, status: 'loading', error: '', url: '', frame: '', paused: false, capturing: false, dirty: true,
  };
  return inst;
}
const dims = i => i.orientation === 'portrait' ? [i.baseW, i.baseH] : [i.baseH, i.baseW];

async function ensureWindow() {
  if (state.windowId != null) {
    try { await chrome.windows.get(state.windowId); return; } catch {}
  }
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
async function applyProfiles(inst) {
  if (inst.tabId == null) return;
  const n = NET[inst.net];
  await send(inst.tabId, 'Network.enable');
  await send(inst.tabId, 'Network.emulateNetworkConditions', n ? { offline: !!n.offline, latency: n.latency, downloadThroughput: n.downloadThroughput, uploadThroughput: n.uploadThroughput } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send(inst.tabId, 'Emulation.setCPUThrottlingRate', { rate: inst.cpu || 1 });
}
async function applyEmulation(inst) {
  const [w, h] = dims(inst);
  await send(inst.tabId, 'Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: inst.dpr, mobile: inst.mobile,
    screenWidth: w, screenHeight: h,
    screenOrientation: inst.orientation === 'portrait' ? { type: 'portraitPrimary', angle: 0 } : { type: 'landscapePrimary', angle: 90 },
  });
  await send(inst.tabId, 'Emulation.setTouchEmulationEnabled', { enabled: inst.touch, maxTouchPoints: inst.touch ? 5 : 1 });
  if (inst.mobile) {
    await send(inst.tabId, 'Emulation.setUserAgentOverride', { userAgent: UA[inst.os] || UA.mobile, platform: inst.os === 'ios' ? 'iPhone' : 'Linux armv8l' });
  }
}

async function createTarget(inst) {
  inst.status = 'loading'; inst.error = ''; renderPanelState(inst);
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
    await applyEmulation(inst); await applyProfiles(inst);          // emulate first, then load: media queries are right on first paint
    await send(tabId, 'Page.navigate', { url: state.url });
    inst.dirty = true;
  } catch (e) {
    setError(inst, e && e.message ? e.message : String(e));
  }
}

async function destroyTarget(inst) {
  const tabId = inst.tabId; inst.tabId = null;
  if (tabId == null) return;
  try { await chrome.debugger.detach({ tabId }); } catch {}
  try { await chrome.tabs.remove(tabId); } catch {}
}

function setError(inst, msg) {
  inst.status = 'error'; inst.error = msg; renderPanelState(inst);
}

// ---------- debugger events ----------
chrome.debugger.onEvent.addListener((src, method, params) => {
  const inst = state.devices.find(d => d.tabId === src.tabId);
  if (!inst) return;
  const isActive = inst.instanceId === state.activeId;
  if (method === 'Page.frameNavigated' && !params.frame.parentId) {
    const url = params.frame.url;
    if (url === 'about:blank') return;
    inst.url = url; inst.status = 'loading'; renderPanelState(inst);
    if (isActive) onActiveNavigated(url);
  } else if (method === 'Page.loadEventFired') {
    inst.status = 'ready'; inst.dirty = true; renderPanelState(inst);
    setTimeout(() => { inst.dirty = true; }, 400);
  } else if (method === 'Runtime.bindingCalled' && params.name === '__vwReport') {
    let data; try { data = JSON.parse(params.payload); } catch { return; }
    inst.dirty = true;
    if (data.type === 'check') { inst.issues = data.issues || []; renderPanelState(inst); renderIssues(); return; }
    if (!isActive) return;
    if (data.type === 'scroll' && state.sync.scroll) syncScroll(inst, data.ratio);
    if (data.type === 'nav') onActiveNavigated(data.url);
  }
});
chrome.debugger.onDetach.addListener((src, reason) => {
  const inst = state.devices.find(d => d.tabId === src.tabId);
  if (!inst) return;
  inst.tabId = null;
  setError(inst, reason === 'canceled_by_user' ? 'Debugging was cancelled in Chrome.' : reason === 'target_closed' ? 'Browser target closed.' : 'Debugger detached: ' + reason);
});
chrome.tabs.onRemoved.addListener(tabId => {
  const inst = state.devices.find(d => d.tabId === tabId);
  if (inst) { inst.tabId = null; setError(inst, 'Browser target closed.'); }
});

let navGuard = '';
function onActiveNavigated(url) {
  if (!url || url === state.url) return;
  state.url = url; $('#url').value = url; pushRecent(url);
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
    scrollTimer = null;
    const r = pendingRatio;
    for (const d of state.devices) {
      if (d === from || d.tabId == null || d.paused) continue;
      send(d.tabId, 'Runtime.evaluate', { expression: `(()=>{const de=document.documentElement;const max=de.scrollHeight-innerHeight;window.scrollTo({top:max*${r},behavior:'instant'})})()` })
        .then(() => { d.dirty = true; }).catch(() => {});
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
    const img = panels.get(inst.instanceId)?.querySelector('img');
    if (img) img.src = inst.frame;
    if (inst.status === 'loading') { inst.status = 'ready'; renderPanelState(inst); }
  } catch { inst.dirty = true; }
  finally { inst.capturing = false; }
}
let tick = 0;
setInterval(() => {
  tick++;
  for (const d of state.devices) {
    const isActive = d.instanceId === state.activeId;
    if (isActive) capture(d, tick % 2 === 0);      // ~2-3 fps forced refresh for the controller
    else if (d.dirty || tick % 10 === 0) capture(d, tick % 10 === 0);   // others: on change, plus a slow 2.5s heartbeat
  }
}, 250);

// ---------- devices ----------
async function addDevices(presets) {
  for (const p of presets) {
    const inst = makeInstance(p);
    state.devices.push(inst);
    mountPanel(inst);
  }
  if (!state.activeId && state.devices.length) setActive(state.devices[0].instanceId);
  warnCount(); relayout(); savePrefs();
  for (const inst of state.devices.filter(d => d.tabId == null && d.status !== 'error')) await createTarget(inst);
}
async function removeDevice(inst) {
  state.devices = state.devices.filter(d => d !== inst);
  panels.get(inst.instanceId)?.remove(); panels.delete(inst.instanceId);
  await destroyTarget(inst);
  if (state.activeId === inst.instanceId) setActive(state.devices[0]?.instanceId || null);
  warnCount(); relayout(); savePrefs();
}
async function rotate(inst) {
  inst.orientation = inst.orientation === 'portrait' ? 'landscape' : 'portrait';
  renderPanelState(inst); relayout(); savePrefs();
  if (inst.tabId != null) { try { await applyEmulation(inst); inst.dirty = true; } catch (e) { setError(inst, e.message); } }
}
function setActive(id) {
  state.activeId = id;
  for (const [iid, el] of panels) el.classList.toggle('active', iid === id);
  if (state.layout.type === 'focus') relayout();
}
function togglePause(inst) {
  inst.paused = !inst.paused; renderPanelState(inst);
  if (!inst.paused) inst.dirty = true;
}
async function navigateAll(url) {
  url = normalizeUrl(url); if (!url) return;
  state.url = url; navGuard = url; $('#url').value = url; pushRecent(url);
  for (const d of state.devices) { d.url = url; if (d.tabId != null) send(d.tabId, 'Page.navigate', { url }).catch(() => {}); }
}
function normalizeUrl(u) {
  u = (u || '').trim(); if (!u) return '';
  if (!/^[a-z]+:\/\//i.test(u)) u = (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u) ? 'http://' : 'https://') + u;
  return u;
}
function pushRecent(url) {
  chrome.storage.local.get('recentUrls').then(({ recentUrls = [] }) => {
    recentUrls = [url, ...recentUrls.filter(u => u !== url)].slice(0, 20);
    chrome.storage.local.set({ recentUrls }); renderRecent(recentUrls);
  });
}
function navHistory(dir) {
  for (const d of state.devices) if (d.tabId != null)
    send(d.tabId, 'Runtime.evaluate', { expression: dir > 0 ? 'history.forward()' : 'history.back()' }).catch(() => {});
}
function reloadAll(hard = false) {
  for (const d of state.devices) if (d.tabId != null) { d.status = 'loading'; renderPanelState(d); send(d.tabId, 'Page.reload', { ignoreCache: hard }).catch(() => {}); }
}
let autoTimer = null;
function setAutoReload(sec) {
  clearInterval(autoTimer); autoTimer = null; state.autoReload = sec;
  if (sec > 0) autoTimer = setInterval(() => reloadAll(false), sec * 1000);
}
function warnCount() {
  const n = state.devices.length; const w = $('#warn');
  w.hidden = n < 9;
  if (n >= 9) w.textContent = `${n} live views may use significant browser memory. Pause devices you are not comparing (❚❚) to reduce load.`;
  $('#empty').hidden = n > 0;
}

// ---------- panels & layout ----------
function mountPanel(inst) {
  const el = $('#panelTpl').content.firstElementChild.cloneNode(true);
  el.dataset.id = inst.instanceId;
  panels.set(inst.instanceId, el);
  wallEl.appendChild(el);
  el.addEventListener('mousedown', () => { if (state.activeId !== inst.instanceId) setActive(inst.instanceId); }, true);
  el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    e.stopPropagation();
    if (act === 'rotate') rotate(inst);
    else if (act === 'reloadOne' && inst.tabId != null) { inst.status = 'loading'; renderPanelState(inst); send(inst.tabId, 'Page.reload', { ignoreCache: e.shiftKey }).catch(() => {}); }
    else if (act === 'remove') removeDevice(inst);
    else if (act === 'dup') addDevices([{ ...instToPreset(inst), name: inst.name + ' copy' }]);
    else if (act === 'pause') togglePause(inst);
    else if (act === 'shot') e.shiftKey ? screenshotFullPage(inst) : screenshotDevice(inst);
    else if (act === 'full') screenshotFullPage(inst);
    else if (act === 'note') editNote(inst);
    else if (act === 'menu') openMenu(inst, e.target);
    else if (act === 'retry') { destroyTarget(inst).then(() => createTarget(inst)); }
  });
  el.addEventListener('dblclick', e => { if (e.target.closest('.screen')) focusDevice(inst); });
  wireInput(inst, el.querySelector('.screen'));
  wireDrag(inst, el);
  wireResize(inst, el);
  visObs.observe(el);
  renderPanelState(inst);
}
function renderPanelState(inst) {
  const el = panels.get(inst.instanceId); if (!el) return;
  const [w, h] = dims(inst);
  el.querySelector('.name').textContent = inst.name;
  el.querySelector('.dims').textContent = `${w} × ${h} · DPR ${inst.dpr} · ${Math.round((inst.scale || 1) * 100)}%`;
  el.classList.toggle('loading', inst.status === 'loading' && !inst.frame);
  el.classList.toggle('error', inst.status === 'error');
  el.classList.toggle('paused', inst.paused);
  el.classList.toggle('desktop', !inst.mobile);
  el.querySelector('.badge').textContent = inst.paused ? 'PAUSED' : 'ACTIVE';
  el.querySelector('.msg').textContent = inst.status === 'error'
    ? `Unable to render device\n${inst.error}\n\nPossible reasons: browser target closed, page failed to load, debugging cancelled.`
    : inst.paused ? 'Paused' : 'Loading…';
  const ov = el.querySelector('.ovf'); const iss = inst.issues || []; ov.hidden = !iss.length;
  ov.textContent = '⚠ ' + iss.length; ov.title = iss.map(i => i.msg).join('\n');
  el.querySelector('.note').classList.toggle('has', !!inst.note);
  el.title = `Emulated viewport ${w}×${h} @${inst.dpr}x`;
}
function relayout() {
  const type = state.layout.type;
  wallEl.className = type;
  const zoom = state.layout.zoom;
  let scale = zoom === 'fit' ? fitScale() : Number(zoom);
  const base = scale;
  const sideW = wallEl.clientWidth * 0.28;
  for (const inst of state.devices) {
    const el = panels.get(inst.instanceId); if (!el) continue;
    const [w, h] = dims(inst);
    scale = base * (inst.zoom || 1);
    if (type === 'focus') { el.classList.toggle('main', inst.instanceId === state.activeId); if (inst.instanceId !== state.activeId) { const s2 = Math.min(scale, (sideW - 30) / w); el.querySelector('.screen').style.width = Math.round(w * s2) + 'px'; el.querySelector('.screen').style.height = Math.round(h * s2) + 'px'; inst.scale = s2; el.style.width = (Math.round(w * s2) + 4) + 'px'; continue; } }
    const s = el.querySelector('.screen');
    s.style.width = Math.round(w * scale) + 'px';
    s.style.height = Math.round(h * scale) + 'px';
    inst.scale = scale;
    const pw = Math.round(w * scale);
    el.style.width = (pw + 4 + (state.layout.frames ? 24 : 0)) + 'px';
    el.classList.toggle('narrow', pw < 330);
    el.classList.toggle('tiny', pw < 200);
    el.querySelector('.dims').textContent = `${w} × ${h} · DPR ${inst.dpr} · ${Math.round(scale * 100)}%`;
  }
}
function fitScale() {
  const list = state.devices.map(dims); if (!list.length) return 1;
  const W = wallEl.clientWidth - 28, H = wallEl.clientHeight - 28, gap = 12, head = 34, fr = state.layout.frames ? 28 : 4;
  if (state.layout.type === 'vertical') return Math.min(1, (W - fr) / Math.max(...list.map(d => d[0])));
  if (state.layout.type === 'focus') {
    const a = state.devices.find(d => d.instanceId === state.activeId) || state.devices[0]; const [aw, ah] = dims(a);
    return Math.min(1, (W * 0.68 - fr) / aw, (H - head - fr) / ah);
  }
  if (state.layout.type === 'horizontal') return Math.min(1, (H - head - fr) / Math.max(...list.map(d => d[1])));
  let best = 0.1;
  for (let k = 1; k <= list.length; k++) {
    const rows = []; for (let i = 0; i < list.length; i += k) rows.push(list.slice(i, i + k));
    const sW = Math.min(...rows.map(r => (W - r.length * fr - (r.length - 1) * gap) / r.reduce((a, d) => a + d[0], 0)));
    const totalH = rows.reduce((a, r) => a + Math.max(...r.map(d => d[1])), 0);
    const sH = (H - rows.length * (head + fr) - (rows.length - 1) * gap) / totalH;
    const s = Math.min(1, sW, sH);
    if (s > best) best = s;
  }
  return Math.max(best, 0.1);
}
window.addEventListener('resize', relayout);

function focusDevice(inst) {
  // Focus mode: temporarily show only this device at fit scale. Esc / dblclick returns.
  const on = document.body.classList.toggle('focus');
  for (const [id, el] of panels) el.style.display = on && id !== inst.instanceId ? 'none' : '';
  relayout();
}

const visObs = new IntersectionObserver(entries => {
  for (const en of entries) { const inst = state.devices.find(d => d.instanceId === en.target.dataset.id); if (inst) { inst.offscreen = !en.isIntersecting; if (en.isIntersecting) inst.dirty = true; } }
}, { root: wallEl, threshold: 0.05 });

// free resize: drag the right edge of a panel to change the emulated width live
function wireResize(inst, el) {
  const grip = el.querySelector('.grip'); let startX = 0, startW = 0, t = null;
  grip.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation(); startX = e.clientX; startW = dims(inst)[0];
    const move = ev => {
      const w = Math.max(200, Math.min(4000, Math.round(startW + (ev.clientX - startX) / (inst.scale || 1))));
      if (inst.orientation === 'portrait') inst.baseW = w; else inst.baseH = w;
      if (inst.presetId && !inst.presetId.startsWith('custom-')) { inst.presetId = null; inst.name = w + 'px'; }
      else if (/^\d+px$/.test(inst.name)) inst.name = w + 'px';
      el.querySelector('.screen').style.width = Math.round(w * inst.scale) + 'px';
      el.style.width = (Math.round(w * inst.scale) + 4 + (state.layout.frames ? 24 : 0)) + 'px';
      el.querySelector('.dims').textContent = `${w} × ${dims(inst)[1]} · DPR ${inst.dpr} · ${Math.round(inst.scale * 100)}%`;
      clearTimeout(t); t = setTimeout(() => { if (inst.tabId != null) applyEmulation(inst).then(() => { inst.dirty = true; }).catch(() => {}); }, 80);
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); renderPanelState(inst); if (state.layout.zoom === 'fit') relayout(); savePrefs(); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
}

// per-panel menu: zoom, network, CPU, compare
function openMenu(inst, anchor) {
  const m = $('#menu'); m.hidden = false; m.dataset.id = inst.instanceId;
  const r = anchor.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - 240) + 'px'; m.style.top = r.bottom + 4 + 'px';
  m.querySelector('[name=pzoom]').value = String(inst.zoom || 1);
  m.querySelector('[name=net]').value = inst.net || 'none';
  m.querySelector('[name=cpu]').value = String(inst.cpu || 1);
  m.querySelector('[name=cmp]').textContent = compareSel.has(inst.instanceId) ? 'Remove from compare' : `Add to compare (${compareSel.size}/2)`;
}
const compareSel = new Set();
$('#menu').addEventListener('change', e => {
  const inst = state.devices.find(d => d.instanceId === $('#menu').dataset.id); if (!inst) return;
  if (e.target.name === 'pzoom') { inst.zoom = +e.target.value; relayout(); savePrefs(); }
  if (e.target.name === 'net') { inst.net = e.target.value; applyProfiles(inst).catch(() => {}); savePrefs(); }
  if (e.target.name === 'cpu') { inst.cpu = +e.target.value; applyProfiles(inst).catch(() => {}); savePrefs(); }
});
$('#menu').addEventListener('click', e => {
  const inst = state.devices.find(d => d.instanceId === $('#menu').dataset.id); if (!inst) return;
  if (e.target.name === 'cmp') {
    compareSel.has(inst.instanceId) ? compareSel.delete(inst.instanceId) : compareSel.add(inst.instanceId);
    if (compareSel.size === 2) { compareScreenshot([...compareSel].map(id => state.devices.find(d => d.instanceId === id)).filter(Boolean)); compareSel.clear(); }
    $('#menu').hidden = true;
  }
  if (e.target.name === 'edit') { $('#menu').hidden = true; editDevice(inst); }
});
document.addEventListener('mousedown', e => { if (!e.target.closest('#menu') && !e.target.closest('[data-act=menu]')) $('#menu').hidden = true; });
function editDevice(inst) {
  const v = prompt('Edit device: name, width, height, dpr', `${inst.name}, ${inst.baseW}, ${inst.baseH}, ${inst.dpr}`); if (!v) return;
  const [name, w, h, dpr] = v.split(',').map(x => x.trim());
  if (name) inst.name = name; if (+w) inst.baseW = +w; if (+h) inst.baseH = +h; if (+dpr) inst.dpr = +dpr;
  inst.presetId = null; renderPanelState(inst); relayout(); savePrefs();
  if (inst.tabId != null) applyEmulation(inst).then(() => { inst.dirty = true; }).catch(() => {});
}
async function compareScreenshot(list) {
  const imgs = await Promise.all(list.map(d => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = d.frame; })));
  const sizes = list.map(dims), gap = 32, pad = 24, head = 44;
  const W = pad * 2 + sizes.reduce((a, s) => a + s[0], 0) + gap, H = pad * 2 + head + Math.max(...sizes.map(s => s[1])) + 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f1115'; ctx.fillRect(0, 0, W, H); let x = pad;
  list.forEach((d, i) => { const [w, h] = sizes[i]; ctx.fillStyle = '#e6e8ee'; ctx.font = 'bold 18px system-ui'; ctx.fillText(`${d.name}  ${w}×${h}`, x, pad + 22); ctx.drawImage(imgs[i], x, pad + head, w, h); x += w + gap; });
  ctx.fillStyle = '#8b93a7'; ctx.font = '12px system-ui'; ctx.fillText(`${state.url}   ·   ${new Date().toLocaleString()}`, pad, H - 14);
  download(`compare-${slug(list[0].name)}-vs-${slug(list[1].name)}.png`, c.toDataURL('image/png'));
}

// drag reorder
let dragId = null;
function wireDrag(inst, el) {
  el.querySelector('.phead').draggable = true;
  el.querySelector('.phead').addEventListener('dragstart', () => { dragId = inst.instanceId; });
  el.addEventListener('dragover', e => e.preventDefault());
  el.addEventListener('drop', e => {
    e.preventDefault(); if (!dragId || dragId === inst.instanceId) return;
    const from = state.devices.findIndex(d => d.instanceId === dragId), to = state.devices.indexOf(inst);
    const [m] = state.devices.splice(from, 1); state.devices.splice(to, 0, m);
    for (const d of state.devices) wallEl.appendChild(panels.get(d.instanceId));
    dragId = null; savePrefs();
  });
}

// ---------- input forwarding (active device only) ----------
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
    if (e.ctrlKey || e.metaKey) { inst.zoom = Math.max(0.25, Math.min(3, +((inst.zoom || 1) * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))); relayout(); return; }
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

// ---------- screenshots ----------
function download(name, dataUrl) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = name; a.click();
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function screenshotDevice(inst) {
  if (inst.tabId == null) return;
  const [w, h] = dims(inst);
  const r = await send(inst.tabId, 'Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: inst.dpr } });
  download(`${slug(inst.name)}-${w}x${h}.png`, 'data:image/png;base64,' + r.data);
}
function renderIssues() {
  const box = $('#issues'); const rows = [];
  for (const d of state.devices) for (const i of (d.issues || [])) rows.push(`<div><b>${d.name}</b> — ${i.msg.replace(/</g, '&lt;')}</div>`);
  box.hidden = !rows.length || box.dataset.closed === '1';
  box.innerHTML = `<div class="ihead"><span class="lbl">${rows.length} responsive issue${rows.length === 1 ? '' : 's'} detected</span><button data-act="report">Copy report</button><button data-act="closeIssues">×</button></div>` + rows.join('');
}
$('#issues').addEventListener('click', e => {
  if (e.target.dataset.act === 'closeIssues') { $('#issues').dataset.closed = '1'; $('#issues').hidden = true; }
  if (e.target.dataset.act === 'report') copyReport();
});
function buildReport() {
  const lines = ['## Responsive QA', '', `URL: ${state.url}`, `Date: ${new Date().toLocaleString()}`, ''];
  let n = 0;
  for (const d of state.devices) {
    const [w, h] = dims(d); const iss = d.issues || [];
    const probs = [...iss.map(i => i.msg), ...(d.note ? [d.note] : [])];
    n += iss.length;
    lines.push(probs.length ? `⚠ ${d.name} (${w}×${h}) — ${probs.join('; ')}` : `✓ ${d.name} (${w}×${h})`);
  }
  lines.push('', `${n} responsive issue${n === 1 ? '' : 's'} found.`, '', 'Made with Viewport Wall');
  return lines.join('\n');
}
async function copyReport() { try { await navigator.clipboard.writeText(buildReport()); toast('Report copied'); } catch { toast('Copy failed'); } }
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1800); }
function editNote(inst) {
  const v = prompt(`Note for ${inst.name}`, inst.note || ''); if (v == null) return;
  inst.note = v.trim(); renderPanelState(inst); renderIssues();
}
async function screenshotFullPage(inst) {
  if (inst.tabId == null) return;
  const m = await send(inst.tabId, 'Page.getLayoutMetrics');
  const [w] = dims(inst); const h = Math.min(Math.ceil(m.cssContentSize.height), 16000);
  const r = await send(inst.tabId, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: inst.dpr } });
  download(`${slug(inst.name)}-${w}x${h}-full.png`, 'data:image/png;base64,' + r.data);
  inst.dirty = true;
}
async function screenshotAll() {
  for (const d of state.devices) { if (d.tabId != null) { await screenshotDevice(d); await new Promise(r => setTimeout(r, 300)); } }
}
async function detectBreakpoints() {
  const src = state.devices.find(d => d.instanceId === state.activeId && d.tabId != null) || state.devices.find(d => d.tabId != null);
  if (!src) return;
  let bps = [];
  try { const r = await send(src.tabId, 'Runtime.evaluate', { expression: DETECT_BP, returnByValue: true }); bps = r.result.value || []; } catch {}
  const box = $('#bps'); box.hidden = false;
  if (!bps.length) { box.innerHTML = '<span class="muted">No media-query breakpoints found in accessible stylesheets.</span> <button data-act="closeBps">×</button>'; return; }
  box.innerHTML = '<span class="lbl">Detected breakpoints</span> ' + bps.map(b => `<span class="chip" data-bp="${b}" title="Add ${b}px">${b}</span>`).join('')
    + ` <button data-act="addAllBps">Add all</button> <button data-act="boundary" title="Add width-1 / width / width+1 for every breakpoint">Boundary test</button> <button data-act="closeBps">×</button>`;
  box.dataset.bps = bps.join(',');
}
const widthPreset = w => ({ id: 'bp-' + w, name: w + 'px', category: 'breakpoint', os: 'any', width: w, height: w < 700 ? 800 : w < 1100 ? 1024 : 900, dpr: w < 700 ? 2 : 1, mobile: w < 1024, touch: w < 1024 });
$('#bps').addEventListener('click', e => {
  const t = e.target, bps = ($('#bps').dataset.bps || '').split(',').filter(Boolean).map(Number);
  if (t.dataset.bp) addDevices([widthPreset(+t.dataset.bp)]);
  else if (t.dataset.act === 'addAllBps') addDevices(bps.map(widthPreset));
  else if (t.dataset.act === 'boundary') addDevices(bps.flatMap(b => [b - 1, b, b + 1]).map(widthPreset));
  else if (t.dataset.act === 'closeBps') $('#bps').hidden = true;
});
async function screenshotWall() {
  const list = state.devices.filter(d => d.frame);
  if (!list.length) return;
  const gap = 24, head = 44, pad = 24, footer = 40;
  const imgs = await Promise.all(list.map(d => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = d.frame; })));
  // Compose at CSS-pixel size (1x) so mixed DPRs align.
  const sizes = list.map(dims);
  const W = pad * 2 + sizes.reduce((a, s) => a + s[0], 0) + gap * (list.length - 1);
  const H = pad * 2 + head + Math.max(...sizes.map(s => s[1])) + footer;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f1115'; ctx.fillRect(0, 0, W, H);
  let x = pad;
  list.forEach((d, i) => {
    const [w, h] = sizes[i];
    ctx.fillStyle = '#e6e8ee'; ctx.font = 'bold 16px system-ui'; ctx.fillText(d.name, x, pad + 18);
    ctx.fillStyle = '#8b93a7'; ctx.font = '12px system-ui'; ctx.fillText(`${w}×${h} @${d.dpr}x`, x, pad + 36);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, pad + head, w, h);
    ctx.drawImage(imgs[i], x, pad + head, w, h);
    x += w + gap;
  });
  ctx.fillStyle = '#8b93a7'; ctx.font = '12px system-ui';
  ctx.fillText(`${state.url}   ·   ${new Date().toLocaleString()}   ·   Made with Viewport Wall`, pad, H - 14);
  download(`viewport-wall-${slug(new URL(state.url).hostname || 'page')}.png`, c.toDataURL('image/png'));
}

// ---------- picker ----------
const picked = new Set();
let favorites = new Set();
let filterBrand = null, filterType = null;
function openPicker() { picked.clear(); renderPicker(); $('#picker').hidden = false; $('#search').focus(); }
function closePicker() { $('#picker').hidden = true; }
function renderPicker() {
  const q = $('#search').value.trim().toLowerCase();
  const list = allPresets().filter(d => (!filterBrand || d.brand === filterBrand) && (!filterType || filterType === 'favorites' || d.category === filterType) && (filterType !== 'favorites' || favorites.has(d.id))
    && (!q || `${d.brand} ${d.name} ${d.width} ${d.height}`.toLowerCase().includes(q)));
  const brands = [...new Set(allPresets().map(d => d.brand))];
  const types = [...new Set(allPresets().map(d => d.category))];
  $('#filters').innerHTML = [`<button data-type="favorites" class="${filterType === 'favorites' ? 'on' : ''}">★ Favorites</button>`, ...brands.map(b => `<button data-brand="${b}" class="${filterBrand === b ? 'on' : ''}">${b}</button>`),
    ...types.map(t => `<button data-type="${t}" class="${filterType === t ? 'on' : ''}">${t}</button>`)].join('');
  $('#quickWidths').innerHTML = QUICK_WIDTHS.map(w => `<span class="chip ${picked.has('bp-' + w) ? 'on' : ''}" data-pick="bp-${w}">${w}</span>`).join('');
  const groups = {};
  for (const d of list) (groups[d.brand] ||= []).push(d);
  $('#groups').innerHTML = Object.entries(groups).map(([b, ds]) => `<section><h3>${b}</h3><div class="devlist">${ds.map(d =>
    `<label class="dev"><input type="checkbox" data-pick="${d.id}" ${picked.has(d.id) ? 'checked' : ''}> ${d.name}<button class="fav ${favorites.has(d.id) ? 'on' : ''}" data-fav="${d.id}" title="Favorite">★</button><span class="sub">${d.width}×${d.height} @${d.dpr}x</span>${d.custom ? `<button class="del" data-del="${d.id}" title="Delete custom device">×</button>` : ''}</label>`).join('')}</div></section>`).join('');
  $('#pickCount').textContent = `${picked.size} selected`;
  $('#openPicked').textContent = `Open ${picked.size} device${picked.size === 1 ? '' : 's'}`;
}
$('#picker').addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.act === 'close' || t === $('#picker')) return closePicker();
  if (t.dataset.act === 'clear') { picked.clear(); return renderPicker(); }
  if (t.dataset.act === 'open') { const ps = [...picked].map(findPreset).filter(Boolean); closePicker(); return addDevices(ps); }
  if (t.dataset.brand) { filterBrand = filterBrand === t.dataset.brand ? null : t.dataset.brand; return renderPicker(); }
  if (t.dataset.type) { filterType = filterType === t.dataset.type ? null : t.dataset.type; return renderPicker(); }
  if (t.dataset.fav) { e.preventDefault(); favorites.has(t.dataset.fav) ? favorites.delete(t.dataset.fav) : favorites.add(t.dataset.fav); chrome.storage.local.set({ favorites: [...favorites] }); return renderPicker(); }
  if (t.dataset.del) { e.preventDefault(); customDevices = customDevices.filter(d => d.id !== t.dataset.del); chrome.storage.local.set({ customDevices }); return renderPicker(); }
  if (t.classList.contains('chip')) { const id = t.dataset.pick; picked.has(id) ? picked.delete(id) : picked.add(id); return renderPicker(); }
});
$('#picker').addEventListener('change', e => {
  const id = e.target.dataset.pick; if (!id) return;
  e.target.checked ? picked.add(id) : picked.delete(id);
  $('#pickCount').textContent = `${picked.size} selected`;
  $('#openPicked').textContent = `Open ${picked.size} device${picked.size === 1 ? '' : 's'}`;
});
$('#search').addEventListener('input', renderPicker);
$('#customForm').addEventListener('submit', e => {
  e.preventDefault(); const f = new FormData(e.target);
  const dev = { id: 'custom-' + Date.now().toString(36), brand: 'Custom', custom: true, name: f.get('name'), category: 'custom', os: f.get('mobile') ? 'android' : 'any',
    width: +f.get('width'), height: +f.get('height'), dpr: +f.get('dpr') || 1, mobile: !!f.get('mobile'), touch: !!f.get('touch'), tags: ['custom'] };
  customDevices.push(dev); chrome.storage.local.set({ customDevices }); picked.add(dev.id); e.target.reset(); renderPicker();
});

// ---------- sets ----------
function renderSets() {
  const sel = $('#sets');
  sel.innerHTML = '<option value="">Device set…</option>' + [...SETS, ...savedSets].map(s => `<option value="${s.id}">${s.name} (${s.deviceIds.length})</option>`).join('');
}
async function applySet(id, replace = true) {
  const s = [...SETS, ...savedSets].find(x => x.id === id); if (!s) return;
  if (replace) for (const d of [...state.devices]) await removeDevice(d);
  await addDevices(s.deviceIds.map(findPreset).filter(Boolean));
}
$('#sets').addEventListener('change', e => { if (e.target.value) applySet(e.target.value); e.target.value = ''; });
$('#saveSet').addEventListener('click', () => {
  if (!state.devices.length) return;
  const name = prompt('Set name', 'My QA Set'); if (!name) return;
  // custom/duplicated instances without a preset get persisted as custom devices so the set can be reopened.
  const ids = state.devices.map(d => {
    if (findPreset(d.presetId)) return d.presetId;
    const dev = { ...instToPreset(d), id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), brand: 'Custom', custom: true, tags: ['custom'] };
    customDevices.push(dev); return dev.id;
  });
  chrome.storage.local.set({ customDevices });
  savedSets.push({ id: 'set-' + Date.now().toString(36), name, deviceIds: ids });
  chrome.storage.local.set({ savedSets }); renderSets();
});

// ---------- sessions ----------
let sessions = [];
function renderSessions() {
  $('#sessions').innerHTML = '<option value="">Sessions…</option>' + sessions.map(x => `<option value="${x.id}">${x.name.replace(/</g, '&lt;')} · ${new Date(x.ts).toLocaleDateString()}</option>`).join('') + '<option value="__save">Save session…</option>' + (sessions.length ? '<option value="__delete">Delete a session…</option>' : '');
}
async function saveSession() {
  const name = prompt('Session name', new URL(state.url).hostname + ' QA'); if (!name) return;
  sessions.push({ id: 's' + Date.now().toString(36), name, ts: Date.now(), url: state.url, devices: state.devices.map(d => ({ ...instToPreset(d), note: d.note || '' })), layout: { ...state.layout }, sync: { ...state.sync } });
  await chrome.storage.local.set({ sessions }); renderSessions(); toast('Session saved');
}
async function loadSession(id) {
  const x = sessions.find(v => v.id === id); if (!x) return;
  for (const d of [...state.devices]) await removeDevice(d);
  Object.assign(state.layout, x.layout); Object.assign(state.sync, x.sync);
  $('#layout').value = state.layout.type; $('#zoom').value = String(state.layout.zoom); $('#frames').checked = state.layout.frames; document.body.classList.toggle('frames', state.layout.frames);
  $('#syncNav').checked = state.sync.navigation; $('#syncScroll').checked = state.sync.scroll; $('#syncClicks').checked = !!state.sync.clicks; $('#syncInput').checked = !!state.sync.input;
  state.url = x.url; $('#url').value = x.url;
  await addDevices(x.devices);
  x.devices.forEach((pd, i) => { if (state.devices[i]) { state.devices[i].note = pd.note; renderPanelState(state.devices[i]); } });
}
$('#sessions').addEventListener('change', async e => {
  const v = e.target.value; e.target.value = '';
  if (v === '__save') saveSession();
  else if (v === '__delete') { const n = prompt('Delete which session? Type its name:\n' + sessions.map(x => x.name).join('\n')); if (n) { sessions = sessions.filter(x => x.name !== n); await chrome.storage.local.set({ sessions }); renderSessions(); } }
  else if (v) loadSession(v);
});

// ---------- toolbar ----------
$('#urlform').addEventListener('submit', e => { e.preventDefault(); navigateAll($('#url').value); $('#url').blur(); });
$('#back').onclick = () => navHistory(-1);
$('#fwd').onclick = () => navHistory(1);
$('#reload').onclick = e => reloadAll(e.shiftKey);
$('#auto').onchange = e => setAutoReload(+e.target.value);
$('#add').onclick = openPicker;
$('#rotateAll').onclick = () => state.devices.forEach(rotate);
$('#shotWall').onclick = screenshotWall;
$('#shotAll').onclick = screenshotAll;
$('#report').onclick = copyReport;
$('#onboard').addEventListener('click', e => { if (e.target.dataset.act === 'ok') { $('#onboard').hidden = true; chrome.storage.local.set({ onboarded: true }); } });
$('#detect').onclick = detectBreakpoints;
function renderRecent(list) { $('#recent').innerHTML = (list || []).map(u => `<option value="${u.replace(/"/g, '&quot;')}">`).join(''); }
$('#fullscreen').onclick = () => { document.body.classList.toggle('present'); relayout(); };
$('#syncNav').onchange = e => { state.sync.navigation = e.target.checked; savePrefs(); };
$('#syncScroll').onchange = e => { state.sync.scroll = e.target.checked; savePrefs(); };
$('#syncClicks').onchange = e => { state.sync.clicks = e.target.checked; savePrefs(); };
$('#syncInput').onchange = e => { state.sync.input = e.target.checked; savePrefs(); };
$('#layout').onchange = e => { state.layout.type = e.target.value; relayout(); savePrefs(); };
$('#zoom').onchange = e => { state.layout.zoom = e.target.value; relayout(); savePrefs(); };
$('#frames').onchange = e => { state.layout.frames = e.target.checked; document.body.classList.toggle('frames', e.target.checked); relayout(); savePrefs(); };
$('#empty').addEventListener('click', e => {
  if (e.target.dataset.act === 'pick') openPicker();
  if (e.target.dataset.set) applySet(e.target.dataset.set);
});
const ZOOMS = ['0.25', '0.33', '0.5', '0.67', '0.75', '1'];
document.addEventListener('keydown', e => {
  const inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) || document.activeElement?.classList.contains('screen');
  if (e.key === 'Escape') {
    if (!$('#picker').hidden) return closePicker();
    if (document.body.classList.contains('focus')) { document.body.classList.remove('focus'); panels.forEach(el => el.style.display = ''); relayout(); return; }
    if (document.body.classList.contains('present')) { document.body.classList.remove('present'); relayout(); }
    document.activeElement?.blur(); return;
  }
  if (inField) return;
  const k = e.key;
  if (k === 'a' || k === 'A') openPicker();
  else if (k === 'r') reloadAll();
  else if (k === 'R' && e.shiftKey) state.devices.forEach(rotate);
  else if (k === 's' || k === 'S') { $('#syncScroll').checked = state.sync.scroll = !state.sync.scroll; savePrefs(); }
  else if (k === 'n' || k === 'N') { $('#syncNav').checked = state.sync.navigation = !state.sync.navigation; savePrefs(); }
  else if (k === 'f' || k === 'F') $('#fullscreen').click();
  else if (/^[1-9]$/.test(k)) { const d = state.devices[+k - 1]; if (d) setActive(d.instanceId); }
  else if (k === '+' || k === '=' || k === '-') {
    let i = ZOOMS.indexOf(String(state.layout.zoom)); if (i < 0) i = ZOOMS.indexOf('0.5');
    i = Math.max(0, Math.min(ZOOMS.length - 1, i + (k === '-' ? -1 : 1)));
    state.layout.zoom = $('#zoom').value = ZOOMS[i]; relayout(); savePrefs();
  }
});

// ---------- boot ----------
async function boot() {
  const prefs = await loadPrefs();
  renderSets(); renderSessions();
  if (!prefs.onboarded) $('#onboard').hidden = false;
  $('#syncNav').checked = state.sync.navigation; $('#syncScroll').checked = state.sync.scroll;
  $('#syncClicks').checked = !!state.sync.clicks; $('#syncInput').checked = !!state.sync.input;
  $('#layout').value = state.layout.type; $('#zoom').value = String(state.layout.zoom);
  $('#frames').checked = state.layout.frames; document.body.classList.toggle('frames', state.layout.frames);
  const q = new URLSearchParams(location.search);
  state.url = normalizeUrl(q.get('url') || (prefs.recentUrls || [])[0] || 'http://localhost:3000');
  $('#url').value = state.url; renderRecent(prefs.recentUrls);
  if (q.get('set')) await applySet(q.get('set'));
  else if (q.get('pick')) { warnCount(); openPicker(); }
  else if (prefs.lastDevices?.length) await addDevices(prefs.lastDevices);
  else { warnCount(); openPicker(); }
}
window.addEventListener('beforeunload', () => { for (const d of state.devices) if (d.tabId != null) chrome.debugger.detach({ tabId: d.tabId }); });
boot();
