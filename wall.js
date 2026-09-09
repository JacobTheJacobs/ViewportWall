// Viewport Wall UI layer. All rendering/emulation logic lives in core.js; this file owns DOM, layout and interaction.
import * as C from './core.js';
import { state, ui, dims } from './core.js';
import { QUICK_WIDTHS } from './devices.js';
import { icon } from './icons.js';
import { frameSpec, effective, buildShell, outerSize, updateHost } from './frames.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wallEl = $('#wall'), canvasEl = $('#canvas');
const panels = new Map();
const LABEL_H = 56, GAP_X = 36, GAP_Y = 40, PAD = 40;
let focusId = null;
let compareSel = new Set();

// ---------- icons into static buttons ----------
const setIcon = (sel, name, size = 16, label = '') => { const el = $(sel); if (el) el.innerHTML = icon(name, size) + (label ? `<span class="lbl">${label}</span>` : ''); };
setIcon('#sidebarToggle', 'sidebar'); setIcon('#back', 'back'); setIcon('#fwd', 'forward'); setIcon('#reload', 'reload');
setIcon('#bpBtn', 'ruler', 15, 'Breakpoints'); setIcon('#captureBtn', 'camera', 15, 'Capture'); setIcon('#add', 'plus', 16, 'Device'); setIcon('#moreBtn', 'more');
setIcon('#sbAdd', 'plus', 15, 'Add device'); setIcon('#sbSave', 'save', 15, 'Save set'); setIcon('#zoomOut', 'x'); setIcon('#zoomIn', 'plus');
$('#zoomOut').innerHTML = '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
$('.url-ic').innerHTML = icon('globe', 14); $('.pal-ic').innerHTML = icon('search', 18); $('#picker [data-act=close]').innerHTML = icon('x');
$('#syncBtn').insertAdjacentHTML('beforeend', icon('chevron', 12));
$$('#capturePop button, #morePop button, #devMenu button').forEach(b => {
  const map = { active: 'phone', all: 'layers', wall: 'grid', full: 'file', present: 'present', rotateAll: 'rotate', report: 'note', saveSession: 'save', clear: 'trash', about: 'info',
    rotate: 'rotate', reload: 'reload', pause: 'pause', focus: 'focus', shot: 'camera', compare: 'compare', note: 'note', edit: 'pencil', dup: 'copy', remove: 'trash' };
  const k = b.dataset.cap || b.dataset.more || b.dataset.dm; if (map[k]) b.insertAdjacentHTML('afterbegin', icon(map[k], 14));
});

// ---------- helpers ----------
const inst = id => state.devices.find(d => d.instanceId === id);
const activeInst = () => inst(state.activeId);
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1800); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const setSeg = (id, v) => $$(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));

