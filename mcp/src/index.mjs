#!/usr/bin/env node
// viewport-wall-mcp: an MCP server (default) and a CLI over the same engine.
//   MCP:  viewport-wall-mcp
//   CLI:  viewport-wall-mcp audit https://example.com --devices popular-mobile,1440
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { audit, shoot, breakpoints, resolveDevices, allDevices, findDevice, commonWidths } from './audit.mjs';
import { SETS } from './devices.js';
import { configure, closeBrowser } from './browser.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const DEFAULT_DEVICES = ['iphone-se', 'iphone-17-pro', 'pixel-10', 'ipad-pro-11', 'laptop-1366', 'desktop-1920'];

// ---------- shared formatting ----------
const fmtIssue = i => `  - [${i.kind}] ${i.message}${i.element ? `\n    element: ${i.element}` : ''}`;
function fmtAudit(url, results) {
  const total = results.reduce((n, r) => n + (r.issues?.length || 0), 0);
  const broken = results.filter(r => r.issues?.length);
  const head = [
    `Responsive audit of ${url}`,
    `${results.length} viewport${results.length === 1 ? '' : 's'} checked, ${total} issue${total === 1 ? '' : 's'} found on ${broken.length} of them.`,
    total === 0 ? 'No layout problems detected by these rules. Rules catch structural breakage, not visual taste: ask for screenshots to judge the design.' : '',
  ].filter(Boolean);
  const body = results.map(r => {
    const d = r.device;
    const title = `${d.name} — ${d.width}x${d.height} @${d.dpr || 1}x${d.mobile ? ' (touch)' : ''}`;
    if (r.error) return `${title}\n  ! ${r.error}`;
    if (!r.issues.length) return `${title}\n  ok`;
    return `${title}  [page is ${r.viewport.pageWidth}px wide]\n` + r.issues.map(fmtIssue).join('\n');
  });
  return head.join('\n') + '\n\n' + body.join('\n\n');
}

function fmtBreakpoints(r) {
  const lines = [`Breakpoints for ${r.url} between ${r.range[0]}px and ${r.range[1]}px`];
  lines.push(r.declared.length ? `Declared in CSS: ${r.declared.join('px, ')}px` : 'Declared in CSS: none found in this range');
  if (r.stylesheets.blocked) lines.push(`(${r.stylesheets.blocked} stylesheet${r.stylesheets.blocked === 1 ? '' : 's'} could not be read across origins, so declared widths may be incomplete.)`);
  lines.push(r.observed.length ? `Layout observed to change at: ${r.observed.join('px, ')}px` : 'Layout observed to change at: nowhere, the page reflows fluidly');
  const test = [...new Set([...r.declared, ...r.observed])].sort((a, b) => a - b);
  if (test.length) lines.push('', `Worth auditing just below and at each: ${test.map(w => `${w - 1}, ${w}`).join(', ')}`);
  return lines.join('\n');
}

