/** EOD / prior-close helpers for Market Day (top ~1000 names). */

const PRICE_CACHE_KEY = "market-day-prices-v3";
const ET = "America/New_York";
const SETTLE_HOUR_ET = 18; // 6:00 PM Eastern (after 4 PM market close)

let TICKERS = [];
let tickerBySymbol = new Map();
let catalogMeta = { source: "", asOf: "", count: 0 };

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
    weekday: get("weekday"), // Sun, Mon, ...
  };
}

function etDateKeyFromParts(p) {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function etDateKey(d = new Date()) {
  return etDateKeyFromParts(etParts(d));
}

function isEtWeekendParts(p) {
  return p.weekday === "Sat" || p.weekday === "Sun";
}

function isEtWeekend(d = new Date()) {
  return isEtWeekendParts(etParts(d));
}

/** UTC Date for y-m-d hour:minute in America/New_York. */
function etWallTimeToUtc(year, month, day, hour, minute = 0) {
  let guess = Date.UTC(year, month - 1, day, hour + 5, minute, 0); // EST-ish seed
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
  const utc = Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0);
  const p = etParts(new Date(utc));
  // Midday UTC can still be previous ET day near boundaries; use the UTC date parts instead
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

/** 6:00 PM Eastern on the Eastern calendar date of `d`. */
function etSettleInstantOnDate(d = new Date()) {
  const p = etParts(d);
  return etWallTimeToUtc(p.year, p.month, p.day, SETTLE_HOUR_ET, 0);
}

/** Next Mon–Fri 6:00 PM Eastern strictly after `from` when after=true; else at or after. */
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

/**
 * Most recent Mon–Fri 6:00 PM Eastern that has already occurred.
 * Settle session key = that Eastern calendar date (YYYY-MM-DD).
 */
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

/** Alias used by price cache / settle checks = last completed 6 PM ET session. */
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
  };
  tickerBySymbol = new Map(TICKERS.map((t) => [t.symbol, t]));
  return TICKERS;
}

function seedPricesFromCatalog() {
  const prices = {};
  for (const t of TICKERS) {
    if (typeof t.previousClose === "number" && t.previousClose > 0) {
      prices[t.symbol] = t.previousClose;
    }
  }
  return prices;
}

/** Prefer prior close (last night), not live intraday. */
async function fetchYahooPreviousClose(symbol) {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
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
      const priorClose =
        (typeof meta?.chartPreviousClose === "number" && meta.chartPreviousClose) ||
        (typeof meta?.previousClose === "number" && meta.previousClose) ||
        (closes.length >= 2 ? closes[closes.length - 2] : null) ||
        closes[closes.length - 1];
      if (typeof priorClose !== "number" || !(priorClose > 0)) throw new Error("No prior close");
      return Math.round(priorClose * 100) / 100;
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
 * Returns { date, source, prices, asOf, catalogSource, liveCount, total }
 * Starts from catalog prior closes (last available IWB holdings prices),
 * then optionally refreshes from Yahoo previousClose in the background.
 */
async function getMarketPrices({ force = false, onProgress = null } = {}) {
  await loadTickerCatalog();
  const date = todayKey();
  const cached = loadPriceCache();
  if (!force && cached?.date === date && cached.prices && Object.keys(cached.prices).length >= 500) {
    return { ...cached, catalogSource: catalogMeta.source, asOf: cached.asOf || catalogMeta.asOf };
  }

  const prices = seedPricesFromCatalog();
  const payload = {
    date,
    source: "prior-close-seed",
    asOf: catalogMeta.asOf,
    catalogSource: catalogMeta.source,
    liveCount: 0,
    total: TICKERS.length,
    prices,
    fetchedAt: new Date().toISOString(),
  };
  savePriceCache(payload);
  if (onProgress) onProgress(payload);

  // Background refresh: prior close from Yahoo for as many names as proxies allow.
  refreshPriorClosesInBackground(payload, onProgress);
  return payload;
}

async function refreshPriorClosesInBackground(basePayload, onProgress) {
  const symbols = TICKERS.map((t) => t.symbol);
  let live = 0;
  const prices = { ...basePayload.prices };

  for (const batch of chunk(symbols, 8)) {
    await Promise.all(
      batch.map(async (symbol) => {
        try {
          prices[symbol] = await fetchYahooPreviousClose(symbol);
          live += 1;
        } catch {
          /* keep seed */
        }
      })
    );
    const next = {
      ...basePayload,
      source: live > 0 ? "prior-close-refresh" : basePayload.source,
      liveCount: live,
      prices: { ...prices },
      fetchedAt: new Date().toISOString(),
    };
    savePriceCache(next);
    if (onProgress) onProgress(next);
    await new Promise((r) => setTimeout(r, 150));
  }
}

function searchTickers(query, limit = 40) {
  const q = String(query || "").trim().toUpperCase();
  if (!q) return TICKERS.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const t of TICKERS) {
    const sym = t.symbol.toUpperCase();
    const name = t.name.toUpperCase();
    if (sym.startsWith(q)) starts.push(t);
    else if (sym.includes(q) || name.includes(q)) contains.push(t);
    if (starts.length >= limit) break;
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
  ET,
  SETTLE_HOUR_ET,
  todayKey,
  etDateKey,
  lastSettleKey,
  nextSettleAt,
  msUntilNextSettle(from = new Date()) {
    return Math.max(0, nextSettleAt(from, { after: true }) - from);
  },
  loadTickerCatalog,
  getMarketPrices,
  searchTickers,
  getTicker,
};
