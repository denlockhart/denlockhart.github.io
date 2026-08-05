# Market Day

Multiplayer paper-trading game for denlockhart.com.

## Rules

- Each player starts with **$10,000**
- Buy a **dollar amount** of shares anytime during the day
- At **local midnight**, holdings are marked to end-of-day prices for each player’s balance (shares stay open)

## Universe & prices

- `tickers.json` — top 1000 equities from iShares Russell 1000 (IWB) holdings, each with a seeded **prior close**
- Rebuild catalog: `npm run stock-game:tickers`
- Trades use prior close (last night). Yahoo prior closes refresh in the background after load.

## Local URL

http://localhost:3000/projects/stock-game/

## Multiplayer

1. Host clicks **Create room** and shares the 6-character code
2. Friends open the same URL, enter the code, and **Join** (host tab should stay open for live sync via PeerJS)
3. Same-browser / shared-device play also works via the room code saved in localStorage
