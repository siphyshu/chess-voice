# Chrome Web Store submission sheet

Copy each field into the developer dashboard. Images are in this folder.

## Package

`./scripts/package.sh` → upload `dist/chess-voice-<version>.zip`.

## Store listing tab

**Name:** Chess Voice

**Summary** (from manifest, ≤132 chars):
Voice chat with your opponent while you play on lichess and chess.com. One click, peer-to-peer and encrypted.

**Description:**

```
Voice chat for online chess. Talk to your opponent while you play on lichess.org and chess.com, with one click and no accounts.

HOW IT WORKS
Open a game and a small Voice card appears in the corner. Click "Join voice for this game". When your opponent does the same, you're in a voice call. No sign-up, no invite links, no Discord server to set up.

FEATURES
• Peer-to-peer, encrypted voice chat between the two players
• Speaking indicator and mic level meter
• Mute, deafen and volume controls
• See your opponent's name and when they're muted
• The call keeps going through rematches
• Private rooms: name a room to talk with a friend before or after a game, or while you analyse together
• Collapses into a small pill that stays out of your way

GOOD TO KNOW
• Both players need the extension
• Works in Chrome, Edge, Brave and other Chromium browsers
• Free and open source: github.com/siphyshu/chess-voice

FAIR PLAY
Chess Voice doesn't read the board, suggest moves or interact with your game. Talking is fine; taking move advice during a game isn't. Please follow each site's fair-play rules.

Chess Voice is an independent project and is not affiliated with lichess.org or chess.com.
```

**Category:** Communication
**Language:** English

**Images:**
- Icon: `icons/icon-128.png`
- Small promo tile: `store/images/promo-small-440x280.png`
- Screenshots, upload in this order: `store/images/screenshot-1-1280x800.png` … `screenshot-5-1280x800.png`
- Marquee (optional): `store/images/marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Lets two players on chess.com or lichess.org talk to each other by voice during their game.

**Permission justifications:**

- **offscreen**: The microphone and the voice call run in an offscreen document. Service workers can't access the microphone or play audio, and keeping the call outside the web page means it continues when the player navigates, for example to a rematch.
- **storage**: Remembers where the user placed the voice widget and whether it's collapsed. Session storage briefly holds the room being joined while the user grants microphone permission.
- **Host permissions (chess.com, lichess.org)**: Shows the voice widget on these two sites, reads the game ID from the page address so both players join the same voice room, and reads player usernames shown on the game page.

**Remote code:** No. All JavaScript, including the PeerJS library (`vendor/peerjs.min.js`), is bundled in the package. The extension connects to `0.peerjs.com` over WebSocket only to exchange connection-setup messages, never code.

**Data usage**: disclose these (conservative; each is shared only with the other participant, never with the developer):
- ☑ Personal communications: voice audio, sent to the other participant (peer-to-peer, or via an encrypted PeerJS relay when a direct link fails)
- ☑ Personally identifiable information: the user's chess username, shown to the other participant
- ☑ Website content: game ID and player usernames read from the page

**Certifications**: tick all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/siphyshu/chess-voice/blob/main/PRIVACY.md

## Test instructions (for the reviewer)

```
Testing needs two Chrome profiles (or two computers), each with the extension and a microphone.

1. In both profiles, open https://lichess.org (no account needed).
2. A "Voice" card appears in the bottom-right corner.
3. In both profiles, type the same name (e.g. "review-test") in the "or name a room…" box and click Join.
4. The first time, a tab opens asking for microphone permission. Click Allow.
5. Both cards change to "Connected" and audio flows between the profiles.

To test the game flow, start a game against a friend, or play both sides from the two profiles, and click "Join voice for this game" in both.
```

