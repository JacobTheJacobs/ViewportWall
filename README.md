# Viewport Wall

Chrome extension: see one website on many viewports at once, with synchronized navigation and scroll.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
2. Open any page (or `localhost:3000`) and click the toolbar icon. The wall opens with that URL; clicking the icon again reuses the open wall and sends it the new page.

## How it works

- Each device is a real Chrome tab in the wall's own window (a collapsed "Viewport Wall" tab group), controlled with the `chrome.debugger` API (DevTools Protocol). No extra windows are opened.
  `Emulation.setDeviceMetricsOverride` applies width/height/DPR/mobile/touch/user-agent, so CSS media queries see the real emulated viewport.
  This works on sites that block iframes (`X-Frame-Options`, `frame-ancestors`) and on localhost/staging with your existing cookies.
- The wall shows live captures (`Page.captureScreenshot`) taken at the resolution they are displayed at, so a phone shown at 40% costs a fraction of a full capture. Polling is adaptive: a device whose pixels change is re-captured quickly (active 0.4s, others 0.8s); still content backs off to 1.5s / 4s. Unchanged frames are dropped, so nothing flickers.
- Click a panel to make it active. Mouse, wheel, and keyboard on the active panel are forwarded via `Input.*`.
- Navigation sync propagates full loads and SPA route changes (pushState/replaceState/popstate/hashchange).
- Scroll sync uses percentage position (`scrollTop / (scrollHeight - viewportHeight)`).
- Everything is local: `chrome.storage.local` for custom devices, sets, preferences, and recent URLs. Nothing is uploaded.

Chrome shows an "is debugging this browser" bar while the wall is open; that is expected and cannot be removed by an extension. Closing the wall tab closes the device tabs.

## UI

Two-row header: brand, pill URL bar with back/forward/reload, inline Sync switches (Navigation, Scroll, Clicks, Input), Add Device, Settings (theme, mobile user agent, auto reload, QA report, about). Second row: device-set chips (Essential, Mobile + Tablet, Breakpoints, Popular Mobile, Apple, Android, saved sets, manage), one View menu (layout, zoom, frame style, browser UI, rotate all, presentation), Frames switch, Screenshot menu, Record (WebM of the wall). Footer: a Devices hub (list, save set, breakpoints, save session, sessions, clear all), Live / Snapshots / Focus / Compare modes, performance. Each device label has rotate, close and one actions menu (reload, rotate, pause, focus, capture, compare, note, edit, duplicate, network, CPU, remove); double-click a device to focus it. Inter font bundled locally; dark and light themes.

Realistic frames are data-driven (`frames.js`): iPhone modern (Dynamic Island, iOS status bar, Safari bar, home indicator), iPhone classic (bezels + home button), Pixel / Galaxy (punch-hole, Android status bar, Chrome bar, gesture bar), iPad, desktop browser window, and a minimal rounded frame for raw breakpoints. All bars sit outside the emulated viewport, so CSS media queries always see the exact device width.

## Features

- Wall: auto grid, horizontal, vertical, focus + comparisons; fit or fixed zoom; frames toggle; presentation mode; drag to reorder; double-click to focus one device.
- Devices: 37 named presets + raw breakpoints, custom devices, favorites, saved sets, duplicate, rotate (one/all), pause, drag the right edge of a panel to resize its width live.
- Sync: navigation (full loads + SPA routes), scroll (percentage), clicks (matched by id > data-testid > href > aria-label > text, off by default), input (mirrors typed text into the matching field, off by default).
- Breakpoints: detect min/max-width media queries in the page's stylesheets, add them all, or add width-1 / width / width+1 boundary tests.
- Checks (per device, automatic): horizontal overflow, clipped text in buttons/headings/links, fixed elements exceeding the viewport, images exceeding the viewport. Issues appear on the panel badge and in the issues bar.
- QA: per-device notes, Markdown report to clipboard, saved sessions (URL, devices, layout, sync, notes).
- Screenshots: one device, full page, every device, whole wall with metadata footer (Screenshot menu or the device menu).
- Reload: all, one, hard (Shift+click), auto reload interval.
- Panel menu (⋯): per-device zoom (also Ctrl+wheel), network profile (Fast 4G / Slow 4G / 3G / Offline), CPU slowdown, add to compare (two devices → side-by-side image), edit device.
- Checks also flag overlapping interactive elements (nav/header/buttons/links/headings/images).

## Shortcuts

`A` add device · `R` reload all · `Shift+R` rotate all · `S` scroll sync · `N` navigation sync · `F` presentation · `1–9` activate device · `+/-` zoom · `Esc` exit · double-click a panel to focus it.

## Layout

```
manifest.json   MV3 manifest (debugger, tabs, storage, activeTab)
background.js   opens the wall from the toolbar icon; closes the device tab group when the wall tab closes
core.js         target manager, CDP emulation, capture loop, sync, screenshots, sessions (no DOM)
wall.js         UI: toolbars, menus, canvas layout, picker, focus/compare/presentation
wall.html/css   structure + design tokens (dark/light)
frames.js       data-driven device shells, status bars, browser bars, cutouts
icons.js        inline SVG icon set
devices.js      device library + built-in sets (data only; add a device = add a line)
```
