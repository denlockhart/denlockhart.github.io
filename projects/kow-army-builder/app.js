const STORAGE_KEY = "kow-army-builder-v1";

const state = {
  catalog: null,
  artefacts: [],
  spells: [],
  army: null,
  filter: "all",
  search: "",
  armyName: "",
  pointsLimit: 2300,
  battalions: [],
  nextId: 1,
  pendingUnit: null,
  editingId: null,
};

function $(id) { return document.getElementById(id); }

function showError(msg) {
  const box = $("error-box");
  if (!msg) { box.classList.add("hidden"); box.textContent = ""; return; }
  box.textContent = msg;
  box.classList.remove("hidden");
}

function loadSaves() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return Array.isArray(data.lists) ? data.lists : [];
  } catch {
    return [];
  }
}

function persistSaves(lists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ lists }));
}

function draftKey() {
  return STORAGE_KEY + "-draft";
}

function saveDraft() {
  if (!state.army) return;
  const payload = serializeList();
  localStorage.setItem(draftKey(), JSON.stringify(payload));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(draftKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function serializeList() {
  return {
    savedAt: Date.now(),
    factionId: state.army.id,
    armyName: state.armyName,
    pointsLimit: state.pointsLimit,
    nextId: state.nextId,
    battalions: state.battalions,
  };
}

function unitById(id) {
  return state.army.units.find((u) => u.id === id) || null;
}

function sizeById(unit, sizeId) {
  return (unit.sizes || []).find((s) => s.id === sizeId) || unit.sizes[0];
}

function artefactById(id) {
  return state.artefacts.find((a) => a.id === id) || null;
}

function spellById(id) {
  return state.spells.find((s) => s.id === id) || null;
}

function allEntries() {
  const out = [];
  for (const b of state.battalions) {
    for (const e of b.units) out.push({ ...e, battalionId: b.id });
  }
  return out;
}

function categoryOverrides(battalion) {
  const map = new Map();
  const oneClaimed = new Set();
  for (const source of battalion.units) {
    const unit = unitById(source.unitId);
    if (!unit) continue;
    const selected = new Set(source.optionIds || []);
    const rules = [];
    for (const rule of unit.makeCore || []) rules.push({ ...rule, category: "core", one: false });
    for (const rule of unit.makeCategory || []) rules.push({ ...rule, one: false });
    for (const rule of unit.makeOne || []) rules.push({ ...rule, one: true });
    for (const opt of unit.options || []) {
      if (!selected.has(opt.id)) continue;
      for (const rule of opt.makeCore || []) rules.push({ ...rule, category: "core", one: false });
      for (const rule of opt.makeCategory || []) rules.push({ ...rule, one: false });
      for (const rule of opt.makeOne || []) rules.push({ ...rule, one: true });
    }
    for (const rule of rules) {
      const sizes = rule.sizes || ["*"];
      const claim = source.id + ":" + rule.unit + ":" + rule.category;
      for (const target of battalion.units) {
        if (target.unitId !== rule.unit) continue;
        if (!sizes.includes("*") && !sizes.includes(target.sizeId)) continue;
        if (rule.one) {
          if (oneClaimed.has(claim)) break;
          oneClaimed.add(claim);
        }
        map.set(target.id, rule.category);
        if (rule.one) break;
      }
    }
  }
  return map;
}

function effectiveCategory(entry, battalion) {
  const unit = unitById(entry.unitId);
  if (!unit) return "core";
  const size = sizeById(unit, entry.sizeId);
  const map = categoryOverrides(battalion);
  return map.get(entry.id) || size.category;
}

function resolveEntry(entry, battalion) {
  const unit = unitById(entry.unitId);
  if (!unit) {
    return {
      entry,
      unit: { id: entry.unitId, name: "Unknown unit", typeLabel: "", special: [], traits: [] },
      size: { id: "", name: "", category: "core", sp: "—", me: "—", sh: "—", de: "—", us: 0, att: "—", ne: "—", points: 0 },
      options: [], artefact: null, spells: [], special: [],
      att: "—", sp: "—", me: "—", sh: "—", ne: "—", de: "—", points: 0, category: "core", us: 0, sizeName: "", ranged: [], dropRanged: false,
    };
  }
  const size = sizeById(unit, entry.sizeId);
  const options = (unit.options || []).filter((o) => (entry.optionIds || []).includes(o.id));
  const artefact = artefactById(entry.artefactId);
  const spells = (entry.spellIds || []).map(spellById).filter(Boolean);
  const special = [...(unit.special || [])];
  let att = size.att;
  let sp = size.sp;
  let me = size.me;
  let sh = size.sh;
  let ne = size.ne;
  let de = size.de;
  let sizeName = size.name;
  let points = size.points;
  let ranged = unit.ranged || [];
  for (const opt of options) {
    const extra = opt.pointsBySize ? opt.pointsBySize[size.id] : opt.points;
    if (extra) points += extra;
    if (typeof att === "number" && opt.attModBySize && opt.attModBySize[size.id]) att += opt.attModBySize[size.id];
    if (opt.attBySize && opt.attBySize[size.id] != null) att = opt.attBySize[size.id];
    if (opt.neBySize && opt.neBySize[size.id] != null) ne = opt.neBySize[size.id];
    if (opt.nameBySize && opt.nameBySize[size.id]) sizeName = opt.nameBySize[size.id];
    if (opt.sp != null) sp = opt.sp;
    if (opt.me != null) me = opt.me;
    if (opt.sh != null) sh = opt.sh;
    if (opt.de != null) de = opt.de;
    if (opt.dropSpecial) {
      for (const name of opt.dropSpecial) {
        const idx = special.indexOf(name);
        if (idx >= 0) special.splice(idx, 1);
      }
    }
    if (opt.addSpecial) special.push(...opt.addSpecial);
    if (opt.ranged) ranged = opt.ranged;
    if (opt.dropRanged) ranged = [];
  }
  if (artefact) {
    points += artefact.points;
    if (artefact.spMod) sp += artefact.spMod;
    if (artefact.addSpecial) special.push(...artefact.addSpecial);
  }
  for (const spn of spells) points += spn.points;
  return {
    entry,
    unit,
    size,
    options,
    artefact,
    spells,
    special,
    att,
    sp,
    me,
    sh,
    ne,
    de,
    sizeName,
    ranged,
    dropRanged: ranged.length === 0,
    points,
    category: effectiveCategory(entry, battalion),
    us: size.us,
  };
}

function entryCost(entry, battalion) {
  return resolveEntry(entry, battalion).points;
}

function armyPoints() {
  let total = 0;
  for (const b of state.battalions) {
    for (const e of b.units) total += entryCost(e, b);
  }
  return total;
}

function armyUS() {
  let total = 0;
  for (const b of state.battalions) {
    for (const e of b.units) total += resolveEntry(e, b).us || 0;
  }
  return total;
}

function battalionCounts(battalion) {
  const counts = { core: 0, auxiliary: 0, specialist: 0, support: 0, commander: 0, warlord: 0 };
  for (const e of battalion.units) {
    const r = resolveEntry(e, battalion);
    counts[r.category] = (counts[r.category] || 0) + 1;
    if (r.unit.role === "warlord") counts.warlord += 1;
  }
  const pairs = Math.floor((counts.core + counts.specialist) / 2);
  return {
    ...counts,
    auxMax: counts.core,
    specMax: Math.min(4, counts.core),
    suppMax: Math.min(4, pairs),
    cmdMax: Math.min(4, pairs),
    pairs,
  };
}

function uniqueTaken(kind, id, exceptEntryId) {
  let n = 0;
  for (const e of allEntries()) {
    if (e.id === exceptEntryId) continue;
    if (kind === "unit" && e.unitId === id) n += 1;
    if (kind === "artefact" && e.artefactId === id) n += 1;
    if (kind === "spell" && (e.spellIds || []).includes(id)) n += 1;
  }
  return n;
}

function battalionIssues(battalion, index) {
  const issues = [];
  const c = battalionCounts(battalion);
  if (battalion.units.length === 0) {
    return { issues: [], counts: c, valid: false };
  }
  if (c.core < 2) issues.push("Needs at least 2 Core units.");
  if (c.commander < 1) issues.push("Needs at least 1 Commander.");
  if (c.auxiliary > c.auxMax) issues.push("Too many Auxiliary (1 per Core).");
  if (c.specialist > c.specMax) issues.push("Too many Specialist (1 per Core, max 4).");
  if (c.support > c.suppMax) issues.push("Too many Support (1 per pair of Core/Specialist, max 4).");
  if (c.core >= 2 && c.commander > c.cmdMax) issues.push("Too many Commanders (1 per pair of Core/Specialist, max 4).");
  else if (c.core < 2 && c.commander > 1) issues.push("Too many Commanders until you have more Core.");
  if (c.warlord > 1) issues.push("Only one Warlord per battalion.");
  const unitIds = battalion.units.map((e) => e.unitId);
  for (const e of battalion.units) {
    const r = resolveEntry(e, battalion);
    for (const opt of r.options) {
      if (opt.onlySizes && !opt.onlySizes.includes(r.size.id)) {
        issues.push(r.unit.name + ": " + opt.name + " does not apply to this size.");
      }
      if (opt.requiresUnit && !unitIds.some((id) => id === opt.requiresUnit || id.startsWith(opt.requiresUnit + "-") || id.startsWith(opt.requiresUnit))) {
        issues.push(r.unit.name + " option requires " + opt.requiresUnit + " in this battalion.");
      }
    }
  }
  const byUnit = {};
  for (const e of battalion.units) {
    byUnit[e.unitId] = (byUnit[e.unitId] || 0) + 1;
  }
  for (const [uid, n] of Object.entries(byUnit)) {
    const unit = unitById(uid);
    if (unit && unit.limit && n > unit.limit) {
      issues.push(unit.name + " is limited to " + unit.limit + " per battalion.");
    }
  }
  if (index > 0) {
    const prev = state.battalions[index - 1];
    const prevC = battalionCounts(prev);
    if (prevC.core < 4) issues.push("Previous battalion needs 4 Core before this battalion can be used.");
  }
  return { issues, counts: c, valid: issues.length === 0 };
}

function armyIssues() {
  const issues = [];
  const pts = armyPoints();
  if (pts > state.pointsLimit) issues.push("Over points (" + pts + " / " + state.pointsLimit + ").");
  const uniques = {};
  const arts = {};
  const spells = {};
  for (const e of allEntries()) {
    const unit = unitById(e.unitId);
    if (unit && unit.unique) {
      uniques[unit.id] = (uniques[unit.id] || 0) + 1;
      if (uniques[unit.id] > 1) issues.push(unit.name + " is Unique [U] — only one per army.");
    }
    if (e.artefactId) {
      arts[e.artefactId] = (arts[e.artefactId] || 0) + 1;
      const a = artefactById(e.artefactId);
      if (a && a.unique && arts[e.artefactId] > 1) issues.push(a.name + " is Unique [U].");
    }
    for (const sid of e.spellIds || []) {
      spells[sid] = (spells[sid] || 0) + 1;
      const sp = spellById(sid);
      if (sp && sp.unique && spells[sid] > 1) issues.push(sp.name + " is Unique [U].");
    }
  }
  if (!state.battalions.some((b) => b.units.length)) issues.push("Add at least one unit.");
  return issues;
}

function fmtProfile(unit, size) {
  const s = size || unit.sizes[0];
  return "Sp " + s.sp + "  Me " + s.me + "  Sh " + s.sh + "  De " + s.de +
    "  Att " + s.att + "  Ne " + s.ne + "  US " + s.us;
}

function catLabel(cat) {
  return ({
    core: "Core",
    auxiliary: "Aux",
    specialist: "Specialist",
    support: "Support",
    commander: "Commander",
  })[cat] || cat;
}

function pointsRange(unit) {
  const pts = unit.sizes.map((s) => s.points);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  return min === max ? min + " pts" : min + "–" + max + " pts";
}

function defaultSize(unit) {
  return unit.sizes[0];
}

function canTakeArtefact(artefact, unit) {
  if (!artefact) return true;
  if (artefact.restriction === "hero" && !String(unit.type).startsWith("hero")) return false;
  if (artefact.restriction === "infantry-hero" && unit.type !== "hero-infantry") return false;
  return true;
}

function computePendingCost() {
  if (!state.pendingUnit) return 0;
  const fakeBattalion = currentAddBattalion();
  const entry = pendingAsEntry();
  return entryCost(entry, fakeBattalion);
}

function currentAddBattalion() {
  const id = Number($("add-battalion").value);
  return state.battalions.find((b) => b.id === id) || state.battalions[0];
}

function pendingAsEntry() {
  const unit = state.pendingUnit;
  const sizeId = $("add-size").value;
  const optionIds = [...document.querySelectorAll("#opt-list input:checked")].map((el) => el.value);
  const artefactId = $("add-artefact").value || null;
  const spellIds = [...document.querySelectorAll("#spell-list input:checked")].map((el) => el.value);
  return {
    id: state.editingId || 0,
    unitId: unit.id,
    sizeId,
    optionIds,
    artefactId,
    spellIds,
  };
}

function updateAddCost() {
  if (!state.pendingUnit) return;
  const r = resolveEntry(pendingAsEntry(), currentAddBattalion());
  $("add-cost").textContent = String(r.points);
  const rangedText = (r.ranged || []).map((rng) => rng.name + " (" + rng.range + (rng.text ? ", " + rng.text : "") + ")").join("; ");
  $("add-profile").textContent = [
    catLabel(r.size.category) + " " + r.unit.typeLabel + " " + (r.sizeName || r.size.name),
    fmtProfile(r.unit, { ...r.size, att: r.att, sp: r.sp, me: r.me, sh: r.sh, ne: r.ne, de: r.de }),
    r.special.join(", "),
    (r.unit.traits || []).length ? "Traits: " + r.unit.traits.join(", ") : "",
    rangedText,
  ].filter(Boolean).join(" · ");
}

function openAddDialog(unit, existing) {
  state.pendingUnit = unit;
  state.editingId = existing ? existing.id : null;
  $("add-title").textContent = (existing ? "Edit " : "Add ") + unit.name;
  $("add-submit").textContent = existing ? "Save" : "Add to Army";

  const sizeSel = $("add-size");
  sizeSel.innerHTML = unit.sizes.map((s) => {
    const tags = [];
    if (unit.unique) tags.push("[U]");
    if (unit.limit) tags.push("[" + unit.limit + "]");
    return "<option value=\"" + s.id + "\">" + s.name + " — " + catLabel(s.category) + " — " + s.points + " pts" +
      (tags.length ? " " + tags.join(" ") : "") + "</option>";
  }).join("");
  $("size-wrap").classList.toggle("hidden", unit.sizes.length < 2);
  if (existing) sizeSel.value = existing.sizeId;

  const batSel = $("add-battalion");
  batSel.innerHTML = state.battalions.map((b, i) =>
    "<option value=\"" + b.id + "\">Battalion " + (i + 1) + "</option>"
  ).join("");
  if (existing) {
    const home = state.battalions.find((b) => b.units.some((e) => e.id === existing.id));
    if (home) batSel.value = String(home.id);
  }

  const opts = unit.options || [];
  $("opt-fieldset").classList.toggle("hidden", opts.length === 0);
  $("opt-list").innerHTML = opts.map((o) => {
    const pts = o.pointsBySize ? "varies" : (o.points + " pts");
    const checked = existing && (existing.optionIds || []).includes(o.id) ? " checked" : "";
    const excludes = (o.excludes || []).join(",");
    return "<label><input type=\"checkbox\" value=\"" + o.id + "\" data-excludes=\"" + excludes + "\"" + checked + "> " + o.name + " (" + pts + ")</label>";
  }).join("");

  $("add-artefact").innerHTML = "<option value=\"\">— none —</option>" + state.artefacts.map((a) => {
    const used = uniqueTaken("artefact", a.id, existing && existing.id) > 0;
    const allowed = canTakeArtefact(a, unit);
    const selected = existing && existing.artefactId === a.id ? " selected" : "";
    const disabled = (!allowed || (used && !(existing && existing.artefactId === a.id))) ? " disabled" : "";
    return "<option value=\"" + a.id + "\"" + selected + disabled + ">" + a.name + " (" + a.points + ")</option>";
  }).join("");

  const isCaster = (unit.traits || []).includes("Spellcaster");
  $("spell-fieldset").classList.toggle("hidden", !isCaster);
  $("spell-list").innerHTML = isCaster ? state.spells.map((s) => {
    const used = uniqueTaken("spell", s.id, existing && existing.id) > 0;
    const checked = existing && (existing.spellIds || []).includes(s.id) ? " checked" : "";
    const disabled = used && !checked ? " disabled" : "";
    return "<label><input type=\"checkbox\" value=\"" + s.id + "\"" + checked + disabled + "> " +
      s.name + " (" + s.level + ") — " + s.points + " pts</label>";
  }).join("") : "";

  $("add-warn").textContent = unit.sourceNote || "";
  updateAddCost();
  $("add-dialog").showModal();
}

function entryTitle(resolved) {
  const bits = [resolved.unit.name];
  const sizeName = resolved.sizeName || resolved.size.name;
  if (sizeName && sizeName !== "Warlord" && sizeName !== "Champion" && sizeName !== "War Engine" && sizeName !== "Titan" && sizeName !== "Hero" && sizeName !== "Monster") {
    bits.push(sizeName);
  }
  if (resolved.unit.unique) bits.push("[U]");
  return bits.join(" ");
}

function renderCatalog() {
  const q = state.search.trim().toLowerCase();
  const list = $("catalog-list");
  const units = state.army.units.filter((u) => {
    if (state.filter !== "all") {
      const cats = new Set(u.sizes.map((s) => s.category));
      if (!cats.has(state.filter)) return false;
    }
    if (q && !u.name.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (!units.length) {
    list.innerHTML = "<p class=\"empty-hint\">No units match.</p>";
    return;
  }
  list.innerHTML = units.map((u) => {
    const cats = [...new Set(u.sizes.map((s) => s.category))];
    const pills = cats.map((c) => "<span class=\"cat-pill " + c + "\">" + catLabel(c) + "</span>").join("");
    const flags = [u.unique ? "[U]" : "", u.limit ? "[" + u.limit + "]" : "", u.role === "warlord" ? "Warlord" : (u.role === "champion" ? "Champion" : "")]
      .filter(Boolean).join(" ");
    return "<button type=\"button\" class=\"catalog-item\" data-unit=\"" + u.id + "\">" +
      "<div><h4>" + u.name + " <span class=\"meta\">" + flags + "</span></h4>" +
      "<div class=\"meta\">" + pills + " " + u.typeLabel + "</div>" +
      "<div class=\"stats\">" + fmtProfile(u, defaultSize(u)) + "</div></div>" +
      "<div class=\"meta\">" + pointsRange(u) + "</div></button>";
  }).join("");
  list.querySelectorAll(".catalog-item").forEach((el) => {
    el.addEventListener("click", () => openAddDialog(unitById(el.dataset.unit)));
  });
}

function renderBattalions() {
  const wrap = $("battalion-list");
  wrap.innerHTML = state.battalions.map((b, i) => {
    const { issues, counts } = battalionIssues(b, i);
    const slots = "Core " + counts.core +
      " · Aux " + counts.auxiliary + "/" + counts.auxMax +
      " · Spec " + counts.specialist + "/" + counts.specMax +
      " · Supp " + counts.support + "/" + counts.suppMax +
      " · Cmd " + counts.commander + "/" + counts.cmdMax;
    const rows = b.units.length
      ? b.units.map((e) => {
        const r = resolveEntry(e, b);
        const extras = [];
        r.options.forEach((o) => extras.push(o.name));
        if (r.artefact) extras.push(r.artefact.name);
        r.spells.forEach((s) => extras.push(s.name + " (" + s.level + ")"));
        const wasCore = r.category === "core" && r.size.category !== "core";
        return "<div class=\"unit-row\" data-id=\"" + e.id + "\">" +
          "<div><strong>" + entryTitle(r) + "</strong> " +
          "<span class=\"cat-pill " + r.category + (wasCore ? " was-core" : "") + "\">" + catLabel(r.category) + "</span>" +
          "<div class=\"stats\">" + fmtProfile(r.unit, { ...r.size, att: r.att, sp: r.sp, me: r.me, sh: r.sh, ne: r.ne, de: r.de }) + "</div>" +
          (extras.length ? "<div class=\"meta\">" + extras.join(" · ") + "</div>" : "") +
          "</div><div><div class=\"meta\" style=\"text-align:right\">" + r.points + " pts</div>" +
          "<div class=\"actions\" style=\"margin-top:.25rem;justify-content:flex-end\">" +
          "<button type=\"button\" class=\"tiny\" data-edit=\"" + e.id + "\">Edit</button>" +
          "<button type=\"button\" class=\"tiny danger\" data-del=\"" + e.id + "\">Remove</button>" +
          "</div></div></div>";
      }).join("")
      : "<p class=\"empty-hint\">No units yet — pick from the catalog.</p>";
    return "<div class=\"battalion-card\" data-bat=\"" + b.id + "\">" +
      "<div class=\"battalion-card-header\"><span>Battalion " + (i + 1) + "</span>" +
      (state.battalions.length > 1 ? "<button type=\"button\" class=\"tiny\" data-rm-bat=\"" + b.id + "\">Remove</button>" : "") +
      "</div><div class=\"battalion-card-body\">" +
      "<div class=\"slot-line" + (issues.length ? " bad" : "") + "\">" + slots + "</div>" +
      rows +
      (issues.length ? "<p class=\"issues\">" + issues.join(" ") + "</p>" : "") +
      "</div></div>";
  }).join("");

  wrap.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-edit"));
      const found = allEntries().find((e) => e.id === id);
      if (found) openAddDialog(unitById(found.unitId), found);
    });
  });
  wrap.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => removeEntry(Number(btn.getAttribute("data-del"))));
  });
  wrap.querySelectorAll("[data-rm-bat]").forEach((btn) => {
    btn.addEventListener("click", () => removeBattalion(Number(btn.getAttribute("data-rm-bat"))));
  });
}

