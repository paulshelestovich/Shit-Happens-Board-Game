# 💩 Shit Happens — Online

**Live:** https://shit-happens-kf76.onrender.com · [Render dashboard](https://dashboard.render.com/web/srv-d8n9tujtqb8s73cuef0g)

A free, browser-based, **real-time multiplayer** version of the party card game
*Shit Happens: Spring 2020 Edition*. Up to **10 players** join a room from their
own phones/laptops and take turns ranking life's miseries from bad to absolute
catastrophe.

No accounts, no database — create a room, share the 3-digit code, and play.

## How to play

1. One person clicks **Create a Room** and shares the room **code**.
2. Everyone else opens the same URL, enters the code, and joins (max 10).
3. The host taps **Start**. Everyone is dealt 3 starting cards into their
   **Lane of Pain** (sorted by Misery Index).
4. On your turn, **Draw a Card**. Its situation is shown to everyone — but the
   Misery Index number stays hidden.
5. Tap the 💩 slot in **your** lane where you think the card belongs.
   - **Correct** → you win the card. Turn passes on.
   - **Wrong** → the next player can **steal** by guessing in their own lane.
     If everyone misses, the card is discarded.
6. First player to **10 cards** wins — King of Shit Mountain. 👑

> **Assume the worst.** When judging a situation, imagine the worst plausible
> outcome. "Phone falls in toilet"? It's ruined, no insurance, data gone.

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000
```

## Play over the internet

The whole point is everyone in the room on their own device. Two easy options:

### Option A — instant tunnel (no hosting account)

Run locally, then expose it with [ngrok](https://ngrok.com):

```bash
npm start            # terminal 1
ngrok http 3000      # terminal 2 — share the https URL it prints
```

Your machine must stay on while people play.

### Option B — free cloud deploy (always-on URL)

This repo ships ready-to-deploy configs:

- **Render** — `render.yaml` blueprint. In Render: **New + → Blueprint**, point
  it at this repo, deploy. You get a public `https://…onrender.com` URL.
- **Railway / Heroku-style** — `Procfile` (`web: node server.js`). Import the
  repo and it runs `npm start`.

The server reads `PORT` from the environment, so it works on any Node host.

## Tech

- **Server:** Node.js + Express + [Socket.IO](https://socket.io). Authoritative
  game engine keeps the Misery Index numbers secret and validates every guess.
- **Client:** vanilla HTML/CSS/JS, mobile-first, zero build step.
- **State:** in-memory and session-only. Restarting the server clears all rooms.

```
server.js        Express static server + Socket.IO event wiring
src/cards.js     The full ~199-card deck (numbers live server-side only)
src/game.js      Game engine: deal, turns, guess validation, win
src/rooms.js     In-memory room registry + client-safe serialization
public/          The web client (index.html, app.js, style.css)
```

## Credits

Game concept, situations, and Misery Index from *Shit Happens: Spring 2020
Edition* by Andy Breckman / shithappens.game. This is an unofficial fan-made
digital adaptation for playing remotely. All card text belongs to its creators.

## License

MIT (code only). Card content is the property of the original game's creators.
