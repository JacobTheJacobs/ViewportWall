# viewport-wall-mcp

Let an AI agent check any page for responsive layout bugs across real device viewports.

An MCP server and a CLI over the same engine. It drives the Chrome you already have, so there is no server to
run, no browser download and no API key. It is the agent-facing half of
[Viewport Wall](https://chromewebstore.google.com/detail/viewport-wall/famamjgffefkajiifeigbfgmmbgnkdmn),
the Chrome extension that shows the same devices to a human.

## Connect an agent

Add this to your MCP client's config. Nothing is installed up front: `npx` fetches the package the first time
the agent calls a tool, and the client starts and stops it.

```json
{
  "mcpServers": {
    "viewport-wall": { "command": "npx", "args": ["-y", "viewport-wall-mcp"] }
  }
}
```

- **Claude Code**: `claude mcp add viewport-wall -- npx -y viewport-wall-mcp`
- **Claude Desktop**: Settings → Developer → Edit Config, then paste the block above.
- **Cursor, Windsurf, Zed, Cline**: same block in their MCP settings file.

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
npx viewport-wall-mcp audit https://example.com --devices popular-mobile,1440
npx viewport-wall-mcp audit https://example.com --json          # machine readable, exits 1 if anything is broken
npx viewport-wall-mcp shot https://example.com --devices iphone-17-pro --out ./shots --full-page
npx viewport-wall-mcp breakpoints https://example.com
npx viewport-wall-mcp devices pixel
```

## Pages behind a login, and localhost

Both work, because the browser is yours.

```bash
# reuse a Chrome profile, so whatever that profile is logged into stays logged in
npx viewport-wall-mcp audit https://app.internal/dashboard --profile ~/.config/viewport-wall

# or attach to a Chrome you already started
google-chrome --remote-debugging-port=9222
npx viewport-wall-mcp audit http://localhost:3000 --connect http://127.0.0.1:9222
```

In MCP config, the same two options are the env vars `VIEWPORT_WALL_PROFILE` and `VIEWPORT_WALL_CONNECT`.
`CHROME_PATH` points at a specific Chrome if the automatic search picks the wrong one.

## Devices

57 profiles: phones, foldables in both open and closed states, tablets, laptops, desktops, ultrawides, watches
and TVs, each with its real viewport size, pixel density and touch flag. Sets like `popular-mobile`,
`foldables` or `all-screens` expand to several devices, and any plain number is treated as a width.

## Requirements

Node 18 or newer, and Google Chrome, Chromium or Edge installed. Nothing else.

## Licence

MIT
