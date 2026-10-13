// Owns the microphone and the peer-to-peer call. Lives at the extension's
// origin, so the mic permission is granted once for the extension rather than
// per site, and the call survives page navigations (e.g. rematch → new URL).
//
// Rooms: both players derive the same room key from the game ID. The first to
// arrive registers peer ID `<prefix>-<key>-a` on the PeerJS broker and waits;
// the second finds that ID taken, registers `-b`, and calls `-a`.
//
// Alongside the audio call, the two sides open a small data channel to swap
// usernames and mute status.

const PREFIX = 'chessvoice';
const RETRY_MS = 3000;
const ICE_GRACE_MS = 6000;
const LEVEL_TICK_MS = 100;
const SPEAKING_RMS = 0.02; // ≈ -34 dBFS; above this counts as talking
const SPEAKING_HOLD_MS = 350; // bridge the gaps between words

const audio = document.getElementById('remote');

let state = { status: 'idle', muted: false, deafened: false, volume: 1, peer: null };
let session = 0; // bumps on every join/leave so stale callbacks can bail out
let peer = null;
let call = null;
let endCall = null; // ends the current call attempt, connected or not
let data = null;
let localStream = null;
let myName = null;
let retryTimer = null;
let iceTimer = null;

function setState(patch) {
  state = { ...state, ...patch };
  chrome.runtime.sendMessage({ target: 'background', type: 'state', state }).catch(() => {});
}

function peerId(key, slot) {
  return `${PREFIX}-${key}-${slot}`;
}

function clearTimers() {
  clearTimeout(retryTimer);
  clearTimeout(iceTimer);
  retryTimer = iceTimer = null;
}

function teardown() {
  session++;
  clearTimers();
  stopLevels();
  data?.close();
  data = null;
  call?.close();
  call = endCall = null;
  peer?.destroy();
  peer = null;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  audio.srcObject = null;
}

async function join(room, label, name) {
  teardown();
  const mySession = session;
  myName = name || null;
  setState({ status: 'mic', room: label, error: null, peer: null });

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    if (mySession !== session) return;
    setState({ status: err.name === 'NotAllowedError' ? 'needs-permission' : 'error', error: err.message });
    return;
  }
  if (mySession !== session) return;

  applyMute();
  startLevels();
  claim(room, 'a', mySession, 0);
}

function claim(key, slot, mySession, fullRetries) {
  setState({ status: 'connecting' });
  const p = new Peer(peerId(key, slot));
  peer = p;

  p.on('open', () => {
    if (mySession !== session) return;
    setState({ status: 'waiting', slot });
    if (slot === 'b') callHost(key, mySession);
  });

  p.on('call', (incoming) => {
    if (mySession !== session) return;
    if (call) { incoming.close(); return; } // two-person rooms only
    incoming.answer(localStream);
    attach(incoming, key, slot, mySession);
  });

  p.on('connection', (conn) => {
    if (mySession !== session) return;
    openData(conn, mySession);
  });

  p.on('error', (err) => {
    if (mySession !== session) return;
    switch (err.type) {
      case 'unavailable-id':
        p.destroy();
        if (slot === 'a') return claim(key, 'b', mySession, fullRetries);
        // Both slots taken. Often it's a ghost of someone who just left that
        // the broker hasn't released yet, so try a couple more times.
        if (fullRetries < 2) {
          retryTimer = setTimeout(() => claim(key, 'a', mySession, fullRetries + 1), RETRY_MS);
          return;
        }
        return setState({ status: 'full' });
      case 'peer-unavailable':
        // We're slot b and the host isn't online (yet / any more). PeerJS
        // leaves the failed call object dangling, so end it explicitly or the
        // `if (call)` guard in callHost would block every retry.
        if (state.status === 'connected') return;
        endCall?.();
        return retryHost(key, mySession);
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        return setState({ status: 'error', error: 'Could not reach the signaling server.' });
      default:
        return setState({ status: 'error', error: err.message });
    }
  });

  p.on('disconnected', () => {
    // Lost the signaling socket. An established call keeps working without it,
    // but we need it to reconnect later, so try to get it back.
    if (mySession === session && !p.destroyed) p.reconnect();
  });
}

// Idempotent: several failure paths can fire for one attempt, but only one
// retry should ever be pending.
function retryHost(key, mySession) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => callHost(key, mySession), RETRY_MS);
}

function callHost(key, mySession) {
  if (mySession !== session || call || !peer || peer.destroyed) return;
  const c = peer.call(peerId(key, 'a'), localStream);
  if (c) attach(c, key, 'b', mySession);
}

