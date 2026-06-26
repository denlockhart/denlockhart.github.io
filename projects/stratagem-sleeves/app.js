const PAGE_W_PT = 612;
const PAGE_H_PT = 792;
const SHEET_COLS = 2;
const CARD_W_PT = 2.5 * 72;
const CARD_H_PT = 3.5 * 72;

const $ = (sel) => document.querySelector(sel);

const factionSelect = $("#faction-select");
const presetSelect = $("#preset-select");
const presetMeta = $("#preset-meta");
const btnGenerate = $("#btn-generate");
const btnCustom = $("#btn-custom");
const statusBanner = $("#status-banner");
const localHint = $("#local-hint");
const cliExample = $("#cli-example");
const cliCapture = $("#cli-capture");

let presets = [];
let localServer = false;
let busy = false;
const sourceCache = new Map();

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function setStatus(message, type = "info") {
  if (!message) {
    statusBanner.classList.add("hidden");
    statusBanner.textContent = "";
    return;
  }
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

function setBusy(isBusy, message) {
  busy = isBusy;
  updateButtons();
  if (isBusy) setStatus(message, "busy");
}

function uniqueFactions(items) {
  return [...new Set(items.map((p) => p.faction))].sort();
}

function filterPresets(faction) {
  return faction ? presets.filter((p) => p.faction === faction) : presets;
}

function sourcesBase(outputSlug) {
  return `/data/stratagem-sources/${outputSlug}/`;
}

async function hasSavedSources(outputSlug) {
  if (sourceCache.has(outputSlug)) return sourceCache.get(outputSlug);
  try {
    const res = await fetch(`${sourcesBase(outputSlug)}sources.json`, { method: "HEAD" });
    const ok = res.ok;
    sourceCache.set(outputSlug, ok);
    return ok;
  } catch {
    sourceCache.set(outputSlug, false);
    return false;
  }
}

async function loadManifest(outputSlug) {
  const res = await fetch(`${sourcesBase(outputSlug)}sources.json`);
  if (!res.ok) throw new Error(`No saved card sources for "${outputSlug}".`);
  return res.json();
}

async function buildPdfFromSources(outputSlug, detachmentName) {
  const base = sourcesBase(outputSlug);
  const manifest = await loadManifest(outputSlug);
  const { PDFDocument } = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm");
  const pdfDoc = await PDFDocument.create();

  const pngBuffers = await Promise.all(
    manifest.cards.map(async (card) => {
      const res = await fetch(`${base}${card.file}`);
      if (!res.ok) throw new Error(`Missing card file: ${card.file}`);
      return res.arrayBuffer();
    })
  );

  const rows = Math.ceil(manifest.cards.length / SHEET_COLS);
  const sheetMarginX = (PAGE_W_PT - SHEET_COLS * CARD_W_PT) / 2;
  const sheetMarginY = (PAGE_H_PT - rows * CARD_H_PT) / 2;
  const sheetPage = pdfDoc.addPage([PAGE_W_PT, PAGE_H_PT]);

  for (let i = 0; i < pngBuffers.length; i++) {
    const col = i % SHEET_COLS;
    const row = Math.floor(i / SHEET_COLS);
    const x = sheetMarginX + col * CARD_W_PT;
    const y = PAGE_H_PT - sheetMarginY - (row + 1) * CARD_H_PT;
    const pngImage = await pdfDoc.embedPng(pngBuffers[i]);
    sheetPage.drawImage(pngImage, { x, y, width: CARD_W_PT, height: CARD_H_PT });
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `${slugify(detachmentName)}-stratagems-sleeve.pdf`;
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fillPresetSelect(faction) {
  const current = presetSelect.value;
  const list = filterPresets(faction);
  presetSelect.innerHTML = '<option value="">Choose a detachment…</option>';
  for (const p of list) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.detachmentName;
    presetSelect.appendChild(opt);
  }
  if (list.some((p) => p.id === current)) {
    presetSelect.value = current;
  }
  updatePresetMeta();
}

async function updatePresetMeta() {
  const preset = presets.find((p) => p.id === presetSelect.value);
  if (!preset) {
    presetMeta.textContent = "";
    updateButtons();
    return;
  }

  const saved = await hasSavedSources(preset.outputSlug);
  presetMeta.textContent = saved
    ? `${preset.faction} · saved sources ready — builds instantly`
    : `${preset.faction} · sources not captured yet (see command line below)`;

  cliExample.textContent = `npm run stratagem-sleeves -- --preset ${preset.id} --build`;
  cliCapture.textContent = `npm run stratagem-sleeves -- --preset ${preset.id} --capture`;

  updateButtons(preset, saved);
}

function updateButtons(preset, saved) {
  preset ??= presets.find((p) => p.id === presetSelect.value);
  saved ??= preset ? sourceCache.get(preset.outputSlug) : false;

  const canBuildPreset = Boolean(preset && (saved || localServer));
  btnGenerate.disabled = busy || !canBuildPreset;

  if (preset && saved) {
    btnGenerate.textContent = "Build & Download PDF";
  } else if (preset && localServer) {
    btnGenerate.textContent = "Capture & Download PDF";
  } else {
    btnGenerate.textContent = "Build & Download PDF";
  }

  btnCustom.disabled = busy || !localServer;
}

async function loadPresets() {
  const urls = ["/api/presets", "/data/stratagem-sleeves/manifest.json", "presets.json"];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        presets = data.map((p) => ({
          id: p.id,
          faction: p.faction ?? "Unknown",
          detachmentName: p.detachmentName,
          filterValue: p.filterValue,
          factionUrl: p.factionUrl,
          outputSlug: p.outputSlug ?? p.id.replace(/^tyranids-/, ""),
          hasSources: p.hasSources,
        }));
        for (const p of presets) {
          if (typeof p.hasSources === "boolean") {
            sourceCache.set(p.outputSlug, p.hasSources);
          }
        }
        return;
      }
    } catch {
      /* try next source */
    }
  }
  throw new Error("Could not load preset list");
}