function renderSummary() {
  $("summary-army-name").textContent = state.armyName || "(unnamed)";
  $("summary-faction").textContent = state.army.name + " · 4th Edition";
  const pts = armyPoints();
  $("points-used").textContent = String(pts);
  $("points-max").textContent = String(state.pointsLimit);
  $("unit-count").textContent = String(allEntries().length);
  $("us-total").textContent = String(armyUS());
  const issues = armyIssues();
  const batIssues = state.battalions.flatMap((b, i) => b.units.length ? battalionIssues(b, i).issues : []);
  const all = issues.concat(batIssues);
  const el = $("list-status");
  if (!allEntries().length) {
    el.textContent = "Start with a Commander and two Core units.";
    el.className = "list-status";
  } else if (all.length) {
    el.textContent = "Invalid — " + all[0];
    el.className = "list-status bad";
  } else {
    el.textContent = "Valid list · " + pts + " / " + state.pointsLimit + " pts · US " + armyUS();
    el.className = "list-status ok";
  }
}

function renderOrders() {
  const orders = state.army.commandOrders || [];
  $("orders-list").innerHTML = orders.length
    ? orders.map((o) => "<div class=\"order-item\"><strong>" + o.name + "</strong> <span class=\"meta\">" + o.target + "</span><div>" + o.text + "</div></div>").join("")
    : "<p class=\"empty-hint\">No command orders listed for this army.</p>";
}

