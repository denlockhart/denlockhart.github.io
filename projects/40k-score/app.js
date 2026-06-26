const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_HISTORY = 30;
const MAX_ROUND = 5;

let db = null;
let roomId = null;
let roomPin = null;
let unsubscribe = null;

const views = {
  setupError: document.getElementById("view-setup-error"),
  home: document.getElementById("view-home"),
  display: document.getElementById("view-display"),
  controlJoin: document.getElementById("view-control-join"),
  control: document.getElementById("view-control"),
};

function isConfigured() {
  const cfg = window.FIREBASE_CONFIG;
  return cfg && cfg.apiKey && !cfg.apiKey.includes("YOUR_") && cfg.databaseURL && !cfg.databaseURL.includes("YOUR_");
}

function initFirebase() {
  if (!isConfigured()) return false;
  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  db = firebase.database();
  return true;
}

function getView() {
  return new URLSearchParams(location.search).get("view") || "home";
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", key !== name);
  });
}

function defaultState() {
  return {
    round: 1,
    players: [
      { name: "Player 1", vp: 0, cp: 0 },
      { name: "Player 2", vp: 0, cp: 0 },
    ],
    history: [],
  };
}

function randomRoomId() {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return id;
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function gameRef(id) {
  return db.ref("games/" + id);
}

function stateRef(id) {
  return gameRef(id).child("state");
}

function controlJoinUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set("view", "control");
  url.searchParams.set("room", id);
  return url.toString();
}

function updateQr(id) {
  const img = document.getElementById("display-qr");
  const joinUrl = controlJoinUrl(id);
  img.src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" + encodeURIComponent(joinUrl);
  document.getElementById("display-join-url").textContent = joinUrl;
}

function renderDisplay(state) {
  document.getElementById("display-round-label").textContent = "Battle Round " + state.round;
  document.getElementById("display-p1-name").textContent = state.players[0].name;
  document.getElementById("display-p2-name").textContent = state.players[1].name;
  document.getElementById("display-p1-vp").textContent = state.players[0].vp;
  document.getElementById("display-p2-vp").textContent = state.players[1].vp;
  document.getElementById("display-p1-cp").textContent = state.players[0].cp;
  document.getElementById("display-p2-cp").textContent = state.players[1].cp;
}

function renderControl(state) {
  document.getElementById("control-round").textContent = state.round;
  document.getElementById("control-round-big").textContent = state.round;

  [0, 1].forEach((i) => {
    const p = state.players[i];
    document.getElementById("control-p" + (i + 1) + "-name").value = p.name;
    document.getElementById("control-p" + (i + 1) + "-vp").textContent = p.vp;
    document.getElementById("control-p" + (i + 1) + "-cp").textContent = p.cp;
    document.getElementById("control-p" + (i + 1) + "-heading").textContent = p.name || ("Player " + (i + 1));
  });

  document.getElementById("btn-undo").disabled = !state.history || state.history.length === 0;
}

function subscribeState(id, onData) {
  if (unsubscribe) unsubscribe();
  const handler = (snap) => {
    const val = snap.val();
    if (val) onData(val);
  };
  stateRef(id).on("value", handler);
  unsubscribe = () => stateRef(id).off("value", handler);
}

function pushHistory(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.history;
  const history = (state.history || []).slice(-(MAX_HISTORY - 1));
  history.push(copy);
  return history;
}

function applyStateUpdate(mutator) {
  return stateRef(roomId).transaction((current) => {
    if (!current) return current;
    const next = JSON.parse(JSON.stringify(current));
    mutator(next);
    next.history = pushHistory(current);
    next.updatedAt = Date.now();
    return next;
  });
}

async function createGame() {
  const id = randomRoomId();
  const pin = randomPin();
  const payload = {
    pin,
    state: defaultState(),
    createdAt: Date.now(),
  };
  await gameRef(id).set(payload);
  sessionStorage.setItem("40k-score-room", id);
  sessionStorage.setItem("40k-score-pin", pin);
  sessionStorage.setItem("40k-score-role", "display");
  roomId = id;
  roomPin = pin;
  document.getElementById("display-room-code").textContent = id;
  document.getElementById("display-room-pin").textContent = pin;
  updateQr(id);
  subscribeState(id, renderDisplay);
}

async function verifyJoin(id, pin) {
  const snap = await gameRef(id.toUpperCase()).once("value");
  const data = snap.val();
  if (!data) throw new Error("Room not found. Check the code on the TV.");
  if (String(data.pin) !== String(pin)) throw new Error("Wrong PIN.");
  return id.toUpperCase();
}

