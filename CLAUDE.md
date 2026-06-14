# CLAUDE.md — Shit Happens Online

## Project Overview

A **real-time multiplayer web game**: an online adaptation of the party card
game *Shit Happens: Spring 2020 Edition*. Players join a room from their own
devices and take turns placing "shitty situation" cards into their personal
**Lane of Pain**, ranked by a hidden **Misery Index** (1–100).

- **Players:** 2–10 per room
- **Persistence:** none — rooms live in server memory, session-only
- **Auth:** none — 4-letter room codes, no accounts

## Design Philosophy

- **Server-authoritative.** The Misery Index numbers are the answers. They must
  never reach a client before a guess is resolved, or players could cheat. All
  rules, validation, and the deck live on the server; the client only renders.
- **Zero build step.** The client is plain HTML/CSS/JS served statically. No
  bundler, no framework, no transpiler.
- **Mobile-first.** Everyone plays on a phone. Large touch targets, single
  column, works at 375px.
- **Minimal dependencies.** Only `express` and `socket.io`.

## Repository Structure

```
shit-happens/
├── server.js          # Express static server + Socket.IO event handlers
├── src/
│   ├── cards.js       # The full deck (ordered list -> {id,text,index})
│   ├── game.js        # Authoritative engine: start/draw/guess/disconnect
│   └── rooms.js       # In-memory room registry + client-safe serialize()
├── public/
│   ├── index.html     # Landing / lobby / game screens (one file)
│   ├── app.js         # Socket.IO client + rendering
│   └── style.css      # Mobile-first styles
├── package.json       # express + socket.io; scripts: start, dev
├── render.yaml        # Render blueprint deploy
├── Procfile           # Railway/Heroku-style start
└── README.md
```

## Game Rules (source of truth for logic)

1. Deck = ~199 cards, each `{ id, text, index }`. `index` is the Misery Index
   and is **secret** until revealed.
2. On `start`: deck shuffled, each player dealt `START_CARDS` (3) into a sorted
   lane. Status → `playing`, `turnIndex = 0`.
3. The current-turn player `draw`s: a card moves into `room.active` with its
   number hidden from clients.
4. The active **guesser** picks a `slot` (0..lane.length). Correct iff
   `card.index` is between the neighbours at that gap.
   - Correct → guesser keeps card (`score++`), card resolved, turn advances to
     the player after the **original drawer**.
   - Wrong → steal passes to the next connected player. When it would return to
     the origin, nobody won → card discarded, turn advances.
5. First to `WIN_SCORE` (10) cards → `status = "over"`, `winnerId` set.
6. If the deck empties, highest score wins (`endByExhaustion`).

`START_CARDS` and `WIN_SCORE` are constants in `src/game.js`.

## Key Data Shapes

### Room (server, in `rooms.js`)
```js
{
  code, players[], hostId,
  status: 'lobby' | 'playing' | 'over',
  deck[],                      // remaining shuffled cards
  turnIndex,                   // index into players[]
  active: { card, originIndex, guesserIndex, triedIds:Set } | null,
  lastResult, winnerId,
}
```
Player: `{ id, name, lane:[cards sorted by index], score, connected }`.

### `serialize(room)` — the ONLY thing sent to clients
Strips secrets: lane cards include `index` (already won/revealed), but
`active.card` is sent **without `index`**. Always send via `serialize`, never
the raw room.

## Socket.IO Events

Client → server (all take an ack callback `(res) => {ok, error?}`):
`create {name}`, `join {code,name}`, `rejoin {code,playerId}`, `start`,
`draw`, `guess {slot}`.

Server → client: `state` (full serialized room, broadcast after every change).

The client persists `{code, playerId}` in `localStorage` and `rejoin`s on
reconnect/refresh.

## Conventions

- **Never leak `index` of the active card.** Any new server→client payload for
  the in-play card must omit the number until `lastResult` reveals it.
- All game-state mutations go through `src/game.js` functions, which return
  `{ ok, error }`. `server.js` stays a thin transport layer.
- Validate authority server-side: turn ownership, guesser identity, host-only
  `start`. Never trust the client.
- Vanilla JS only on the client; keep rendering in `render*` functions driven by
  the `state` event. Escape user text with `esc()`.
- Card text is reproduced verbatim (crude content is intentional to the game).

## Git Workflow

Always push directly to `main`. Never use feature branches or intermediate branches.

## Development

```bash
npm install
npm start        # http://localhost:3000  (PORT env overrides)
npm run dev      # auto-restart on changes
```

Quick checks:
```bash
# deck sanity (count, monotonic indices)
node -e "const c=require('./src/cards');console.log(c.length,c[0],c[c.length-1])"
```

Manual test: open several tabs, create + join with the code, start, and play a
turn through a correct guess, a wrong guess + steal, and to 10 cards. For real
multi-device testing, tunnel with `ngrok http 3000`.

## Deploy

`PORT` comes from the environment. Deploy via the `render.yaml` blueprint or any
Node host using the `Procfile`. State is in-memory, so a redeploy/restart ends
all in-progress games — acceptable for this casual game.

## Adding / editing cards

Edit the `ORDERED_SITUATIONS` array in `src/cards.js`. It is ordered from least
to most miserable; indices are assigned **positionally** (1, 1.5, 2, …) so only
the order matters. Keep entries unique.
```
