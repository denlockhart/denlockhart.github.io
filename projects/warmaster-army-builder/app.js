const STORAGE_KEY = "warmaster-army-builder-v1";

const state = {
  catalog: null,
  magicItems: [],
  army: null,
  list: null,
  filter: "all",
  search: "",
  pending: null,
};

function $(id) { return document.getElementById(id); }

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function showError(msg) {
  const box = $("error-box");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadSaves() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.lists) ? data.lists : [];
  } catch {
    return [];
  }
}

function persistSaves(lists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ lists }));
}

function draftKey() {
  return `${STORAGE_KEY}-draft-${state.list?.factionId || "none"}`;
}

function saveDraft() {
  if (!state.list) return;
  localStorage.setItem(draftKey(), JSON.stringify(state.list));
}

function loadDraft(factionId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-draft-${factionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function blankList(factionId, name, pointsLimit) {
  return {
    factionId,
    name,
    pointsLimit,
    characters: [],
    troops: [],
    brigades: [],
  };
}

function unitById(id) {
  return state.army?.units.find((unit) => unit.id === id) || null;
}

function mountById(id) {
  return state.army?.mounts.find((mount) => mount.id === id) || null;
}

function itemById(id) {
  return state.magicItems.find((item) => item.id === id) || null;
}

function ruleById(id) {
  return state.army?.specialRules.find((rule) => rule.id === id) || null;
}

function combatAttacks(unit) {
  const raw = String(unit.attacks ?? "");
  if (raw.startsWith("+") || raw === "-") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function scaleInfo(limit) {
  const points = Number(limit) || 0;
  if (points < 1000) return { thousands: 1, ignoreMins: true };
  return { thousands: Math.floor(points / 1000), ignoreMins: false };
}

function boundsFor(entry, limit) {
  const { thousands, ignoreMins } = scaleInfo(limit);
  const minBase = entry.min == null ? 0 : entry.min;
  const maxBase = entry.armyMax != null ? entry.armyMax : entry.max;
  if (entry.fixed) {
    return { min: ignoreMins ? 0 : (entry.min ?? 0), max: entry.max ?? Infinity };
  }
  return {
    min: ignoreMins ? 0 : minBase * thousands,
    max: maxBase == null ? Infinity : (entry.armyMax != null ? entry.armyMax : maxBase * thousands),
  };
}

function choiceMatches(choice, unit) {
  if (choice.attacks != null && combatAttacks(unit) !== choice.attacks) return false;
  if (choice.armour && !choice.armour.includes(unit.armour)) return false;
  if (choice.hits != null && unit.hits !== choice.hits) return false;
  return true;
}

function itemChoicesFor(unit, extraRoles) {
  const options = [];
  const roles = new Set(unit.itemBearers || [unit.type.toLowerCase()]);
  for (const role of extraRoles || []) roles.add(role);
  for (const item of state.magicItems) {
    if (unit.kind === "character") {
      if (unit.noMagic || item.slot !== "character") continue;
      if (item.excludeFactions?.includes(state.army?.id)) continue;
      if (item.bearer && !item.bearer.some((role) => roles.has(role))) continue;
      options.push({
        key: item.id,
        itemId: item.id,
        choiceId: null,
        label: `${item.name} — ${item.points} pts`,
        points: item.points,
        summary: item.summary,
        description: item.description || item.summary,
      });
    } else if (item.slot === "standard" && !unit.noMagic) {
      for (const choice of item.choices || []) {
        if (!choiceMatches(choice, unit)) continue;
        options.push({
          key: `${item.id}:${choice.id}`,
          itemId: item.id,
          choiceId: choice.id,
          label: `${item.name} (${choice.label}) — ${choice.points} pts`,
          points: choice.points,
          summary: item.summary,
          description: item.description || item.summary,
        });
      }
    }
  }
  return options;
}

function findChoice(itemId, choiceId) {
  const item = itemById(itemId);
  if (!item) return null;
  if (!choiceId) return { item, choice: null, points: item.points || 0, label: item.name, summary: item.summary, description: item.description || item.summary };
  const choice = (item.choices || []).find((row) => row.id === choiceId);
  if (!choice) return null;
  return {
    item,
    choice,
    points: choice.points,
    label: `${item.name} (${choice.label})`,
    summary: item.summary,
    description: item.description || item.summary,
  };
}

function entryCost(entry, kind) {
  if (kind === "character") {
    const unit = unitById(entry.unitId);
    const mount = entry.mountId ? mountById(entry.mountId) : null;
    const item = entry.itemId ? findChoice(entry.itemId, null) : null;
    const bonusPoints = bonusesFor(entry).reduce((sum, bonus) => sum + (bonus.points || 0), 0);
    return (unit?.points || 0) + (mount?.points || 0) + (item?.points || 0) + bonusPoints;
  }
  const unit = unitById(entry.unitId);
  const item = entry.itemId ? findChoice(entry.itemId, entry.choiceId) : null;
  const bonusPoints = bonusesFor(entry).reduce((sum, bonus) => sum + (bonus.points || 0), 0);
  return (unit?.points || 0) + (item?.points || 0) + bonusPoints;
}

function armyPoints() {
  if (!state.list) return 0;
  const characters = state.list.characters.reduce((sum, entry) => sum + entryCost(entry, "character"), 0);
  const troops = state.list.troops.reduce((sum, entry) => sum + entryCost(entry, "troop"), 0);
  return characters + troops;
}

function countUnit(id) {
  const characters = state.list.characters.filter((entry) => entry.unitId === id).length;
  const troops = state.list.troops.filter((entry) => entry.unitId === id).length;
  return characters + troops;
}

function countMount(id) {
  return state.list.characters.filter((entry) => entry.mountId === id).length;
}

function limitLabel(entry) {
  if (entry.fixed) return "exactly 1";
  const min = entry.min == null ? "–" : String(entry.min);
  const max = entry.armyMax != null ? String(entry.armyMax) : (entry.max == null ? "–" : String(entry.max));
  if (entry.armyMax != null) return `max ${entry.armyMax} in the army`;
  return `${min}/${max} per 1000`;
}

function profileLine(unit) {
  const bits = [unit.type];
  if (unit.attacks != null) bits.push(`A ${unit.attacks}`);
  if (unit.hits != null) bits.push(`H ${unit.hits}`);
  if (unit.armour != null) bits.push(unit.armour === "0" ? "Arm 0" : `Arm ${unit.armour}`);
  if (unit.command != null) bits.push(`Cmd ${unit.command}`);
  if (unit.unitSize != null) bits.push(`Stands ${unit.unitSize}`);
  bits.push(`${unit.points} pts`);
  bits.push(limitLabel(unit));
  return bits.join(" · ");
}

function characterTitle(entry) {
  const unit = unitById(entry.unitId);
  const mount = entry.mountId ? mountById(entry.mountId) : null;
  return mount ? `${unit.name} on ${mount.name}` : unit.name;
}

function troopTitle(entry) {
  return unitById(entry.unitId)?.name || "Unit";
}

function armyHasCaster() {
  return state.list.characters.some((entry) => {
    const unit = unitById(entry.unitId);
    return unit?.castsSpells || unit?.type === "Wizard" || bonusesFor(entry).some((bonus) => bonus.castsSpells);
  });
}

function usedRuleIds() {
  const ids = new Set(state.army?.armyRules || []);
  for (const entry of state.list.characters) {
    const unit = unitById(entry.unitId);
    (unit?.rules || []).forEach((id) => ids.add(id));
    if (entry.mountId) (mountById(entry.mountId)?.rules || []).forEach((id) => ids.add(id));
    bonusesFor(entry).forEach((bonus) => (bonus.rules || []).forEach((id) => ids.add(id)));
  }
  for (const entry of state.list.troops) {
    (unitById(entry.unitId)?.rules || []).forEach((id) => ids.add(id));
    bonusesFor(entry).forEach((bonus) => (bonus.rules || []).forEach((id) => ids.add(id)));
  }
  return [...ids];
}

function armyIssues() {
  const issues = [];
  if (!state.list || !state.army) return issues;
  const limit = state.list.pointsLimit;
  const spent = armyPoints();
  if (spent > limit) issues.push(`Over the points limit by ${spent - limit}.`);

  const itemCounts = new Map();
  for (const entry of [...state.list.characters, ...state.list.troops]) {
    if (!entry.itemId) continue;
    itemCounts.set(entry.itemId, (itemCounts.get(entry.itemId) || 0) + 1);
  }
  for (const [id, count] of itemCounts) {
    if (count < 2) continue;
    const item = itemById(id);
    issues.push(`${item?.name || "Magic item"}: only one in the army (have ${count}).`);
  }

  for (const unit of state.army.units) {
    const count = countUnit(unit.id);
    const bounds = boundsFor(unit, limit);
    if (count < bounds.min) {
      issues.push(`${unit.name}: need at least ${bounds.min} (have ${count}).`);
    }
    if (count > bounds.max) {
      issues.push(`${unit.name}: no more than ${bounds.max} (have ${count}).`);
    }
  }

  const seenBonuses = new Set();
  for (const unit of state.army.units) {
    for (const bonus of unit.bonuses || []) {
      if (seenBonuses.has(bonus.id)) continue;
      seenBonuses.add(bonus.id);
      const cap = boundsFor(bonus, limit);
      if (cap.max === Infinity) continue;
      const taken = countBonus(bonus.id);
      if (taken > cap.max) {
        const where = bonus.armyMax != null ? `${cap.max} in the army` : `${cap.max}`;
        issues.push(`${bonus.name}: no more than ${where} (have ${taken}).`);
      }
    }
  }

  for (const mount of state.army.mounts) {
    const count = countMount(mount.id);
    const bounds = boundsFor(mount, limit);
    if (count > bounds.max) {
      const cap = mount.armyMax != null ? `${bounds.max} in the army` : `${bounds.max}`;
      issues.push(`${mount.name}: no more than ${cap} (have ${count}).`);
    }
    if (count > 0 && mount.requiresUnit && countUnit(mount.requiresUnit) < 1) {
      const required = unitById(mount.requiresUnit);
      issues.push(`${mount.name} requires at least 1 unit of ${required?.name || mount.requiresUnit}.`);
    }
  }

  const byBrigade = new Map();
  for (const troop of state.list.troops) {
    if (!troop.brigadeId) continue;
    if (!byBrigade.has(troop.brigadeId)) byBrigade.set(troop.brigadeId, []);
    byBrigade.get(troop.brigadeId).push(troop);
  }
  for (const [brigadeId, troops] of byBrigade) {
    const brigade = state.list.brigades.find((row) => row.id === brigadeId);
    const name = brigade?.name || "Brigade";
    const units = troops.map((troop) => unitById(troop.unitId)).filter(Boolean);
    if (units.some((unit) => unit.brigade === "never")) {
      issues.push(`${name} includes a unit that cannot be brigaded.`);
    }
    const restricted = units.filter((unit) => unit.brigade === "own-only");
    const kinds = new Set(restricted.map((unit) => unit.id));
    if (restricted.length && (restricted.length !== units.length || kinds.size > 1)) {
      const names = [...new Set(restricted.map((unit) => unit.name))];
      const own = names[0].endsWith("s") ? names[0] : `${names[0]}s`;
      const who = names.length === 1
        ? `${names[0]} can only brigade with other ${own}`
        : `${names.join(" and ")} can only brigade with their own type`;
      issues.push(`${name}: ${who}.`);
    }
  }
  return issues;
}

function renderSummary() {
  const list = state.list;
  $("summary-army-name").textContent = list.name || "(unnamed)";
  $("summary-faction").textContent = state.army.name;
  $("points-used").textContent = String(armyPoints());
  $("points-max").textContent = String(list.pointsLimit);
  $("unit-count").textContent = String(list.characters.length + list.troops.length);
  const scale = scaleInfo(list.pointsLimit);
  $("scale-label").textContent = scale.ignoreMins
    ? "Under 1000: minimums ignored"
    : `Limits × ${scale.thousands}`;
  const issues = armyIssues();
  const status = $("list-status");
  if (!issues.length) {
    status.textContent = "List meets the Dark Elf minimums and maximums.";
    status.className = "list-status ok";
  } else {
    status.textContent = issues.join(" ");
    status.className = "list-status bad";
  }
}

function renderCatalog() {
  const q = state.search.trim().toLowerCase();
  const units = state.army.units.filter((unit) => {
    if (state.filter !== "all" && unit.kind !== state.filter) return false;
    if (q && !unit.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const host = $("catalog-list");
  if (!units.length) {
    host.innerHTML = `<p class="empty-hint">No matching units.</p>`;
    return;
  }
  host.innerHTML = units.map((unit) => {
    const count = countUnit(unit.id);
    const bounds = boundsFor(unit, state.list.pointsLimit);
    const maxText = bounds.max === Infinity ? "" : ` / ${bounds.max}`;
    return `<button type="button" class="catalog-item" data-add="${esc(unit.id)}">
      <span>
        <h4>${esc(unit.name)}</h4>
        <div class="stats">${esc(profileLine(unit))}</div>
      </span>
      <span class="meta">${count}${maxText}</span>
    </button>`;
  }).join("");
}

function bonusIdsOf(entry) {
  if (Array.isArray(entry?.bonusIds)) return entry.bonusIds.filter(Boolean);
  return entry?.bonusId ? [entry.bonusId] : [];
}

function bonusesFor(entry) {
  const unit = unitById(entry?.unitId);
  const ids = new Set(bonusIdsOf(entry));
  return (unit?.bonuses || []).filter((bonus) => ids.has(bonus.id));
}

function countBonus(id, exceptEntryId) {
  const rows = [...state.list.characters, ...state.list.troops];
  return rows.filter((entry) => entry.id !== exceptEntryId && bonusIdsOf(entry).includes(id)).length;
}

function selectedBonusIds() {
  return [...document.querySelectorAll("#add-bonus input:checked")].map((input) => input.value);
}

function itemNote(entry, kind) {
  const bits = [];
  if (entry.itemId) {
    const found = findChoice(entry.itemId, kind === "troop" ? entry.choiceId : null);
    if (found) bits.push(found.label);
  }
  for (const bonus of bonusesFor(entry)) bits.push(`${bonus.name} — ${bonus.points} pts`);
  return bits.join(" · ");
}

function renderArmy() {
  const list = state.list;
  const chunks = [];

  chunks.push(`<article class="battalion-card"><div class="battalion-card-header"><span>Characters</span></div><div class="battalion-card-body">`);
  if (!list.characters.length) {
    chunks.push(`<p class="empty-hint">No characters yet.</p>`);
  }
  for (const entry of list.characters) {
    const unit = unitById(entry.unitId);
    const mount = entry.mountId ? mountById(entry.mountId) : null;
    const extra = [unit ? `Cmd ${unit.command}` : "", itemNote(entry, "character"), mount ? mount.type : ""]
      .filter(Boolean)
      .join(" · ");
    chunks.push(`<div class="unit-row">
      <div>
        <h4>${esc(characterTitle(entry))}</h4>
        <div class="stats">${esc(extra)} · ${entryCost(entry, "character")} pts</div>
      </div>
      <div class="actions">
        <button type="button" class="tiny" data-edit-character="${esc(entry.id)}">Edit</button>
        <button type="button" class="tiny danger" data-remove-character="${esc(entry.id)}">Remove</button>
      </div>
    </div>`);
  }
  chunks.push(`</div></article>`);

  const independents = list.troops.filter((troop) => !troop.brigadeId);
  chunks.push(renderTroopGroup("Independent units", null, independents, false));
  for (const brigade of list.brigades) {
    const troops = list.troops.filter((troop) => troop.brigadeId === brigade.id);
    chunks.push(renderTroopGroup(brigade.name, brigade.id, troops, true));
  }

  $("army-list").innerHTML = chunks.join("");
  renderRules();
  renderSpells();
  renderMagicItems();
}

function renderTroopGroup(title, brigadeId, troops, isBrigade) {
  const rows = troops.length
    ? troops.map((entry) => {
      const unit = unitById(entry.unitId);
      const note = [unit ? profileLine(unit).split(" · ").slice(0, 4).join(" · ") : "", itemNote(entry, "troop")]
        .filter(Boolean)
        .join(" · ");
      return `<div class="unit-row">
        <div>
          <h4>${esc(troopTitle(entry))}</h4>
          <div class="stats">${esc(note)} · ${entryCost(entry, "troop")} pts</div>
        </div>
        <div class="actions">
          <button type="button" class="tiny" data-edit-troop="${esc(entry.id)}">Edit</button>
          <button type="button" class="tiny danger" data-remove-troop="${esc(entry.id)}">Remove</button>
        </div>
      </div>`;
    }).join("")
    : `<p class="empty-hint">Empty.</p>`;
  const remove = isBrigade
    ? `<button type="button" class="tiny" data-remove-brigade="${esc(brigadeId)}">Ungroup</button>`
    : "";
  return `<article class="battalion-card"><div class="battalion-card-header"><span>${esc(title)}</span>${remove}</div><div class="battalion-card-body">${rows}</div></article>`;
}

function renderRules() {
  const host = $("list-special-rules");
  const rules = usedRuleIds().map(ruleById).filter(Boolean);
  if (!rules.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<h3>Special rules</h3>${rules.map((rule) =>
    `<article class="rule-item"><strong>${esc(rule.name)}</strong><p>${esc(rule.text)}</p></article>`
  ).join("")}`;
}

function usedMagicItems() {
  const seen = new Map();
  for (const entry of [...state.list.characters, ...state.list.troops]) {
    if (!entry.itemId || seen.has(entry.itemId)) continue;
    const found = findChoice(entry.itemId, entry.choiceId || null);
    if (found) seen.set(entry.itemId, found);
  }
  return [...seen.values()];
}

function renderMagicItems() {
  const host = $("list-items");
  const items = usedMagicItems();
  if (!items.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<h3>Magic items</h3>${items.map((found) =>
    `<article class="rule-item"><strong>${esc(found.label)}</strong><p>${esc(found.description)}</p></article>`
  ).join("")}`;
}
function renderSpells() {
  const host = $("list-spells");
  if (!armyHasCaster()) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<h3>Spells</h3>${state.army.spells.map((spell) =>
    `<article class="rule-item"><strong>${esc(spell.name)}</strong><p class="meta">${esc(spell.cast)} to cast · ${esc(spell.range)}</p><p>${esc(spell.text)}</p></article>`
  ).join("")}`;
}

function renderAll() {
  renderSummary();
  renderCatalog();
  renderArmy();
  saveDraft();
}

function mountsFor(unit, exceptEntryId) {
  return (unit.mounts || []).map((id) => mountById(id)).filter(Boolean).filter((mount) => {
    const bounds = boundsFor(mount, state.list.pointsLimit);
    const count = state.list.characters.filter((entry) => entry.mountId === mount.id && entry.id !== exceptEntryId).length;
    return count < bounds.max;
  });
}

function openAdd(unit, existing, kind) {
  state.pending = { unitId: unit.id, kind, entryId: existing?.id || null };
  $("add-title").textContent = existing ? `Edit ${unit.name}` : `Add ${unit.name}`;
  $("add-profile").textContent = profileLine(unit);
  $("add-submit").textContent = existing ? "Save" : "Add to Army";

  const mountWrap = $("mount-wrap");
  const brigadeWrap = $("brigade-wrap");
  const mountSelect = $("add-mount");
  const brigadeSelect = $("add-brigade");

  if (unit.kind === "character") {
    mountWrap.classList.remove("hidden");
    const mounts = mountsFor(unit, existing?.id);
    mountSelect.innerHTML = `<option value="">On foot</option>` + mounts.map((mount) =>
      `<option value="${esc(mount.id)}">${esc(mount.name)} — +${mount.points} pts</option>`
    ).join("");
    mountSelect.value = existing?.mountId || "";
    brigadeWrap.classList.add("hidden");
  } else {
    mountWrap.classList.add("hidden");
    mountSelect.innerHTML = "";
    if (unit.brigade === "never") {
      brigadeWrap.classList.add("hidden");
    } else {
      brigadeWrap.classList.remove("hidden");
      const options = [`<option value="">Independent</option>`]
        .concat(state.list.brigades.map((brigade) =>
          `<option value="${esc(brigade.id)}">${esc(brigade.name)}</option>`
        ))
        .concat([`<option value="__new">New brigade</option>`]);
      brigadeSelect.innerHTML = options.join("");
      brigadeSelect.value = existing?.brigadeId || "";
    }
  }

  const bonusWrap = $("bonus-wrap");
  const bonusHost = $("add-bonus");
  const picked = new Set(bonusIdsOf(existing));
  if (unit.bonuses?.length) {
    bonusWrap.classList.remove("hidden");
    bonusHost.innerHTML = unit.bonuses.map((bonus) =>
      `<label class="bonus-option"><input type="checkbox" value="${esc(bonus.id)}"${picked.has(bonus.id) ? " checked" : ""}> ${esc(bonus.name)} — +${bonus.points} pts</label>`
    ).join("");
  } else {
    bonusWrap.classList.add("hidden");
    bonusHost.innerHTML = "";
  }

  fillItems(unit, existing);

  updateAddCost();
  $("add-dialog").showModal();
}

function selectedExtraRoles(unit) {
  const ids = new Set(selectedBonusIds());
  return (unit.bonuses || []).filter((bonus) => ids.has(bonus.id)).flatMap((bonus) => bonus.itemBearers || []);
}

function fillItems(unit, existing) {
  const itemWrap = $("item-wrap");
  const itemSelect = $("add-item");
  const choices = itemChoicesFor(unit, selectedExtraRoles(unit));
  const previous = itemSelect.value;
  if (!choices.length) {
    itemWrap.classList.add("hidden");
    itemSelect.innerHTML = "";
    $("item-note").textContent = unit.noMagic ? `${unit.name} cannot be given magic items.` : "";
    return;
  }
  itemWrap.classList.remove("hidden");
  itemSelect.innerHTML = `<option value="">None</option>` + choices.map((choice) =>
    `<option value="${esc(choice.key)}">${esc(choice.label)}</option>`
  ).join("");
  const current = existing?.itemId
    ? (existing.choiceId ? `${existing.itemId}:${existing.choiceId}` : existing.itemId)
    : previous;
  if ([...itemSelect.options].some((option) => option.value === current)) itemSelect.value = current;
  const selected = choices.find((choice) => choice.key === itemSelect.value);
  $("item-note").textContent = selected?.description || selected?.summary || "One magic item per character, or one magic standard per unit.";
}

function selectedItem() {
  const key = $("add-item").value;
  if (!key) return null;
  const [itemId, choiceId] = key.split(":");
  return findChoice(itemId, choiceId || null);
}

function updateAddCost() {
  const unit = unitById(state.pending?.unitId);
  if (!unit) return;
  let cost = unit.points;
  if (unit.kind === "character" && $("add-mount").value) {
    cost += mountById($("add-mount").value)?.points || 0;
  }
  cost += selectedItem()?.points || 0;
  for (const id of selectedBonusIds()) {
    const bonus = (unit.bonuses || []).find((row) => row.id === id);
    cost += bonus?.points || 0;
  }
  $("add-cost").textContent = String(cost);
  const warnings = [];
  for (const id of selectedBonusIds()) {
    const bonus = (unit.bonuses || []).find((row) => row.id === id);
    if (!bonus) continue;
    const cap = boundsFor(bonus, state.list.pointsLimit);
    if (cap.max === Infinity) continue;
    const taken = countBonus(bonus.id, state.pending.entryId);
    if (taken >= cap.max) warnings.push(`${bonus.name} is already at its maximum of ${cap.max}.`);
  }
  if (!state.pending.entryId) {
    const bounds = boundsFor(unit, state.list.pointsLimit);
    if (countUnit(unit.id) >= bounds.max) {
      warnings.push(`${unit.name} is already at its maximum of ${bounds.max}.`);
    }
  }
  if (unit.kind === "character" && $("add-mount").value) {
    const mount = mountById($("add-mount").value);
    if (mount?.requiresUnit && countUnit(mount.requiresUnit) < 1 && state.pending.entryId == null) {
      const required = unitById(mount.requiresUnit);
      warnings.push(`${mount.name} needs at least one unit of ${required?.name || "the required troops"}.`);
    }
  }
  $("add-warn").textContent = warnings.join(" ");
}

function commitPending() {
  const pending = state.pending;
  const unit = unitById(pending.unitId);
  const item = selectedItem();
  if (unit.kind === "character") {
    const entry = {
      id: pending.entryId || uid(),
      unitId: unit.id,
      mountId: $("add-mount").value || null,
      itemId: item?.item.id || null,
      bonusIds: selectedBonusIds(),
    };
    if (pending.entryId) {
      const index = state.list.characters.findIndex((row) => row.id === pending.entryId);
      state.list.characters[index] = entry;
    } else {
      state.list.characters.push(entry);
    }
  } else {
    let brigadeId = unit.brigade === "never" ? null : ($("add-brigade").value || null);
    if (brigadeId === "__new") {
      brigadeId = uid();
      const number = state.list.brigades.length + 1;
      state.list.brigades.push({ id: brigadeId, name: `Brigade ${number}` });
    }
    const entry = {
      id: pending.entryId || uid(),
      unitId: unit.id,
      brigadeId,
      itemId: item?.item.id || null,
      choiceId: item?.choice?.id || null,
      bonusIds: selectedBonusIds(),
    };
    if (pending.entryId) {
      const index = state.list.troops.findIndex((row) => row.id === pending.entryId);
      state.list.troops[index] = entry;
    } else {
      state.list.troops.push(entry);
    }
  }
  state.pending = null;
  $("add-dialog").close();
  renderAll();
}

function removeCharacter(id) {
  state.list.characters = state.list.characters.filter((entry) => entry.id !== id);
  renderAll();
}

function removeTroop(id) {
  state.list.troops = state.list.troops.filter((entry) => entry.id !== id);
  pruneBrigades();
  renderAll();
}

function ungroup(brigadeId) {
  for (const troop of state.list.troops) {
    if (troop.brigadeId === brigadeId) troop.brigadeId = null;
  }
  state.list.brigades = state.list.brigades.filter((brigade) => brigade.id !== brigadeId);
  renderAll();
}

function pruneBrigades() {
  state.list.brigades = state.list.brigades.filter((brigade) =>
    state.list.troops.some((troop) => troop.brigadeId === brigade.id)
  );
}

function listAsText() {
  const list = state.list;
  const lines = [
    list.name || "Unnamed army",
    `${state.army.name} — ${armyPoints()} / ${list.pointsLimit} pts`,
    "",
    "Characters",
  ];
  if (!list.characters.length) lines.push("  (none)");
  for (const entry of list.characters) {
    lines.push(`  ${characterTitle(entry)} — ${entryCost(entry, "character")} pts${itemNote(entry, "character") ? ` — ${itemNote(entry, "character")}` : ""}`);
  }
  lines.push("", "Units");
  const writeTroops = (label, troops) => {
    lines.push(label);
    if (!troops.length) lines.push("  (none)");
    for (const entry of troops) {
      lines.push(`  ${troopTitle(entry)} — ${entryCost(entry, "troop")} pts${itemNote(entry, "troop") ? ` — ${itemNote(entry, "troop")}` : ""}`);
    }
  };
  writeTroops("Independent", list.troops.filter((troop) => !troop.brigadeId));
  for (const brigade of list.brigades) {
    writeTroops(brigade.name, list.troops.filter((troop) => troop.brigadeId === brigade.id));
  }
  const issues = armyIssues();
  if (issues.length) {
    lines.push("", "Check");
    issues.forEach((issue) => lines.push(`  ${issue}`));
  }
  const rules = usedRuleIds().map(ruleById).filter(Boolean);
  if (rules.length) {
    lines.push("", "Special rules");
    for (const rule of rules) lines.push(`${rule.name}: ${rule.text}`);
  }
  const magic = usedMagicItems();
  if (magic.length) {
    lines.push("", "Magic items");
    for (const found of magic) {
      lines.push(`${found.label}: ${found.description}`);
    }
  }
  if (armyHasCaster()) {
    lines.push("", "Spells");
    for (const spell of state.army.spells) {
      lines.push(`${spell.name} (${spell.cast}, ${spell.range})`);
      lines.push(spell.text);
    }
  }
  return lines.join("\n");
}

function renderPrint() {
  const list = state.list;
  const rows = [];
  const pushRow = (name, detail, pts) => {
    rows.push(`<tr><td>${esc(name)}<div class="fine">${esc(detail)}</div></td><td class="pts">${pts}</td></tr>`);
  };
  for (const entry of list.characters) {
    const unit = unitById(entry.unitId);
    pushRow(characterTitle(entry), [profileLine(unit), itemNote(entry, "character")].filter(Boolean).join(" · "), entryCost(entry, "character"));
  }
  for (const entry of list.troops.filter((troop) => !troop.brigadeId)) {
    pushRow(troopTitle(entry), [profileLine(unitById(entry.unitId)), itemNote(entry, "troop"), "Independent"].filter(Boolean).join(" · "), entryCost(entry, "troop"));
  }
  for (const brigade of list.brigades) {
    for (const entry of list.troops.filter((troop) => troop.brigadeId === brigade.id)) {
      pushRow(troopTitle(entry), [profileLine(unitById(entry.unitId)), itemNote(entry, "troop"), brigade.name].filter(Boolean).join(" · "), entryCost(entry, "troop"));
    }
  }
  const rules = usedRuleIds().map(ruleById).filter(Boolean).map((rule) =>
    `<article class="print-rule"><strong>${esc(rule.name)}</strong><p>${esc(rule.text)}</p></article>`
  ).join("");
  const spells = armyHasCaster()
    ? state.army.spells.map((spell) =>
      `<article class="print-rule"><strong>${esc(spell.name)} — ${esc(spell.cast)} · ${esc(spell.range)}</strong><p>${esc(spell.text)}</p></article>`
    ).join("")
    : "";
  const magic = usedMagicItems().map((found) =>
    `<article class="print-rule"><strong>${esc(found.label)}</strong><p>${esc(found.description)}</p></article>`
  ).join("");
  $("print-sheet").innerHTML = `
    <h1>${esc(list.name || "Unnamed army")}</h1>
    <p class="print-meta">${esc(state.army.name)} · ${armyPoints()} / ${list.pointsLimit} pts · Warmaster Armies v2.26</p>
    <table>
      <thead><tr><th>Unit</th><th class="pts">Pts</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <p><strong>Total ${armyPoints()} pts</strong></p>
    ${magic ? `<h2>Magic items</h2>${magic}` : ""}
    ${rules ? `<h2>Special rules</h2>${rules}` : ""}
    ${spells ? `<h2 class="after-gap">Spells</h2>${spells}` : ""}
  `;
}

function renderSaved() {
  const lists = loadSaves().filter((list) => list.factionId);
  const wrap = $("saved-wrap");
  if (!lists.length) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  $("saved-list").innerHTML = lists.map((list) =>
    `<div class="saved-item">
      <span>${esc(list.name || "Unnamed")} · ${esc(list.factionName || "")} · ${list.pointsLimit} pts</span>
      <span>
        <button type="button" class="tiny" data-load="${esc(list.id)}">Open</button>
        <button type="button" class="tiny danger" data-delete="${esc(list.id)}">Delete</button>
      </span>
    </div>`
  ).join("");
}

function showSetup() {
  $("screen-setup").classList.remove("hidden");
  $("screen-builder").classList.add("hidden");
  renderSaved();
}

function showBuilder() {
  $("screen-setup").classList.add("hidden");
  $("screen-builder").classList.remove("hidden");
  renderAll();
}

async function startFromFaction(factionId, restore) {
  const faction = state.catalog.armies.find((army) => army.id === factionId);
  if (!faction) return;
  const response = await fetch(`data/armies/${faction.file}`);
  if (!response.ok) throw new Error(`Could not load ${faction.name}`);
  state.army = await response.json();
  const name = $("army-name").value.trim();
  const pointsLimit = Math.max(1, Number($("points-limit").value) || 2000);
  const draft = restore || loadDraft(factionId);
  if (draft && draft.factionId === factionId) {
    state.list = draft;
    if (!restore) {
      state.list.name = name || draft.name;
      state.list.pointsLimit = pointsLimit;
    }
  } else {
    state.list = blankList(factionId, name, pointsLimit);
  }
  state.list.characters ||= [];
  state.list.troops ||= [];
  state.list.brigades ||= [];
  showBuilder();
}

function saveNamedList() {
  const lists = loadSaves();
  const id = uid();
  lists.unshift({
    id,
    factionId: state.list.factionId,
    factionName: state.army.name,
    name: state.list.name,
    pointsLimit: state.list.pointsLimit,
    characters: state.list.characters,
    troops: state.list.troops,
    brigades: state.list.brigades,
    savedAt: new Date().toISOString(),
  });
  persistSaves(lists);
  $("list-status").textContent = "Saved on this browser.";
  $("list-status").className = "list-status ok";
}

function bindUi() {
  $("filter-row").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cat]");
    if (!button) return;
    state.filter = button.dataset.cat;
    for (const el of $("filter-row").querySelectorAll(".filter")) el.classList.toggle("active", el === button);
    renderCatalog();
  });
  $("catalog-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderCatalog();
  });
  $("catalog-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    openAdd(unitById(button.dataset.add));
  });
  $("army-list").addEventListener("click", (event) => {
    const editCharacter = event.target.closest("[data-edit-character]");
    const editTroop = event.target.closest("[data-edit-troop]");
    const removeChar = event.target.closest("[data-remove-character]");
    const removeTr = event.target.closest("[data-remove-troop]");
    const removeBr = event.target.closest("[data-remove-brigade]");
    if (editCharacter) {
      const entry = state.list.characters.find((row) => row.id === editCharacter.dataset.editCharacter);
      openAdd(unitById(entry.unitId), entry, "character");
    } else if (editTroop) {
      const entry = state.list.troops.find((row) => row.id === editTroop.dataset.editTroop);
      openAdd(unitById(entry.unitId), entry, "troop");
    } else if (removeChar) removeCharacter(removeChar.dataset.removeCharacter);
    else if (removeTr) removeTroop(removeTr.dataset.removeTroop);
    else if (removeBr) ungroup(removeBr.dataset.removeBrigade);
  });
  $("add-mount").addEventListener("change", updateAddCost);
  $("add-bonus").addEventListener("change", () => {
    const unit = unitById(state.pending?.unitId);
    if (unit) fillItems(unit, null);
    updateAddCost();
  });
  $("add-item").addEventListener("change", () => {
    const item = selectedItem();
    $("item-note").textContent = item?.description || item?.summary || "One magic item per character, or one magic standard per unit.";
    updateAddCost();
  });
  $("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    commitPending();
  });
  $("add-cancel").addEventListener("click", () => {
    state.pending = null;
    $("add-dialog").close();
  });
  $("btn-start").addEventListener("click", () => {
    const factionId = $("faction-select").value;
    startFromFaction(factionId, null).catch((error) => showError(error.message));
  });
  $("btn-back").addEventListener("click", showSetup);
  $("btn-clear").addEventListener("click", () => {
    state.list.characters = [];
    state.list.troops = [];
    state.list.brigades = [];
    renderAll();
  });
  $("btn-save").addEventListener("click", saveNamedList);
  $("btn-copy").addEventListener("click", async () => {
    const text = listAsText();
    try {
      await navigator.clipboard.writeText(text);
      $("list-status").textContent = "List copied.";
      $("list-status").className = "list-status ok";
    } catch {
      showError("Could not copy the list.");
    }
  });
  $("btn-print").addEventListener("click", () => {
    renderPrint();
    window.print();
  });
  $("saved-list").addEventListener("click", (event) => {
    const load = event.target.closest("[data-load]");
    const del = event.target.closest("[data-delete]");
    if (load) {
      const saved = loadSaves().find((list) => list.id === load.dataset.load);
      if (!saved) return;
      $("army-name").value = saved.name || "";
      $("points-limit").value = saved.pointsLimit;
      $("faction-select").value = saved.factionId;
      startFromFaction(saved.factionId, saved).catch((error) => showError(error.message));
    } else if (del) {
      persistSaves(loadSaves().filter((list) => list.id !== del.dataset.delete));
      renderSaved();
    }
  });
  $("army-name").addEventListener("input", () => {
    if (!state.list) return;
    state.list.name = $("army-name").value.trim();
  });
}

async function init() {
  bindUi();
  try {
    const [catalogRes, itemsRes] = await Promise.all([
      fetch("data/catalog.json"),
      fetch("data/magic-items.json"),
    ]);
    if (!catalogRes.ok || !itemsRes.ok) throw new Error("Could not load army data");
    state.catalog = await catalogRes.json();
    const items = await itemsRes.json();
    state.magicItems = items.items || [];
    $("sheet-info").textContent = state.catalog.disclaimer;
    $("faction-select").innerHTML = state.catalog.armies.map((army) =>
      `<option value="${esc(army.id)}">${esc(army.name)}</option>`
    ).join("");
    renderSaved();
  } catch (error) {
    showError(error.message);
  }
}

init();
