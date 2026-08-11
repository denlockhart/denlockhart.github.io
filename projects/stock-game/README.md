# Market Day

Multiplayer paper-trading game for denlockhart.com.

## Rules

- Each player starts with **$10,000**
- Buy a **dollar amount** of shares anytime during the day
- Trading window: **weekdays 9:30 AM–4:30 PM Eastern**
- **40 curated tickers** across Energy, Retail, Technology, Healthcare, Financials, Consumer, Industrials, Communications
- Quotes **auto-refresh every 15 minutes**
- At **6:00 PM Eastern** (weekdays), holdings are marked for each player’s balance (shares stay open)

## Universe & prices

- `tickers.json` — curated cross-sector list (rebuild: `npm run stock-game:tickers`)
- Browser fetches Yahoo last/mark via CORS proxies; 15-minute localStorage cache

## Local URL

http://localhost:3000/projects/stock-game/

## Multiplayer

1. Host clicks **Create room** and shares the 6-character code
2. Friends open the same URL, enter the code, and **Join** (host tab should stay open for live sync via PeerJS)
3. Same-browser / shared-device play also works via the room code saved in localStorage
