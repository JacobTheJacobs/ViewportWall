// In-page agent for Viewport Wall. Runs inside every device page: scroll/navigation reports, responsive checks.
// Injected through CDP (Page.addScriptToEvaluateOnNewDocument) for emulated tabs, or as a content script for iframe devices.
(function(){
  if (window.__vwInstalled) return; window.__vwInstalled = true;
  // Transport: CDP binding when injected through the debugger, runtime messaging when running as a content script in an iframe device.
  const frameId = (typeof __vwReport !== 'function' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) ? window.name : '';
  const report = (type, data) => { const m = Object.assign({ type }, data); try { if (typeof __vwReport === 'function') __vwReport(JSON.stringify(m)); else if (frameId) chrome.runtime.sendMessage(Object.assign({ vw: 'frame', id: frameId }, m)); } catch (e) {} };
  if (frameId) { addEventListener('mousedown', () => report('focus', {}), true); addEventListener('focus', () => report('focus', {})); report('nav', { url: location.href }); }
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
    const label = el => { const t = (el.innerText || el.getAttribute('aria-label') || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 28); const id = el.id && el.id.length < 24 && !/\d{4,}/.test(el.id) ? '#' + el.id : ''; return (id || el.tagName.toLowerCase()) + (t ? ' "' + t + (t.length === 28 ? '…' : '') + '"' : ''); };
    let n = 0;
    for (const el of document.querySelectorAll('button,a,h1,h2,h3,label,[role=button],input[type=submit]')) {
      if (n > 5) break;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && (cs.overflow !== 'visible' || cs.whiteSpace === 'nowrap')) { issues.push({ kind: 'clip', msg: 'Text clipped: ' + label(el) }); n++; }
    }
    n = 0;
    const all = document.querySelectorAll('body *'); const lim = Math.min(all.length, 2500);
    for (let i = 0; i < lim; i++) { const el = all[i];
      if (n > 5) break;
      const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.right > innerWidth + 1 || r.left < -1) { issues.push({ kind: 'fixed', msg: 'Fixed element exceeds viewport: ' + label(el) }); n++; }
    }
    const cands = [...document.querySelectorAll('nav,header,button,a,h1,h2,img,[role=button],input')].filter(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.opacity !== '0' && r.width > 8 && r.height > 8 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && cs.clip === 'auto' && cs.clipPath === 'none'; }).slice(0, 80);
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
  let c, last = 0; const run = () => { last = Date.now(); try { check(); } catch (e) {} };
  const sched = () => { clearTimeout(c); const wait = Math.max(300, 1500 - (Date.now() - last)); c = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(run, { timeout: 1000 }) : run()), wait); };
  addEventListener('load', sched); addEventListener('resize', sched); document.readyState === 'complete' && sched();
  new MutationObserver(sched).observe(document.documentElement, { childList: true, subtree: true, attributes: false });
})();
