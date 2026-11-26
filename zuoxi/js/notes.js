import { state, update, NOTE_COLORS } from "./store.js";

let container;
let input;
let colorBtn;
let palette;

function applyColor(color) {
  container.dataset.color = color;
  colorBtn.dataset.color = color;
}

export function render(force = false) {
  if (!input) return;
  if (force || document.activeElement !== input) input.value = state.note.content || "";
  applyColor(state.note.color);
}

export function init(el) {
  container = el;
  container.classList.add("notes-card");
  container.innerHTML = `
    <div class="sticky-head">
      <span class="card-title">便签</span>
      <button type="button" class="sticky-color" data-act="color" aria-label="便签颜色"></button>
    </div>
    <textarea class="sticky-input" spellcheck="false"></textarea>
    <div class="sticky-colors" hidden>
      ${NOTE_COLORS.map((color) => `<button type="button" class="swatch" data-pick="${color}" data-color="${color}"></button>`).join("")}
    </div>
  `;

  input = container.querySelector(".sticky-input");
  colorBtn = container.querySelector(".sticky-color");
  palette = container.querySelector(".sticky-colors");

  input.addEventListener("input", () => {
    update("note", (draft) => {
      draft.note.content = input.value;
      draft.note.updatedAt = new Date().toISOString();
    });
  });

  colorBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    palette.hidden = !palette.hidden;
  });

  palette.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-pick]");
    if (!swatch) return;
    event.stopPropagation();
    update("note", (draft) => {
      draft.note.color = swatch.dataset.pick;
    });
    palette.hidden = true;
  });

  document.addEventListener("click", (event) => {
    if (palette.hidden) return;
    if (container.contains(event.target)) return;
    palette.hidden = true;
  });

  render();
}
