// Data-driven device frames. A preset gets a frame spec (family, cutout, bars); the DOM is built once per panel and
// re-skinned when the frames/browser mode changes. Everything here is presentational: the emulated viewport stays exact.
import { icon } from './icons.js';

// Frame metadata derivation. Presets may carry `frame` to override; otherwise we infer from os/category/id.
export function frameSpec(inst) {
  const id = inst.presetId || '', os = inst.os, cat = inst.category;
  const base = { radius: 0, bezel: 0, cutout: 'none', statusBar: 'none', browser: 'none', navigation: 'none', family: 'minimal', shell: 'dark' };
  if (cat === 'breakpoint' || cat === 'custom' && !inst.mobile) return { ...base, family: 'minimal', radius: 14, bezel: 5, shell: 'minimal' };
  if (cat === 'laptop' || cat === 'desktop') return { ...base, family: 'desktop', radius: 10, bezel: 10, browser: 'desktop' };
  if (cat === 'tv') return { ...base, family: 'tv', radius: 8, bezel: 12, shell: 'tv' };
  if (cat === 'watch') {
    const round = os === 'wearos' || Math.abs(inst.baseW - inst.baseH) < 8;
    const bezel = round ? 18 : 14; const w = Math.min(inst.baseW, inst.baseH) + bezel * 2;
    return { ...base, family: 'watch', radius: round ? Math.ceil(w / 2) : Math.round(w * 0.3), bezel, shell: 'graphite' };
  }
  if (os === 'windows' && cat === 'tablet') return { ...base, family: 'surface', radius: 12, bezel: 16, browser: 'desktop' };
  if (os === 'ios') {
    if (/iphone-se/.test(id)) return { ...base, family: 'iphone-classic', radius: 40, bezel: 14, cutout: 'none', statusBar: 'ios-classic', browser: 'safari', navigation: 'ios-toolbar-classic', topBezel: 60, bottomBezel: 60 };
    return { ...base, family: 'iphone-modern', radius: 54, bezel: 12, cutout: 'dynamic-island', statusBar: 'ios', browser: 'safari', navigation: 'ios-toolbar' };
  }
  if (os === 'ipados' || cat === 'tablet' && os === 'ios') return { ...base, family: 'ipad', radius: 26, bezel: 20, cutout: 'none', statusBar: 'ipad', browser: 'safari-tablet', navigation: 'ios-home' };
  if (cat === 'tablet') return { ...base, family: 'android-tablet', radius: 22, bezel: 18, cutout: 'none', statusBar: 'android', browser: 'chrome', navigation: 'android-buttons' };
  if (cat === 'foldable') return { ...base, family: 'android-fold', radius: 18, bezel: 8, cutout: 'punch', statusBar: 'android', browser: 'chrome', navigation: 'android-buttons' };
  if (inst.mobile) {
    const galaxy = /galaxy|samsung/.test(id + inst.brand.toLowerCase());
    return { ...base, family: galaxy ? 'galaxy' : 'pixel', radius: galaxy ? 34 : 44, bezel: galaxy ? 7 : 9, cutout: 'punch', statusBar: 'android', browser: 'chrome', navigation: 'android-buttons', shell: galaxy ? 'graphite' : 'obsidian' };
  }
  return base;
}

// Heights (CSS px, at 1:1 scale) of presentational bars. They sit OUTSIDE the emulated viewport.
export const BAR = { ios: 54, 'ios-classic': 20, ipad: 24, android: 28, safari: 50, 'safari-tablet': 44, chrome: 52, desktop: 40, 'ios-home': 30, 'home-button': 0, 'android-gesture': 24, 'ios-toolbar': 74, 'ios-toolbar-classic': 44, 'android-buttons': 46 };

