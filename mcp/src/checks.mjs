// Runs inside the page. Same rules the Viewport Wall extension flags live, plus two an agent usually asks for
// (tap targets and text size). Returns plain data: every finding names the element that caused it.
export const CHECKS = `(opts => {
  const de = document.documentElement, issues = [];
  // A page with no viewport meta gets a wide layout viewport (980px by default) that Chrome scales down, so
  // innerWidth is not what "fits on screen" means. The initial containing block is.
  const vw = de.clientWidth || innerWidth, vh = de.clientHeight || innerHeight;
  const label = el => {
    if (!el || !el.tagName) return '?';
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const txt = (el.innerText || el.getAttribute?.('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    return el.tagName.toLowerCase() + id + cls + (txt ? ' "' + txt + '"' : '');
  };
  const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const add = (kind, message, el, extra) => issues.push({ kind, message, element: el ? label(el) : undefined, rect: el ? box(el) : undefined, ...extra });
  const visible = el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  // Content wider than its box is only a bug when nobody can reach it. A carousel, a code block or a wide table
  // inside a container that scrolls sideways on purpose is not breakage, so anything inside one is skipped.
  const inScroller = el => {
    for (let p = el.parentElement; p && p !== de; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o !== 'visible') return true;   // an ancestor scrolls it or clips it on purpose; nothing leaks onto the page
    }
    return false;
  };
  const srOnly = el => { const r = el.getBoundingClientRect(); return r.width <= 1 || r.height <= 1; };

  if (!document.querySelector('meta[name="viewport"]')) add('viewport-meta', 'No <meta name="viewport"> tag: mobile browsers will render at a desktop width and scale down.');

  if (de.scrollWidth > de.clientWidth + 1)
    add('overflow', 'Horizontal overflow: the page is ' + de.scrollWidth + 'px wide in a ' + de.clientWidth + 'px viewport, so it scrolls sideways.', null, { pageWidth: de.scrollWidth, viewportWidth: de.clientWidth });

  const all = [...document.body.querySelectorAll('*')].slice(0, opts.maxElements);
  let clipped = 0, fixed = 0, wide = 0, tap = 0, small = 0;
  const culprits = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    // element sticking out of the viewport: the usual cause of the page-level overflow above
    const pinned = cs.position === 'fixed' || cs.position === 'sticky';
    // A normal element sticking out only matters when the page itself scrolls sideways because of it.
    const pageOverflows = de.scrollWidth > vw + 1;
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && (pinned || (pageOverflows && r.width <= de.scrollWidth)) && !inScroller(el)) {
      // A pinned element cannot be scrolled into view, so its overflow is always a bug; a normal one is only
      // reported when it is not just a wrapper as wide as the whole document.
      if (pinned) { if (fixed++ < opts.perKind) add('fixed-overflow', 'Fixed or sticky element is ' + Math.round(r.width) + 'px wide in a ' + vw + 'px viewport, so part of it can never be seen.', el); }
      else if (wide++ < opts.perKind) { add('element-overflow', 'Element extends ' + Math.round(Math.max(r.right - vw, -r.left)) + 'px past the viewport edge.', el); culprits.push(el); }
    }
    // text cut off by its own box
    // hidden/clip cuts the text off for good; auto/scroll means the user can still reach it
    const cuts = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
    if (el.scrollWidth > el.clientWidth + 2 && cuts && !srOnly(el) && el.children.length === 0 && (el.innerText || '').trim()) {
      if (clipped++ < opts.perKind) add('clipped-text', 'Text is clipped: ' + el.scrollWidth + 'px of content in a ' + el.clientWidth + 'px box.', el);
    }
    if (opts.touch) {
      // tap targets: WCAG 2.5.8 asks for 24px, platform guidance for 44px
      const tappable = el.matches('a[href],button,[role="button"],input:not([type="hidden"]),select,textarea,summary,label[for]') && !srOnly(el);
      if (tappable && !el.querySelector('a,button,input,select,textarea') && r.width && r.height && (r.width < opts.tapMin || r.height < opts.tapMin) && r.top < vh * 3) {
        if (tap++ < opts.perKind) add('tap-target', 'Tap target is ' + Math.round(r.width) + '×' + Math.round(r.height) + 'px, under the ' + opts.tapMin + 'px minimum.', el);
      }
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < opts.minFont && (el.innerText || '').trim().length > 12 && el.children.length === 0) {
        if (small++ < opts.perKind) add('small-text', 'Text is ' + fs.toFixed(1) + 'px, under the ' + opts.minFont + 'px minimum for comfortable reading on a phone.', el);
      }
    }
  }
  for (const img of [...document.images].slice(0, 300)) {
    const r = img.getBoundingClientRect();
    if (r.width && r.right > vw + 1 && !inScroller(img)) { add('image-overflow', 'Image is ' + Math.round(r.width) + 'px wide in a ' + vw + 'px viewport.', img); break; }
  }
  return {
    url: location.href,
    title: document.title,
    viewport: { width: vw, height: vh, dpr: devicePixelRatio, pageWidth: de.scrollWidth, pageHeight: de.scrollHeight, layoutScaled: vw !== innerWidth ? innerWidth : undefined },
    issues,
    scanned: all.length,
  };
})`;

export const DEFAULT_OPTS = { maxElements: 2500, perKind: 5, tapMin: 44, minFont: 12, touch: true };

// What a media query can change: which elements are shown, how containers lay out, and how many columns they use.
// Pixel positions are deliberately excluded: on a fluid layout they shift at every width and every width then
// looks like a breakpoint.
export const SIGNATURE = `(() => {
  const els = [...document.body.querySelectorAll('*')].slice(0, 600);
  let sig = '';
  for (const e of els) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none') { sig += '0|'; continue; }
    const tracks = cs.display.includes('grid') ? cs.gridTemplateColumns.split(' ').length : 0;
    // how many rows a wrapping container has broken into: catches a nav or card grid rewrapping
    const wraps = (cs.flexWrap === 'wrap' || cs.display.includes('grid')) && e.children.length > 1
      ? new Set([...e.children].slice(0, 12).map(c => Math.round(c.getBoundingClientRect().top / 4))).size : 0;
    sig += cs.display[0] + (cs.flexDirection === 'column' ? 'c' : 'r') + cs.position[0] + tracks + ':' + wraps + '|';
  }
  let h = 0; for (let i = 0; i < sig.length; i++) h = (h * 33 + sig.charCodeAt(i)) | 0;
  return { hash: String(h) };
})`;

// Breakpoints as the stylesheets declare them: the authoritative answer when the CSS is readable.
export const DECLARED = `(() => {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const out = new Set(); let readable = 0, blocked = 0;
  const walk = rules => {
    for (const r of rules) {
      if (r.media && r.media.mediaText) {
        for (const m of r.media.mediaText.matchAll(/\\((?:min|max)-width:\\s*([\\d.]+)(px|em|rem)\\)/g)) {
          const v = parseFloat(m[1]); out.add(Math.round(m[2] === 'px' ? v : v * root));
        }
      }
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); readable++; } catch { blocked++; }
  }
  return { widths: [...out].sort((a, b) => a - b), readable, blocked };
})`;
