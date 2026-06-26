import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import os from "os";
import { PDFDocument } from "pdf-lib";

function resolveChromeLaunchOptions() {
  const opts = { headless: true };
  let bundled;
  try {
    bundled = puppeteer.executablePath();
  } catch {
    bundled = null;
  }
  if (bundled && fs.existsSync(bundled)) return opts;

  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) opts.executablePath = found;
  return opts;
}

const CARD_W_IN = 2.5;
const CARD_H_IN = 3.5;
const DPI = 300;
const CARD_W_PX = Math.round(CARD_W_IN * DPI);
const CARD_H_PX = Math.round(CARD_H_IN * DPI);
const PAGE_W_PT = 612;
const PAGE_H_PT = 792;
const SHEET_COLS = 2;
const CARD_W_PT = CARD_W_IN * 72;
const CARD_H_PT = CARD_H_IN * 72;

const DEFAULTS = {
  padTop: 12,
  padRight: 12,
  padBottom: 12,
  padLeft: 56,
  nameFontMin: 30,
  nameFontMax: 42,
  cpFontPx: 22,
  diamondPx: 52,
  diamondOffset: 28,
  sheetRows: 3,
};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildLayout(options) {
  const padTop = options.padTop ?? DEFAULTS.padTop;
  const padRight = options.padRight ?? DEFAULTS.padRight;
  const padBottom = options.padBottom ?? DEFAULTS.padBottom;
  const padLeft = options.padLeft ?? DEFAULTS.padLeft;
  const nameFontMin = options.nameFontMin ?? DEFAULTS.nameFontMin;
  const nameFontMax = options.nameFontMax ?? DEFAULTS.nameFontMax;
  const cpFontPx = options.cpFontPx ?? DEFAULTS.cpFontPx;
  const diamondPx = options.diamondPx ?? DEFAULTS.diamondPx;
  const diamondOffset = options.diamondOffset ?? DEFAULTS.diamondOffset;

  return {
    padTop,
    padRight,
    padBottom,
    padLeft,
    nameFontMin,
    nameFontMax,
    cpFontPx,
    diamondPx,
    diamondOffset,
    targetH: CARD_H_PX - padTop - padBottom,
    targetW: CARD_W_PX - padLeft - padRight,
    cardShell(inlinedCss, html) {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${inlinedCss}</style><style>
  html, body {
    margin: 0;
    width: ${CARD_W_PX}px;
    height: ${CARD_H_PX}px;
    background: #d5d5d5;
    overflow: hidden;
  }
  #root {
    width: ${CARD_W_PX}px;
    height: ${CARD_H_PX}px;
    padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px;
    box-sizing: border-box;
    overflow: hidden;
  }
  #root .str10Wrap {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
    margin: 0 !important;
    position: relative !important;
    overflow: visible !important;
    font-size: 11px !important;
  }
  #root .str10Name {
    font-size: ${nameFontMin}px !important;
    font-weight: bold !important;
    letter-spacing: 0.02em !important;
    line-height: 1.1 !important;
    white-space: normal !important;
    height: auto !important;
    max-width: 100% !important;
    word-break: break-word !important;
    overflow: visible !important;
    margin: 0 0 10px 0 !important;
    padding: 0 2px !important;
  }
  #root .str10Border {
    font-size: 11px !important;
    margin: 0 0 4px 0 !important;
    padding: 0 0 0 16px !important;
    border-top: 2px solid !important;
    border-left: 26px solid !important;
    overflow: visible !important;
  }
  #root .str10DiamondWrap {
    width: ${diamondPx + 8}px !important;
    margin: 0 0 0 -${diamondOffset}px !important;
    position: relative !important;
    top: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 0 !important;
  }
  #root .str10Diamond {
    width: ${diamondPx}px !important;
    height: ${diamondPx}px !important;
    border-width: 3px !important;
  }
  #root .str10Pos2 { margin-top: 0 !important; }
  #root .str10CP {
    font-size: ${cpFontPx}px !important;
    line-height: 1 !important;
    font-weight: bold !important;
    letter-spacing: -0.02em !important;
    transform: rotate(-45deg) !important;
  }
  #root .str10Type { display: none !important; }
  #root .str10Text, #root .str10Legend { line-height: 1.35 !important; }
