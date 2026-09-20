"""The extension's bundle hook: Settings offers the MCP companion and copies a valid config."""
import asyncio, sys, json
from playwright.async_api import async_playwright
from _common import serve_site, launch, Checks

async def main():
    site = serve_site(8793); c = Checks()
    async with async_playwright() as p:
        ctx, ext = await launch(p, 'agent')
        page = ctx.pages[0]
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        await page.goto(f'chrome-extension://{ext}/wall.html?url={site}&set=essential-mobile&render=cdp')
        await page.wait_for_timeout(1200)
        if await page.is_visible('#onboard'): await page.click('#onboard [data-act=ok]')
        await page.wait_for_timeout(3000)
        await page.click('#settingsBtn'); await page.wait_for_timeout(300)
        c.ok('Settings offers the agent connection', await page.is_visible('#settingsPop [data-more=agent]'))
        await page.click('#settingsPop [data-more=agent]'); await page.wait_for_timeout(400)
        c.ok('dialog opens', await page.is_visible('#agentDlg'))
        cfg = await page.inner_text('#agentCfg')
        parsed = json.loads(cfg)
        srv = parsed['mcpServers']['viewport-wall']
        c.ok('config runs the single file with node, no package manager', srv['command'] == 'node' and srv['args'][0].endswith('viewport-wall-mcp.mjs'), cfg)
        get = await page.inner_text('#agentGet')
        c.ok('download command fetches the built file', 'curl' in get and get.rstrip().endswith('viewport-wall-mcp.mjs') and 'mcp/dist/' in get, get)
        await page.click('#agentDlg [data-agent=copy]'); await page.wait_for_timeout(400)
        clip = await page.evaluate('navigator.clipboard.readText()')
        c.ok('copy puts the config on the clipboard', json.loads(clip) == parsed, clip[:60])
        await page.click('#agentDlg [data-agent=copyGet]'); await page.wait_for_timeout(400)
        c.ok('copy puts the download on the clipboard', (await page.evaluate('navigator.clipboard.readText()')) == get, get[:60])
        await page.click('#agentDlg [data-agent=copyCli]'); await page.wait_for_timeout(400)
        clip = await page.evaluate('navigator.clipboard.readText()')
        c.ok('CLI copy is the claude command', clip.startswith('claude mcp add viewport-wall -- node'), clip)
        await page.click('#agentDlg [data-agent=close]'); await page.wait_for_timeout(300)
        c.ok('dialog closes', not await page.is_visible('#agentDlg'))
        await ctx.close()
    return c.summary()

sys.exit(asyncio.run(main()))
