// Authoritative game engine for "Shit Happens".
//
// All rules live here and run on the server so misery numbers stay secret and
// guesses can't be faked by a client. Functions mutate the room object in place
// and return { ok, error } so the caller can broadcast or reject.

const DECK = require("./cards");

const START_CARDS = 3;
const WIN_SCORE = 10;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortLane(lane) {
  lane.sort((a, b) => a.index - b.index);
}

// Index of the next still-connected player after `from` (exclusive).
// Returns -1 if nobody else is connected.
function nextConnected(room, from) {
  const n = room.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    if (room.players[idx].connected) return idx;
  }
  return -1;
}

function start(room) {
  if (room.status !== "lobby") return { ok: false, error: "Game already started." };
  if (room.players.length < 2) return { ok: false, error: "Need at least 2 players." };

  const deck = shuffle(DECK);
  for (const p of room.players) {
    p.lane = deck.splice(0, START_CARDS);
    sortLane(p.lane);
    p.score = 0;
  }
  room.deck = deck;
  room.status = "playing";
  room.turnIndex = 0;
  room.active = null;
  room.lastResult = null;
  room.winnerId = null;
  return { ok: true };
}

// The current-turn player draws a card into play. Its number stays hidden.
function draw(room, playerId) {
  if (room.status !== "playing") return { ok: false, error: "Game is not in progress." };
  if (room.active) return { ok: false, error: "A card is already in play." };
  const turnPlayer = room.players[room.turnIndex];
  if (!turnPlayer || turnPlayer.id !== playerId)
    return { ok: false, error: "It's not your turn." };
  if (room.deck.length === 0) {
    endByExhaustion(room);
    return { ok: true };
  }
  const card = room.deck.shift();
  room.active = {
    card,
    originIndex: room.turnIndex,
    guesserIndex: room.turnIndex,
    triedIds: new Set(),
  };
  room.lastResult = null;
  return { ok: true };
}

// `slot` is an integer 0..lane.length: the gap the guesser thinks the card
// belongs in. Correct iff the card's index falls between its neighbors.
function guess(room, playerId, slot) {
  if (room.status !== "playing") return { ok: false, error: "Game is not in progress." };
  if (!room.active) return { ok: false, error: "No card is in play." };
  const guesser = room.players[room.active.guesserIndex];
  if (!guesser || guesser.id !== playerId)
    return { ok: false, error: "It's not your guess." };

  const lane = guesser.lane;
  slot = Number(slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > lane.length)
    return { ok: false, error: "Invalid slot." };

  const card = room.active.card;
  const lo = slot === 0 ? -Infinity : lane[slot - 1].index;
  const hi = slot === lane.length ? Infinity : lane[slot].index;
  const correct = card.index > lo && card.index < hi;

  if (correct) {
    guesser.lane.push(card);
    sortLane(guesser.lane);
    guesser.score += 1;
    room.lastResult = {
      cardText: card.text,
      revealedIndex: card.index,
      correct: true,
      winnerId: guesser.id,
      winnerName: guesser.name,
      discarded: false,
    };
    finishCard(room, guesser.score >= WIN_SCORE ? guesser : null);
    return { ok: true };
  }

  // Wrong guess -> pass the steal to the next connected player.
  room.active.triedIds.add(guesser.id);
  const next = nextConnected(room, room.active.guesserIndex);
  const everyoneTried =
    next === -1 ||
    next === room.active.originIndex ||
    room.active.triedIds.size >= room.players.filter((p) => p.connected).length;

  if (everyoneTried) {
    room.lastResult = {
      cardText: card.text,
      revealedIndex: card.index,
      correct: false,
      winnerId: null,
      winnerName: null,
      discarded: true,
    };
    finishCard(room, null);
  } else {
    room.active.guesserIndex = next;
  }
  return { ok: true };
}

// Resolve the current card: clear it, advance the turn, and handle win/exhaust.
function finishCard(room, winner) {
  const originIndex = room.active ? room.active.originIndex : room.turnIndex;
  room.active = null;

  if (winner) {
    room.status = "over";
    room.winnerId = winner.id;
    return;
  }
  const next = nextConnected(room, originIndex);
  if (next === -1) {
    endByExhaustion(room);
    return;
  }
  room.turnIndex = next;
  if (room.deck.length === 0) endByExhaustion(room);
}

// No cards left to draw: highest score wins (ties -> first such player).
function endByExhaustion(room) {
  room.status = "over";
  room.active = null;
  let best = null;
  for (const p of room.players) if (!best || p.score > best.score) best = p;
  room.winnerId = best ? best.id : null;
}

// Called when a player disconnects. If it was their turn or their steal,
// keep the game moving instead of stalling.
function handleDisconnect(room) {
  if (room.status !== "playing") return;
  const connectedCount = room.players.filter((p) => p.connected).length;
  if (connectedCount === 0) return;

  if (room.active) {
    const guesser = room.players[room.active.guesserIndex];
    if (guesser && !guesser.connected) {
      // Treat as a pass.
      room.active.triedIds.add(guesser.id);
      const next = nextConnected(room, room.active.guesserIndex);
      if (next === -1 || next === room.active.originIndex) {
        room.lastResult = {
          cardText: room.active.card.text,
          revealedIndex: room.active.card.index,
          correct: false,
          winnerId: null,
          winnerName: null,
          discarded: true,
        };
        finishCard(room, null);
      } else {
        room.active.guesserIndex = next;
      }
    }
  } else {
    const turnPlayer = room.players[room.turnIndex];
    if (turnPlayer && !turnPlayer.connected) {
      const next = nextConnected(room, room.turnIndex);
      if (next !== -1) room.turnIndex = next;
    }
  }
}

module.exports = { start, draw, guess, handleDisconnect, WIN_SCORE, START_CARDS };
