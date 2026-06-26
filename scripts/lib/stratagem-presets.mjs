import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_DIR = path.join(__dirname, "..", "..", "data", "stratagem-sleeves");

export function loadPreset(id) {
  const presetPath = path.join(CONFIG_DIR, `${id}.json`);
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Unknown preset "${id}"`);
  }
  return JSON.parse(fs.readFileSync(presetPath, "utf8"));
}

export function listPresets() {
  if (!fs.existsSync(CONFIG_DIR)) return [];
  return fs
    .readdirSync(CONFIG_DIR)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map((f) => {
      const id = path.basename(f, ".json");
      const preset = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), "utf8"));
      const factionMatch = preset.factionUrl?.match(/factions\/([^/]+)/);
      return {
        id,
        faction: factionMatch ? titleCase(factionMatch[1].replace(/-/g, " ")) : "Unknown",
        detachmentName: preset.detachmentName ?? preset.name,
        filterValue: preset.filterValue,
        factionUrl: preset.factionUrl,
        outputSlug: preset.outputSlug ?? id.replace(/^tyranids-/, ""),
      };
    })
    .sort((a, b) => a.faction.localeCompare(b.faction) || a.detachmentName.localeCompare(b.detachmentName));
}

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
