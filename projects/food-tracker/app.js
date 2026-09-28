const STORAGE_KEY = "food-tracker-day";
const FOODS_KEY = "food-tracker-foods";
const DAYS_KEY = "food-tracker-days";

const dayLabel = document.getElementById("day-label");
const totalCalories = document.getElementById("total-calories");
const totalCarbs = document.getElementById("total-carbs");
const totalProtein = document.getElementById("total-protein");
const dayList = document.getElementById("day-list");
const dayEmpty = document.getElementById("day-empty");
const foodList = document.getElementById("food-list");
const foodEmpty = document.getElementById("food-empty");
const clearDayBtn = document.getElementById("clear-day");
const savedDaysSection = document.getElementById("saved-days");
const savedList = document.getElementById("saved-list");
const addFoodForm = document.getElementById("add-food-form");
const foodNameInput = document.getElementById("food-name");
const foodServingInput = document.getElementById("food-serving");
const foodCaloriesInput = document.getElementById("food-calories");
const foodCarbsInput = document.getElementById("food-carbs");
const foodProteinInput = document.getElementById("food-protein");
const addFoodError = document.getElementById("add-food-error");
const addFoodSubmit = document.getElementById("add-food-submit");
const cancelEditBtn = document.getElementById("cancel-edit");

let dayItems = [];
let foods = [];
let savedDays = [];
let editingId = null;

function todayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function formatDay(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fmt(value) {
  const n = Number(value) || 0;
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function readStoredDay() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.items)) return saved;
  } catch (_) {}
  return null;
}

function loadSavedDays() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAYS_KEY) || "null");
    if (Array.isArray(saved)) return saved;
  } catch (_) {}
  return [];
}

function persistSavedDays() {
  localStorage.setItem(DAYS_KEY, JSON.stringify(savedDays));
}

function snapshotItems(items) {
  return items.map((item) => ({
    name: item.name,
    serving: String(item.serving || "").trim(),
    calories: Number(item.calories) || 0,
    carbs: Number(item.carbs) || 0,
    protein: Number(item.protein) || 0,
  }));
}

function archiveStoredDay(stored) {
  const items = snapshotItems(stored.items);
  const signature = stored.date + "|" + JSON.stringify(items);
  const already = savedDays.some((day) => day.date + "|" + JSON.stringify(day.items) === signature);
  if (!already) {
    savedDays.unshift({
      id: crypto.randomUUID(),
      date: stored.date,
      items: items,
    });
    persistSavedDays();
  }
}

function rolloverIfNewDay() {
  const today = todayKey(new Date());
  const stored = readStoredDay();
  if (!stored || !stored.date || stored.date >= today) return false;
  if (stored.items.length) archiveStoredDay(stored);
  dayItems = [];
  saveDay();
  dayLabel.textContent = formatDay(new Date());
  return true;
}

function msUntilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function scheduleMidnightSave() {
  setTimeout(() => {
    if (rolloverIfNewDay()) render();
    scheduleMidnightSave();
  }, msUntilMidnight());
}

function loadDay() {
  const today = todayKey(new Date());
  const stored = readStoredDay();
  if (stored && stored.date === today) return stored.items;
  if (stored && stored.date < today && stored.items.length) {
    archiveStoredDay(stored);
    dayItems = [];
    saveDay();
  }
  return dayItems;
}

function saveDay() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    date: todayKey(new Date()),
    items: dayItems,
  }));
}

function normalizeFood(food) {
  const name = String(food.name || "").trim();
  if (!name) return null;
  return {
    id: food.id || crypto.randomUUID(),
    name: name,
    serving: String(food.serving || "").trim(),
    calories: Number(food.calories) || 0,
    carbs: Number(food.carbs) || 0,
    protein: Number(food.protein) || 0,
  };
}