function renderAll() {
  renderCatalog();
  renderBattalions();
  renderSummary();
  renderOrders();
  saveDraft();
}

function addBattalion() {
  const last = state.battalions[state.battalions.length - 1];
  if (last && battalionCounts(last).core < 4 && last.units.length) {
    showError("The current battalion needs 4 Core units before you can start another.");
    return;
  }
  showError("");
  state.battalions.push({ id: state.nextId++, name: "", units: [] });
  renderAll();
}

function removeBattalion(id) {
  if (state.battalions.length < 2) return;
  state.battalions = state.battalions.filter((b) => b.id !== id);
  if (!state.battalions.length) addBattalion();
  renderAll();
}

function removeEntry(id) {
  for (const b of state.battalions) b.units = b.units.filter((e) => e.id !== id);
  renderAll();
}

function commitPending() {
  const unit = state.pendingUnit;
  const entry = pendingAsEntry();
  const destId = Number($("add-battalion").value);
  if (unit.unique && uniqueTaken("unit", unit.id, state.editingId) > 0) {
    showError(unit.name + " is Unique [U] — already in the list.");
    return false;
  }
  if (state.editingId) {
    for (const b of state.battalions) {
      const idx = b.units.findIndex((e) => e.id === state.editingId);
      if (idx >= 0) {
        b.units.splice(idx, 1);
        break;
      }
    }
    entry.id = state.editingId;
  } else {
    entry.id = state.nextId++;
  }
  const dest = state.battalions.find((b) => b.id === destId) || state.battalions[0];
  dest.units.push(entry);
  return true;
}

