import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "projects", "stock-game", "tickers.json");
const URL =
  "https://www.blackrock.com/us/individual/products/239707/ishares-russell-1000-etf/latest-holdings.csv";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

const res = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0" } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const text = await res.text();
const lines = text.split(/\r?\n/);
const headerIdx = lines.findIndex((l) => l.includes("Ticker") && l.includes("Name") && l.includes("Price"));
if (headerIdx < 0) throw new Error("CSV header not found");

const asOfLine = lines.find((l) => /Fund Holdings as of/i.test(l)) || "";
const asOf = asOfLine.replace(/^[^,]*,/, "").replace(/"/g, "").trim();

const header = parseCsvLine(lines[headerIdx]);
const ti = header.indexOf("Ticker");
const ni = header.indexOf("Name");
const ai = header.indexOf("Asset Class");
const pi = header.indexOf("Price");

const tickers = [];
for (let i = headerIdx + 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = parseCsvLine(lines[i]);
  const symbol = (cols[ti] || "").trim();
  const name = (cols[ni] || "").trim();
  const asset = (cols[ai] || "").trim();
  const price = Number(String(cols[pi] || "").replace(/,/g, ""));
  if (!symbol || asset !== "Equity") continue;
  if (!/^[A-Z][A-Z0-9.\-]{0,6}$/.test(symbol)) continue;
  if (!(price > 0)) continue;
  tickers.push({
    symbol,
    name,
    previousClose: Math.round(price * 100) / 100,
  });
}

const seen = new Set();
const unique = [];
for (const t of tickers) {
  if (seen.has(t.symbol)) continue;
  seen.add(t.symbol);
  unique.push(t);
}

const top = unique.slice(0, 1000);
const payload = {
  source: "iShares Russell 1000 ETF (IWB) holdings",
  asOf,
  count: top.length,
  tickers: top,
};

fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(`Wrote ${top.length} tickers → ${OUT}`);
console.log("Sample:", top.slice(0, 5));
