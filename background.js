// Service worker: routes messages between the in-page widgets (content.js)
// and the offscreen document that owns the microphone and the WebRTC call.

const SITE_URLS = [
  'https://www.chess.com/*',
  'https://chess.com/*',
  'https://lichess.org/*',
];
const IDLE = { status: 'idle' };

let creating = null;

async function hasOffscreen() {
  return chrome.offscreen.hasDocument();
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Voice chat with your chess opponent',
    })
    .finally(() => { creating = null; });
  await creating;
}

function toOffscreen(msg) {
  // `target` goes last: messages forwarded from content scripts still carry
  // target: 'background', and spreading them after would silently override it.
  return chrome.runtime.sendMessage({ ...msg, target: 'offscreen' }).catch(() => null);
}

async function currentState() {
  if (!(await hasOffscreen())) return IDLE;
  return (await toOffscreen({ type: 'getState' })) ?? IDLE;
}

async function toTabs(msg) {
  const tabs = await chrome.tabs.query({ url: SITE_URLS });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  }
}

const broadcast = (state) => toTabs({ type: 'state', state });

async function join({ room, label, name }) {
  await chrome.storage.session.set({ pendingJoin: { room, label, name } });
  await ensureOffscreen();
  await toOffscreen({ type: 'join', room, label, name });
}

async function leave() {
  await chrome.storage.session.remove('pendingJoin');
  if (await hasOffscreen()) {
    await toOffscreen({ type: 'leave' });
    await chrome.offscreen.closeDocument().catch(() => {});
  }
  await broadcast(IDLE);
}

async function openPermissionPage() {
  const url = chrome.runtime.getURL('permission.html');
  const [existing] = await chrome.tabs.query({ url });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function handle(msg) {
  switch (msg.type) {
    case 'join':
      return join(msg);
    case 'leave':
      return leave();
    case 'mute':
    case 'deafen':
    case 'volume':
      return toOffscreen(msg);
    case 'getState':
      return currentState();
    case 'state':
      // Pushed by the offscreen document whenever the call state changes.
      if (msg.state.status === 'needs-permission') await openPermissionPage();
      return broadcast(msg.state);
    case 'levels':
      // Mic level + "opponent is speaking", pushed only when they change.
      return toTabs({ type: 'levels', levels: msg.levels });
    case 'permission-granted': {
      const { pendingJoin } = await chrome.storage.session.get('pendingJoin');
      if (pendingJoin) await join(pendingJoin);
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return;
  handle(msg).then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true; // keep the channel open for the async response
});

