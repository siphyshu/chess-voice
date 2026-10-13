// In-page widget for chess.com and lichess. Detects the current game, derives
// a room key from it, and drives the call via the background service worker.
// Rendered in a closed shadow root so the sites' CSS can't touch it.

(() => {
  if (window.__chessVoice) return;
  window.__chessVoice = true;

  const SITE = location.hostname.endsWith('lichess.org') ? 'lichess' : 'chesscom';

  // ---------- page detection ----------

  function detectGame() {
    const path = location.pathname;
    if (SITE === 'lichess') {
      // /<8-char game id>, optionally followed by a 4-char player suffix or /white|/black.
      // Lots of 8-letter routes exist (/practice, /training…), so also require the game UI.
      const m = path.match(/^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/);
      return m && document.querySelector('main.round, .round__app') ? m[1] : null;
    }
    // /game/123, /game/live/123, /game/daily/123, /live/game/123, /daily/game/123
    const m = path.match(/\/(?:game\/(?:live\/|daily\/)?|live\/game\/|daily\/game\/)(\d+)/);
    return m ? m[1] : null;
  }

  // Best effort, read from the board: when you're playing, you're the bottom
  // player and your opponent is the top one. Returns null if the markup changed.
  function playerName(side) {
    if (SITE === 'lichess') {
      // The link text can include a title and icons; the href is just /@/<name>.
      const href = document.querySelector(`.ruser-${side} a.user-link`)?.getAttribute('href');
      return href?.match(/\/@\/([\w-]+)/)?.[1] ?? null;
    }
    const el = document.querySelector([
      `#board-layout-player-${side} [data-test-element="user-tagline-username"]`,
      `.board-layout-${side} .user-username-component`,
      `.player-${side} .user-username-component`,
    ].join(','));
    return el?.textContent.trim() || null;
  }

  function myUsername() {
    if (SITE === 'lichess' && document.body?.dataset.user) return document.body.dataset.user;
    return playerName('bottom');
  }

  // Lichess IDs are 8 characters, so show them whole; chess.com's are long numbers.
  const shortGame = (id) => (id.length > 8 ? `#…${id.slice(-4)}` : `#${id}`);

  async function roomKey(seed) {
    const bytes = new TextEncoder().encode(`chess-voice/v1:${seed}`);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...hash.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- messaging ----------

  function send(msg) {
    try {
      return chrome.runtime.sendMessage({ target: 'background', ...msg }).catch(() => null);
    } catch {
      // Extension was reloaded/updated; this content script is orphaned.
      host.remove();
      return Promise.resolve(null);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'state') render(msg.state);
    if (msg?.type === 'levels') renderLevels(msg.levels);
  });

  // ---------- UI ----------

  const svg = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    micOff: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><path d="M3 3l18 18"/>'),
    head: svg('<path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>'),
    headOff: svg('<path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/><path d="M3 3l18 18"/>'),
  };

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .card {
        --bg: #22211f; --fg: #ecebe7; --muted: #9a968e; --line: #3a3835; --raise: #2e2c29;
        --accent: #7fbf6a; --warn: #e0b04a; --bad: #e06a5a;
        width: 256px; background: var(--bg); color: var(--fg); border: 1px solid var(--line);
        border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.35);
        font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; overflow: hidden;
        transition: width .18s ease-out;
      }
      .card.collapsed { width: auto; min-width: 150px; border-radius: 999px; }
      .head {
        display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 12px; min-height: 40px;
        cursor: grab; user-select: none; touch-action: none;
      }
      .head:active { cursor: grabbing; }
      .title { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; transition: box-shadow .12s; }
      .dot.on { background: var(--accent); }
      .dot.wait { background: var(--warn); }
      .dot.bad { background: var(--bad); }
      .speaking .dot.on { box-shadow: 0 0 0 4px rgba(127,191,106,.35); }
      .chev { color: var(--muted); font-size: 10px; width: 16px; text-align: center; transition: transform .15s ease-out; }
      .collapsed .chev { transform: rotate(-90deg); }
      .collapsed .body { display: none; }

      .icon-btn {
        flex: none; width: 28px; height: 28px; padding: 5px; border-radius: 50%;
        display: grid; place-items: center; background: var(--raise); border: 1px solid var(--line);
      }
      .icon-btn svg, .btn svg { width: 16px; height: 16px; }

      .body { padding: 2px 12px 12px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
      .peer { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--raise); border-radius: 10px; }
      .avatar {
        flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
        background: #3b4a36; color: #cfe8c4; font-weight: 700; font-size: 14px; text-transform: uppercase;
        box-shadow: 0 0 0 2px var(--raise); transition: box-shadow .12s;
      }
      .speaking .avatar { box-shadow: 0 0 0 2px var(--raise), 0 0 0 4px var(--accent); }
      .peer-text { min-width: 0; flex: 1; }
      .peer-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
      .peer-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .peer-muted { flex: none; color: var(--bad); display: inline-grid; }
      .peer-muted svg { width: 14px; height: 14px; }
      .status { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .idle-status { white-space: normal; } /* errors here can be a full sentence */

      .meter-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
      .meter { display: flex; gap: 3px; flex: 1; }
      .meter i { flex: 1; height: 6px; border-radius: 2px; background: var(--line); transition: background .08s; }
      .meter i.lit { background: var(--accent); }
      .meter-row.muted .meter i { background: var(--line); }
      .meter-label { width: 52px; text-align: right; }
      .meter-row.muted .meter-label { color: var(--bad); font-weight: 600; }

      button, input {
        font: inherit; color: var(--fg); background: var(--raise); border: 1px solid var(--line);
        border-radius: 8px; padding: 7px 10px;
      }
      button { cursor: pointer; font-weight: 600; transition: background .12s, transform .1s, color .12s; }
      button:hover:not(:disabled) { background: #383633; }
      button:active:not(:disabled) { transform: scale(.96); }
      button:disabled { opacity: .45; cursor: default; }
      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
      button.primary { background: var(--accent); border-color: var(--accent); color: #142010; }
      button.primary:hover:not(:disabled) { background: #8fcc7b; }
      button.danger { color: var(--bad); }
      button[aria-pressed="true"] { background: #4a2a26; border-color: #6b3a33; color: #ffb3a8; }
      button[aria-pressed="true"]:hover:not(:disabled) { background: #5a322d; }
      .row { display: flex; gap: 6px; }
      .row > * { flex: 1; min-width: 0; }
      input::placeholder { color: var(--muted); }
      input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .vol { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
      .vol input { flex: 1; padding: 0; accent-color: var(--accent); background: none; border: 0; }
      .stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .stack.loose { gap: 10px; }
      [hidden] { display: none !important; }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    </style>
    <div class="card">
      <div class="head">
        <span class="dot"></span>
        <span class="title">Voice</span>
        <button class="icon-btn head-mute" hidden></button>
        <span class="chev">▼</span>
      </div>
      <div class="body">
        <div class="idle">
          <div class="stack">
            <div class="status idle-status"></div>
            <button class="primary join-game">Join voice for this game</button>
            <div class="row">
              <input class="code" placeholder="or name a room…" aria-label="Room name" maxlength="40" spellcheck="false">
              <button class="join-code" style="flex:none">Join</button>
            </div>
          </div>
        </div>
        <div class="active" hidden>
          <div class="stack loose">
            <div class="peer">
              <div class="avatar">?</div>
              <div class="peer-text">
                <div class="peer-name"><span class="name">Opponent</span><span class="peer-muted" hidden title="They're muted">${ICON.micOff}</span></div>
                <div class="status active-status"></div>
              </div>
            </div>
            <div class="meter-row">
              <span>Your mic</span>
              <div class="meter"><i></i><i></i><i></i><i></i><i></i></div>
              <span class="meter-label"></span>
            </div>
            <div class="row">
              <button class="btn mute" aria-pressed="false"></button>
              <button class="btn deafen" aria-pressed="false"></button>
            </div>
            <label class="vol">Volume <input class="volume" type="range" min="0" max="1" step="0.05" value="1"></label>
            <button class="danger leave">Leave</button>
          </div>
        </div>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const card = $('.card');
  const ui = {
    dot: $('.dot'), title: $('.title'), headMute: $('.head-mute'),
    idle: $('.idle'), idleStatus: $('.idle-status'), active: $('.active'), activeStatus: $('.active-status'),
    avatar: $('.avatar'), name: $('.name'), peerMuted: $('.peer-muted'),
    meterRow: $('.meter-row'), bars: [...root.querySelectorAll('.meter i')], meterLabel: $('.meter-label'),
    joinGame: $('.join-game'), code: $('.code'), joinCode: $('.join-code'),
    mute: $('.mute'), deafen: $('.deafen'), volume: $('.volume'), leave: $('.leave'),
  };

  const STATUS = {
    idle: ['', 'Not connected'],
    mic: ['wait', 'Opening microphone…'],
    'needs-permission': ['wait', 'Allow mic in the new tab'],
    connecting: ['wait', 'Connecting…'],
    waiting: ['wait', 'Waiting for opponent…'],
    connected: ['on', 'Connected'],
    reconnecting: ['wait', 'Reconnecting…'],
    full: ['bad', 'This room already has two people in it.'],
    error: ['bad', 'Something went wrong.'],
  };

  let state = { status: 'idle' };
  let gameId = null;

  function render(next = state) {
    state = next;
    const [tone, text] = STATUS[state.status] ?? STATUS.error;
    const inCall = !['idle', 'full', 'error'].includes(state.status);
    const connected = state.status === 'connected';
    const peerName = connected ? state.peer?.name || 'Opponent' : null;

    ui.dot.className = `dot ${tone}`;
    ui.title.textContent = card.classList.contains('collapsed') && peerName ? peerName : 'Voice';
    ui.idle.hidden = inCall;
    ui.active.hidden = !inCall;

    // idle
    ui.idleStatus.textContent = state.status === 'error' && state.error ? state.error : text;
    ui.idleStatus.hidden = state.status === 'idle';
    ui.joinGame.disabled = !gameId;
    ui.joinGame.textContent = gameId ? 'Join voice for this game' : 'Open a game to join its voice';

    // in call: two lines, "who" on top and "where / how" underneath
    const room = state.room && typeof state.room === 'object' ? state.room : {};
    let primary = text;
    let secondary = room.detail ?? '';
    if (connected) {
      primary = peerName;
      secondary = state.peer?.muted ? 'Connected · they’re muted' : 'Connected';
    } else if (state.status === 'waiting') {
      primary = room.opponent ? `Waiting for ${room.opponent}` : 'Waiting for opponent';
    }
    ui.name.textContent = primary;
    ui.activeStatus.textContent = secondary;
    ui.avatar.textContent = peerName ? peerName[0] : '…';
    ui.peerMuted.hidden = !(connected && state.peer?.muted);

    const muted = !!state.muted;
    ui.mute.setAttribute('aria-pressed', String(muted));
    ui.mute.innerHTML = `${muted ? ICON.micOff : ICON.mic}<span>${muted ? 'Unmute' : 'Mute'}</span>`;
    ui.headMute.setAttribute('aria-pressed', String(muted));
    ui.headMute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    ui.headMute.title = muted ? 'Unmute' : 'Mute';
    ui.headMute.innerHTML = muted ? ICON.micOff : ICON.mic;
    ui.headMute.hidden = !inCall;
    ui.meterRow.classList.toggle('muted', muted);
    ui.meterLabel.textContent = muted ? 'Muted' : '';

    const deaf = !!state.deafened;
    ui.deafen.setAttribute('aria-pressed', String(deaf));
    ui.deafen.innerHTML = `${deaf ? ICON.headOff : ICON.head}<span>${deaf ? 'Undeafen' : 'Deafen'}</span>`;
    if (state.volume != null && root.activeElement !== ui.volume) ui.volume.value = state.volume;

    if (!inCall) renderLevels({ mic: 0, speaking: false });
  }

  function renderLevels({ mic, speaking }) {
    ui.bars.forEach((bar, i) => bar.classList.toggle('lit', i < mic));
    card.classList.toggle('speaking', !!speaking && state.status === 'connected');
  }

  ui.joinGame.addEventListener('click', async () => {
    if (!gameId) return;
    const room = await roomKey(`${SITE}:${gameId}`);
    send({
      type: 'join', room, name: myUsername(),
      label: { opponent: playerName('top'), detail: `${SITE === 'lichess' ? 'Lichess' : 'Chess.com'} · ${shortGame(gameId)}` },
    });
  });

  const joinCode = async () => {
    const code = ui.code.value.trim().toLowerCase();
    if (!code) return ui.code.focus();
    send({ type: 'join', room: await roomKey(`code:${code}`), name: myUsername(), label: { opponent: null, detail: `Room “${code}”` } });
  };
  ui.joinCode.addEventListener('click', joinCode);
  ui.code.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep the sites' keyboard shortcuts from firing while typing
    if (e.key === 'Enter') joinCode();
  });

  const toggleMute = () => send({ type: 'mute', value: !state.muted });
  ui.mute.addEventListener('click', toggleMute);
  ui.headMute.addEventListener('click', toggleMute);
  ui.headMute.addEventListener('pointerdown', (e) => e.stopPropagation()); // not a drag or collapse
  ui.deafen.addEventListener('click', () => send({ type: 'deafen', value: !state.deafened }));
  ui.volume.addEventListener('input', () => send({ type: 'volume', value: Number(ui.volume.value) }));
  ui.leave.addEventListener('click', () => send({ type: 'leave' }));

  // ---------- drag + collapse (persisted) ----------

  const head = $('.head');
  let drag = null;

  head.addEventListener('pointerdown', (e) => {
    const r = host.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    place(drag.left + dx, drag.top + dy);
  });
  head.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      const r = host.getBoundingClientRect();
      chrome.storage.local.set({ pos: { left: r.left, top: r.top } });
    } else {
      card.classList.toggle('collapsed');
      render();
      chrome.storage.local.set({ collapsed: card.classList.contains('collapsed') });
    }
    drag = null;
  });

  function place(left, top) {
    const r = host.getBoundingClientRect();
    left = Math.max(0, Math.min(left, innerWidth - r.width));
    top = Math.max(0, Math.min(top, innerHeight - r.height));
    Object.assign(host.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
  }

  chrome.storage.local.get(['pos', 'collapsed']).then(({ pos, collapsed }) => {
    if (collapsed) card.classList.add('collapsed');
    if (pos) place(pos.left, pos.top);
  });

  // ---------- boot ----------

  // Both sites are SPAs: game pages are entered and left without a reload.
  // A cheap poll is more reliable than patching history methods.
  function checkGame() {
    const id = detectGame();
    if (id !== gameId) {
      gameId = id;
      render();
    }
  }

  document.documentElement.appendChild(host);
  render();
  checkGame();
  setInterval(checkGame, 1000);
  send({ type: 'getState' }).then((s) => s && !s.error && render(s));
})();
