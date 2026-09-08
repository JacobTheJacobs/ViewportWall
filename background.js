// Service worker: opens the wall, cleans up device windows when a wall tab closes.

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'open-wall') {
    const params = new URLSearchParams();
    if (msg.url) params.set('url', msg.url);
    if (msg.set) params.set('set', msg.set);
    if (msg.pick) params.set('pick', '1');
    chrome.tabs.create({ url: chrome.runtime.getURL('wall.html?' + params.toString()) });
    respond({ ok: true });
  }
  if (msg.type === 'register-window' && sender.tab) {
    chrome.storage.session.get('walls').then(({ walls = {} }) => {
      walls[sender.tab.id] = msg.windowId;
      return chrome.storage.session.set({ walls });
    }).then(() => respond({ ok: true }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { walls = {} } = await chrome.storage.session.get('walls');
  const windowId = walls[tabId];
  if (windowId == null) return;
  delete walls[tabId];
  await chrome.storage.session.set({ walls });
  try { await chrome.windows.remove(windowId); } catch {}
});
