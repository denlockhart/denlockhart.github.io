# Kings of War Army Builder

Build Kings of War **4th Edition** army lists by battalion. Pick a faction, add Core / Auxiliary / Specialist / Support / Commanders, and print or copy the list.

- **Local:** http://localhost:3000/projects/kow-army-builder/
- **Folder:** `projects/kow-army-builder/`
- **Rules:** [Mantic — Building Armies](https://www.manticgames.com/news/kings-of-war-4th-edition-building-armies/)
- **Official builder:** [Mantic Companion](https://companion.manticgames.com/kings-of-war-4th-edition-list-builder/)

This is an **unofficial fan tool**. Orcs, Ratkin, Basilea, Kingdoms of Men, and Forces of the Abyss 2026 catalogs are the full Companion rosters (Basilea is Basileans 2026). Verify profiles and points against the Core Rulebook or Companion before play.

## Layout

```
projects/kow-army-builder/
  index.html
  app.js
  style.css
  data/
    catalog.json           # faction index
    artefacts.json         # shared artefacts
    spells.json            # Arcane Library spells (Unique [U])
    armies/<id>.json       # faction units + command orders
```

## Data vs user saves

| Kind | Where | Purpose |
|------|-------|---------|
| Game reference data | `data/*.json` | Unit catalogs, artefacts, spells |
| User army lists | Browser `localStorage` (`kow-army-builder-v1`) | Saved lists and the current draft |

## Adding a faction or units

1. Add or extend `data/armies/<id>.json`.
2. Register new factions in `data/catalog.json`.
3. Prefer Companion-exported lists over guessed stats. Note incomplete catalogs in `sourceNote`.

## Battalion rules (4th edition)

- A battalion needs **2 Core** and **1 Commander**.
- Each Core unlocks **1 Auxiliary** and **1 Specialist** (Specialist max 4).
- Each pair of Core and/or Specialist unlocks **1 Support** and **1 Commander** (max 4 each).
- Core and Auxiliary have no cap of 4.
- **4 Core** in a battalion unlocks the next battalion.
- One **Warlord** per battalion. `[U]` is once per army; `[n]` is per battalion.

## Local development

Serve the **repo root** and open `/projects/kow-army-builder/`.
