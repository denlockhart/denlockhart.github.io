const MIN = 1;
const MAX = 10;
const STORAGE_KEY = "plus-practice-numbers-v1";
const APPLES_KEY = "plus-practice-show-apples-v1";
const LESSON_KEY = "plus-practice-lesson-v1";
const SIZE_KEY = "plus-practice-lesson-size-v1";
const LESSON_SIZES = [10, 20, 30];

const GROUPS = {
  all: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  small: [1, 2, 3, 4, 5],
  big: [6, 7, 8, 9, 10],
};

const equationEl = document.getElementById("equation");
const numAEl = document.getElementById("num-a");
const numBEl = document.getElementById("num-b");
const numSumEl = document.getElementById("num-sum");
const applesAEl = document.getElementById("apples-a");
const applesBEl = document.getElementById("apples-b");
const feedbackEl = document.getElementById("feedback");
const cardEl = document.getElementById("flash-card");
const streakEl = document.getElementById("streak");
const firstRightEl = document.getElementById("first-right");
const firstWrongEl = document.getElementById("first-wrong");
const nextBtn = document.getElementById("btn-next");
const taglineEl = document.getElementById("tagline");
const picksEl = document.getElementById("number-picks");
const setupStatusEl = document.getElementById("setup-status");
const showApplesEl = document.getElementById("show-apples");
const lessonSummaryEl = document.getElementById("lesson-summary");
const lessonProgressEl = document.getElementById("lesson-progress");
const listWrongEl = document.getElementById("list-wrong");
const listRightEl = document.getElementById("list-right");
const reviewMissedBtn = document.getElementById("btn-review-missed");
const clearLessonBtn = document.getElementById("btn-clear-lesson");
const choiceButtons = [...document.querySelectorAll(".choice")];
const groupButtons = [...document.querySelectorAll(".group-btn")];
const sizeButtons = [...document.querySelectorAll(".size-btn")];
const fireworksCanvas = document.getElementById("fireworks");

let pool = loadPool();
let showApples = loadShowApples();
let lessonSize = loadLessonSize();
let lessonLog = loadLesson();
let reviewQueue = [];
let inReview = false;
let a = 1;
let b = 1;
let answer = 2;
let locked = false;
let firstAttemptDone = false;
let streak = 0;
let lastKey = "";

function defaultPool() {
  return GROUPS.all.slice();
}

function loadPool() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!Array.isArray(raw)) return defaultPool();
    const cleaned = [...new Set(raw.map(Number))]
      .filter((n) => Number.isInteger(n) && n >= MIN && n <= MAX)
      .sort((x, y) => x - y);
    return cleaned.length ? cleaned : defaultPool();
  } catch {
    return defaultPool();
  }
}

function savePool() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pool));
}

