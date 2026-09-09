// Viewport Wall UI layer. Rendering/emulation lives in core.js; this file owns DOM, layout and interaction.
import * as C from './core.js';
import { state, ui, dims } from './core.js';
import { QUICK_WIDTHS } from './devices.js';
import { icon } from './icons.js';
import { frameSpec, effective, buildShell, updateHost, osLabel, osIcon } from './frames.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wallEl = $('#wall'), canvasEl = $('#canvas');
const panels = new Map();
const LABEL_H = 64, GAP_X = 32, GAP_Y = 36, PAD = 28;
let mode = 'live';            // live | snapshots | focus | compare
let focusIds = [];            // devices shown large in focus/compare
let compareSel = new Set();

// ---------- static icons ----------
const setIcon = (sel, name, size = 16, label = '', chev = false) => { const el = $(sel); if (el) el.innerHTML = icon(name, size) + (label ? `<span class="lbl">${label}</span>` : '') + (chev ? icon('chevron', 14, 'chev') : ''); };
setIcon('#back', 'back', 18); setIcon('#fwd', 'forward', 18); setIcon('#reload', 'reload', 17);
setIcon('#add', 'plus', 18, 'Add Device'); setIcon('#settingsBtn', 'sliders', 18);
setIcon('#captureBtn', 'camera', 17, 'Screenshot'); setIcon('#recordBtn', 'record', 17, 'Record');
setIcon('#saveSetBtn', 'save', 14, 'Save set'); setIcon('#bpBtn', 'ruler', 14, 'Breakpoints'); setIcon('#saveSessionBtn', 'clock', 14, 'Save session'); setIcon('#clearBtn', 'trash', 14, 'Clear all');
$('.url-lock').innerHTML = icon('lock', 14); $('.url-globe').innerHTML = icon('globe', 15); $('.pal-ic').innerHTML = icon('search', 18); $('#picker [data-act=close]').innerHTML = icon('x');
const MODE_ICON = { live: 'live', snapshots: 'snapshots', focus: 'focus', compare: 'compare' }, MODE_LABEL = { live: 'Live', snapshots: 'Snapshots', focus: 'Focus', compare: 'Compare' };
$$('#modes button').forEach(b => { b.innerHTML = icon(MODE_ICON[b.dataset.mode], 16) + MODE_LABEL[b.dataset.mode]; });
$$('#capturePop button, #settingsPop button, #devMenu button, #viewPop [data-view]').forEach(b => {
  const map = { active: 'phone', all: 'layers', wall: 'grid', full: 'file', present: 'present', rotateAll: 'rotate', report: 'note', saveSession: 'save', clear: 'trash', about: 'info',
    reload: 'reload', rotate: 'rotate', pause: 'pause', focus: 'focus', shot: 'camera', compare: 'compare', note: 'note', edit: 'pencil', dup: 'copy', remove: 'trash', breakpoints: 'ruler', auto: 'wand', horizontal: 'rows', grid: 'grid', free: 'layout' };
  const k = b.dataset.cap || b.dataset.more || b.dataset.dm || b.dataset.view; if (map[k]) b.insertAdjacentHTML('afterbegin', icon(map[k], 15));
});

// ---------- helpers ----------
const inst = id => state.devices.find(d => d.instanceId === id);
const activeInst = () => inst(state.activeId);
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2000); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const setSeg = (id, v) => $$(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
const hostOf = u => { try { return new URL(u).host; } catch { return u || ''; } };

// ---------- panels ----------
function mount(d) {
  const el = $('#panelTpl').content.firstElementChild.cloneNode(true);
  el.dataset.id = d.instanceId; panels.set(d.instanceId, el); wallEl.appendChild(el);
  const ic = { menu: 'more', rotate: 'rotate', remove: 'x' };
  for (const [k, v] of Object.entries(ic)) el.querySelector(`[data-act=${k}]`).innerHTML = icon(v, 16);
  el.querySelector('.os-ic').innerHTML = icon(osIcon(d), 18);
  el.querySelector('.ov-error .ov-ic').innerHTML = icon('warn', 30);
  el.querySelector('.ov-paused .ov-ic').innerHTML = icon('pause', 26);
  el.addEventListener('mousedown', e => { if (!e.target.closest('.label button') && state.activeId !== d.instanceId) C.setActive(d.instanceId); }, true);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.act;
    if (a === 'rotate') C.rotate(d);
    else if (a === 'remove') C.removeDevice(d);
    else if (a === 'menu') openDevMenu(d, b);
    else if (a === 'retry') C.retry(d);
  });
  el.addEventListener('dblclick', e => { if (e.target.closest('.viewport')) setMode(mode === 'focus' ? 'live' : 'focus', d.instanceId); });
  C.wireInput(d, el.querySelector('.viewport'));
  wireDrag(d, el); wireResize(d, el); visObs.observe(el);
  buildFrame(d); renderPanelState(d);
}
function unmount(d) {
  const el = panels.get(d.instanceId); if (!el) return;
  panels.delete(d.instanceId); visObs.unobserve(el);
  el.classList.add('removing'); setTimeout(() => el.remove(), 200);
  focusIds = focusIds.filter(x => x !== d.instanceId); if (!focusIds.length && (mode === 'focus' || mode === 'compare')) setMode('live');
}
function buildFrame(d) {
  const el = panels.get(d.instanceId); if (!el) return;
  const [w, h] = dims(d);
  const eff = effective(frameSpec(d), state.layout.frames, state.layout.browser);
  d.eff = eff; d.outer = buildShell(el, d, w, h, eff, d.url || state.url);
}
function renderPanelState(d) {
  const el = panels.get(d.instanceId); if (!el) return;
  const [w, h] = dims(d);
  el.querySelector('.name').textContent = d.name;
  el.querySelector('.dims').textContent = `${w} × ${h}`;
  el.querySelector('.dpr').textContent = `DPR ${d.dpr}`;
  el.querySelector('.os').textContent = osLabel(d);
  el.className = `panel ${d.status}${d.paused ? ' paused' : ''}${state.activeId === d.instanceId ? ' active' : ''}${el.classList.contains('narrow') ? ' narrow' : ''}`;
  el.querySelector('.state').innerHTML = '<span></span>'; el.querySelector('.state span').textContent = d.paused ? 'Paused' : d.status === 'error' ? (d.errorTitle || 'Error') : d.status === 'loading' ? 'Loading' : state.activeId === d.instanceId ? 'Active' : 'Synced';
  if (d.status === 'error') { el.querySelector('.ov-title').textContent = d.errorTitle || "Couldn't load page"; el.querySelector('.ov-msg').textContent = d.errorKind === 'detached' ? d.errorMsg : `${hostOf(d.url || state.url)} ${d.errorMsg}`; }
  el.querySelector('.ov-text').textContent = `Loading ${hostOf(d.url || state.url)}…`;
  const badge = el.querySelector('.issue-badge'); const n = (d.issues || []).length;
  badge.hidden = !n && !d.note; badge.innerHTML = (n ? icon('warn', 12) + n : '') + (d.note ? (n ? ' · ' : '') + icon('note', 12) : '');
  badge.title = [...(d.issues || []).map(i => i.msg), d.note].filter(Boolean).join('\n');
  updateHost(el, d.url || state.url);
  if (d.orientation !== el.dataset.or) { el.dataset.or = d.orientation; buildFrame(d); relayout(); }
}
function frameUpdated(d) {
  const img = panels.get(d.instanceId)?.querySelector('img'); if (!img) return;
  img.decoding = 'async'; img.src = d.frame;
  if (focusIds.length) { const t = $(`#thumbs [data-id="${d.instanceId}"] img`); if (t) t.src = d.frame; }
}
function setActiveUI(id) {
  for (const [iid, el] of panels) el.classList.toggle('active', iid === id);
  for (const d of state.devices) renderPanelState(d);
  renderDeviceList(); renderStatus();
}
const visObs = new IntersectionObserver(entries => { for (const en of entries) { const d = inst(en.target.dataset.id); if (d) { d.offscreen = !en.isIntersecting; if (en.isIntersecting) d.dirty = true; } } }, { root: canvasEl, threshold: 0.02 });

