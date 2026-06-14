/* Shit Happens — client. Vanilla JS + Socket.IO, no build step. */

const socket = io();

let me = { code: null, playerId: null }; // filled on create/join/rejoin
let lastState = null;

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}

function screen(name) {
  for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
  show("screen-" + name);
}

function saveSession() {
  if (me.code && me.playerId)
    localStorage.setItem("sh_session", JSON.stringify(me));
}
function clearSession() {
  localStorage.removeItem("sh_session");
}

/* ---------- landing ---------- */
$("btn-create").onclick = () => {
  const name = $("name-input").value.trim() || "Player";
  socket.emit("create", { name }, (res) => {
    if (!res.ok) return ($("landing-error").textContent = res.error);
    me = { code: res.code, playerId: res.playerId };
    saveSession();
  });
};

$("btn-join").onclick = () => {
  const name = $("name-input").value.trim() || "Player";
  const code = $("code-input").value.trim().toUpperCase();
  if (!code) return ($("landing-error").textContent = "Enter a room code.");
  socket.emit("join", { code, name }, (res) => {
    if (!res.ok) return ($("landing-error").textContent = res.error);
    me = { code: res.code, playerId: res.playerId };
    saveSession();
  });
};

/* ---------- lobby ---------- */
$("lobby-code").onclick = () => {
  if (!me.code) return;
  navigator.clipboard && navigator.clipboard.writeText(me.code);
  toast("Room code copied");
};

$("btn-start").onclick = () => {
  socket.emit("start", {}, (res) => {
    if (!res.ok) toast(res.error);
  });
};

/* ---------- game actions ---------- */
$("btn-draw").onclick = () => {
  socket.emit("draw", {}, (res) => {
    if (!res.ok) toast(res.error);
  });
};

$("btn-newgame").onclick = () => {
  clearSession();
  location.reload();
};

function sendGuess(slot) {
  socket.emit("guess", { slot }, (res) => {
    if (!res.ok) toast(res.error);
  });
}

/* ---------- rendering ---------- */
socket.on("state", (state) => {
  lastState = state;
  render(state);
});

socket.on("connect", () => {
  // Attempt to rejoin a prior session after a refresh/reconnect.
  if (me.playerId) {
    socket.emit("rejoin", me, () => {});
    return;
  }
  const saved = localStorage.getItem("sh_session");
  if (saved) {
    const s = JSON.parse(saved);
    socket.emit("rejoin", s, (res) => {
      if (res.ok) {
        me = { code: res.code, playerId: res.playerId };
      } else {
        clearSession();
      }
    });
  }
});

function render(state) {
  if (state.status === "lobby") return renderLobby(state);
  return renderGame(state);
}

function renderLobby(state) {
  screen("lobby");
  $("lobby-code").textContent = state.code;
  const ul = $("lobby-players");
  ul.innerHTML = state.players
    .map((p) => {
      const host = p.id === state.hostId ? '<span class="badge">Host</span>' : "";
      const you = p.id === me.playerId ? " (you)" : "";
      return `<li><span>${esc(p.name)}${you}</span>${host}</li>`;
    })
    .join("");

  const isHost = state.hostId === me.playerId;
  const enough = state.players.length >= 2;
  if (isHost) {
    show("btn-start");
    $("btn-start").disabled = !enough;
    $("lobby-hint").textContent = enough
      ? ""
      : "Waiting for at least 2 players to join…";
  } else {
    hide("btn-start");
    $("lobby-hint").textContent = "Waiting for the host to start the game…";
  }
}

