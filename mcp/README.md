# viewport-wall-mcp

Let an AI agent check any page for responsive layout bugs across real device viewports.

An MCP server and a CLI over the same engine. It drives the Chrome you already have, so there is no server to
run, no browser download and no API key. It is the agent-facing half of
[Viewport Wall](https://chromewebstore.google.com/detail/viewport-wall/famamjgffefkajiifeigbfgmmbgnkdmn),
the Chrome extension that shows the same devices to a human.

## Connect an agent

No package manager, no registry, no server. The whole thing is one file that needs Node 22 or newer and the
Chrome you already have.

```bash
mkdir -p ~/.local/bin
curl -fsSL https://raw.githubusercontent.com/JacobTheJacobs/ViewportWall/master/mcp/dist/viewport-wall-mcp.mjs -o ~/.local/bin/viewport-wall-mcp.mjs
```

Then point your agent at it:

```json
{
  "mcpServers": {
    "viewport-wall": { "command": "node", "args": ["/home/you/.local/bin/viewport-wall-mcp.mjs"] }
  }
}
```

- **Claude Code**: `claude mcp add viewport-wall -- node ~/.local/bin/viewport-wall-mcp.mjs`
- **Claude Desktop**: Settings → Developer → Edit Config, then paste the block above with an absolute path.
- **Cursor, Windsurf, Zed, Cline**: same block in their MCP settings file.

The Viewport Wall extension has the same two snippets under Settings → Connect your AI agent, with a copy button.

### Other ways to run it

```bash
git clone https://github.com/JacobTheJacobs/ViewportWall && node ViewportWall/mcp/src/index.mjs   # from a checkout
npx -y viewport-wall-mcp                                                                          # if published to npm
```

Both are the same code: `dist/viewport-wall-mcp.mjs` is `src/` inlined into one file by `node build.mjs`.

## Tools

| Tool | What the agent gets |
| --- | --- |
| `audit_responsive` | Every layout problem per device, each naming the element that caused it |
| `screenshot` | Pictures of the page at chosen devices, so the model can judge with its own eyes |
| `find_breakpoints` | The widths a page declares in CSS, plus the widths where layout is observed to change |
| `list_devices` | The device library: 57 profiles, named sets, common widths |

`audit_responsive` returns text by default. Screenshots are opt-in because a wall of images eats an agent's
context; the usual flow is audit first, then a screenshot of whatever failed.

## What it checks

- Horizontal overflow, and which element causes the page to scroll sideways
- Fixed or sticky elements wider than the viewport, which can never be scrolled into view
- Text clipped by a box that hides it (a container that scrolls on purpose is not reported)
- Images wider than the screen
- Tap targets under 44px, on touch devices only
- Text under 12px, on touch devices only
- A missing `<meta name="viewport">` tag

Rules catch structural breakage, not taste. For "does this look right", ask for a screenshot.

## CLI

The same engine without MCP, for agents that can only run shell commands, and for CI.

```bash
node viewport-wall-mcp.mjs audit https://example.com --devices popular-mobile,1440
node viewport-wall-mcp.mjs audit https://example.com --json     # machine readable, exits 1 if anything is broken
node viewport-wall-mcp.mjs shot https://example.com --devices iphone-17-pro --out ./shots --full-page
node viewport-wall-mcp.mjs breakpoints https://example.com
node viewport-wall-mcp.mjs devices pixel
```

## Pages behind a login, and localhost

Both work, because the browser is yours.

```bash
# reuse a Chrome profile, so whatever that profile is logged into stays logged in
node viewport-wall-mcp.mjs audit https://app.internal/dashboard --profile ~/.config/viewport-wall

# or attach to a Chrome you already started
google-chrome --remote-debugging-port=9222
node viewport-wall-mcp.mjs audit http://localhost:3000 --connect http://127.0.0.1:9222
```

In MCP config, the same two options are the env vars `VIEWPORT_WALL_PROFILE` and `VIEWPORT_WALL_CONNECT`.
`CHROME_PATH` points at a specific Chrome if the automatic search picks the wrong one.

## Devices

57 profiles: phones, foldables in both open and closed states, tablets, laptops, desktops, ultrawides, watches
and TVs, each with its real viewport size, pixel density and touch flag. Sets like `popular-mobile`,
`foldables` or `all-screens` expand to several devices, and any plain number is treated as a width.

## Requirements

Node 22 or newer, and Google Chrome, Chromium or Edge installed. Nothing else: no npm install, no dependencies,
no browser download. Node 22 is the floor because the server talks to Chrome over Node's built-in WebSocket.

## Licence

MIT