// ---------- layout ----------
function relayout() {
  const type = state.layout.type; const zoom = state.layout.zoom; const big = focusIds.length > 0;
  const fitH = zoom === 'fith' && !big && type !== 'free';
  wallEl.className = big ? 'focus' : type === 'auto' ? (fitH ? 'horizontal' : 'auto') : type;
  const list = state.devices.filter(d => panels.has(d.instanceId));
  for (const d of list) if (!d.outer) buildFrame(d);
  const numeric = !isNaN(Number(zoom));
  let base = big ? (numeric ? Number(zoom) : fitMany(list.filter(d => focusIds.includes(d.instanceId)))) : zoom === 'fit' ? fitScale(list) : fitH ? fitHeight(list) : Number(zoom);
  for (const d of list) {
    const el = panels.get(d.instanceId);
    const hidden = big && !focusIds.includes(d.instanceId); el.style.display = hidden ? 'none' : '';
    if (hidden) continue;
    let s = big ? base : base * (d.zoom || 1); if (fitH && BIG.has(d.category)) s = Math.min(s, fitHeight([d]) * (d.zoom || 1)); d.scale = s;
    const [ow, oh] = d.outer;
    const dev = el.querySelector('.device'); dev.style.width = Math.round(ow * s) + 'px'; dev.style.height = Math.round(oh * s) + 'px';
    el.querySelector('.shell').style.transform = `scale(${s})`;
    el.style.width = Math.max(200, Math.round(ow * s)) + 'px'; el.classList.toggle('narrow', ow * s < 300);
    if (type === 'free' && !big) { if (d.fx == null) { d.fx = 40 + (list.indexOf(d) % 4) * 340; d.fy = 30 + Math.floor(list.indexOf(d) / 4) * 720; } el.style.left = d.fx + 'px'; el.style.top = d.fy + 'px'; } else { el.style.left = el.style.top = ''; }
  }
  renderViewBtn(base); renderThumbs();
}
const clamp = s => Math.max(0.08, Math.min(1, s));
function fitScale(list) {
  if (!list.length) return 1;
  const W = canvasEl.clientWidth - PAD * 2, H = canvasEl.clientHeight - 40 - 12;
  const boxes = list.map(d => d.outer);
  if (state.layout.type === 'horizontal') return clamp(Math.min((H - LABEL_H) / Math.max(...boxes.map(b => b[1])), (W - (list.length - 1) * GAP_X) / boxes.reduce((a, b) => a + b[0], 0)));
  if (state.layout.type === 'free') return 0.5;
  let best = 0.08;
  for (let k = 1; k <= list.length; k++) {
    const rows = []; for (let i = 0; i < boxes.length; i += k) rows.push(boxes.slice(i, i + k));
    const sW = Math.min(...rows.map(r => (W - (r.length - 1) * GAP_X) / r.reduce((a, b) => a + b[0], 0)));
    const sH = (H - rows.length * LABEL_H - (rows.length - 1) * GAP_Y) / rows.reduce((a, r) => a + Math.max(...r.map(b => b[1])), 0);
    best = Math.max(best, Math.min(sW, sH));
  }
  return clamp(best);
}
// Handhelds share one scale (real proportions); laptops, desktops and TVs are each shrunk to fit the height on their own.
const BIG = new Set(['laptop', 'desktop', 'tv']);
function fitHeight(list) { if (!list.length) return 1; const H = canvasEl.clientHeight - 18 - 22 - 12 - LABEL_H; const ref = list.filter(d => !BIG.has(d.category)); return clamp(H / Math.max(...(ref.length ? ref : list).map(d => d.outer[1]))); }
function fitMany(list) {
  if (!list.length) return 1;
  const W = canvasEl.clientWidth - PAD * 2 - (list.length - 1) * GAP_X, H = canvasEl.clientHeight - 24 - ($('#thumbs').offsetHeight || 0) - LABEL_H;
  return clamp(Math.min(W / list.reduce((a, d) => a + d.outer[0], 0), H / Math.max(...list.map(d => d.outer[1]))));
}
window.addEventListener('resize', relayout);
function rebuildAll() { for (const d of state.devices) { buildFrame(d); renderPanelState(d); } relayout(); }

