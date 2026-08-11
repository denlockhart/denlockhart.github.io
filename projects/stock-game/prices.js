/** Market Day price helpers — curated cross-sector list, 15-minute refresh. */

const PRICE_CACHE_KEY = "market-day-prices-v6";
const ET = "America/New_York";
const REFRESH_MS = 15 * 60 * 1000;
const TRADE_OPEN = { hour: 9, minute: 30 }; // 9:30 AM ET
const TRADE_CLOSE = { hour: 16, minute: 0 }; // 4:00 PM ET
const PRE_OPEN = { hour: 4, minute: 0 }; // 4:00 AM ET — quote updates resume (first quarter-hour)
const QUOTE_REFRESH_END = { hour: 20, minute: 15 }; // last quarter-hour update: 8:15 PM ET
const QUOTE_QUIET_START = { hour: 20, minute: 20 }; // 8:20 PM ET — no auto updates through 3:45 AM
const QUOTE_QUIET_END = { hour: 3, minute: 45 }; // 3:45 AM ET — last quiet minute
const LIVE_PRICES_URL = "prices-live.json";

let TICKERS = [];
let tickerBySymbol = new Map();
let catalogMeta = { source: "", asOf: "", count: 0, refreshMinutes: 15 };

function etParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

function etDateKeyFromParts(p) {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function etDateKey(d = new Date()) {
  return etDateKeyFromParts(etParts(d));
}

function isEtWeekend(d = new Date()) {
  const wd = etParts(d).weekday;
  return wd === "Sat" || wd === "Sun";
}

function etWallTimeToUtc(year, month, day, hour, minute = 0) {
  let guess = Date.UTC(year, month - 1, day, hour + 5, minute, 0);
  for (let i = 0; i < 6; i++) {
    const p = etParts(new Date(guess));
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = want - got;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

function shiftEtCalendarDays(year, month, day, deltaDays) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function etSessionBounds(from = new Date()) {
  const p = etParts(from);
  const open = etWallTimeToUtc(p.year, p.month, p.day, TRADE_OPEN.hour, TRADE_OPEN.minute);
  const close = etWallTimeToUtc(p.year, p.month, p.day, TRADE_CLOSE.hour, TRADE_CLOSE.minute);
  return { open, close, parts: p };
}

/** Regular trading session: Mon–Fri 9:30 AM–4:00 PM Eastern. */
function isTradingOpen(from = new Date()) {
  if (isEtWeekend(from)) return false;
  const { open, close } = etSessionBounds(from);
  const t = from.getTime();
  return t >= open.getTime() && t < close.getTime();
}

function tradingStatus(from = new Date()) {
  if (isTradingOpen(from)) {
    const { close } = etSessionBounds(from);
    return {
      open: true,
      label: "Market open",
      detail: `Closes ${close.toLocaleTimeString(undefined, { timeZone: ET, hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`,
      until: close,
    };
  }
  let cursor = new Date(from);
  for (let i = 0; i < 10; i++) {
    const { open, parts } = etSessionBounds(cursor);
    if (!isEtWeekend(open) && open.getTime() > from.getTime()) {
      return {
        open: false,
        label: "Market closed",
        detail: `Opens ${open.toLocaleString(undefined, { timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`,
        until: open,
      };
    }
    const ymd = shiftEtCalendarDays(parts.year, parts.month, parts.day, 1);
    cursor = etWallTimeToUtc(ymd.year, ymd.month, ymd.day, 12, 0);
  }
  return { open: false, label: "Market closed", detail: "Weekday 9:30 AM–4:00 PM Eastern", until: null };
}

function todayKey(d = new Date()) {
  return etDateKey(d);
}

/**
 * Which print to show:
 * - 9:30 AM–4:00 PM ET → regular
 * - 4:00 PM–4:00 AM ET → post
 * - 4:00 AM–9:30 AM ET → pre
 */
function priceSession(from = new Date()) {
  const p = etParts(from);
  const mins = p.hour * 60 + p.minute;
  const preStart = PRE_OPEN.hour * 60 + PRE_OPEN.minute;
  const regularStart = TRADE_OPEN.hour * 60 + TRADE_OPEN.minute;
  const regularEnd = TRADE_CLOSE.hour * 60 + TRADE_CLOSE.minute;
  if (mins >= preStart && mins < regularStart) return "pre";
  if (mins >= regularStart && mins < regularEnd) return "regular";
  return "post";
}

function priceSessionLabel(session = priceSession()) {
  if (session === "pre") return "Pre-market";
  if (session === "post") return "After hours";
  return "Regular";
}

function pickQuotePrice(q, session) {
  if (!q || typeof q !== "object") return null;
  if (session === "pre" && q.pre > 0) return q.pre;
  if (session === "post" && q.post > 0) return q.post;
  if (q.regular > 0) return q.regular;
  if (q.pre > 0) return q.pre;
  if (q.post > 0) return q.post;
  return null;
}

/** Build flat symbol→price map from quotes (preferred) or legacy prices. */
function resolveSessionPrices({ quotes = null, prices = null } = {}, from = new Date()) {
  const session = priceSession(from);
  const out = {};
  if (quotes && typeof quotes === "object") {
    for (const [sym, q] of Object.entries(quotes)) {
      const px = pickQuotePrice(q, session);
      if (px > 0) out[sym] = px;
    }
  }
  if (prices && typeof prices === "object") {
    for (const [sym, px] of Object.entries(prices)) {
      if (!(out[sym] > 0) && px > 0) out[sym] = px;
    }
  }
  return { session, prices: out };
}

function loadPriceCache() {
  try {
    return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function savePriceCache(payload) {
  localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(payload));
}

function cacheIsFresh(cached) {
  if (!cached?.fetchedAt || !cached.prices) return false;
  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  return age >= 0 && age < REFRESH_MS && Object.keys(cached.prices).length >= TICKERS.length * 0.8;
}

async function loadTickerCatalog() {
  if (TICKERS.length) return TICKERS;
  const res = await fetch("tickers.json");
  if (!res.ok) throw new Error(`tickers.json HTTP ${res.status}`);
  const data = await res.json();
  TICKERS = data.tickers || [];
  catalogMeta = {
    source: data.source || "ticker catalog",
    asOf: data.asOf || "",
    count: data.count || TICKERS.length,
    refreshMinutes: data.refreshMinutes || 15,
  };
  tickerBySymbol = new Map(TICKERS.map((t) => [t.symbol, t]));
  return TICKERS;
}

function seedPricesFromCatalog() {
  const prices = {};
  for (const t of TICKERS) {
    const px = t.last || t.previousClose;
    if (typeof px === "number" && px > 0) prices[t.symbol] = px;
  }
  return prices;
}

/**
 * Load published live sheet (updated by `npm run stock-game:prices` / GitHub Action).
 * This avoids broken browser CORS proxies to Yahoo.
 */
async function fetchLivePriceSheet({ force = false } = {}) {
  const bust = force ? `?t=${Date.now()}` : `?v=${Math.floor(Date.now() / REFRESH_MS)}`;
  const res = await fetch(`${LIVE_PRICES_URL}${bust}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`prices-live.json HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.prices || typeof data.prices !== "object") throw new Error("Invalid prices-live.json");
  return data;
}

/**
 * Returns price payload from prices-live.json (15-minute published sheet).
 */
async function getMarketPrices({ force = false, onProgress = null } = {}) {
  await loadTickerCatalog();

  const cached = loadPriceCache();
  if (!force && cacheIsFresh(cached)) {
    return applyCurrentSession({
      ...cached,
      catalogSource: catalogMeta.source,
      asOf: cached.asOf || catalogMeta.asOf,
    });
  }

  const seed = {
    date: todayKey(),
    source: "seed",
    asOf: catalogMeta.asOf,
    catalogSource: catalogMeta.source,
    liveCount: 0,
    total: TICKERS.length,
    refreshMinutes: catalogMeta.refreshMinutes || 15,
    prices: seedPricesFromCatalog(),
    fetchedAt: new Date().toISOString(),
  };
  if (onProgress) onProgress(seed);

  try {
    const live = await fetchLivePriceSheet({ force });
    const quotes = live.quotes && typeof live.quotes === "object" ? live.quotes : null;
    const resolved = resolveSessionPrices(
      { quotes, prices: { ...seed.prices, ...(live.prices || {}) } },
      new Date()
    );
    const payload = {
      date: todayKey(),
      source: live.source || "prices-live",
      asOf: catalogMeta.asOf,
      catalogSource: catalogMeta.source,
      liveCount: live.liveCount ?? Object.keys(resolved.prices).length,
      total: TICKERS.length,
      refreshMinutes: live.refreshMinutes || catalogMeta.refreshMinutes || 15,
      session: resolved.session,
      sessionLabel: priceSessionLabel(resolved.session),
      quotes,
      prices: resolved.prices,
      fetchedAt: live.fetchedAt || new Date().toISOString(),
      sheetAgeMs: live.fetchedAt ? Date.now() - new Date(live.fetchedAt).getTime() : null,
    };
    savePriceCache(payload);
    if (onProgress) onProgress(payload);
    return payload;
  } catch (err) {
    const fallback = {
      ...seed,
      source: "seed-fallback",
      session: priceSession(),
      sessionLabel: priceSessionLabel(),
      error: String(err.message || err),
      fetchedAt: new Date().toISOString(),
    };
    savePriceCache(fallback);
    if (onProgress) onProgress(fallback);
    return fallback;
  }
}

/** Re-pick the single display price if the ET session window changed. */
function applyCurrentSession(payload, from = new Date()) {
  if (!payload) return payload;
  const resolved = resolveSessionPrices(
    { quotes: payload.quotes, prices: payload.prices },
    from
  );
  return {
    ...payload,
    session: resolved.session,
    sessionLabel: priceSessionLabel(resolved.session),
    prices: resolved.prices,
  };
}

function searchTickers(query, limit = 50) {
  const q = String(query || "").trim().toUpperCase();
  if (!q) return TICKERS.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const t of TICKERS) {
    const sym = t.symbol.toUpperCase();
    const name = t.name.toUpperCase();
    const sector = (t.sector || "").toUpperCase();
    if (sym.startsWith(q)) starts.push(t);
    else if (sym.includes(q) || name.includes(q) || sector.includes(q)) contains.push(t);
  }
  return [...starts, ...contains].slice(0, limit);
}

function getTicker(symbol) {
  return tickerBySymbol.get(symbol) || null;
}

/** Eastern clock label for the current quarter-hour bucket (e.g. 2026-08-11T09:15). */
function etQuarterKey(from = new Date()) {
  const p = etParts(from);
  const q = Math.floor(p.minute / 15) * 15;
  return `${etDateKeyFromParts(p)}T${String(p.hour).padStart(2, "0")}:${String(q).padStart(2, "0")}`;
}

/**
 * Auto quote updates run on Eastern quarter-hours from 4:00 AM through 8:15 PM.
 * Quiet: 8:20 PM–3:45 AM Eastern.
 */
function isQuoteRefreshHours(from = new Date()) {
  const p = etParts(from);
  const mins = p.hour * 60 + p.minute;
  const quietFrom = QUOTE_QUIET_START.hour * 60 + QUOTE_QUIET_START.minute;
  const quietThrough = QUOTE_QUIET_END.hour * 60 + QUOTE_QUIET_END.minute;
  return !(mins >= quietFrom || mins <= quietThrough);
}

function nextEtWallAfter(from, hour, minute) {
  const p = etParts(from);
  let candidate = etWallTimeToUtc(p.year, p.month, p.day, hour, minute);
  if (candidate.getTime() <= from.getTime()) {
    const nd = shiftEtCalendarDays(p.year, p.month, p.day, 1);
    candidate = etWallTimeToUtc(nd.year, nd.month, nd.day, hour, minute);
  }
  return candidate;
}

/**
 * Next Eastern quarter-hour strictly after `from` within the update window
 * (4:00 AM–8:15 PM ET). Overnight quiet hours (8:20 PM–3:45 AM) jump to the next 4:00 AM.
 */
function nextQuoteRefreshAt(from = new Date()) {
  const p = etParts(from);
  let { year, month, day, hour } = p;
  let minute = Math.floor(p.minute / 15) * 15;
  let candidate = etWallTimeToUtc(year, month, day, hour, minute);
  if (candidate.getTime() <= from.getTime()) {
    minute += 15;
    if (minute >= 60) {
      minute = 0;
      hour += 1;
    }
    if (hour >= 24) {
      const nd = shiftEtCalendarDays(year, month, day, 1);
      year = nd.year;
      month = nd.month;
      day = nd.day;
      hour = 0;
    }
    candidate = etWallTimeToUtc(year, month, day, hour, minute);
  }

  if (!isQuoteRefreshHours(candidate)) {
    return nextEtWallAfter(from, PRE_OPEN.hour, PRE_OPEN.minute);
  }

  const cp = etParts(candidate);
  const candMins = cp.hour * 60 + cp.minute;
  const lastAllowed = QUOTE_REFRESH_END.hour * 60 + QUOTE_REFRESH_END.minute;
  if (candMins > lastAllowed) {
    return nextEtWallAfter(from, PRE_OPEN.hour, PRE_OPEN.minute);
  }

  return candidate;
}

function msUntilNextQuoteRefresh(from = new Date()) {
  return Math.max(0, nextQuoteRefreshAt(from) - from);
}

window.MarketDayPrices = {
  get TICKERS() {
    return TICKERS;
  },
  get catalogMeta() {
    return catalogMeta;
  },
  REFRESH_MS,
  ET,
  TRADE_OPEN,
  TRADE_CLOSE,
  PRE_OPEN,
  QUOTE_REFRESH_END,
  QUOTE_QUIET_START,
  QUOTE_QUIET_END,
  todayKey,
  etDateKey,
  priceSession,
  priceSessionLabel,
  resolveSessionPrices,
  applyCurrentSession,
  isTradingOpen,
  tradingStatus,
  isQuoteRefreshHours,
  nextQuoteRefreshAt,
  msUntilNextQuoteRefresh,
  etQuarterKey,
  loadTickerCatalog,
  getMarketPrices,
  searchTickers,
  getTicker,
};
