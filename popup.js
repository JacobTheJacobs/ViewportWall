import { SETS, DEVICES } from './devices.js';

const urlEl = document.getElementById('url');
const setsEl = document.getElementById('sets');
let currentUrl = '';
let selectedSet = (await chrome.storage.local.get('lastSet')).lastSet || SETS[0].id;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab && tab.url && /^https?:/.test(tab.url)) currentUrl = tab.url;
urlEl.textContent = currentUrl || 'No web page in current tab';

const custom = (await chrome.storage.local.get('savedSets')).savedSets || [];
for (const s of [...SETS, ...custom]) {
  const l = document.createElement('label');
  const names = s.deviceIds.map(id => (DEVICES.find(d => d.id === id) || {}).name || id);
  l.innerHTML = `<input type="radio" name="set" value="${s.id}"> ${s.name} <span class="d">${s.deviceIds.length}</span>`;
  l.title = names.join(', ');
  l.querySelector('input').checked = s.id === selectedSet;
  l.querySelector('input').onchange = () => { selectedSet = s.id; chrome.storage.local.set({ lastSet: s.id }); };
  setsEl.appendChild(l);
}

document.getElementById('open').onclick = () =>
  chrome.runtime.sendMessage({ type: 'open-wall', url: currentUrl, set: selectedSet }, () => window.close());
document.getElementById('pick').onclick = () =>
  chrome.runtime.sendMessage({ type: 'open-wall', url: currentUrl, pick: true }, () => window.close());
