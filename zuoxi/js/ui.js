const layer = () => document.querySelector("#uiLayer");

export function toast(message, duration = 2600) {
  const host = layer();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 220);
  }, duration);
}

export function undoBar(message, onUndo, duration = 5000) {
  const host = layer();
  const el = document.createElement("div");
  el.className = "undo-bar";
  el.innerHTML = `<span>${message}</span><button type="button">撤销</button>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector("button").addEventListener("click", () => {
    onUndo();
    close();
  });
  setTimeout(close, duration);
}

export function confirmDialog({ title, message, confirmText = "确定", danger = false }) {
  return new Promise((resolve) => {
    const host = layer();
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button type="button" class="ghost-btn" data-role="cancel">取消</button>
          <button type="button" class="primary-btn ${danger ? "is-danger" : ""}" data-role="ok">${confirmText}</button>
        </div>
      </div>
    `;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    const finish = (result) => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 200);
      resolve(result);
    };
    el.querySelector('[data-role="cancel"]').addEventListener("click", () => finish(false));
    el.querySelector('[data-role="ok"]').addEventListener("click", () => finish(true));
    el.addEventListener("click", (event) => {
      if (event.target === el) finish(false);
    });
  });
}

export function promptDialog({ title, message, placeholder = "", confirmText = "确定" }) {
  return new Promise((resolve) => {
    const host = layer();
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p>${message}</p>
        <input type="text" class="modal-input" placeholder="${placeholder}" />
        <div class="modal-actions">
          <button type="button" class="ghost-btn" data-role="cancel">取消</button>
          <button type="button" class="primary-btn is-danger" data-role="ok">${confirmText}</button>
        </div>
      </div>
    `;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    const input = el.querySelector(".modal-input");
    input.focus();
    const finish = (result) => {
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 200);
      resolve(result);
    };
    el.querySelector('[data-role="cancel"]').addEventListener("click", () => finish(null));
    el.querySelector('[data-role="ok"]').addEventListener("click", () => finish(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(input.value);
      if (event.key === "Escape") finish(null);
    });
    el.addEventListener("click", (event) => {
      if (event.target === el) finish(null);
    });
  });
}
