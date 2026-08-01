(() => {
  "use strict";

  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const COMPLETE_KEY = "vixenWorkedNoteCompletionV2";
  const SELECTION_KEY = "vixenTransitionNoteSelectionV1";
  const VIEW_KEY = "vixenTodayQueueViewV1";
  const NOTIFICATION_KEY = "vixenAttentionNotificationsV1";
  const HIDDEN_TASKS_KEY = "vixenHiddenAttentionTasksV1";
  const ONE_HOUR_MS = 3600000;
  let tickTimer = null;
  let noticeTimer = null;
  let bound = false;

  const api = {
    render: renderWorkedView,
    collectWorkedItems,
    completionState,
    setNoteComplete,
    finishNote,
    noteStateKey,
    latestNote,
    normalizeKey,
    buildTransition,
    openNext: openNextTask,
  };
  window.VixenWorkedWorkflow = api;

  installUi();
  installStyles();
  initialize();

  function initialize() {
    if (bound) return;
    bound = true;
    const start = () => {
      bindEvents();
      removeLegacyCompletionControls();
      window.setTimeout(() => {
        renderWorkedView();
      }, 0);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    document.addEventListener("vixen:bootstrap-complete", () => {
      organizeNavigation();
      renderWorkedView();
      if (!sessionStorage.getItem("vixenWorkflowOpenedV1")) {
        sessionStorage.setItem("vixenWorkflowOpenedV1", "true");
        document.querySelector('[data-view="worked"]')?.click();
      }
    });
  }

  function installUi() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="worked"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "worked";
      button.innerHTML = '<span>✓</span><span>Today</span><strong class="worked-nav-count">0</strong>';
      nav.prepend(button);
    }

    if (!document.getElementById("workedView")) {
      const section = document.createElement("section");
      section.id = "workedView";
      section.className = "view table-view today-view";
      section.innerHTML = `
        <div class="today-heading">
          <div><span class="eyebrow">ONE CONTINUOUS WORKFLOW</span><h2>Today</h2><p>Work the first item, finish it, and move directly to the next.</p></div>
          <div class="today-heading-actions">
            <button id="todayNotificationBtn" class="today-quiet-button" type="button">Alerts off</button>
            <button id="todayOpenHandoffBtn" class="button button-secondary" type="button">Open handoff <strong data-today-handoff-count>0</strong></button>
          </div>
        </div>
        <div id="todayAttentionBanner" class="today-attention-banner" role="status" aria-live="polite">
          <span class="today-attention-icon">!</span>
          <div><strong data-today-attention-title>Nothing needs immediate attention</strong><small data-today-attention-copy>Your open follow-ups will appear here.</small></div>
          <button id="todayStartBtn" class="button button-primary" type="button">Start next</button>
        </div>
        <div class="today-toolbar" aria-label="Today queue controls">
          <div class="today-filter-group">
            <button class="today-filter active" type="button" data-today-filter="open">Open <strong data-today-open-count>0</strong></button>
            <button class="today-filter" type="button" data-today-filter="all">Show all <strong data-today-all-count>0</strong></button>
          </div>
          <label class="today-search"><span>⌕</span><input id="todayQueueSearch" type="search" placeholder="Find a truck, driver, or note…" /></label>
        </div>
        <div id="workedEmptyState" class="worked-empty-state">No open follow-ups. Choose “Show all” to review completed work.</div>
        <div id="workedList" class="worked-list"></div>`;
      const overview = document.getElementById("overviewView");
      if (overview) overview.insertAdjacentElement("beforebegin", section);
      else document.querySelector(".main-panel")?.append(section);
    }
  }

  function organizeNavigation() {
    const nav = document.querySelector(".nav-list");
    if (!nav || nav.dataset.organized === "true") return;
    const today = nav.querySelector('[data-view="worked"]');
    if (!today) return;
    today.querySelector("span:nth-child(2)").textContent = "Today";
    nav.prepend(today);
    const overview = nav.querySelector('[data-view="overview"]');
    if (overview) overview.innerHTML = "<span>⌂</span>Insights";

    const groups = [
      ["PERFORMANCE", ["overview", "drivers", "units", "apu", "exceptions"]],
      ["DISPATCH", ["pta", "tripPlanning305", "bols"]],
      ["HANDOFF", ["transition"]],
      ["TOOLS", ["exclusions", "quality", "settings"]],
    ];
    groups.forEach(([label, views]) => {
      const buttons = views.map((view) => nav.querySelector(`[data-view="${view}"]`)).filter(Boolean);
      if (!buttons.length) return;
      const heading = document.createElement("div");
      heading.className = "nav-section-label";
      heading.textContent = label;
      nav.append(heading, ...buttons);
    });
    nav.dataset.organized = "true";
  }

  function removeLegacyCompletionControls() {
    document.querySelectorAll(".worked-complete-row,#ptaWorkedCompleteToggle,#driverWorkedCompleteToggle").forEach((element) => {
      const row = element.closest?.(".worked-complete-row");
      (row || element).remove?.();
    });
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      if (event.target.closest("#savePtaActionNoteBtn,#saveDriverActionNoteBtn,[data-pta-note-delete],[data-driver-note-delete]")) {
        window.setTimeout(renderWorkedView, 0);
      }
      const filter = event.target.closest("[data-today-filter]");
      if (filter) {
        localStorage.setItem(VIEW_KEY, filter.dataset.todayFilter);
        renderWorkedView();
        return;
      }
      const finish = event.target.closest("[data-today-finish]");
      if (finish) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishNote(finish.dataset.type, finish.dataset.noteId, true);
        return;
      }
      const finishOnly = event.target.closest("[data-today-finish-only]");
      if (finishOnly) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishNote(finishOnly.dataset.type, finishOnly.dataset.noteId, false);
        return;
      }
      const reopen = event.target.closest("[data-today-reopen]");
      if (reopen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setNoteComplete(reopen.dataset.type, reopen.dataset.noteId, false);
        showToast("Follow-up reopened and returned to Today.");
        return;
      }
      const handoff = event.target.closest("[data-today-handoff]");
      if (handoff) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIncluded(handoff.dataset.type, handoff.dataset.noteId, handoff.dataset.included !== "true");
        renderWorkedView();
        return;
      }
      const liveTask = event.target.closest("[data-today-open-live]");
      if (liveTask) {
        window.VixenDashboardWorkflow?.openTask?.(liveTask.dataset.type, liveTask.dataset.index);
        return;
      }
      const hideTask = event.target.closest("[data-today-hide-live]");
      if (hideTask) {
        setLiveTaskHidden(hideTask.dataset.taskKey, true);
        showToast("Task hidden. You can recover it with Show all.");
        return;
      }
      const restoreTask = event.target.closest("[data-today-restore-live]");
      if (restoreTask) {
        setLiveTaskHidden(restoreTask.dataset.taskKey, false);
        showToast("Task restored to the open queue.");
        return;
      }
      if (event.target.closest("#todayStartBtn")) return openNextTask();
      if (event.target.closest("#todayOpenHandoffBtn")) return document.querySelector('[data-view="transition"]')?.click();
      if (event.target.closest("#todayNotificationBtn")) return toggleNotifications();
      const openButton = event.target.closest(".worked-card-open");
      if (openButton) openWorkedPopup(openButton.closest("[data-worked-type]"));
    });

    document.getElementById("todayQueueSearch")?.addEventListener("input", renderWorkedView);
    window.addEventListener("storage", (event) => {
      if ([PTA_NOTES_KEY, DRIVER_NOTES_KEY, COMPLETE_KEY, SELECTION_KEY, VIEW_KEY, NOTIFICATION_KEY, HIDDEN_TASKS_KEY].includes(event.key)) renderWorkedView();
    });
    document.addEventListener("visibilitychange", () => document.hidden ? clearTick() : renderWorkedView());
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function writeObject(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function normalizeKey(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "UNKNOWN";
  }

  function noteStateKey(type, noteId) { return `${type}:${String(noteId ?? "").trim()}`; }

  function latestNote(notes) {
    if (!Array.isArray(notes)) return null;
    return notes.map((note) => ({ ...note, time: new Date(note?.savedAt).getTime() }))
      .filter((note) => Number.isFinite(note.time)).sort((a, b) => b.time - a.time)[0] || null;
  }

  function completionState(type, note, completions = readObject(COMPLETE_KEY)) {
    const noteId = String(note?.id ?? "").trim();
    if (!noteId) return { done: false, completedAt: null };
    const value = completions[noteStateKey(type, noteId)];
    if (!value || value === false || value?.complete === false) return { done: false, completedAt: null };
    return { done: value === true || value?.complete === true || Boolean(value?.completedAt), completedAt: value?.completedAt || null };
  }

  function setNoteComplete(type, noteId, complete) {
    const id = String(noteId ?? "").trim();
    if (!id) return false;
    const completions = readObject(COMPLETE_KEY);
    completions[noteStateKey(type, id)] = complete
      ? { complete: true, completedAt: new Date().toISOString() }
      : { complete: false, completedAt: null };
    const saved = writeObject(COMPLETE_KEY, completions);
    if (saved) renderWorkedView();
    return saved;
  }

  function setIncluded(type, noteId, included) {
    const values = readObject(SELECTION_KEY);
    const key = noteStateKey(type, noteId);
    if (included) values[key] = true;
    else delete values[key];
    const saved = writeObject(SELECTION_KEY, values);
    window.VixenNoteTransitionToggle?.enhanceAll?.();
    return saved;
  }

  function finishNote(type, noteId, includeInHandoff = true) {
    const found = findNote(type, noteId);
    if (!found || completionState(type, found.note).done) return false;
    setIncluded(type, noteId, includeInHandoff);
    setNoteComplete(type, noteId, true);
    showToast(includeInHandoff ? "Finished and added to handoff. Opening the next task." : "Finished without adding to handoff.");
    window.setTimeout(openNextTask, 120);
    return true;
  }

  function setLiveTaskHidden(taskKey, hidden) {
    const values = readObject(HIDDEN_TASKS_KEY);
    if (hidden) values[taskKey] = { hidden: true, hiddenAt: new Date().toISOString() };
    else delete values[taskKey];
    writeObject(HIDDEN_TASKS_KEY, values);
    renderWorkedView();
  }

  function collectWorkedItems(now = Date.now(), ptaNotes = readObject(PTA_NOTES_KEY), driverNotes = readObject(DRIVER_NOTES_KEY), completions = readObject(COMPLETE_KEY), selections = readObject(SELECTION_KEY)) {
    const items = [];
    Object.entries(ptaNotes || {}).forEach(([truck, notes]) => (Array.isArray(notes) ? notes : []).forEach((rawNote) => {
      const time = new Date(rawNote?.savedAt).getTime();
      const noteId = String(rawNote?.id ?? "").trim();
      if (!Number.isFinite(time) || !noteId) return;
      const note = { ...rawNote, time };
      items.push({ type: "pta", identity: truck, noteId, label: `Truck ${truck}`, meta: [note.driver || "No driver", note.destination || "No destination"].join(" · "), note, done: completionState("pta", note, completions).done, included: selections[noteStateKey("pta", noteId)] === true });
    }));
    Object.entries(driverNotes || {}).forEach(([key, notes]) => (Array.isArray(notes) ? notes : []).forEach((rawNote) => {
      const time = new Date(rawNote?.savedAt).getTime();
      const noteId = String(rawNote?.id ?? "").trim();
      if (!Number.isFinite(time) || !noteId) return;
      const note = { ...rawNote, time };
      const identity = note.driverCode || key || note.driverName;
      items.push({ type: "driver", identity, noteId, label: note.driverName || note.driverCode || key || "Unknown driver", meta: `High-idle follow-up${note.driverCode ? ` · ${note.driverCode}` : ""}`, note, done: completionState("driver", note, completions).done, included: selections[noteStateKey("driver", noteId)] === true });
    }));
    const notedIdentities = new Set(items.map((item) => `${item.type}:${normalizeKey(item.identity)}`));
    const hiddenTasks = readObject(HIDDEN_TASKS_KEY);
    (window.VixenDashboardWorkflow?.getAttentionTasks?.() || []).forEach((task) => {
      const identityKey = `${task.type}:${normalizeKey(task.identity)}`;
      if (notedIdentities.has(identityKey)) return;
      const taskKey = `${task.type}:${task.index}:${normalizeKey(task.identity)}`;
      items.push({
        ...task,
        taskKey,
        live: true,
        noteId: "",
        note: { text: task.detail || "Review and record the result.", time: now, savedAt: new Date(now).toISOString() },
        done: Boolean(hiddenTasks[taskKey]),
        included: false,
        overdue: Boolean(task.urgent),
      });
    });
    return items.map((item) => ({ ...item, overdue: item.live ? item.overdue : !item.done && now - item.note.time > ONE_HOUR_MS }))
      .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.overdue) - Number(a.overdue) || b.note.time - a.note.time);
  }

  function renderWorkedView() {
    const list = document.getElementById("workedList");
    const empty = document.getElementById("workedEmptyState");
    if (!list || !empty) return;
    const all = collectWorkedItems();
    const open = all.filter((item) => !item.done);
    const overdue = open.filter((item) => item.overdue);
    const filter = localStorage.getItem(VIEW_KEY) === "all" ? "all" : "open";
    const query = (document.getElementById("todayQueueSearch")?.value || "").trim().toLowerCase();
    const visible = all.filter((item) => (filter === "all" || !item.done) && (!query || `${item.label} ${item.meta} ${item.note.text || ""}`.toLowerCase().includes(query)));
    document.querySelectorAll("[data-today-filter]").forEach((button) => button.classList.toggle("active", button.dataset.todayFilter === filter));
    document.querySelectorAll("[data-today-open-count]").forEach((node) => { node.textContent = String(open.length); });
    document.querySelectorAll("[data-today-all-count]").forEach((node) => { node.textContent = String(all.length); });
    document.querySelectorAll("[data-today-handoff-count]").forEach((node) => { node.textContent = String(all.filter((item) => item.included).length); });
    empty.textContent = query ? "No follow-ups match this search." : filter === "all" ? "No saved follow-ups yet." : "No open follow-ups. Choose “Show all” to review completed work.";
    empty.classList.toggle("hidden", visible.length > 0);
    list.innerHTML = visible.map(renderCard).join("");
    const badge = document.querySelector('[data-view="worked"] .worked-nav-count');
    if (badge) badge.textContent = String(open.length);
    updateAttention(open, overdue);
    updateNotificationButton();
    scheduleTick();
  }

  function renderCard(item, index) {
    const classes = ["worked-card", item.overdue ? "worked-card-overdue" : "", item.done ? "worked-card-done" : ""].filter(Boolean).join(" ");
    if (item.live) return renderLiveCard(item, index, classes);
    const primary = item.done
      ? `<button class="today-action today-reopen" type="button" data-today-reopen data-type="${item.type}" data-note-id="${escapeHtml(item.noteId)}">↶ Reopen</button>`
      : `<button class="today-action today-finish" type="button" data-today-finish data-type="${item.type}" data-note-id="${escapeHtml(item.noteId)}">✓ Finish + handoff</button>`;
    const alternate = item.done ? "" : `<button class="today-action today-finish-only" type="button" data-today-finish-only data-type="${item.type}" data-note-id="${escapeHtml(item.noteId)}" title="Complete this item without putting it in the shift handoff">Finish only</button>`;
    return `<article class="${classes}" data-worked-type="${item.type}" data-worked-identity="${escapeHtml(item.identity)}" data-worked-note-id="${escapeHtml(item.noteId)}" data-worked-time="${item.note.time}" ${index === 0 ? 'data-today-next="true"' : ""}>
      <button class="worked-card-open" type="button" aria-label="Open ${escapeHtml(item.label)} details">
        <span class="worked-card-icon">${item.done ? "✓" : item.overdue ? "!" : "•"}</span>
        <span class="worked-card-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)} · <span data-worked-age>${formatAge(item.note.time)}</span></small><em>${escapeHtml(item.note.text || "No note text")}</em></span>
      </button>
      <div class="today-card-state"><span class="worked-card-time" data-worked-status>${item.done ? "Completed" : statusLabel(item.note.time)}</span><button class="today-handoff-chip ${item.included ? "active" : ""}" type="button" data-today-handoff data-type="${item.type}" data-note-id="${escapeHtml(item.noteId)}" data-included="${item.included}" aria-pressed="${item.included}">${item.included ? "✉ In handoff" : "＋ Handoff"}</button></div>
      <div class="today-card-actions">${alternate}${primary}</div>
    </article>`;
  }

  function renderLiveCard(item, index, classes) {
    const action = item.done
      ? `<button class="today-action today-reopen" type="button" data-today-restore-live data-task-key="${escapeHtml(item.taskKey)}">↶ Restore task</button>`
      : `<button class="today-action today-finish" type="button" data-today-open-live data-type="${item.type}" data-index="${item.index}">Open task ›</button>`;
    const hide = item.done ? "" : `<button class="today-action today-finish-only" type="button" data-today-hide-live data-task-key="${escapeHtml(item.taskKey)}">Hide</button>`;
    return `<article class="${classes} today-live-task" data-worked-type="${item.type}" data-worked-identity="${escapeHtml(item.identity)}" ${index === 0 ? 'data-today-next="true"' : ""}>
      <button class="worked-card-open" type="button" data-today-open-live data-type="${item.type}" data-index="${item.index}" aria-label="Open ${escapeHtml(item.label)}">
        <span class="worked-card-icon">${item.done ? "✓" : item.overdue ? "!" : "•"}</span>
        <span class="worked-card-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)} · Live dashboard task</small><em>${escapeHtml(item.note.text)}</em></span>
      </button>
      <div class="today-card-state"><span class="worked-card-time">${item.done ? "Hidden" : item.overdue ? "Needs attention" : "Ready"}</span></div>
      <div class="today-card-actions">${hide}${action}</div>
    </article>`;
  }

  function updateAttention(open, overdue) {
    const banner = document.getElementById("todayAttentionBanner");
    if (!banner) return;
    banner.classList.toggle("has-attention", overdue.length > 0);
    const title = banner.querySelector("[data-today-attention-title]");
    const copy = banner.querySelector("[data-today-attention-copy]");
    title.textContent = overdue.length ? `${overdue.length} follow-up${overdue.length === 1 ? " needs" : "s need"} attention` : open.length ? `${open.length} open follow-up${open.length === 1 ? "" : "s"}` : "You are caught up";
    copy.textContent = overdue.length ? "The oldest attention item is first. Finish it and the next task will be ready." : open.length ? "Nothing is overdue. Continue from the top when you are ready." : "Completed work remains available under Show all and can be reopened anytime.";
    document.getElementById("todayStartBtn").disabled = open.length === 0;
    maybeNotify(overdue);
  }

  function openNextTask() {
    const card = [...document.querySelectorAll("#workedList .worked-card")].find((item) => !item.classList.contains("worked-card-done"));
    if (!card) return;
    card.scrollIntoView?.({ block: "center", behavior: "smooth" });
    card.classList.add("today-next-focus");
    window.setTimeout(() => card.classList.remove("today-next-focus"), 1400);
    window.setTimeout(() => card.querySelector(".worked-card-open")?.click(), 180);
  }

  function updateWorkedAges() { renderWorkedView(); }
  function statusLabel(time) {
    const ageMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    return ageMinutes >= 60 ? "Needs attention" : `${Math.max(1, 60 - ageMinutes)} min left`;
  }
  function formatAge(time) {
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago`;
  }
  function scheduleTick() {
    clearTick();
    if (document.hidden) return;
    tickTimer = window.setTimeout(() => { updateWorkedAges(); }, 60000 - (Date.now() % 60000) + 50);
  }
  function clearTick() { window.clearTimeout(tickTimer); tickTimer = null; }

  async function toggleNotifications() {
    if (!("Notification" in window)) { showToast("Browser notifications are not available here.", true); return; }
    if (localStorage.getItem(NOTIFICATION_KEY) === "true") {
      localStorage.setItem(NOTIFICATION_KEY, "false");
      updateNotificationButton();
      showToast("Attention alerts turned off.");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") { showToast("Notification permission was not granted.", true); return; }
    localStorage.setItem(NOTIFICATION_KEY, "true");
    updateNotificationButton();
    showToast("Attention alerts are on.");
  }

  function updateNotificationButton() {
    const button = document.getElementById("todayNotificationBtn");
    if (!button) return;
    const enabled = localStorage.getItem(NOTIFICATION_KEY) === "true" && window.Notification?.permission === "granted";
    button.textContent = enabled ? "● Alerts on" : "○ Alerts off";
    button.classList.toggle("active", enabled);
  }

  function maybeNotify(overdue) {
    if (!overdue.length || localStorage.getItem(NOTIFICATION_KEY) !== "true" || window.Notification?.permission !== "granted") return;
    const signature = overdue.map((item) => item.noteId).sort().join("|");
    if (sessionStorage.getItem("vixenLastAttentionNoticeV1") === signature) return;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      new Notification("Fuel Dash needs attention", { body: `${overdue.length} follow-up${overdue.length === 1 ? " is" : "s are"} waiting. ${overdue[0].label} is first.` });
      sessionStorage.setItem("vixenLastAttentionNoticeV1", signature);
    }, 400);
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
      const trigger = [...document.querySelectorAll("[data-pta-index]")].find((element) => normalizeKey(element.closest("tr,.pta-overview-row,.pta-pulse-row")?.textContent).includes(identity));
      if (trigger) { trigger.click(); return window.setTimeout(() => focusNoteInPopup("pta", noteId), 0); }
      return document.querySelector('[data-view="pta"]')?.click();
    }
    const found = findNote("driver", noteId);
    const name = normalizeKey(found?.note?.driverName);
    const trigger = [...document.querySelectorAll("[data-driver-index]")].find((element) => {
      const rowText = normalizeKey(element.closest("tr,.driver-rank-row,.driver-list-row")?.textContent);
      return rowText.includes(identity) || (name && rowText.includes(name));
    });
    if (trigger) { trigger.click(); return window.setTimeout(() => focusNoteInPopup("driver", noteId), 0); }
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

  function showToast(message, error = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3000);
  }

  function buildTransition(...args) { return window.VixenTransitionExport?.buildTransition?.(...args) || "SHIFT TRANSITION\r\nPrepared: transition exporter unavailable\r\n"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }

  function installStyles() {
    if (document.getElementById("workedWorkflowStyles")) return;
    const style = document.createElement("style");
    style.id = "workedWorkflowStyles";
    style.textContent = `
      .nav-section-label{padding:13px 14px 4px;color:#64748b;font-size:8px;font-weight:950;letter-spacing:.18em}.nav-section-label:first-of-type{margin-top:5px}
      .worked-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.35);color:#7dd3fc;font-size:9px;text-align:center}
      .today-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}.today-heading h2{margin:3px 0;font-size:30px}.today-heading p{margin:0;color:var(--muted);font-size:12px}.today-heading-actions{display:flex;gap:9px;align-items:center}.today-heading-actions strong{margin-left:6px;color:#7dd3fc}
      .today-quiet-button{padding:9px 12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);color:#94a3b8;border-radius:8px;font-size:10px;font-weight:850;cursor:pointer}.today-quiet-button.active{color:#86efac;border-color:rgba(74,222,128,.45)}
      .today-attention-banner{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;margin-bottom:14px;padding:15px 17px;border:1px solid rgba(56,189,248,.3);background:linear-gradient(105deg,rgba(14,165,233,.12),rgba(7,14,20,.94))}.today-attention-banner.has-attention{border-color:rgba(244,63,94,.55);background:linear-gradient(105deg,rgba(244,63,94,.15),rgba(24,8,14,.94))}.today-attention-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:#38bdf8;color:#071018;font-weight:950}.has-attention .today-attention-icon{background:#f43f5e;color:white}.today-attention-banner strong,.today-attention-banner small{display:block}.today-attention-banner small{margin-top:3px;color:var(--muted);font-size:10px}
      .today-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.today-filter-group{display:flex;padding:3px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.45);border-radius:9px}.today-filter{padding:8px 12px;border:0;background:transparent;color:#94a3b8;border-radius:6px;font-size:10px;font-weight:900;cursor:pointer}.today-filter.active{background:rgba(56,189,248,.16);color:#7dd3fc}.today-filter strong{margin-left:5px}.today-search{display:flex;align-items:center;gap:7px;width:min(340px,48vw);padding:8px 11px;border:1px solid rgba(148,163,184,.2);background:rgba(7,14,20,.7)}.today-search input{width:100%;border:0;outline:0;background:transparent;color:var(--white);font:inherit}
      .worked-empty-state{padding:34px 22px;border:1px dashed rgba(125,211,252,.3);background:rgba(14,165,233,.04);color:var(--muted);text-align:center}.worked-list{display:grid;gap:10px}
      .worked-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 16px;align-items:center;padding:14px 16px;border:1px solid rgba(251,191,36,.4);background:linear-gradient(110deg,rgba(251,191,36,.1),rgba(7,14,20,.94));transition:.18s}.worked-card:hover{transform:translateX(2px)}.worked-card-overdue{border-color:rgba(244,63,94,.58);background:linear-gradient(110deg,rgba(244,63,94,.15),rgba(24,8,14,.94))}.worked-card-done{opacity:.72;border-color:rgba(56,189,248,.28);background:rgba(14,165,233,.05)}
      .worked-card-open{display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;align-items:center;padding:0;border:0;background:transparent;color:var(--white);text-align:left;cursor:pointer}.worked-card-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;color:#111827;background:#fbbf24;font-weight:950}.worked-card-overdue .worked-card-icon{color:#fff;background:#f43f5e}.worked-card-done .worked-card-icon{color:#071018;background:#38bdf8}.worked-card-copy{min-width:0}.worked-card-copy strong,.worked-card-copy small,.worked-card-copy em{display:block}.worked-card-copy strong{font-size:14px}.worked-card-copy small{margin-top:3px;color:var(--muted);font-size:10px}.worked-card-copy em{margin-top:7px;color:#fde68a;font-size:12px;font-style:normal;white-space:pre-wrap;overflow-wrap:anywhere}.worked-card-done .worked-card-copy em{color:#94a3b8}
      .today-card-state{display:flex;gap:7px;align-items:center;justify-content:flex-end}.worked-card-time{font-size:9px;font-weight:900;color:#fbbf24;text-transform:uppercase}.worked-card-overdue .worked-card-time{color:#fb7185}.worked-card-done .worked-card-time{color:#7dd3fc}.today-handoff-chip,.today-action{border-radius:7px;font-size:9px;font-weight:900;cursor:pointer}.today-handoff-chip{padding:6px 8px;border:1px solid rgba(148,163,184,.25);background:transparent;color:#94a3b8}.today-handoff-chip.active{border-color:rgba(74,222,128,.45);background:rgba(34,197,94,.1);color:#86efac}.today-card-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px;padding-top:9px;border-top:1px solid rgba(148,163,184,.12)}.today-action{padding:8px 11px}.today-finish{border:1px solid #4ade80;background:rgba(34,197,94,.18);color:#86efac}.today-finish-only{border:1px solid rgba(148,163,184,.25);background:transparent;color:#94a3b8}.today-reopen{border:1px solid rgba(56,189,248,.45);background:rgba(14,165,233,.12);color:#7dd3fc}.today-next-focus{outline:2px solid #7dd3fc;outline-offset:3px}.worked-note-focus{outline:2px solid #7dd3fc;outline-offset:3px}
    `;
    document.head.append(style);
  }
})();
