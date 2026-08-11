/**
 * Refresh Market Day live prices (direct Yahoo — no CORS).
 * Writes projects/stock-game/prices-live.json with regular / pre / post prints.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "projects", "stock-game");
const TICKERS_PATH = path.join(ROOT, "tickers.json");
const OUT = path.join(ROOT, "prices-live.json");
const ET = "America/New_York";

function etParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

/** 9:30–4:00 regular · 4:00–4:00 AM post · 4:00–9:30 AM pre */
function priceSession(from = new Date()) {
  const { hour, minute } = etParts(from);
  const mins = hour * 60 + minute;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  return "post";
}

function roundPx(n) {
  return Math.round(n * 100) / 100;
}

function lastCloseInWindow(timestamps, closes, startSec, endSec) {
  let last = null;
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (t >= startSec && t < endSec && typeof closes[i] === "number") last = closes[i];
  }
  return last;
}

function pickSessionPrice(q, session) {
  if (session === "pre" && q.pre > 0) return q.pre;
  if (session === "post" && q.post > 0) return q.post;
  if (q.regular > 0) return q.regular;
  return q.pre || q.post || null;
}

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=1d&interval=1m&includePrePost=true`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("no chart");
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const ctp = meta.currentTradingPeriod || {};

  const regular =
    (typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice) ||
    lastCloseInWindow(timestamps, closes, ctp.regular?.start ?? 0, ctp.regular?.end ?? 0) ||
    meta.chartPreviousClose ||
    meta.previousClose;

  const pre =
    (ctp.pre && lastCloseInWindow(timestamps, closes, ctp.pre.start, ctp.pre.end)) || null;
  const post =
    (ctp.post && lastCloseInWindow(timestamps, closes, ctp.post.start, ctp.post.end)) || null;

  if (!(regular > 0) && !(pre > 0) && !(post > 0)) throw new Error("no price");

  return {
    regular: regular > 0 ? roundPx(regular) : null,
    pre: pre > 0 ? roundPx(pre) : null,
    post: post > 0 ? roundPx(post) : null,
    previousClose: roundPx(meta.chartPreviousClose || meta.previousClose || regular || pre || post),
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const catalog = JSON.parse(fs.readFileSync(TICKERS_PATH, "utf8"));
const quotes = {};
const prices = {};
let live = 0;
const errors = [];
const session = priceSession();

for (const batch of chunk(catalog.tickers, 8)) {
  await Promise.all(
    batch.map(async (t) => {
      try {
        const q = await quote(t.symbol);
        quotes[t.symbol] = q;
        const px = pickSessionPrice(q, session);
        if (px > 0) {
          prices[t.symbol] = px;
          live += 1;
        }
      } catch (err) {
        const fallback = t.last || t.previousClose;
        if (fallback > 0) {
          quotes[t.symbol] = { regular: fallback, pre: null, post: null, previousClose: fallback };
          prices[t.symbol] = fallback;
        }
        errors.push(`${t.symbol}: ${err.message}`);
      }
    })
  );
}

const payload = {
  fetchedAt: new Date().toISOString(),
  source: "yahoo-direct",
  session,
  liveCount: live,
  total: catalog.tickers.length,
  refreshMinutes: 15,
  quotes,
  prices,
  errors: errors.slice(0, 10),
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${live}/${catalog.tickers.length} live prices (${session}) → ${OUT}`);
if (errors.length) console.log("Errors:", errors.slice(0, 5).join("; "));
