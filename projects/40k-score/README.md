# 40K Scoreboard

Live **Warhammer 40,000** scoring for two players — Victory Points, Command Points, and Battle Round. Phone control syncs to a TV display in real time via **Firebase** (free tier).

- **Live:** https://www.denlockhart.com/projects/40k-score/
- **TV:** `?view=display`
- **Phone:** `?view=control`

## How to use

1. On the **smart TV**, open **TV Display** mode.
2. Note the **room code**, **PIN**, and QR code on screen.
3. On each **phone**, open **Phone Control**, enter the room code and PIN.
4. Either player can update VP, CP, names, and battle round. The TV updates instantly.

## Firebase setup (one time, free)

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (Spark / free plan).
2. **Build → Realtime Database → Create database** (choose a region, start in **test mode** for setup).
3. **Project settings → Your apps → Web** — register the app and copy the config object.
4. Copy `firebase-config.example.js` to `firebase-config.js` and paste your config values.
5. **Realtime Database → Rules** — replace with:

```json
{
  "rules": {
    "games": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

These rules are open (anyone with the room code can write). For club use, the random **6-character room code + 4-digit PIN** is enough for casual games. Tighten rules later if needed.

6. Deploy the site (push to GitHub Pages).

Firebase web API keys are public by design; security comes from database rules and hard-to-guess room codes.

## Local development

```bash
npm start
# http://localhost:3000/projects/40k-score/
```

You need a working `firebase-config.js` for sync to work locally.
