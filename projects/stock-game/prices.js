/** EOD / last price helpers for Market Day. */

const TICKERS = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "XOM", name: "Exxon" },
  { symbol: "KO", name: "Coca-Cola" },
];

/** Reasonable fallbacks if live fetch fails (game still playable). */
const FALLBACK_PRICES = {
  AAPL: 210,
  MSFT: 420,
  GOOGL: 175,
  AMZN: 185,
  NVDA: 120,
  META: 520,
  TSLA: 250,
  JPM: 200,
  XOM: 110,
  KO: 70,
};

const PRICE_CACHE_KEY = "market-day-prices-v1";

function todayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
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

async function fetchYahooChart(symbol) {
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
      const closes = quote?.close?.filter((n) => typeof n === "number") || [];
      const price =
        (typeof meta?.regularMarketPrice === "number" && meta.regularMarketPrice) ||
        (typeof meta?.chartPreviousClose === "number" && meta.chartPreviousClose) ||
        (typeof meta?.previousClose === "number" && meta.previousClose) ||
        closes[closes.length - 1];
      if (typeof price !== "number" || !(price > 0)) throw new Error("No price");
      return { price, previousClose: meta?.chartPreviousClose || meta?.previousClose || price };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Price fetch failed");
}

/**
 * Returns { date, source, prices: { SYMBOL: number } }
 * Uses today's cache when available; otherwise fetches (or falls back).
 */
async function getMarketPrices({ force = false } = {}) {
  const date = todayKey();
  const cached = loadPriceCache();
  if (!force && cached?.date === date && cached.prices) {
    return cached;
  }

  const prices = {};
  let live = 0;
  await Promise.all(
    TICKERS.map(async ({ symbol }) => {
      try {
        const { price } = await fetchYahooChart(symbol);
        prices[symbol] = Math.round(price * 100) / 100;
        live += 1;
      } catch {
        prices[symbol] = FALLBACK_PRICES[symbol];
      }
    })
  );

  const payload = {
    date,
    source: live === TICKERS.length ? "live-eod" : live > 0 ? "mixed" : "fallback",
    liveCount: live,
    prices,
    fetchedAt: new Date().toISOString(),
  };
  savePriceCache(payload);
  return payload;
}

window.MarketDayPrices = { TICKERS, FALLBACK_PRICES, todayKey, getMarketPrices };
