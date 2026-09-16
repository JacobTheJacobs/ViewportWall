"""Builds the Chrome Web Store images from the real captures in marketing/raw/.
Output: docs/store-*.png (1280x800) and docs/promo-*.png, all 24-bit PNG without alpha as the store requires."""
import asyncio, os, base64, io
from PIL import Image
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'marketing', 'raw'); DOCS = os.path.join(ROOT, 'docs')
FONT = base64.b64encode(open(os.path.join(ROOT, 'fonts', 'Inter.woff2'), 'rb').read()).decode()
LOGO = '''<svg viewBox="0 0 40 40" width="{s}" height="{s}"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#4d8dff"/><stop offset=".6" stop-color="#2f6bff"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs>
<rect width="40" height="40" rx="9" fill="url(#lg)"/><rect x="11" y="9" width="18" height="22" rx="5" fill="none" stroke="#fff" stroke-width="2.5" opacity=".95"/>
<rect x="7" y="15" width="10" height="14" rx="4" fill="#3d7bff" stroke="#fff" stroke-width="2.5"/></svg>'''

def crop(name, box):
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB').crop(box)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=93)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode(), im.size

BASE_CSS = f'''
@font-face{{font-family:Inter;src:url(data:font/woff2;base64,{FONT}) format("woff2");font-weight:100 900}}
*{{margin:0;box-sizing:border-box}}
body{{font-family:Inter,system-ui,sans-serif;color:#fff;background:#07080d;overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}}
.bg{{position:absolute;inset:0;background:
  radial-gradient(45% 55% at 12% 0%,rgba(61,123,255,.55),transparent 70%),
  radial-gradient(40% 50% at 95% 10%,rgba(124,92,255,.45),transparent 70%),
  radial-gradient(60% 45% at 50% 110%,rgba(255,95,109,.22),transparent 70%)}}
.grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:40px 40px;-webkit-mask-image:radial-gradient(70% 60% at 50% 20%,#000,transparent)}}
h1{{font-weight:850;letter-spacing:-.045em;line-height:1.02}}
h1 em{{font-style:normal;background:linear-gradient(90deg,#6aa8ff,#9b7bff 55%,#ff7a9a);-webkit-background-clip:text;background-clip:text;color:transparent}}
.sub{{color:#a3acc2;font-weight:500;line-height:1.4}}
.win{{border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.14);
  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 50px 120px -30px rgba(0,0,0,.9),0 0 120px -40px rgba(80,120,255,.6)}}
.win img{{display:block;width:100%}}
.chip{{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
  font-size:15px;font-weight:600;color:#dfe5f3}}
.chip i{{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399}}
.copy{{z-index:2}}
.brand{{display:flex;align-items:center;gap:10px;font-weight:750;font-size:17px;color:#e8ecf6;letter-spacing:-.01em}}
'''

def stack(img, title, sub, chip, width=1150, top=56):
    return f'''<style>{BASE_CSS}
.head{{position:relative;text-align:center;padding-top:{top}px}}
.head .chip{{margin-bottom:18px}}
h1{{font-size:62px}} .sub{{font-size:22px;margin:14px auto 0;max-width:900px}}
.win{{position:absolute;left:50%;transform:translateX(-50%);top:{top + 250}px;width:{width}px}}
</style><div class="bg"></div><div class="grid"></div>
<div class="head"><span class="chip"><i></i>{chip}</span><h1>{title}</h1><p class="sub">{sub}</p></div>
<div class="win"><img src="{img}"></div>'''

def split(img, title, sub, chip, img_w=700, img_left=520, img_top=70):
    return f'''<style>{BASE_CSS}
.copy{{position:absolute;left:64px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:20px}}
h1{{font-size:60px}} .sub{{font-size:21px}}
.win{{position:absolute;left:{img_left}px;top:{img_top}px;width:{img_w}px}}
</style><div class="bg"></div><div class="grid"></div>
<div class="copy"><span class="chip" style="align-self:flex-start"><i></i>{chip}</span><h1>{title}</h1><p class="sub">{sub}</p></div>
<div class="win"><img src="{img}"></div>'''

