(() => {
  "use strict";

  const ASSIGNMENTS_KEY = "vixenDriverTruckAssignmentsV1";
  const SNAPSHOTS_KEY = "vixenFuelSnapshotsV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  let assignments = readObject(ASSIGNMENTS_KEY);
  let latestAnalysis = null;

  const api = Object.freeze({
    assignmentFor,
    listAssignments: () => Object.values(assignments).map((item) => ({ ...item })),
    saveAssignment,
    removeAssignment,
    searchHistory,
    captureSnapshot,
    refresh: render,
  });
  window.VixenDriverOperations = api;

  document.addEventListener("DOMContentLoaded", install);
  document.addEventListener("vixen:bootstrap-complete", install);
  document.addEventListener("vixen:analysis-rendered", (event) => {
    latestAnalysis = event.detail?.analysis || window.VixenCurrentAnalysis || null;
    captureSnapshot(latestAnalysis);
    populateDriverSelect();
    render();
  });

  function install() {
    if (document.getElementById("driverOperationsPanel")) return;
    const view = document.getElementById("driversView");
    if (!view) return;
    const panel = document.createElement("section");
    panel.id = "driverOperationsPanel";
    panel.className = "panel driver-operations-panel";
    panel.innerHTML = `
      <div class="driver-operations-heading"><div><span class="eyebrow">IDENTITY + RETRIEVAL</span><h3>Assignments and coaching history</h3></div><button id="toggleDriverOperations" class="button button-secondary" type="button">Open tools</button></div>
      <div id="driverOperationsBody" class="driver-operations-body hidden">
        <form id="driverAssignmentForm" class="driver-assignment-form">
          <label>Driver<select id="assignmentDriver" required><option value="">Load driver data first</option></select></label>
          <label>Truck number<input id="assignmentTruck" required inputmode="numeric" placeholder="123456" /></label>
          <label>Reason<input id="assignmentReason" placeholder="Manual confirmation or correction" /></label>
          <button class="button button-primary" type="submit">Save assignment</button>
        </form>
        <p class="driver-operations-help">A truck may have one or two drivers. Each driver keeps separate metrics and notes. Manual assignments override report evidence and can be removed.</p>
        <div id="assignmentList" class="assignment-list"></div>
        <div class="driver-history-toolbar"><input id="driverHistorySearch" type="search" placeholder="Search driver, truck, note, type, status, or date" /><span id="driverHistorySummary"></span></div>
        <div id="driverHistoryResults" class="driver-history-results"></div>
      </div>`;
    view.insertBefore(panel, view.querySelector(".table-shell"));
    bind();
    addStyles();
    latestAnalysis = window.VixenCurrentAnalysis || null;
    populateDriverSelect();
    render();
  }

  function bind() {
    document.getElementById("toggleDriverOperations")?.addEventListener("click", () => {
      const body = document.getElementById("driverOperationsBody");
      body?.classList.toggle("hidden");
      document.getElementById("toggleDriverOperations").textContent = body?.classList.contains("hidden") ? "Open tools" : "Close tools";
    });
    document.getElementById("driverAssignmentForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const option = document.getElementById("assignmentDriver")?.selectedOptions?.[0];
      const driver = validDrivers().find((item) => driverKey(item) === option?.value);
      const truck = normalizeTruck(document.getElementById("assignmentTruck")?.value);
      if (!driver || !truck) return;
      const occupants = Object.values(assignments).filter((item) => item.truck === truck && item.driverCode !== driver.driverCode);
      if (occupants.length >= 2) {
        window.alert("That truck already has two manually linked drivers. Remove or change one before adding another.");
        return;
      }
      saveAssignment({ driverCode: driver.driverCode, driverName: driver.driverName, truck, reason: document.getElementById("assignmentReason")?.value || "" });
      event.currentTarget.reset();
      requestRefresh();
    });
    document.getElementById("assignmentList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-assignment]");
      if (!button) return;
      removeAssignment(button.dataset.removeAssignment);
      requestRefresh();
    });
    let historyTimer = null;
    document.getElementById("driverHistorySearch")?.addEventListener("input", () => {
      window.clearTimeout(historyTimer);
      historyTimer = window.setTimeout(renderHistory, 120);
    });
  }

  function assignmentFor(driver) {
    if (!driver || typeof driver !== "object") return null;
    return assignments[driverKey(driver)] || null;
  }

  function saveAssignment(value) {
    const code = normalizeId(value?.driverCode);
    const name = clean(value?.driverName);
    const truck = normalizeTruck(value?.truck);
    if ((!code && !name) || !truck) return null;
    const key = code || normalizeName(name);
    const occupants = Object.entries(assignments).filter(([otherKey, item]) => otherKey !== key && item.truck === truck);
    if (occupants.length >= 2) return null;
    assignments[key] = { driverCode: code, driverName: name, truck, reason: clean(value?.reason), confirmedAt: new Date().toISOString(), source: "manual" };
    persist(ASSIGNMENTS_KEY, assignments);
    render();
    return { ...assignments[key] };
  }

  function removeAssignment(key) {
    if (!assignments[key]) return false;
    delete assignments[key];
    persist(ASSIGNMENTS_KEY, assignments);
    render();
    return true;
  }

  function captureSnapshot(analysis) {
    const records = validDrivers(analysis);
    const reportDate = analysis?.drivers?.currentDate;
    if (!Array.isArray(records) || !records.length || !(reportDate instanceof Date)) return false;
    const date = reportDate.toISOString().slice(0, 10);
    const snapshots = readArray(SNAPSHOTS_KEY);
    const snapshot = {
      date,
      capturedAt: new Date().toISOString(),
      drivers: records.filter((driver) => driver.driverCode && driver.assignedTruck).map((driver) => ({
        driverCode: driver.driverCode,
        driverName: driver.driverName,
        truck: driver.assignedTruck,
        idle7DayPct: driver.idle7DayPct,
        idle28DayPct: driver.idle28DayPct,
        excluded: Boolean(driver.idleExcluded),
      })),
    };
    const existing = snapshots.find((item) => item?.date === date);
    if (existing && JSON.stringify(existing.drivers || []) === JSON.stringify(snapshot.drivers)) return false;
    const next = [snapshot, ...snapshots.filter((item) => item?.date !== date)].slice(0, 120);
    persist(SNAPSHOTS_KEY, next);
    return true;
  }

  function searchHistory(query = "") {
    const needle = normalizeSearch(query);
    const results = [];
    const notes = readObject(DRIVER_NOTES_KEY);
    Object.values(notes).flatMap((items) => Array.isArray(items) ? items : []).filter((note) => note && typeof note === "object").forEach((note) => {
      const value = { domain: "Fuel note", ...note };
      if (!needle || normalizeSearch(Object.values(value).join(" ")).includes(needle)) results.push(value);
    });
    readArray(SNAPSHOTS_KEY).filter((snapshot) => snapshot && typeof snapshot === "object").forEach((snapshot) => (Array.isArray(snapshot.drivers) ? snapshot.drivers : []).filter((driver) => driver && typeof driver === "object").forEach((driver) => {
      const value = { domain: "Fuel snapshot", savedAt: snapshot.date, ...driver };
      if (!needle || normalizeSearch(Object.values(value).join(" ")).includes(needle)) results.push(value);
    }));
    return results.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, 250);
  }

  function populateDriverSelect() {
    const select = document.getElementById("assignmentDriver");
    if (!select) return;
    const records = validDrivers();
    select.innerHTML = '<option value="">Choose a driver</option>' + records.map((driver) => `<option value="${escapeHtml(driverKey(driver))}">${escapeHtml(driver.driverCode)} - ${escapeHtml(driver.driverName)}${driver.assignedTruck ? ` · ${escapeHtml(driver.assignedTruck)}` : ""}</option>`).join("");
  }

  function render() {
    const list = document.getElementById("assignmentList");
    if (list) list.innerHTML = Object.entries(assignments).map(([key, item]) => `<div class="assignment-row"><span><strong>${escapeHtml(item.truck)}</strong> - ${escapeHtml(item.driverName)} <small>${escapeHtml(item.driverCode)} · Manual${item.reason ? ` · ${escapeHtml(item.reason)}` : ""}</small></span><button type="button" data-remove-assignment="${escapeHtml(key)}">Remove override</button></div>`).join("") || '<div class="empty-state">No manual assignment overrides.</div>';
    renderHistory();
  }

  function renderHistory() {
    const container = document.getElementById("driverHistoryResults");
    if (!container) return;
    const results = searchHistory(document.getElementById("driverHistorySearch")?.value || "");
    document.getElementById("driverHistorySummary").textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;
    container.innerHTML = results.slice(0, 100).map((item) => `<article><strong>${escapeHtml(item.truck || "No truck")} - ${escapeHtml(item.driverName || item.driverCode || "Unknown driver")}</strong><small>${escapeHtml(item.domain)} · ${escapeHtml(item.recordType || item.followUpStatus || item.savedAt || "")}</small><p>${escapeHtml(item.text || `7-day ${percent(item.idle7DayPct)} · 28-day ${percent(item.idle28DayPct)}`)}</p></article>`).join("") || '<div class="empty-state">No matching fuel history.</div>';
  }

  function requestRefresh() { window.setTimeout(() => document.getElementById("refreshBtn")?.click(), 50); }
  function validDrivers(analysis = latestAnalysis) { return (Array.isArray(analysis?.drivers?.records) ? analysis.drivers.records : []).filter((driver) => driver && typeof driver === "object"); }
  function driverKey(driver) { return normalizeId(driver?.driverCode) || normalizeName(driver?.driverName); }
  function normalizeTruck(value) { return normalizeId(value); }
  function normalizeId(value) { return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function normalizeName(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function normalizeSearch(value) { return clean(value).toLowerCase(); }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function percent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "--"; }
  function readObject(key) { try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
  function readArray(key) { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function persist(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

  function addStyles() {
    if (document.getElementById("driverOperationsStyles")) return;
    const style = document.createElement("style");
    style.id = "driverOperationsStyles";
    style.textContent = `.driver-operations-panel{margin:0 0 16px;padding:16px}.driver-operations-heading{display:flex;align-items:center;justify-content:space-between}.driver-operations-heading h3{margin:3px 0}.driver-operations-body{margin-top:14px}.driver-assignment-form{display:grid;grid-template-columns:1.2fr .7fr 1.5fr auto;gap:10px;align-items:end}.driver-assignment-form label,.coaching-note-fields label,.pta-note-driver-field{display:grid;gap:5px;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase}.driver-assignment-form input,.driver-assignment-form select,.coaching-note-fields input,.coaching-note-fields select,.pta-note-driver-field select{box-sizing:border-box;width:100%;min-height:38px;padding:8px;border:1px solid var(--line);background:#081019;color:var(--white)}.driver-operations-help{color:var(--muted);font-size:11px}.assignment-list,.driver-history-results{display:grid;gap:7px}.assignment-row,.driver-history-results article{display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid var(--line);background:rgba(8,16,25,.7)}.assignment-row span,.driver-history-results article{display:grid}.assignment-row small,.driver-history-results small{color:var(--muted)}.assignment-row button{border:0;background:transparent;color:#fda4af;cursor:pointer}.driver-history-toolbar{display:flex;align-items:center;gap:12px;margin:16px 0 8px}.driver-history-toolbar input{flex:1;padding:10px;border:1px solid var(--line);background:#081019;color:var(--white)}.driver-history-results article p{margin:5px 0 0}.coaching-note-fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}.pta-note-driver-field{margin-bottom:9px}@media(max-width:1000px){.driver-assignment-form{grid-template-columns:1fr 1fr}.coaching-note-fields{grid-template-columns:1fr}}`;
    document.head.append(style);
  }
})();