// Human OS label shown under the device name.
export function osLabel(inst) {
  const id = inst.presetId || '';
  if (inst.os === 'ios') return /iphone-se|iphone-15|iphone-16/.test(id) ? 'iOS 18' : 'iOS 26';
  if (inst.os === 'ipados') return 'iPadOS 26';
  if (inst.os === 'android') return inst.category === 'tablet' ? 'Android 15' : 'Android 16';
  if (inst.os === 'macos') return 'macOS';
  if (inst.os === 'watchos') return 'watchOS 26';
  if (inst.os === 'wearos') return 'Wear OS 6';
  if (inst.os === 'tvos') return 'tvOS 26';
  if (inst.os === 'androidtv') return 'Google TV';
  if (inst.os === 'tizen') return 'Tizen';
  if (inst.os === 'windows') return 'Windows 11';
  if (inst.category === 'tv') return 'TV';
  if (inst.category === 'watch') return 'Watch';
  return inst.category === 'breakpoint' ? 'Breakpoint' : inst.category === 'laptop' || inst.category === 'desktop' ? 'Desktop' : 'Custom';
}
export function osIcon(inst) {
  const b = (inst.brand || '').toLowerCase();
  if (inst.os === 'ios' || inst.os === 'ipados' || inst.os === 'macos' || inst.os === 'watchos' || inst.os === 'tvos') return 'apple';
  if (b === 'google') return 'google';
  if (b === 'samsung') return 'samsung';
  if (inst.category === 'watch') return 'watch';
  if (inst.category === 'tv') return 'tv';
  if (inst.os === 'android') return 'android';
  if (inst.category === 'breakpoint') return 'ruler';
  if (inst.category === 'laptop' || inst.category === 'desktop') return 'monitor';
  return 'phone';
}

export function effective(spec, mode, browserMode) {
  // mode: realistic | minimal | none. browserMode: auto | on | off.
  const real = mode === 'realistic';
  const showBrowser = mode !== 'none' && (browserMode === 'on' || browserMode === 'auto' && real) && spec.browser !== 'none';
  return {
    ...spec,
    radius: mode === 'realistic' ? spec.radius : mode === 'minimal' ? 12 : 0,
    bezel: mode === 'realistic' ? spec.bezel : mode === 'minimal' ? 4 : 0,
    topBezel: real ? spec.topBezel || 0 : 0, bottomBezel: real ? spec.bottomBezel || 0 : 0,
    cutout: real ? spec.cutout : 'none',
    statusBar: real ? spec.statusBar : 'none',
    browser: showBrowser ? spec.browser : 'none',
    navigation: real ? spec.navigation : 'none',
    frameless: mode === 'none',
  };
}

// Total outer size of the device given viewport [w,h].
export function outerSize(eff, w, h) {
  const top = (BAR[eff.statusBar] || 0) + (BAR[eff.browser] || 0);
  const bottom = BAR[eff.navigation] || 0;
  return [w + eff.bezel * 2, h + top + bottom + eff.bezel * 2 + eff.topBezel + eff.bottomBezel];
}

const host = url => { try { return new URL(url).host; } catch { return url || ''; } };
const time = () => '9:41';

