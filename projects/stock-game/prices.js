/** EOD / prior-close helpers for Market Day (top ~1000 names). */

const PRICE_CACHE_KEY = "market-day-prices-v2";

let TICKERS = [];
let tickerBySymbol = new Map();
let catalogMeta = { source: "", asOf: "", count: 0 };

function todayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD local
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
  todayKey,
  loadTickerCatalog,
  getMarketPrices,
  searchTickers,
  getTicker,
};