</style></head><body><div id="root">${html}</div></body></html>`;
    },
  };
}

function prepareCard(page) {
  return page.evaluate(() => {
    const typeEl = document.querySelector(".str10Type");
    if (typeEl) {
      const divider = typeEl.nextElementSibling;
      typeEl.remove();
      if (divider?.classList.contains("str10Line")) divider.remove();
    }

    document.querySelectorAll(".str10Diamond").forEach((diamond) => {
      if (!diamond.querySelector(".str10CP")) {
        const wrapper = diamond.closest(".str10Pos2") ?? diamond.parentElement;
        wrapper?.remove();
      }
    });

    const diamondWrap = document.querySelector(".str10DiamondWrap");
    if (diamondWrap) {
      [...diamondWrap.children].forEach((child) => {
        if (!child.querySelector(".str10CP")) child.remove();
      });
    }
  });
}

async function addCardSheet(pdfDoc, pngBuffers, sheetRows) {
  const rows = sheetRows ?? Math.ceil(pngBuffers.length / SHEET_COLS);
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
}

export function getSourceDir(outputSlug, sourceRoot) {
  return path.join(sourceRoot ?? path.join(process.cwd(), "data", "stratagem-sources"), outputSlug);
}

export function sourcesManifestPath(sourceDir) {
  return path.join(sourceDir, "sources.json");
}

export function hasSavedSources(outputSlug, sourceRoot) {
  const manifestPath = sourcesManifestPath(getSourceDir(outputSlug, sourceRoot));
  return fs.existsSync(manifestPath);
}

/**
 * Build a letter-size sleeve PDF from saved card PNGs + sources.json.
 */
export async function buildSleevePdfFromSources({ sourceDir, outputPath }) {
  const manifestPath = sourcesManifestPath(sourceDir);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No saved sources at ${sourceDir}. Run with --capture first.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const pngBuffers = manifest.cards.map((card) => {
    const filePath = path.join(sourceDir, card.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing card file: ${filePath}`);
    }
    return fs.readFileSync(filePath);
  });

  const pdfDoc = await PDFDocument.create();
  await addCardSheet(pdfDoc, pngBuffers);
  const pdfBytes = await pdfDoc.save();

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pdfBytes);
  }

  return {
    pdfPath: outputPath,
    pdfBytes,
    count: manifest.cards.length,
    manifest,
    sourceDir,
  };
}

