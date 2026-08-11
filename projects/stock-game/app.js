const STARTING_CASH = 10000;
const STORAGE_PREFIX = "market-day-room-";
const SESSION_KEY = "market-day-session-v1";

const $ = (sel) => document.querySelector(sel);

const lobby = $("#lobby");
const gameEl = $("#game");
const lobbyStatus = $("#lobby-status");
const priceStatus = $("#price-status");

let state = null; // room state (authoritative on host)
let you = { id: null, name: null, isHost: false };
let peer = null;
let hostConn = null; // guest → host
const guestConns = new Map(); // host: peerId → conn
let market = null; // price payload
let settleTimer = null;
let priceTimer = null;

function money(n) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function emptyPlayer(name, id = uid()) {
  return {
    id,
    name: name || "Trader",
    cash: STARTING_CASH,
    holdings: {}, // symbol → shares
    buysToday: [],
  };
}

function newRoom(hostName) {
  const host = emptyPlayer(hostName);
  return {
    code: roomCode(),
    createdAt: new Date().toISOString(),
    lastSettledDate: null,
    players: [host],
    hostPlayerId: host.id,
    log: [],
  };
}

function saveRoomLocal(room) {
  localStorage.setItem(STORAGE_PREFIX + room.code, JSON.stringify(room));
}

function loadRoomLocal(code) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + code.toUpperCase()) || "null");
  } catch {
    return null;
  }
}

function saveSession() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ code: state?.code, playerId: you.id, name: you.name, isHost: you.isHost, peerId: peer?.id || null })
  );
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function me() {
  return state?.players.find((p) => p.id === you.id) || null;
}

function holdingValue(player, prices) {
  let total = 0;
  for (const [sym, shares] of Object.entries(player.holdings || {})) {
    const px = prices[sym] ?? 0;
    total += shares * px;
  }
  return total;
}

function equity(player, prices) {
  return player.cash + holdingValue(player, prices);
}

function setStatus(el, msg, kind = "") {
  el.textContent = msg || "";
  el.dataset.kind = kind;
}

function broadcastState() {
  if (!you.isHost) return;
  saveRoomLocal(state);
  const payload = JSON.stringify({ type: "state", state });
  for (const conn of guestConns.values()) {
    if (conn.open) conn.send(payload);
  }
}

function applyRemoteState(next) {
  state = next;
  saveRoomLocal(state);
  render();
}

