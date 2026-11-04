# Warmaster Army Builder

Build Warmaster army lists. The first roster is **Dark Elves** from Warmaster Armies v2.26.

- **Local:** http://localhost:3000/projects/warmaster-army-builder/
- **Folder:** `projects/warmaster-army-builder/`

This is an **unofficial fan tool**. Profiles, minimums, maximums, special rules, and spells are taken from that book. Magic-item points are the overview on p.88; the full item text is in the main rulebook, p.77. Verify a list before play.

## Layout

```
projects/warmaster-army-builder/
  index.html
  app.js
  style.css
  data/
    catalog.json
    magic-items.json
    armies/dark-elves.json
```

## Data vs user saves

| Kind | Where | Purpose |
|------|-------|---------|
| Game reference data | `data/*.json` | Rosters, spells, magic items |
| User army lists | Browser `localStorage` (`warmaster-army-builder-v1`) | Saved lists and the current draft |

## List rules implemented

- Points cap is the army size. Spending fewer points is allowed.
- Min/max is per full 1000 points. 1500 uses the 1000 column. 2250 uses the 2000 column.
- Below 1000, maximums still apply and minimums do not.
- The General is exactly one once minimums apply, at any army size.
- A Cauldron of Blood is once per army and needs a Witch Elf unit.
- Cold One Knights only brigade with other Cold One Knights.
- A War Hydra cannot be brigaded.
- One magic item per character, or one magic standard per unit, matched to that unit's Attack, Hits, and Armour.

Do not invent profiles. Add the next faction from Armies v2.26 and register it in `data/catalog.json`.
