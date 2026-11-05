# Warmaster Army Builder

Build Warmaster army lists from Warmaster Armies v2.26. The rosters so far are **Dark Elves**, **Ogre Kingdoms**, **Skaven**, **Bretonnia**, **Daemons**, and **Vampire Counts**.

- **Local:** http://localhost:3000/projects/warmaster-army-builder/
- **Folder:** `projects/warmaster-army-builder/`

This is an **unofficial fan tool**. Profiles, minimums, maximums, special rules, and spells are taken from that book. Magic-item points and who may carry each item are the overview on p.88. The descriptions are from the Warmaster Revolution rulebook. Verify a list before play.

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
    armies/ogre-kingdoms.json
    armies/skaven.json
    armies/bretonnia.json
    armies/daemons.json
    armies/vampire-counts.json
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
- A Slave Giant only brigades with other Slave Giants.
- Gnoblars cannot take a magic standard.
- A Screaming Bell is once per army, whatever the points limit.
- Rat Swarms cannot take a magic standard.
- A Grey Seer can take one General or Wizard magic item, and knows the Skaven spells.
- A Grail Reliquae can be given to one Peasant unit in the whole army.
- Only an Enchantress can ride a Unicorn. A Hippogriff is for a General or Hero.
- Daemonic Wings and the Favour of the Gods are each limited to one per full 1,000 points.
- A Daemon Overlord with wizard powers knows the Daemon spells and may take a General or Wizard item.
- Daemon Swarms cannot take a magic standard.
- Undead rules apply to every Vampire Counts unit except Ghouls.
- Ethereal Hosts and Dire Wolves cannot take a magic standard.
- A Vampire Lord knows the Vampire Counts spells and may take a General or Wizard item.
- Any Vampire Counts character may ride a Winged Nightmare. A Black Coach is for a Vampire Lord or Vampire.
- One magic item per character, or one magic standard per unit, matched to that unit's Attack, Hits, and Armour.

Do not invent profiles. Add the next faction from Armies v2.26 and register it in `data/catalog.json`.