function loadShowApples() {
  try {
    const raw = localStorage.getItem(APPLES_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function saveShowApples() {
  localStorage.setItem(APPLES_KEY, showApples ? "1" : "0");
}

function loadLessonSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return LESSON_SIZES.includes(n) ? n : 10;
  } catch {
    return 10;
  }
}

function saveLessonSize() {
  localStorage.setItem(SIZE_KEY, String(lessonSize));
}

function isLessonComplete() {
  return lessonLog.length >= lessonSize;
}

function loadLesson() {
  try {
    const raw = JSON.parse(localStorage.getItem(LESSON_KEY) || "null");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((row) => row && Number.isInteger(row.a) && Number.isInteger(row.b))
      .map((row) => ({
        a: row.a,
        b: row.b,
        answer: row.answer ?? row.a + row.b,
        firstRight: Boolean(row.firstRight),
      }));
  } catch {
    return [];
  }
}

function saveLesson() {
  localStorage.setItem(LESSON_KEY, JSON.stringify(lessonLog));
}

function applyAppleVisibility() {
  document.body.classList.toggle("hide-apples", !showApples);
  if (showApplesEl) showApplesEl.checked = showApples;
  if (!showApples) {
    applesAEl.replaceChildren();
    applesBEl.replaceChildren();
  } else {
    renderApples(applesAEl, a);
    renderApples(applesBEl, b);
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickFromPool() {
  return pool[randInt(0, pool.length - 1)];
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function uniqueWrongAnswers(correctAns, count) {
  const set = new Set();
  const minSum = MIN + MIN;
  const maxSum = MAX + MAX;
  let guard = 0;
  while (set.size < count && guard < 80) {
    guard += 1;
    const delta = randInt(-3, 3) || randInt(1, 4);
    let n = correctAns + delta;
    if (n === correctAns) continue;
    if (n < minSum || n > maxSum) n = randInt(minSum, maxSum);
    if (n !== correctAns) set.add(n);
  }
  while (set.size < count) {
    const n = randInt(minSum, maxSum);
    if (n !== correctAns) set.add(n);
  }
  return [...set];
}

function renderApples(container, count) {
  container.replaceChildren();
  for (let i = 0; i < count; i++) {
    const apple = document.createElement("span");
    apple.className = "apple";
    apple.title = "apple";
    container.appendChild(apple);
  }
}

function renderEquation(sumDisplay = "?") {
  numAEl.textContent = String(a);
  numBEl.textContent = String(b);
  numSumEl.textContent = String(sumDisplay);
  if (showApples) {
    renderApples(applesAEl, a);
    renderApples(applesBEl, b);
  } else {
    applesAEl.replaceChildren();
    applesBEl.replaceChildren();
  }
  const sumText = sumDisplay === "?" ? "question mark" : String(sumDisplay);
  equationEl.setAttribute("aria-label", `${a} plus ${b} equals ${sumText}`);
}

function formatPoolLabel(nums) {
  if (nums.length === 10) return "numbers 1 to 10";
  if (nums.length === 1) return `number ${nums[0]}`;
  const parts = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return `numbers ${parts.join(", ")}`;
}

function sameSet(aNums, bNums) {
  if (aNums.length !== bNums.length) return false;
  return aNums.every((n, i) => n === bNums[i]);
}

function cardLabel(row) {
  return `${row.a} + ${row.b} = ${row.answer}`;
}

function missedCards() {
  return lessonLog.filter((row) => !row.firstRight);
}

function rightFirstCards() {
  return lessonLog.filter((row) => row.firstRight);
}

function renderLogList(el, rows, emptyText) {
  el.replaceChildren();
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = emptyText;
    el.appendChild(li);
    return;
  }
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = cardLabel(row);
    el.appendChild(li);
  });
}

function updateLessonUi() {
  const right = rightFirstCards();
  const wrong = missedCards();
  firstRightEl.textContent = String(right.length);
  firstWrongEl.textContent = String(wrong.length);

  const done = Math.min(lessonLog.length, lessonSize);
  const complete = isLessonComplete();
  lessonProgressEl.classList.toggle("is-complete", complete && !inReview);
  if (inReview) {
    lessonProgressEl.textContent = `Review · ${reviewQueue.length} missed left`;
  } else if (complete) {
    lessonProgressEl.textContent = `Lesson complete · ${lessonSize} of ${lessonSize}`;
  } else {
    const current = Math.min(lessonLog.length + (firstAttemptDone ? 0 : 1), lessonSize);
    lessonProgressEl.textContent = `Lesson: ${current} of ${lessonSize}`;
  }

  sizeButtons.forEach((btn) => {
    btn.classList.toggle("is-on", Number(btn.dataset.size) === lessonSize);
  });

  if (!lessonLog.length) {
    lessonSummaryEl.textContent = `No cards yet · lesson of ${lessonSize}.`;
  } else if (inReview) {
    lessonSummaryEl.textContent = `Reviewing missed cards · ${reviewQueue.length} left.`;
  } else if (complete) {
    lessonSummaryEl.textContent = `Done! ${right.length} right first try · ${wrong.length} missed first try. Review missed or clear to start again.`;
  } else {
    lessonSummaryEl.textContent = `${done} of ${lessonSize} · ${right.length} right first try · ${wrong.length} missed first try.`;
  }

  renderLogList(listWrongEl, wrong, "None yet.");
  renderLogList(listRightEl, right, "None yet.");
  reviewMissedBtn.disabled = wrong.length === 0;
  nextBtn.disabled = complete && !inReview;
  nextBtn.textContent = complete && !inReview ? "Lesson complete" : "Next card";
}

function recordFirstAttempt(right) {
  if (firstAttemptDone) return;
  if (!inReview && isLessonComplete()) return;
  firstAttemptDone = true;
  if (!inReview) {
    lessonLog.push({ a, b, answer, firstRight: right });
    saveLesson();
  }
  updateLessonUi();
}

function updateSetupUi() {
  picksEl.querySelectorAll(".num-toggle").forEach((btn) => {
    const n = Number(btn.dataset.num);
    const on = pool.includes(n);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  groupButtons.forEach((btn) => {
    const group = GROUPS[btn.dataset.group] || [];
    btn.classList.toggle("is-on", sameSet(pool, group));
  });

  if (taglineEl) taglineEl.textContent = `Addition flash cards — ${formatPoolLabel(pool)}`;
  setupStatusEl.textContent =
    pool.length === 1
      ? `Selection: ${pool[0]} on one side · other side random 1–10.`
      : `Selection: ${pool.join(", ")} on one side · other side random 1–10.`;
}

function buildNumberPicks() {
  picksEl.replaceChildren();
  for (let n = MIN; n <= MAX; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "num-toggle";
    btn.dataset.num = String(n);
    btn.textContent = String(n);
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => toggleNumber(n));
    picksEl.appendChild(btn);
  }
}

function setPool(next, { deal = true } = {}) {
  const cleaned = [...new Set(next)]
    .filter((n) => Number.isInteger(n) && n >= MIN && n <= MAX)
    .sort((x, y) => x - y);
  if (!cleaned.length) {
    setupStatusEl.textContent = "Keep at least one number selected.";
    return;
  }
  pool = cleaned;
  savePool();
  updateSetupUi();
  if (deal) newCard();
}

function toggleNumber(n) {
  if (pool.length === MAX - MIN + 1 && pool.includes(n)) {
    setPool([n]);
    return;
  }
  if (pool.includes(n)) {
    if (pool.length === 1) {
      setupStatusEl.textContent = "Keep at least one number selected.";
      return;
    }
    setPool(pool.filter((x) => x !== n));
    return;
  }
  setPool([...pool, n]);
}

function dealAddends() {
  const selected = pickFromPool();
  const other = randInt(MIN, MAX);
  if (Math.random() < 0.5) return [selected, other];
  return [other, selected];
}

function showCard(nextA, nextB, { animate = true } = {}) {
  locked = false;
  firstAttemptDone = false;
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  cardEl.classList.remove("is-correct", "is-wrong");

  a = nextA;
  b = nextB;
  answer = a + b;
  lastKey = `${a}+${b}`;

  renderEquation("?");

  const choices = shuffle([answer, ...uniqueWrongAnswers(answer, 3)]);
  choiceButtons.forEach((btn, i) => {
    btn.disabled = false;
    btn.classList.remove("is-right", "is-wrong");
    btn.textContent = String(choices[i]);
    btn.dataset.value = String(choices[i]);
  });

  if (animate) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }
}

function newCard({ animate = true } = {}) {
  let reviewJustFinished = false;
  if (inReview) {
    if (!reviewQueue.length) {
      inReview = false;
      reviewJustFinished = true;
      updateLessonUi();
    } else {
      const row = reviewQueue.shift();
      updateLessonUi();
      showCard(row.a, row.b, { animate });
      return;
    }
  }

  if (isLessonComplete()) {
    updateLessonUi();
    feedbackEl.textContent = "Lesson complete!";
    feedbackEl.className = "feedback good";
    choiceButtons.forEach((btn) => {
      btn.disabled = true;
    });
    return;
  }

  let nextA;
  let nextB;
  let key;
  let guard = 0;
  do {
    [nextA, nextB] = dealAddends();
    key = `${nextA}+${nextB}`;
    guard += 1;
  } while (key === lastKey && guard < 30);

  showCard(nextA, nextB, { animate });
  if (reviewJustFinished) {
    feedbackEl.textContent = isLessonComplete() ? "Lesson complete!" : "Review finished!";
    feedbackEl.className = "feedback good";
  }
  updateLessonUi();
}

function updateStats() {
  streakEl.textContent = String(streak);
  updateLessonUi();
}

const FIREWORK_COLORS = ["#e85d04", "#2a9d8f", "#e03131", "#f4a261", "#ffd166", "#90be6d", "#577590"];
let fireworksAnim = 0;
let fireworksUntil = 0;
let fireworkBursts = [];

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function resizeFireworksCanvas() {
  if (!fireworksCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  fireworksCanvas.width = Math.floor(w * dpr);
  fireworksCanvas.height = Math.floor(h * dpr);
  fireworksCanvas.style.width = `${w}px`;
  fireworksCanvas.style.height = `${h}px`;
  const ctx = fireworksCanvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnFireworkBurst(x, y) {
  const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  const count = 34 + Math.floor(Math.random() * 18);
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
    const speed = 2.2 + Math.random() * 4.2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.018,
      size: 2 + Math.random() * 2.4,
      color,
    });
  }
  fireworkBursts.push(particles);
}