// ---------- MCP ----------
const TOOLS = [
  {
    name: 'audit_responsive',
    description: 'Check a web page for responsive layout problems across several device viewports at once. Returns, per device, the viewport it used and every issue found: horizontal overflow, elements running past the viewport edge, clipped text, fixed or sticky elements overflowing, images wider than the screen, tap targets under 44px, text under 12px, and a missing viewport meta tag. Each issue names the element that caused it. Start here; ask for screenshots only for the devices that failed.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page to check. http(s) or a localhost address.' },
        devices: { type: 'array', items: { type: 'string' }, description: `Device ids, set ids, or plain pixel widths like "390". Defaults to ${DEFAULT_DEVICES.join(', ')}. Call list_devices for the full library.` },
        include_screenshots: { type: 'boolean', description: 'Also return a picture of each viewport. Expensive in tokens: prefer a targeted screenshot call. Default false.' },
        full_page: { type: 'boolean', description: 'Screenshots capture the whole scrollable page instead of the visible viewport. Default false.' },
        mobile_user_agent: { type: 'boolean', description: 'Send a phone user agent on mobile devices. Off by default because it logs some sites out.' },
        wait_until: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], description: 'When the page counts as loaded. Default networkidle2.' },
        timeout_ms: { type: 'number', description: 'Per page load. Default 30000.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a picture of a page at one or more device viewports and return the images, so you can judge the layout with your own eyes rather than by rules.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        devices: { type: 'array', items: { type: 'string' }, description: 'Device ids, set ids or pixel widths. Default iphone-17-pro.' },
        full_page: { type: 'boolean', description: 'Whole scrollable page instead of the visible viewport.' },
        format: { type: 'string', enum: ['jpeg', 'png'], description: 'Default jpeg.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'find_breakpoints',
    description: 'Report the widths where a page responds: the breakpoints its stylesheets declare, and the widths where the layout is observed to change when the viewport is swept. Use it to pick which widths are worth auditing.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        min: { type: 'number', description: 'Default 320.' },
        max: { type: 'number', description: 'Default 1600.' },
        step: { type: 'number', description: 'Coarse sweep step in px, refined to the exact pixel afterwards. Default 8.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'list_devices',
    description: 'List the device profiles available to the other tools: phones, foldables (open and closed), tablets, laptops, desktops, watches and TVs, plus named sets and common widths.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['phone', 'foldable', 'tablet', 'laptop', 'desktop', 'watch', 'tv'], description: 'Filter by category.' },
        query: { type: 'string', description: 'Match against name or brand, e.g. "pixel".' },
      },
    },
  },
];