// ---------- panels ----------
function mount(d) {
  const el = $('#panelTpl').content.firstElementChild.cloneNode(true);
  el.dataset.id = d.instanceId; panels.set(d.instanceId, el); wallEl.appendChild(el);
  el.querySelector('[data-act=reload]').innerHTML = icon('reload', 14);
  el.querySelector('[data-act=rotate]').innerHTML = icon('rotate', 14);
  el.querySelector('[data-act=focus]').innerHTML = icon('focus', 14);
  el.querySelector('[data-act=shot]').innerHTML = icon('camera', 14);
  el.querySelector('[data-act=menu]').innerHTML = icon('more', 14);
  el.querySelector('.ov-error .ov-ic').innerHTML = icon('warn', 30);
  el.querySelector('.ov-paused .ov-ic').innerHTML = icon('pause', 26);
  el.addEventListener('mousedown', e => { if (!e.target.closest('.hover-actions') && state.activeId !== d.instanceId) C.setActive(d.instanceId); }, true);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; e.stopPropagation();
    const a = b.dataset.act;
    if (a === 'reload') C.reloadOne(d, e.shiftKey);
    else if (a === 'rotate') C.rotate(d);
    else if (a === 'focus') focusDevice(focusId === d.instanceId ? null : d.instanceId);
    else if (a === 'shot') e.shiftKey ? C.screenshotFullPage(d) : C.screenshotDevice(d);
    else if (a === 'menu') openDevMenu(d, b);
    else if (a === 'retry') C.retry(d);
  });
  el.addEventListener('dblclick', e => { if (e.target.closest('.viewport')) focusDevice(focusId === d.instanceId ? null : d.instanceId); });
  C.wireInput(d, el.querySelector('.viewport'));
  wireDrag(d, el); wireResize(d, el); visObs.observe(el);
  buildFrame(d);
  renderPanelState(d);
}
function unmount(d) {
  const el = panels.get(d.instanceId); if (!el) return;
  panels.delete(d.instanceId); visObs.unobserve(el);
  el.classList.add('removing'); setTimeout(() => el.remove(), 200);
  if (focusId === d.instanceId) focusDevice(null);
}
function buildFrame(d) {
  const el = panels.get(d.instanceId); if (!el) return;
  const [w, h] = dims(d);
  const eff = effective(frameSpec(d), state.layout.frames, state.layout.browser);
  d.eff = eff; d.outer = buildShell(el, d, w, h, eff, d.url || state.url);
  el.classList.toggle('desktop', eff.family === 'desktop');
}
function renderPanelState(d) {
  const el = panels.get(d.instanceId); if (!el) return;
  const [w, h] = dims(d);
  el.querySelector('.name').textContent = d.name;
  el.querySelector('.meta').textContent = `${w} × ${h} · ${d.dpr}x${d.scale ? ' · ' + Math.round(d.scale * 100) + '%' : ''}`;
  el.className = `panel ${d.status}${d.paused ? ' paused' : ''}${state.activeId === d.instanceId ? ' active' : ''}${d.eff?.family === 'desktop' ? ' desktop' : ''}`;
  const st = el.querySelector('.st-text');
  st.textContent = d.paused ? 'Paused' : d.status === 'error' ? (d.errorTitle || 'Error') : d.status === 'loading' ? 'Loading' : state.activeId === d.instanceId ? 'Active' : (state.sync.scroll || state.sync.navigation) ? 'Synced' : 'Ready';
  if (d.status === 'error') { el.querySelector('.ov-title').textContent = d.errorTitle || "Couldn't load page"; el.querySelector('.ov-msg').textContent = d.errorKind === 'detached' ? d.errorMsg : `${hostOf(d.url || state.url)} ${d.errorMsg}`; }
  el.querySelector('.ov-text').textContent = `Loading ${hostOf(d.url || state.url)}…`;
  const badge = el.querySelector('.issue-badge'); const n = (d.issues || []).length;
  badge.hidden = !n && !d.note; badge.innerHTML = (n ? icon('warn', 11) + ' ' + n : '') + (d.note ? (n ? ' · ' : '') + icon('note', 11) : '');
  badge.title = [...(d.issues || []).map(i => i.msg), d.note].filter(Boolean).join('\n');
  updateHost(el, d.url || state.url);
  if (d.orientation !== el.dataset.or) { el.dataset.or = d.orientation; buildFrame(d); relayout(); }
}
const hostOf = u => { try { return new URL(u).host; } catch { return u || ''; } };
function frameUpdated(d) { const img = panels.get(d.instanceId)?.querySelector('img'); if (img) img.src = d.frame; if (focusId === d.instanceId || state.layout.type === 'focus') { const t = $(`#thumbs [data-id="${d.instanceId}"] img`); if (t) t.src = d.frame; } }
function setActiveUI(id) {
  for (const [iid, el] of panels) el.classList.toggle('active', iid === id);
  for (const d of state.devices) renderPanelState(d);
  renderSidebarDevices(); renderStatus();
}
const visObs = new IntersectionObserver(entries => { for (const en of entries) { const d = inst(en.target.dataset.id); if (d) { d.offscreen = !en.isIntersecting; if (en.isIntersecting) d.dirty = true; } } }, { root: canvasEl, threshold: 0.02 });

