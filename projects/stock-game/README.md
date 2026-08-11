# Market Day

Multiplayer paper-trading game for denlockhart.com.

## Rules

- Each player starts with **$10,000**
- Buy a **dollar amount** of shares anytime during the day
- Trading window: **weekdays 9:30 AM–4:00 PM Eastern**
- **40 curated tickers** across Energy, Retail, Technology, Healthcare, Financials, Consumer, Industrials, Communications
- Quotes refresh on the **Eastern quarter-hour** from **4:00 AM–8:15 PM** only (paused 8:20 PM–3:45 AM); the app loads them automatically
- Each ticker shows **one price** for the current Eastern session: regular (9:30–4:00), after hours (4:00–4:00 AM), or pre-market (4:00–9:30 AM)
- Equity is always cash + holdings at the latest marked price (shares stay open overnight)

## Universe & prices

- `tickers.json` — curated cross-sector list (rebuild: `npm run stock-game:tickers`)
- `prices-live.json` — live quotes (refresh: `npm run stock-game:prices`)
- GitHub Action `.github/workflows/market-day-prices.yml` updates the sheet on weekday quarter-hours covering ~4:00 AM–8:15 PM Eastern
- In-app **Refresh prices now** reloads the published sheet (browser Yahoo CORS proxies were too unreliable)

## Local URL

http://localhost:3000/projects/stock-game/

## Multiplayer

1. Host clicks **Create room** and shares the 6-character code
2. Friends open the same URL, enter the code, and **Join** (host tab should stay open for live sync via PeerJS)
3. Same-browser / shared-device play also works via the room code saved in localStorage
