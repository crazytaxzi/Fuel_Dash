(() => {
  "use strict";

  const DRIVER_CODE_PATTERN = /^(?:[A-Z]{5}\d|[A-Z]{5,6}|\d{5,6})$/i;

  document.addEventListener("DOMContentLoaded", () => {
    applyDriverOnlyMode();

    const tbody = document.querySelector("#missingBolTable tbody");
    if (tbody && "MutationObserver" in window) {
      new MutationObserver(() => {
        applyDriverOnlyMode();
        updateSummary();
      }).observe(tbody, { childList: true, subtree: true });
    }

    const message = document.getElementById("missingBolMessage");
    if (message && "MutationObserver" in window) {
      new MutationObserver(cleanMessage).observe(message, { childList: true, subtree: true, characterData: true });
    }

    updateSummary();
    cleanMessage();
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
        @media(max-width:900px){#missingBolSummary.bol-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:520px){#missingBolSummary.bol-summary-grid{grid-template-columns:1fr}}
      `;
      document.head.append(style);
    }
  }

  function updateSummary() {
    const summary = document.getElementById("missingBolSummary");
    const rows = [...document.querySelectorAll("#missingBolTable tbody tr")];
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