// ---------- layout ----------
function relayout() {
  const type = state.layout.type; const zoom = state.layout.zoom;
  wallEl.className = focusId ? 'focus' : type;
  const list = state.devices.filter(d => panels.has(d.instanceId));
  for (const d of list) if (!d.outer) buildFrame(d);
  let base = zoom === 'fit' ? fitScale(list) : Number(zoom);
  for (const d of list) {
    const el = panels.get(d.instanceId);
    const hidden = focusId && d.instanceId !== focusId; el.style.display = hidden ? 'none' : '';
    if (hidden) continue;
    const s = focusId ? fitOne(d) : base * (d.zoom || 1);
    d.scale = s;
    const [ow, oh] = d.outer;
    const dev = el.querySelector('.device'); dev.style.width = Math.round(ow * s) + 'px'; dev.style.height = Math.round(oh * s) + 'px';
    el.querySelector('.shell').style.transform = `scale(${s})`;
    el.style.width = Math.round(ow * s) + 'px';
    if (type === 'free' && !focusId) { if (d.fx == null) { d.fx = 40 + (list.indexOf(d) % 4) * 320; d.fy = 40 + Math.floor(list.indexOf(d) / 4) * 700; } el.style.left = d.fx + 'px'; el.style.top = d.fy + 'px'; } else { el.style.left = el.style.top = ''; }
    el.querySelector('.meta').textContent = `${dims(d)[0]} × ${dims(d)[1]} · ${d.dpr}x · ${Math.round(s * 100)}%`;
  }
  $('#zoomBtn').textContent = zoom === 'fit' ? `Fit ${Math.round(base * 100)}%` : Math.round(base * 100) + '%';
  renderThumbs();
}
function fitScale(list) {
  if (!list.length) return 1;
  const W = canvasEl.clientWidth - PAD * 2, H = canvasEl.clientHeight - PAD * 2 - 16;
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
function fitOne(d) { const W = canvasEl.clientWidth - PAD * 2, H = canvasEl.clientHeight - PAD * 2 - 150; return clamp(Math.min(W / d.outer[0], (H - LABEL_H) / d.outer[1])); }
const clamp = s => Math.max(0.08, Math.min(1, s));
window.addEventListener('resize', relayout);
function rebuildAll() { for (const d of state.devices) { buildFrame(d); renderPanelState(d); } relayout(); }

// ---------- focus & thumbnails ----------
function focusDevice(id) {
  focusId = id; if (id) C.setActive(id);
  $('#thumbs').hidden = !id; relayout();
}
function renderThumbs() {
  const box = $('#thumbs'); if (!focusId) { box.innerHTML = ''; return; }
  box.innerHTML = state.devices.map(d => `<button class="thumb ${d.instanceId === focusId ? 'on' : ''}" data-id="${d.instanceId}" data-tip="Focus ${esc(d.name)}"><img src="${d.frame || ''}" alt=""><span>${esc(d.name)}</span></button>`).join('');
}
$('#thumbs').addEventListener('click', e => { const b = e.target.closest('.thumb'); if (b) focusDevice(b.dataset.id); });

// ---------- drag reorder / resize / free move ----------
let dragId = null;
function wireDrag(d, el) {
  const lab = el.querySelector('.label'); lab.draggable = true;
  lab.addEventListener('dragstart', e => { dragId = d.instanceId; e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragover', e => e.preventDefault());
  el.addEventListener('drop', async e => {
    e.preventDefault(); if (!dragId || dragId === d.instanceId) return;
    await C.reorder(dragId, d.instanceId); for (const x of state.devices) wallEl.appendChild(panels.get(x.instanceId)); dragId = null; renderSidebarDevices();
  });
  // free canvas: move the whole device
  lab.addEventListener('mousedown', e => {
    if (state.layout.type !== 'free' || focusId) return; e.preventDefault();
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
      buildFrame(d); relayout(); el.querySelector('.name').textContent = d.name;
      clearTimeout(t); t = setTimeout(() => C.setViewport(d, w), 80);
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); renderPanelState(d); renderSidebarDevices(); C.savePrefs(); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
}

// ---------- canvas zoom / pan ----------
canvasEl.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey) || e.target.closest('.viewport')) return;
  e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
const ZOOMS = [0.25, 0.33, 0.5, 0.75, 1];
function stepZoom(dir) {
  const cur = state.layout.zoom === 'fit' ? fitScale(state.devices) : Number(state.layout.zoom);
  const next = dir > 0 ? ZOOMS.find(z => z > cur + 0.01) : [...ZOOMS].reverse().find(z => z < cur - 0.01);
  if (next == null) return;
  state.layout.zoom = String(next); relayout(); C.savePrefs();
}
let space = false, pan = null;
document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.activeElement?.classList.contains('viewport')) { space = true; canvasEl.classList.add('panning'); e.preventDefault(); } });
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
$$('[data-pop]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const id = b.dataset.pop; if (openPop && openPop.id === id) return hidePops(); if (id === 'syncPop') syncSync(); if (id === 'bpPop') renderBpCommon(); showPop(id, b, b.closest('.statusbar') ? 'left' : 'right'); }));

// sync
function syncSync() { $$('#syncPop [data-sync]').forEach(i => { i.checked = !!state.sync[i.dataset.sync]; }); $('#syncBtn .dot').classList.toggle('on', state.sync.navigation || state.sync.scroll); }
$('#syncPop').addEventListener('change', e => { const k = e.target.dataset.sync; if (!k) return; state.sync[k] = e.target.checked; C.savePrefs(); syncSync(); for (const d of state.devices) renderPanelState(d); });

// capture
$('#capturePop').addEventListener('click', async e => {
  const k = e.target.closest('[data-cap]')?.dataset.cap; if (!k) return; hidePops();
  if (k === 'active') { const a = activeInst(); if (a) C.screenshotDevice(a); }
  else if (k === 'all') C.screenshotAll(false);
  else if (k === 'full') C.screenshotAll(true);
  else if (k === 'wall') screenshotWall(false);
  else if (k === 'present') screenshotWall(true);
});
// more
$('#morePop').addEventListener('click', async e => {
  const k = e.target.closest('[data-more]')?.dataset.more; if (!k) return; hidePops();
  if (k === 'rotateAll') state.devices.forEach(C.rotate);
  else if (k === 'present') togglePresent();
  else if (k === 'report') { try { await navigator.clipboard.writeText(C.buildReport()); toast('Report copied to clipboard'); } catch { toast('Copy failed'); } }
  else if (k === 'saveSession') { const n = prompt('Session name', hostOf(state.url) + ' QA'); if (n) { C.saveSession(n); renderSessions(); toast('Session saved'); } }
  else if (k === 'clear') { if (confirm('Remove all devices from the wall?')) C.clearDevices(); }
  else if (k === 'about') $('#onboard').hidden = false;
});
$('#auto').addEventListener('change', e => C.setAutoReload(+e.target.value));
$('#themeSeg').addEventListener('click', e => { const v = e.target.dataset.v; if (!v) return; state.layout.theme = v; applyTheme(); C.savePrefs(); });
function applyTheme() { document.documentElement.dataset.theme = state.layout.theme || 'dark'; setSeg('themeSeg', state.layout.theme || 'dark'); }
$('#sessions').addEventListener('change', async e => {
  const v = e.target.value; e.target.value = ''; if (!v) return; hidePops();
  if (v.startsWith('del:')) { if (confirm('Delete this session?')) { C.deleteSession(v.slice(4)); renderSessions(); } return; }
  const x = await C.loadSession(v); if (x) { syncUIFromState(); x.devices.forEach((pd, i) => { if (state.devices[i]) { state.devices[i].note = pd.note; renderPanelState(state.devices[i]); } }); toast(`Session "${x.name}" loaded`); }
});
function renderSessions() {
  $('#sessions').innerHTML = '<option value="">Open…</option>' + C.sessions.map(s => `<option value="${s.id}">${esc(s.name)} · ${new Date(s.ts).toLocaleDateString()}</option>`).join('') + C.sessions.map(s => `<option value="del:${s.id}">Delete "${esc(s.name)}"</option>`).join('');
}
// zoom pop
$('#zoomPop').addEventListener('click', e => { const z = e.target.dataset.zoom; if (!z) return; state.layout.zoom = z; relayout(); C.savePrefs(); hidePops(); });
$('#zoomIn').onclick = () => stepZoom(1); $('#zoomOut').onclick = () => stepZoom(-1);

// breakpoints
let detected = [];
const bpPicked = new Set();
function renderBpCommon() {
  $('#bpCommon').innerHTML = QUICK_WIDTHS.map(w => `<span class="chip ${bpPicked.has(w) ? 'on' : ''}" data-w="${w}">${w}</span>`).join('');
}
$('#bpDetect').addEventListener('click', async () => {
  $('#bpDetected').innerHTML = '<span class="muted">Scanning…</span>';
  detected = await C.detectBreakpoints();
  $('#bpDetected').innerHTML = detected.length ? detected.map(w => `<span class="chip" data-w="${w}">${w}</span>`).join('') : '<span class="muted">No media-query breakpoints found in accessible stylesheets.</span>';
  $('#bpBoundary').innerHTML = detected.length ? detected.map(w => `<span class="chip-group"><span class="chip" data-w="${w - 1}">${w - 1}</span><span class="chip" data-w="${w}">${w}</span><span class="chip" data-w="${w + 1}">${w + 1}</span></span>`).join(' ') : '<span class="muted">Nothing detected.</span>';
  $('#bpAddBoundary').disabled = !detected.length;
});
$('#bpPop').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  const w = +c.dataset.w; bpPicked.has(w) ? bpPicked.delete(w) : bpPicked.add(w); c.classList.toggle('on');
  $('#bpAdd').disabled = !bpPicked.size; $('#bpAdd').textContent = bpPicked.size ? `Add ${bpPicked.size} to wall` : 'Add to wall';
});
$('#bpAdd').addEventListener('click', () => { C.addDevices([...bpPicked].sort((a, b) => a - b).map(C.widthPreset)); bpPicked.clear(); hidePops(); });
$('#bpAddBoundary').addEventListener('click', () => { C.addDevices(detected.flatMap(b => [b - 1, b, b + 1]).map(C.widthPreset)); hidePops(); });

