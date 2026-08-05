const root = document.getElementById("qrs");
const btnPrint = document.getElementById("btn-print");

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function renderArmyRules(rules) {
  const wrap = el("section", "army-rules");
  for (const key of ["synapse", "shadowInTheWarp"]) {
    const r = rules[key];
    const box = el("div", "rule-box");
    box.appendChild(el("h2", null, r.title));
    box.appendChild(el("p", null, r.summary));
    const ul = el("ul");
    for (const item of r.effects) ul.appendChild(el("li", null, item));
    box.appendChild(ul);
    wrap.appendChild(box);
  }
  return wrap;
}

function renderEnhancements(list) {
  const section = el("div", "section");
  section.appendChild(el("h3", null, "Enhancements"));
  for (const e of list) {
    const row = el("div", "enh-row");
    row.innerHTML = `<span class="enh-name">${e.name} (${e.pts} pts)</span> · ${e.restriction}<br>${e.effect}`;
    section.appendChild(row);
  }
  return section;
}

function renderStratagems(list) {
  const section = el("div", "section");
  section.appendChild(el("h3", null, "Stratagems"));
  for (const s of list) {
    const row = el("div", "strat");
    row.innerHTML = `
      <span class="cp">${s.cp}CP</span>
      <span class="strat-name">${s.name}</span>
      <div class="strat-wte"><strong>When:</strong> ${s.when}<br>
      <strong>Target:</strong> ${s.target}<br>
      <strong>Effect:</strong> ${s.effect}</div>`;
    section.appendChild(row);
  }
  return section;
}

function renderNoteBox(block, className = "") {
  const wrap = el("section", `ref-box${className ? ` ${className}` : ""}`);
  let html = `<strong>${block.title}</strong>`;
  if (block.summary) html += `<p>${block.summary}</p>`;
  if (block.sections?.length) {
    for (const sec of block.sections) {
      html += `<p class="note-heading">${sec.heading}</p><ul>${sec.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
    }
  } else if (block.bullets?.length) {
    html += `<ul>${block.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
  }
  wrap.innerHTML = html;
  return wrap;
}

function renderDetachment(d, options = {}) {
  const block = el("section", "detachment" + (options.pageBreak ? " page-break" : ""));
  block.appendChild(el("h2", null, d.name));
  if (d.source) {
    const src = el("p", "source-tag", d.source);
    block.appendChild(src);
  }

  const ruleSec = el("div", "section");
  ruleSec.appendChild(el("h3", null, `Detachment rule — ${d.detachmentRule.name}`));
  ruleSec.appendChild(el("p", null, d.detachmentRule.text));
  const ul = el("ul");
  for (const b of d.detachmentRule.bullets) ul.appendChild(el("li", null, b));
  ruleSec.appendChild(ul);

  const grid = el("div", "grid-two");
  grid.appendChild(renderEnhancements(d.enhancements));
  grid.appendChild(renderStratagems(d.stratagems));
  block.appendChild(ruleSec);
  block.appendChild(grid);

  if (d.notes?.length) {
    const note = el("div", "ref-box");
    note.innerHTML = `<strong>Notes</strong><ul>${d.notes.map((n) => `<li>${n}</li>`).join("")}</ul>`;
    block.appendChild(note);
  }

  if (d.reference) {
    const ref = el("div", "ref-box");
    ref.innerHTML = `<strong>${d.reference.title}</strong><ul>${d.reference.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
    block.appendChild(ref);
  }

  return block;
}

async function init() {
  const res = await fetch("rules.json?v=5");
  const data = await res.json();

  const header = el("header", "sheet-header");
  header.innerHTML = `<div><h1>Tyranids Quick Reference</h1></div><p>Crusher Stampede · Talons of the Norn Queen<br>Sources: Tyranid 1.pdf + Tyranid 2 Faction Pack · Print 100% Letter</p>`;
  root.appendChild(header);
  root.appendChild(renderArmyRules(data.armyRules));
  for (let i = 0; i < data.detachments.length; i++) {
    root.appendChild(renderDetachment(data.detachments[i], { pageBreak: i > 0 }));
  }
  if (data.sporeMines) {
    root.appendChild(renderNoteBox(data.sporeMines, "spore-mines"));
  }
  if (data.terrainRules) {
    root.appendChild(renderNoteBox(data.terrainRules, "terrain-rules"));
  }
}

btnPrint.addEventListener("click", () => window.print());
init();
