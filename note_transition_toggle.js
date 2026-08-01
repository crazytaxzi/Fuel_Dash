(() => {
  "use strict";

  const SELECTION_KEY = "vixenTransitionNoteSelectionV1";
  const COMPLETE_KEY = "vixenWorkedNoteCompletionV2";
  const OBSERVER_OPTIONS = { childList: true, subtree: true };
  const api = { enhanceAll, enhanceHistory, isIncluded, setIncluded, isComplete, setComplete, selectionKey, completionKey };
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
    if (!history || history.dataset.noteActionsBound === "true") return;
    history.dataset.noteActionsBound = "true";
    history.addEventListener("click", (event) => {
      const action = event.target.closest?.("[data-note-action]");
      if (action) {
        event.preventDefault();
        const noteId = action.dataset.noteId;
        if (action.dataset.noteAction === "finish-handoff") {
          if (isComplete(type, noteId)) return;
          setIncluded(type, noteId, true);
          setComplete(type, noteId, true);
        } else if (action.dataset.noteAction === "finish-only") {
          if (isComplete(type, noteId)) return;
          setIncluded(type, noteId, false);
          setComplete(type, noteId, true);
        } else if (action.dataset.noteAction === "reopen") {
          setComplete(type, noteId, false);
        } else if (action.dataset.noteAction === "handoff") {
          setIncluded(type, noteId, !isIncluded(type, noteId));
        }
        enhanceHistory(history, type);
        window.VixenWorkedWorkflow?.render?.();
        return;
      }
      const selector = type === "pta" ? "[data-pta-note-delete]" : "[data-driver-note-delete]";
      const deleteButton = event.target.closest?.(selector);
      if (!deleteButton) return;
      cleanupNoteState(type, type === "pta" ? deleteButton.dataset.ptaNoteDelete : deleteButton.dataset.driverNoteDelete);
    });

    enhanceHistory(history, type);
    let refreshing = false;
    const observer = new MutationObserver(() => {
      if (refreshing) return;
      refreshing = true;
      observer.disconnect();
      try { enhanceHistory(history, type); }
      finally { observer.observe(history, OBSERVER_OPTIONS); refreshing = false; }
    });
    observer.observe(history, OBSERVER_OPTIONS);
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
      entry.querySelector(".note-state-controls")?.remove();
      const row = document.createElement("div");
      row.className = "note-flow-actions";
      const done = isComplete(type, noteId);
      const included = isIncluded(type, noteId);
      row.innerHTML = done
        ? `<span class="note-flow-status">✓ Completed</span>
           <button type="button" data-note-action="handoff" data-note-id="${escapeAttribute(noteId)}" class="note-flow-button note-handoff ${included ? "active" : ""}">${included ? "✉ In handoff" : "＋ Add to handoff"}</button>
           <button type="button" data-note-action="reopen" data-note-id="${escapeAttribute(noteId)}" class="note-flow-button note-reopen">↶ Reopen</button>`
        : `<span class="note-flow-status open">Open follow-up</span>
           <button type="button" data-note-action="finish-only" data-note-id="${escapeAttribute(noteId)}" class="note-flow-button note-finish-only">Finish only</button>
           <button type="button" data-note-action="finish-handoff" data-note-id="${escapeAttribute(noteId)}" class="note-flow-button note-finish">✓ Finish + handoff</button>`;
      entry.append(row);
    });
  }

  function selectionKey(type, noteId) { return `${type}:${String(noteId ?? "").trim()}`; }
  function completionKey(type, noteId) { return selectionKey(type, noteId); }
  function isIncluded(type, noteId, selections = readObject(SELECTION_KEY)) { return Boolean(noteId) && selections[selectionKey(type, noteId)] === true; }
  function setIncluded(type, noteId, included) { return setBooleanState(SELECTION_KEY, selectionKey(type, noteId), included); }
  function isComplete(type, noteId, completions = readObject(COMPLETE_KEY)) {
    if (!noteId) return false;
    const value = completions[completionKey(type, noteId)];
    if (!value || value === false || value?.complete === false) return false;
    return value === true || value?.complete === true || Boolean(value?.completedAt);
  }
  function setComplete(type, noteId, complete) {
    const id = String(noteId ?? "").trim();
    if (!id) return false;
    const values = readObject(COMPLETE_KEY);
    values[completionKey(type, id)] = complete ? { complete: true, completedAt: new Date().toISOString() } : { complete: false, completedAt: null };
    return writeObject(COMPLETE_KEY, values);
  }
  function setBooleanState(storageKey, key, enabled) {
    if (!key || /:$/.test(key)) return false;
    const values = readObject(storageKey);
    if (enabled) values[key] = true; else delete values[key];
    return writeObject(storageKey, values);
  }
  function cleanupNoteState(type, noteId) {
    const id = String(noteId ?? "").trim();
    if (!id) return;
    const selections = readObject(SELECTION_KEY); delete selections[selectionKey(type, id)]; writeObject(SELECTION_KEY, selections);
    const completions = readObject(COMPLETE_KEY); delete completions[completionKey(type, id)]; writeObject(COMPLETE_KEY, completions);
    window.setTimeout(() => window.VixenWorkedWorkflow?.render?.(), 0);
  }
  function readObject(key) {
    try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  }
  function writeObject(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function escapeAttribute(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function installStyles() {
    if (document.getElementById("transitionNoteToggleStyles")) return;
    const style = document.createElement("style");
    style.id = "transitionNoteToggleStyles";
    style.textContent = `
      .note-flow-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid rgba(148,163,184,.16)}
      .note-flow-status{margin-right:auto;color:#7dd3fc;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.note-flow-status.open{color:#fbbf24}
      .note-flow-button{padding:7px 9px;border-radius:7px;font-size:9px;font-weight:900;cursor:pointer}.note-finish{border:1px solid #4ade80;background:rgba(34,197,94,.18);color:#86efac}.note-finish-only{border:1px solid rgba(148,163,184,.25);background:transparent;color:#94a3b8}.note-handoff{border:1px solid rgba(148,163,184,.25);background:transparent;color:#94a3b8}.note-handoff.active{border-color:rgba(74,222,128,.45);background:rgba(34,197,94,.1);color:#86efac}.note-reopen{border:1px solid rgba(56,189,248,.4);background:rgba(14,165,233,.1);color:#7dd3fc}
    `;
    document.head.append(style);
  }
})();
