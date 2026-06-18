const DEFAULT_WORK_SEC = 20;
const DEFAULT_REST_SEC = 30;
const MIN_INTERVAL_SEC = 5;
const MAX_INTERVAL_SEC = 600;

const state = {
  phase: "idle",
  round: 1,
  secondsLeft: DEFAULT_WORK_SEC,
  running: false,
  workSec: DEFAULT_WORK_SEC,
  restSec: DEFAULT_REST_SEC,
  totalRounds: 8,
  sound: true,
  intervalId: null,
};

const panel = document.querySelector(".timer-panel");
const phaseLabel = document.getElementById("phase-label");
const timerDisplay = document.getElementById("timer-display");
const roundLabel = document.getElementById("round-label");
const progressFill = document.getElementById("progress-fill");
const intervalSummary = document.getElementById("interval-summary");
const workInput = document.getElementById("work-input");
const restInput = document.getElementById("rest-input");
const roundsInput = document.getElementById("rounds-input");
const soundToggle = document.getElementById("sound-toggle");
const btnStart = document.getElementById("btn-start");
const btnPause = document.getElementById("btn-pause");
const btnReset = document.getElementById("btn-reset");

const CUE_PATH = "audio/";
const cueFiles = {
  work: CUE_PATH + "work.wav",
  rest: CUE_PATH + "rest.wav",
  done: CUE_PATH + "complete.wav",
};

let audioCtx = null;
let keepAliveOsc = null;
const cueClips = {};

function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return Promise.resolve();
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx.state === "suspended" ? audioCtx.resume() : Promise.resolve();
}

function startAudioKeepAlive() {
  stopAudioKeepAlive();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.00001;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  keepAliveOsc = osc;
}

function stopAudioKeepAlive() {
  if (keepAliveOsc) {
    try { keepAliveOsc.stop(); } catch (_) {}
    keepAliveOsc = null;
  }
}

function preloadCues() {
  for (const [kind, url] of Object.entries(cueFiles)) {
    if (cueClips[kind]) continue;
    const audio = new Audio(url);
    audio.preload = "auto";
    cueClips[kind] = audio;
  }
}

function playCue(kind) {
  if (!state.sound) return;
  preloadCues();
  unlockAudio().then(() => startAudioKeepAlive());
  const clip = cueClips[kind];
  if (!clip) return;
  clip.currentTime = 0;
  clip.volume = 1;
  clip.play().catch(() => {});
}

function announce(phase) {
  playCue(phase);
}

function clampInterval(value, fallback) {
  return Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, parseInt(value, 10) || fallback));
}

function readIntervalSettings() {
  state.workSec = clampInterval(workInput.value, DEFAULT_WORK_SEC);
  state.restSec = clampInterval(restInput.value, DEFAULT_REST_SEC);
  workInput.value = state.workSec;
  restInput.value = state.restSec;
}

function updateIntervalSummary() {
  intervalSummary.textContent = state.workSec + " seconds on · " + state.restSec + " seconds off";
}

function settingsLocked() {
  return state.running;
}

function setSettingsEnabled(enabled) {
  workInput.disabled = !enabled;
  restInput.disabled = !enabled;
  roundsInput.disabled = !enabled;
}

function loadUrlParams() {
  const params = new URLSearchParams(location.search);
  if (params.has("work")) workInput.value = params.get("work");
  if (params.has("rest")) restInput.value = params.get("rest");
}

function loadSettings() {
  loadUrlParams();

  const work = localStorage.getItem("hiit-work");
  const rest = localStorage.getItem("hiit-rest");
  const rounds = localStorage.getItem("hiit-rounds");
  const sound = localStorage.getItem("hiit-sound");
  const params = new URLSearchParams(location.search);

  if (work && !params.has("work")) {
    workInput.value = work;
  }
  if (rest && !params.has("rest")) {
    restInput.value = rest;
  }

  if (rounds) {
    state.totalRounds = Math.max(1, Math.min(99, parseInt(rounds, 10) || 8));
    roundsInput.value = state.totalRounds;
  }
  if (sound !== null) {
    state.sound = sound === "true";
    soundToggle.checked = state.sound;
  }

  readIntervalSettings();
  updateIntervalSummary();

  if (params.has("work") || params.has("rest")) {
    saveSettings();
  }
}

function saveSettings() {
  localStorage.setItem("hiit-work", String(state.workSec));
  localStorage.setItem("hiit-rest", String(state.restSec));
  localStorage.setItem("hiit-rounds", String(state.totalRounds));
  localStorage.setItem("hiit-sound", String(state.sound));
}

