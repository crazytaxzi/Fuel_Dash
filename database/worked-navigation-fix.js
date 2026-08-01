(() => {
  "use strict";

  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const PTA_FILTER_ORDER = ["all", "action", "overdue", "available", "dispatched"];
  const INSTALL_FLAG = "workedNavigationFixInstalled";

  install();

  function install() {
    const root = document.documentElement;
    if (!root || root.dataset[INSTALL_FLAG] === "true") return;
    root.dataset[INSTALL_FLAG] = "true";
    document.addEventListener("click", handleWorkedClick, true);
    installStyles();
    window.VixenWorkedNavigationFix = {
      openWorkedEntry,
      findNote,
      normalizeKey,
    };
  }

  function handleWorkedClick(event) {
    const openButton = event.target?.closest?.(".worked-card-open");
    if (!openButton) return;
    const card = openButton.closest("[data-worked-type]");
    if (!card || !card.closest("#workedList")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openWorkedEntry(card);
  }

  function openWorkedEntry(card) {
    const type = card.dataset.workedType;
    const identity = normalizeKey(card.dataset.workedIdentity);
    const noteId = card.dataset.workedNoteId || "";

    if (type === "pta" && openCurrentPta(identity, noteId)) return true;
    if (type === "driver" && openCurrentDriver(identity, noteId)) return true;

    openHistoricalNote(type, noteId, identity);
    return false;
  }

  function openCurrentPta(identity, noteId) {
    let trigger = findPtaTrigger(identity);
    if (trigger) {
      trigger.click();
      window.setTimeout(() => focusNoteInPopup("pta", noteId), 0);
      return true;
    }

    const activeFilter = document.querySelector("[data-pta-filter].active")?.dataset.ptaFilter || "";
    for (const filter of PTA_FILTER_ORDER) {
      const filterButton = document.querySelector(`[data-pta-filter="${filter}"]`);
      if (!filterButton) continue;
      filterButton.click();
      trigger = findPtaTrigger(identity);
      if (!trigger) continue;

      trigger.click();
      restorePtaFilter(activeFilter, filter);
      window.setTimeout(() => focusNoteInPopup("pta", noteId), 0);
      return true;
    }

    restorePtaFilter(activeFilter, "");
    return false;
  }

  function restorePtaFilter(activeFilter, currentFilter) {
    if (!activeFilter || activeFilter === currentFilter) return;
    document.querySelector(`[data-pta-filter="${activeFilter}"]`)?.click();
  }

  function findPtaTrigger(identity) {
    if (!identity || identity === "UNKNOWN") return null;
    return [...document.querySelectorAll("[data-pta-index]")].find((element) => ptaIdentityForTrigger(element) === identity) || null;
  }

  function ptaIdentityForTrigger(element) {
    const row = element.closest("tr,.pta-overview-row,.pta-pulse-row");
    if (!row) return "";
    const truckCell = row.matches("tr")
      ? row.querySelector("td:nth-child(2) strong,td:nth-child(2)")
      : row.querySelector("strong");
    const truckText = truckCell?.firstChild?.textContent || truckCell?.textContent || "";
    return normalizeKey(truckText);
  }

  function openCurrentDriver(identity, noteId) {
    const found = findNote("driver", noteId);
    const driverName = normalizeKey(found?.note?.driverName);
    const driverCode = normalizeKey(found?.note?.driverCode);
    const trigger = [...document.querySelectorAll("[data-driver-index]")].find((element) => {
      const row = element.closest("tr,.mini-row,.driver-rank-row,.driver-list-row") || element;
      const rowText = normalizeKey(row.textContent);
      return [identity, driverName, driverCode].filter((value) => value && value !== "UNKNOWN").some((value) => rowText.includes(value));
    });

    if (!trigger) return false;
    trigger.click();
    window.setTimeout(() => focusNoteInPopup("driver", noteId), 0);
    return true;
  }

  function focusNoteInPopup(type, noteId) {
    const attribute = type === "pta" ? "ptaNoteDelete" : "driverNoteDelete";
    const selector = type === "pta" ? "[data-pta-note-delete]" : "[data-driver-note-delete]";
    const button = [...document.querySelectorAll(selector)].find((element) => element.dataset?.[attribute] === noteId);
    const entry = button?.closest(".pta-action-note-entry");
    if (!entry) return;
    entry.scrollIntoView?.({ block: "center", behavior: "smooth" });
    entry.classList.add("worked-note-focus");
    window.setTimeout(() => entry.classList.remove("worked-note-focus"), 1800);
  }

  function findNote(type, noteId) {
    const groups = readObject(type === "pta" ? PTA_NOTES_KEY : DRIVER_NOTES_KEY);
    for (const [identity, values] of Object.entries(groups)) {
      const note = (Array.isArray(values) ? values : []).find((entry) => String(entry?.id ?? "") === String(noteId));
      if (note) return { identity, note };
    }
    return null;
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function openHistoricalNote(type, noteId, fallbackIdentity) {
    const found = findNote(type, noteId);
    const note = found?.note || {};
    const identity = found?.identity || fallbackIdentity || "Unknown";
    const dialog = ensureHistoryDialog();
    const title = type === "pta"
      ? `Truck ${identity}`
      : note.driverName || note.driverCode || identity || "Driver follow-up";
    const savedAt = formatDateTime(note.savedAt);
    const details = type === "pta"
      ? [note.driver, note.destination, note.status, note.planStatus].filter(Boolean)
      : [note.driverCode, note.idlePct ? `Idle ${note.idlePct}` : "", note.status].filter(Boolean);

    dialog.querySelector("[data-worked-history-title]").textContent = title;
    dialog.querySelector("[data-worked-history-meta]").textContent = [savedAt, ...details].filter(Boolean).join(" · ");
    dialog.querySelector("[data-worked-history-note]").textContent = note.text || "The saved note could not be found.";
    dialog.querySelector("[data-worked-history-context]").textContent = type === "pta"
      ? "This truck is not in the currently rendered PTA rows, so the saved follow-up is shown directly instead of dumping you back on the dispatch tab."
      : "This driver is not in the currently rendered driver rows, so the saved follow-up is shown directly.";

    const complete = dialog.querySelector("[data-worked-history-complete]");
    const state = window.VixenWorkedWorkflow?.completionState?.(type, note) || { done: false };
    complete.checked = Boolean(state.done);
    complete.disabled = !noteId;
    complete.onchange = () => {
      window.VixenWorkedWorkflow?.setNoteComplete?.(type, noteId, complete.checked);
    };

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function ensureHistoryDialog() {
    let dialog = document.getElementById("workedHistoryFallbackDialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "workedHistoryFallbackDialog";
    dialog.className = "worked-history-dialog";
    dialog.innerHTML = `
      <div class="worked-history-shell">
        <div class="worked-history-heading">
          <div>
            <span class="eyebrow">SAVED FOLLOW-UP</span>
            <h2 data-worked-history-title>Worked entry</h2>
            <small data-worked-history-meta></small>
          </div>
          <button type="button" class="worked-history-close" aria-label="Close saved follow-up">×</button>
        </div>
        <p class="worked-history-context" data-worked-history-context></p>
        <div class="worked-history-note" data-worked-history-note></div>
        <label class="worked-history-complete"><input type="checkbox" data-worked-history-complete> Mark this follow-up complete</label>
        <div class="worked-history-actions"><button type="button" class="action-pill worked-history-done">Done</button></div>
      </div>`;

    const close = () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    };
    dialog.querySelector(".worked-history-close").addEventListener("click", close);
    dialog.querySelector(".worked-history-done").addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    document.body.append(dialog);
    return dialog;
  }

  function installStyles() {
    if (document.getElementById("workedNavigationFixStyles")) return;
    const style = document.createElement("style");
    style.id = "workedNavigationFixStyles";
    style.textContent = `
      .worked-history-dialog{width:min(680px,calc(100vw - 28px));padding:0;border:1px solid rgba(125,211,252,.45);border-radius:16px;background:#071018;color:var(--white);box-shadow:0 24px 80px rgba(0,0,0,.65)}
      .worked-history-dialog::backdrop{background:rgba(0,0,0,.7);backdrop-filter:blur(3px)}
      .worked-history-shell{padding:22px}.worked-history-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.worked-history-heading h2{margin:4px 0 3px}.worked-history-heading small{color:var(--muted)}
      .worked-history-close{border:0;background:transparent;color:var(--muted);font-size:28px;line-height:1;cursor:pointer}.worked-history-context{margin:18px 0 10px;color:var(--muted);font-size:12px;line-height:1.55}
      .worked-history-note{min-height:90px;padding:16px;border:1px solid rgba(125,211,252,.28);background:rgba(14,165,233,.08);white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}
      .worked-history-complete{display:flex;gap:9px;align-items:center;margin-top:16px;font-size:12px;font-weight:800}.worked-history-actions{display:flex;justify-content:flex-end;margin-top:18px}
    `;
    document.head.append(style);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Saved time unavailable" : date.toLocaleString();
  }

  function normalizeKey(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "UNKNOWN";
  }
})();
