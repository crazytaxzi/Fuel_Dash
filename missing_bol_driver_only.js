(() => {
  "use strict";

  const DRIVER_CODE_PATTERN = /^(?:[A-Z]{5}\d|[A-Z]{5,6}|\d{5,6})$/i;
  const focusState = {
    focusedOnce: false,
    lastCount: null,
    timer: null,
  };

  document.addEventListener("DOMContentLoaded", () => {
    applyDriverOnlyMode();
    bindBolNavigation();

    const tbody = document.querySelector("#missingBolTable tbody");
    if (tbody && "MutationObserver" in window) {
      new MutationObserver(() => {
        applyDriverOnlyMode();
        updateSummary();
        scheduleFocusEvaluation();
      }).observe(tbody, { childList: true, subtree: true });
    }

    const message = document.getElementById("missingBolMessage");
    if (message && "MutationObserver" in window) {
      new MutationObserver(() => {
        cleanMessage();
        scheduleFocusEvaluation();
      }).observe(message, { childList: true, subtree: true, characterData: true });
    }

    updateSummary();
    cleanMessage();
    [50, 250, 750, 1500, 3000].forEach((delay) => window.setTimeout(evaluateBolFocus, delay));
  });

  function applyDriverOnlyMode() {
    const search = document.querySelector('#bolsView .table-search');
    if (search) search.placeholder = "Search trip, leader, or driver code...";

    const explainer = document.querySelector("#bolsView .table-explainer");
    if (explainer) {
      explainer.innerHTML = '<strong>Oldest first.</strong> The report is identified by an <code>Unbilled</code> column. The driver code is read directly from <code>Last Dispatched</code>. Truck matching is intentionally disabled for now.';
    }

    if (!document.getElementById("missingBolDriverOnlyStyles")) {
      const style = document.createElement("style");
      style.id = "missingBolDriverOnlyStyles";
      style.textContent = `
        #missingBolTable th:nth-child(5),
        #missingBolTable th:nth-child(6),
        #missingBolTable td:nth-child(5),
        #missingBolTable td:nth-child(6){display:none}
        #missingBolSummary.bol-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
        .bol-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(255,181,46,.14);border:1px solid rgba(255,181,46,.38);color:var(--amber);font-size:9px;text-align:center}
        @media(max-width:900px){#missingBolSummary.bol-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:520px){#missingBolSummary.bol-summary-grid{grid-template-columns:1fr}}
      `;
      document.head.append(style);
    }
  }

  function updateSummary() {
    const summary = document.getElementById("missingBolSummary");
    const rows = [...document.querySelectorAll("#missingBolTable tbody tr")];
    updateNavCount(rows.length);
    if (!summary || !rows.length) return;

    const driverCodes = rows.map((row) => row.cells[3]?.textContent.trim().toUpperCase() || "");
    const recognized = driverCodes.filter((code) => DRIVER_CODE_PATTERN.test(code)).length;
    const missing = rows.length - recognized;
    const dated = rows.filter((row) => {
      const value = row.cells[0]?.textContent.trim() || "";
      return value && !/date not recognized/i.test(value);
    }).length;

    summary.innerHTML = [
      ["Missing BOL trips", rows.length],
      ["Driver codes found", recognized],
      ["Driver codes missing", missing],
      ["Rows with age/date", dated],
    ].map(([label, value]) => `<article class="bol-summary-card"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString("en-US")}</strong></article>`).join("");
  }

  function cleanMessage() {
    const message = document.getElementById("missingBolMessage");
    if (!message) return;
    const cleaned = message.textContent
      .replace(/ and driver-to-truck assignments/gi, "")
      .replace(/Truck numbers are matched[^.]*\./gi, "Driver codes come from Last Dispatched.")
      .replace(/truck match/gi, "driver code");
    if (cleaned !== message.textContent) message.textContent = cleaned;
  }

  function bindBolNavigation() {
    const button = document.querySelector('[data-view="bols"]');
    if (!button || button.dataset.bolFocusBound === "true") return;
    button.dataset.bolFocusBound = "true";
    button.addEventListener("click", () => {
      focusState.focusedOnce = true;
      showBolView();
    });
  }

  function scheduleFocusEvaluation() {
    window.clearTimeout(focusState.timer);
    focusState.timer = window.setTimeout(evaluateBolFocus, 30);
  }

  function evaluateBolFocus() {
    bindBolNavigation();

    const tbody = document.querySelector("#missingBolTable tbody");
    const message = document.getElementById("missingBolMessage");
    if (!tbody || !message) return;

    const count = tbody.querySelectorAll("tr").length;
    updateNavCount(count);

    if (!window.VixenAuxiliaryMode?.active || focusState.focusedOnce) return;

    const messageText = (message.textContent || "").trim();
    const settledWithoutRows = /no worksheet|no trip rows|could not|unavailable|not recognized|no xlsx files/i.test(messageText);
    if (count > 0 || settledWithoutRows) {
      focusState.focusedOnce = true;
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
    if (focusState.lastCount === count) return;
    focusState.lastCount = count;

    const button = document.querySelector('[data-view="bols"]');
    if (!button) return;

    let badge = button.querySelector(".bol-nav-count");
    if (!badge) {
      badge = document.createElement("strong");
      badge.className = "bol-nav-count";
      button.append(badge);
    }
    badge.textContent = String(count);
    badge.title = `${count} missing BOL trip${count === 1 ? "" : "s"}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