// ---------- modes ----------
function setMode(m, id) {
  mode = m; $$('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  state.frozen = m === 'snapshots';
  if (m === 'snapshots') { C.captureAllOnce(); toast('Snapshots: devices frozen. Switch to Live to resume.'); }
  if (m === 'focus') { const t = id || state.activeId || state.devices[0]?.instanceId; focusIds = t ? [t] : []; if (t) C.setActive(t); }
  else if (m === 'compare') {
    const a = id || state.activeId || state.devices[0]?.instanceId;
    const b = [...compareSel].find(x => x !== a && inst(x)) || state.devices.map(d => d.instanceId).find(x => x !== a);
    focusIds = [a, b].filter(Boolean); compareSel = new Set(focusIds);
  } else focusIds = [];
  $('#thumbs').hidden = !focusIds.length; relayout();
}
$('#modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
function renderThumbs() {
  const box = $('#thumbs'); if (!focusIds.length) { box.innerHTML = ''; return; }
  box.innerHTML = state.devices.map(d => `<button class="thumb ${focusIds.includes(d.instanceId) ? 'on' : ''}" data-id="${d.instanceId}" data-tip="${mode === 'compare' ? 'Swap into comparison' : 'Focus'} ${esc(d.name)}"><img src="${d.frame || ''}" alt=""><span>${esc(d.name)}</span></button>`).join('');
}
$('#thumbs').addEventListener('click', e => {
  const b = e.target.closest('.thumb'); if (!b) return;
  if (mode === 'compare') { if (focusIds.includes(b.dataset.id)) return; focusIds = [focusIds[1] || focusIds[0], b.dataset.id].filter(Boolean); compareSel = new Set(focusIds); C.setActive(b.dataset.id); relayout(); }
  else setMode('focus', b.dataset.id);
});

// ---------- drag / resize / pan ----------
let dragId = null;
function wireDrag(d, el) {
  const lab = el.querySelector('.label'); lab.draggable = true;
  lab.addEventListener('dragstart', e => { if (e.target.closest('button')) { e.preventDefault(); return; } dragId = d.instanceId; e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragover', e => e.preventDefault());
  el.addEventListener('drop', async e => { e.preventDefault(); if (!dragId || dragId === d.instanceId) return; await C.reorder(dragId, d.instanceId); for (const x of state.devices) wallEl.appendChild(panels.get(x.instanceId)); dragId = null; renderDeviceList(); });
  lab.addEventListener('mousedown', e => {
    if (state.layout.type !== 'free' || focusIds.length || e.target.closest('button')) return; e.preventDefault();
    const sx = e.clientX - d.fx, sy = e.clientY - d.fy;
    const mv = ev => { d.fx = ev.clientX - sx; d.fy = ev.clientY - sy; el.style.left = d.fx + 'px'; el.style.top = d.fy + 'px'; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
}
function wireResize(d, el) {
  const grip = el.querySelector('.grip'); let t = null;
  grip.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation(); const startX = e.clientX, startW = dims(d)[0];
    const move = ev => {
      const w = Math.max(200, Math.min(4000, Math.round(startW + (ev.clientX - startX) / (d.scale || 1))));
      if (d.orientation === 'portrait') d.baseW = w; else d.baseH = w;
      if (d.presetId && !d.presetId.startsWith('custom-')) { d.presetId = null; d.name = w + 'px'; } else if (/^\d+px$/.test(d.name)) d.name = w + 'px';
      buildFrame(d); relayout(); el.querySelector('.name').textContent = d.name; el.querySelector('.dims').textContent = `${dims(d)[0]} × ${dims(d)[1]}`;
      clearTimeout(t); t = setTimeout(() => C.setViewport(d, w), 80);
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); renderPanelState(d); renderDeviceList(); C.savePrefs(); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
}
canvasEl.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey) || e.target.closest('.viewport')) return; e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
const ZOOMS = [0.25, 0.33, 0.5, 0.75, 1];
function currentScale() { const z = state.layout.zoom; if (!isNaN(Number(z))) return Number(z); const big = focusIds.length > 0; return big ? fitMany(state.devices.filter(d => focusIds.includes(d.instanceId))) : z === 'fit' ? fitScale(state.devices) : fitHeight(state.devices); }
function stepZoom(dir) {
  const cur = currentScale();
  const next = dir > 0 ? ZOOMS.find(z => z > cur + 0.01) : [...ZOOMS].reverse().find(z => z < cur - 0.01);
  if (next == null) return; state.layout.zoom = String(next); relayout(); C.savePrefs();
}
let space = false, pan = null;
document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName) && !document.activeElement?.classList.contains('viewport')) { space = true; canvasEl.classList.add('panning'); e.preventDefault(); } });
document.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; canvasEl.classList.remove('panning'); } });
canvasEl.addEventListener('mousedown', e => { if (!space) return; e.preventDefault(); pan = { x: e.clientX, y: e.clientY, sl: canvasEl.scrollLeft, st: canvasEl.scrollTop }; });
addEventListener('mousemove', e => { if (pan) { canvasEl.scrollLeft = pan.sl - (e.clientX - pan.x); canvasEl.scrollTop = pan.st - (e.clientY - pan.y); } });
addEventListener('mouseup', () => { pan = null; });

// ---------- popovers ----------
let openPop = null;
function showPop(id, anchor, align = 'right') {
  hidePops(); const p = $('#' + id); p.hidden = false; openPop = p;
  const r = anchor.getBoundingClientRect(); const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = align === 'right' ? r.right - pw : r.left; left = Math.max(8, Math.min(left, innerWidth - pw - 8));
  let top = r.bottom + 6; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  p.style.left = left + 'px'; p.style.top = top + 'px';
}
function hidePops() { $$('.pop').forEach(p => { p.hidden = true; }); openPop = null; }
document.addEventListener('mousedown', e => { if (openPop && !e.target.closest('.pop') && !e.target.closest('[data-pop]') && !e.target.closest('[data-act=menu]')) hidePops(); });
$$('[data-pop]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); const id = b.dataset.pop; if (openPop && openPop.id === id) return hidePops();
  if (id === 'devicesPop') renderDeviceList();
  showPop(id, b, b.closest('.bar-bottom') ? 'left' : 'right');
}));