async function runTool(name, a = {}) {
  if (name === 'list_devices') {
    let list = allDevices().filter(d => d.category !== 'breakpoint');
    if (a.category) list = list.filter(d => d.category === a.category);
    if (a.query) { const q = a.query.toLowerCase(); list = list.filter(d => (d.name + ' ' + d.brand).toLowerCase().includes(q)); }
    const byCat = {};
    for (const d of list) (byCat[d.category] ||= []).push(`${d.id} — ${d.name} ${d.width}x${d.height} @${d.dpr}x`);
    const text = Object.entries(byCat).map(([c, rows]) => `${c.toUpperCase()}\n` + rows.map(r => '  ' + r).join('\n')).join('\n\n')
      + `\n\nSETS (pass a set id in place of a device)\n` + SETS.map(s => `  ${s.id} — ${s.name} (${s.deviceIds.length})`).join('\n')
      + `\n\nAny plain number works too, e.g. "375". Common widths: ${commonWidths.join(', ')}.`;
    return { content: [{ type: 'text', text }] };
  }
  if (name === 'audit_responsive') {
    const devices = resolveDevices(a.devices?.length ? a.devices : DEFAULT_DEVICES);
    const results = await audit(a.url, devices, {
      screenshot: !!a.include_screenshots, fullPage: !!a.full_page, mobileUA: !!a.mobile_user_agent,
      waitUntil: a.wait_until || 'networkidle2', timeout: a.timeout_ms || 30000,
    });
    const content = [{ type: 'text', text: fmtAudit(a.url, results) }];
    for (const r of results) if (r.screenshot) content.push({ type: 'image', data: r.screenshot, mimeType: 'image/jpeg' });
    return { content };
  }
  if (name === 'screenshot') {
    const devices = resolveDevices(a.devices?.length ? a.devices : ['iphone-17-pro']);
    const content = [];
    for (const d of devices) {
      const s = await shoot(a.url, d, { fullPage: !!a.full_page, format: a.format || 'jpeg' });
      content.push({ type: 'text', text: `${d.name} — ${d.width}x${d.height} @${d.dpr}x` });
      content.push({ type: 'image', data: s.data, mimeType: s.mimeType });
    }
    return { content };
  }
  if (name === 'find_breakpoints') {
    const r = await breakpoints(a.url, { min: a.min ?? 320, max: a.max ?? 1600, step: a.step ?? 16 });
    return { content: [{ type: 'text', text: fmtBreakpoints(r) }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function serve() {
  const server = new Server({ name: 'viewport-wall', version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async req => {
    try { return await runTool(req.params.name, req.params.arguments || {}); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] }; }
  });
  await server.connect(new StdioServerTransport());
}

// ---------- CLI ----------
const HELP = `viewport-wall-mcp ${VERSION}

  viewport-wall-mcp                        run as an MCP server over stdio (what agents use)
  viewport-wall-mcp audit <url>            check a page across devices
  viewport-wall-mcp shot <url>             save screenshots
  viewport-wall-mcp breakpoints <url>      find the widths where layout changes
  viewport-wall-mcp devices [query]        list device ids

Options
  --devices a,b,390     device ids, set ids or widths      --full-page
  --json                machine-readable output            --out DIR       where shots are written (default .)
  --headed              show the browser                   --chrome PATH   Chrome executable
  --profile DIR         Chrome profile, keeps you logged in
  --connect URL         attach to a Chrome already running with --remote-debugging-port
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      if (['json', 'full-page', 'headed'].includes(k)) out.flags[k] = true;
      else out.flags[k] = argv[++i];
    } else out._.push(t);
  }
  return out;
}

async function cli(argv) {
  const { _: pos, flags } = parseArgs(argv);
  const [cmd, url] = pos;
  if (!cmd || flags.help || cmd === 'help') { console.log(HELP); return 0; }
  configure({ headed: !!flags.headed, chromePath: flags.chrome, profile: flags.profile, connect: flags.connect });
  const devices = flags.devices ? flags.devices.split(',').map(s => s.trim()).filter(Boolean) : null;
  if (cmd === 'devices') {
    const r = await runTool('list_devices', { query: url });
    console.log(r.content[0].text); return 0;
  }
  if (!url) { console.error(`Missing URL.\n\n${HELP}`); return 2; }
  if (cmd === 'audit') {
    const list = resolveDevices(devices || DEFAULT_DEVICES);
    const results = await audit(url, list, { fullPage: !!flags['full-page'] });
    if (flags.json) console.log(JSON.stringify({ url, results }, null, 2));
    else console.log(fmtAudit(url, results));
    return results.some(r => r.issues?.length) ? 1 : 0;   // non-zero exit when something is broken, so CI can use it
  }
  if (cmd === 'shot') {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const dir = flags.out || '.'; mkdirSync(dir, { recursive: true });
    const list = resolveDevices(devices || ['iphone-17-pro']);
    const written = [];
    for (const d of list) {
      const s = await shoot(url, d, { fullPage: !!flags['full-page'], format: 'png' });
      const f = `${dir}/${d.id}-${d.width}x${d.height}.png`;
      writeFileSync(f, Buffer.from(s.data, 'base64')); written.push(f);
    }
    console.log(flags.json ? JSON.stringify(written, null, 2) : written.join('\n'));
    return 0;
  }
  if (cmd === 'breakpoints') {
    const r = await breakpoints(url, { min: +(flags.min || 320), max: +(flags.max || 1600), step: +(flags.step || 16) });
    console.log(flags.json ? JSON.stringify(r, null, 2) : fmtBreakpoints(r));
    return 0;
  }
  console.error(`Unknown command "${cmd}".\n\n${HELP}`); return 2;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  configure({ chromePath: process.env.CHROME_PATH, profile: process.env.VIEWPORT_WALL_PROFILE, connect: process.env.VIEWPORT_WALL_CONNECT });
  serve().catch(e => { console.error(e); process.exit(1); });
} else {
  cli(args).then(async code => { await closeBrowser(); process.exit(code); }, async e => { console.error(String(e.message || e)); await closeBrowser(); process.exit(1); });
}