function drawFireworks(now) {
  if (!fireworksCanvas) return;
  const ctx = fireworksCanvas.getContext("2d");
  if (!ctx) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  if (now < fireworksUntil && Math.random() < 0.18) {
    spawnFireworkBurst(w * (0.12 + Math.random() * 0.76), h * (0.12 + Math.random() * 0.45));
  }

  fireworkBursts = fireworkBursts.filter((burst) => {
    let alive = false;
    for (const p of burst) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      p.vx *= 0.99;
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    return alive;
  });

  ctx.globalAlpha = 1;

  if (now < fireworksUntil || fireworkBursts.length) {
    fireworksAnim = requestAnimationFrame(drawFireworks);
  } else {
    fireworksAnim = 0;
    ctx.clearRect(0, 0, w, h);
  }
}

function celebrateStreakFireworks() {
  if (!fireworksCanvas || prefersReducedMotion()) return;
  resizeFireworksCanvas();
  const w = window.innerWidth;
  const h = window.innerHeight;
  fireworksUntil = performance.now() + 2000;
  for (let i = 0; i < 5; i++) {
    spawnFireworkBurst(w * (0.18 + Math.random() * 0.64), h * (0.15 + Math.random() * 0.4));
  }
  if (!fireworksAnim) fireworksAnim = requestAnimationFrame(drawFireworks);
}