function listAsText() {
  const lines = [];
  lines.push((state.armyName || "Unnamed Army") + " — " + state.army.name);
  lines.push(armyPoints() + " / " + state.pointsLimit + " pts · US " + armyUS() + " · " + allEntries().length + " units");
  lines.push("");
  state.battalions.forEach((b, i) => {
    const c = battalionCounts(b);
    lines.push("Battalion " + (i + 1) + "  (Core " + c.core + ", Aux " + c.auxiliary + "/" + c.auxMax +
      ", Spec " + c.specialist + "/" + c.specMax + ", Supp " + c.support + "/" + c.suppMax +
      ", Cmd " + c.commander + "/" + c.cmdMax + ")");
    for (const e of b.units) {
      const r = resolveEntry(e, b);
      const extras = r.options.map((o) => o.name)
        .concat(r.artefact ? [r.artefact.name] : [])
        .concat(r.spells.map((s) => s.name + "(" + s.level + ")"));
      lines.push("  " + entryTitle(r) + " [" + catLabel(r.category) + "]  " +
        fmtProfile(r.unit, { ...r.size, att: r.att, sp: r.sp, me: r.me, sh: r.sh, ne: r.ne, de: r.de }) + "  " + r.points + " pts");
      if (extras.length) lines.push("    " + extras.join(", "));
      if (r.special.length) lines.push("    " + r.special.join(", "));
    }
    lines.push("");
  });
  const issues = armyIssues().concat(state.battalions.flatMap((b, i) => battalionIssues(b, i).issues));
  lines.push(issues.length ? "Status: INVALID — " + issues.join(" ") : "Status: Valid");
  lines.push("Unofficial fan list — verify against Mantic Companion.");
  return lines.join("\n");
}

