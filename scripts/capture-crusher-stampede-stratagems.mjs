import path from "path";
import { fileURLToPath } from "url";
import { generateStratagemSleeves } from "./lib/stratagem-sleeves.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const config = {
  factionUrl: "https://wahapedia.ru/wh40k10ed/factions/tyranids/",
  filterValue: "CS",
  detachmentName: "Crusher Stampede",
  anchorHash: "Crusher-Stampede",
  outputSlug: "crusher-stampede",
  outputRoot: path.join(ROOT, "exports"),
};

const result = await generateStratagemSleeves(config);
for (const card of result.cards) {
  console.log("Created", path.basename(card.file), `(name ${card.namePx}px, body ${card.bodyPx}px)`);
}
console.log("Created", result.pdfPath, `(1 letter page, ${result.count} cards)`);
