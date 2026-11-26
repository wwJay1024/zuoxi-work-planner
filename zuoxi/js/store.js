const KEY = "zuoxi.state.v1";
const VERSION = 1;
const SAVE_DELAY = 300;

export const NOTE_COLORS = ["yellow", "green", "blue", "pink", "purple", "gray"];
export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(key, days) {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function newId() {
  return Math.random().toString(16).slice(2, 10);
}

export function defaultSittingSettings() {
  return {
    intervalMinutes: 45,
    snoozeMinutes: 20,
    lunchBreak: { enabled: true, start: "12:00", end: "13:30" },
    workdays: [1, 2, 3, 4, 5],
    desktopNotification: false,
  };
}

export function defaultRuntime() {
  return {
    sitting: {
      status: "idle",
      workingStartAt: null,
      restStartAt: null,
      lastSeenAt: null,
      nextReminderAt: null,
      ignoredCount: 0,
      dayKey: dateKey(),
    },
  };
}

export function emptyDay() {
  return { items: [], sittingSeconds: 0, breakSeconds: 0 };
}

export function emptyNote() {
  return { content: "", color: "yellow", updatedAt: null };
}

export function defaultState() {
  const now = new Date().toISOString();
  return {
    version: VERSION,
    settings: { sitting: defaultSittingSettings() },
    runtime: defaultRuntime(),
    days: {},
    note: emptyNote(),
    meta: { createdAt: now, lastOpenedAt: now, selectedDate: dateKey() },
  };
}

function numberOr(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSettings(raw) {
  const base = defaultSittingSettings();
  if (!raw || typeof raw !== "object") return base;
  const lunch = raw.lunchBreak && typeof raw.lunchBreak === "object" ? raw.lunchBreak : {};
  const workdays = Array.isArray(raw.workdays) ? raw.workdays.filter((day) => [0, 1, 2, 3, 4, 5, 6].includes(day)) : base.workdays;
  return {
    intervalMinutes: numberOr(raw.intervalMinutes, base.intervalMinutes, 5, 180),
    snoozeMinutes: numberOr(raw.snoozeMinutes, base.snoozeMinutes, 1, 120),
    lunchBreak: {
      enabled: Boolean(lunch.enabled ?? base.lunchBreak.enabled),
      start: /^\d{2}:\d{2}$/.test(lunch.start) ? lunch.start : base.lunchBreak.start,
      end: /^\d{2}:\d{2}$/.test(lunch.end) ? lunch.end : base.lunchBreak.end,
    },
    workdays: workdays.length ? workdays : base.workdays,
    desktopNotification: Boolean(raw.desktopNotification),
  };
}

function normalizeRuntime(raw) {
  const base = defaultRuntime().sitting;
  if (!raw || typeof raw !== "object") return base;
  const status = ["idle", "sitting", "working", "resting"].includes(raw.status)
    ? raw.status === "sitting"
      ? "working"
      : raw.status
    : "idle";
  return {
    status,
    workingStartAt: typeof raw.workingStartAt === "string" ? raw.workingStartAt : null,
    restStartAt: typeof raw.restStartAt === "string" ? raw.restStartAt : null,
    lastSeenAt: typeof raw.lastSeenAt === "string" ? raw.lastSeenAt : null,
    nextReminderAt: typeof raw.nextReminderAt === "string" ? raw.nextReminderAt : null,
    ignoredCount: Number.isFinite(raw.ignoredCount) ? raw.ignoredCount : 0,
    dayKey: typeof raw.dayKey === "string" ? raw.dayKey : dateKey(),
  };
}

function migrateNote(raw) {
  if (raw.note && typeof raw.note === "object") {
    return {
      content: String(raw.note.content ?? ""),
      color: NOTE_COLORS.includes(raw.note.color) ? raw.note.color : "yellow",
      updatedAt: raw.note.updatedAt || null,
    };
  }
  if (Array.isArray(raw.notes) && raw.notes.length) {
    const content = raw.notes
      .map((item) => String(item?.content ?? "").trim())
      .filter(Boolean)
      .join("\n");
    const withColor = raw.notes.find((item) => NOTE_COLORS.includes(item?.color));
    return { content, color: withColor ? withColor.color : "yellow", updatedAt: null };
  }
  return emptyNote();
}

function hydrate(raw) {
  const base = defaultState();
  if (!raw || raw.version !== VERSION) return base;
  return {
    version: VERSION,
    settings: { sitting: normalizeSettings(raw.settings?.sitting) },
    runtime: { sitting: normalizeRuntime(raw.runtime?.sitting) },
    days: raw.days && typeof raw.days === "object" ? raw.days : {},
    note: migrateNote(raw),
    meta: { ...base.meta, ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}) },
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return hydrate(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export let state = read();

const listeners = new Set();
let saveTimer = null;

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("保存失败", error);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    write();
  }, SAVE_DELAY);
}

export function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  write();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(reason) {
  for (const listener of listeners) listener(reason);
}

export function update(reason, mutate) {
  mutate(state);
  scheduleSave();
  emit(reason);
}

export function reset() {
  clearTimeout(saveTimer);
  saveTimer = null;
  state = defaultState();
  write();
  emit("reset");
}

export function dayOf(key) {
  if (!state.days[key]) state.days[key] = emptyDay();
  const day = state.days[key];
  if (!Array.isArray(day.items)) day.items = [];
  if (typeof day.sittingSeconds !== "number") day.sittingSeconds = 0;
  if (typeof day.breakSeconds !== "number") day.breakSeconds = 0;
  return day;
}

export function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
}

export function parseItemInput(text) {
  const trimmed = text.trim();
  const matched = trimmed.match(/^(\d{1,2})[:：](\d{2})\s+(.+)$/);
  if (!matched) return { title: trimmed, time: null };
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour > 23 || minute > 59) return { title: trimmed, time: null };
  return { time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, title: matched[3].trim() };
}

export function makeItem(text) {
  const parsed = parseItemInput(text);
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: parsed.title,
    time: parsed.time,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分钟`;
  if (safe > 0) return `${safe} 秒`;
  return "0 分钟";
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
