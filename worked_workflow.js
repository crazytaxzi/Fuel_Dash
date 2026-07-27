(() => {
  "use strict";

  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const COMPLETE_KEY = "vixenWorkedNoteCompletionV2";
  const ONE_HOUR_MS = 3600000;

  const api = {
    render: renderWorkedView,
    collectWorkedItems,
    completionState,
    setNoteComplete,
    noteStateKey,
    latestNote,
    normalizeKey,
    buildTransition,
  };
  window.VixenWorkedWorkflow = api;

  installUi();
  installStyles();

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    removeLegacyCompletionControls();
    window.setTimeout(removeUnusedOverviewCards, 0);
    window.setTimeout(renderWorkedView, 0);
    window.setInterval(renderWorkedView, 30000);
  });

  function installUi() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="worked"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "worked";
      button.innerHTML = '<span>✓</span><span>Worked</span><strong class="worked-nav-count">0</strong>';
      const pta = nav.querySelector('[data-view="pta"]');
      if (pta) pta.insertAdjacentElement("afterend", button);
      else nav.append(button);
    }

    if (!document.getElementById("workedView")) {
      const section = document.createElement("section");
      section.id = "workedView";
      section.className = "view table-view";
      section.innerHTML = `
        <div class="view-heading">
          <div><span class="eyebrow">ACTION NOTE FOLLOW-UP</span><h2>Worked</h2></div>
          <div class="worked-legend" aria-label="Worked status legend">
            <span class="worked-legend-open">Recent</span>
            <span class="worked-legend-overdue">Needs follow-up</span>
            <span class="worked-legend-done">Complete</span>
          </div>
        </div>
        <div class="table-explainer"><strong>At a glance:</strong> every saved note is tracked separately. Recent unfinished notes stay yellow for one hour, older unfinished notes turn red, and notes marked complete in their popup turn blue.</div>
        <div id="workedEmptyState" class="worked-empty-state">No PTA or driver follow-up notes have been saved yet.</div>
        <div id="workedList" class="worked-list"></div>`;
      const exceptions = document.getElementById("exceptionsView");
      if (exceptions) exceptions.insertAdjacentElement("beforebegin", section);
      else document.querySelector(".main-panel")?.append(section);
    }
  }

  function removeLegacyCompletionControls() {
    document.querySelectorAll(".worked-complete-row,#ptaWorkedCompleteToggle,#driverWorkedCompleteToggle").forEach((element) => {
      const row = element.closest?.(".worked-complete-row");
      (row || element).remove?.();
    });
  }

  function installStyles() {
    if (document.getElementById("workedWorkflowStyles")) return;
    const style = document.createElement("style");
    style.id = "workedWorkflowStyles";
    style.textContent = `
      .worked-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.35);color:#7dd3fc;font-size:9px;text-align:center}
      .worked-legend{display:flex;gap:7px;flex-wrap:wrap}.worked-legend span{padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
      .worked-legend-open{color:#fbbf24;background:rgba(251,191,36,.11);border:1px solid rgba(251,191,36,.4)}
      .worked-legend-overdue{color:#fb7185;background:rgba(244,63,94,.11);border:1px solid rgba(244,63,94,.4)}
      .worked-legend-done{color:#7dd3fc;background:rgba(14,165,233,.12);border:1px solid rgba(56,189,248,.45)}
      .worked-empty-state{padding:34px 22px;border:1px dashed rgba(125,211,252,.3);background:rgba(14,165,233,.04);color:var(--muted);text-align:center}
      .worked-list{display:grid;gap:10px}.worked-card{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:13px;align-items:center;padding:15px 17px;border:1px solid rgba(251,191,36,.4);background:linear-gradient(110deg,rgba(251,191,36,.12),rgba(7,14,20,.94));color:var(--white);text-align:left;cursor:pointer;transition:.18s ease}
      .worked-card:hover{transform:translateX(3px)}.worked-card-overdue{border-color:rgba(244,63,94,.58);background:linear-gradient(110deg,rgba(244,63,94,.15),rgba(24,8,14,.94))}.worked-card-done{border-color:rgba(56,189,248,.62);background:linear-gradient(110deg,rgba(14,165,233,.18),rgba(6,18,29,.95))}
      .worked-card-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;color:#111827;background:#fbbf24;font-weight:950}.worked-card-overdue .worked-card-icon{color:#fff;background:#f43f5e}.worked-card-done .worked-card-icon{color:#06121d;background:#38bdf8}
      .worked-card-copy{min-width:0}.worked-card-copy strong,.worked-card-copy small,.worked-card-copy em{display:block}.worked-card-copy strong{font-size:14px}.worked-card-copy small{margin-top:3px;color:var(--muted);font-size:10px}.worked-card-copy em{margin-top:8px;color:#fde68a;font-size:12px;font-style:normal;white-space:pre-wrap;overflow-wrap:anywhere}.worked-card-overdue .worked-card-copy em{color:#fda4af}.worked-card-done .worked-card-copy em{color:#bae6fd}
      .worked-card-time{font-size:10px;font-weight:900;white-space:nowrap;color:#fbbf24}.worked-card-overdue .worked-card-time{color:#fb7185}.worked-card-done .worked-card-time{color:#7dd3fc}
      .worked-note-focus{outline:2px solid #7dd3fc;outline-offset:3px}
      .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width:760px){.worked-card{grid-template-columns:38px minmax(0,1fr)}.worked-card-time{grid-column:2}.kpi-grid{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      if (event.target.closest("#savePtaActionNoteBtn,#saveDriverActionNoteBtn,[data-pta-note-delete],[data-driver-note-delete]")) {
        window.setTimeout(renderWorkedView, 0);
      }
      const card = event.target.closest("[data-worked-type]");
      if (card) openWorkedPopup(card);
    });

    window.addEventListener("storage", (event) => {
      if ([PTA_NOTES_KEY, DRIVER_NOTES_KEY, COMPLETE_KEY].includes(event.key)) renderWorkedView();
    });
  }

  function removeUnusedOverviewCards() {
    ["kpiModeledSavings", "kpiAnnualExposure"].forEach((id) => document.getElementById(id)?.closest(".kpi-card")?.remove());
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

  function normalizeKey(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "UNKNOWN";
  }

  function noteStateKey(type, noteId) {
    return `${type}:${String(noteId ?? "").trim()}`;
  }

  function latestNote(notes) {
    if (!Array.isArray(notes)) return null;
    return notes
      .map((note) => ({ ...note, time: new Date(note?.savedAt).getTime() }))
      .filter((note) => Number.isFinite(note.time))
      .sort((a, b) => b.time - a.time)[0] || null;
  }

  function completionState(type, note, completions = readObject(COMPLETE_KEY)) {
    const noteId = String(note?.id ?? "").trim();
    if (!noteId) return { done: false, completedAt: null };
    const key = noteStateKey(type, noteId);
    if (!Object.prototype.hasOwnProperty.call(completions, key)) return { done: true, completedAt: null };
    const value = completions[key];
    if (value === false || value?.complete === false) return { done: false, completedAt: null };
    const completedAt = value === true ? null : value?.completedAt || null;
    return { done: value === true || value?.complete === true || Boolean(completedAt), completedAt };
  }

  function setNoteComplete(type, noteId, complete) {
    const id = String(noteId ?? "").trim();
    if (!id) return false;
    const completions = readObject(COMPLETE_KEY);
    const key = noteStateKey(type, id);
    if (complete) completions[key] = { complete: true, completedAt: new Date().toISOString() };
    else completions[key] = { complete: false, completedAt: null };
    const saved = writeObject(COMPLETE_KEY, completions);
    if (saved) renderWorkedView();
    return saved;
  }

  function collectWorkedItems(
    now = Date.now(),
    ptaNotes = readObject(PTA_NOTES_KEY),
    driverNotes = readObject(DRIVER_NOTES_KEY),
    completions = readObject(COMPLETE_KEY),
  ) {
    const items = [];

    Object.entries(ptaNotes || {}).forEach(([truck, notes]) => {
      (Array.isArray(notes) ? notes : []).forEach((rawNote) => {
        const time = new Date(rawNote?.savedAt).getTime();
        const noteId = String(rawNote?.id ?? "").trim();
        if (!Number.isFinite(time) || !noteId) return;
        const note = { ...rawNote, time };
        items.push({
          type: "pta",
          identity: truck,
          noteId,
          label: `Truck ${truck}`,
          meta: [note.driver || "No driver", note.destination || "No destination"].join(" · "),
          note,
          done: completionState("pta", note, completions).done,
        });
      });
    });

    Object.entries(driverNotes || {}).forEach(([key, notes]) => {
      (Array.isArray(notes) ? notes : []).forEach((rawNote) => {
        const time = new Date(rawNote?.savedAt).getTime();
        const noteId = String(rawNote?.id ?? "").trim();
        if (!Number.isFinite(time) || !noteId) return;
        const note = { ...rawNote, time };
        const identity = note.driverCode || key || note.driverName;
        items.push({
          type: "driver",
          identity,
          noteId,
          label: note.driverName || note.driverCode || key || "Unknown driver",
          meta: `High-idle follow-up${note.driverCode ? ` · ${note.driverCode}` : ""}`,
          note,
          done: completionState("driver", note, completions).done,
        });
      });
    });

    return items
      .map((item) => ({ ...item, overdue: !item.done && now - item.note.time > ONE_HOUR_MS }))
      .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.overdue) - Number(a.overdue) || b.note.time - a.note.time);
  }

  function renderWorkedView() {
    const list = document.getElementById("workedList");
    const empty = document.getElementById("workedEmptyState");
    if (!list || !empty) return;
    const items = collectWorkedItems();
    empty.classList.toggle("hidden", items.length > 0);
    list.innerHTML = items.map((item) => {
      const ageMinutes = Math.max(0, Math.floor((Date.now() - item.note.time) / 60000));
      const stateClass = item.done ? "worked-card-done" : item.overdue ? "worked-card-overdue" : "";
      const stateLabel = item.done ? "Complete" : item.overdue ? "Needs follow-up" : `${Math.max(1, 60 - ageMinutes)} min left`;
      return `<button class="worked-card ${stateClass}" type="button" data-worked-type="${item.type}" data-worked-identity="${escapeHtml(item.identity)}" data-worked-note-id="${escapeHtml(item.noteId)}">
        <span class="worked-card-icon">${item.done ? "✓" : item.overdue ? "!" : "•"}</span>
        <span class="worked-card-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)} · ${formatAge(item.note.time)}</small><em>${escapeHtml(item.note.text || "No note text")}</em></span>
        <span class="worked-card-time">${escapeHtml(stateLabel)}</span>
      </button>`;
    }).join("");
    const badge = document.querySelector('[data-view="worked"] .worked-nav-count');
    if (badge) badge.textContent = String(items.filter((item) => !item.done).length);
  }

  function formatAge(time) {
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago`;
  }

  function findNote(type, noteId) {
    const groups = readObject(type === "pta" ? PTA_NOTES_KEY : DRIVER_NOTES_KEY);
    for (const [identity, values] of Object.entries(groups)) {
      const note = (Array.isArray(values) ? values : []).find((entry) => String(entry?.id ?? "") === String(noteId));
      if (note) return { identity, note };
    }
    return null;
  }

  function openWorkedPopup(card) {
    const type = card.dataset.workedType;
    const identity = normalizeKey(card.dataset.workedIdentity);
    const noteId = card.dataset.workedNoteId || "";
    if (type === "pta") {
      const triggers = [...document.querySelectorAll("[data-pta-index]")];
      const trigger = triggers.find((element) => normalizeKey(element.closest("tr,.pta-overview-row,.pta-pulse-row")?.textContent).includes(identity));
      if (trigger) {
        trigger.click();
        return window.setTimeout(() => focusNoteInPopup("pta", noteId), 0);
      }
      return document.querySelector('[data-view="pta"]')?.click();
    }

    const found = findNote("driver", noteId);
    const name = normalizeKey(found?.note?.driverName);
    const triggers = [...document.querySelectorAll("[data-driver-index]")];
    const trigger = triggers.find((element) => {
      const rowText = normalizeKey(element.closest("tr,.driver-rank-row,.driver-list-row")?.textContent);
      return rowText.includes(identity) || (name && rowText.includes(name));
    });
    if (trigger) {
      trigger.click();
      return window.setTimeout(() => focusNoteInPopup("driver", noteId), 0);
    }
    document.querySelector('[data-view="drivers"]')?.click();
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

  function buildTransition(...args) {
    return window.VixenTransitionExport?.buildTransition?.(...args) || "SHIFT TRANSITION\r\nPrepared: transition exporter unavailable\r\n";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
