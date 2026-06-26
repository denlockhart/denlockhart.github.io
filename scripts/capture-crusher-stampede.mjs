import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "exports", "crusher-stampede");
const URL = "https://wahapedia.ru/wh40k10ed/factions/tyranids/";

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

await page.goto(URL, { waitUntil: "networkidle2", timeout: 120000 });

await page.evaluate(() => {
  const sel = document.querySelector("select");
  if (sel) {
    sel.value = "CS";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  location.hash = "Crusher-Stampede";
});

await new Promise((r) => setTimeout(r, 2000));

await page.evaluate(() => {
  document
    .querySelectorAll(
      "iframe, .page_ads_br, .page_ads_br2, .page_ads_br3, .tooltip_templates, [id*='ezoic'], [class*='ezoic']"
    )
    .forEach((el) => el.remove());
});

const bounds = await page.evaluate(() => {
  const start = document.querySelector('a[name="Crusher-Stampede"]');
  const end = document.querySelector('a[name="Unending-Swarm"]');
  if (!start || !end) return { error: "Section anchors not found" };
  const top = start.getBoundingClientRect().top + window.scrollY - 8;
  const bottom = end.getBoundingClientRect().top + window.scrollY - 8;
  return {
    top: Math.max(0, Math.floor(top)),
    height: Math.ceil(bottom - top),
    width: Math.min(1200, document.documentElement.clientWidth),
  };
});

if (bounds.error) {
  console.error(bounds.error);
  await browser.close();
  process.exit(1);
}

const fullPngPath = path.join(OUT_DIR, "Crusher-Stampede-full.png");
await page.screenshot({
  path: fullPngPath,
  clip: { x: 0, y: bounds.top, width: bounds.width, height: bounds.height },
});

const pngBytes = fs.readFileSync(fullPngPath);
const pdfDoc = await PDFDocument.create();

const pngImage = await pdfDoc.embedPng(pngBytes);
const imgWidth = pngImage.width;
const imgHeight = pngImage.height;

const pageWidth = 612;
const pageHeight = 792;
const scale = pageWidth / imgWidth;
const scaledHeight = imgHeight * scale;
const pagesNeeded = Math.max(1, Math.ceil(scaledHeight / pageHeight));

for (let i = 0; i < pagesNeeded; i++) {
  const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
  const yOffset = -(i * pageHeight);
  pdfPage.drawImage(pngImage, {
    x: 0,
    y: yOffset,
    width: pageWidth,
    height: scaledHeight,
  });
}

const pdfPath = path.join(OUT_DIR, "Crusher-Stampede-Wahapedia.pdf");
fs.writeFileSync(pdfPath, await pdfDoc.save());

const half = Math.floor(bounds.height / 2);
const page1Path = path.join(OUT_DIR, "Crusher-Stampede-page-1.png");
const page2Path = path.join(OUT_DIR, "Crusher-Stampede-page-2.png");
await page.screenshot({
  path: page1Path,
  clip: { x: 0, y: bounds.top, width: bounds.width, height: half },
});
await page.screenshot({
  path: page2Path,
  clip: { x: 0, y: bounds.top + half, width: bounds.width, height: bounds.height - half },
});

console.log("Created:");
console.log(" ", pdfPath, `(${pagesNeeded} letter page(s))`);
console.log(" ", fullPngPath);
console.log(" ", page1Path);
console.log(" ", page2Path);
console.log("Section size (px):", bounds.width, "x", bounds.height);

await browser.close();
