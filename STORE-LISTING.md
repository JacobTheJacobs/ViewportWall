# Chrome Web Store listing copy

Paste these into the Developer Dashboard. Nothing here needs editing except the
privacy policy URL once you have published PRIVACY.md.

## Item name

Viewport Wall

## Short description (132 characters max, currently 118)

See one website on many device screens at once, with navigation, scrolling and
clicks synchronised across every device.

## Detailed description

Viewport Wall turns one browser tab into a wall of devices. Type a URL once and
the same page appears on every phone, tablet, laptop, watch and TV you have
added, each at its real viewport size and pixel density.

Everything stays inside the single tab. No extra windows, no popups.

FEATURES

- Real device emulation: viewport size, device pixel ratio, touch input and
  optional mobile user agent, driven by Chrome's own DevTools protocol.
- Live frames: each device streams what it is painting, so scrolling and
  animation appear on the wall as they happen.
- Sync switch: navigation, scrolling, clicks and typing on one device happen on
  all of them, or only on the device you touch.
- A device library covering phones, foldables (open and folded), tablets,
  laptops, desktops, ultrawides, watches and TVs, plus any custom width.
- Foldables fold and unfold in place, so you can compare both screens of the
  same device on the same page.
- Interactive mode for local development servers: the page runs in a live frame
  with no capture pipeline at all.
- Screenshots of one device, of a full page, or of the whole wall, plus WebM
  recording.
- Saved device sets, saved sessions, breakpoint detection and per-device QA
  notes.
- Dark and light themes.

A NOTE ON THE YELLOW BANNER

Chrome shows a "Viewport Wall started debugging this browser" banner while the
wall is open. This is Chrome's own notice, shown to every extension that uses
the debugger API, and it cannot be hidden. The extension uses that API because
it is the only way to emulate device metrics and touch input and to read frames
from a background tab. Closing the wall ends it.

PRIVACY

No accounts, no servers, no analytics, no data collection. Everything stays in
your browser.

## Category

Developer Tools

## Single purpose

Viewport Wall displays a single website simultaneously at multiple emulated
device viewports inside one tab, so that a developer can check a responsive
layout across screen sizes at once.

## Permission justifications

debugger
Required to emulate each device. The extension calls
Emulation.setDeviceMetricsOverride and Emulation.setTouchEmulationEnabled to
give each background tab a real viewport size, device pixel ratio and touch
behaviour, Input.dispatchMouseEvent and Input.dispatchKeyEvent to forward the
user's clicks and typing into those tabs, and Page.startScreencast and
Page.captureScreenshot to show what each device is rendering and to save
screenshots. No other Chrome API can emulate a device viewport or read frames
from a background tab, which is the entire function of this extension. The
debugger is attached only to tabs the extension itself creates, and is detached
when the device or the wall is closed.

tabs
The extension creates one background tab per device in its own window, and needs
to read and update those tabs (create, navigate, group, close) and to identify
its own wall tab so the toolbar icon reuses it instead of opening another.

tabGroups
The device tabs are collapsed into a single named tab group so they do not
clutter the user's tab strip.

storage
Stores the user's device list, saved sets, sessions and interface preferences
locally. Nothing is transmitted.

activeTab
When the user clicks the toolbar icon, the extension opens the wall on the page
the user is currently viewing. activeTab gives the URL of that one page at the
moment of the click.

scripting
In Interactive mode the page runs in a frame inside the wall instead of an
emulated tab. The extension injects its own agent script into that frame to
report scroll position and navigation so the devices stay in sync. Used only on
localhost frames created by the extension.

webNavigation
Detects when a frame inside the wall has finished loading or has changed route
in a single-page app, so the agent script can be injected and the other devices
can follow the navigation.

Host permission: localhost, 127.0.0.1, *.localhost
Interactive mode and its sync agent only run on pages served from the user's own
machine. The extension requests no access to any other website.

## Data usage certification

The extension does not collect or transmit any user data. Select "I do not
collect or use user data" and answer no to every category.
