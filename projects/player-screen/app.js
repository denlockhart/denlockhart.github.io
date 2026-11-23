const CHANNEL = "denlockhart-player-screen";
const FIT_KEY = "player-screen-fit";
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;

const chooseBtn = document.getElementById("choose");
const openBtn = document.getElementById("open-display");
const blankBtn = document.getElementById("blank");
const containBtn = document.getElementById("fit-contain");
const coverBtn = document.getElementById("fit-cover");
const statusEl = document.getElementById("status");
const emptyEl = document.getElementById("empty");
const gridEl = document.getElementById("grid");
const folderInput = document.getElementById("folder-input");
const dropveil = document.getElementById("dropveil");

const channel = new BroadcastChannel(CHANNEL);

let images = [];
let selectedId = null;
let folderLabel = "";
let displayWindow = null;
let connected = false;
let sawReady = false;
let fit = localStorage.getItem(FIT_KEY) === "cover" ? "cover" : "contain";

applyFitButtons();

chooseBtn.addEventListener("click", chooseFolder);
openBtn.addEventListener("click", () => openDisplay(true));
blankBtn.addEventListener("click", blankDisplay);
containBtn.addEventListener("click", () => setFit("contain"));
coverBtn.addEventListener("click", () => setFit("cover"));
folderInput.addEventListener("change", () => {
  const files = [...folderInput.files].filter((file) => IMAGE_EXT.test(file.name));
  const label = files[0]?.webkitRelativePath?.split("/")[0] || "Selected folder";
  adoptFiles(files, label);
  folderInput.value = "";
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  if (!images.length) return;
  if (event.target instanceof HTMLInputElement) return;
  event.preventDefault();
  const index = images.findIndex((item) => item.id === selectedId);
  const next = event.key === "ArrowRight" ? index + 1 : index - 1;
  const item = images[(next + images.length) % images.length];
  showImage(item);
});

let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  dragDepth += 1;
  dropveil.hidden = false;
});
window.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropveil.hidden = true;
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropveil.hidden = true;
  takeDrop(event.dataTransfer);
});

channel.onmessage = (event) => {
  if (event.data?.type === "ready") {
    const was = connected;
    connected = true;
    sawReady = true;
    updateStatus();
    if (!was) resendCurrent();
  }
};

setInterval(() => {
  if (!sawReady) {
    connected = false;
    updateStatus();
  }
  sawReady = false;
  channel.postMessage({ type: "ping" });
}, 2000);
channel.postMessage({ type: "ping" });
updateStatus();

async function chooseFolder() {
  if (typeof window.showDirectoryPicker === "function") {
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      const found = [];
      await collectHandles(dir, found);
      adoptEntries(found, dir.name);
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  folderInput.click();
}

async function collectHandles(dir, out) {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) continue;
    if (out.length >= 500) return;
    if (handle.kind === "file" && IMAGE_EXT.test(name)) {
      out.push({ name, handle });
    } else if (handle.kind === "directory") {
      await collectHandles(handle, out);
    }
  }
}

async function takeDrop(dataTransfer) {
  const files = [];
  const items = [...(dataTransfer.items || [])];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (!entry) continue;
    if (entry.isDirectory) await walkEntry(entry, files);
    else if (entry.isFile && IMAGE_EXT.test(entry.name)) {
      files.push(await fileFromEntry(entry));
    }
  }
  if (!files.length) {
    statusEl.textContent = "That drop had no images. Choose a folder of pictures.";
    return;
  }
  adoptFiles(files, "Dropped folder");
}

function walkEntry(dir, out) {
  return new Promise((resolve, reject) => {
    const reader = dir.createReader();
    const read = () => {
      reader.readEntries(async (entries) => {
        if (!entries.length) {
          resolve();
          return;
        }
        try {
          for (const entry of entries) {
            if (out.length >= 500) break;
            if (entry.name.startsWith(".")) continue;
            if (entry.isDirectory) await walkEntry(entry, out);
            else if (entry.isFile && IMAGE_EXT.test(entry.name)) out.push(await fileFromEntry(entry));
          }
          read();
        } catch (err) {
          reject(err);
        }
      }, reject);
    };
    read();
  });
}

function fileFromEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function adoptFiles(files, label) {
  adoptEntries(files.map((file) => ({ name: file.name, file })), label);
}

