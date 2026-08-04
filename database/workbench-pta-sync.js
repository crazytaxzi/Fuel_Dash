(() => {
  "use strict";

  const ACTIVE_KEY = "vixenManualPtaActive";
  const TEXT_KEY = "vixenManualPtaText";
  const SAVED_AT_KEY = "vixenManualPtaSavedAt";
  const OVERRIDE_KEY = "vixenDriverWorkbenchStateV1";
  const WATCHED_KEYS = new Set([ACTIVE_KEY, TEXT_KEY, SAVED_AT_KEY]);
  const SOON_HOURS = 48;
  let analysis = null;
  let baselinePta = null;
  let syncVersion = 0;
  let syncTimer = null;

  const api = Object.freeze({
    sync,
    applySnapshot,
    adaptSnapshot,
    reconcileOverrides,
  });
  window.VixenWorkbenchPtaSync = api;

  document.addEventListener("vixen:analysis-rendered", (event) => {
    analysis = event.detail?.analysis || window.VixenCurrentAnalysis || null;
    if (event.detail?.source === "pta-sync") return;
    if (analysis?.pta && !analysis.pta.manualPaste) baselinePta = analysis.pta;
    scheduleSync("analysis-rendered");
  });
  document.addEventListener("vixen:bootstrap-complete", () => scheduleSync("bootstrap-complete"));
  window.addEventListener("fuel-dashboard-database-change", (event) => {
    const action = String(event.detail?.action || "");
    const key = String(event.detail?.key || "");
    if (["pta-snapshot", "pta-snapshot-delete", "pta-history-clear"].includes(action) || WATCHED_KEYS.has(key)) scheduleSync(action || key);
  });

  function scheduleSync(reason) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => { void sync(reason); }, 0);
  }

  async function sync(reason = "manual") {
    const version = ++syncVersion;
    analysis = window.VixenCurrentAnalysis || analysis;
    if (!analysis) return false;

    const active = localStorage.getItem(ACTIVE_KEY) === "true";
    const db = window.FuelDashboardDb;
    const currentText = String(localStorage.getItem(TEXT_KEY) || "").trim();

    if (!active && String(reason) !== "pta-snapshot") {
      if (baselinePta) analysis.pta = baselinePta;
      publishAnalysis("file-source", reason);
      emit("file-source", 0, reason, 0);
      return true;
    }

    if (active && currentText && typeof db?.parsePtaText === "function") {
      const parsed = db.parsePtaText(currentText);
      if (parsed?.records?.length) {
        return applySnapshot({
          id: "current-manual-pta",
          savedAt: isoFromMillis(localStorage.getItem(SAVED_AT_KEY)),
          source: "manual-paste",
          records: parsed.records,
        }, reason);
      }
    }

    if (!db?.listPtaSnapshots) return false;
    await db.ready;
    const snapshot = (await db.listPtaSnapshots({ limit: 1 }))[0] || null;
    if (version !== syncVersion || !snapshot) return false;
    return applySnapshot(snapshot, reason);
  }

  function applySnapshot(snapshot, reason = "pta-update") {
    analysis = window.VixenCurrentAnalysis || analysis;
    if (!analysis || !snapshot?.records?.length) return false;
    const effectiveSnapshot = {
      ...snapshot,
      savedAt: normalizeSnapshotSavedAt(snapshot.savedAt),
    };
    if (analysis.pta && !analysis.pta.manualPaste) baselinePta = analysis.pta;
    const overridesCleared = reconcileOverrides(effectiveSnapshot);
    analysis.pta = adaptSnapshot(effectiveSnapshot, analysis.pta);
    publishAnalysis(effectiveSnapshot.id || "pta-snapshot", reason);
    emit(effectiveSnapshot.id || "pta-snapshot", effectiveSnapshot.records.length, reason, overridesCleared);
    return true;
  }

  function publishAnalysis(snapshotId, reason) {
    window.VixenCurrentAnalysis = analysis;
    document.dispatchEvent(new CustomEvent("vixen:analysis-rendered", {
      detail: { analysis, source: "pta-sync", snapshotId, reason },
    }));
  }

  function reconcileOverrides(snapshot) {
    const snapshotTime = Date.parse(snapshot?.savedAt || "");
    if (!Number.isFinite(snapshotTime)) return 0;
    const values = readObject(OVERRIDE_KEY);
    let cleared = 0;
    let changed = false;

    Object.entries(values).forEach(([key, original]) => {
      if (!original || typeof original !== "object" || Array.isArray(original)) return;
      const stateTime = Date.parse(original.updatedAt || "");
      if (Number.isFinite(stateTime) && stateTime >= snapshotTime) return;
      const state = { ...original };
      const fields = ["pta", "loadStatus", "planStatus", "destination"];
      let rowChanged = false;
      fields.forEach((field) => {
        if (!(field in state)) return;
        delete state[field];
        rowChanged = true;
      });
      if (!rowChanged) return;
      const meaningfulKeys = Object.keys(state).filter((field) => field !== "updatedAt");
      if (meaningfulKeys.length) values[key] = state;
      else delete values[key];
      changed = true;
      cleared += 1;
    });

    if (changed) {
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(values));
      document.dispatchEvent(new CustomEvent("vixen:workbench-state-changed", {
        detail: { key: OVERRIDE_KEY, source: "pta-sync", cleared },
      }));
    }
    return cleared;
  }

  function adaptSnapshot(snapshot, previous = {}) {
    const now = new Date();
    const records = (snapshot.records || []).map((record, index) => decorateRecord({
      index,
      sourceType: "database-snapshot",
      sourceName: "PTA Update",
      sourceRow: Number(record.rowNumber) || index + 2,
      snapshotId: snapshot.id || "",
      snapshotSavedAt: snapshot.savedAt || "",
      truck: clean(record.truck),
      division: clean(record.division),
      driver: clean(record.driver),
      driverName: clean(record.driver),
      pta: parseDate(record.ptaIso || record.ptaRaw),
      status: clean(record.status),
      planStatus: clean(record.planStatus),
      plan: "",
      team: clean(record.team),
      destination: clean(record.destination),
      om: numberOrNull(record.om),
      count: numberOrNull(record.count),
      notes: "",
    }, now));

    const overdue = records.filter((record) => record.overdueHours > 0).sort(comparePta);
    const overdueNoPreplan = overdue.filter((record) => /no\s*preplan|no\s*plan|unplanned/i.test(record.planStatus));
    const availableSoon = records.filter((record) => record.hoursUntilPta >= 0 && record.hoursUntilPta <= SOON_HOURS
      && record.noPreplan && /available|unloaded|empty/i.test(record.status));
    const dispatchedSoon = records.filter((record) => record.hoursUntilPta >= 0 && record.hoursUntilPta <= SOON_HOURS
      && record.noPreplan && /loaded|dispatched/i.test(record.status));
    const actionQueue = records.filter((record) => record.needsAction).sort(comparePta);
    const byDriver = new Map();
    records.forEach((record) => {
      const key = normalize(record.driver);
      if (!key) return;
      const existing = byDriver.get(key);
      if (!existing || comparePta(record, existing) < 0) byDriver.set(key, record);
    });

    return {
      ...previous,
      hasData: records.length > 0,
      trackerRecords: records,
      overdue,
      overdueNoPreplan,
      availableSoon,
      dispatchedSoon,
      actionQueue,
      allRecords: records,
      byDriver,
      now,
      soonWindowHours: SOON_HOURS,
      manualPaste: true,
      dynamicWorkbenchSource: true,
      snapshotId: snapshot.id || "",
      snapshotSavedAt: snapshot.savedAt || "",
      sourceNames: { tracker: "PTA Update", finder: "PTA Update · derived queues" },
      summary: {
        trackerRows: records.length,
        overdue: overdue.length,
        critical: overdue.filter((record) => record.overdueHours >= 24).length,
        high: overdue.filter((record) => record.overdueHours >= 8 && record.overdueHours < 24).length,
        overdueNoPreplan: overdueNoPreplan.length,
        availableSoon: availableSoon.length,
        dispatchedSoon: dispatchedSoon.length,
        actionCount: actionQueue.length,
      },
    };
  }

  function decorateRecord(record, now) {
    const ptaTime = record.pta?.getTime?.();
    const hoursUntilPta = Number.isFinite(ptaTime) ? (ptaTime - now.getTime()) / 3600000 : Number.POSITIVE_INFINITY;
    const overdueHours = Number.isFinite(hoursUntilPta) && hoursUntilPta < 0 ? Math.abs(hoursUntilPta) : 0;
    const noPreplan = /no\s*preplan|no\s*plan|unplanned/i.test(record.planStatus);
    let urgency = "Future";
    let urgencyKey = "future";
    if (!Number.isFinite(hoursUntilPta)) { urgency = "PTA missing"; urgencyKey = "missing"; }
    else if (overdueHours >= 24) { urgency = "Critical"; urgencyKey = "critical"; }
    else if (overdueHours >= 8) { urgency = "High"; urgencyKey = "high"; }
    else if (overdueHours >= 2) { urgency = "Medium"; urgencyKey = "medium"; }
    else if (overdueHours > 0) { urgency = "New overdue"; urgencyKey = "new-overdue"; }
    else if (hoursUntilPta <= SOON_HOURS) { urgency = "Due soon"; urgencyKey = "due-soon"; }

    let action = "Monitor; no dispatch action is due yet.";
    let needsAction = false;
    if (overdueHours > 0 && noPreplan) { action = "Find or confirm the next load now."; needsAction = true; }
    else if (overdueHours > 0) { action = "Confirm the current plan and driver readiness."; needsAction = true; }
    else if (hoursUntilPta <= SOON_HOURS && noPreplan) { action = "Build or confirm a preplan before PTA."; needsAction = true; }

    return {
      ...record,
      overdueHours,
      hoursUntilPta,
      noPreplan,
      urgency,
      urgencyKey,
      timeText: !Number.isFinite(hoursUntilPta)
        ? "PTA not reported"
        : overdueHours > 0
          ? `${formatHours(overdueHours)} hr past PTA`
          : `${formatHours(hoursUntilPta)} hr until PTA`,
      action,
      needsAction,
    };
  }

  function comparePta(a, b) {
    const urgency = { critical: 0, high: 1, medium: 2, "new-overdue": 3, "due-soon": 4, future: 5, missing: 6 };
    return (urgency[a.urgencyKey] ?? 9) - (urgency[b.urgencyKey] ?? 9)
      || (a.pta?.getTime?.() ?? Number.POSITIVE_INFINITY) - (b.pta?.getTime?.() ?? Number.POSITIVE_INFINITY)
      || clean(a.truck).localeCompare(clean(b.truck), undefined, { numeric: true });
  }

  function emit(snapshotId, rowCount, reason, overridesCleared) {
    document.dispatchEvent(new CustomEvent("vixen:workbench-pta-synced", {
      detail: { snapshotId, rowCount, reason, overridesCleared },
    }));
  }

  function normalizeSnapshotSavedAt(value) {
    const date = parseDate(value);
    return date ? date.toISOString() : new Date().toISOString();
  }

  function parseDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isoFromMillis(value) {
    const millis = Number(value);
    return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : new Date().toISOString();
  }

  function numberOrNull(value) {
    const cleaned = String(value ?? "").replace(/[$,%\s,]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatHours(value) {
    return Number(value).toFixed(Math.abs(value) >= 10 ? 0 : 1);
  }

  function normalize(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }
})();
