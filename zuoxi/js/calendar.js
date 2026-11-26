import { state, update, dayOf, makeItem, sortItems, dateKey, parseKey, shiftKey } from "./store.js";

let view = parseKey(dateKey());
view.setDate(1);

let gridEl;
let titleEl;
let quickInput = null;

function itemsFor(key) {
  return sortItems(dayOf(key).items);
}

export function render() {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const last = new Date(year, month + 1, 0);
  const lastOffset = (last.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const end = new Date(year, month + 1, 4 - lastOffset);

  const todayKey = dateKey();
  const selected = state.meta.selectedDate;
  const cells = [];

  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if ((date.getDay() + 6) % 7 > 4) continue;
    const key = dateKey(date);
    const other = date.getMonth() !== month;
    const items = itemsFor(key);
    const visible = items.slice(0, 3);
    const rest = items.length - visible.length;

    const itemHtml = visible
      .map((item) => {
        const time = item.time ? `<span class="cell-time">${item.time}</span>` : "";
        return `<div class="cell-item${item.done ? " is-done" : ""}" draggable="true" data-id="${item.id}" data-key="${key}" title="${escapeAttr(item.title)}">${time}<span class="cell-text">${escapeAttr(item.title)}</span></div>`;
      })
      .join("");
    const moreHtml = rest > 0 ? `<div class="cell-more">还有 ${rest} 项</div>` : "";

    const classes = ["cell"];
    if (other) classes.push("is-other");
    if (key === todayKey) classes.push("is-today");
    if (key === selected) classes.push("is-selected");

    cells.push(`
      <div class="${classes.join(" ")}" data-key="${key}">
        <div class="cell-head">
          <span class="cell-num">${date.getDate()}</span>
          <button class="cell-add" type="button" data-add="${key}" aria-label="添加事项">＋</button>
        </div>
        <div class="cell-items">${itemHtml}${moreHtml}</div>
      </div>
    `);
  }

  titleEl.textContent = `${year} 年 ${month + 1} 月`;
  gridEl.style.setProperty("--rows", cells.length / 5);
  gridEl.innerHTML = cells.join("");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectDate(key) {
  update("select", (draft) => {
    draft.meta.selectedDate = key;
  });
  const date = parseKey(key);
  if (date.getMonth() !== view.getMonth() || date.getFullYear() !== view.getFullYear()) {
    view = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
  }
}

export function closeQuickAdd() {
  if (!quickInput) return;
  const input = quickInput;
  quickInput = null;
  if (input.parentNode) input.parentNode.removeChild(input);
}

function openQuickAdd(anchor, key) {
  closeQuickAdd();
  const rect = anchor.getBoundingClientRect();
  const input = document.createElement("input");
  input.className = "quick-add";
  input.placeholder = "写点什么，回车保存";
  input.style.left = `${Math.min(rect.left + 8, window.innerWidth - 280)}px`;
  input.style.top = `${Math.min(rect.top + 36, window.innerHeight - 60)}px`;
  input.style.width = `${Math.max(200, Math.min(260, rect.width - 16))}px`;
  document.body.appendChild(input);
  quickInput = input;
  input.focus();

  const commit = () => {
    const text = input.value.trim();
    if (!text) return;
    update("calendar", (draft) => {
      dayOf(key).items.push(makeItem(text));
      draft.meta.selectedDate = key;
    });
    render();
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      input.value = "";
    }
    if (event.key === "Escape") closeQuickAdd();
  });
  input.addEventListener("blur", () => {
    commit();
    closeQuickAdd();
  });
}

function moveItem(id, from, to) {
  if (from === to) return;
  update("calendar", () => {
    const source = dayOf(from).items;
    const index = source.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = source.splice(index, 1);
    item.updatedAt = new Date().toISOString();
    dayOf(to).items.push(item);
  });
  render();
}

export function init({ grid, title }) {
  gridEl = grid;
  titleEl = title;

  gridEl.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    if (addButton) {
      event.stopPropagation();
      openQuickAdd(addButton.closest(".cell"), addButton.dataset.add);
      return;
    }
    const cell = event.target.closest(".cell");
    if (!cell) return;
    selectDate(cell.dataset.key);
  });

  gridEl.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".cell-item");
    if (!item) return;
    event.dataTransfer.setData("application/json", JSON.stringify({ id: item.dataset.id, from: item.dataset.key }));
    event.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  });

  gridEl.addEventListener("dragend", (event) => {
    const item = event.target.closest(".cell-item");
    if (item) item.classList.remove("is-dragging");
  });

  gridEl.addEventListener("dragover", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    event.preventDefault();
    cell.classList.add("is-over");
  });

  gridEl.addEventListener("dragleave", (event) => {
    const cell = event.target.closest(".cell");
    if (cell) cell.classList.remove("is-over");
  });

  gridEl.addEventListener("drop", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    event.preventDefault();
    cell.classList.remove("is-over");
    let payload = null;
    try {
      payload = JSON.parse(event.dataTransfer.getData("application/json"));
    } catch {
      payload = null;
    }
    if (payload) moveItem(payload.id, payload.from, cell.dataset.key);
  });

  document.querySelector("#prevMonth").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    render();
  });
  document.querySelector("#nextMonth").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    render();
  });
  document.querySelector("#todayBtn").addEventListener("click", () => {
    const today = new Date();
    view = new Date(today.getFullYear(), today.getMonth(), 1);
    selectDate(dateKey(today));
    render();
  });

  render();
}

export function goToDate(key) {
  const date = parseKey(key);
  view = new Date(date.getFullYear(), date.getMonth(), 1);
  selectDate(key);
  render();
}