async function findBestFonts(renderPage, html, inlinedCss, layout) {
  await renderPage.setContent(layout.cardShell(inlinedCss, html), {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await renderPage.waitForSelector(".str10Wrap", { timeout: 30000 });
  await renderPage.waitForSelector(".str10CP", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  await prepareCard(renderPage);
  await applyCpStyle(renderPage, layout);

  let nameLo = layout.nameFontMin;
  let nameHi = layout.nameFontMax;
  let bestName = nameLo;

  while (nameLo <= nameHi) {
    const mid = Math.floor((nameLo + nameHi) / 2);
    await renderPage.evaluate((size) => {
      document.querySelector(".str10Name").style.setProperty("font-size", `${size}px`, "important");
    }, mid);
    const ok = await measureName(renderPage);
    if (ok) {
      bestName = mid;
      nameLo = mid + 1;
    } else {
      nameHi = mid - 1;
    }
  }

  await renderPage.evaluate((size) => {
    document.querySelector(".str10Name").style.setProperty("font-size", `${size}px`, "important");
  }, bestName);

  let bodyLo = 10;
  let bodyHi = 54;
  let bestBody = bodyLo;

  while (bodyLo <= bodyHi) {
    const mid = Math.floor((bodyLo + bodyHi) / 2);
    await renderPage.evaluate((bodySize) => {
      document.querySelectorAll(".str10Text, .str10Legend").forEach((el) => {
        el.style.setProperty("font-size", `${bodySize}px`, "important");
      });
    }, mid);
    const ok = await measureCard(renderPage, layout);
    if (ok) {
      bestBody = mid;
      bodyLo = mid + 1;
    } else {
      bodyHi = mid - 1;
    }
  }

  await renderPage.evaluate((bodySize) => {
    document.querySelectorAll(".str10Text, .str10Legend").forEach((el) => {
      el.style.setProperty("font-size", `${bodySize}px`, "important");
    });
  }, bestBody);
  await applyCpStyle(renderPage, layout);
  return { namePx: bestName, bodyPx: bestBody };
}

function applyCpStyle(page, layout) {
  return page.evaluate(
    (cpSize, diamondSize) => {
      document.querySelectorAll(".str10CP").forEach((cp) => {
        const diamond = cp.closest(".str10Diamond");
        cp.style.setProperty("font-size", `${cpSize}px`, "important");
        cp.style.setProperty("font-weight", "bold", "important");
        cp.style.setProperty("line-height", "1", "important");
        cp.style.setProperty("transform", "rotate(-45deg)", "important");
        if (diamond) {
          diamond.style.setProperty("width", `${diamondSize}px`, "important");
          diamond.style.setProperty("height", `${diamondSize}px`, "important");
          diamond.style.setProperty("border-width", "3px", "important");
        }
      });
    },
    layout.cpFontPx,
    layout.diamondPx
  );
}

function measureName(page) {
  return page.evaluate(
    (cardH, cardW) => {
      const name = document.querySelector(".str10Name");
      const range = document.createRange();
      range.selectNodeContents(name);
      const textRect = range.getBoundingClientRect();
      return (
        textRect.top >= 4 &&
        textRect.bottom <= cardH - 4 &&
        textRect.left >= 8 &&
        textRect.right <= cardW - 4
      );
    },
    CARD_H_PX,
    CARD_W_PX
  );
}

function measureCard(page, layout) {
  return page.evaluate(
    (maxH, maxW, cardH, cardW) => {
      const wrap = document.querySelector(".str10Wrap");
      const name = document.querySelector(".str10Name");
      const rect = wrap.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(name);
      const textRect = range.getBoundingClientRect();
      const fitsBox = rect.height <= maxH && rect.width <= maxW;
      const nameVisible =
        textRect.top >= 4 &&
        textRect.bottom <= cardH - 4 &&
        textRect.left >= 8 &&
        textRect.right <= cardW - 4;
      return fitsBox && nameVisible;
    },
    layout.targetH,
    layout.targetW,
    CARD_H_PX,
    CARD_W_PX
  );
}

async function fetchInlinedCss(page, styles) {
  return page.evaluate(async (urls) => {
    const chunks = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          return res.ok ? await res.text() : "";
        } catch {
          return "";
        }
      })
    );
    return chunks.join("\n");
  }, styles);
}

async function fetchStratagems(page, detachmentName) {
  return page.evaluate((name) => {
    return [...document.querySelectorAll(".str10Wrap")]
      .filter((wrap) => {
        const typeEl = wrap.querySelector(".str10Type");
        return typeEl && typeEl.textContent.includes(name);
      })
      .map((wrap) => ({
        name: wrap.querySelector(".str10Name")?.textContent?.trim() || "unknown",
        html: wrap.outerHTML,
      }));
  }, detachmentName);
}

export async function listDetachments(factionUrl) {
  const browser = await puppeteer.launch(resolveChromeLaunchOptions());
  const page = await browser.newPage();
  await page.goto(factionUrl, { waitUntil: "networkidle2", timeout: 120000 });
  const options = await page.evaluate(() => {
    const selects = [...document.querySelectorAll("select.FilterSelectTY, select.ctrlSelect")];
    const sel =
      document.querySelector("select.FilterSelectTY") ??
      selects.find((s) => [...s.options].some((opt) => /^[A-Z]{2,3}$/.test(opt.value))) ??
      selects.find((s) => s.options.length > 4);
    if (!sel) return [];
    return [...sel.options]
      .filter((opt) => opt.value && !opt.disabled && !opt.classList.contains("ctrlOptionHeader"))
      .map((opt) => ({ filterValue: opt.value, name: opt.textContent.trim() }));
  });
  await browser.close();
  return options;
}

/**
 * Fetch stratagems from Wahapedia and save card PNGs + sources.json locally.
 */
