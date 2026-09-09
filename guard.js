// Loaded before the app: if the module fails to start, say so instead of leaving an empty wall.
window.addEventListener('error', e => {
  if (document.getElementById('fatal')) return;
  const d = document.createElement('div'); d.id = 'fatal';
  d.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);max-width:560px;padding:20px 24px;border-radius:14px;background:#2a1717;color:#ffd4d4;font:14px/1.5 system-ui;z-index:999;box-shadow:0 20px 60px rgba(0,0,0,.6)';
  d.innerHTML = '<b style="font-size:16px">Viewport Wall could not start</b><br>Reload the extension at <code>chrome://extensions</code> (its files changed since Chrome loaded it), then reopen this tab.<br><span style="opacity:.7;font-size:12px">' + String(e.message || e.error || '').replace(/</g, '&lt;') + '</span>';
  document.body.appendChild(d);
}, true);