// device menu
let menuDev = null;
function openDevMenu(d, anchor) {
  menuDev = d; const m = $('#devMenu');
  m.querySelector('[data-dm=pause]').innerHTML = icon(d.paused ? 'play' : 'pause', 14) + (d.paused ? 'Resume rendering' : 'Pause rendering');
  m.querySelector('[data-dm=compare]').innerHTML = icon('compare', 14) + (compareSel.has(d.instanceId) ? 'Remove from compare' : `Add to compare (${compareSel.size}/2)`);
  m.querySelector('[data-dm-sel=net]').value = d.net || 'none'; m.querySelector('[data-dm-sel=cpu]').value = String(d.cpu || 1);
  showPop('devMenu', anchor, 'left');
}
$('#devMenu').addEventListener('click', e => {
  const k = e.target.closest('[data-dm]')?.dataset.dm; if (!k || !menuDev) return; const d = menuDev; hidePops();
  if (k === 'rotate') C.rotate(d); else if (k === 'reload') C.reloadOne(d); else if (k === 'pause') C.togglePause(d);
  else if (k === 'focus') focusDevice(d.instanceId); else if (k === 'shot') C.screenshotDevice(d); else if (k === 'full') C.screenshotFullPage(d);
  else if (k === 'compare') { compareSel.has(d.instanceId) ? compareSel.delete(d.instanceId) : compareSel.add(d.instanceId); if (compareSel.size === 2) { compareScreenshot([...compareSel].map(inst).filter(Boolean)); compareSel.clear(); } else toast(compareSel.size ? 'Pick a second device to compare' : 'Removed from compare'); }
  else if (k === 'note') { const v = prompt(`QA note for ${d.name}`, d.note || ''); if (v != null) { d.note = v.trim(); renderPanelState(d); renderIssues(); C.savePrefs(); } }
  else if (k === 'edit') { const v = prompt('Name, width, height, DPR', `${d.name}, ${d.baseW}, ${d.baseH}, ${d.dpr}`); if (v) { const [n, w, h, dpr] = v.split(',').map(x => x.trim()); if (n) d.name = n; d.presetId = null; C.setViewport(d, +w || 0, +h || 0, +dpr || 0); buildFrame(d); renderPanelState(d); relayout(); renderSidebarDevices(); C.savePrefs(); } }
  else if (k === 'dup') C.addDevices([{ ...C.instToPreset(d), name: d.name + ' copy' }]);
  else if (k === 'remove') C.removeDevice(d);
});
$('#devMenu').addEventListener('change', e => { const k = e.target.dataset.dmSel; if (!k || !menuDev) return; menuDev[k] = k === 'cpu' ? +e.target.value : e.target.value; C.applyProfiles(menuDev).catch(() => {}); C.savePrefs(); });

