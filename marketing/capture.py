"""Captures the real extension, running headless, showing the fictional Lumen demo site.
Raw 2x captures go to marketing/raw/; compose.py turns them into store images.
Usage: python3 marketing/capture.py [shot-name ...]"""
import asyncio, os, sys, shutil, tempfile, http.server, socketserver, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'marketing', 'raw'); os.makedirs(RAW, exist_ok=True)
PORT = 8795
HOST = 'lumen-analytics.com'          # fictional; mapped to the local server so device bars show a real-looking domain
SITE = f'http://{HOST}/'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def translate_path(self, path):
        if path.split('?')[0] in ('/', '/index.html'): path = '/marketing/demo-site/index.html'
        return super().translate_path(path)
    def log_message(self, *a): pass

def serve():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

async def open_wall(p, ids, size, theme='dark', zoom=None, frames='realistic'):
    prof = os.path.join(tempfile.gettempdir(), 'vw-marketing-profile'); shutil.rmtree(prof, ignore_errors=True)
    ctx = await p.chromium.launch_persistent_context(prof, headless=True, channel='chromium',
        args=[f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}', f'--host-resolver-rules=MAP {HOST} 127.0.0.1:{PORT}', '--hide-scrollbars'],
        viewport={'width': size[0], 'height': size[1]}, device_scale_factor=2)
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    ext = sw.url.split('/')[2]
    page = ctx.pages[0]
    await page.goto(f'chrome-extension://{ext}/wall.html?url={SITE}&pick=1&render=cdp')
    await page.wait_for_timeout(1000)
    if await page.is_visible('#onboard'): await page.click('#onboard [data-act=ok]')
    await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
    await page.evaluate('([t,f])=>{__vwState.layout.theme=t;__vwState.layout.frames=f;__vwState.layout.frameStyle=f;document.documentElement.dataset.theme=t}', [theme, frames])
    await page.evaluate('ids=>__vwAdd(ids)', ids)
    await page.wait_for_timeout(9000)
    if zoom: await page.evaluate('z=>{__vwState.layout.zoom=z;__vwUi.relayout()}', zoom)
    await page.wait_for_timeout(1500)
    return ctx, page

async def scroll_active(page, dy, steps=8):
    box = await (await page.query_selector('.panel.active .viewport')).bounding_box()
    await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    for _ in range(steps): await page.mouse.wheel(0, dy / steps); await page.wait_for_timeout(60)
    await page.wait_for_timeout(2500)
    await page.mouse.move(5, 5)

async def shot(page, name):
    await page.wait_for_timeout(600)
    await page.screenshot(path=os.path.join(RAW, name + '.png'))
    print('captured', name)

SHOTS = {}
def register(fn): SHOTS[fn.__name__] = fn; return fn

@register
async def hero(p):
    ctx, page = await open_wall(p, ['iphone-17-pro', 'galaxy-z-fold', 'ipad-pro-11', 'macbook-air'], (1960, 1000))
    await shot(page, 'hero'); await ctx.close()

@register
async def sync(p):
    ctx, page = await open_wall(p, ['iphone-17-pro', 'pixel-10', 'galaxy-s26', 'iphone-se', 'galaxy-z-flip'], (1600, 1000))
    await scroll_active(page, 520)
    await page.wait_for_timeout(5000)   # let every synced device settle before the frame is taken
    await shot(page, 'sync'); await ctx.close()

@register
async def devices(p):
    ctx, page = await open_wall(p, ['iphone-17-pro', 'ipad-pro-11', 'macbook-air'], (1600, 1000))
    await page.click('#add'); await page.wait_for_timeout(600)
    for pid in ['apple-watch-s10', 'pixel-10', 'iphone-17-pro-max', 'ipad-mini']:
        await page.click(f'#groups [data-pick="{pid}"]')
    await page.evaluate('document.querySelector("#groups").closest("[class*=scroll], .pal-body, #groups").scrollTop=0; document.querySelectorAll("#picker *").forEach(e=>{if(e.scrollTop)e.scrollTop=0})')
    await page.mouse.move(5, 5)
    await page.wait_for_timeout(500)
    await shot(page, 'devices'); await ctx.close()

@register
async def fold(p):
    ctx, page = await open_wall(p, ['galaxy-z-fold-closed', 'galaxy-z-fold', 'galaxy-z-flip-cover', 'galaxy-z-flip'], (1600, 1000))
    await shot(page, 'fold'); await ctx.close()

@register
async def screens(p):
    ctx, page = await open_wall(p, ['apple-watch-s10', 'iphone-17-pro', 'galaxy-z-fold', 'ipad-pro-11', 'macbook-air', 'tv-4k'], (1600, 1000), zoom='fit')
    await shot(page, 'screens'); await ctx.close()

async def main():
    serve()
    names = sys.argv[1:] or list(SHOTS)
    async with async_playwright() as p:
        for n in names: await SHOTS[n](p)

asyncio.run(main())
