// The hero's interactive demo: a chessboard plus a working copy of the
// extension's Voice card. Everything is simulated; no microphone is used.
(() => {
  // ---------- board ----------
  const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  // Italian Game after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O
  const FEN = "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1";
  const HIGHLIGHT = ["g1", "f1"];
  const cells = [];
  FEN.split("/").forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      const n = /\d/.test(ch) ? +ch : 1;
      for (let i = 0; i < n; i++, c++) {
        const sq = "abcdefgh"[c] + (8 - r);
        const piece = /\d/.test(ch) ? "" : `<span class="${ch === ch.toUpperCase() ? "w" : "b"}">${GLYPH[ch.toLowerCase()]}︎</span>`;
        cells.push(`<div class="${(r + c) % 2 ? "d" : "l"}${HIGHLIGHT.includes(sq) ? " hi" : ""}">${piece}</div>`);
      }
    }
  });
  document.getElementById("board").innerHTML = cells.join("");

  // ---------- widget ----------
  const $ = (id) => document.getElementById(id);
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
  const HEAD = '<path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>';
  const SLASH = '<path d="M3 3l18 18"/>';
  const ICON = { mic: svg(MIC), micOff: svg(MIC + SLASH), head: svg(HEAD), headOff: svg(HEAD + SLASH) };

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const card = $("w");
  const bars = [...$("wMeter").children];
  const OPPONENT = "knight_owl";
  let s = { status: "idle", muted: false, deafened: false, collapsed: false };
  let timers = [];

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function render() {
    const inCall = s.status !== "idle";
    const connected = s.status === "connected";
    card.classList.toggle("collapsed", s.collapsed);
    $("wDot").className = `w-dot ${connected ? "on" : inCall ? "wait" : ""}`;
    $("wTitle").textContent = s.collapsed && connected ? OPPONENT : "Voice";
    $("wChev").setAttribute("aria-label", s.collapsed ? "Expand" : "Collapse");
    $("wIdle").hidden = inCall;
    $("wActive").hidden = !inCall;

    $("wName").textContent = connected ? OPPONENT : `Waiting for ${OPPONENT}`;
    $("wStatus").textContent = connected ? "Connected" : "Lichess · #Xq7Lm2Pa";
    $("wAv").textContent = connected ? OPPONENT[0] : "…";

    $("wMute").setAttribute("aria-pressed", String(s.muted));
    $("wMute").innerHTML = `${s.muted ? ICON.micOff : ICON.mic}<span>${s.muted ? "Unmute" : "Mute"}</span>`;
    $("wDeaf").setAttribute("aria-pressed", String(s.deafened));
    $("wDeaf").innerHTML = `${s.deafened ? ICON.headOff : ICON.head}<span>${s.deafened ? "Undeafen" : "Deafen"}</span>`;
    $("wHeadMute").hidden = !inCall;
    $("wHeadMute").setAttribute("aria-pressed", String(s.muted));
    $("wHeadMute").setAttribute("aria-label", s.muted ? "Unmute" : "Mute");
    $("wHeadMute").innerHTML = s.muted ? ICON.micOff : ICON.mic;
    $("wMeterRow").classList.toggle("muted", s.muted);
    $("wMeterLabel").textContent = s.muted ? "Muted" : "";
    if (s.muted || !inCall) setMeter(0);
  }

  function setMeter(n) { bars.forEach((b, i) => b.classList.toggle("lit", i < n)); }
  function setSpeaking(on) { card.classList.toggle("speaking", on && s.status === "connected"); }

  // A believable conversation: the opponent talks in bursts, your mic flickers.
  function converse() {
    if (s.status !== "connected") return;
    if (reduced) { setSpeaking(true); if (!s.muted) setMeter(3); return; }
    const talking = !card.classList.contains("speaking");
    setSpeaking(talking);
    later(converse, talking ? 900 + Math.random() * 1600 : 600 + Math.random() * 1400);
  }
  function micLoop() {
    if (s.status === "idle") return;
    if (!s.muted && !reduced) setMeter(Math.random() < .35 ? 0 : 1 + Math.floor(Math.random() * 4));
    later(micLoop, 140);
  }

  function join() {
    $("hint").classList.add("gone");
    clearTimers();
    s.status = "waiting";
    render();
    micLoop();
    later(() => { s.status = "connected"; render(); converse(); }, 1600);
  }
  function leave() {
    clearTimers();
    s = { ...s, status: "idle", muted: false, deafened: false };
    setSpeaking(false);
    render();
  }

  $("wJoin").addEventListener("click", join);
  $("wLeave").addEventListener("click", leave);
  const toggleMute = () => { s.muted = !s.muted; render(); };
  $("wMute").addEventListener("click", toggleMute);
  $("wHeadMute").addEventListener("click", (e) => { e.stopPropagation(); toggleMute(); });
  $("wDeaf").addEventListener("click", () => { s.deafened = !s.deafened; render(); });
  $("wChev").addEventListener("click", () => { s.collapsed = !s.collapsed; render(); });

  render();
})();
