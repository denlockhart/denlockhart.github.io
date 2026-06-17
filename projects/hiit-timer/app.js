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

const COMPUTER_VOICE_PATTERNS = [
  /zira/i,
  /samantha/i,
  /karen/i,
  /victoria/i,
  /hazel/i,
  /susan/i,
  /serena/i,
  /google.*english.*female/i,
  /microsoft.*female/i,
  /female/i,
];

const MALE_VOICE_PATTERNS = [/male/i, /david/i, /mark\b/i, /james/i, /daniel/i, /fred/i, /george/i, /richard/i];

function preferredVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang.startsWith("en"));
  const pool = english.length ? english : voices;

  for (const pattern of COMPUTER_VOICE_PATTERNS) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const notMale = pool.find((v) => !MALE_VOICE_PATTERNS.some((pattern) => pattern.test(v.name)));
  return notMale || pool[0] || null;
}

function speak(text) {
  if (!state.sound || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  utterance.pitch = 0.92;
  utterance.volume = 1;
  const voice = preferredVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  speechSynthesis.speak(utterance);
}

function announce(phase) {
  if (phase === "work") speak("Work");
  else if (phase === "rest") speak("Rest");
  else if (phase === "done") speak("Complete");
}

function primeSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.getVoices();
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
}

function startInterval() {
  stopInterval();
  state.running = true;
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
    state.secondsLeft = REST_SEC;
    updateUI();
    return;
  }

  if (state.phase === "rest") {
    announce("work");
    state.round++;
    state.phase = "work";
    state.secondsLeft = WORK_SEC;
    updateUI();
  }
}

function start() {
  primeSpeech();
  const fresh = state.phase === "idle" || state.phase === "done";
  if (fresh) {
    state.phase = "work";
    state.round = 1;
    state.secondsLeft = WORK_SEC;
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
    primeSpeech();
    speak("Work");
  }
});

btnStart.onclick = start;
btnPause.onclick = pause;
btnReset.onclick = reset;

if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener("voiceschanged", primeSpeech);
  primeSpeech();
}

loadSettings();
updateUI();
