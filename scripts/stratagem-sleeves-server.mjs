import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateStratagemSleeves, hasSavedSources } from "./lib/stratagem-sleeves.mjs";
import { listPresets, loadPreset, CONFIG_DIR } from "./lib/stratagem-presets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const UI_DIR = path.join(ROOT, "projects", "stratagem-sleeves");
const SOURCES_DIR = path.join(ROOT, "data", "stratagem-sources");
const PORT = Number(process.env.PORT) || 3847;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(UI_DIR, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(UI_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  serveFile(res, filePath);
}

function resolveConfig(body) {
  if (body.preset) return loadPreset(body.preset);
  if (body.factionUrl && body.detachmentName) {
    return {
      factionUrl: body.factionUrl,
      detachmentName: body.detachmentName,
      filterValue: body.filterValue,
      anchorHash: body.anchorHash,
      outputSlug: body.outputSlug ?? body.detachmentName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    };
  }
  return null;
}

async function handleGenerate(req, res, options) {
  const raw = await readBody(req);
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const config = resolveConfig(body);
  if (!config) {
    return sendJson(res, 400, { error: "Provide preset id or factionUrl + detachmentName" });
  }

  config.outputRoot = path.join(ROOT, "exports");
  config.sourceRoot = SOURCES_DIR;

  console.log(`${options.captureOnly ? "Capturing" : options.buildOnly ? "Building" : "Generating"}: ${config.detachmentName}...`);
  const result = await generateStratagemSleeves(config, options);

  if (options.captureOnly) {
    return sendJson(res, 200, { ok: true, sourceDir: result.sourceDir, count: result.count });
  }

  const pdfName = path.basename(result.pdfPath);
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${pdfName}"`,
  });
  return fs.createReadStream(result.pdfPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url.split("?")[0];

    if (req.method === "GET" && urlPath === "/api/health") {
      return sendJson(res, 200, { ok: true, generator: true });
    }

    if (req.method === "GET" && urlPath === "/api/presets") {
      const presets = listPresets().map((p) => ({
        ...p,
        hasSources: hasSavedSources(p.outputSlug, SOURCES_DIR),
      }));
      return sendJson(res, 200, presets);
    }

    if (req.method === "GET" && urlPath === "/api/manifest") {
      return serveFile(res, path.join(CONFIG_DIR, "manifest.json"));
    }

    if (req.method === "GET" && urlPath.startsWith("/data/stratagem-sources/")) {
      const rel = urlPath.replace("/data/stratagem-sources/", "");
      const filePath = path.join(SOURCES_DIR, rel);
      if (!filePath.startsWith(SOURCES_DIR) || !fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end("Not found");
      }
      return serveFile(res, filePath);
    }

    if (req.method === "POST" && urlPath === "/api/build") {
      return handleGenerate(req, res, { buildOnly: true });
    }

    if (req.method === "POST" && urlPath === "/api/capture") {
      return handleGenerate(req, res, { captureOnly: true, forceCapture: true });
    }

    if (req.method === "POST" && urlPath === "/api/generate") {
      return handleGenerate(req, res, {
        buildOnly: Boolean(false),
        forceCapture: Boolean(false),
      });
    }

    if (req.method === "GET" && urlPath.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Not found" });
    }

    serveStatic(req, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message ?? "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Stratagem Sleeves UI: http://localhost:${PORT}`);
  console.log(`Presets: ${listPresets().length} loaded from ${CONFIG_DIR}`);
});