// layout / zoom / frames
const LAYOUTS = { auto: ['wand', 'Auto'], horizontal: ['rows', 'Row'], grid: ['grid', 'Grid'], free: ['layout', 'Free'] };
$('#layoutSeg').addEventListener('click', e => { const v = e.target.dataset.v; if (!v) return; state.layout.type = v; if (v !== 'free') state.devices.forEach(d => { d.fx = d.fy = null; }); setSeg('layoutSeg', v); relayout(); C.savePrefs(); });
$('#zoomSeg').addEventListener('click', e => { const z = e.target.dataset.v; if (!z) return; state.layout.zoom = z; setSeg('zoomSeg', z); relayout(); C.savePrefs(); });
// One button summarises layout + zoom ("Auto · 51%"); the menu behind it holds every view option.
function renderViewBtn(base) {
  const L = LAYOUTS[state.layout.type] || LAYOUTS.auto; const z = state.layout.zoom; const pct = Math.round((base != null ? base : currentScale()) * 100);
  $('#viewBtn').innerHTML = icon(L[0], 16) + `<span class="lbl">${L[1]} · ${z === 'fit' ? 'Fit all' : z === 'fith' ? 'Fit' : ''} ${pct}%</span>` + icon('chevron', 14, 'chev');
  setSeg('layoutSeg', state.layout.type); setSeg('zoomSeg', z);
}
$('#framesToggle').addEventListener('change', e => { state.layout.frames = e.target.checked ? (state.layout.frameStyle || 'realistic') : 'none'; C.savePrefs(); rebuildAll(); });
$('#frameSeg').addEventListener('click', e => { const v = e.target.dataset.v; if (!v) return; state.layout.frameStyle = v; if (state.layout.frames !== 'none') state.layout.frames = v; setSeg('frameSeg', v); C.savePrefs(); rebuildAll(); });
$('#browserSeg').addEventListener('click', e => { const v = e.target.dataset.v; if (!v) return; state.layout.browser = v; setSeg('browserSeg', v); C.savePrefs(); rebuildAll(); });
$('#themeSeg').addEventListener('click', e => { const v = e.target.dataset.v; if (!v) return; state.layout.theme = v; applyTheme(); C.savePrefs(); });
function applyTheme() { document.documentElement.dataset.theme = state.layout.theme || 'dark'; setSeg('themeSeg', state.layout.theme || 'dark'); }

// capture / record
$('#capturePop').addEventListener('click', async e => {
  const k = e.target.closest('[data-cap]')?.dataset.cap; if (!k) return; hidePops();
  if (k === 'active') { const a = activeInst(); if (a) C.screenshotDevice(a); }
  else if (k === 'all') C.screenshotAll(false); else if (k === 'full') C.screenshotAll(true);
  else if (k === 'wall') screenshotWall(false); else if (k === 'present') screenshotWall(true);
});
let rec = null;
$('#recordBtn').addEventListener('click', () => rec ? stopRecording() : startRecording());
function startRecording() {
  const list = state.devices.filter(d => panels.has(d.instanceId) && (!focusIds.length || focusIds.includes(d.instanceId))); if (!list.length) return toast('Add devices first');
  const gap = 40, pad = 40, head = 56; const sizes = list.map(dims);
  const scale = Math.min(1, 1600 / (sizes.reduce((a, s) => a + s[0], 0) + gap * (list.length - 1) + pad * 2));
  const c = document.createElement('canvas'); c.width = Math.round((sizes.reduce((a, s) => a + s[0], 0) + gap * (list.length - 1) + pad * 2) * scale); c.height = Math.round((Math.max(...sizes.map(s => s[1])) + head + pad * 2) * scale);
  const ctx = c.getContext('2d'); const imgs = list.map(() => new Image());
  const draw = () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.fillStyle = '#0f131b'; ctx.fillRect(0, 0, c.width / scale, c.height / scale); let x = pad;
    list.forEach((d, i) => { const [w, h] = sizes[i]; ctx.fillStyle = '#eef2f8'; ctx.font = '600 20px Inter, system-ui'; ctx.fillText(d.name, x, pad + 24); ctx.fillStyle = '#6f7b93'; ctx.font = '13px Inter, system-ui'; ctx.fillText(`${w} × ${h} · ${d.dpr}x`, x, pad + 44);
      if (d.frame && imgs[i].src !== d.frame) imgs[i].src = d.frame; if (imgs[i].complete && imgs[i].naturalWidth) ctx.drawImage(imgs[i], x, pad + head, w, h); else { ctx.fillStyle = '#fff'; ctx.fillRect(x, pad + head, w, h); } x += w + gap; });
  };
  const stream = c.captureStream(8); const chunks = [];
  const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' }); mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => { const blob = new Blob(chunks, { type: 'video/webm' }); const u = URL.createObjectURL(blob); C.download(`viewport-wall-${C.slug(hostOf(state.url) || 'wall')}.webm`, u); setTimeout(() => URL.revokeObjectURL(u), 10000); };
  draw(); mr.start(500); rec = { mr, timer: setInterval(draw, 125), t0: Date.now() };
  const b = $('#recordBtn'); b.classList.add('rec', 'on'); b.innerHTML = icon('stop', 17) + '<span class="lbl">Stop</span>'; toast('Recording the wall…');
}
function stopRecording() { if (!rec) return; clearInterval(rec.timer); rec.mr.stop(); rec = null; const b = $('#recordBtn'); b.classList.remove('rec', 'on'); b.innerHTML = icon('record', 17) + '<span class="lbl">Record</span>'; toast('Recording saved'); }