function renderGame(state) {
  screen("game");
  $("game-code").textContent = state.code;

  const myId = me.playerId;
  const me_p = state.players.find((p) => p.id === myId);
  const turnPlayer = state.players.find((p) => p.id === state.turnPlayerId);
  const isMyTurn = state.turnPlayerId === myId;

  // Turn banner
  const banner = $("turn-banner");
  if (state.status === "over") {
    banner.textContent = "";
    banner.classList.remove("you");
  } else if (isMyTurn && !state.active) {
    banner.textContent = "Your turn — draw!";
    banner.classList.add("you");
  } else {
    banner.classList.remove("you");
    banner.textContent = turnPlayer ? `${turnPlayer.name}'s turn` : "";
  }

  // Result banner
  renderResult(state.lastResult);

  // Active card
  if (state.active) {
    show("active-area");
    const card = state.active.card;
    const activeImgEl = $("active-card-img");
    const activeImgWrap = $("active-card-img-wrap");
    if (card.img && activeImgEl) {
      activeImgEl.src = `/cards/${card.img}`;
      activeImgEl.alt = card.text;
      if (activeImgWrap) show("active-card-img-wrap");
      $("active-card-text").classList.add("hidden");
    } else {
      if (activeImgWrap) hide("active-card-img-wrap");
      $("active-card-text").classList.remove("hidden");
      $("active-card-text").textContent = card.text;
    }
    hide("active-card-index");
    const guesser = state.players.find((p) => p.id === state.active.guesserId);
    const myGuess = state.active.guesserId === myId;
    $("active-prompt").textContent = myGuess
      ? "Tap a 💩 slot in YOUR lane to place this card."
      : `${guesser ? guesser.name : "Someone"} is guessing…`;
  } else {
    hide("active-area");
  }

  // Draw button
  if (state.status === "playing" && isMyTurn && !state.active) show("btn-draw");
  else hide("btn-draw");

  // My lane (guessable when it's my guess)
  const myGuessNow = state.active && state.active.guesserId === myId;
  if (me_p) {
    show("my-lane-area");
    $("my-score").textContent = `· ${me_p.score}/10 cards`;
    renderMyLane(me_p.lane, myGuessNow);
  } else {
    hide("my-lane-area");
  }

  // All lanes
  renderAllLanes(state);

  // Game over
  if (state.status === "over") {
    show("gameover");
    const w = state.players.find((p) => p.id === state.winnerId);
    $("gameover-text").textContent = w
      ? `${w.name} is the King of Shit Mountain! (${w.score} cards)`
      : "Game over.";
  } else {
    hide("gameover");
  }
}

function renderResult(r) {
  const el = $(“result-banner”);
  if (!r) {
    hide(“result-banner”);
    return;
  }
  show(“result-banner”);
  el.classList.toggle(“good”, !!r.correct);
  el.classList.toggle(“bad”, !r.correct);
  const idx = `”${esc(r.cardText)}” = Misery Index ${r.revealedIndex}`;
  let text = “”;
  if (r.correct) {
    text = `✅ ${esc(r.winnerName)} nailed it! ${idx}`;
  } else if (r.discarded) {
    text = `❌ Nobody got it — discarded. ${idx}`;
  } else {
    text = `❌ Wrong — steal it!`;
  }
  const resultTextEl = $(“result-text”);
  if (resultTextEl) resultTextEl.innerHTML = text;
  else el.innerHTML = text;
  const resultImgEl = $(“result-card-img”);
  const resultImgWrap = $(“result-card-img-wrap”);
  if (r.cardImg && r.revealedIndex !== undefined && resultImgEl) {
    resultImgEl.src = `/cards/${r.cardImg}`;
    resultImgEl.alt = r.cardText;
    if (resultImgWrap) show(“result-card-img-wrap”);
  } else {
    if (resultImgWrap) hide(“result-card-img-wrap”);
  }
}

function laneCardHtml(c) {
  const imgHtml = c.img
    ? `<img src="/cards/${c.img}" class="lane-card-img" alt="${esc(c.text)}">`
    : "";
  return `<div class="lane-card">${imgHtml}<span class="num">${c.index}</span><span>${esc(
    c.text
  )}</span></div>`;
}

function renderMyLane(lane, guessable) {
  const el = $("my-lane");
  el.classList.toggle("guessable", guessable);
  if (!guessable) {
    el.innerHTML = lane.length
      ? lane.map(laneCardHtml).join("")
      : '<span class="muted small">No cards yet.</span>';
    return;
  }
  // Interleave slot buttons: [slot0] card [slot1] card ... [slotN]
  let html = `<button class="slot-btn" data-slot="0">💩</button>`;
  lane.forEach((c, i) => {
    html += laneCardHtml(c);
    html += `<button class="slot-btn" data-slot="${i + 1}">💩</button>`;
  });
  el.innerHTML = html;
  for (const b of el.querySelectorAll(".slot-btn")) {
    b.onclick = () => sendGuess(Number(b.dataset.slot));
  }
}

function renderAllLanes(state) {
  const wrap = $("all-lanes");
  wrap.innerHTML = state.players
    .map((p) => {
      const isTurn = p.id === state.turnPlayerId && state.status === "playing";
      const you = p.id === me.playerId ? " (you)" : "";
      const off = p.connected ? "" : ' <span class="dot-off">offline</span>';
      const cards = p.lane.length
        ? p.lane.map(laneCardHtml).join("")
        : '<span class="muted small">empty</span>';
      return `<div class="all-lane-block">
        <div class="all-lane-head ${isTurn ? "turn" : ""}">
          <span class="who">${esc(p.name)}${you}${off}</span>
          <span class="sc">${p.score}/10</span>
        </div>
        <div class="lane">${cards}</div>
      </div>`;
    })
    .join("");
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
