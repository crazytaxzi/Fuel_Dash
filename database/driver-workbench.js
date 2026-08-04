(() => {
  "use strict";

  const OVERRIDE_KEY = "vixenDriverWorkbenchStateV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  let analysis = null;
  let model = null;
  let selectedKey = "";
  let installed = false;

  window.VixenDriverWorkbench = Object.freeze({ refresh, selectDriver, current: selectedRecord });
  document.addEventListener("DOMContentLoaded", install);
  document.addEventListener("vixen:bootstrap-complete", install);
  document.addEventListener("vixen:analysis-rendered", (event) => { analysis = event.detail?.analysis || window.VixenCurrentAnalysis; refresh(); });
  document.addEventListener("vixen:driver-assignment-changed", refresh);
  document.addEventListener("vixen:workbench-state-changed", refresh);
  window.addEventListener("storage", (event) => { if ([OVERRIDE_KEY, DRIVER_NOTES_KEY, PTA_NOTES_KEY].includes(event.key)) refresh(); });

  function install() {
    if (installed) return;
    const view = document.getElementById("driversView");
    if (!view || !window.VixenDriverWorkbenchRender) return;
    installed = true;
    const heading = view.querySelector(".view-heading");
    const navButton = document.querySelector('[data-view="drivers"]');
    if (navButton) navButton.innerHTML = "<span>◉</span>Driver Workbench";
    const connectCopy = document.querySelector("#connectOverlay .connect-card p");
    if (connectCopy) connectCopy.textContent = "Core reports: Rolling 7 Day and Driver Details. Add Detail, Missing BOL, PTA, or APU reports only when you need their extra evidence.";
    heading?.querySelector("h2") && (heading.querySelector("h2").textContent = "Driver + Truck Workbench");
    heading?.querySelector(".eyebrow") && (heading.querySelector(".eyebrow").textContent = "ONE DRIVER · ONE TRUCK · ONE WORKFLOW");
    const search = heading?.querySelector(".table-search");
    if (search) { search.removeAttribute("data-table"); search.placeholder = "Search driver, code, truck, PTA, or status…"; search.addEventListener("input", render); }
    view.querySelector(".table-explainer")?.classList.add("driver-legacy-surface");
    view.querySelector(".table-shell")?.classList.add("driver-legacy-surface");
    const shell = document.createElement("section");
    shell.id = "driverWorkbench";
    shell.className = "driver-workbench";
    shell.innerHTML = '<div id="driverWorkbenchContract" class="driver-workbench-contract"></div><div class="driver-workbench-layout"><aside class="driver-workbench-queue-panel"><div class="driver-workbench-queue-heading"><div><span>PTA PRIORITY</span><strong id="driverWorkbenchCount">0 drivers</strong></div><small>Overdue and unplanned first</small></div><div id="driverWorkbenchQueue" class="driver-workbench-queue"></div></aside><main id="driverWorkbenchCard" class="driver-workbench-card"><div class="empty-state">Load the two core driver reports to begin.</div></main></div>';
    view.append(shell);
    shell.addEventListener("click", handleClick);
    shell.addEventListener("submit", handleSubmit);
    document.addEventListener("click", handleLegacyOpen, true);
    installStyles();
    bridgeDashboardWorkflow();
    analysis = window.VixenCurrentAnalysis || analysis;
    refresh();
  }

  function refresh() {
    if (!installed) install();
    if (!installed || !analysis || !window.VixenDriverCentricParser) return;
    model = window.VixenDriverCentricParser.build(analysis);
    if (!model.records.some((record) => record.key === selectedKey)) selectedKey = model.records[0]?.key || "";
    render();
  }

  function render() {
    if (!model) return;
    const renderer = window.VixenDriverWorkbenchRender;
    renderer.contract(document.getElementById("driverWorkbenchContract"), model);
    const needle = normalize(document.querySelector('#driversView .view-heading input[type="search"]')?.value);
    const records = model.records.filter((record) => !needle || normalize([record.driverName, record.driverCode, record.truck, record.priorityLabel, record.loadStatus, record.planStatus, record.destination].join(" ")).includes(needle));
    const count = document.getElementById("driverWorkbenchCount");
    if (count) count.textContent = `${records.length} driver${records.length === 1 ? "" : "s"}`;
    renderer.queue(document.getElementById("driverWorkbenchQueue"), records, selectedKey);
    renderer.card(document.getElementById("driverWorkbenchCard"), selectedRecord());
  }

  function selectDriver(identity) {
    const record = findRecord(identity);
    if (!record) return false;
    selectedKey = record.key;
    document.querySelector('[data-view="drivers"]')?.click();
    render();
    document.getElementById("driverWorkbench")?.scrollIntoView?.({ block: "start" });
    return true;
  }

  function handleClick(event) {
    const row = event.target.closest("[data-driver-workbench-key]");
    if (row) { selectedKey = row.dataset.driverWorkbenchKey; return render(); }
    if (event.target.closest("[data-save-next]")) { event.preventDefault(); saveOperations(document.getElementById("driverOperationsForm"), true); }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (event.target.id === "driverOperationsForm") saveOperations(event.target, false);
    if (event.target.id === "driverWorkbenchNoteForm") saveDriverNote(event.target);
  }

  function saveOperations(form, moveNext) {
    const record = selectedRecord();
    if (!record || !form) return;
    const data = new FormData(form);
    const truck = normalizeTruck(data.get("truck"));
    if (truck) {
      const saved = window.VixenDriverOperations?.saveAssignment?.({ driverCode: record.driverCode, driverName: record.driverName, truck, reason: "Driver workbench" });
      if (!saved) return notify("Truck assignment could not be saved; that truck may already have two drivers.", true);
    } else if (record.truck) window.VixenDriverOperations?.removeAssignment?.(record.driver);
    const values = readObject(OVERRIDE_KEY);
    const state = {
      pta: clean(data.get("pta")), loadStatus: clean(data.get("loadStatus")), planStatus: clean(data.get("planStatus")),
      destination: clean(data.get("destination")), operatingNote: clean(data.get("operatingNote")), updatedAt: new Date().toISOString(),
    };
    values[record.key] = state;
    writeObject(OVERRIDE_KEY, values);
    saveOperatingNote(record, truck || record.truck, state);
    const oldKey = record.key;
    refresh();
    if (moveNext) selectNext(oldKey);
    notify("Saved. Queue priority recalculated.");
  }

  function saveOperatingNote(record, truck, state) {
    if (!state.operatingNote || !truck) return;
    const groups = readObject(PTA_NOTES_KEY);
    const existing = Array.isArray(groups[record.key]) ? groups[record.key] : [];
    if (existing[0]?.text === state.operatingNote && existing[0]?.status === state.loadStatus && existing[0]?.planStatus === state.planStatus) return;
    const note = {
      id: id(), text: state.operatingNote, savedAt: new Date().toISOString(), driver: record.driverName, driverName: record.driverName,
      driverCode: record.driverCode, truck, domain: "pta", pta: state.pta ? new Date(state.pta).toISOString() : "",
      status: state.loadStatus, planStatus: state.planStatus, destination: state.destination,
    };
    groups[record.key] = [note, ...existing].slice(0, 75);
    writeObject(PTA_NOTES_KEY, groups);
    window.VixenWorkedWorkflow?.setNoteComplete?.("pta", note.id, false);
  }

  function saveDriverNote(form) {
    const record = selectedRecord();
    if (!record?.truck) return notify("Assign a truck before saving a driver follow-up.", true);
    const data = new FormData(form);
    const text = clean(data.get("text"));
    if (!text) return notify("Type a follow-up note first.", true);
    const groups = readObject(DRIVER_NOTES_KEY);
    const existing = Array.isArray(groups[record.key]) ? groups[record.key] : [];
    const note = {
      id: id(), text, savedAt: new Date().toISOString(), driverName: record.driverName, driverCode: record.driverCode,
      truck: record.truck, assignedTruck: record.truck, domain: "fuel", recordType: clean(data.get("recordType")) || "Coaching",
      followUpStatus: clean(data.get("followUpStatus")) || "Open", idle7DayPct: record.idle7DayPct,
      idle28DayPct: record.idle28DayPct, estimatedCost: record.estimatedCost,
    };
    groups[record.key] = [note, ...existing].slice(0, 75);
    writeObject(DRIVER_NOTES_KEY, groups);
    window.VixenWorkedWorkflow?.setNoteComplete?.("driver", note.id, false);
    form.reset();
    refresh();
    notify(`Follow-up saved for ${record.truck} — ${record.driverName}.`);
  }

  function selectNext(key) {
    const index = model?.records?.findIndex((record) => record.key === key) ?? -1;
    selectedKey = (model?.records?.[index + 1] || model?.records?.[0])?.key || "";
    render();
  }

  function handleLegacyOpen(event) {
    const driverTrigger = event.target.closest("[data-driver-index]");
    const ptaTrigger = event.target.closest("[data-pta-index]");
    const workedTrigger = event.target.closest(".worked-card-open");
    const heroTrigger = event.target.closest("#heroDriverDetailsBtn");
    if (!driverTrigger && !ptaTrigger && !workedTrigger && !heroTrigger) return;

    let record = null;
    if (driverTrigger) record = model?.records?.find((item) => item.sourceIndex === Number(driverTrigger.dataset.driverIndex));
    else if (ptaTrigger) record = model?.records?.find((item) => Number(item.sourcePta?.index) === Number(ptaTrigger.dataset.ptaIndex));
    else if (workedTrigger) {
      const card = workedTrigger.closest("[data-worked-type]");
      const identity = card?.dataset.workedIdentity || card?.textContent;
      record = findRecord(identity);
    } else if (heroTrigger) record = model?.records?.[0] || null;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (record) selectDriver(record.key);
    else notify("That item is not in the current driver reports. Its saved note remains available.", true);
  }

  function findRecord(identity) {
    const wanted = normalize(identity);
    return model?.records?.find((item) => [item.key, item.driverCode, item.driverName, item.truck]
      .some((value) => normalize(value) === wanted || (wanted && normalize(value).includes(wanted)))) || null;
  }

  function bridgeDashboardWorkflow() {
    const previous = window.VixenDashboardWorkflow;
    if (!previous || previous.__driverWorkbench) return;
    window.VixenDashboardWorkflow = Object.freeze({
      __driverWorkbench: true,
      getAttentionTasks: previous.getAttentionTasks?.bind(previous),
      openTask(type, index) {
        const record = type === "driver"
          ? model?.records?.find((item) => item.sourceIndex === Number(index))
          : model?.records?.find((item) => Number(item.sourcePta?.index) === Number(index));
        return record ? selectDriver(record.key) : previous.openTask?.(type, index);
      },
    });
  }

  function selectedRecord() { return model?.records?.find((record) => record.key === selectedKey) || null; }
  function installStyles() { if (document.querySelector("link[data-driver-workbench-styles]")) return; const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "database/driver-workbench.css?v=3.22.0"; link.dataset.driverWorkbenchStyles = "true"; document.head.append(link); }
  function notify(message, error = false) { const toast = document.getElementById("toast"); if (!toast) return; toast.textContent = message; toast.classList.toggle("error", error); toast.classList.add("show"); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove("show"), 3200); }
  function readObject(key) { try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
  function writeObject(key, value) { localStorage.setItem(key, JSON.stringify(value)); document.dispatchEvent(new CustomEvent("vixen:workbench-state-changed", { detail: { key } })); }
  function normalize(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function normalizeTruck(value) { const truck = clean(value).toUpperCase().replace(/[^A-Z0-9]/g, ""); return truck === "*" ? "" : truck; }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function id() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
})();