function renderPrint() {
  const valid = armyIssues().length === 0 && state.battalions.every((b, i) => !b.units.length || battalionIssues(b, i).valid);
  let html = "<h1>" + (state.armyName || "Unnamed Army") + "</h1>" +
    "<p class=\"print-meta\">" + state.army.name + " · Kings of War 4th Edition · " +
    armyPoints() + " / " + state.pointsLimit + " pts · US " + armyUS() +
    (valid ? " · Valid" : " · Invalid") + "</p>";
  state.battalions.forEach((b, i) => {
    const c = battalionCounts(b);
    html += "<h2>Battalion " + (i + 1) + "</h2>";
    html += "<p class=\"fine\">Aux " + c.auxiliary + "/" + c.auxMax + " · Specialist " + c.specialist + "/" + c.specMax +
      " · Support " + c.support + "/" + c.suppMax + " · Commanders " + c.commander + "/" + c.cmdMax + "</p>";
    html += "<table><thead><tr><th>Unit</th><th>Sp</th><th>Me</th><th>Sh</th><th>De</th><th>Att</th><th>Ne</th><th>US</th><th class=\"pts\">Pts</th></tr></thead><tbody>";
    for (const e of b.units) {
      const r = resolveEntry(e, b);
      const extras = r.options.map((o) => o.name)
        .concat(r.artefact ? [r.artefact.name] : [])
        .concat(r.spells.map((s) => s.name + " (" + s.level + ")"));
      html += "<tr><td><strong>" + entryTitle(r) + "</strong> <span class=\"fine\">" + catLabel(r.category) + " " + r.unit.typeLabel + "</span>";
      if (extras.length) html += "<div class=\"fine\">" + extras.join(" · ") + "</div>";
      if (r.special.length) html += "<div class=\"fine\">" + r.special.join(", ") + "</div>";
      html += "</td><td>" + r.sp + "</td><td>" + r.me + "</td><td>" + r.sh + "</td><td>" + r.de +
        "</td><td>" + r.att + "</td><td>" + r.ne + "</td><td>" + r.us + "</td><td class=\"pts\">" + r.points + "</td></tr>";
    }
    html += "</tbody></table>";
  });
  if ((state.army.commandOrders || []).length) {
    html += "<h2>Command Orders</h2>";
    html += state.army.commandOrders.map((o) => "<p><strong>" + o.name + "</strong> " + o.target + " — " + o.text + "</p>").join("");
  }
  html += "<p class=\"fine\">Unofficial fan tool. Verify against the Mantic Companion before play.</p>";
  $("print-sheet").innerHTML = html;
}

