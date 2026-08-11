/** Market Day price helpers — curated cross-sector list, 15-minute refresh. */

const PRICE_CACHE_KEY = "market-day-prices-v4";
const ET = "America/New_York";
const SETTLE_HOUR_ET = 18; // 6:00 PM Eastern
const REFRESH_MS = 15 * 60 * 1000;
const TRADE_OPEN = { hour: 9, minute: 30 }; // 9:30 AM ET
const TRADE_CLOSE = { hour: 16, minute: 30 }; // 4:30 PM ET

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

function etSettleInstantOnDate(d = new Date()) {
  const p = etParts(d);
  return etWallTimeToUtc(p.year, p.month, p.day, SETTLE_HOUR_ET, 0);
}

function nextSettleAt(from = new Date(), { after = false } = {}) {
  let ymd = etParts(from);
  for (let i = 0; i < 12; i++) {
    const settle = etWallTimeToUtc(ymd.year, ymd.month, ymd.day, SETTLE_HOUR_ET, 0);
    const weekdayOk = !isEtWeekend(settle);
    const timeOk = after ? settle.getTime() > from.getTime() : settle.getTime() >= from.getTime();
    if (weekdayOk && timeOk) return settle;
    ymd = shiftEtCalendarDays(ymd.year, ymd.month, ymd.day, 1);
  }
  return etSettleInstantOnDate(from);
}

function etSessionBounds(from = new Date()) {
  const p = etParts(from);
  const open = etWallTimeToUtc(p.year, p.month, p.day, TRADE_OPEN.hour, TRADE_OPEN.minute);
  const close = etWallTimeToUtc(p.year, p.month, p.day, TRADE_CLOSE.hour, TRADE_CLOSE.minute);
  return { open, close, parts: p };
}

/** Regular trading session: Mon–Fri 9:30 AM–4:30 PM Eastern. */
function isTradingOpen(from = new Date()) {
  if (isEtWeekend(from)) return false;
  const { open, close } = etSessionBounds(from);
  const t = from.getTime();
  return t >= open.getTime() && t < close.getTime();
}

function nextTradeOpenAt(from = new Date()) {
  let cursor = new Date(from);
  for (let i = 0; i < 10; i++) {
    const { open, close, parts } = etSessionBounds(cursor);
    if (!isEtWeekend(cursor) && from.getTime() < open.getTime()) return open;
    if (!isEtWeekend(cursor) && from.getTime() >= open.getTime() && from.getTime() < close.getTime()) {
      return open; // already open — "next open" for display of today's open
    }
    const ymd = shiftEtCalendarDays(parts.year, parts.month, parts.day, 1);
    cursor = etWallTimeToUtc(ymd.year, ymd.month, ymd.day, 12, 0);
  }
  return from;
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
  // Find next open strictly in the future
  let cursor = new Date(from);
  for (let i = 0; i < 10; i++) {
    const { open, close, parts } = etSessionBounds(cursor);
    if (!isEtWeekend(open) && open.getTime() > from.getTime()) {
      return {
        open: false,
        label: "Market closed",
        detail: `Opens ${open.toLocaleString(undefined, { timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`,
        until: open,
      };
    }
    if (!isEtWeekend(open) && from.getTime() < close.getTime() && from.getTime() >= open.getTime()) {
      // shouldn't happen if isTradingOpen false
    }
    const ymd = shiftEtCalendarDays(parts.year, parts.month, parts.day, 1);
    cursor = etWallTimeToUtc(ymd.year, ymd.month, ymd.day, 12, 0);
  }
  return { open: false, label: "Market closed", detail: "Weekday 9:30 AM–4:30 PM Eastern", until: null };
}

function lastSettleKey(from = new Date()) {
  let ymd = etParts(from);
  for (let i = 0; i < 12; i++) {
    const settle = etWallTimeToUtc(ymd.year, ymd.month, ymd.day, SETTLE_HOUR_ET, 0);
    if (!isEtWeekend(settle) && settle.getTime() <= from.getTime()) {
      return etDateKeyFromParts(etParts(settle));
    }
    ymd = shiftEtCalendarDays(ymd.year, ymd.month, ymd.day, -1);
  }
  return etDateKey(from);
}

function todayKey(d = new Date()) {
  return lastSettleKey(d);
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

/** Latest trade / mark: prefer regularMarketPrice, else prior close. */
async function fetchYahooLastPrice(symbol) {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const proxies = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  let lastErr;
  for (const wrap of proxies) {
    try {
      const res = await fetch(wrap(target), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
      const closes = (quote?.close || []).filter((n) => typeof n === "number");
      const price =
        (typeof meta?.regularMarketPrice === "number" && meta.regularMarketPrice) ||
        closes[closes.length - 1] ||
        (typeof meta?.chartPreviousClose === "number" && meta.chartPreviousClose) ||
        (typeof meta?.previousClose === "number" && meta.previousClose);
      if (typeof price !== "number" || !(price > 0)) throw new Error("No price");
      return Math.round(price * 100) / 100;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Price fetch failed");
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Returns price payload. Uses 15-minute cache; refreshes all curated names from Yahoo.
 */
async function getMarketPrices({ force = false, onProgress = null } = {}) {
  await loadTickerCatalog();
  const cached = loadPriceCache();
  if (!force && cacheIsFresh(cached)) {
    return { ...cached, catalogSource: catalogMeta.source, asOf: cached.asOf || catalogMeta.asOf };
  }

  const prices = seedPricesFromCatalog();
  let payload = {
    date: todayKey(),
    source: "seed",
    asOf: catalogMeta.asOf,
    catalogSource: catalogMeta.source,
    liveCount: 0,
    total: TICKERS.length,
    refreshMinutes: catalogMeta.refreshMinutes || 15,
    prices,
    fetchedAt: new Date().toISOString(),
  };
  savePriceCache(payload);
  if (onProgress) onProgress(payload);

  payload = await refreshAllPrices(payload, onProgress);
  return payload;
}

async function refreshAllPrices(basePayload, onProgress) {
  const prices = { ...basePayload.prices };
  let live = 0;

  for (const batch of chunk(TICKERS.map((t) => t.symbol), 8)) {
    await Promise.all(
      batch.map(async (symbol) => {
        try {
          prices[symbol] = await fetchYahooLastPrice(symbol);
          live += 1;
        } catch {
          /* keep seed */
        }
      })
    );
    const next = {
      ...basePayload,
      source: live > 0 ? "yahoo-15m" : basePayload.source,
      liveCount: live,
      prices: { ...prices },
      fetchedAt: new Date().toISOString(),
    };
    savePriceCache(next);
    if (onProgress) onProgress(next);
    basePayload = next;
    await new Promise((r) => setTimeout(r, 100));
  }
  return basePayload;
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

window.MarketDayPrices = {
  get TICKERS() {
    return TICKERS;
  },
  get catalogMeta() {
    return catalogMeta;
  },
  REFRESH_MS,
  ET,
  SETTLE_HOUR_ET,
  TRADE_OPEN,
  TRADE_CLOSE,
  todayKey,
  etDateKey,
  lastSettleKey,
  nextSettleAt,
  isTradingOpen,
  tradingStatus,
  msUntilNextSettle(from = new Date()) {
    return Math.max(0, nextSettleAt(from, { after: true }) - from);
  },
  loadTickerCatalog,
  getMarketPrices,
  searchTickers,
  getTicker,
};