function pick(value, btn) {
  if (locked) return;
  if (btn?.disabled) return;

  const right = Number(value) === answer;
  recordFirstAttempt(right);

  if (right) {
    locked = true;
    streak += 1;
    choiceButtons.forEach((el) => {
      el.disabled = true;
      if (Number(el.dataset.value) === answer) el.classList.add("is-right");
    });
    renderEquation(answer);
    feedbackEl.textContent = "Good Job!";
    feedbackEl.className = "feedback good";
    cardEl.classList.remove("is-wrong");
    cardEl.classList.add("is-correct");
    if (streak > 0 && streak % 5 === 0) celebrateStreakFireworks();
    nextBtn.focus();
  } else {
    streak = 0;
    feedbackEl.textContent = "Try again!";
    feedbackEl.className = "feedback bad";
    cardEl.classList.remove("is-correct");
    cardEl.classList.add("is-wrong");
    if (btn) {
      btn.classList.add("is-wrong");
      btn.disabled = true;
    }
    window.setTimeout(() => cardEl.classList.remove("is-wrong"), 400);
  }

  updateStats();
}

function startMissedReview() {
  const missed = missedCards();
  if (!missed.length) return;
  reviewQueue = shuffle(missed.map((row) => ({ a: row.a, b: row.b, answer: row.answer })));
  inReview = true;
  updateLessonUi();
  newCard();
  cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearLesson() {
  lessonLog = [];
  reviewQueue = [];
  inReview = false;
  streak = 0;
  saveLesson();
  nextBtn.disabled = false;
  nextBtn.textContent = "Next card";
  updateStats();
  newCard();
}

function setLessonSize(size) {
  if (!LESSON_SIZES.includes(size)) return;
  lessonSize = size;
  saveLessonSize();
  updateLessonUi();
  if (isLessonComplete() && !inReview) {
    feedbackEl.textContent = "Lesson complete!";
    feedbackEl.className = "feedback good";
    nextBtn.disabled = true;
    nextBtn.textContent = "Lesson complete";
  } else if (!isLessonComplete()) {
    nextBtn.disabled = false;
    nextBtn.textContent = "Next card";
  }
}

choiceButtons.forEach((btn) => {
  btn.addEventListener("click", () => pick(btn.dataset.value, btn));
});

groupButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const group = GROUPS[btn.dataset.group];
    if (group) setPool(group);
  });
});

showApplesEl?.addEventListener("change", () => {
  showApples = Boolean(showApplesEl.checked);
  saveShowApples();
  applyAppleVisibility();
});

reviewMissedBtn.addEventListener("click", () => startMissedReview());
clearLessonBtn.addEventListener("click", () => clearLesson());
nextBtn.addEventListener("click", () => newCard());

sizeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setLessonSize(Number(btn.dataset.size)));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !nextBtn.disabled) {
    e.preventDefault();
    newCard();
  }
});

window.addEventListener("resize", () => {
  if (fireworksAnim) resizeFireworksCanvas();
});

buildNumberPicks();
updateSetupUi();
applyAppleVisibility();
updateStats();
newCard({ animate: false });