function resetArmy() {
  state.battalions = [{ id: 1, name: "", units: [] }];
  state.nextId = 2;
}

function showSetup() {
  $("screen-setup").classList.remove("hidden");
  $("screen-builder").classList.add("hidden");
}

function showBuilder() {
  $("screen-setup").classList.add("hidden");
  $("screen-builder").classList.remove("hidden");
}

function startFromFaction(factionId, restore) {
  const item = state.catalog.armies.find((a) => a.id === factionId);
  if (!item) return;
  showError("");
  fetch("data/armies/" + item.file + "?v=10")
    .then((r) => {
      if (!r.ok) throw new Error("Could not load " + item.name);
      return r.json();
    })
    .then((army) => {
      state.army = army;
      state.filter = "all";
      $("catalog-search").value = "";
      state.search = "";
      if (restore) {
        state.armyName = restore.armyName || "";
        state.pointsLimit = restore.pointsLimit || 2300;
        const known = new Set(army.units.map((u) => u.id));
        state.battalions = restore.battalions && restore.battalions.length
          ? restore.battalions.map((b) => ({ ...b, units: (b.units || []).filter((e) => known.has(e.unitId)) }))
          : [{ id: 1, name: "", units: [] }];
        state.nextId = restore.nextId || 2;
        $("army-name").value = state.armyName;
        $("points-limit").value = String(state.pointsLimit);
      } else {
        state.armyName = $("army-name").value.trim();
        state.pointsLimit = Number($("points-limit").value) || 2300;
        resetArmy();
      }
      $("sheet-info").textContent = army.sourceNote || "";
      showBuilder();
      renderAll();
    })
    .catch((err) => showError(err.message));
}