function phaseDuration(phase) {
  if (phase === "work") return state.workSec;
  if (phase === "rest") return state.restSec;
  return state.workSec;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function setPhaseClass() {
  panel.classList.remove("phase-work", "phase-rest", "phase-done");
  if (state.phase === "work") panel.classList.add("phase-work");
  else if (state.phase === "rest") panel.classList.add("phase-rest");
  else if (state.phase === "done") panel.classList.add("phase-done");
}

function updateUI() {
  setPhaseClass();
  setSettingsEnabled(!settingsLocked());

  if (state.phase === "idle") {
    phaseLabel.textContent = "Ready";
    timerDisplay.textContent = fmtTime(state.workSec);
    roundLabel.textContent = "Round 1 of " + state.totalRounds;
    progressFill.style.width = "0%";
    btnStart.textContent = "Start";
    btnStart.disabled = false;
    btnPause.disabled = true;
    return;
  }

  if (state.phase === "done") {
    phaseLabel.textContent = "Complete";
    timerDisplay.textContent = "00:00";
    roundLabel.textContent = state.totalRounds + " rounds finished";
    progressFill.style.width = "100%";
    btnStart.textContent = "Start";
    btnStart.disabled = false;
    btnPause.disabled = true;
    return;
  }

  phaseLabel.textContent = state.phase === "work" ? "Work" : "Rest";
  timerDisplay.textContent = fmtTime(state.secondsLeft);

  const restRound = state.phase === "rest" ? state.round : state.round;
  const showRound = state.phase === "work" ? state.round : restRound;
  roundLabel.textContent = "Round " + showRound + " of " + state.totalRounds;

  const total = phaseDuration(state.phase);
  const elapsed = total - state.secondsLeft;
  progressFill.style.width = (elapsed / total) * 100 + "%";

  btnStart.disabled = true;
  btnPause.disabled = false;
  btnPause.textContent = state.running ? "Pause" : "Resume";
}

function stopInterval() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.running = false;
  stopAudioKeepAlive();
}

function startInterval() {
  stopInterval();
  state.running = true;
  unlockAudio().then(() => startAudioKeepAlive());
  state.intervalId = setInterval(tick, 1000);
}

function tick() {
  if (state.secondsLeft > 0) {
    state.secondsLeft--;
    updateUI();
    return;
  }

  if (state.phase === "work") {
    if (state.round >= state.totalRounds) {
      announce("done");
      state.phase = "done";
      stopInterval();
      updateUI();
      return;
    }
    announce("rest");
    state.phase = "rest";
    state.secondsLeft = state.restSec;
    updateUI();
    return;
  }

  if (state.phase === "rest") {
    announce("work");
    state.round++;
    state.phase = "work";
    state.secondsLeft = state.workSec;
    updateUI();
  }
}

function start() {
  preloadCues();
  unlockAudio().then(() => startAudioKeepAlive());
  const fresh = state.phase === "idle" || state.phase === "done";
  if (fresh) {
    state.phase = "work";
    state.round = 1;
    state.secondsLeft = state.workSec;
    announce("work");
  }
  startInterval();
  updateUI();
}

function pause() {
  if (state.running) {
    stopInterval();
  } else if (state.phase === "work" || state.phase === "rest") {
    startInterval();
  }
  updateUI();
}

function reset() {
  stopInterval();
  state.phase = "idle";
  state.round = 1;
  state.secondsLeft = state.workSec;
  updateUI();
}

function onIntervalChange() {
  if (settingsLocked()) return;
  readIntervalSettings();
  updateIntervalSummary();
  saveSettings();
  if (state.phase === "idle" || state.phase === "done") {
    state.secondsLeft = state.workSec;
  } else if (state.phase === "work") {
    state.secondsLeft = Math.min(state.secondsLeft, state.workSec);
  } else if (state.phase === "rest") {
    state.secondsLeft = Math.min(state.secondsLeft, state.restSec);
  }
  updateUI();
}

workInput.addEventListener("change", onIntervalChange);
workInput.addEventListener("input", onIntervalChange);
restInput.addEventListener("change", onIntervalChange);
restInput.addEventListener("input", onIntervalChange);

roundsInput.addEventListener("change", () => {
  state.totalRounds = Math.max(1, Math.min(99, parseInt(roundsInput.value, 10) || 8));
  roundsInput.value = state.totalRounds;
  saveSettings();
  if (state.phase === "idle" || state.phase === "done") updateUI();
});

soundToggle.addEventListener("change", () => {
  state.sound = soundToggle.checked;
  saveSettings();
  if (state.sound) playCue("work");
});

btnStart.onclick = start;
btnPause.onclick = pause;
btnReset.onclick = reset;

preloadCues();
loadSettings();
updateUI();