async def render(pg, html, w, h, out):
    await pg.set_viewport_size({'width': w, 'height': h})
    await pg.set_content(html); await pg.wait_for_timeout(500)
    path = os.path.join(DOCS, out)
    await pg.screenshot(path=path, clip={'x': 0, 'y': 0, 'width': w, 'height': h})
    Image.open(path).convert('RGB').resize((w, h), Image.LANCZOS).save(path, optimize=True)
    print(out, Image.open(path).size, Image.open(path).mode)

async def main():
    hero, _ = crop('hero', (0, 0, 3920, 1870))
    sync, _ = crop('sync', (0, 0, 3200, 1830))
    devices, _ = crop('devices', (700, 120, 2500, 1840))
    fold, _ = crop('fold', (0, 0, 2690, 1830))
    screens, _ = crop('screens', (250, 150, 2950, 1840))
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, channel='chromium')
        pg = await b.new_page(device_scale_factor=2)
        await render(pg, stack(hero, 'Every screen. <em>One tab.</em>',
            'See your site on phones, foldables, tablets and laptops at the same time.', 'Live, not screenshots', width=1180), 1280, 800, 'store-1-hero.png')
        await render(pg, stack(sync, 'Scroll one. <em>They all follow.</em>',
            'Navigation, scrolling, clicks and typing stay in sync across every device.', 'Sync on', width=1100), 1280, 800, 'store-2-sync.png')
        await render(pg, split(fold, 'Foldables, <em>open and closed.</em>',
            'Galaxy Z Fold, Z Flip, Pixel Fold and Razr. Both screens, same page, side by side.', 'Fold in place', img_w=700, img_left=545, img_top=162), 1280, 800, 'store-3-fold.png')
        await render(pg, stack(screens, 'From watch <em>to 4K TV.</em>',
            '57 device profiles with real viewport size, pixel density and touch.', 'Phones · Tablets · PCs · Watches · TVs', width=1060), 1280, 800, 'store-4-screens.png')
        await render(pg, split(devices, 'Add any device <em>in two clicks.</em>',
            'Pick from the library, apply a whole set, or save your own custom size.', 'Device library', img_w=610, img_left=610, img_top=108), 1280, 800, 'store-5-devices.png')
        # promo tiles
        marquee = f'''<style>{BASE_CSS}
.copy{{position:absolute;left:70px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:18px}}
.brand{{font-size:22px}} h1{{font-size:64px}} .sub{{font-size:22px}}
.win{{position:absolute;left:640px;top:70px;width:900px}}
</style><div class="bg"></div><div class="grid"></div>
<div class="copy"><div class="brand">{LOGO.format(s=40)}Viewport Wall</div><h1>Every screen.<br><em>One tab.</em></h1><p class="sub">Live, synced device previews for any website.</p></div>
<div class="win"><img src="{hero}"></div>'''
        await render(pg, marquee, 1400, 560, 'promo-1400x560.png')
        small = f'''<style>{BASE_CSS}
.copy{{position:absolute;left:26px;top:0;bottom:0;width:250px;display:flex;flex-direction:column;justify-content:center;gap:10px}}
.brand{{font-size:14px;gap:8px}} h1{{font-size:30px}}
.win{{position:absolute;left:262px;top:44px;width:320px;border-radius:10px}}
</style><div class="bg"></div><div class="grid"></div>
<div class="copy"><div class="brand">{LOGO.format(s=26)}Viewport Wall</div><h1>Every screen.<br><em>One tab.</em></h1></div>
<div class="win"><img src="{sync}"></div>'''
        await render(pg, small, 440, 280, 'promo-440x280.png')
        await b.close()

asyncio.run(main())