// ---------- sidebar ----------
function renderSets() {
  const cur = currentSetId();
  $('#setList').innerHTML = C.allSets().map(s => `<button class="sb-item ${s.id === cur ? 'on' : ''}" data-set="${s.id}">${icon(s.id.startsWith('set-') ? 'star' : 'layers', 14)}<span class="t">${esc(s.name)}</span><span class="n">${s.deviceIds.length}</span>${s.id.startsWith('set-') ? `<span class="rm" data-delset="${s.id}" data-tip="Delete set">${icon('x', 12)}</span>` : ''}</button>`).join('');
}
function currentSetId() { const ids = state.devices.map(d => d.presetId).join(','); return C.allSets().find(s => s.deviceIds.join(',') === ids)?.id || null; }
$('#setList').addEventListener('click', e => {
  const del = e.target.closest('[data-delset]'); if (del) { e.stopPropagation(); if (confirm('Delete this set?')) { C.deleteSet(del.dataset.delset); renderSets(); } return; }
  const b = e.target.closest('[data-set]'); if (b) C.applySet(b.dataset.set).then(renderSets);
});
function renderSidebarDevices() {
  const fam = d => d.category === 'tablet' ? 'tablet' : d.category === 'laptop' || d.category === 'desktop' ? 'monitor' : d.category === 'breakpoint' ? 'ruler' : 'phone';
  $('#devList').innerHTML = state.devices.map(d => `<button class="sb-item ${d.instanceId === state.activeId ? 'on' : ''}" draggable="true" data-id="${d.instanceId}">${icon(fam(d), 14)}<span class="t">${esc(d.name)}</span><span class="n">${dims(d)[0]}</span><span class="rm" data-rm="${d.instanceId}" data-tip="Remove device">${icon('x', 12)}</span></button>`).join('');
  $('#devCount').textContent = state.devices.length || '';
}
$('#devList').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); const d = inst(rm.dataset.rm); if (d) C.removeDevice(d); return; }
  const b = e.target.closest('[data-id]'); if (b) { C.setActive(b.dataset.id); panels.get(b.dataset.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
});
let sbDrag = null;
$('#devList').addEventListener('dragstart', e => { const b = e.target.closest('[data-id]'); if (b) { sbDrag = b.dataset.id; b.classList.add('dragging'); } });
$('#devList').addEventListener('dragover', e => e.preventDefault());
$('#devList').addEventListener('drop', async e => { e.preventDefault(); const b = e.target.closest('[data-id]'); if (b && sbDrag && b.dataset.id !== sbDrag) { await C.reorder(sbDrag, b.dataset.id); for (const x of state.devices) wallEl.appendChild(panels.get(x.instanceId)); renderSidebarDevices(); renderThumbs(); } sbDrag = null; });
$('#sidebarToggle').onclick = () => { state.layout.sidebar = !state.layout.sidebar; document.body.classList.toggle('sb-collapsed', !state.layout.sidebar); C.savePrefs(); setTimeout(relayout, 210); };
$('#sbAdd').onclick = openPicker; $('#add').onclick = openPicker;
$('#sbSave').onclick = () => { if (!state.devices.length) return toast('Add devices first'); const n = prompt('Set name', 'My QA Set'); if (n) { C.saveSet(n); renderSets(); toast('Set saved'); } };

