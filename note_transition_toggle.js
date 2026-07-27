(() => {
  "use strict";

  const SELECTION_KEY = "vixenTransitionNoteSelectionV1";
  const api = { enhanceAll, enhanceHistory, isIncluded, setIncluded, selectionKey };
  window.VixenNoteTransitionToggle = api;

  installStyles();
  document.addEventListener("DOMContentLoaded", () => {
    bindHistory("ptaActionNoteHistory", "pta");
    bindHistory("driverActionNoteHistory", "driver");
    enhanceAll();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === SELECTION_KEY) enhanceAll();
  });

  function bindHistory(historyId, type) {
    const history = document.getElementById(historyId);
    if (!history) return;
    history.addEventListener("change", (event) => {
      const toggle = event.target.closest?.("[data-transition-note-toggle]");
      if (!toggle) return;
      setIncluded(type, toggle.dataset.noteId, toggle.checked);
      updateLabel(toggle);
    });
    new MutationObserver(() => enhanceHistory(history, type)).observe(history, { childList: true, subtree: true });
    enhanceHistory(history, type);
  }

  function enhanceAll() {
    const pta = document.getElementById("ptaActionNoteHistory");
    const driver = document.getElementById("driverActionNoteHistory");
    if (pta) enhanceHistory(pta, "pta");
    if (driver) enhanceHistory(driver, "driver");
  }

  function enhanceHistory(history, type) {
    const selector = type === "pta" ? "[data-pta-note-delete]" : "[data-driver-note-delete]";
    history.querySelectorAll(selector).forEach((deleteButton) => {
      const noteId = type === "pta" ? deleteButton.dataset.ptaNoteDelete : deleteButton.dataset.driverNoteDelete;
      const entry = deleteButton.closest(".pta-action-note-entry");
      if (!entry || !noteId) return;
      let row = entry.querySelector(".transition-note-choice");
      if (!row) {
        row = document.createElement("label");
        row.className = "transition-note-choice";
        row.innerHTML = `<input type="checkbox" data-transition-note-toggle data-note-id="${escapeAttribute(noteId)}" /><span class="transition-note-switch"><i></i></span><b></b>`;
        entry.append(row);
      }
      const toggle = row.querySelector("[data-transition-note-toggle]");
      toggle.dataset.noteId = noteId;
      toggle.checked = isIncluded(type, noteId);
      updateLabel(toggle);
    });
  }

  function selectionKey(type, noteId) {
    return `${type}:${String(noteId ?? "").trim()}`;
  }

  function isIncluded(type, noteId, selections = readSelections()) {
    if (!noteId) return false;
    return selections[selectionKey(type, noteId)] === true;
  }

  function setIncluded(type, noteId, included) {
    if (!noteId) return false;
    const selections = readSelections();
    const key = selectionKey(type, noteId);
    if (included) selections[key] = true;
    else delete selections[key];
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selections));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readSelections() {
    try {
      const value = JSON.parse(localStorage.getItem(SELECTION_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function updateLabel(toggle) {
    const label = toggle.closest(".transition-note-choice")?.querySelector("b");
    if (label) label.textContent = toggle.checked ? "Included in shift transition" : "Not included in shift transition";
  }

  function installStyles() {
    if (document.getElementById("transitionNoteToggleStyles")) return;
    const style = document.createElement("style");
    style.id = "transitionNoteToggleStyles";
    style.textContent = `
      .transition-note-choice{display:flex;align-items:center;gap:9px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(148,163,184,.16);cursor:pointer;user-select:none}
      .transition-note-choice input{position:absolute;opacity:0;pointer-events:none}
      .transition-note-switch{position:relative;width:38px;height:20px;border-radius:999px;background:#25313a;border:1px solid #475569;transition:.18s}
      .transition-note-switch i{position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#94a3b8;transition:.18s}
      .transition-note-choice input:checked+.transition-note-switch{background:rgba(34,197,94,.28);border-color:#4ade80}
      .transition-note-choice input:checked+.transition-note-switch i{left:21px;background:#86efac;box-shadow:0 0 10px rgba(74,222,128,.55)}
      .transition-note-choice b{font-size:10px;color:#94a3b8;font-weight:800}
      .transition-note-choice input:checked~b{color:#86efac}
    `;
    document.head.append(style);
  }

  function escapeAttribute(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
