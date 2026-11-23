const CHANNEL = "denlockhart-player-screen";

const channel = new BroadcastChannel(CHANNEL);
const picture = document.getElementById("picture");
const waiting = document.getElementById("waiting");
const fullscreenBtn = document.getElementById("fullscreen");

let shownUrl = null;
let fit = "contain";

picture.classList.add("contain");

channel.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "ping") {
    channel.postMessage({ type: "ready" });
    return;
  }
  if (message.type === "show" && message.blob) {
    if (message.fit) applyFit(message.fit);
    showBlob(message.blob, message.name || "");
    return;
  }
  if (message.type === "blank") {
    blank();
    return;
  }
  if (message.type === "fit" && message.fit) applyFit(message.fit);
};

fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});

document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

channel.postMessage({ type: "ready" });

function showBlob(blob, name) {
  const nextUrl = URL.createObjectURL(blob);
  picture.onload = () => {
    if (shownUrl) URL.revokeObjectURL(shownUrl);
    shownUrl = nextUrl;
    picture.classList.add("is-shown");
  };
  picture.classList.remove("is-shown");
  picture.alt = name;
  picture.hidden = false;
  waiting.hidden = true;
  picture.src = nextUrl;
}

function blank() {
  picture.removeAttribute("src");
  picture.alt = "";
  picture.hidden = true;
  picture.classList.remove("is-shown");
  waiting.hidden = false;
  if (shownUrl) URL.revokeObjectURL(shownUrl);
  shownUrl = null;
}

function applyFit(next) {
  fit = next === "cover" ? "cover" : "contain";
  picture.classList.toggle("contain", fit === "contain");
  picture.classList.toggle("cover", fit === "cover");
}
