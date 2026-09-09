// Fallback launcher: Chrome may still show this popup from a stale manifest. It just opens the wall and closes.
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  chrome.runtime.sendMessage({ type: 'open-wall', url: tab && /^(https?|file):\/\//i.test(tab.url || '') ? tab.url : '' }).finally(() => window.close());
});