// more / foot menus
$('#settingsPop').addEventListener('click', async e => {
  const k = e.target.closest('[data-more]')?.dataset.more; if (!k) return; hidePops();
  if (k === 'report') { try { await navigator.clipboard.writeText(C.buildReport()); toast('Report copied to clipboard'); } catch { toast('Copy failed'); } }
  else if (k === 'about') $('#onboard').hidden = false;
});
$('#viewPop').addEventListener('click', e => {
  const k = e.target.closest('[data-view]')?.dataset.view; if (!k) return; hidePops();
  if (k === 'rotateAll') state.devices.forEach(C.rotate);
  else if (k === 'present') togglePresent();
});
$('#bpBtn').addEventListener('click', () => { renderBpCommon(); showPop('bpPop', $('#devicesBtn'), 'left'); });
$('#saveSessionBtn').addEventListener('click', () => { hidePops(); const n = prompt('Session name', hostOf(state.url) + ' QA'); if (n) { C.saveSession(n); renderSessions(); toast('Session saved'); } });
$('#auto').addEventListener('change', e => C.setAutoReload(+e.target.value));
$('#mobileUA').addEventListener('change', e => { C.setMobileUA(e.target.checked); toast(e.target.checked ? 'Mobile user agent on. Some sites may ask you to sign in again.' : 'Mobile user agent off'); });
$('#sessions').addEventListener('change', async e => {
  const v = e.target.value; e.target.value = ''; if (!v) return; hidePops();
  if (v.startsWith('del:')) { if (confirm('Delete this session?')) { C.deleteSession(v.slice(4)); renderSessions(); } return; }
  const x = await C.loadSession(v); if (x) { syncUIFromState(); x.devices.forEach((pd, i) => { if (state.devices[i]) { state.devices[i].note = pd.note; renderPanelState(state.devices[i]); } }); toast(`Session "${x.name}" loaded`); }
});
function renderSessions() { $('#sessions').innerHTML = '<option value="">Open…</option>' + C.sessions.map(s => `<option value="${s.id}">${esc(s.name)} · ${new Date(s.ts).toLocaleDateString()}</option>`).join('') + C.sessions.map(s => `<option value="del:${s.id}">Delete "${esc(s.name)}"</option>`).join(''); }
$('#clearBtn').addEventListener('click', () => { hidePops(); if (state.devices.length && confirm('Remove all devices from the wall?')) C.clearDevices(); });
function saveCurrentSet() { hidePops(); if (!state.devices.length) return toast('Add devices first'); const n = prompt('Set name', 'My Set'); if (n) { C.saveSet(n); renderSets(); toast('Set saved'); } }
$('#saveSetBtn').addEventListener('click', saveCurrentSet);

// breakpoints
let detected = []; const bpPicked = new Set();
function renderBpCommon() { $('#bpCommon').innerHTML = QUICK_WIDTHS.map(w => `<span class="chip ${bpPicked.has(w) ? 'on' : ''}" data-w="${w}">${w}</span>`).join(''); }
$('#bpDetect').addEventListener('click', async () => {
  $('#bpDetected').innerHTML = '<span class="muted">Scanning…</span>'; detected = await C.detectBreakpoints();
  $('#bpDetected').innerHTML = detected.length ? detected.map(w => `<span class="chip" data-w="${w}">${w}</span>`).join('') : '<span class="muted">No media-query breakpoints found in accessible stylesheets.</span>';
  $('#bpBoundary').innerHTML = detected.length ? detected.map(w => [w - 1, w, w + 1].map(x => `<span class="chip" data-w="${x}">${x}</span>`).join('')).join(' ') : '<span class="muted">Nothing detected.</span>';
  $('#bpAddBoundary').disabled = !detected.length;
});
$('#bpPop').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; const w = +c.dataset.w; bpPicked.has(w) ? bpPicked.delete(w) : bpPicked.add(w); c.classList.toggle('on'); $('#bpAdd').disabled = !bpPicked.size; $('#bpAdd').textContent = bpPicked.size ? `Add ${bpPicked.size} to wall` : 'Add to wall'; });
$('#bpAdd').addEventListener('click', () => { C.addDevices([...bpPicked].sort((a, b) => a - b).map(C.widthPreset)); bpPicked.clear(); hidePops(); });
$('#bpAddBoundary').addEventListener('click', () => { C.addDevices(detected.flatMap(b => [b - 1, b, b + 1]).map(C.widthPreset)); hidePops(); });

// device menu
let menuDev = null;
function openDevMenu(d, anchor) {
  menuDev = d; const m = $('#devMenu');
  m.querySelector('[data-dm=pause]').innerHTML = icon(d.paused ? 'play' : 'pause', 15) + (d.paused ? 'Resume rendering' : 'Pause rendering');
  m.querySelector('[data-dm-sel=net]').value = d.net || 'none'; m.querySelector('[data-dm-sel=cpu]').value = String(d.cpu || 1);
  showPop('devMenu', anchor, 'left');
}
$('#devMenu').addEventListener('click', e => {
  const k = e.target.closest('[data-dm]')?.dataset.dm; if (!k || !menuDev) return; const d = menuDev; hidePops();
  if (k === 'reload') C.reloadOne(d); else if (k === 'rotate') C.rotate(d); else if (k === 'pause') C.togglePause(d);
  else if (k === 'focus') setMode('focus', d.instanceId); else if (k === 'shot') C.screenshotDevice(d); else if (k === 'full') C.screenshotFullPage(d);
  else if (k === 'compare') { const a = state.activeId && state.activeId !== d.instanceId ? state.activeId : state.devices.map(x => x.instanceId).find(x => x !== d.instanceId); compareSel = new Set([a, d.instanceId].filter(Boolean)); setMode('compare', a); }
  else if (k === 'note') { const v = prompt(`QA note for ${d.name}`, d.note || ''); if (v != null) { d.note = v.trim(); renderPanelState(d); renderIssues(); C.savePrefs(); } }
  else if (k === 'edit') { const v = prompt('Name, width, height, DPR', `${d.name}, ${d.baseW}, ${d.baseH}, ${d.dpr}`); if (v) { const [n, w, h, dpr] = v.split(',').map(x => x.trim()); if (n) d.name = n; d.presetId = null; C.setViewport(d, +w || 0, +h || 0, +dpr || 0); buildFrame(d); renderPanelState(d); relayout(); renderDeviceList(); C.savePrefs(); } }
  else if (k === 'dup') C.addDevices([{ ...C.instToPreset(d), name: d.name + ' copy' }]);
  else if (k === 'remove') C.removeDevice(d);
});
$('#devMenu').addEventListener('change', e => { const k = e.target.dataset.dmSel; if (!k || !menuDev) return; menuDev[k] = k === 'cpu' ? +e.target.value : e.target.value; C.applyProfiles(menuDev).catch(() => {}); C.savePrefs(); });

