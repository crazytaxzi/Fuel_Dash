(() => {
  "use strict";

  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const COMPLETE_KEY = "vixenWorkedCompletionV1";
  const ONE_HOUR_MS = 3600000;

  const api = {
    render: renderWorkedView,
    buildTransition,
    latestNote,
    completionState,
    normalizeKey,
  };
  window.VixenWorkedWorkflow = api;

  installUi();
  installStyles();

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
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
        <div class="table-explainer"><strong>At a glance:</strong> recent notes are yellow for one hour, unfinished older notes turn red, and items marked complete in their popup turn blue. A new note reopens the item automatically.</div>
        <div id="workedEmptyState" class="worked-empty-state">No PTA or driver follow-up notes have been saved yet.</div>
        <div id="workedList" class="worked-list"></div>`;
      const exceptions = document.getElementById("exceptionsView");
      if (exceptions) exceptions.insertAdjacentElement("beforebegin", section);
      else document.querySelector(".main-panel")?.append(section);
    }

    installModalToggle("ptaModal", "ptaWorkedCompleteToggle", "Truck follow-up complete");
    installModalToggle("driverModal", "driverWorkedCompleteToggle", "Driver follow-up complete");
  }

  function installModalToggle(modalId, toggleId, labelText) {
    const modal = document.getElementById(modalId);
    if (!modal || document.getElementById(toggleId)) return;
    const notePanel = modal.querySelector(".pta-action-note-panel");
    if (!notePanel) return;
    const wrapper = document.createElement("div");
    wrapper.className = "worked-complete-row";
    wrapper.innerHTML = `
      <div><strong>Follow-up status</strong><small>Blue items are finished unless a newer note is added.</small></div>
      <label class="worked-toggle" for="${toggleId}">
        <input id="${toggleId}" type="checkbox" />
        <span class="worked-toggle-track"><i></i></span>
        <b>${escapeHtml(labelText)}</b>
      </label>`;
    notePanel.insertAdjacentElement("afterbegin", wrapper);
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
      .worked-complete-row{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px;padding:13px 14px;border:1px solid rgba(56,189,248,.3);background:rgba(14,165,233,.06)}.worked-complete-row>div strong,.worked-complete-row>div small{display:block}.worked-complete-row>div small{margin-top:3px;color:var(--muted);font-size:10px}
      .worked-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none}.worked-toggle input{position:absolute;opacity:0;pointer-events:none}.worked-toggle-track{position:relative;width:42px;height:22px;border-radius:999px;background:#28343d;border:1px solid #4b5b66;transition:.18s}.worked-toggle-track i{position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#94a3b8;transition:.18s}.worked-toggle input:checked+.worked-toggle-track{background:rgba(14,165,233,.35);border-color:#38bdf8}.worked-toggle input:checked+.worked-toggle-track i{left:23px;background:#7dd3fc;box-shadow:0 0 12px rgba(56,189,248,.65)}.worked-toggle b{font-size:10px;color:#cbd5e1;white-space:nowrap}.worked-toggle input:checked~b{color:#7dd3fc}
      .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width:760px){.worked-card{grid-template-columns:38px minmax(0,1fr)}.worked-card-time{grid-column:2}.worked-complete-row{align-items:flex-start;flex-direction:column}.kpi-grid{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function bindEvents() {
    document.getElementById("exportTransitionBtn")?.addEventListener("click", interceptTransitionExport, true);
    document.getElementById("ptaWorkedCompleteToggle")?.addEventListener("change", () => saveModalCompletion("pta"));
    document.getElementById("driverWorkedCompleteToggle")?.addEventListener("change", () => saveModalCompletion("driver"));

    document.addEventListener("click", (event) => {
      if (event.target.closest("#savePtaActionNoteBtn,#saveDriverActionNoteBtn,[data-pta-note-delete],[data-driver-note-delete]")) {
        window.setTimeout(renderWorkedView, 0);
        window.setTimeout(syncOpenModalToggles, 0);
      }
      const card = event.target.closest("[data-worked-type]");
      if (card) openWorkedPopup(card);
    });

    ["ptaModal", "driverModal"].forEach((id) => {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.addEventListener("toggle", syncOpenModalToggles);
      new MutationObserver(syncOpenModalToggles).observe(modal, { attributes: true, attributeFilter: ["open"] });
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

  function latestNote(notes) {
    if (!Array.isArray(notes)) return null;
    return notes
      .map((note) => ({ ...note, time: new Date(note?.savedAt).getTime() }))
      .filter((note) => Number.isFinite(note.time))
      .sort((a, b) => b.time - a.time)[0] || null;
  }

  function completionState(type, identity, note, completions = readObject(COMPLETE_KEY)) {
    if (!note) return { done: false, completedAt: null };
    const key = `${type}:${normalizeKey(identity)}`;
    const completedAt = new Date(completions[key]?.completedAt || 0).getTime();
    return { done: Number.isFinite(completedAt) && completedAt >= note.time, completedAt: Number.isFinite(completedAt) ? completedAt : null };
  }

  function collectWorkedItems(now = Date.now()) {
    const ptaNotes = readObject(PTA_NOTES_KEY);
    const driverNotes = readObject(DRIVER_NOTES_KEY);
    const completions = readObject(COMPLETE_KEY);
    const items = [];

    Object.entries(ptaNotes).forEach(([truck, notes]) => {
      const note = latestNote(notes);
      if (!note) return;
      const completion = completionState("pta", truck, note, completions);
      items.push({
        type: "pta", identity: truck, label: `Truck ${truck}`,
        meta: [note.driver || "No driver", note.destination || "No destination"].join(" · "),
        note, done: completion.done,
      });
    });

    Object.entries(driverNotes).forEach(([key, notes]) => {
      const note = latestNote(notes);
      if (!note) return;
      const identity = note.driverCode || key || note.driverName;
      const completion = completionState("driver", identity, note, completions);
      items.push({
        type: "driver", identity,
        label: note.driverName || note.driverCode || key || "Unknown driver",
        meta: `High-idle follow-up${note.driverCode ? ` · ${note.driverCode}` : ""}`,
        note, done: completion.done,
      });
    });

    return items.map((item) => ({ ...item, overdue: !item.done && now - item.note.time > ONE_HOUR_MS }))
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
      return `<button class="worked-card ${stateClass}" type="button" data-worked-type="${item.type}" data-worked-identity="${escapeHtml(item.identity)}">
        <span class="worked-card-icon">${item.done ? "✓" : item.overdue ? "!" : "•"}</span>
        <span class="worked-card-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)} · ${formatAge(item.note.time)}</small><em>${escapeHtml(item.note.text || "No note text")}</em></span>
        <span class="worked-card-time">${escapeHtml(stateLabel)}</span>
      </button>`;
    }).join("");
    const badge = document.querySelector('[data-view="worked"] .worked-nav-count');
    if (badge) badge.textContent = String(items.filter((item) => !item.done).length);
    syncOpenModalToggles();
  }

  function formatAge(time) {
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago`;
  }

  function currentModalIdentity(type) {
    if (type === "pta") {
      const heading = document.getElementById("modalPtaTruck")?.textContent || "";
      return normalizeKey(heading.replace(/^truck\s*/i, ""));
    }
    const meta = document.getElementById("modalDriverMeta")?.textContent || "";
    const code = meta.split("·")[0]?.trim();
    return normalizeKey(code && !/^no driver code$/i.test(code) ? code : document.getElementById("modalDriverName")?.textContent);
  }

  function currentLatestNote(type, identity) {
    const notes = readObject(type === "pta" ? PTA_NOTES_KEY : DRIVER_NOTES_KEY);
    if (type === "pta") return latestNote(notes[normalizeKey(identity)]);
    const normalized = normalizeKey(identity);
    const direct = latestNote(notes[normalized]);
    if (direct) return direct;
    for (const [key, values] of Object.entries(notes)) {
      const note = latestNote(values);
      if (normalizeKey(key) === normalized || normalizeKey(note?.driverCode) === normalized || normalizeKey(note?.driverName) === normalized) return note;
    }
    return null;
  }

  function syncOpenModalToggles() {
    [["pta", "ptaModal", "ptaWorkedCompleteToggle"], ["driver", "driverModal", "driverWorkedCompleteToggle"]].forEach(([type, modalId, toggleId]) => {
      const modal = document.getElementById(modalId);
      const toggle = document.getElementById(toggleId);
      if (!modal?.hasAttribute("open") || !toggle) return;
      const identity = currentModalIdentity(type);
      const note = currentLatestNote(type, identity);
      toggle.disabled = !note;
      toggle.checked = completionState(type, identity, note).done;
      toggle.closest(".worked-complete-row")?.classList.toggle("worked-no-notes", !note);
    });
  }

  function saveModalCompletion(type) {
    const toggle = document.getElementById(type === "pta" ? "ptaWorkedCompleteToggle" : "driverWorkedCompleteToggle");
    const identity = currentModalIdentity(type);
    const note = currentLatestNote(type, identity);
    if (!toggle || !note) return;
    const completions = readObject(COMPLETE_KEY);
    const key = `${type}:${normalizeKey(identity)}`;
    if (toggle.checked) completions[key] = { completedAt: new Date().toISOString() };
    else delete completions[key];
    writeObject(COMPLETE_KEY, completions);
    renderWorkedView();
  }

  function openWorkedPopup(card) {
    const type = card.dataset.workedType;
    const identity = normalizeKey(card.dataset.workedIdentity);
    if (type === "pta") {
      const triggers = [...document.querySelectorAll("[data-pta-index]")];
      const trigger = triggers.find((element) => normalizeKey(element.closest("tr,.pta-overview-row,.pta-pulse-row")?.textContent).includes(identity));
      if (trigger) return trigger.click();
      return document.querySelector('[data-view="pta"]')?.click();
    }
    const note = currentLatestNote("driver", identity);
    const name = normalizeKey(note?.driverName);
    const triggers = [...document.querySelectorAll("[data-driver-index]")];
    const trigger = triggers.find((element) => {
      const text = normalizeKey(element.closest("tr,.driver-rank-row,.driver-list-row")?.textContent);
      return text.includes(identity) || (name && text.includes(name));
    });
    if (trigger) return trigger.click();
    document.querySelector('[data-view="drivers"]')?.click();
  }

  function interceptTransitionExport(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const content = buildTransition();
    const now = new Date();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Shift_Transition_${dateKey(now)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function buildTransition(now = new Date(), ptaNotes = readObject(PTA_NOTES_KEY), driverNotes = readObject(DRIVER_NOTES_KEY)) {
    const lines = [
      "SHIFT TRANSITION",
      `Prepared: ${now.toLocaleString()}`,
      "",
      "Truck follow-ups:",
    ];
    const truckLines = aggregateToday(ptaNotes, now, (key) => `Truck ${key}`);
    lines.push(...(truckLines.length ? truckLines : ["None"]));
    lines.push("", "High Idles contacted:");
    const driverLines = aggregateToday(driverNotes, now, (key, notes) => notes[0]?.driverName || notes[0]?.driverCode || key);
    lines.push(...(driverLines.length ? driverLines : ["None"]), "");
    return lines.join("\r\n");
  }

  function aggregateToday(groups, now, labelFor) {
    return Object.entries(groups || {}).map(([key, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => sameLocalDay(note.savedAt, now))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      if (!notes.length) return null;
      const combined = notes.map((note) => cleanLine(note.text)).filter(Boolean).join(" | ");
      return `${labelFor(key, notes)} - ${combined || "Note saved without text"}`;
    }).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function sameLocalDay(value, reference) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === reference.getFullYear()
      && date.getMonth() === reference.getMonth()
      && date.getDate() === reference.getDate();
  }

  function cleanLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function dateKey(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
