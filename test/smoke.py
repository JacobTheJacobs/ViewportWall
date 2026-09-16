"""Smoke check: the extension loads, five devices render and stay in scroll sync, no page errors.
Usage: python3 test/smoke.py [path-to-unpacked-extension]   (defaults to this repo; pass an unzipped store build to test it)"""
import asyncio, sys
from playwright.async_api import async_playwright
from _common import EXT, serve_site, launch, Checks

async def main():
    ext = sys.argv[1] if len(sys.argv) > 1 else EXT
    site = serve_site(8791); c = Checks()
    async with async_playwright() as p:
        ctx, ext_id = await launch(p, 'smoke', ext)
        page = ctx.pages[0]; errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await page.goto(f'chrome-extension://{ext_id}/wall.html?url={site}&set=popular-mobile&render=cdp')
        await page.wait_for_timeout(1200)
        if await page.is_visible('#onboard'): await page.click('#onboard [data-act=ok]')
        await page.wait_for_timeout(9000)
        mf = await page.evaluate('chrome.runtime.getManifest()')
        c.ok('manifest loads', bool(mf.get('version')), mf.get('version'))
        panels = await page.evaluate('[...document.querySelectorAll(".panel")].map(p=>({c:p.className,img:p.querySelector("img").src.length}))')
        c.ok('5 devices mounted', len(panels) == 5, len(panels))
        c.ok('every device rendered a frame', all(x['img'] > 2000 for x in panels), [x['img'] for x in panels])
        c.ok('every device ready', all('ready' in x['c'] for x in panels), [x['c'] for x in panels])
        c.ok('font loaded', await page.evaluate('document.fonts.check("14px Inter")'))
        tabs = [pg for pg in ctx.pages if pg.url.startswith(site)]
        box = await (await page.query_selector('.panel.active .viewport')).bounding_box()
        await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        await page.mouse.wheel(0, 900); await page.wait_for_timeout(1500)
        r = [round(await pg.evaluate('scrollY/(document.documentElement.scrollHeight-innerHeight)'), 2) for pg in tabs]
        c.ok('scroll sync', max(r) > 0.05 and max(r) - min(r) < 0.15, r)
        c.ok('no page errors', not errs, errs[:3])
        await ctx.close()
    return c.summary()

sys.exit(asyncio.run(main()))
