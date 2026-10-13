# Chess Voice

Peer-to-peer voice chat with your opponent on chess.com and lichess.

## Install (unpacked)

1. Open `chrome://extensions` (also works in Edge, Brave and Arc), turn on **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open a game. A small **Voice** card appears bottom-right. Click **Join voice for this game**.
4. The first time, a tab opens asking for microphone access. Allow it once and you're connected.

Your opponent needs the extension too. Whoever joins second connects to whoever joined first.
To talk before a game starts, both type the same **room code** instead.

## How it works

- `content.js` reads the game ID from the URL, hashes it into a room key and shows the widget.
- `offscreen.js` holds the mic and the WebRTC call in an offscreen document, so the
  call survives page navigation (rematches change the URL but keep the call going).
- Signaling uses the free public PeerJS broker (`0.peerjs.com`). Room = two well-known peer IDs
  (`…-a` waits, `…-b` dials). Audio goes directly between the two browsers. It's encrypted
  (DTLS-SRTP) and never passes through a server.

## Limitations

- **Spectators can join.** Game IDs are public, so the 2 slots go to whoever clicks first.
  Use a room code if you want privacy.
- **Relies on PeerJS's free relay for strict networks.** PeerJS ships default TURN servers
  (`*.turn.peerjs.com`) that relay encrypted audio when a direct link fails. They're free with no
  uptime promise; pass your own `config: { iceServers }` to `new Peer(…)` in `offscreen.js` for reliability.
- Chromium only. Firefox doesn't support `chrome.offscreen`.
- Relies on the public PeerJS broker. For anything serious, self-host `peerjs-server`.