async function joinGame(id, pin) {
  const validId = await verifyJoin(id, pin);
  roomId = validId;
  roomPin = String(pin);
  sessionStorage.setItem("40k-score-room", roomId);
  sessionStorage.setItem("40k-score-pin", roomPin);
  sessionStorage.setItem("40k-score-role", "control");
  document.getElementById("control-room-code").textContent = roomId;
  subscribeState(roomId, renderControl);
  showView("control");
}

function adjustScore(playerIndex, field, delta) {
  applyStateUpdate((state) => {
    const val = state.players[playerIndex][field] + delta;
    state.players[playerIndex][field] = field === "vp" ? Math.max(0, val) : Math.max(0, val);
  });
}

function setPlayerName(playerIndex, name) {
  applyStateUpdate((state) => {
    state.players[playerIndex].name = name.trim().slice(0, 32) || ("Player " + (playerIndex + 1));
  });
}

function adjustRound(delta) {
  applyStateUpdate((state) => {
    state.round = Math.max(1, Math.min(MAX_ROUND, state.round + delta));
  });
}

function undoLast() {
  stateRef(roomId).transaction((current) => {
    if (!current || !current.history || !current.history.length) return;
    const history = current.history.slice();
    const previous = history.pop();
    previous.history = history;
    previous.updatedAt = Date.now();
    return previous;
  });
}

async function initDisplay() {
  showView("display");
  const savedRoom = sessionStorage.getItem("40k-score-room");
  const savedPin = sessionStorage.getItem("40k-score-pin");
  const savedRole = sessionStorage.getItem("40k-score-role");

  if (savedRoom && savedPin && savedRole === "display") {
    const snap = await gameRef(savedRoom).once("value");
    if (snap.val()) {
      roomId = savedRoom;
      roomPin = savedPin;
      document.getElementById("display-room-code").textContent = roomId;
      document.getElementById("display-room-pin").textContent = roomPin;
      updateQr(roomId);
      subscribeState(roomId, renderDisplay);
      return;
    }
  }

  await createGame();
}

function initControlJoin() {
  showView("controlJoin");
  const params = new URLSearchParams(location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    document.getElementById("join-room").value = roomParam.toUpperCase();
  }

  const savedRoom = sessionStorage.getItem("40k-score-room");
  const savedPin = sessionStorage.getItem("40k-score-pin");
  const savedRole = sessionStorage.getItem("40k-score-role");
  if (savedRoom && savedPin && savedRole === "control") {
    joinGame(savedRoom, savedPin).catch((err) => {
      document.getElementById("join-error").textContent = err.message;
      document.getElementById("join-error").classList.remove("hidden");
    });
  }
}

function bindControlEvents() {
  document.getElementById("btn-join").onclick = async () => {
    const id = document.getElementById("join-room").value.trim();
    const pin = document.getElementById("join-pin").value.trim();
    const errEl = document.getElementById("join-error");
    errEl.classList.add("hidden");
    if (!id || !pin) {
      errEl.textContent = "Enter the room code and PIN from the TV.";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      await joinGame(id, pin);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  };

  document.querySelectorAll(".step-btn[data-player]").forEach((btn) => {
    btn.addEventListener("click", () => {
      adjustScore(
        parseInt(btn.dataset.player, 10),
        btn.dataset.field,
        parseInt(btn.dataset.delta, 10)
      );
    });
  });

  document.getElementById("control-p1-name").addEventListener("change", (e) => setPlayerName(0, e.target.value));
  document.getElementById("control-p2-name").addEventListener("change", (e) => setPlayerName(1, e.target.value));

  document.getElementById("btn-round-up").onclick = () => adjustRound(1);
  document.getElementById("btn-round-down").onclick = () => adjustRound(-1);
  document.getElementById("btn-undo").onclick = undoLast;
  document.getElementById("btn-leave").onclick = () => {
    if (unsubscribe) unsubscribe();
    sessionStorage.removeItem("40k-score-room");
    sessionStorage.removeItem("40k-score-pin");
    sessionStorage.removeItem("40k-score-role");
    location.href = "?view=control";
  };
}

function bindDisplayEvents() {
  document.getElementById("btn-new-game").onclick = async () => {
    if (!confirm("Start a new game? This resets scores for everyone.")) return;
    if (unsubscribe) unsubscribe();
    sessionStorage.removeItem("40k-score-room");
    sessionStorage.removeItem("40k-score-pin");
    await createGame();
  };
}

function init() {
  if (!initFirebase()) {
    showView("setupError");
    return;
  }

  bindControlEvents();
  bindDisplayEvents();

  const view = getView();
  if (view === "display") {
    initDisplay();
  } else if (view === "control") {
    initControlJoin();
  } else {
    showView("home");
  }
}

init();
