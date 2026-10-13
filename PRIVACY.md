# Chess Voice — Privacy Policy

_Last updated: October 13, 2026_

Chess Voice lets two people talk by voice while playing on chess.com or lichess.org. It has no servers of its own, no accounts, no analytics and no tracking. This page explains exactly what it touches and where that data goes.

## What the extension accesses

- **Your microphone**, only after you click **Join** and grant permission. It stops as soon as you click **Leave**.
- **The address of the chess page you're on**, to read the game ID so both players end up in the same voice room.
- **Player usernames shown on the game page**, so your opponent sees who they're talking to.

## Where your data goes

| Data | Sent to | Why |
|---|---|---|
| Your voice | The other person in your room, encrypted (WebRTC DTLS-SRTP). Usually directly; if your networks block a direct link, it passes through a PeerJS relay server (`eu-0.turn.peerjs.com` / `us-0.turn.peerjs.com`), which forwards the encrypted audio but can't decrypt it | That's the voice chat |
| Your username and whether you're muted | Directly to the other person in your room | Shown on their widget |
| A scrambled room ID (a hash of the game ID or room name) and your IP address | The public PeerJS server at `0.peerjs.com`, run by the open-source PeerJS project | To introduce the two browsers so they can connect |
| Your IP address | A Google STUN server (`stun.l.google.com`) and, when needed, the PeerJS relay servers | So your browser can learn its public network address and connect through restrictive networks |

Your voice is never sent to the developer, and the PeerJS servers can't listen to it. The extension doesn't record or store audio.

## What's stored on your device

The widget's position and whether it's collapsed are saved in your browser's extension storage. While you're granting microphone permission, the room you were joining is briefly kept in session storage. None of this leaves your device.

## What the developer collects

Nothing. The developer receives no data from the extension, and doesn't sell, share or use data for advertising, credit or any purpose other than the voice chat itself.

## Your choices

You can mute, deafen or leave at any time. You can revoke microphone access in Chrome's site settings for the extension, and you can remove the extension to delete everything it stored.

## Contact

Questions: [contact email or link]