function msUntilNextSettle(from = new Date()) {
  return window.MarketDayPrices.msUntilNextSettle(from);
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

function settleLabel() {
  const next = window.MarketDayPrices.nextSettleAt(new Date(), { after: true });
  const when = next.toLocaleString(undefined, {
    timeZone: window.MarketDayPrices.ET,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${formatCountdown(window.MarketDayPrices.msUntilNextSettle())} · ${when}`;
}

async function ensurePrices(force = false) {
  setStatus(priceStatus, "Loading prior-close prices…");
  market = await window.MarketDayPrices.getMarketPrices({
    force,
    onProgress: (payload) => {
      market = payload;
      const note = priceNote(payload);
      setStatus(priceStatus, note, payload.source === "prior-close-seed" ? "" : "");
      renderPortfolio();
      renderLeaderboard();
      renderMarket();
    },
  });
  setStatus(priceStatus, priceNote(market));
  return market;
}

function priceNote(payload) {
  const when = payload.fetchedAt
    ? new Date(payload.fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  const mins = payload.refreshMinutes || window.MarketDayPrices.catalogMeta.refreshMinutes || 15;
  if (payload.source === "seed") {
    return `Seed prices loaded (${payload.total} names). Fetching Yahoo quotes…`;
  }
  return `Prices updated ${when || "just now"} · ${payload.liveCount || 0}/${payload.total || "?"} live · auto-refresh every ${mins} min`;
}

async function settleIfNeeded(force = false) {
  if (!state || !market) return;
  const session = window.MarketDayPrices.lastSettleKey();
  if (!force && state.lastSettledDate === session) return;

  const prices = market.prices;
  const snapshot = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    cash: p.cash,
    holdingsValue: holdingValue(p, prices),
    equity: equity(p, prices),
  }));
  state.lastSettledDate = session;
  state.lastSettlement = { date: session, at: new Date().toISOString(), snapshot };
  state.log.unshift({
    at: new Date().toISOString(),
    text: `6 PM ET settle ${session}: balances marked to latest prices.`,
  });
  state.log = state.log.slice(0, 20);
  for (const p of state.players) p.buysToday = [];
  if (you.isHost) broadcastState();
  else saveRoomLocal(state);
  render();
}

function assertTradingOpen() {
  const status = window.MarketDayPrices.tradingStatus();
  if (status.open) return true;
  setStatus(priceStatus, `Trading closed — ${status.detail}`, "warn");
  return false;
}

function buy(symbol, dollars) {
  if (!assertTradingOpen()) return;
  const player = me();
  if (!player || !market) return;
  const px = market.prices[symbol];
  if (!(px > 0)) return;
  const amount = Math.round(Number(dollars) * 100) / 100;
  if (!(amount > 0)) {
    setStatus(priceStatus, "Enter a dollar amount greater than 0.", "warn");
    return;
  }
  if (amount > player.cash) {
    setStatus(priceStatus, "Not enough cash.", "warn");
    return;
  }
  const shares = amount / px;
  player.cash = Math.round((player.cash - amount) * 100) / 100;
  player.holdings[symbol] = (player.holdings[symbol] || 0) + shares;
  player.buysToday.push({ symbol, dollars: amount, shares, price: px, at: new Date().toISOString() });
  if (you.isHost) broadcastState();
  else sendToHost({ type: "buy", playerId: you.id, symbol, dollars: amount });
  render();
}

function sellAll(symbol) {
  if (!assertTradingOpen()) return;
  const player = me();
  if (!player || !market) return;
  const shares = player.holdings[symbol] || 0;
  if (!(shares > 0)) return;
  const px = market.prices[symbol];
  const proceeds = Math.round(shares * px * 100) / 100;
  player.cash = Math.round((player.cash + proceeds) * 100) / 100;
  delete player.holdings[symbol];
  if (you.isHost) broadcastState();
  else sendToHost({ type: "sell", playerId: you.id, symbol });
  render();
}

function sendToHost(msg) {
  if (hostConn?.open) hostConn.send(JSON.stringify(msg));
}

function handleHostMessage(conn, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "hello") {
    const existing = state.players.find((p) => p.name.toLowerCase() === String(msg.name || "").toLowerCase());
    let player = existing;
    if (!player) {
      player = emptyPlayer(msg.name || "Trader");
      state.players.push(player);
    }
    conn.playerId = player.id;
    conn.send(JSON.stringify({ type: "welcome", playerId: player.id, state }));
    broadcastState();
    render();
    return;
  }
  const player = state.players.find((p) => p.id === msg.playerId);
  if (!player || !market) return;
  if ((msg.type === "buy" || msg.type === "sell") && !window.MarketDayPrices.isTradingOpen()) {
    broadcastState();
    return;
  }

  if (msg.type === "buy") {
    const px = market.prices[msg.symbol];
    const amount = Math.round(Number(msg.dollars) * 100) / 100;
    if (!(px > 0) || !(amount > 0) || amount > player.cash) return;
    const shares = amount / px;
    player.cash = Math.round((player.cash - amount) * 100) / 100;
    player.holdings[msg.symbol] = (player.holdings[msg.symbol] || 0) + shares;
    broadcastState();
    render();
  }
  if (msg.type === "sell") {
    const shares = player.holdings[msg.symbol] || 0;
    if (!(shares > 0)) return;
    const px = market.prices[msg.symbol];
    const proceeds = Math.round(shares * px * 100) / 100;
    player.cash = Math.round((player.cash + proceeds) * 100) / 100;
    delete player.holdings[msg.symbol];
    broadcastState();
    render();
  }
}

function wireConn(conn, role) {
  conn.on("data", (raw) => {
    if (role === "host") handleHostMessage(conn, raw);
    else {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "welcome") {
        you.id = msg.playerId;
        applyRemoteState(msg.state);
        saveSession();
        if (typeof peer?._joinResolve === "function") {
          peer._joinResolve();
          peer._joinResolve = null;
        }
      }
      if (msg.type === "state") applyRemoteState(msg.state);
    }
  });
  conn.on("close", () => {
    if (role === "host") guestConns.delete(conn.peer);
  });
}

async function startHostPeer(room) {
  return new Promise((resolve, reject) => {
    const peerId = `marketday-${room.code}`;
    peer = new Peer(peerId);
    peer.on("open", (id) => {
      room.hostPeerId = id;
      saveRoomLocal(room);
      resolve(id);
    });
    peer.on("connection", (conn) => {
      guestConns.set(conn.peer, conn);
      wireConn(conn, "host");
    });
    peer.on("error", (err) => {
      if (err?.type === "unavailable-id") {
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
        peer = new Peer();
        peer.on("open", (id) => {
          room.hostPeerId = id;
          saveRoomLocal(room);
          resolve(id);
        });
        peer.on("connection", (conn) => {
          guestConns.set(conn.peer, conn);
          wireConn(conn, "host");
        });
        peer.on("error", reject);
      } else {
        reject(err);
      }
    });
  });
}

async function joinHostPeer(hostPeerId, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Join timed out")), 12000);
    peer = new Peer();
    peer._joinResolve = () => {
      clearTimeout(timer);
      resolve();
    };
    peer.on("open", () => {
      hostConn = peer.connect(hostPeerId, { reliable: true });
      hostConn.on("open", () => {
        wireConn(hostConn, "guest");
        hostConn.send(JSON.stringify({ type: "hello", name }));
      });
      hostConn.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    peer.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function showGame() {
  lobby.classList.add("hidden");
  gameEl.classList.remove("hidden");
}

function showLobby() {
  gameEl.classList.add("hidden");
  lobby.classList.remove("hidden");
}

function renderMarket() {
  const body = $("#market-body");
  body.innerHTML = "";
  if (!market) return;
  const q = ($("#market-search")?.value || "").trim();
  const rows = window.MarketDayPrices.searchTickers(q, 50);
  $("#market-count").textContent = q
    ? `${rows.length} matches`
    : `${rows.length} companies · 8 sectors`;

  for (const t of rows) {
    const px = market.prices[t.symbol];
    if (!(px > 0)) continue;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${t.symbol}</strong></td>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.sector || "—")}</td>
      <td>${money(px)}</td>
      <td><input type="number" min="1" step="1" value="500" data-buy="${t.symbol}" aria-label="Dollars to buy ${t.symbol}"></td>
      <td><button type="button" class="cta small" data-buy-btn="${t.symbol}">Buy</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll("[data-buy-btn]").forEach((btn) => {
    const open = window.MarketDayPrices.isTradingOpen();
    btn.disabled = !open;
    btn.title = open ? "Buy" : "Trading closed (9:30 AM–4:30 PM Eastern weekdays)";
    btn.addEventListener("click", () => {
      const sym = btn.getAttribute("data-buy-btn");
      const input = body.querySelector(`input[data-buy="${sym}"]`);
      buy(sym, input.value);
    });
  });
}

function renderPortfolio() {
  const player = me();
  const box = $("#portfolio");
  if (!player || !market) {
    box.textContent = "—";
    return;
  }
  const entries = Object.entries(player.holdings).filter(([, s]) => s > 0);
  $("#stat-cash").textContent = money(player.cash);
  const hv = holdingValue(player, market.prices);
  $("#stat-holdings").textContent = money(hv);
  $("#stat-equity").textContent = money(player.cash + hv);

  if (!entries.length) {
    box.className = "portfolio empty";
    box.textContent = "No shares yet.";
    return;
  }
  box.className = "portfolio";
  box.innerHTML = entries
    .map(([sym, shares]) => {
      const px = market.prices[sym];
      const val = shares * px;
      return `<div class="holding">
        <div><strong>${sym}</strong> · ${shares.toFixed(4)} sh @ ${money(px)}</div>
        <div class="holding-right">
          <span>${money(val)}</span>
          <button type="button" class="linkish" data-sell="${sym}" ${window.MarketDayPrices.isTradingOpen() ? "" : "disabled"}>Sell</button>
        </div>
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-sell]").forEach((btn) => {
    btn.addEventListener("click", () => sellAll(btn.getAttribute("data-sell")));
  });
}