// ---------- set chips / device list ----------
const SET_ICON = { 'popular-mobile': 'zap', 'essential-mobile': 'phone', 'mobile-tablet': 'tablet', 'essential-responsive': 'ruler', apple: 'apple', android: 'android', 'breakpoint-stress': 'ruler', tablets: 'tablet', desktops: 'monitor', foldables: 'phone', 'watches-tv': 'watch', 'all-screens': 'devices' };
const SET_SHORT = { 'popular-mobile': 'Popular Mobile', apple: 'Apple', android: 'Android', 'mobile-tablet': 'Mobile + Tablet', 'essential-mobile': 'Essential', 'essential-responsive': 'Breakpoints', 'breakpoint-stress': 'Stress Test', tablets: 'Tablets', desktops: 'Desktops', foldables: 'Foldables', 'watches-tv': 'Watches + TV', 'all-screens': 'All Screens' };
function currentSetId() { const ids = state.devices.map(d => d.presetId).join(','); return C.allSets().find(s => s.deviceIds.join(',') === ids)?.id || null; }
function renderSets() {
  const cur = currentSetId(); const sets = C.allSets();
  $('#setChips').innerHTML = sets.map(s => `<button class="chip ${s.id === cur ? 'on' : ''}" data-set="${s.id}" data-tip="${s.deviceIds.length} devices">${icon(SET_ICON[s.id] || 'star', 15)}${esc(SET_SHORT[s.id] || s.name)}</button>`).join('') + `<button class="chip icon-only" data-pop="setsPop" data-tip="Manage sets">${icon('more', 16)}</button>`;
  $('#setsPop').innerHTML = sets.map(s => `<button data-set="${s.id}" class="${s.id === cur ? 'on' : ''}">${icon(SET_ICON[s.id] || 'star', 15)}<span style="flex:1">${esc(s.name)}</span><span class="muted">${s.deviceIds.length}</span>${s.id.startsWith('set-') ? `<span class="icon-btn sm" data-delset="${s.id}" data-tip="Delete set">${icon('trash', 13)}</span>` : ''}</button>`).join('') + '<div class="menu-sep"></div><button data-act="saveset">' + icon('save', 15) + 'Save current as set…</button>';
  $('#setChips [data-pop]').addEventListener('click', e => { e.stopPropagation(); openPop && openPop.id === 'setsPop' ? hidePops() : showPop('setsPop', e.currentTarget, 'left'); });
}
$('#setChips').addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (b) C.applySet(b.dataset.set).then(renderSets); });
$('#setsPop').addEventListener('click', e => {
  const del = e.target.closest('[data-delset]'); if (del) { e.stopPropagation(); if (confirm('Delete this set?')) { C.deleteSet(del.dataset.delset); renderSets(); hidePops(); } return; }
  if (e.target.closest('[data-act=saveset]')) { saveCurrentSet(); return; }
  const b = e.target.closest('[data-set]'); if (b) { hidePops(); C.applySet(b.dataset.set).then(renderSets); }
});
function renderDeviceList() {
  $('#devList').innerHTML = state.devices.map(d => `<button class="sb-item ${d.instanceId === state.activeId ? 'on' : ''}" draggable="true" data-id="${d.instanceId}">${icon(osIcon(d), 15)}<span class="t">${esc(d.name)}</span><span class="n">${dims(d)[0]} × ${dims(d)[1]}</span><span class="rm" data-rm="${d.instanceId}" data-tip="Remove device">${icon('x', 13)}</span></button>`).join('') || '<div class="pop-hint">No devices yet.</div>';
  $('#devCount').textContent = state.devices.length ? `· ${state.devices.length}` : '';
  $('#devicesBtn').innerHTML = icon('devices', 17) + `<span class="lbl">${state.devices.length} device${state.devices.length === 1 ? '' : 's'}</span>` + icon('chevron', 14, 'chev');
}
$('#devList').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); const d = inst(rm.dataset.rm); if (d) C.removeDevice(d); return; }
  const b = e.target.closest('[data-id]'); if (b) { C.setActive(b.dataset.id); panels.get(b.dataset.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
});
let sbDrag = null;
$('#devList').addEventListener('dragstart', e => { const b = e.target.closest('[data-id]'); if (b) { sbDrag = b.dataset.id; b.classList.add('dragging'); } });
$('#devList').addEventListener('dragover', e => e.preventDefault());
$('#devList').addEventListener('drop', async e => { e.preventDefault(); const b = e.target.closest('[data-id]'); if (b && sbDrag && b.dataset.id !== sbDrag) { await C.reorder(sbDrag, b.dataset.id); for (const x of state.devices) wallEl.appendChild(panels.get(x.instanceId)); renderDeviceList(); renderThumbs(); } sbDrag = null; });

// ---------- status ----------
function renderStatus() {
  const n = state.devices.length; const a = activeInst();
  $('#stActive').textContent = a ? `Active: ${a.name} · ${dims(a)[0]}×${dims(a)[1]} @${a.dpr}x` : '';
  const perf = $('#perf'); perf.className = 'perf ' + (n >= 13 ? 'bad' : n >= 9 ? 'warn' : ''); perf.innerHTML = `<i></i>Performance: <b>${n >= 13 ? 'Heavy' : n >= 9 ? 'High' : 'Good'}</b>`; perf.dataset.tip = n >= 9 ? `${n} live views. Pause devices you are not comparing, or use Snapshots.` : '';
  $('#empty').hidden = n > 0;
}
function syncUIFromState() {
  $('#framesToggle').checked = state.layout.frames !== 'none'; setSeg('frameSeg', state.layout.frameStyle || 'realistic'); setSeg('browserSeg', state.layout.browser); applyTheme(); renderViewBtn();
  $('#mobileUA').checked = !!state.layout.mobileUA; $('#url').value = state.url;
  rebuildAll(); renderSets(); renderDeviceList(); renderStatus();
}

// ---------- issues ----------
function renderIssues() {
  const box = $('#issues'); const rows = [];
  for (const d of state.devices) for (const i of (d.issues || [])) rows.push(`<div class="i"><b>${esc(d.name)}</b> — ${esc(i.msg)}</div>`);
  const btn = $('#issuesBtn'); btn.hidden = !rows.length; btn.innerHTML = icon('warn', 14) + ` ${rows.length} issue${rows.length === 1 ? '' : 's'}`;
  box.hidden = !rows.length || box.dataset.open !== '1';
  box.innerHTML = `<div class="ihead">${icon('warn', 14)} ${rows.length} responsive issue${rows.length === 1 ? '' : 's'}<button class="link" data-act="report">Copy report</button><button class="icon-btn sm" data-act="close">${icon('x', 12)}</button></div>` + rows.join('');
}
$('#issues').addEventListener('click', async e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'close') { $('#issues').dataset.open = '0'; $('#issues').hidden = true; }
  if (a === 'report') { try { await navigator.clipboard.writeText(C.buildReport()); toast('Report copied'); } catch { toast('Copy failed'); } }
});
$('#issuesBtn').addEventListener('click', () => { const b = $('#issues'); b.dataset.open = b.dataset.open === '1' ? '0' : '1'; renderIssues(); });
document.addEventListener('click', e => { const bd = e.target.closest('.issue-badge'); if (bd) { $('#issues').dataset.open = '1'; renderIssues(); } });