async function checkLocalServer() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.generator);
  } catch {
    return false;
  }
}

async function downloadFromServer(endpoint, body, fallbackName) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err.error) message = err.error;
    } catch {
      /* response was not JSON */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function onGeneratePreset() {
  const preset = presets.find((p) => p.id === presetSelect.value);
  if (!preset) return;

  const saved = await hasSavedSources(preset.outputSlug);

  setBusy(true, saved ? "Building PDF from saved cards…" : "Capturing from Wahapedia — 30–60 seconds…");
  try {
    if (saved) {
      await buildPdfFromSources(preset.outputSlug, preset.detachmentName);
    } else if (localServer) {
      await downloadFromServer("/api/generate", { preset: preset.id }, "stratagems-sleeve.pdf");
      sourceCache.set(preset.outputSlug, true);
    } else {
      throw new Error(
        `No saved sources for ${preset.detachmentName}. Run: npm run stratagem-sleeves -- --preset ${preset.id} --capture`
      );
    }
    setStatus("PDF downloaded.", "info");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    setBusy(false);
    updatePresetMeta();
  }
}

async function onGenerateCustom() {
  const factionUrl = $("#custom-faction-url").value.trim();
  const detachmentName = $("#custom-detachment").value.trim();
  const filterValue = $("#custom-filter").value.trim();
  const anchorHash = $("#custom-hash").value.trim();

  if (!factionUrl || !detachmentName) {
    setStatus("Faction URL and detachment name are required.", "error");
    return;
  }

  setBusy(true, "Capturing from Wahapedia — 30–60 seconds…");
  try {
    await downloadFromServer(
      "/api/generate",
      { factionUrl, detachmentName, filterValue, anchorHash: anchorHash || undefined },
      `${slugify(detachmentName)}-stratagems-sleeve.pdf`
    );
    setStatus("PDF downloaded.", "info");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    setBusy(false);
  }
}

async function init() {
  try {
    await loadPresets();
  } catch (err) {
    setStatus(err.message, "error");
    return;
  }

  localServer = await checkLocalServer();

  for (const faction of uniqueFactions(presets)) {
    const opt = document.createElement("option");
    opt.value = faction;
    opt.textContent = faction;
    factionSelect.appendChild(opt);
  }

  fillPresetSelect("");

  const anySaved = await Promise.all(presets.map((p) => hasSavedSources(p.outputSlug)));
  if (anySaved.some(Boolean)) {
    setStatus("Pick a detachment with saved sources to build a print PDF instantly.", "info");
  } else if (localServer) {
    setStatus("Local server ready — capture from Wahapedia or build after saving sources.", "info");
  } else {
    localHint.classList.remove("hidden");
    setStatus("Card sources are saved in the repo. Capture new detachments with the CLI below.", "info");
  }

  factionSelect.addEventListener("change", () => fillPresetSelect(factionSelect.value));
  presetSelect.addEventListener("change", updatePresetMeta);
  btnGenerate.addEventListener("click", onGeneratePreset);
  btnCustom.addEventListener("click", onGenerateCustom);
}

init();
