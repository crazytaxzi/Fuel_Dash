(() => {
  "use strict";

  const SELECTION_KEY = "vixenTransitionNoteSelectionV1";
  const COMPLETE_KEY = "vixenWorkedNoteCompletionV2";
  const api = {
    enhanceAll,
    enhanceHistory,
    isIncluded,
    setIncluded,
    isComplete,
    setComplete,
    selectionKey,
    completionKey,
  };
  window.VixenNoteTransitionToggle = api;

  installStyles();
  document.addEventListener("DOMContentLoaded", () => {
    bindHistory("ptaActionNoteHistory", "pta");
    bindHistory("driverActionNoteHistory", "driver");
    enhanceAll();
  });
  window.addEventListener("storage", (event) => {
    if ([SELECTION_KEY, COMPLETE_KEY].includes(event.key)) enhanceAll();
  });

  function bindHistory(historyId, type) {
    const history = document.getElementById(historyId);
    if (!history) return;
    history.addEventListener("change", (event) => {
      const transitionToggle = event.target.closest?.("[data-transition-note-toggle]");
      if (transitionToggle) {
        setIncluded(type, transitionToggle.dataset.noteId, transitionToggle.checked);
        updateTransitionLabel(transitionToggle);
        return;
      }
      const completeToggle = event.target.closest?.("[data-complete-note-toggle]");
      if (completeToggle) {
        setComplete(type, completeToggle.dataset.noteId, completeToggle.checked);
        updateCompleteLabel(completeToggle);
        window.VixenWorkedWorkflow?.render?.();
      }
    });
    history.addEventListener("click", (event) => {
      const selector = type === "pta" ? "[data-pta-note-delete]" : "[data-driver-note-delete]";
      const deleteButton = event.target.closest?.(selector);
      if (!deleteButton) return;
      const noteId = type === "pta" ? deleteButton.dataset.ptaNoteDelete : deleteButton.dataset.driverNoteDelete;
      cleanupNoteState(type, noteId);
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
      entry.querySelector(".transition-note-choice")?.remove();
      let row = entry.querySelector(".note-state-controls");
      if (!row) {
        row = document.createElement("div");
        row.className = "note-state-controls";
        row.innerHTML = `
          <label class="note-state-choice note-transition-choice">
            <input type="checkbox" data-transition-note-toggle data-note-id="${escapeAttribute(noteId)}" />
            <span class="note-state-switch"><i></i></span><b></b>
          </label>
          <label class="note-state-choice note-complete-choice">
            <input type="checkbox" data-complete-note-toggle data-note-id="${escapeAttribute(noteId)}" />
            <span class="note-state-switch"><i></i></span><b></b>
          </label>`;
        entry.append(row);
      }
      const transitionToggle = row.querySelector("[data-transition-note-toggle]");
      transitionToggle.dataset.noteId = noteId;
      transitionToggle.checked = isIncluded(type, noteId);
      updateTransitionLabel(transitionToggle);
      const completeToggle = row.querySelector("[data-complete-note-toggle]");
      completeToggle.dataset.noteId = noteId;
      completeToggle.checked = isComplete(type, noteId);
      updateCompleteLabel(completeToggle);
    });
  }

  function selectionKey(type, noteId) {
    return `${type}:${String(noteId ?? "").trim()}`;
  }

  function completionKey(type, noteId) {
    return `${type}:${String(noteId ?? "").trim()}`;
  }

  function isIncluded(type, noteId, selections = readObject(SELECTION_KEY)) {
    if (!noteId) return false;
    return selections[selectionKey(type, noteId)] === true;
  }

  function setIncluded(type, noteId, included) {
    return setBooleanState(SELECTION_KEY, selectionKey(type, noteId), included);
  }

  function isComplete(type, noteId, completions = readObject(COMPLETE_KEY)) {
    if (!noteId) return false;
    const value = completions[completionKey(type, noteId)];
    return value === true || Boolean(value?.completedAt);
  }

  function setComplete(type, noteId, complete) {
    const id = String(noteId ?? "").trim();
    if (!id) return false;
    const values = readObject(COMPLETE_KEY);
    const key = completionKey(type, id);
    if (complete) values[key] = { completedAt: new Date().toISOString() };
    else delete values[key];
    return writeObject(COMPLETE_KEY, values);
  }

  function setBooleanState(storageKey, key, enabled) {
    if (!key || /:$/.test(key)) return false;
    const values = readObject(storageKey);
    if (enabled) values[key] = true;
    else delete values[key];
    return writeObject(storageKey, values);
  }

  function cleanupNoteState(type, noteId) {
    const id = String(noteId ?? "").trim();
    if (!id) return;
    const selections = readObject(SELECTION_KEY);
    delete selections[selectionKey(type, id)];
    writeObject(SELECTION_KEY, selections);
    const completions = readObject(COMPLETE_KEY);
    delete completions[completionKey(type, id)];
    writeObject(COMPLETE_KEY, completions);
    window.setTimeout(() => window.VixenWorkedWorkflow?.render?.(), 0);
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeObject(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function updateTransitionLabel(toggle) {
    const label = toggle.closest(".note-state-choice")?.querySelector("b");
    if (label) label.textContent = toggle.checked ? "Included in transition" : "Not in transition";
  }

  function updateCompleteLabel(toggle) {
    const label = toggle.closest(".note-state-choice")?.querySelector("b");
    if (label) label.textContent = toggle.checked ? "Follow-up complete" : "Follow-up open";
  }

  function installStyles() {
    if (document.getElementById("transitionNoteToggleStyles")) return;
    const style = document.createElement("style");
    style.id = "transitionNoteToggleStyles";
    style.textContent = `
      .note-state-controls{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid rgba(148,163,184,.16)}
      .note-state-choice{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}.note-state-choice input{position:absolute;opacity:0;pointer-events:none}
      .note-state-switch{position:relative;width:38px;height:20px;border-radius:999px;background:#25313a;border:1px solid #475569;transition:.18s}.note-state-switch i{position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#94a3b8;transition:.18s}
      .note-state-choice b{font-size:10px;color:#94a3b8;font-weight:800;white-space:nowrap}
      .note-transition-choice input:checked+.note-state-switch{background:rgba(34,197,94,.28);border-color:#4ade80}.note-transition-choice input:checked+.note-state-switch i{left:21px;background:#86efac;box-shadow:0 0 10px rgba(74,222,128,.55)}.note-transition-choice input:checked~b{color:#86efac}
      .note-complete-choice input:checked+.note-state-switch{background:rgba(14,165,233,.3);border-color:#38bdf8}.note-complete-choice input:checked+.note-state-switch i{left:21px;background:#7dd3fc;box-shadow:0 0 10px rgba(56,189,248,.6)}.note-complete-choice input:checked~b{color:#7dd3fc}
    `;
    document.head.append(style);
  }

  function escapeAttribute(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