// ---------- wall screenshot / compare image ----------
async function screenshotWall(presentation) {
  const list = state.devices.filter(d => d.frame && (!focusIds.length || focusIds.includes(d.instanceId))); if (!list.length) return toast('Nothing to capture yet');
  const imgs = await Promise.all(list.map(d => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = d.frame; })));
  const gap = 48, pad = 64, head = presentation ? 120 : 56, foot = 48; const sizes = list.map(dims);
  const W = pad * 2 + sizes.reduce((a, s) => a + s[0] + 24, 0) + gap * (list.length - 1), H = pad * 2 + head + Math.max(...sizes.map(s => s[1] + 24)) + foot;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const dark = state.layout.theme !== 'light';
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, dark ? '#1a2130' : '#f7f8fb'); g.addColorStop(1, dark ? '#0c1017' : '#e9ecf2'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#eef2f8' : '#151a24';
  if (presentation) { ctx.font = '700 34px Inter, system-ui'; ctx.fillText(hostOf(state.url) || 'Responsive preview', W / 2, pad + 40); ctx.font = '16px Inter, system-ui'; ctx.fillStyle = dark ? '#8b93a3' : '#6b7280'; ctx.fillText('Responsive preview', W / 2, pad + 70); }
  let x = pad;
  list.forEach((d, i) => {
    const [w, h] = sizes[i]; const cx = x + (w + 24) / 2;
    ctx.fillStyle = dark ? '#eef2f8' : '#151a24'; ctx.font = '600 18px Inter, system-ui'; ctx.fillText(d.name, cx, pad + head - 26);
    ctx.fillStyle = dark ? '#8b93a3' : '#6b7280'; ctx.font = '13px Inter, system-ui'; ctx.fillText(`${w} × ${h} · DPR ${d.dpr} · ${osLabel(d)}`, cx, pad + head - 6);
    const y = pad + head; const r = d.eff && d.eff.radius > 10 ? 28 : 8;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; ctx.fillStyle = '#111'; rr(ctx, x, y, w + 24, h + 24, r); ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, x + 12, y + 12, w, h, Math.max(0, r - 12)); ctx.clip(); ctx.drawImage(imgs[i], x + 12, y + 12, w, h); ctx.restore();
    x += w + 24 + gap;
  });
  ctx.textAlign = 'left'; ctx.fillStyle = dark ? '#8b93a3' : '#6b7280'; ctx.font = '13px Inter, system-ui';
  ctx.fillText(`${state.url}   ·   ${new Date().toLocaleString()}   ·   Made with Viewport Wall`, pad, H - 20);
  C.download(`viewport-wall-${C.slug(hostOf(state.url) || 'page')}.png`, c.toDataURL('image/png'));
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------- presentation ----------
function togglePresent(on = !document.body.classList.contains('present')) {
  document.body.classList.toggle('present', on);
  const t = $('#present-title'); t.hidden = !on; t.innerHTML = `<h1>${esc(hostOf(state.url) || 'Responsive preview')}</h1><p>Responsive preview · ${state.devices.length} devices</p>`;
  setTimeout(relayout, 30);
}

