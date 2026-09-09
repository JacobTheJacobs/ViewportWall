# Viewport Wall

Chrome extension: see one website on many viewports at once, with synchronized navigation and scroll.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
2. Open any page (or `localhost:3000`), click the toolbar icon, pick a set or **Choose devices**.

## How it works

- Each device is a real Chrome tab in a separate helper window, controlled with the `chrome.debugger` API (DevTools Protocol).
  `Emulation.setDeviceMetricsOverride` applies width/height/DPR/mobile/touch/user-agent, so CSS media queries see the real emulated viewport.
  This works on sites that block iframes (`X-Frame-Options`, `frame-ancestors`) and on localhost/staging with your existing cookies.
- The wall shows scaled live captures (`Page.captureScreenshot`). The **active** device refreshes ~3 fps; others refresh on change plus a slow heartbeat.
- Click a panel to make it active. Mouse, wheel, and keyboard on the active panel are forwarded via `Input.*`.
- Navigation sync propagates full loads and SPA route changes (pushState/replaceState/popstate/hashchange).
- Scroll sync uses percentage position (`scrollTop / (scrollHeight - viewportHeight)`).
- Everything is local: `chrome.storage.local` for custom devices, sets, preferences, and recent URLs. Nothing is uploaded.

Chrome shows an "is debugging this browser" bar on the helper window; that is expected. Closing the wall tab closes the helper window.

## UI

Two-row header: brand, pill URL bar with back/forward/reload, inline Sync switches (Navigation, Scroll, Clicks, Input), Add Device, More. Second row: device-set chips (Essential, Mobile + Tablet, Breakpoints, Popular Mobile, Apple, Android, saved sets), layout and zoom dropdowns, Frames switch, Screenshot menu, Record (WebM of the wall). Footer: device list, Clear all, Save set, Live / Snapshots / Focus / Compare modes, performance. Inter font bundled locally; dark and light themes.

Realistic frames are data-driven (`frames.js`): iPhone modern (Dynamic Island, iOS status bar, Safari bar, home indicator), iPhone classic (bezels + home button), Pixel / Galaxy (punch-hole, Android status bar, Chrome bar, gesture bar), iPad, desktop browser window, and a minimal rounded frame for raw breakpoints. All bars sit outside the emulated viewport, so CSS media queries always see the exact device width.

## Features

- Wall: auto grid, horizontal, vertical, focus + comparisons; fit or fixed zoom; frames toggle; presentation mode; drag to reorder; double-click to focus one device.
- Devices: 37 named presets + raw breakpoints, custom devices, favorites, saved sets, duplicate, rotate (one/all), pause, drag the right edge of a panel to resize its width live.
- Sync: navigation (full loads + SPA routes), scroll (percentage), clicks (matched by id > data-testid > href > aria-label > text, off by default), input (mirrors typed text into the matching field, off by default).
- Breakpoints: detect min/max-width media queries in the page's stylesheets, add them all, or add width-1 / width / width+1 boundary tests.
- Checks (per device, automatic): horizontal overflow, clipped text in buttons/headings/links, fixed elements exceeding the viewport, images exceeding the viewport. Issues appear on the panel badge and in the issues bar.
- QA: per-device notes, Markdown report to clipboard, saved sessions (URL, devices, layout, sync, notes).
- Screenshots: one device, full page (Shift+click the capture icon), every device, whole wall with metadata footer.
- Reload: all, one, hard (Shift+click), auto reload interval.
- Panel menu (⋯): per-device zoom (also Ctrl+wheel), network profile (Fast 4G / Slow 4G / 3G / Offline), CPU slowdown, add to compare (two devices → side-by-side image), edit device.
- Checks also flag overlapping interactive elements (nav/header/buttons/links/headings/images).

## Shortcuts

`A` add device · `R` reload all · `Shift+R` rotate all · `S` scroll sync · `N` navigation sync · `F` presentation · `1–9` activate device · `+/-` zoom · `Esc` exit · double-click a panel to focus it.

## Layout

```
manifest.json   MV3 manifest (debugger, tabs, storage, activeTab)
background.js   opens the wall; closes the helper window when the wall tab closes
popup.*         launcher: current URL + quick sets
core.js         target manager, CDP emulation, capture loop, sync, screenshots, sessions (no DOM)
wall.js         UI: toolbar, sidebar, canvas layout, picker, popovers, focus/presentation
wall.html/css   structure + design tokens (dark/light)
frames.js       data-driven device shells, status bars, browser bars, cutouts
icons.js        inline SVG icon set
devices.js      device library + built-in sets (data only; add a device = add a line)
```
