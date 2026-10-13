// Offscreen documents can't show a permission prompt, so the mic is granted
// once here, in a normal extension tab at the same origin.

const msg = document.getElementById('msg');
const btn = document.getElementById('allow');

async function request() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    msg.className = 'ok';
    msg.textContent = 'Done. Connecting you now…';
    btn.hidden = true;
    await chrome.runtime.sendMessage({ target: 'background', type: 'permission-granted' });
    const tab = await chrome.tabs.getCurrent();
    setTimeout(() => chrome.tabs.remove(tab.id), 800);
  } catch (err) {
    msg.textContent = err.name === 'NotAllowedError'
      ? 'Microphone was blocked. Click the icon in the address bar to allow it, then try again.'
      : `Couldn't open the microphone: ${err.message}`;
  }
}

btn.addEventListener('click', request);
request();
