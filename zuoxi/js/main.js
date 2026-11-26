import * as store from "./store.js";
import * as calendar from "./calendar.js";
import * as daypanel from "./daypanel.js";
import * as sitting from "./sitting.js";
import * as notes from "./notes.js";
import * as settings from "./settings.js";

function boot() {
  sitting.init(document.querySelector("#sittingCard"));
  calendar.init({
    grid: document.querySelector("#calendarGrid"),
    title: document.querySelector("#monthTitle"),
  });
  daypanel.init(document.querySelector("#dayCard"));
  notes.init(document.querySelector("#notesCard"));
  settings.init();

  sitting.settleOnLoad();
  sitting.initRuleClock();
  sitting.checkRollover();

  store.subscribe((reason) => {
    const full = reason === "demo" || reason === "rollover" || reason === "reset";
    if (full || reason === "calendar" || reason === "select") {
      calendar.render();
      daypanel.render();
    }
    if (full || reason === "note") notes.render(reason === "reset");
    if (full || reason === "sitting" || reason === "settings") sitting.refresh();
  });

  calendar.render();
  daypanel.render();
  notes.render();
  sitting.refresh();

  setInterval(() => sitting.markSeen(), 30000);
  setInterval(() => sitting.tick(), 1000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sitting.tick();
  });
  window.addEventListener("pagehide", () => {
    sitting.markSeen();
    store.flush();
  });
}

boot();