// ---------- status bar ----------
function renderStatus() {
  const n = state.devices.length; $('#stDevices').textContent = `${n} device${n === 1 ? '' : 's'}`;
  const a = activeInst(); $('#stActive').textContent = a ? `Active: ${a.name} · viewport ${dims(a)[0]}×${dims(a)[1]} @${a.dpr}x` : '';
  const perf = $('#perf'); perf.className = 'perf ' + (n >= 13 ? 'bad' : n >= 9 ? 'warn' : ''); perf.innerHTML = `<i></i>Performance: ${n >= 13 ? 'Heavy' : n >= 9 ? 'High' : 'Good'}`; perf.dataset.tip = n >= 9 ? `${n} live views. Pause devices you are not comparing to reduce load.` : '';
  $('#empty').hidden = n > 0;
}
$$('.statusbar .seg[data-key]').forEach(seg => seg.addEventListener('click', e => {
  const v = e.target.dataset.v; if (!v) return; state.layout[seg.dataset.key] = v; setSeg(seg.id, v); C.savePrefs();
  if (seg.dataset.key === 'type') { if (v !== 'free') state.devices.forEach(d => { d.fx = d.fy = null; }); relayout(); } else rebuildAll();
}));
function syncUIFromState() {
  setSeg('frameSeg', state.layout.frames); setSeg('browserSeg', state.layout.browser); setSeg('layoutSeg', state.layout.type); applyTheme(); syncSync();
  document.body.classList.toggle('sb-collapsed', state.layout.sidebar === false);
  $('#url').value = state.url; rebuildAll(); renderSets(); renderSidebarDevices(); renderStatus();
}

// ---------- issues ----------
function renderIssues() {
  const box = $('#issues'); const rows = [];
  for (const d of state.devices) for (const i of (d.issues || [])) rows.push(`<div class="i"><b>${esc(d.name)}</b> — ${esc(i.msg)}</div>`);
  box.hidden = !rows.length || box.dataset.closed === '1';
  box.innerHTML = `<div class="ihead">${icon('warn', 14)} ${rows.length} responsive issue${rows.length === 1 ? '' : 's'}<button class="link" data-act="report">Copy report</button><button class="icon-btn sm" data-act="close">${icon('x', 12)}</button></div>` + rows.join('');
}
$('#issues').addEventListener('click', async e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'close') { $('#issues').dataset.closed = '1'; $('#issues').hidden = true; }
  if (a === 'report') { try { await navigator.clipboard.writeText(C.buildReport()); toast('Report copied'); } catch { toast('Copy failed'); } }
});

