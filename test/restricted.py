"""Chrome refuses to let extensions open the Chrome Web Store. The wall must say so instead of showing raw errors."""
import asyncio, sys
from playwright.async_api import async_playwright
from _common import serve_site, launch, Checks

STORE = 'https://chromewebstore.google.com/detail/viewport-wall/famamjgffefkajiifeigbfgmmbgnkdmn'

async def main():
    site = serve_site(8792); c = Checks()
    async with async_playwright() as p:
        ctx, ext = await launch(p, 'restricted')
        page = ctx.pages[0]
        await page.goto(f'chrome-extension://{ext}/wall.html?url={site}&set=essential-mobile&render=cdp'); await page.wait_for_timeout(1200)
        if await page.is_visible('#onboard'): await page.click('#onboard [data-act=ok]')
        await page.wait_for_timeout(6000)
        await page.fill('#url', STORE); await page.press('#url', 'Enter'); await page.wait_for_timeout(2500)
        st = await page.evaluate('({url:__vwState.url,errs:__vwState.devices.filter(d=>d.status==="error").length,toast:document.getElementById("toast").textContent,bar:document.getElementById("url").value})')
        c.ok('typed store URL: no device errors', st['errs'] == 0, st)
        c.ok('typed store URL: wall stays on its page', st['url'].startswith(site), st['url'])
        c.ok('typed store URL: explains why', 'Chrome Web Store' in st['toast'], st['toast'])
        c.ok('typed store URL: address bar restored', st['bar'].startswith(site), st['bar'])
        await page.close()
        page = await ctx.new_page()
        await page.goto(f'chrome-extension://{ext}/wall.html?url={STORE}&render=cdp'); await page.wait_for_timeout(9000)
        st = await page.evaluate('({url:__vwState.url,errs:__vwState.devices.filter(d=>d.status==="error").map(d=>d.error),toast:document.getElementById("toast").textContent})')
        c.ok('opened on store page: falls back to last page', st['url'].startswith(site), st)
        c.ok('opened on store page: no "Not allowed" errors', not st['errs'], st['errs'])
        c.ok('opened on store page: explains why', 'Chrome Web Store' in st['toast'], st['toast'])
        cl = await page.evaluate('import("./core.js").then(m=>m.classifyError(\'{"code":-32000,"message":"Not allowed"}\'))')
        c.ok('"Not allowed" reads as a sentence', cl['title'] == 'Chrome blocks this page' and 'code' not in cl['msg'], cl)
        await ctx.close()
    return c.summary()

sys.exit(asyncio.run(main()))