function renderSaved() {
  const lists = loadSaves();
  const wrap = $("saved-wrap");
  const box = $("saved-list");
  if (!lists.length) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  box.innerHTML = lists.map((s, i) => {
    const when = new Date(s.savedAt).toLocaleString();
    return "<div class=\"saved-item\"><div><strong>" + (s.armyName || "Unnamed") + "</strong> " +
      "<span class=\"meta\">" + s.factionId + " · " + (s.pointsLimit || "") + " pts · " + when + "</span></div>" +
      "<div class=\"actions\" style=\"margin:0\">" +
      "<button type=\"button\" class=\"tiny\" data-load=\"" + i + "\">Open</button>" +
      "<button type=\"button\" class=\"tiny danger\" data-forget=\"" + i + "\">Delete</button>" +
      "</div></div>";
  }).join("");
  box.querySelectorAll("[data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = loadSaves()[Number(btn.getAttribute("data-load"))];
      if (!s) return;
      $("faction-select").value = s.factionId;
      startFromFaction(s.factionId, s);
    });
  });
  box.querySelectorAll("[data-forget]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lists = loadSaves();
      lists.splice(Number(btn.getAttribute("data-forget")), 1);
      persistSaves(lists);
      renderSaved();
    });
  });
}

function saveNamedList() {
  if (!state.army) return;
  const lists = loadSaves();
  const payload = serializeList();
  const idx = lists.findIndex((l) => l.factionId === payload.factionId && l.armyName === payload.armyName && payload.armyName);
  if (idx >= 0) lists[idx] = payload;
  else lists.unshift(payload);
  persistSaves(lists.slice(0, 20));
  showError("");
  $("list-status").textContent = "Saved to this browser.";
  $("list-status").className = "list-status ok";
}