function statusBar(kind, w) {
  if (kind === 'none') return '';
  if (kind === 'ios') return `<div class="sb sb-ios" style="height:${BAR.ios}px"><span class="sb-time">${time()}</span><span class="sb-right">${icon('signal', 14)}${icon('wifi', 14)}<span class="bat"><i></i></span></span></div>`;
  if (kind === 'ios-classic') return `<div class="sb sb-ios-classic" style="height:${BAR['ios-classic']}px"><span class="sb-left">${icon('signal', 11)} <span class="sb-wifi">${icon('wifi', 11)}</span></span><span class="sb-time">${time()}</span><span class="sb-right">100% <span class="bat"><i></i></span></span></div>`;
  if (kind === 'ipad') return `<div class="sb sb-ipad" style="height:${BAR.ipad}px"><span class="sb-time">${time()} <span class="sb-date">Tue Apr 1</span></span><span class="sb-right">${icon('wifi', 12)} 100% <span class="bat"><i></i></span></span></div>`;
  if (kind === 'android') return `<div class="sb sb-android" style="height:${BAR.android}px"><span class="sb-time">${time()}</span><span class="sb-right">${icon('wifi', 13)}${icon('signal', 13)}${icon('battery', 14)}</span></div>`;
  return '';
}
function browserBar(kind, url) {
  const h = host(url) || 'about:blank';
  if (kind === 'safari') return `<div class="bb bb-safari" style="height:${BAR.safari}px"><span class="aa">AA</span><span class="pill">${icon('lock', 10)}<span>${h}</span></span><span class="rl">${icon('reload', 13)}</span></div>`;
  if (kind === 'safari-tablet') return `<div class="bb bb-safari-tablet" style="height:${BAR['safari-tablet']}px"><span class="nav">${icon('back', 14)}${icon('forward', 14)}</span><span class="pill">${icon('lock', 10)}<span>${h}</span></span><span class="nav">${icon('share', 14)}${icon('plus', 14)}${icon('tabs', 14)}</span></div>`;
  if (kind === 'chrome') return `<div class="bb bb-chrome" style="height:${BAR.chrome}px"><span class="nav">${icon('home', 15)}</span><span class="pill">${icon('lock', 11)}<span>${h}</span></span><span class="nav">${icon('tabs', 15)}${icon('more', 15, 'v')}</span></div>`;
  if (kind === 'desktop') return `<div class="bb bb-desktop" style="height:${BAR.desktop}px"><span class="dots"><i></i><i></i><i></i></span><span class="nav">${icon('back', 13)}${icon('forward', 13)}${icon('reload', 13)}</span><span class="pill">${icon('lock', 10)}<span>${url || ''}</span></span></div>`;
  return '';
}
function navBar(kind) {
  if (kind === 'ios-toolbar') return `<div class="nb nb-safari" style="height:${BAR['ios-toolbar']}px"><div class="tools">${icon('back', 18)}${icon('forward', 18)}${icon('share', 18)}${icon('book', 18)}${icon('tabs', 18)}</div><i></i></div>`;
  if (kind === 'ios-toolbar-classic') return `<div class="nb nb-safari classic" style="height:${BAR['ios-toolbar-classic']}px"><div class="tools">${icon('back', 18)}${icon('forward', 18)}${icon('share', 18)}${icon('book', 18)}${icon('tabs', 18)}</div></div>`;
  if (kind === 'android-buttons') return `<div class="nb nb-android-btns" style="height:${BAR['android-buttons']}px">${icon('triangle', 16)}${icon('circle', 15)}${icon('square', 14)}</div>`;
  if (kind === 'ios-home') return `<div class="nb nb-ios" style="height:${BAR['ios-home']}px"><i></i></div>`;
  if (kind === 'android-gesture') return `<div class="nb nb-android" style="height:${BAR['android-gesture']}px"><i></i></div>`;
  return '';
}
function cutout(kind) {
  if (kind === 'dynamic-island') return '<div class="cut island"></div>';
  if (kind === 'punch') return '<div class="cut punch"></div>';
  if (kind === 'notch') return '<div class="cut notch"></div>';
  return '';
}

// Build (or rebuild) the shell markup around an existing `.viewport` element.
export function buildShell(el, inst, w, h, eff, url) {
  const shell = el.querySelector('.shell');
  shell.className = `shell fam-${eff.family} shell-${eff.shell || 'dark'} mode-${eff.frameless ? 'none' : eff.bezel <= 4 ? 'minimal' : 'realistic'}`;
  shell.style.setProperty('--radius', eff.radius + 'px');
  shell.style.setProperty('--bezel', eff.bezel + 'px');
  shell.style.setProperty('--top-bezel', eff.topBezel + 'px');
  shell.style.setProperty('--bottom-bezel', eff.bottomBezel + 'px');
  const [ow, oh] = outerSize(eff, w, h);
  shell.style.width = ow + 'px'; shell.style.height = oh + 'px';
  const screen = shell.querySelector('.screen');
  screen.style.width = w + 'px';
  screen.querySelector('.top-chrome').innerHTML = statusBar(eff.statusBar, w) + browserBar(eff.browser, url);
  screen.querySelector('.bottom-chrome').innerHTML = navBar(eff.navigation);
  const cut = shell.querySelector('.cutout-layer'); cut.innerHTML = cutout(eff.cutout);
  shell.querySelector('.home-btn').hidden = eff.navigation !== 'home-button';
  const vp = screen.querySelector('.viewport'); vp.style.width = w + 'px'; vp.style.height = h + 'px';
  return [ow, oh];
}
export function updateHost(el, url) {
  const p = el.querySelector('.bb .pill span'); if (p) p.textContent = p.closest('.bb-desktop') ? url : host(url);
}