export async function captureStratagemSources(config) {
  const {
    factionUrl,
    detachmentName,
    filterValue,
    anchorHash,
    outputSlug,
    sourceRoot,
  } = config;

  if (!factionUrl || !detachmentName || !outputSlug) {
    throw new Error("config requires factionUrl, detachmentName, and outputSlug");
  }

  const layout = buildLayout(config);
  const sourceDir = getSourceDir(outputSlug, sourceRoot);
  fs.mkdirSync(sourceDir, { recursive: true });

  const browser = await puppeteer.launch(resolveChromeLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  await page.goto(factionUrl, { waitUntil: "networkidle2", timeout: 120000 });

  await page.evaluate(
    (filter, hash) => {
      const selects = [...document.querySelectorAll("select.FilterSelectTY, select.ctrlSelect")];
      const sel =
        document.querySelector("select.FilterSelectTY") ??
        selects.find((s) => [...s.options].some((opt) => /^[A-Z]{2,3}$/.test(opt.value))) ??
        selects.find((s) => s.options.length > 4);
      if (sel && filter) {
        sel.value = filter;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (hash) location.hash = hash;
    },
    filterValue ?? "",
    anchorHash ?? ""
  );

  await new Promise((r) => setTimeout(r, 2000));

  const styles = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href)
  );
  const inlinedCss = await fetchInlinedCss(page, styles);
  const cards = await fetchStratagems(page, detachmentName);

  if (!cards.length) {
    await browser.close();
    throw new Error(`No stratagems found for detachment "${detachmentName}"`);
  }

  const renderPage = await browser.newPage();
  await renderPage.setViewport({ width: CARD_W_PX, height: CARD_H_PX, deviceScaleFactor: 1 });

  const savedCards = [];

  for (const card of cards) {
    const fonts = await findBestFonts(renderPage, card.html, inlinedCss, layout);
    await applyCpStyle(renderPage, layout);
    const fileName = `${slugify(card.name)}.png`;
    const filePath = path.join(sourceDir, fileName);
    await renderPage.screenshot({ path: filePath, type: "png" });
    savedCards.push({ name: card.name, file: fileName, ...fonts });
  }

  await browser.close();

  const manifest = {
    detachmentName,
    outputSlug,
    factionUrl,
    filterValue: filterValue ?? null,
    anchorHash: anchorHash ?? null,
    capturedAt: new Date().toISOString(),
    cards: savedCards,
  };

  fs.writeFileSync(sourcesManifestPath(sourceDir), JSON.stringify(manifest, null, 2));

  return { sourceDir, manifest, count: savedCards.length };
}

/**
 * @param {object} config
 * @param {object} [options]
 * @param {boolean} [options.captureOnly]
 * @param {boolean} [options.buildOnly]
 * @param {boolean} [options.forceCapture]
 */
export async function generateStratagemSleeves(config, options = {}) {
  const { captureOnly = false, buildOnly = false, forceCapture = false } = options;
  const {
    detachmentName,
    outputSlug,
    outputRoot,
    sourceRoot,
  } = config;

  if (!detachmentName || !outputSlug) {
    throw new Error("config requires detachmentName and outputSlug");
  }

  const sourceDir = getSourceDir(outputSlug, sourceRoot);
  const hasSources = hasSavedSources(outputSlug, sourceRoot);

  if (!buildOnly && (forceCapture || !hasSources)) {
    await captureStratagemSources(config);
    if (captureOnly) {
      return { sourceDir, captured: true, count: JSON.parse(fs.readFileSync(sourcesManifestPath(sourceDir), "utf8")).cards.length };
    }
  }

  const outDir = path.join(outputRoot ?? path.join(process.cwd(), "exports"), outputSlug, "stratagems");
  const pdfPath = path.join(outDir, `${slugify(detachmentName)}-stratagems-sleeve.pdf`);
  const result = await buildSleevePdfFromSources({ sourceDir, outputPath: pdfPath });

  return {
    outDir,
    pdfPath: result.pdfPath,
    sourceDir: result.sourceDir,
    cards: result.manifest.cards.map((card) => ({
      name: card.name,
      file: path.join(sourceDir, card.file),
      namePx: card.namePx,
      bodyPx: card.bodyPx,
    })),
    count: result.count,
  };
}