function adoptEntries(entries, label) {
  revokeAll();
  folderLabel = label;
  images = entries
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
    .map((entry, index) => ({
      id: `${index}-${entry.name}`,
      name: entry.name,
      handle: entry.handle || null,
      file: entry.file || null,
      url: "",
    }));
  selectedId = null;
  blankBtn.disabled = images.length === 0;
  renderGrid();
  updateStatus();
  loadThumbs();
}

function revokeAll() {
  for (const item of images) {
    if (item.url) URL.revokeObjectURL(item.url);
  }
}

function renderGrid() {
  const hasImages = images.length > 0;
  emptyEl.hidden = hasImages;
  gridEl.hidden = !hasImages;
  gridEl.replaceChildren();
  for (const item of images) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.id = item.id;
    button.title = item.name;
    const img = document.createElement("img");
    img.alt = "";
    img.hidden = true;
    const caption = document.createElement("span");
    caption.textContent = item.name;
    button.append(img, caption);
    button.addEventListener("click", () => showImage(item));
    li.append(button);
    gridEl.append(li);
  }
}

async function loadThumbs() {
  const queue = [...images];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item || !images.includes(item)) continue;
      try {
        const file = await fileFor(item);
        if (!images.includes(item)) continue;
        item.file = file;
        item.url = URL.createObjectURL(file);
        const img = gridEl.querySelector(`[data-id="${CSS.escape(item.id)}"] img`);
        if (img) {
          img.src = item.url;
          img.hidden = false;
        }
      } catch {
        // Skip a file the browser could not read.
      }
    }
  });
  await Promise.all(workers);
}

function fileFor(item) {
  if (item.file) return Promise.resolve(item.file);
  return item.handle.getFile();
}

function showImage(item) {
  openDisplay(false);
  selectedId = item.id;
  for (const button of gridEl.querySelectorAll(".card")) {
    const on = button.dataset.id === item.id;
    button.classList.toggle("is-current", on);
    if (on) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
  const current = gridEl.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
  current?.scrollIntoView({ block: "nearest" });
  publish(item);
}

async function publish(item) {
  try {
    const file = await fileFor(item);
    item.file = file;
    if (selectedId !== item.id) return;
    channel.postMessage({ type: "show", name: item.name, blob: file, fit });
    updateStatus();
  } catch {
    statusEl.textContent = `Could not read ${item.name}.`;
  }
}

function resendCurrent() {
  const item = images.find((entry) => entry.id === selectedId);
  if (item) publish(item);
  else channel.postMessage({ type: "fit", fit });
}

function blankDisplay() {
  selectedId = null;
  for (const button of gridEl.querySelectorAll(".card")) {
    button.classList.remove("is-current");
    button.removeAttribute("aria-current");
  }
  channel.postMessage({ type: "blank" });
  updateStatus();
}

function setFit(next) {
  fit = next;
  localStorage.setItem(FIT_KEY, fit);
  applyFitButtons();
  channel.postMessage({ type: "fit", fit });
}

function applyFitButtons() {
  containBtn.setAttribute("aria-pressed", fit === "contain" ? "true" : "false");
  coverBtn.setAttribute("aria-pressed", fit === "cover" ? "true" : "false");
}

function openDisplay(focus) {
  if (displayWindow && !displayWindow.closed) {
    if (focus) displayWindow.focus();
    return displayWindow;
  }
  const left = window.screen.availLeft + window.screen.availWidth;
  displayWindow = window.open(
    "display.html",
    "player-screen-display",
    `popup=yes,width=1280,height=720,left=${left},top=0`
  );
  if (!displayWindow) {
    statusEl.textContent = "The player window was blocked. Allow pop-ups for this site, then try Open player screen again.";
  }
  return displayWindow;
}

function updateStatus() {
  const count = images.length;
  const screen = connected ? "Player screen is open." : "Player screen is not open yet.";
  const current = images.find((item) => item.id === selectedId);
  let text;
  if (!count) {
    text = `${screen} Choose a folder of images. Use Brave, Microsoft Edge, or Chrome on this Windows PC.`;
  } else {
    const folder = folderLabel ? `${folderLabel}: ${count} image${count === 1 ? "" : "s"}.` : `${count} images.`;
    text = current
      ? `${folder} Showing ${current.name}. ${screen} Arrow keys move to the next image.`
      : `${folder} Click an image to put it on the other screen. ${screen}`;
  }
  if (statusEl.textContent !== text) statusEl.textContent = text;
}
