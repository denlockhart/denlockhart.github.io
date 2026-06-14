const WORK_SEC = 20;
const REST_SEC = 30;

const state = {
  phase: "idle",
  round: 1,
  secondsLeft: WORK_SEC,
  running: false,
  totalRounds: 8,
  sound: true,
  intervalId: null,
};

const panel = document.querySelector(".timer-panel");
const phaseLabel = document.getElementById("phase-label");
const timerDisplay = document.getElementById("timer-display");
const roundLabel = document.getElementById("round-label");
const progressFill = document.getElementById("progress-fill");
const roundsInput = document.getElementById("rounds-input");
const soundToggle = document.getElementById("sound-toggle");
const btnStart = document.getElementById("btn-start");
const btnPause = document.getElementById("btn-pause");
const btnReset = document.getElementById("btn-reset");

let audioCtx = null;
let keepAliveOsc = null;
let beepUrls = { work: null, rest: null, done: null };

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

function beepTone(freq) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(1.0, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  osc.start(t);
  osc.stop(t + 0.48);
}

function makeBeepUrl(freq) {
  const sampleRate = 8000;
  const duration = 0.45;
  const samples = Math.floor(sampleRate * duration);
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = t < 0.02 ? t / 0.02 : Math.max(0, 1 - (t - 0.02) / 0.4);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

function initBeepFallbacks() {
  if (beepUrls.work) return;
  beepUrls.work = makeBeepUrl(880);
  beepUrls.rest = makeBeepUrl(440);
  beepUrls.done = makeBeepUrl(523);
}

function playBeepFallback(kind) {
  initBeepFallbacks();
  const url = beepUrls[kind];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = 1;
  audio.play().catch(() => {});
}

function beep(kind) {
  if (!state.sound) return;
  unlockAudio().then(() => startAudioKeepAlive());
  playBeepFallback(kind);
}

function loadSettings() {
  const rounds = localStorage.getItem("hiit-rounds");
  const sound = localStorage.getItem("hiit-sound");
  if (rounds) {
    state.totalRounds = Math.max(1, Math.min(99, parseInt(rounds, 10) || 8));
    roundsInput.value = state.totalRounds;
  }
  if (sound !== null) {
    state.sound = sound === "true";
    soundToggle.checked = state.sound;
  }
}

function saveSettings() {
  localStorage.setItem("hiit-rounds", String(state.totalRounds));
  localStorage.setItem("hiit-sound", String(state.sound));
}

function phaseDuration(phase) {
  if (phase === "work") return WORK_SEC;
  if (phase === "rest") return REST_SEC;
  return WORK_SEC;
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

  if (state.phase === "idle") {
    phaseLabel.textContent = "Ready";
    timerDisplay.textContent = fmtTime(WORK_SEC);
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
      beep("done");
      state.phase = "done";
      stopInterval();
      updateUI();
      return;
    }
    beep("work");
    state.phase = "rest";
    state.secondsLeft = REST_SEC;
    updateUI();
    return;
  }

  if (state.phase === "rest") {
    beep("rest");
    state.round++;
    state.phase = "work";
    state.secondsLeft = WORK_SEC;
    updateUI();
  }
}

function start() {
  unlockAudio().then(() => {
    initBeepFallbacks();
    startAudioKeepAlive();
  });
  if (state.phase === "idle" || state.phase === "done") {
    state.phase = "work";
    state.round = 1;
    state.secondsLeft = WORK_SEC;
  }
  startInterval();
  updateUI();
}

function pause() {
  unlockAudio();
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
  state.secondsLeft = WORK_SEC;
  updateUI();
}

roundsInput.addEventListener("change", () => {
  state.totalRounds = Math.max(1, Math.min(99, parseInt(roundsInput.value, 10) || 8));
  roundsInput.value = state.totalRounds;
  saveSettings();
  if (state.phase === "idle" || state.phase === "done") updateUI();
});

soundToggle.addEventListener("change", () => {
  state.sound = soundToggle.checked;
  saveSettings();
  if (state.sound) {
    unlockAudio().then(() => {
      initBeepFallbacks();
      beepTone(660);
    });
    playBeepFallback("done");
  }
});

btnStart.onclick = start;
btnPause.onclick = pause;
btnReset.onclick = reset;

loadSettings();
updateUI();