// ---------- device picker ----------
const picked = new Set(); let filter = null; let kbIndex = -1;
function openPicker() { picked.clear(); filter = null; $('#search').value = ''; renderPicker(); $('#picker').hidden = false; $('#search').focus(); }
function closePicker() { $('#picker').hidden = true; }
const CATS = [['favorites', 'star', 'Favorites'], ['Apple', 'apple', 'Apple'], ['Samsung', 'samsung', 'Samsung'], ['Google', 'google', 'Google'], ['phone', 'phone', 'Phones'], ['foldable', 'phone', 'Foldables'], ['tablet', 'tablet', 'Tablets'], ['laptop', 'monitor', 'PC / Mac'], ['watch', 'watch', 'Watches'], ['tv', 'tv', 'TVs'], ['breakpoint', 'ruler', 'Breakpoints'], ['Custom', 'pencil', 'Custom']];
function matches(d) { if (!filter) return true; if (filter === 'favorites') return C.favorites.has(d.id); if (filter === 'laptop') return d.category === 'laptop' || d.category === 'desktop'; return d.brand === filter || d.category === filter; }
function renderPicker() {
  const q = $('#search').value.trim().toLowerCase(); const all = C.allPresets();
  const list = all.filter(d => matches(d) && (!q || `${d.brand} ${d.name} ${d.width} ${d.height} ${d.width}px`.toLowerCase().includes(q)));
  $('#filters').innerHTML = CATS.map(([k, ic, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${icon(ic, 13)}${l}</button>`).join('');
  $('#quickWidths').innerHTML = QUICK_WIDTHS.map(w => `<span class="chip ${picked.has('bp-' + w) ? 'on' : ''}" data-pick="bp-${w}">${w}</span>`).join('');
  const row = d => `<div class="dev ${picked.has(d.id) ? 'on' : ''}" data-pick="${d.id}"><span class="box">${icon('check', 12)}</span><span class="dn">${esc(d.name)}</span><span class="dm">${d.width}×${d.height} · ${d.dpr}x</span><button class="fav ${C.favorites.has(d.id) ? 'on' : ''}" data-fav="${d.id}" data-tip="Favorite">${icon('star', 14)}</button>${d.custom ? `<button class="del" data-del="${d.id}" data-tip="Delete custom device">${icon('trash', 14)}</button>` : ''}</div>`;
  const groups = {};
  if (!q && !filter) { const pop = all.filter(d => (d.tags || []).includes('popular') && d.category !== 'breakpoint'); if (pop.length) groups.Popular = pop; }
  for (const d of list) if (d.category !== 'breakpoint' || q || filter === 'breakpoint') (groups[d.brand] ||= []).push(d);
  $('#groups').innerHTML = Object.entries(groups).map(([b, ds]) => `<section><div class="pal-sub">${esc(b)}</div><div class="devlist">${ds.map(row).join('')}</div></section>`).join('') || '<div class="pal-sub">No devices match.</div>';
  kbIndex = -1; updatePickCount();
}
function updatePickCount() { $('#pickCount').textContent = `${picked.size} selected`; $('#openPicked').textContent = `Add ${picked.size} device${picked.size === 1 ? '' : 's'}`; $('#openPicked').disabled = !picked.size; }
$('#picker').addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-act=close]') || t === $('#picker')) return closePicker();
  if (t.closest('[data-act=clear]')) { picked.clear(); return renderPicker(); }
  if (t.closest('[data-act=open]')) return commitPick();
  const f = t.closest('[data-f]'); if (f) { filter = filter === f.dataset.f ? null : f.dataset.f; return renderPicker(); }
  const fav = t.closest('[data-fav]'); if (fav) { e.stopPropagation(); C.toggleFavorite(fav.dataset.fav); return renderPicker(); }
  const del = t.closest('[data-del]'); if (del) { e.stopPropagation(); C.removeCustomDevice(del.dataset.del); return renderPicker(); }
  const p = t.closest('[data-pick]'); if (p) { const id = p.dataset.pick; picked.has(id) ? picked.delete(id) : picked.add(id); $$(`[data-pick="${id}"]`).forEach(x => x.classList.toggle('on', picked.has(id))); updatePickCount(); }
});
function commitPick() { const ps = [...picked].map(C.findPreset).filter(Boolean); closePicker(); if (ps.length) C.addDevices(ps); }
$('#search').addEventListener('input', renderPicker);
$('#search').addEventListener('keydown', e => {
  const rows = $$('#groups .dev');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); kbIndex = Math.max(0, Math.min(rows.length - 1, kbIndex + (e.key === 'ArrowDown' ? 1 : -1))); rows.forEach((r, i) => r.classList.toggle('kb', i === kbIndex)); rows[kbIndex]?.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === ' ' && kbIndex >= 0) { e.preventDefault(); rows[kbIndex].click(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (picked.size) commitPick(); else if (rows[0]) rows[0].click(); }
});
$('#customForm').addEventListener('submit', e => {
  e.preventDefault(); const f = new FormData(e.target);
  const dev = { id: 'custom-' + Date.now().toString(36), brand: 'Custom', custom: true, name: f.get('name'), category: 'custom', os: f.get('mobile') ? 'android' : 'any', width: +f.get('width'), height: +f.get('height'), dpr: +f.get('dpr') || 1, mobile: !!f.get('mobile'), touch: !!f.get('touch'), tags: ['custom'] };
  C.addCustomDevice(dev); picked.add(dev.id); e.target.reset(); filter = 'Custom'; renderPicker(); toast('Custom device saved');
});

// ---------- toolbar / keyboard ----------
$('#urlform').addEventListener('submit', e => { e.preventDefault(); C.navigateAll($('#url').value); $('#url').blur(); });
$('#back').onclick = () => C.navHistory(-1); $('#fwd').onclick = () => C.navHistory(1); $('#reload').onclick = e => C.reloadAll(e.shiftKey);
$('#add').onclick = openPicker;
$('#empty').addEventListener('click', e => { if (e.target.dataset.act === 'pick') openPicker(); if (e.target.dataset.set) C.applySet(e.target.dataset.set).then(renderSets); });
$('#onboard').addEventListener('click', e => { if (e.target.dataset.act === 'ok') { $('#onboard').hidden = true; C.persist({ onboarded: true }); } });
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName; const inField = /INPUT|SELECT|TEXTAREA/.test(tag) || document.activeElement?.classList.contains('viewport');
  if (e.key === 'Escape') {
    if (!$('#picker').hidden) return closePicker();
    if (openPop) return hidePops();
    if (focusIds.length) return setMode('live');
    if (document.body.classList.contains('present')) return togglePresent(false);
    document.activeElement?.blur(); return;
  }
  if (inField) return;
  const k = e.key;
  if (k === 'a' || k === 'A') openPicker();
  else if (k === 'r') C.reloadAll(false);
  else if (k === 'R' && e.shiftKey) state.devices.forEach(C.rotate);
  else if (k === 'f' || k === 'F') togglePresent();
  else if (k === '0') { state.layout.zoom = state.layout.zoom === 'fith' ? 'fit' : 'fith'; relayout(); C.savePrefs(); }
  else if (/^[1-9]$/.test(k)) { const d = state.devices[+k - 1]; if (d) C.setActive(d.instanceId); }
  else if (k === '+' || k === '=') stepZoom(1); else if (k === '-') stepZoom(-1);
});

// ---------- hooks & boot ----------
Object.assign(ui, {
  mount, unmount, renderPanelState, relayout, frameUpdated, renderIssues, toast,
  setUrl: u => { $('#url').value = u; for (const d of state.devices) updateHost(panels.get(d.instanceId), d.url || u); },
  countChanged: () => { renderDeviceList(); renderStatus(); renderSets(); renderThumbs(); },
  renderRecent: list => { $('#recent').innerHTML = (list || []).map(u => `<option value="${esc(u)}">`).join(''); },
  setActive: setActiveUI,
});
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === 'navigate' && msg.url && msg.url !== state.url) { C.navigateAll(msg.url); toast('Opened ' + hostOf(msg.url)); } });
async function boot() {
  const prefs = await C.loadPrefs();
  const q = new URLSearchParams(location.search);
  const recent = (prefs.recentUrls || []).filter(C.isWebUrl);
  if (recent.length !== (prefs.recentUrls || []).length) C.persist({ recentUrls: recent });
  state.url = C.normalizeUrl(q.get('url')) || recent[0] || 'http://localhost:3000';
  ui.renderRecent(recent); renderSessions(); syncUIFromState(); setMode('live');
  if (!prefs.onboarded) $('#onboard').hidden = false;
  if (q.get('set')) await C.applySet(q.get('set'));
  else if (q.get('pick')) openPicker();
  else if (prefs.lastDevices?.length) await C.addDevices(prefs.lastDevices);
  else openPicker();
  renderSets();
}
boot();