function bindUi() {
  $("btn-start").addEventListener("click", () => {
    startFromFaction($("faction-select").value);
  });
  $("btn-back").addEventListener("click", () => {
    saveDraft();
    showSetup();
    renderSaved();
  });
  $("btn-clear").addEventListener("click", () => {
    if (!confirm("Clear this army list?")) return;
    resetArmy();
    renderAll();
  });
  $("btn-add-battalion").addEventListener("click", addBattalion);
  $("btn-save").addEventListener("click", saveNamedList);
  $("btn-copy").addEventListener("click", async () => {
    const text = listAsText();
    try {
      await navigator.clipboard.writeText(text);
      $("list-status").textContent = "List copied to clipboard.";
      $("list-status").className = "list-status ok";
    } catch {
      showError("Could not copy — select and copy the print view instead.");
    }
  });
  $("btn-print").addEventListener("click", () => {
    renderPrint();
    window.print();
  });
  $("filter-row").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cat]");
    if (!btn) return;
    state.filter = btn.getAttribute("data-cat");
    $("filter-row").querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === btn));
    renderCatalog();
  });
  $("catalog-search").addEventListener("input", () => {
    state.search = $("catalog-search").value;
    renderCatalog();
  });
  $("army-name").addEventListener("input", () => {
    state.armyName = $("army-name").value.trim();
    if (state.army) {
      $("summary-army-name").textContent = state.armyName || "(unnamed)";
      saveDraft();
    }
  });
  $("points-limit").addEventListener("change", () => {
    state.pointsLimit = Number($("points-limit").value) || 2300;
    if (state.army) renderSummary();
  });
  $("add-cancel").addEventListener("click", () => $("add-dialog").close());
  $("add-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!commitPending()) return;
    $("add-dialog").close();
    state.pendingUnit = null;
    state.editingId = null;
    showError("");
    renderAll();
  });
  $("add-form").addEventListener("change", (ev) => {
    const input = ev.target;
    if (input && input.matches && input.matches("#opt-list input") && input.checked) {
      for (const id of (input.dataset.excludes || "").split(",").filter(Boolean)) {
        const other = document.querySelector("#opt-list input[value=\"" + id + "\"]");
        if (other) other.checked = false;
      }
    }
    updateAddCost();
  });
  $("add-form").addEventListener("input", updateAddCost);
}

function init() {
  bindUi();
  Promise.all([
    fetch("data/catalog.json?v=10").then((r) => r.json()),
    fetch("data/artefacts.json").then((r) => r.json()),
    fetch("data/spells.json").then((r) => r.json()),
  ]).then(([catalog, artefacts, spells]) => {
    state.catalog = catalog;
    state.artefacts = artefacts.artefacts || [];
    state.spells = spells.spells || [];
    $("faction-select").innerHTML = catalog.armies.map((a) =>
      "<option value=\"" + a.id + "\">" + a.name + "</option>"
    ).join("");
    $("sheet-info").textContent = catalog.disclaimer;
    renderSaved();
    const draft = loadDraft();
    if (draft && draft.factionId && draft.battalions && draft.battalions.some((b) => b.units.length)) {
      $("faction-select").value = draft.factionId;
      $("army-name").value = draft.armyName || "";
      $("points-limit").value = String(draft.pointsLimit || 2300);
    }
  }).catch(() => showError("Could not load Kings of War data files."));
}

init();