function loadFoods() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOODS_KEY) || "null");
    if (Array.isArray(saved)) {
      return saved.map(normalizeFood).filter(Boolean);
    }
  } catch (_) {}
  const seeded = Array.isArray(FOODS) ? FOODS : [];
  return seeded.map(normalizeFood).filter(Boolean);
}

function saveFoods() {
  localStorage.setItem(FOODS_KEY, JSON.stringify(foods));
}

function showFormError(message) {
  addFoodError.textContent = message;
  addFoodError.hidden = !message;
}

function setEditing(id) {
  editingId = id;
  const editing = Boolean(id);
  addFoodSubmit.textContent = editing ? "Save changes" : "Add food";
  cancelEditBtn.hidden = !editing;
}

function beginEdit(food) {
  setEditing(food.id);
  foodNameInput.value = food.name;
  foodServingInput.value = food.serving || "";
  foodCaloriesInput.value = String(food.calories);
  foodCarbsInput.value = String(food.carbs);
  foodProteinInput.value = String(food.protein);
  showFormError("");
  addFoodForm.scrollIntoView({ block: "nearest" });
  foodNameInput.focus();
  renderDatabase();
}

function cancelEditing() {
  setEditing(null);
  addFoodForm.reset();
  showFormError("");
}

function readAmount(input) {
  const value = input.value.trim();
  if (value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function sum(key) {
  return dayItems.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function foodTitle(food) {
  const serving = String(food.serving || "").trim();
  return serving ? food.name + ", " + serving : food.name;
}

function appendFoodName(parent, food) {
  const name = document.createElement("span");
  name.className = "food-name";
  name.textContent = food.name;
  parent.appendChild(name);
}

function appendServing(parent, food) {
  const cell = document.createElement("span");
  cell.className = "serving-col";
  cell.textContent = String(food.serving || "").trim();
  parent.appendChild(cell);
}

function addNumber(row, value, className) {
  const cell = document.createElement("span");
  cell.className = "num " + className;
  cell.textContent = fmt(value);
  row.appendChild(cell);
}

function renderDay() {
  dayList.replaceChildren();
  dayItems.forEach((item) => {
    const row = document.createElement("li");
    row.className = "food-row";

    appendFoodName(row, item);
    appendServing(row, item);
    addNumber(row, item.calories, "num-cal");
    addNumber(row, item.carbs, "num-carbs");
    addNumber(row, item.protein, "num-protein");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-btn";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + foodTitle(item) + " from today");
    remove.addEventListener("click", () => {
      dayItems = dayItems.filter((entry) => entry.id !== item.id);
      saveDay();
      render();
    });
    row.appendChild(remove);
    dayList.appendChild(row);
  });

  const empty = dayItems.length === 0;
  dayEmpty.hidden = !empty;
  clearDayBtn.hidden = empty;
  dayList.hidden = empty;
  dayList.previousElementSibling.hidden = empty;
}

function logFood(food) {
  dayItems.push({
    id: crypto.randomUUID(),
    name: food.name,
    serving: String(food.serving || "").trim(),
    calories: Number(food.calories) || 0,
    carbs: Number(food.carbs) || 0,
    protein: Number(food.protein) || 0,
  });
  saveDay();
  render();
}

function renderDatabase() {
  foodList.replaceChildren();
  const sorted = foods.slice().sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach((food) => {
    const item = document.createElement("li");
    item.className = "db-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "food-row database-row";
    button.setAttribute("aria-label", "Add " + foodTitle(food) + " to today");

    appendFoodName(button, food);
    appendServing(button, food);
    addNumber(button, food.calories, "num-cal");
    addNumber(button, food.carbs, "num-carbs");
    addNumber(button, food.protein, "num-protein");
    button.addEventListener("click", () => logFood(food));

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "remove-btn";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", "Edit " + foodTitle(food));
    edit.addEventListener("click", () => beginEdit(food));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-btn";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", "Delete " + foodTitle(food) + " from the food list");
    remove.addEventListener("click", () => {
      foods = foods.filter((entry) => entry.id !== food.id);
      if (editingId === food.id) cancelEditing();
      saveFoods();
      render();
    });

    actions.append(edit, remove);
    if (food.id === editingId) item.classList.add("is-editing");
    item.append(button, actions);
    foodList.appendChild(item);
  });

  const empty = sorted.length === 0;
  foodEmpty.hidden = !empty;
  foodList.hidden = empty;
  foodList.previousElementSibling.hidden = empty;
}

function formatSavedDate(dateKey) {
  const parts = String(dateKey).split("-");
  if (parts.length !== 3) return dateKey;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function itemsTotal(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function renderSavedDays() {
  savedList.replaceChildren();
  savedDays.forEach((day) => {
    const item = document.createElement("li");
    item.className = "saved-day";

    const head = document.createElement("div");
    head.className = "saved-head";
    const date = document.createElement("span");
    date.className = "saved-date";
    date.textContent = formatSavedDate(day.date);
    const totals = document.createElement("span");
    totals.className = "saved-totals";
    totals.textContent = fmt(itemsTotal(day.items, "calories")) + " cal · "
      + fmt(itemsTotal(day.items, "carbs")) + " g carbs · "
      + fmt(itemsTotal(day.items, "protein")) + " g protein";
    head.append(date, totals);

    const foods = document.createElement("ul");
    foods.className = "saved-foods";
    day.items.forEach((food) => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.className = "food-name";
      name.textContent = food.serving ? food.name + " · " + food.serving : food.name;
      row.appendChild(name);
      const values = document.createElement("span");
      values.textContent = fmt(food.calories) + " / " + fmt(food.carbs) + " / " + fmt(food.protein);
      row.appendChild(values);
      foods.appendChild(row);
    });

    item.append(head, foods);
    savedList.appendChild(item);
  });
  savedDaysSection.hidden = savedDays.length === 0;
}

function render() {
  totalCalories.textContent = fmt(sum("calories"));
  totalCarbs.textContent = fmt(sum("carbs"));
  totalProtein.textContent = fmt(sum("protein"));
  renderDay();
  renderSavedDays();
  renderDatabase();
}

addFoodForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = foodNameInput.value.trim();
  const serving = foodServingInput.value.trim();
  const calories = readAmount(foodCaloriesInput);
  const carbs = readAmount(foodCarbsInput);
  const protein = readAmount(foodProteinInput);
  if (!name) {
    showFormError("Enter a food name.");
    foodNameInput.focus();
    return;
  }
  if (!serving) {
    showFormError("Enter a serving size.");
    foodServingInput.focus();
    return;
  }
  if (calories === null || carbs === null || protein === null) {
    showFormError("Enter calories, carbs, and protein as zero or more.");
    return;
  }
  if (editingId) {
    const index = foods.findIndex((entry) => entry.id === editingId);
    if (index === -1) {
      cancelEditing();
      render();
      return;
    }
    foods[index] = {
      id: editingId,
      name: name,
      serving: serving,
      calories: calories,
      carbs: carbs,
      protein: protein,
    };
  } else {
    foods.push({
      id: crypto.randomUUID(),
      name: name,
      serving: serving,
      calories: calories,
      carbs: carbs,
      protein: protein,
    });
  }
  saveFoods();
  addFoodForm.reset();
  setEditing(null);
  showFormError("");
  render();
  foodNameInput.focus();
});

cancelEditBtn.addEventListener("click", () => {
  cancelEditing();
  render();
});

clearDayBtn.addEventListener("click", () => {
  if (!dayItems.length) return;
  if (!confirm("Clear every food logged today?")) return;
  dayItems = [];
  saveDay();
  render();
});

dayLabel.textContent = formatDay(new Date());
savedDays = loadSavedDays();
dayItems = loadDay();
foods = loadFoods();
render();
scheduleMidnightSave();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && rolloverIfNewDay()) render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

