// Service worker: opens the wall, closes the device tab group when a wall tab closes.

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'open-wall') { openWall(msg.url || ''); respond({ ok: true }); }
  if (msg.type === 'register-group' && sender.tab) {
    chrome.storage.session.get('walls').then(({ walls = {} }) => {
      walls[sender.tab.id] = msg.groupId;
      return chrome.storage.session.set({ walls });
    }).then(() => respond({ ok: true }));
    return true;
  }
  return false;
});

// Toolbar icon: open the wall for the current page (reusing an open wall tab), no popup.
async function openWall(url) {
  const wallUrl = chrome.runtime.getURL('wall.html');
  const open = (await chrome.tabs.query({ url: wallUrl + '*' }))[0];
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    if (url) chrome.tabs.sendMessage(open.id, { type: 'navigate', url }).catch(() => {});
    return;
  }
  const params = new URLSearchParams(); if (url) params.set('url', url);
  chrome.tabs.create({ url: wallUrl + '?' + params.toString() });
}
chrome.action.onClicked.addListener(tab => openWall(tab && /^(https?|file):\/\//i.test(tab.url || '') ? tab.url : ''));

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { walls = {} } = await chrome.storage.session.get('walls');
  const groupId = walls[tabId];
  if (groupId == null) return;
  delete walls[tabId];
  await chrome.storage.session.set({ walls });
  try { const tabs = await chrome.tabs.query({ groupId }); await chrome.tabs.remove(tabs.map(t => t.id)); } catch {}
});
