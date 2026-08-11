import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "projects", "stock-game", "tickers.json");

const TICKERS = [
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy" },
  { symbol: "CVX", name: "Chevron", sector: "Energy" },
  { symbol: "COP", name: "ConocoPhillips", sector: "Energy" },
  { symbol: "SLB", name: "Schlumberger", sector: "Energy" },
  { symbol: "EOG", name: "EOG Resources", sector: "Energy" },
  { symbol: "WMT", name: "Walmart", sector: "Retail" },
  { symbol: "TGT", name: "Target", sector: "Retail" },
  { symbol: "COST", name: "Costco", sector: "Retail" },
  { symbol: "HD", name: "Home Depot", sector: "Retail" },
  { symbol: "LOW", name: "Lowes", sector: "Retail" },
  { symbol: "AAPL", name: "Apple", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA", sector: "Technology" },
  { symbol: "AVGO", name: "Broadcom", sector: "Technology" },
  { symbol: "ORCL", name: "Oracle", sector: "Technology" },
  { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare" },
  { symbol: "JNJ", name: "Johnson and Johnson", sector: "Healthcare" },
  { symbol: "LLY", name: "Eli Lilly", sector: "Healthcare" },
  { symbol: "ABBV", name: "AbbVie", sector: "Healthcare" },
  { symbol: "PFE", name: "Pfizer", sector: "Healthcare" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials" },
  { symbol: "BAC", name: "Bank of America", sector: "Financials" },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials" },
  { symbol: "V", name: "Visa", sector: "Financials" },
  { symbol: "MA", name: "Mastercard", sector: "Financials" },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer" },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer" },
  { symbol: "MCD", name: "McDonalds", sector: "Consumer" },
  { symbol: "NKE", name: "Nike", sector: "Consumer" },
  { symbol: "SBUX", name: "Starbucks", sector: "Consumer" },
  { symbol: "CAT", name: "Caterpillar", sector: "Industrials" },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials" },
  { symbol: "HON", name: "Honeywell", sector: "Industrials" },
  { symbol: "UPS", name: "UPS", sector: "Industrials" },
  { symbol: "BA", name: "Boeing", sector: "Industrials" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Communications" },
  { symbol: "META", name: "Meta", sector: "Communications" },
  { symbol: "NFLX", name: "Netflix", sector: "Communications" },
  { symbol: "DIS", name: "Disney", sector: "Communications" },
  { symbol: "T", name: "AT&T", sector: "Communications" },
];

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
  const meta = (await res.json())?.chart?.result?.[0]?.meta || {};
  const prev = meta.chartPreviousClose || meta.previousClose;
  const last = meta.regularMarketPrice || prev;
  return {
    previousClose: Math.round((prev || last) * 100) / 100,
    last: Math.round((last || prev) * 100) / 100,
  };
}

const tickers = [];
for (let i = 0; i < TICKERS.length; i += 8) {
  const batch = TICKERS.slice(i, i + 8);
  const part = await Promise.all(
    batch.map(async (t) => {
      try {
        const q = await quote(t.symbol);
        return { ...t, previousClose: q.previousClose, last: q.last };
      } catch {
        return { ...t, previousClose: 100, last: 100 };
      }
    })
  );
  tickers.push(...part);
}

const payload = {
  source: "Curated cross-sector list (5 per sector)",
  asOf: new Date().toISOString().slice(0, 10),
  count: tickers.length,
  refreshMinutes: 15,
  tickers,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${tickers.length} tickers → ${OUT}`);
