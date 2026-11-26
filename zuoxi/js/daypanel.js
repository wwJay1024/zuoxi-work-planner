import { state, update, dayOf, sortItems, makeItem, parseKey, WEEKDAYS } from "./store.js";
import { undoBar } from "./ui.js";

let headEl;
let listEl;
let editingId = null;
let draftActive = false;
let lastKey = null;

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemHtml(item) {
  if (item.id === editingId) {
    return `
      <div class="day-item is-editing" data-id="${item.id}">
        <span class="check"></span>
        <input class="day-edit" data-edit-id="${item.id}" value="${escapeAttr(item.title)}" />
      </div>
    `;
  }
  return `
    <div class="day-item${item.done ? " is-done" : ""}" data-id="${item.id}">
      <button type="button" class="check" data-act="toggle" aria-label="完成"></button>
      <div class="day-item-body">
        ${item.time ? `<span class="day-time">${item.time}</span>` : ""}
        <span class="day-title" data-act="edit">${escapeAttr(item.title)}</span>
      </div>
      <button type="button" class="row-del" data-act="delete" aria-label="删除">×</button>
    </div>
  `;
}

function bindDraft(input) {
  let finished = false;
  const key = state.meta.selectedDate;

  const commit = (keepOpen) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (!value) {
      draftActive = false;
      renderList();
      return;
    }
    draftActive = keepOpen;
    update("calendar", () => {
      dayOf(key).items.push(makeItem(value));
    });
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(true);
    }
    if (event.key === "Escape") {
      finished = true;
      draftActive = false;
      renderList();
    }
  });
  input.addEventListener("blur", () => commit(false));
}

function bindEdit(input, id) {
  let finished = false;
  const key = state.meta.selectedDate;

  const commit = (save) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    editingId = null;
    if (!save || !value) {
      renderList();
      return;
    }
    update("calendar", () => {
      const item = dayOf(key).items.find((entry) => entry.id === id);
      if (item) {
        item.title = value;
        item.updatedAt = new Date().toISOString();
      }
    });
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(true);
    }
    if (event.key === "Escape") commit(false);
  });
  input.addEventListener("blur", () => commit(true));
}

function renderList() {
  const key = state.meta.selectedDate;
  const items = sortItems(dayOf(key).items);
  const open = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done);

  const draftHtml = draftActive
    ? `<div class="day-item is-editing" data-draft="1"><span class="check"></span><input class="day-edit" data-draft-input /></div>`
    : "";

  listEl.innerHTML = draftHtml + open.map(itemHtml).join("") + done.map(itemHtml).join("");

  const draftInput = listEl.querySelector("[data-draft-input]");
  if (draftInput) {
    draftInput.focus();
    bindDraft(draftInput);
  }

  const editInput = listEl.querySelector("[data-edit-id]");
  if (editInput) {
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
    bindEdit(editInput, editInput.dataset.editId);
  }
}

export function render() {
  const key = state.meta.selectedDate;
  const date = parseKey(key);

  if (key !== lastKey) {
    lastKey = key;
    draftActive = false;
    editingId = null;
  }

  headEl.innerHTML = `
    <h2>${date.getMonth() + 1} 月 ${date.getDate()} 日 星期${WEEKDAYS[date.getDay()]}</h2>
    <button type="button" class="icon-btn day-add" data-act="add" aria-label="新增事项">＋</button>
  `;

  renderList();
}

export function init(container) {
  container.classList.add("day-card");
  container.innerHTML = `
    <div class="day-head" data-ref="head"></div>
    <div class="day-list" data-ref="list"></div>
  `;
  headEl = container.querySelector('[data-ref="head"]');
  listEl = container.querySelector('[data-ref="list"]');

  headEl.addEventListener("click", (event) => {
    if (!event.target.closest('[data-act="add"]')) return;
    draftActive = true;
    renderList();
  });

  listEl.addEventListener("click", (event) => {
    const row = event.target.closest(".day-item");
    if (!row || row.dataset.draft) return;
    const id = row.dataset.id;
    const key = state.meta.selectedDate;
    const action = event.target.closest("[data-act]");
    if (!action) return;

    if (action.dataset.act === "toggle") {
      update("calendar", () => {
        const item = dayOf(key).items.find((entry) => entry.id === id);
        if (item) {
          item.done = !item.done;
          item.updatedAt = new Date().toISOString();
        }
      });
    } else if (action.dataset.act === "edit") {
      editingId = id;
      renderList();
    } else if (action.dataset.act === "delete") {
      const day = dayOf(key);
      const index = day.items.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const removed = day.items[index];
      update("calendar", () => {
        day.items.splice(index, 1);
      });
      undoBar("已删除一条事项", () => {
        update("calendar", () => {
          dayOf(key).items.splice(index, 0, removed);
        });
      });
    }
  });
}