// ---------- screenshots of the wall ----------
async function screenshotWall(presentation) {
  const list = state.devices.filter(d => d.frame); if (!list.length) return toast('Nothing to capture yet');
  const imgs = await Promise.all(list.map(d => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = d.frame; })));
  const gap = 48, pad = 64, head = presentation ? 120 : 56, foot = 48;
  const sizes = list.map(dims);
  const W = pad * 2 + sizes.reduce((a, s) => a + s[0] + 24, 0) + gap * (list.length - 1);
  const H = pad * 2 + head + Math.max(...sizes.map(s => s[1] + 24)) + foot;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const dark = state.layout.theme !== 'light';
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, dark ? '#1c2030' : '#f7f8fb'); g.addColorStop(1, dark ? '#101218' : '#e9ecf2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#eef0f4' : '#161a22';
  if (presentation) { ctx.font = '600 34px system-ui'; ctx.fillText(hostOf(state.url) || 'Responsive preview', W / 2, pad + 40); ctx.font = '16px system-ui'; ctx.fillStyle = dark ? '#8b93a3' : '#6b7280'; ctx.fillText('Responsive preview', W / 2, pad + 70); }
  let x = pad;
  list.forEach((d, i) => {
    const [w, h] = sizes[i]; const cx = x + (w + 24) / 2;
    ctx.fillStyle = dark ? '#eef0f4' : '#161a22'; ctx.font = '600 18px system-ui'; ctx.fillText(d.name, cx, pad + head - 26);
    ctx.fillStyle = dark ? '#8b93a3' : '#6b7280'; ctx.font = '13px system-ui'; ctx.fillText(`${w} × ${h} · ${d.dpr}x`, cx, pad + head - 6);
    const y = pad + head; const r = d.eff && d.eff.radius > 10 ? 28 : 8;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; ctx.fillStyle = '#111'; rr(ctx, x, y, w + 24, h + 24, r); ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, x + 12, y + 12, w, h, Math.max(0, r - 12)); ctx.clip(); ctx.drawImage(imgs[i], x + 12, y + 12, w, h); ctx.restore();
    x += w + 24 + gap;
  });
  ctx.textAlign = 'left'; ctx.fillStyle = dark ? '#8b93a3' : '#6b7280'; ctx.font = '13px system-ui';
  ctx.fillText(`${state.url}   ·   ${new Date().toLocaleString()}   ·   Made with Viewport Wall`, pad, H - 20);
  C.download(`viewport-wall-${C.slug(hostOf(state.url) || 'page')}.png`, c.toDataURL('image/png'));
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
async function compareScreenshot(list) {
  const imgs = await Promise.all(list.map(d => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = d.frame; })));
  const sizes = list.map(dims), gap = 40, pad = 32, head = 48;
  const W = pad * 2 + sizes.reduce((a, s) => a + s[0], 0) + gap, H = pad * 2 + head + Math.max(...sizes.map(s => s[1])) + 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  ctx.fillStyle = '#15171c'; ctx.fillRect(0, 0, W, H); let x = pad;
  list.forEach((d, i) => { const [w, h] = sizes[i]; ctx.fillStyle = '#eef0f4'; ctx.font = '600 18px system-ui'; ctx.fillText(`${d.name}  ${w}×${h}`, x, pad + 22); ctx.drawImage(imgs[i], x, pad + head, w, h); x += w + gap; });
  ctx.fillStyle = '#8b93a3'; ctx.font = '12px system-ui'; ctx.fillText(`${state.url}   ·   ${new Date().toLocaleString()}`, pad, H - 14);
  C.download(`compare-${C.slug(list[0].name)}-vs-${C.slug(list[1].name)}.png`, c.toDataURL('image/png'));
}

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
const CATS = [['favorites', 'star', 'Favorites'], ['Apple', 'phone', 'Apple'], ['Samsung', 'phone', 'Samsung'], ['Google', 'phone', 'Google'], ['phone', 'phone', 'Phones'], ['tablet', 'tablet', 'Tablets'], ['foldable', 'phone', 'Foldables'], ['laptop', 'monitor', 'Desktop'], ['breakpoint', 'ruler', 'Breakpoints'], ['Custom', 'pencil', 'Custom']];
function matches(d) {
  if (!filter) return true;
  if (filter === 'favorites') return C.favorites.has(d.id);
  if (filter === 'laptop') return d.category === 'laptop' || d.category === 'desktop';
  return d.brand === filter || d.category === filter;
}
function renderPicker() {
  const q = $('#search').value.trim().toLowerCase();
  const all = C.allPresets();
  const list = all.filter(d => matches(d) && (!q || `${d.brand} ${d.name} ${d.width} ${d.height} ${d.width}px`.toLowerCase().includes(q)));
  $('#filters').innerHTML = CATS.map(([k, ic, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${icon(ic, 12)}${l}</button>`).join('');
  $('#quickWidths').innerHTML = QUICK_WIDTHS.map(w => `<span class="chip ${picked.has('bp-' + w) ? 'on' : ''}" data-pick="bp-${w}">${w}</span>`).join('');
  const row = d => `<div class="dev ${picked.has(d.id) ? 'on' : ''}" data-pick="${d.id}"><span class="box">${icon('check', 11)}</span><span class="dn">${esc(d.name)}</span><span class="dm">${d.width}×${d.height} · ${d.dpr}x</span><button class="fav ${C.favorites.has(d.id) ? 'on' : ''}" data-fav="${d.id}" data-tip="Favorite">${icon('star', 13)}</button>${d.custom ? `<button class="del" data-del="${d.id}" data-tip="Delete custom device">${icon('trash', 13)}</button>` : ''}</div>`;
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
  else if (e.key === 'Enter') { e.preventDefault(); if (picked.size) commitPick(); else if (rows[0]) { rows[0].click(); } }
});
$('#customForm').addEventListener('submit', e => {
  e.preventDefault(); const f = new FormData(e.target);
  const dev = { id: 'custom-' + Date.now().toString(36), brand: 'Custom', custom: true, name: f.get('name'), category: 'custom', os: f.get('mobile') ? 'android' : 'any', width: +f.get('width'), height: +f.get('height'), dpr: +f.get('dpr') || 1, mobile: !!f.get('mobile'), touch: !!f.get('touch'), tags: ['custom'] };
  C.addCustomDevice(dev); picked.add(dev.id); e.target.reset(); filter = 'Custom'; renderPicker(); toast('Custom device saved');
});

// ---------- toolbar ----------
$('#urlform').addEventListener('submit', e => { e.preventDefault(); C.navigateAll($('#url').value); $('#url').blur(); });
$('#back').onclick = () => C.navHistory(-1); $('#fwd').onclick = () => C.navHistory(1); $('#reload').onclick = e => C.reloadAll(e.shiftKey);
$('#empty').addEventListener('click', e => { if (e.target.dataset.act === 'pick') openPicker(); if (e.target.dataset.set) C.applySet(e.target.dataset.set).then(renderSets); });
$('#onboard').addEventListener('click', e => { if (e.target.dataset.act === 'ok') { $('#onboard').hidden = true; C.persist({ onboarded: true }); } });

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName; const inField = /INPUT|SELECT|TEXTAREA/.test(tag) || document.activeElement?.classList.contains('viewport');
  if (e.key === 'Escape') {
    if (!$('#picker').hidden) return closePicker();
    if (openPop) return hidePops();
    if (focusId) return focusDevice(null);
    if (document.body.classList.contains('present')) return togglePresent(false);
    document.activeElement?.blur(); return;
  }
  if (inField) return;
  const k = e.key;
  if (k === 'a' || k === 'A') openPicker();
  else if (k === 'r') C.reloadAll(false);
  else if (k === 'R' && e.shiftKey) state.devices.forEach(C.rotate);
  else if (k === 's' || k === 'S') { state.sync.scroll = !state.sync.scroll; C.savePrefs(); syncSync(); toast(`Scroll sync ${state.sync.scroll ? 'on' : 'off'}`); }
  else if (k === 'n' || k === 'N') { state.sync.navigation = !state.sync.navigation; C.savePrefs(); syncSync(); toast(`Navigation sync ${state.sync.navigation ? 'on' : 'off'}`); }
  else if (k === 'f' || k === 'F') togglePresent();
  else if (k === '0') { state.layout.zoom = 'fit'; relayout(); C.savePrefs(); }
  else if (/^[1-9]$/.test(k)) { const d = state.devices[+k - 1]; if (d) C.setActive(d.instanceId); }
  else if (k === '+' || k === '=') stepZoom(1); else if (k === '-') stepZoom(-1);
});

// ---------- hooks & boot ----------
Object.assign(ui, {
  mount, unmount, renderPanelState, relayout, frameUpdated, renderIssues, toast,
  setUrl: u => { $('#url').value = u; for (const d of state.devices) updateHost(panels.get(d.instanceId), d.url || u); },
  countChanged: () => { renderSidebarDevices(); renderStatus(); renderSets(); renderThumbs(); },
  renderRecent: list => { $('#recent').innerHTML = (list || []).map(u => `<option value="${esc(u)}">`).join(''); },
  setActive: setActiveUI,
});
async function boot() {
  const prefs = await C.loadPrefs();
  const q = new URLSearchParams(location.search);
  const recent = (prefs.recentUrls || []).filter(C.isWebUrl);
  if (recent.length !== (prefs.recentUrls || []).length) C.persist({ recentUrls: recent });
  state.url = C.normalizeUrl(q.get('url')) || recent[0] || 'http://localhost:3000';
  ui.renderRecent(recent); renderSessions(); syncUIFromState();
  if (!prefs.onboarded) $('#onboard').hidden = false;
  if (q.get('set')) await C.applySet(q.get('set'));
  else if (q.get('pick')) openPicker();
  else if (prefs.lastDevices?.length) await C.addDevices(prefs.lastDevices);
  else openPicker();
  renderSets();
}
boot();