function renderLeaderboard() {
  const ol = $("#leaderboard");
  if (!state || !market) {
    ol.innerHTML = "";
    return;
  }
  const ranked = [...state.players].sort((a, b) => equity(b, market.prices) - equity(a, market.prices));
  ol.innerHTML = ranked
    .map((p, i) => {
      const eq = equity(p, market.prices);
      const youCls = p.id === you.id ? " you" : "";
      return `<li class="${youCls}"><span>${i + 1}. ${escapeHtml(p.name)}</span><strong>${money(eq)}</strong></li>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  if (!state) return;
  $("#room-code-display").textContent = state.code;
  $("#you-name").textContent = me()?.name || you.name || "—";
  renderMarket();
  renderPortfolio();
  renderLeaderboard();
  tickCountdown();
}

function tickCountdown() {
  $("#next-settle").textContent = settleLabel();
  const status = window.MarketDayPrices.tradingStatus();
  const el = $("#trade-hours-status");
  if (el) {
    el.textContent = status.open
      ? `Open · ${status.detail}`
      : `Closed · ${status.detail}`;
    el.dataset.open = status.open ? "1" : "0";
  }
  document.body.classList.toggle("market-closed", !status.open);
}

function scheduleSettleWatch() {
  clearInterval(settleTimer);
  settleTimer = setInterval(async () => {
    tickCountdown();
    const session = window.MarketDayPrices.lastSettleKey();
    if (state && state.lastSettledDate !== session) {
      await ensurePrices(true);
      if (you.isHost || !state.hostPeerId) await settleIfNeeded(true);
    }
  }, 1000);
}

function schedulePriceRefresh() {
  clearInterval(priceTimer);
  const ms = window.MarketDayPrices.REFRESH_MS || 15 * 60 * 1000;
  priceTimer = setInterval(async () => {
    if (!state) return;
    await ensurePrices(true);
    render();
  }, ms);
}

async function enterRoom(room, playerId, name, isHost) {
  state = room;
  you = { id: playerId, name, isHost };
  saveRoomLocal(room);
  saveSession();
  showGame();
  await ensurePrices();
  await settleIfNeeded();
  render();
  scheduleSettleWatch();
  schedulePriceRefresh();
}

async function createGame() {
  const name = ($("#player-name").value || "Host").trim();
  setStatus(lobbyStatus, "Creating room…");
  const room = newRoom(name);
  try {
    await startHostPeer(room);
    await enterRoom(room, room.hostPlayerId, name, true);
    setStatus(lobbyStatus, "");
  } catch (err) {
    // Offline / PeerJS blocked — still playable same-browser / shared device
    room.hostPeerId = null;
    await enterRoom(room, room.hostPlayerId, name, true);
    setStatus(priceStatus, "Realtime sync unavailable — room works on this device; share code still shown for local rejoins.", "warn");
  }
}

async function joinGame() {
  const name = ($("#player-name").value || "Trader").trim();
  const code = ($("#join-code").value || "").trim().toUpperCase();
  if (!code) {
    setStatus(lobbyStatus, "Enter a room code.", "warn");
    return;
  }
  setStatus(lobbyStatus, "Joining…");

  const peerId = `marketday-${code}`;
  if (window.Peer) {
    try {
      you = { id: null, name, isHost: false };
      state = { code, players: [], hostPeerId: peerId };
      showGame();
      await ensurePrices();
      await joinHostPeer(peerId, name);
      scheduleSettleWatch();
      schedulePriceRefresh();
      setStatus(lobbyStatus, "");
      return;
    } catch {
      try {
        peer?.destroy();
      } catch {
        /* ignore */
      }
      peer = null;
      hostConn = null;
      showLobby();
    }
  }

  const local = loadRoomLocal(code);
  if (local) {
    let player = local.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!player) {
      player = emptyPlayer(name);
      local.players.push(player);
    }
    await enterRoom(local, player.id, name, local.hostPlayerId === player.id);
    setStatus(lobbyStatus, "");
    setStatus(priceStatus, "Joined local room copy. For live multiplayer, join while the host’s tab is open.", "warn");
    return;
  }

  setStatus(lobbyStatus, "Could not reach host. Ask them to keep their Market Day tab open, then try again.", "warn");
}

function leaveGame() {
  try {
    peer?.destroy();
  } catch {
    /* ignore */
  }
  peer = null;
  hostConn = null;
  guestConns.clear();
  clearInterval(settleTimer);
  clearInterval(priceTimer);
  state = null;
  clearSession();
  showLobby();
  setStatus(lobbyStatus, "Left room.");
}

$("#btn-create").addEventListener("click", () => createGame());
$("#btn-join").addEventListener("click", () => joinGame());
$("#btn-leave").addEventListener("click", () => leaveGame());
$("#btn-refresh-prices").addEventListener("click", async () => {
  await ensurePrices(true);
  render();
});
$("#market-search")?.addEventListener("input", () => renderMarket());
$("#btn-copy").addEventListener("click", async () => {
  if (!state) return;
  try {
    await navigator.clipboard.writeText(state.code);
    setStatus(priceStatus, `Copied room code ${state.code}`);
  } catch {
    setStatus(priceStatus, `Room code: ${state.code}`);
  }
});

(async function boot() {
  const session = loadSession();
  if (!session?.code) return;
  const room = loadRoomLocal(session.code);
  if (!room) return;
  $("#player-name").value = session.name || "";
  try {
    if (session.isHost) {
      await startHostPeer(room);
      await enterRoom(room, session.playerId, session.name, true);
    } else if (room.hostPeerId) {
      you = { id: session.playerId, name: session.name, isHost: false };
      state = room;
      showGame();
      await ensurePrices();
      await joinHostPeer(room.hostPeerId, session.name);
      scheduleSettleWatch();
      schedulePriceRefresh();
      render();
    } else {
      await enterRoom(room, session.playerId, session.name, false);
    }
  } catch {
    await enterRoom(room, session.playerId, session.name, !!session.isHost);
  }
})();
