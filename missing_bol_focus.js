(() => {
  "use strict";

  const state = {
    focusedOnce: false,
    lastCount: null,
    observer: null,
    timer: null,
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindBolNavigation();

    const view = document.getElementById("bolsView");
    if (view && "MutationObserver" in window) {
      state.observer = new MutationObserver(scheduleEvaluate);
      state.observer.observe(view, { childList: true, subtree: true, characterData: true });
    }

    [50, 250, 750, 1500, 3000].forEach((delay) => window.setTimeout(evaluate, delay));
  });

  function bindBolNavigation() {
    const button = document.querySelector('[data-view="bols"]');
    if (!button || button.dataset.bolFocusBound === "true") return;
    button.dataset.bolFocusBound = "true";
    button.addEventListener("click", () => {
      state.focusedOnce = true;
      showBolView();
    });
  }

  function scheduleEvaluate() {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(evaluate, 30);
  }

  function evaluate() {
    bindBolNavigation();

    const view = document.getElementById("bolsView");
    const tbody = document.querySelector("#missingBolTable tbody");
    const message = document.getElementById("missingBolMessage");
    if (!view || !tbody || !message) return;

    const count = tbody.querySelectorAll("tr").length;
    updateNavCount(count);

    const auxiliaryMode = window.VixenAuxiliaryMode;
    if (!auxiliaryMode?.active || state.focusedOnce) return;

    const messageText = (message.textContent || "").trim();
    const settledWithoutRows = /no worksheet|no trip rows|could not|unavailable|not recognized|no xlsx files/i.test(messageText);
    if (count > 0 || settledWithoutRows) {
      state.focusedOnce = true;
      showBolView();
    }
  }

  function showBolView() {
    const target = document.getElementById("bolsView");
    if (!target) return;

    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active-view", view === target);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === "bols");
    });

    const reportingWeek = document.getElementById("reportingWeek");
    if (reportingWeek) reportingWeek.textContent = "Missing BOLs";

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
      document.querySelector("#bolsView .table-search")?.focus({ preventScroll: true });
    });
  }

  function updateNavCount(count) {
    if (state.lastCount === count) return;
    state.lastCount = count;

    const button = document.querySelector('[data-view="bols"]');
    if (!button) return;

    let badge = button.querySelector(".bol-nav-count");
    if (!badge) {
      badge = document.createElement("strong");
      badge.className = "bol-nav-count";
      badge.style.cssText = "margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(255,181,46,.14);border:1px solid rgba(255,181,46,.38);color:var(--amber);font-size:9px;text-align:center";
      button.append(badge);
    }
    badge.textContent = String(count);
    badge.title = `${count} missing BOL trip${count === 1 ? "" : "s"}`;
  }
})();