function attach(c, key, slot, mySession) {
  call = c;
  let ended = false;
  let connected = false;

  const end = () => {
    if (ended || mySession !== session) return;
    ended = true;
    clearTimeout(iceTimer);
    if (call === c) call = endCall = null;
    c.close();
    data?.close();
    data = null;
    audio.srcObject = null;
    setRemoteMeter(null);
    if (connected) chime(false);
    setState({ status: 'waiting', peer: null });
    if (slot === 'b') retryHost(key, mySession);
  };
  endCall = end;

  c.on('stream', (remote) => {
    if (mySession !== session || connected) return;
    connected = true;
    audio.srcObject = remote;
    applyMute();
    audio.play().catch(() => {});
    setRemoteMeter(remote);
    chime(true);
    setState({ status: 'connected' });
    // The caller opens the data channel once it knows the host is really
    // there; opening it earlier would fail and double up the retries.
    if (slot === 'b' && !data) {
      openData(peer.connect(peerId(key, 'a'), { serialization: 'json', reliable: true }), mySession);
    }
  });
  c.on('close', end);
  c.on('error', end);

  // PeerJS doesn't reliably fire 'close' when the other side just vanishes
  // (tab closed, network dropped), so watch the ICE state directly.
  const pc = c.peerConnection;
  pc?.addEventListener('iceconnectionstatechange', () => {
    const s = pc.iceConnectionState;
    clearTimeout(iceTimer);
    if (s === 'failed' || s === 'closed') return end();
    if (s === 'disconnected') {
      setState({ status: 'reconnecting' });
      iceTimer = setTimeout(end, ICE_GRACE_MS);
    } else if (s === 'connected' || s === 'completed') {
      if (connected) setState({ status: 'connected' });
    }
  });
}

// ---------- data channel: names + mute status ----------

function openData(conn, mySession) {
  if (!conn) return;
  if (data && data !== conn) { conn.close(); return; }
  data = conn;
  conn.on('open', () => {
    if (mySession !== session || data !== conn) return;
    conn.send({ type: 'hello', name: myName, muted: state.muted });
  });
  conn.on('data', (msg) => {
    if (mySession !== session || data !== conn || !msg) return;
    if (msg.type === 'hello') {
      setState({ peer: { name: cleanName(msg.name), muted: !!msg.muted } });
    } else if (msg.type === 'mute') {
      setState({ peer: { ...state.peer, muted: !!msg.muted } });
    }
  });
  conn.on('close', () => { if (data === conn) data = null; });
}

function cleanName(name) {
  if (typeof name !== 'string') return null;
  return name.replace(/[^\w.-]/g, '').slice(0, 30) || null;
}

function sendData(msg) {
  if (data?.open) data.send(msg);
}

// ---------- audio levels ----------

let audioCtx = null;
let micMeter = null;
let remoteMeter = null;
let levelTimer = null;
let lastLoudAt = 0;
let lastLevels = '';

function ctx() {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function makeMeter(stream) {
  const source = ctx().createMediaStreamSource(stream);
  const analyser = ctx().createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser); // analysis only; playback goes through <audio>
  return { source, analyser, buf: new Float32Array(analyser.fftSize) };
}

function rms(meter) {
  if (!meter) return 0;
  meter.analyser.getFloatTimeDomainData(meter.buf);
  let sum = 0;
  for (const v of meter.buf) sum += v * v;
  return Math.sqrt(sum / meter.buf.length);
}

function setRemoteMeter(stream) {
  remoteMeter?.source.disconnect();
  remoteMeter = stream ? makeMeter(stream) : null;
}

function startLevels() {
  micMeter = makeMeter(localStream);
  levelTimer = setInterval(tickLevels, LEVEL_TICK_MS);
}

function stopLevels() {
  clearInterval(levelTimer);
  levelTimer = null;
  micMeter?.source.disconnect();
  micMeter = null;
  setRemoteMeter(null);
  pushLevels({ mic: 0, speaking: false });
}

function tickLevels() {
  // Mic: map roughly -60…-15 dBFS onto 0…5 bars.
  const r = state.muted ? 0 : rms(micMeter);
  const db = r > 0 ? 20 * Math.log10(r) : -100;
  const mic = Math.max(0, Math.min(5, Math.round((db + 60) / 9)));

  const now = performance.now();
  if (rms(remoteMeter) > SPEAKING_RMS) lastLoudAt = now;
  const speaking = !!remoteMeter && now - lastLoudAt < SPEAKING_HOLD_MS;

  pushLevels({ mic, speaking });
}

// Only send when something visibly changes, so a quiet room sends nothing.
function pushLevels(levels) {
  const key = `${levels.mic}|${levels.speaking}`;
  if (key === lastLevels) return;
  lastLevels = key;
  chrome.runtime.sendMessage({ target: 'background', type: 'levels', levels }).catch(() => {});
}

// ---------- join / leave sounds ----------

function chime(up) {
  if (state.deafened || state.volume === 0) return;
  const c = ctx();
  const t = c.currentTime;
  const gain = c.createGain();
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.1 * state.volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  (up ? [587, 880] : [880, 587]).forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(t + i * 0.1);
    osc.stop(t + 0.4);
  });
}

// ---------- controls ----------

function applyMute() {
  localStream?.getAudioTracks().forEach((t) => { t.enabled = !state.muted; });
  audio.muted = state.deafened;
  audio.volume = state.volume;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  switch (msg.type) {
    case 'join':
      join(msg.room, msg.label, msg.name);
      break;
    case 'leave':
      teardown();
      state = { ...state, status: 'idle', room: null, error: null, peer: null };
      break;
    case 'mute':
      setState({ muted: !!msg.value });
      applyMute();
      sendData({ type: 'mute', muted: state.muted });
      break;
    case 'deafen':
      setState({ deafened: !!msg.value });
      applyMute();
      break;
    case 'volume':
      setState({ volume: Number(msg.value) });
      applyMute();
      break;
    case 'getState':
      sendResponse(state);
      return;
  }
  sendResponse(true);
});
