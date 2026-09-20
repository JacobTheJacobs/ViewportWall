// Finds and drives Chrome. Nothing is downloaded: the browser already on the machine is used.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CANDIDATES = {
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/opt/google/chrome/chrome'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
};

export function findChrome(explicit) {
  const tried = [];
  for (const p of [explicit, process.env.CHROME_PATH, ...(CANDIDATES[process.platform] || [])].filter(Boolean)) {
    tried.push(p); if (existsSync(p)) return p;
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { const p = execFileSync('which', [name], { encoding: 'utf8' }).trim(); if (p && existsSync(p)) return p; } catch {}
  }
  throw new Error('Could not find Chrome. Install Google Chrome, or set CHROME_PATH to the executable. Looked at: ' + tried.join(', '));
}

// One browser is reused for every call and closed when the process exits.
let browser = null, opts = {};
export function configure(o) { opts = { ...opts, ...o }; }

export async function getBrowser() {
  if (browser && browser.connected !== false) return browser;
  if (opts.connect) {                                   // attach to a Chrome the user already started with --remote-debugging-port
    browser = await puppeteer.connect({ browserURL: opts.connect, defaultViewport: null });
    return browser;
  }
  browser = await puppeteer.launch({
    executablePath: findChrome(opts.chromePath),
    headless: opts.headed ? false : true,
    userDataDir: opts.profile || undefined,             // a profile directory keeps logins, so agents can audit pages behind a session
    args: ['--hide-scrollbars', '--disable-features=Translate,BackForwardCache', '--no-first-run', '--no-default-browser-check', ...(opts.args || [])],
  });
  return browser;
}

export async function closeBrowser() {
  if (!browser) return;
  const b = browser; browser = null;
  try { opts.connect ? await b.disconnect() : await b.close(); } catch {}
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => closeBrowser().finally(() => process.exit(0)));
process.on('exit', () => { if (browser && !opts.connect) try { browser.process()?.kill(); } catch {} });
