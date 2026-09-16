"""Shared setup for the headless checks: loads the extension from this repo into a throwaway Chromium profile."""
import os, shutil, tempfile, http.server, socketserver, threading, functools
EXT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(tempfile.gettempdir(), 'viewport-wall-tests')
os.makedirs(TMP, exist_ok=True)

def serve_site(port):
    site = os.path.join(TMP, 'site'); os.makedirs(site, exist_ok=True)
    with open(os.path.join(site, 'index.html'), 'w') as f:
        f.write('<!doctype html><meta name=viewport content="width=device-width"><title>T</title>'
                '<style>body{font:16px sans-serif;margin:0}h1{background:#123;color:#fff;padding:40px}p{padding:20px}</style>'
                '<h1>Hello</h1>' + '<p>Line of content for scrolling.</p>' * 40)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=site)
    handler.log_message = lambda *a: None
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{port}/'

async def launch(p, name, ext=EXT):
    prof = os.path.join(TMP, 'profile-' + name); shutil.rmtree(prof, ignore_errors=True)
    ctx = await p.chromium.launch_persistent_context(prof, headless=True, channel='chromium',
        args=[f'--disable-extensions-except={ext}', f'--load-extension={ext}'], viewport={'width': 1500, 'height': 950})
    sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
    return ctx, sw.url.split('/')[2]

class Checks:
    def __init__(self): self.failed = []
    def ok(self, name, cond, detail=None):
        print(('PASS ' if cond else 'FAIL ') + name + ('' if cond or detail is None else f' — {detail}'))
        if not cond: self.failed.append(name)
    def summary(self):
        print('SUMMARY:', 'all passed' if not self.failed else f'{len(self.failed)} failed: {self.failed}')
        return 1 if self.failed else 0
