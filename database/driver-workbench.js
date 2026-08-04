(() => {
  "use strict";

  const OVERRIDES_KEY = "vixenDriverWorkbenchV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const state = {
    analysis: null,
    model: null,
    selectedKey: "",
    query: "",
    filter: "all",
    overrides: readObject(OVERRIDES_KEY),
    renderQueued: false,
  };

  window.VixenDriverWorkbench = Object.freeze({
    refresh: queueRender,
    select(key) { state.selectedKey = String(key || ""); queueRender(); },
    getModel: () => state.model,
  });

  document.addEventListener("DOMContentLoaded", install);
  document.addEventListener("vixen:bootstrap-complete", install);
  document.addEventListener("vixen:analysis-rendered", (event) => {
    state.analysis = event.detail?.analysis || window.VixenCurrentAnalysis || null;
    queueRender();
  });
  window.addEventListener("storage", (event) => {
    if (![OVERRIDES_KEY, DRIVER_NOTES_KEY, PTA_NOTES_KEY, "vixenTripPlanningNotes305V1"].includes(event.key)) return;
    state.overrides = readObject(OVERRIDES_KEY);
    queueRender();
  });

  function install() {
    if (document.getElementById("driverWorkbench")) return;
    const view = document.getElementById("driversView");
    if (!view) return;

    const heading = view.querySelector(".view-heading");
    if (heading) {
      const eyebrow = heading.querySelector(".eyebrow");
      const title = heading.querySelector("h2");
      if (eyebrow) eyebrow.textContent = "DRIVER-CENTRIC OPERATIONS";
      if (title) title.textContent = "Driver Workbench";
      heading.querySelector(".table-search")?.classList.add("hidden");
    }
    const nav = document.querySelector('.nav-item[data-view="drivers"]');
    if (nav) nav.innerHTML = "<span>◉</span>Driver Workbench";

    const workbench = document.createElement("section");
    workbench.id = "driverWorkbench";
    workbench.className = "driver-workbench";
    workbench.innerHTML = `
      <div class="driver-workbench-toolbar">
        <div class="driver-workbench-summary" id="driverWorkbenchSummary">Waiting for driver data.</div>
        <div class="driver-workbench-controls">
          <input id="driverWorkbenchSearch" type="search" placeholder="Search driver, truck, PTA, status, or note..." />
          <select id="driverWorkbenchFilter" aria-label="Filter driver workbench">
            <option value="all">All drivers</option>
            <option value="action">Needs action</option>
            <option value="overdue">Overdue PTA</option>
            <option value="no-preplan">No preplan</option>
            <option value="unloaded">Unloaded</option>
            <option value="high-idle">7-day idle over 50%</option>
            <option value="missing-truck">Missing truck</option>
          </select>
        </div>
      </div>
      <div class="driver-workbench-layout">
        <div class="driver-workbench-list" id="driverWorkbenchList"></div>
        <article class="driver-workbench-card" id="driverWorkbenchCard">
          <div class="empty-state">Select a driver/truck line to open the complete workflow.</div>
        </article>
      </div>`;

    const explainer = view.querySelector(".table-explainer");
    explainer?.insertAdjacentElement("afterend", workbench);
    hideLegacyDriverSurfaces(view);
    bindEvents();
    installStyles();
    state.analysis = window.VixenCurrentAnalysis || null;
    queueRender();
  }

  function hideLegacyDriverSurfaces(view) {
    [...view.children].forEach((child) => {
      if (child.id === "driverWorkbench" || child.classList.contains("view-heading") || child.classList.contains("table-explainer")) return;
      if (child.matches(".table-shell, #driverOperationsPanel")) child.classList.add("driver-workbench-legacy-hidden");
    });
    const observer = new MutationObserver(() => {
      view.querySelectorAll(":scope > .table-shell, :scope > #driverOperationsPanel").forEach((element) => element.classList.add("driver-workbench-legacy-hidden"));
    });
    observer.observe(view, { childList: true });
  }

  function bindEvents() {
    const search = document.getElementById("driverWorkbenchSearch");
    const filter = document.getElementById("driverWorkbenchFilter");
    let timer = null;
    search?.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        state.query = search.value.trim().toLowerCase();
        renderListAndCard();
      }, 100);
    });
    filter?.addEventListener("change", () => {
      state.filter = filter.value;
      renderListAndCard();
    });

    document.getElementById("driverWorkbenchList")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-workbench-key]");
      if (!row) return;
      state.selectedKey = row.dataset.workbenchKey;
      renderListAndCard();
    });

    document.getElementById("driverWorkbenchCard")?.addEventListener("click", handleCardClick);
    document.getElementById("driverWorkbenchCard")?.addEventListener("submit", handleCardSubmit);
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    const callback = () => {
      state.renderQueued = false;
      rebuildModel();
      renderListAndCard();
    };
    window.requestAnimationFrame ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 0);
  }

  function rebuildModel() {
    const parser = window.VixenDriverCentricParser;
    if (!parser?.build || !state.analysis) {
      state.model = null;
      return;
    }
    state.overrides = readObject(OVERRIDES_KEY);
    state.model = parser.build(state.analysis, {
      overrides: state.overrides,
      driverNotes: readObject(DRIVER_NOTES_KEY),
      ptaNotes: readObject(PTA_NOTES_KEY),
      missingBolRecords: window.VixenMissingBolLive?.records || [],
      planningRecords: window.VixenTripPlanningNotes?.list?.() || [],
    });
    const selectedExists = state.model.byDriver.has(state.selectedKey);
    if (!selectedExists) state.selectedKey = state.model.records[0]?.key || "";
  }

  function renderListAndCard() {
    const list = document.getElementById("driverWorkbenchList");
    const summary = document.getElementById("driverWorkbenchSummary");
    const card = document.getElementById("driverWorkbenchCard");
    if (!list || !summary || !card) return;
    if (!state.model) {
      summary.textContent = "Load driver data to build the workbench.";
      list.innerHTML = '<div class="empty-state">No driver data yet.</div>';
      card.innerHTML = '<div class="empty-state">The parser has nothing useful to join yet.</div>';
      return;
    }

    const filtered = state.model.records.filter(matchesFilter);
    const stats = state.model.stats;
    summary.innerHTML = `<strong>${formatCount(filtered.length)}</strong> shown · ${formatCount(stats.needsAction)} need action · ${formatCount(stats.noPreplan)} no preplan · ${formatCount(stats.missingTruck)} missing truck`;
    list.innerHTML = filtered.length ? filtered.map(renderListRow).join("") : '<div class="empty-state">No drivers match that filter.</div>';

    const selected = state.model.byDriver.get(state.selectedKey) || filtered[0] || state.model.records[0];
    if (selected) {
      state.selectedKey = selected.key;
      card.innerHTML = renderCard(selected);
      list.querySelector(`[data-workbench-key="${cssEscape(selected.key)}"]`)?.classList.add("selected");
    } else {
      card.innerHTML = '<div class="empty-state">No driver selected.</div>';
    }
  }

  function matchesFilter(record) {
    if (state.query && !record.searchText.includes(state.query)) return false;
    switch (state.filter) {
      case "action": return record.needsAction;
      case "overdue": return record.riskKey.startsWith("overdue");
      case "no-preplan": return record.preplanStatus === "No Preplan";
      case "unloaded": return record.loadedStatus === "Unloaded";
      case "high-idle": return Number.isFinite(record.idle7DayPct) && record.idle7DayPct > 0.5;
      case "missing-truck": return !record.truck;
      default: return true;
    }
  }

  function renderListRow(record) {
    return `<button type="button" class="driver-workbench-row risk-${escapeHtml(record.riskKey)}" data-workbench-key="${escapeHtml(record.key)}">
      <span class="driver-workbench-truck">${escapeHtml(record.truck || "NO TRUCK")}</span>
      <span class="driver-workbench-driver"><strong>${escapeHtml(record.driverName)}</strong><small>${escapeHtml(record.driverCode || "No code")}</small></span>
      <span class="driver-workbench-pta"><strong>${escapeHtml(formatPta(record.ptaAt))}</strong><small>${escapeHtml(record.riskLabel)}</small></span>
      <span class="driver-workbench-idle"><b>${percent(record.idle7DayPct)}</b><small>7d · ${percent(record.idle28DayPct)} 28d</small></span>
      <span class="driver-workbench-badges"><i class="status-${slug(record.loadedStatus)}">${escapeHtml(record.loadedStatus)}</i><i class="status-${slug(record.preplanStatus)}">${escapeHtml(record.preplanStatus)}</i></span>
    </button>`;
  }

  function renderCard(record) {
    const overrideStamp = record.override?.updatedAt ? `Local override updated ${formatDateTime(record.override.updatedAt)}` : "Source PTA shown until you save an operating override.";
    const notes = [...record.driverNotes.slice(0, 5), ...record.ptaNotes.slice(0, 3)]
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
      .slice(0, 6);
    return `
      <header class="driver-card-header">
        <div>
          <span class="eyebrow">ONE DRIVER · ONE TRUCK · ONE WORKFLOW</span>
          <h2>${escapeHtml(record.driverName)}</h2>
          <p>${escapeHtml(record.driverCode || "No driver code")} · Truck <strong>${escapeHtml(record.truck || "assignment required")}</strong> · ${escapeHtml(record.assignmentSource || "unknown assignment source")}</p>
        </div>
        <div class="driver-card-risk risk-${escapeHtml(record.riskKey)}"><span>${escapeHtml(record.riskLabel)}</span><strong>${escapeHtml(formatPta(record.ptaAt))}</strong></div>
      </header>

      <div class="driver-card-metrics">
        ${metric("Idle current", percent(record.currentIdlePct), "Most recent available")}
        ${metric("Idle 7-day", percent(record.idle7DayPct), hoursContext(record.idleHours7Day, record.engineHours7Day))}
        ${metric("Idle 28-day", percent(record.idle28DayPct), hoursContext(record.idleHours28Day, record.engineHours28Day))}
        ${metric("Dispatch MPG", number(record.dispatchMpg, 2), `Moving ${number(record.movingMpg, 2)}`)}
        ${metric("Out-of-route", percent(record.oorPct), "Driver-level report")}
        ${metric("Missing BOLs", formatCount(record.missingBols.length), record.missingBols[0]?.trip || "No matching trips")}
      </div>

      <form class="driver-card-operations" data-workbench-form="${escapeHtml(record.key)}">
        <div class="driver-card-section-heading"><div><span class="eyebrow">LIVE OPERATING STATE</span><h3>PTA, load, and plan</h3></div><small>${escapeHtml(overrideStamp)}</small></div>
        <div class="driver-card-fields">
          <label>Truck<input name="truck" value="${escapeHtml(record.truck)}" placeholder="Truck number" /></label>
          <label>Current PTA<input name="ptaAt" type="datetime-local" value="${escapeHtml(toLocalInput(record.ptaAt))}" /></label>
          <label>Load status<select name="loadedStatus">${options(["Loaded", "Unloaded", "Unknown"], record.loadedStatus)}</select></label>
          <label>Planning status<select name="preplanStatus">${options(["Preplan", "No Preplan", "Unknown"], record.preplanStatus)}</select></label>
        </div>
        <label class="driver-card-note-field">Operating note<textarea name="operatingNote" maxlength="1000" rows="2" placeholder="Why the PTA or status changed, who was called, or what blocks the next load">${escapeHtml(record.override?.operatingNote || "")}</textarea></label>
        <div class="driver-card-actions">
          <button class="button button-primary" type="submit">Save operating state</button>
          <button class="button button-secondary" type="button" data-workbench-open-driver="${record.index}">Open full fuel detail</button>
          <button class="button button-secondary" type="button" data-workbench-open-pta="${record.ptaIndex ?? ""}">Open PTA board</button>
          ${record.override && Object.keys(record.override).length ? `<button class="driver-card-clear" type="button" data-workbench-clear="${escapeHtml(record.key)}">Clear override</button>` : ""}
        </div>
      </form>

      <div class="driver-card-grid">
        ${section("Dispatch / PTA source", renderPtaSource(record))}
        ${section("Fuel and idle context", renderFuelContext(record))}
        ${section("Electric APU", renderApu(record.apu))}
        ${section("Missing BOL work", renderMissingBols(record.missingBols))}
      </div>

      <section class="driver-card-notes">
        <div class="driver-card-section-heading"><div><span class="eyebrow">TRACKED OBJECTS</span><h3>Notes and follow-up history</h3></div><small>${formatCount(record.driverNotes.length)} driver notes · ${formatCount(record.ptaNotes.length)} truck/PTA notes</small></div>
        <form class="driver-quick-note" data-workbench-note-form="${escapeHtml(record.key)}">
          <select name="recordType"><option>Observation</option><option>Coaching</option><option>Driver explanation</option><option>Commitment</option><option>Outcome</option></select>
          <select name="followUpStatus"><option>Open</option><option>Waiting</option><option>Improved</option><option>No change</option><option>Closed</option></select>
          <textarea name="noteText" rows="2" maxlength="2500" placeholder="Record the decision, driver context, commitment, or handoff note"></textarea>
          <button class="button button-primary" type="submit">Save driver note</button>
        </form>
        <div class="driver-card-note-history">${notes.length ? notes.map(renderNote).join("") : '<div class="empty-state">No saved notes for this driver/truck yet.</div>'}</div>
      </section>`;
  }

  function renderPtaSource(record) {
    if (!record.pta) return "No PTA source record matched this driver/truck. Save a local PTA above or correct the truck assignment.";
    return `<dl>
      ${definition("Source PTA", formatPta(record.sourcePtaAt))}
      ${definition("Status", record.ptaStatus || "Not reported")}
      ${definition("Plan", record.planStatus || "Not reported")}
      ${definition("Destination", record.destination || "Not reported")}
      ${definition("Next action", record.ptaAction || "No source action")}
    </dl>`;
  }

  function renderFuelContext(record) {
    return `<dl>
      ${definition("Review level", record.reviewLabel || "Review")}
      ${definition("What stands out", record.focus || "No driver-level exception text")}
      ${definition("Next check", record.action || "Review route, load, weather, idle necessity, and equipment")}
      ${definition("Estimated excess gallons", number(record.excessGallons, 1))}
      ${definition("Possible 28-day savings", money(record.estimatedCost))}
    </dl>`;
  }

  function renderApu(apu) {
    if (!apu) return "No APU record matched this driver. That is missing context, not proof the driver ignored the equipment.";
    return `<dl>
      ${definition("Status", apu.status || "Reported")}
      ${definition("APU hours", number(apu.apuHours, 1))}
      ${definition("Engine idle hours", number(apu.engineIdleHours, 1))}
      ${definition("APU use", percent(apu.calculatedUsePct ?? apu.apuUsePct))}
      ${definition("Battery", percent(apu.batterySoc))}
      ${definition("Faults", apu.faults || apu.plainNote || "None reported")}
    </dl>`;
  }

  function renderMissingBols(records) {
    if (!records.length) return "No Missing BOL rows matched this driver code.";
    return `<div class="driver-bol-list">${records.slice(0, 8).map((item) => `<div><strong>${escapeHtml(item.trip || "Unknown trip")}</strong><span>${escapeHtml(formatDateTime(item.date || item.rawDate))}</span><small>${escapeHtml(item.driverLeader || "No leader")}</small></div>`).join("")}</div>${records.length > 8 ? `<small>${formatCount(records.length - 8)} more in Missing BOLs.</small>` : ""}`;
  }

  function renderNote(note) {
    return `<article><div><strong>${escapeHtml(note.recordType || note.domain || "Note")}</strong><span>${escapeHtml(note.followUpStatus || "")}</span><time>${escapeHtml(formatDateTime(note.savedAt || note.updatedAt))}</time></div><p>${escapeHtml(note.text || note.note || "")}</p><small>${escapeHtml(note.truck || note.assignedTruck || "")}${note.idle7DayPct != null ? ` · 7-day ${percent(note.idle7DayPct)}` : ""}${note.idle28DayPct != null ? ` · 28-day ${percent(note.idle28DayPct)}` : ""}</small></article>`;
  }

  function handleCardSubmit(event) {
    const form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    if (form.dataset.workbenchForm) saveOperatingState(form);
    else if (form.dataset.workbenchNoteForm) saveDriverNote(form);
  }

  function handleCardClick(event) {
    const openDriver = event.target.closest("[data-workbench-open-driver]");
    if (openDriver) {
      const trigger = document.querySelector(`[data-driver-index="${Number(openDriver.dataset.workbenchOpenDriver)}"]`);
      if (trigger) trigger.click();
      else document.querySelector('.nav-item[data-view="drivers"]')?.click();
      return;
    }
    const openPta = event.target.closest("[data-workbench-open-pta]");
    if (openPta) {
      const index = Number(openPta.dataset.workbenchOpenPta);
      const trigger = Number.isInteger(index) ? document.querySelector(`[data-pta-index="${index}"]`) : null;
      if (trigger) trigger.click();
      else document.querySelector('.nav-item[data-view="pta"]')?.click();
      return;
    }
    const clear = event.target.closest("[data-workbench-clear]");
    if (clear) {
      delete state.overrides[clear.dataset.workbenchClear];
      persist(OVERRIDES_KEY, state.overrides);
      queueRender();
    }
  }

  function saveOperatingState(form) {
    const key = form.dataset.workbenchForm;
    const record = state.model?.byDriver.get(key);
    if (!record) return;
    const data = new FormData(form);
    const truck = normalizeTruck(data.get("truck"));
    if (truck && truck !== record.truck) {
      const saved = window.VixenDriverOperations?.saveAssignment?.({
        driverCode: record.driverCode,
        driverName: record.driverName,
        truck,
        reason: "Driver Workbench operating update",
      });
      if (!saved) return showToast("Truck assignment was not saved. Check whether that truck already has two drivers.", true);
    }
    state.overrides[key] = {
      ptaAt: clean(data.get("ptaAt")),
      loadedStatus: clean(data.get("loadedStatus")) || "Unknown",
      preplanStatus: clean(data.get("preplanStatus")) || "Unknown",
      operatingNote: clean(data.get("operatingNote")).slice(0, 1000),
      truck: truck || record.truck,
      updatedAt: new Date().toISOString(),
    };
    persist(OVERRIDES_KEY, state.overrides);
    showToast(`Operating state saved for ${record.truck || record.driverName}.`);
    queueRender();
  }

  function saveDriverNote(form) {
    const key = form.dataset.workbenchNoteForm;
    const record = state.model?.byDriver.get(key);
    if (!record) return;
    if (!record.truck) return showToast("Assign a truck before saving the driver note.", true);
    const data = new FormData(form);
    const noteText = clean(data.get("noteText"));
    if (!noteText) return showToast("Type a note first.", true);
    const allNotes = readObject(DRIVER_NOTES_KEY);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: noteText.slice(0, 2500),
      savedAt: new Date().toISOString(),
      driverName: record.driverName,
      driverCode: record.driverCode,
      truck: record.truck,
      assignedTruck: record.truck,
      domain: "fuel",
      recordType: clean(data.get("recordType")) || "Observation",
      followUpStatus: clean(data.get("followUpStatus")) || "Open",
      followUpAt: "",
      dailyIdlePct: record.currentIdlePct,
      idle7DayPct: record.idle7DayPct,
      idle28DayPct: record.idle28DayPct,
      estimatedCost: record.estimatedCost,
    };
    allNotes[key] = [entry, ...(Array.isArray(allNotes[key]) ? allNotes[key] : [])].slice(0, 75);
    persist(DRIVER_NOTES_KEY, allNotes);
    window.VixenWorkedWorkflow?.setNoteComplete?.("driver", entry.id, false);
    form.reset();
    showToast(`Driver note saved for ${record.driverName}.`);
    queueRender();
  }

  function metric(label, value, note) {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
  }

  function section(title, content) {
    return `<section><h3>${escapeHtml(title)}</h3><div>${content}</div></section>`;
  }

  function definition(term, value) {
    return `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function options(values, selected) {
    return values.map((value) => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  function hoursContext(idle, engine) {
    return Number.isFinite(idle) && Number.isFinite(engine) ? `${number(idle, 1)} idle / ${number(engine, 1)} engine hrs` : "Raw hours unavailable";
  }

  function formatPta(value) {
    const date = validDate(value);
    return date ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "PTA missing";
  }

  function toLocalInput(value) {
    const date = validDate(value);
    if (!date) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? clean(value) || "Unknown date" : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function validDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  }

  function number(value, decimals = 1) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : "--";
  }

  function money(value) {
    return Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value)) : "--";
  }

  function percent(value) {
    return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "--";
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  }

  function normalizeTruck(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { showToast("The browser could not save that update.", true); }
  }

  function showToast(message, error = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function slug(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function installStyles() {
    if (document.getElementById("driverWorkbenchStyles")) return;
    const style = document.createElement("style");
    style.id = "driverWorkbenchStyles";
    style.textContent = `
      .driver-workbench-legacy-hidden{display:none!important}.driver-workbench{display:grid;gap:12px}.driver-workbench-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:rgba(8,16,25,.72)}.driver-workbench-summary{color:var(--muted);font-size:12px}.driver-workbench-summary strong{color:var(--white)}.driver-workbench-controls{display:flex;gap:8px;min-width:min(520px,100%)}.driver-workbench-controls input,.driver-workbench-controls select,.driver-card-fields input,.driver-card-fields select,.driver-card-note-field textarea,.driver-quick-note select,.driver-quick-note textarea{box-sizing:border-box;width:100%;min-height:40px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:#081019;color:var(--white);font:inherit}.driver-workbench-controls input{flex:1}.driver-workbench-layout{display:grid;grid-template-columns:minmax(460px,.9fr) minmax(600px,1.3fr);gap:12px;align-items:start}.driver-workbench-list{display:grid;gap:6px;max-height:calc(100vh - 260px);overflow:auto;padding-right:4px}.driver-workbench-row{display:grid;grid-template-columns:88px minmax(150px,1fr) 145px 105px 160px;gap:10px;align-items:center;width:100%;padding:11px;border:1px solid var(--line);border-left:4px solid rgba(143,99,255,.38);border-radius:13px;background:rgba(8,16,25,.82);color:var(--white);text-align:left;cursor:pointer}.driver-workbench-row:hover,.driver-workbench-row.selected{border-color:rgba(134,255,210,.55);background:rgba(134,255,210,.055)}.driver-workbench-row.risk-overdue-no-preplan,.driver-workbench-row.risk-overdue{border-left-color:#ff718f}.driver-workbench-row.risk-due-no-preplan,.driver-workbench-row.risk-due-unloaded{border-left-color:#ffc45f}.driver-workbench-truck{font-size:16px;font-weight:900}.driver-workbench-driver,.driver-workbench-pta,.driver-workbench-idle{display:grid;gap:2px}.driver-workbench-row small{color:var(--muted);font-size:10px}.driver-workbench-badges{display:flex;gap:5px;flex-wrap:wrap}.driver-workbench-badges i{padding:3px 6px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:9px;font-style:normal;font-weight:800;text-transform:uppercase}.driver-workbench-badges .status-unloaded,.driver-workbench-badges .status-no-preplan{border-color:rgba(255,113,143,.45);color:#ff9bb0}.driver-workbench-badges .status-loaded,.driver-workbench-badges .status-preplan{border-color:rgba(134,255,210,.38);color:#86ffd2}.driver-workbench-card{position:sticky;top:12px;max-height:calc(100vh - 100px);overflow:auto;padding:18px;border:1px solid var(--line);border-radius:18px;background:rgba(6,12,20,.96);box-shadow:0 20px 60px rgba(0,0,0,.28)}.driver-card-header,.driver-card-section-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.driver-card-header h2{margin:3px 0;font-size:26px}.driver-card-header p{margin:0;color:var(--muted)}.driver-card-risk{display:grid;gap:4px;min-width:170px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;text-align:right}.driver-card-risk span{color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.driver-card-risk.risk-overdue-no-preplan,.driver-card-risk.risk-overdue{border-color:rgba(255,113,143,.55)}.driver-card-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}.driver-card-metrics>div{display:grid;gap:3px;padding:11px;border:1px solid var(--line);border-radius:12px;background:rgba(16,25,36,.72)}.driver-card-metrics span,.driver-card-metrics small{color:var(--muted);font-size:10px}.driver-card-metrics strong{font-size:20px}.driver-card-operations,.driver-card-notes{display:grid;gap:10px;padding:14px;border:1px solid rgba(143,99,255,.28);border-radius:15px;background:rgba(143,99,255,.045)}.driver-card-section-heading h3{margin:2px 0}.driver-card-section-heading small{max-width:300px;color:var(--muted);text-align:right}.driver-card-fields{display:grid;grid-template-columns:.7fr 1.3fr 1fr 1fr;gap:8px}.driver-card-fields label,.driver-card-note-field{display:grid;gap:5px;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.driver-card-actions{display:flex;gap:8px;flex-wrap:wrap}.driver-card-clear{border:0;background:transparent;color:#ff9bb0;cursor:pointer}.driver-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}.driver-card-grid>section{padding:13px;border:1px solid var(--line);border-radius:14px;background:rgba(8,16,25,.66)}.driver-card-grid h3{margin:0 0 9px}.driver-card-grid dl{display:grid;gap:6px;margin:0}.driver-card-grid dl>div{display:grid;grid-template-columns:115px 1fr;gap:8px}.driver-card-grid dt{color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.driver-card-grid dd{margin:0}.driver-bol-list{display:grid;gap:6px}.driver-bol-list>div{display:grid;grid-template-columns:1fr auto;gap:4px;padding:6px 0;border-bottom:1px solid var(--line)}.driver-bol-list small{grid-column:1/-1;color:var(--muted)}.driver-quick-note{display:grid;grid-template-columns:140px 120px 1fr auto;gap:8px;align-items:start}.driver-card-note-history{display:grid;gap:7px}.driver-card-note-history article{padding:10px;border:1px solid var(--line);border-radius:11px;background:rgba(8,16,25,.72)}.driver-card-note-history article>div{display:flex;gap:8px;align-items:center}.driver-card-note-history time{margin-left:auto;color:var(--muted);font-size:10px}.driver-card-note-history p{margin:7px 0}.driver-card-note-history small{color:var(--muted)}@media(max-width:1500px){.driver-workbench-layout{grid-template-columns:1fr}.driver-workbench-list{max-height:520px}.driver-workbench-card{position:static;max-height:none}}@media(max-width:900px){.driver-workbench-toolbar,.driver-workbench-controls{align-items:stretch;flex-direction:column;min-width:0}.driver-workbench-row{grid-template-columns:80px 1fr 120px}.driver-workbench-idle,.driver-workbench-badges{grid-column:auto}.driver-card-metrics,.driver-card-grid{grid-template-columns:1fr 1fr}.driver-card-fields,.driver-quick-note{grid-template-columns:1fr 1fr}.driver-quick-note textarea{grid-column:1/-1}}`;
    document.head.append(style);
  }
})();
