import { state, dayOf, dateKey, parseKey, formatClock, formatDuration, minutesOfDay, update, flush } from "./store.js";
import { toast } from "./ui.js";

const MAX_BREAK = 2 * 60 * 60;
const RULE_TICK = 5000;
const SUSPEND_MIN = 60 * 1000;
const SUSPEND_LONG = 30 * 60 * 1000;
const SILENCE_MIN = 10 * 60 * 1000;

const runtime = () => state.runtime.sitting;
const settings = () => state.settings.sitting;

let refs = {};
let lastRuleCheck = 0;
let pendingSnoozeMinutes = 0;
let lastTickWall = 0;
let lastTickMono = 0;

function nowMs() {
  return Date.now();
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function continuousSeconds(at = nowMs()) {
  const st = runtime();
  if (st.status !== "working" || !st.workingStartAt) return 0;
  return Math.max(0, (at - Date.parse(st.workingStartAt)) / 1000);
}

function restingSeconds(at = nowMs()) {
  const st = runtime();
  if (st.status !== "resting" || !st.restStartAt) return 0;
  return Math.max(0, (at - Date.parse(st.restStartAt)) / 1000);
}

export function todaySittingSeconds(at = nowMs()) {
  const st = runtime();
  return dayOf(st.dayKey).sittingSeconds + continuousSeconds(at);
}

export function todayBreakSeconds(at = nowMs()) {
  const st = runtime();
  return dayOf(st.dayKey).breakSeconds + Math.min(restingSeconds(at), MAX_BREAK);
}

function settleRange(key, status, startIso, endMs) {
  if (!startIso) return;
  const day = dayOf(key);
  const startMs = Date.parse(startIso);
  const dayEnd = parseKey(key);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const end = Math.min(endMs, dayEnd.getTime());
  const seconds = Math.max(0, (end - startMs) / 1000);
  if (seconds <= 0) return;
  if (status === "working") day.sittingSeconds += seconds;
  if (status === "resting") day.breakSeconds += Math.min(seconds, MAX_BREAK);
}

function settleInto(key, endMs) {
  const st = runtime();
  if (st.status === "working") settleRange(key, "working", st.workingStartAt, endMs);
  if (st.status === "resting") settleRange(key, "resting", st.restStartAt, endMs);
}

function scheduleNextReminder(at = nowMs()) {
  const minutes = Math.max(5, Number(settings().intervalMinutes) || 45);
  runtime().nextReminderAt = iso(at + minutes * 60000);
}

export function startWork() {
  const st = runtime();
  const now = nowMs();

  if (st.status === "resting" && st.restStartAt) {
    const rest = (now - Date.parse(st.restStartAt)) / 1000;
    dayOf(st.dayKey).breakSeconds += Math.min(rest, MAX_BREAK);
    st.restStartAt = null;
  }

  st.workingStartAt = iso(now);
  st.status = "working";
  st.dayKey = dateKey();
  st.ignoredCount = 0;
  scheduleNextReminder(now);
  update("sitting", () => {});
}

export function goRest() {
  const st = runtime();
  if (st.status !== "working") return;
  const now = nowMs();
  if (st.workingStartAt) {
    const seconds = Math.max(0, (now - Date.parse(st.workingStartAt)) / 1000);
    dayOf(st.dayKey).sittingSeconds += seconds;
  }
  st.workingStartAt = null;
  st.status = "resting";
  st.restStartAt = iso(now);
  st.nextReminderAt = null;
  st.ignoredCount = 0;
  hideReminder();
  update("sitting", () => {});
}

export function stopWork() {
  const st = runtime();
  if (st.status === "idle") return;
  settleInto(st.dayKey, nowMs());
  st.status = "idle";
  st.workingStartAt = null;
  st.restStartAt = null;
  st.nextReminderAt = null;
  st.ignoredCount = 0;
  hideReminder();
  update("sitting", () => {});
}

export function snooze() {
  const st = runtime();
  const minutes = pendingSnoozeMinutes;
  if (!minutes) return;
  st.nextReminderAt = iso(nowMs() + minutes * 60000);
  st.ignoredCount += 1;
  hideReminder();
  update("sitting", () => {});
  toast(`${minutes} 分钟后再提醒你`);
}

export function settleOnLoad() {
  const st = runtime();
  if (!st.lastSeenAt) return;
  const now = nowMs();
  const seen = Date.parse(st.lastSeenAt);
  const gap = now - seen;
  if (!Number.isFinite(gap) || gap < 60000) return;

  if (st.status !== "idle" && gap >= SUSPEND_LONG) {
    settleInto(st.dayKey, seen);
    resetSession(st);
    st.lastSeenAt = iso(now);
    toast(`上次计时在 ${clockLabel(seen)} 结束`);
    flush();
    return;
  }

  if (st.status === "working" && st.workingStartAt) {
    st.workingStartAt = iso(Math.min(now, Date.parse(st.workingStartAt) + gap));
    if (st.nextReminderAt) {
      st.nextReminderAt = iso(Math.min(now + 3600000, Date.parse(st.nextReminderAt) + gap));
    }
  } else if (st.status === "resting" && st.restStartAt) {
    st.restStartAt = iso(Math.min(now, Date.parse(st.restStartAt) + gap));
  }

  if (gap >= 10 * 60000 && st.status !== "idle") {
    toast(`上次计时已结算到 ${clockLabel(seen)}`);
  }
  st.lastSeenAt = iso(now);
  flush();
}

export function markSeen() {
  runtime().lastSeenAt = iso(nowMs());
  flush();
}

function clockLabel(ms) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function resetSession(st) {
  st.status = "idle";
  st.workingStartAt = null;
  st.restStartAt = null;
  st.nextReminderAt = null;
  st.ignoredCount = 0;
  st.dayKey = dateKey();
  hideReminder();
}

function handleSuspend(gapMs) {
  const st = runtime();
  if (st.status === "idle") return;

  const resumeAt = nowMs();
  const sleepStart = Math.max(resumeAt - gapMs, Date.parse(st.workingStartAt || st.restStartAt || iso(resumeAt)));

  if (gapMs >= SUSPEND_LONG) {
    settleInto(st.dayKey, sleepStart);
    resetSession(st);
    toast(`上次计时在 ${clockLabel(sleepStart)} 结束`);
    flush();
    update("sitting", () => {});
    return;
  }

  if (st.status === "working" && st.workingStartAt) {
    settleRange(st.dayKey, "working", st.workingStartAt, sleepStart);
    st.workingStartAt = iso(resumeAt);
    scheduleNextReminder(resumeAt);
  } else if (st.status === "resting" && st.restStartAt) {
    settleRange(st.dayKey, "resting", st.restStartAt, sleepStart);
    st.restStartAt = iso(resumeAt);
  }
  flush();
  update("sitting", () => {});
}

function detectSuspend() {
  const wall = nowMs();
  const mono = performance.now();
  if (!lastTickWall) {
    lastTickWall = wall;
    lastTickMono = mono;
    return;
  }
  const wallDelta = wall - lastTickWall;
  const monoDelta = mono - lastTickMono;
  lastTickWall = wall;
  lastTickMono = mono;
  if (wallDelta <= 0) return;

  const drift = wallDelta - monoDelta;
  const silence = wallDelta >= SILENCE_MIN ? wallDelta - 60000 : 0;
  const gap = Math.max(drift >= SUSPEND_MIN ? drift : 0, silence);
  if (gap <= 0) return;
  handleSuspend(gap);
}

export function checkRollover() {
  const st = runtime();
  const today = dateKey();
  if (st.dayKey === today) return false;

  settleInto(st.dayKey, nowMs());
  resetSession(st);
  update("rollover", () => {});
  return true;
}

function withinWindow(minutes, startHHMM, endHHMM) {
  const start = minutesOfDay(startHHMM);
  const end = minutesOfDay(endHHMM);
  if (start <= end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function blockedByFilters(date) {
  const config = settings();
  if (!config.workdays.includes(date.getDay())) return true;
  if (!config.lunchBreak.enabled) return false;
  return withinWindow(date.getHours() * 60 + date.getMinutes(), config.lunchBreak.start, config.lunchBreak.end);
}

function fire() {
  const st = runtime();
  const at = nowMs();
  scheduleNextReminder(at);
  flush();
  const minutes = Math.floor(continuousSeconds(at) / 60);
  showReminder(minutes);
  notifyDesktop(minutes);
}

function maybeRemind() {
  const st = runtime();
  if (st.status !== "working") return;
  if (isReminderVisible()) return;
  if (!st.nextReminderAt) {
    scheduleNextReminder();
    return;
  }
  if (nowMs() < Date.parse(st.nextReminderAt)) return;
  if (blockedByFilters(new Date())) return;
  fire();
}

function showReminder(minutes) {
  if (!refs.overlay) return;
  const text = minutes >= 60 ? `你已经连续坐了 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `你已经连续坐了 ${minutes} 分钟`;
  refs.overlayText.textContent = text;
  pendingSnoozeMinutes = runtime().ignoredCount === 0 ? settings().snoozeMinutes : settings().intervalMinutes;
  refs.snooze.textContent = `${pendingSnoozeMinutes} 分钟后再提醒`;
  refs.overlay.classList.add("is-visible");
  refs.overlay.setAttribute("aria-hidden", "false");
}

function isReminderVisible() {
  return Boolean(refs.overlay && refs.overlay.classList.contains("is-visible"));
}

export function hideReminder() {
  if (!refs.overlay) return;
  refs.overlay.classList.remove("is-visible");
  refs.overlay.setAttribute("aria-hidden", "true");
}

function notifyDesktop(minutes) {
  if (!settings().desktopNotification) return;
  if (!document.hidden) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("该休息一下了", { body: `已经连续坐了 ${minutes} 分钟，起来走两步`, tag: "zuoxi-sitting" });
  } catch {
    /* 浏览器不支持时忽略 */
  }
}

function updateDisplay() {
  if (!refs.timer) return;
  const st = runtime();
  const at = nowMs();
  refs.card.dataset.status = st.status;

  if (st.status === "resting") {
    refs.restOverlay.classList.add("is-visible");
    refs.restOverlay.setAttribute("aria-hidden", "false");
    refs.restTimer.textContent = formatClock(restingSeconds(at));
  } else {
    refs.restOverlay.classList.remove("is-visible");
    refs.restOverlay.setAttribute("aria-hidden", "true");
  }

  if (st.status === "working") {
    refs.label.textContent = "当前连续久坐";
    refs.timer.textContent = formatClock(continuousSeconds(at));
    refs.action.textContent = "去休息";
    refs.action.dataset.action = "rest";
  } else if (st.status === "resting") {
    refs.label.textContent = "当前已休息";
    refs.timer.textContent = formatClock(restingSeconds(at));
    refs.action.textContent = "开始工作";
    refs.action.dataset.action = "start";
  } else {
    refs.label.textContent = "当前连续久坐";
    refs.timer.textContent = "00:00:00";
    refs.action.textContent = "开始工作";
    refs.action.dataset.action = "start";
  }

  refs.stop.hidden = st.status === "idle";
  refs.todaySitting.textContent = formatDuration(todaySittingSeconds(at));
  refs.todayBreak.textContent = formatDuration(todayBreakSeconds(at));
}

export function init(container) {
  container.classList.add("sitting-card");
  container.innerHTML = `
    <div class="sitting-head">
      <span class="sitting-label" data-ref="label">当前连续久坐</span>
      <span class="card-title">久坐计时</span>
    </div>
    <div class="sitting-timer" data-ref="timer">00:00:00</div>
    <div class="sitting-stats">
      <div><span>今日久坐</span><b data-ref="todaySitting">0 分钟</b></div>
      <div><span>今日休息</span><b data-ref="todayBreak">0 分钟</b></div>
    </div>
    <div class="sitting-actions">
      <button type="button" class="primary-btn sitting-action" data-ref="action" data-action="start">开始工作</button>
      <button type="button" class="ghost-btn sitting-stop" data-ref="stop" hidden>结束</button>
    </div>
  `;

  refs = {
    card: container,
    label: container.querySelector('[data-ref="label"]'),
    timer: container.querySelector('[data-ref="timer"]'),
    todaySitting: container.querySelector('[data-ref="todaySitting"]'),
    todayBreak: container.querySelector('[data-ref="todayBreak"]'),
    action: container.querySelector('[data-ref="action"]'),
    stop: container.querySelector('[data-ref="stop"]'),
    overlay: document.querySelector("#reminderOverlay"),
    overlayText: document.querySelector("#reminderText"),
    snooze: document.querySelector("#reminderSnooze"),
    restOverlay: document.querySelector("#restOverlay"),
    restTimer: document.querySelector("#restTimer"),
  };

  refs.action.addEventListener("click", () => {
    if (runtime().status === "working") goRest();
    else startWork();
  });
  refs.stop.addEventListener("click", () => stopWork());
  document.querySelector("#reminderRest").addEventListener("click", () => goRest());
  document.querySelector("#restBack").addEventListener("click", () => startWork());
  refs.snooze.addEventListener("click", () => snooze());

  pendingSnoozeMinutes = settings().snoozeMinutes;
  updateDisplay();
}

export function refresh() {
  updateDisplay();
}

export function tick() {
  detectSuspend();
  checkRollover();
  updateDisplay();
  const at = nowMs();
  if (at - lastRuleCheck >= RULE_TICK) {
    lastRuleCheck = at;
    maybeRemind();
  }
}

export function initRuleClock() {
  lastRuleCheck = nowMs();
  lastTickWall = nowMs();
  lastTickMono = performance.now();
}
