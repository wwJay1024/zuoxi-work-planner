import { state, update, dayOf, dateKey, shiftKey, makeItem, reset, WEEKDAYS } from "./store.js";
import { promptDialog, toast } from "./ui.js";

let drawer;
let body;

function section(title, inner) {
  return `<section class="setting-section"><h3>${title}</h3>${inner}</section>`;
}

function row(label, control, hint = "") {
  return `<label class="setting-row"><span class="setting-label">${label}${hint ? `<em>${hint}</em>` : ""}</span>${control}</label>`;
}

function render() {
  const config = state.settings.sitting;
  const lunchOff = !config.lunchBreak.enabled;

  body.innerHTML = `
    ${section(
      "久坐提醒",
      [
        row("固定间隔", `<span class="setting-inline"><input type="number" min="5" max="180" step="5" data-field="intervalMinutes" value="${config.intervalMinutes}"><span class="unit">分钟</span></span>`),
        row("忽略后再提醒", `<span class="setting-inline"><input type="number" min="1" max="120" step="5" data-field="snoozeMinutes" value="${config.snoozeMinutes}"><span class="unit">分钟</span></span>`, "只在第一次忽略后生效一次"),
        row("午休静默", `<input type="checkbox" data-field="lunchEnabled" ${config.lunchBreak.enabled ? "checked" : ""}>`),
        row(
          "午休时段",
          `<span class="setting-inline"><input type="time" data-field="lunchStart" value="${config.lunchBreak.start}" ${lunchOff ? "disabled" : ""}><span class="unit">至</span><input type="time" data-field="lunchEnd" value="${config.lunchBreak.end}" ${lunchOff ? "disabled" : ""}></span>`,
        ),
        row(
          "提醒日",
          `<span class="weekday-picker">${[1, 2, 3, 4, 5, 6, 0]
            .map((day) => `<button type="button" class="weekday${config.workdays.includes(day) ? " is-on" : ""}" data-weekday="${day}">${WEEKDAYS[day]}</button>`)
            .join("")}</span>`,
        ),
        row("桌面通知", `<input type="checkbox" data-field="desktopNotification" ${config.desktopNotification ? "checked" : ""}>`, "需浏览器授权"),
      ].join(""),
    )}
    ${section(
      "数据",
      `<div class="setting-actions">
        <button type="button" class="ghost-btn" data-action="demo">载入示例数据</button>
        <button type="button" class="ghost-btn is-danger" data-action="clear">清空全部数据</button>
      </div>`,
    )}
  `;
}

function handleChange(event) {
  const field = event.target.dataset.field;
  if (!field) return;
  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;

  update("settings", (draft) => {
    const config = draft.settings.sitting;
    switch (field) {
      case "intervalMinutes":
        config.intervalMinutes = Math.min(180, Math.max(5, Number(value) || 45));
        break;
      case "snoozeMinutes":
        config.snoozeMinutes = Math.min(120, Math.max(1, Number(value) || 20));
        break;
      case "lunchEnabled":
        config.lunchBreak.enabled = value;
        break;
      case "lunchStart":
        config.lunchBreak.start = value;
        break;
      case "lunchEnd":
        config.lunchBreak.end = value;
        break;
      case "desktopNotification":
        config.desktopNotification = value;
        break;
      default:
        break;
    }
  });

  if (field === "lunchEnabled") render();
  if (field === "desktopNotification" && value && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function toggleWeekday(day) {
  update("settings", (draft) => {
    const list = draft.settings.sitting.workdays;
    if (list.length === 1 && list[0] === day) return;
    const index = list.indexOf(day);
    if (index >= 0) list.splice(index, 1);
    else list.push(day);
  });
}

function loadDemo() {
  const today = dateKey();
  const titles = [
    ["09:30 周会", 0],
    ["整理季度数据", 0],
    ["评审新版原型", 0],
    ["对接接口联调", 1],
    ["写月度总结", 2],
    ["和设计对需求", 3],
    ["提交报销", 3],
    ["准备演示材料", 5],
    ["客户拜访", 7],
    ["复盘上周问题", -2],
    ["更新项目排期", -3],
    ["整理会议记录", -1],
  ];
  update("demo", (draft) => {
    for (const [text, offset] of titles) {
      dayOf(shiftKey(today, offset)).items.push(makeItem(text));
    }
    for (let i = 6; i >= 1; i -= 1) {
      const day = dayOf(shiftKey(today, -i));
      if (day.sittingSeconds === 0) day.sittingSeconds = 3600 * 4 + i * 900;
      if (day.breakSeconds === 0) day.breakSeconds = 1800 + i * 120;
    }
    draft.note.content = "报销单还没交\n周五前把排期发出去\n问一下服务器扩容的事";
    draft.note.color = "yellow";
  });
  toast("示例数据已载入");
  close();
}

async function clearAll() {
  const answer = await promptDialog({
    title: "清空全部数据",
    message: "所有日程、便签和久坐记录都会被删除。输入「清空」确认。",
    placeholder: "清空",
    confirmText: "删除",
  });
  if (answer !== "清空") return;
  reset();
  close();
  toast("数据已清空");
}

export function open() {
  render();
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
}

export function close() {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

export function init() {
  drawer = document.querySelector("#settingsDrawer");
  body = drawer.querySelector(".drawer-body");

  drawer.addEventListener("change", handleChange);
  drawer.addEventListener("click", (event) => {
    const weekday = event.target.closest("[data-weekday]");
    if (weekday) {
      toggleWeekday(Number(weekday.dataset.weekday));
      render();
      return;
    }
    const action = event.target.closest("[data-action]");
    if (action) {
      if (action.dataset.action === "demo") loadDemo();
      if (action.dataset.action === "clear") clearAll();
      return;
    }
    if (event.target.closest("[data-close]")) close();
  });

  document.querySelector("#openSettings").addEventListener("click", open);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}
