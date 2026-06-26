import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateStratagemSleeves, listDetachments, hasSavedSources } from "./lib/stratagem-sleeves.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "data", "stratagem-sleeves");

function printUsage() {
  console.log(`Generate MTG sleeve-sized stratagem cards from Wahapedia.

Usage:
  node scripts/generate-stratagem-sleeves.mjs --config <file.json>
  node scripts/generate-stratagem-sleeves.mjs --preset <name>
  node scripts/generate-stratagem-sleeves.mjs --list-presets
  node scripts/generate-stratagem-sleeves.mjs --list-detachments <faction-url>

Options:
  --config          Path to detachment JSON config
  --preset          Preset name from data/stratagem-sleeves/
  --faction-url     Wahapedia faction page (with --detachment, --filter, etc.)
  --detachment      Detachment name as shown on stratagem type line
  --filter          Faction page filter select value (e.g. CS)
  --hash            URL hash anchor (e.g. Crusher-Stampede)
  --out             Output slug under exports/ (default: slugified detachment name)
  --capture         Fetch from Wahapedia and save card PNGs to data/stratagem-sources/
  --build           Build sleeve PDF from saved sources only (no Wahapedia fetch)
  --force-capture   Re-fetch from Wahapedia even if sources already exist
  --list-presets    List bundled preset configs
  --list-detachments  List detachment filter options on a faction page

Examples:
  node scripts/generate-stratagem-sleeves.mjs --preset tyranids-crusher-stampede --capture
  node scripts/generate-stratagem-sleeves.mjs --preset tyranids-crusher-stampede --build
  node scripts/generate-stratagem-sleeves.mjs --preset tyranids-crusher-stampede
  node scripts/generate-stratagem-sleeves.mjs --list-detachments https://wahapedia.ru/wh40k10ed/factions/tyranids/
`);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (name === "list-presets" || name === "help" || name === "capture" || name === "build" || name === "force-capture") {
      args[name] = true;
    } else {
      args[name] = argv[++i];
    }
  }
  return args;
}

function listPresets() {
  if (!fs.existsSync(CONFIG_DIR)) {
    console.log("No presets folder:", CONFIG_DIR);
    return;
  }
  const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  for (const file of files) {
    const preset = loadJson(path.join(CONFIG_DIR, file));
    console.log(`${path.basename(file, ".json")}: ${preset.detachmentName} (${preset.factionUrl})`);
  }
}

function buildConfigFromArgs(args) {
  if (args.config) {
    return loadJson(path.resolve(args.config));
  }
  if (args.preset) {
    const presetPath = path.join(CONFIG_DIR, `${args.preset}.json`);
    if (!fs.existsSync(presetPath)) {
      throw new Error(`Unknown preset "${args.preset}". Run --list-presets.`);
    }
    return loadJson(presetPath);
  }
  if (args["faction-url"] && args.detachment) {
    return {
      factionUrl: args["faction-url"],
      detachmentName: args.detachment,
      filterValue: args.filter,
      anchorHash: args.hash,
      outputSlug: args.out ?? slugify(args.detachment),
    };
  }
  return null;
}

const args = parseArgs(process.argv);

if (args.help || process.argv.length <= 2) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

if (args["list-presets"]) {
  listPresets();
  process.exit(0);
}

if (args["list-detachments"]) {
  const items = await listDetachments(args["list-detachments"]);
  for (const item of items) {
    console.log(`${item.filterValue}\t${item.name}`);
  }
  process.exit(0);
}

const config = buildConfigFromArgs(args);
if (!config) {
  printUsage();
  process.exit(1);
}

config.outputRoot = path.join(ROOT, "exports");
config.sourceRoot = path.join(ROOT, "data", "stratagem-sources");

const options = {
  captureOnly: Boolean(args.capture && !args.build),
  buildOnly: Boolean(args.build && !args.capture),
  forceCapture: Boolean(args["force-capture"] || (args.capture && !args.build)),
};

if (args.build && !args.capture && !hasSavedSources(config.outputSlug, config.sourceRoot)) {
  console.error(`No saved sources for "${config.outputSlug}". Run with --capture first.`);
  process.exit(1);
}

if (options.captureOnly) {
  console.log(`Capturing stratagem sources for: ${config.detachmentName}`);
} else if (options.buildOnly) {
  console.log(`Building sleeve PDF from saved sources: ${config.detachmentName}`);
} else if (hasSavedSources(config.outputSlug, config.sourceRoot) && !options.forceCapture) {
  console.log(`Using saved sources for: ${config.detachmentName} (pass --force-capture to refresh)`);
} else {
  console.log(`Capturing and building: ${config.detachmentName}`);
}

const result = await generateStratagemSleeves(config, options);

if (options.captureOnly) {
  console.log("Saved", result.count, "cards to", result.sourceDir);
  process.exit(0);
}

for (const card of result.cards) {
  console.log(
    "Card",
    card.name,
    `(name ${card.namePx}px, body ${card.bodyPx}px)`
  );
}
console.log("Created", result.pdfPath, `(1 letter page, ${result.count} cards)`);
if (result.sourceDir) console.log("Sources:", result.sourceDir);
