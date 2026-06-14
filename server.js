// Express static server + Socket.IO realtime layer.
// Serves the client from /public and relays game events to the engine.

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const rooms = require("./src/rooms");
const game = require("./src/game");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Never cache the shell HTML so clients always pick up new asset versions.
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (_req, res) => res.send("ok"));

// Push the current room view to everyone in it.
function broadcast(room) {
  io.to(room.code).emit("state", rooms.serialize(room));
}

io.on("connection", (socket) => {
  // socket.data holds { code, playerId } once the socket joins a room.

  socket.on("create", ({ name }, cb) => {
    const room = rooms.createRoom();
    const player = rooms.addPlayer(room, name);
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code, playerId: player.id });
    broadcast(room);
  });

  socket.on("join", ({ code, name }, cb) => {
    const room = rooms.getRoom(code);
    if (!room) return cb && cb({ ok: false, error: "Room not found." });
    if (room.status !== "lobby")
      return cb && cb({ ok: false, error: "Game already in progress." });
    if (room.players.length >= rooms.MAX_PLAYERS)
      return cb && cb({ ok: false, error: "Room is full (10 players max)." });
    const player = rooms.addPlayer(room, name);
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code, playerId: player.id });
    broadcast(room);
  });

  // Re-attach an existing player (e.g. page refresh) to their slot.
  socket.on("rejoin", ({ code, playerId }, cb) => {
    const room = rooms.getRoom(code);
    if (!room) return cb && cb({ ok: false, error: "Room not found." });
    const player = rooms.findPlayer(room, playerId);
    if (!player) return cb && cb({ ok: false, error: "Player not found." });
    player.connected = true;
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    cb && cb({ ok: true, code: room.code, playerId: player.id });
    broadcast(room);
  });

  socket.on("start", (_payload, cb) => {
    const room = rooms.getRoom(socket.data && socket.data.code);
    if (!room) return cb && cb({ ok: false, error: "Not in a room." });
    if (room.hostId !== socket.data.playerId)
      return cb && cb({ ok: false, error: "Only the host can start." });
    const res = game.start(room);
    if (!res.ok) return cb && cb(res);
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("draw", (_payload, cb) => {
    const room = rooms.getRoom(socket.data && socket.data.code);
    if (!room) return cb && cb({ ok: false, error: "Not in a room." });
    const res = game.draw(room, socket.data.playerId);
    if (!res.ok) return cb && cb(res);
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("guess", ({ slot }, cb) => {
    const room = rooms.getRoom(socket.data && socket.data.code);
    if (!room) return cb && cb({ ok: false, error: "Not in a room." });
    const res = game.guess(room, socket.data.playerId, slot);
    if (!res.ok) return cb && cb(res);
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.getRoom(socket.data && socket.data.code);
    if (!room) return;
    const player = rooms.findPlayer(room, socket.data.playerId);
    if (player) player.connected = false;

    // If everyone left, drop the room after a short grace period.
    const anyConnected = room.players.some((p) => p.connected);
    if (!anyConnected) {
      setTimeout(() => {
        const r = rooms.getRoom(room.code);
        if (r && !r.players.some((p) => p.connected)) rooms.removeRoom(room.code);
      }, 60 * 1000);
      return;
    }
    game.handleDisconnect(room);
    broadcast(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Shit Happens running on http://localhost:${PORT}`);
});
