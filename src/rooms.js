// In-memory room registry. No database -- everything lives in this process
// and disappears when the server restarts (session-only, by design).

const { randomUUID } = require("crypto");

const rooms = new Map(); // code -> room

const MAX_PLAYERS = 10;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars

function generateCode() {
  let code;
  do {
    code = Array.from(
      { length: 3 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = generateCode();
  const room = {
    code,
    players: [], // { id, name, lane: [], score, connected }
    hostId: null,
    status: "lobby", // 'lobby' | 'playing' | 'over'
    deck: [],
    turnIndex: 0, // index into players[] whose turn it is
    active: null, // { card, originIndex, guesserIndex, triedIds:Set }
    lastResult: null,
    winnerId: null,
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

function removeRoom(code) {
  rooms.delete(code);
}

function addPlayer(room, name) {
  const player = {
    id: randomUUID(),
    name: (name || "Player").slice(0, 20),
    lane: [],
    score: 0,
    connected: true,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}

// Build the view sent to clients. Critically, the active card's misery `index`
// is stripped so the answer stays secret until a guess is resolved.
function serialize(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    deckRemaining: room.deck.length,
    turnPlayerId: room.players[room.turnIndex]
      ? room.players[room.turnIndex].id
      : null,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      lane: p.lane.map((c) => ({ id: c.id, text: c.text, index: c.index, img: c.img })),
    })),
    active: room.active
      ? {
          card: { id: room.active.card.id, text: room.active.card.text, img: room.active.card.img }, // no index!
          guesserId: room.players[room.active.guesserIndex]
            ? room.players[room.active.guesserIndex].id
            : null,
        }
      : null,
    lastResult: room.lastResult,
  };
}

module.exports = {
  rooms,
  MAX_PLAYERS,
  createRoom,
  getRoom,
  removeRoom,
  addPlayer,
  findPlayer,
  serialize,
};
