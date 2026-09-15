# Viewport Wall privacy policy

Last updated: 15 September 2026

Viewport Wall is a developer tool that renders one website at several viewport
sizes inside a single browser tab.

## What the extension collects

Nothing. Viewport Wall has no server, no analytics, no telemetry, no accounts
and no third-party services. No data leaves your browser.

## What the extension stores

The extension stores the following on your own machine, using Chrome's
`storage.local` area:

* the devices currently on the wall and their settings,
* recently visited URLs typed into the wall's address bar,
* saved device sets and saved sessions,
* interface preferences (theme, layout, zoom, rendering mode).

This data stays in your Chrome profile. It is never transmitted. Removing the
extension removes it.

## What the extension accesses

* **The pages you open in the wall.** Each device is a background tab that loads
  the URL you type. The extension attaches Chrome's debugger to those tabs to
  emulate device metrics, forward your clicks and keystrokes, and stream the
  rendered frames into the wall. Frames are shown to you and discarded. They are
  not stored or uploaded, except when you explicitly click Screenshot or Record,
  which downloads a file to your computer.
* **Local development servers.** The extension has host permission for
  `localhost` and `127.0.0.1` only, so that pages served from your own machine
  can be shown in an interactive frame instead of an emulated tab.

The extension requests no host permission for any other website.

## Contact

Open an issue at https://github.com/JacobTheJacobs/ViewportWall or email the
address on that account.
