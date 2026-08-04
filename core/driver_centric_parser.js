(() => {
  "use strict";

  const OVERRIDE_KEY = "vixenDriverWorkbenchStateV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";

  const api = Object.freeze({
    build,
    sortRecords,
    priorityFor,
    normalizeIdentity,
    normalizeTruck,
    parseDateTime,
    test: Object.freeze({ buildRecord, selectPta, priorityFor }),
  });
  window.VixenDriverCentricParser = api;

  function build(analysis, options = {}) {
    const drivers = validRecords(analysis?.drivers?.records);
    const overrides = options.overrides || readObject(OVERRIDE_KEY);
    const driverNotes = options.driverNotes || readObject(DRIVER_NOTES_KEY);
    const ptaNotes = options.ptaNotes || readObject(PTA_NOTES_KEY);
    const ptaIndex = indexPta(validRecords(analysis?.pta?.allRecords));
    const apuIndex = indexApu(validRecords(analysis?.apu?.records));
    const bolIndex = indexMissingBols(validRecords(options.missingBolRecords || window.VixenMissingBolLive?.records));
    const now = options.now instanceof Date ? options.now : new Date();

    const records = drivers
      .filter((driver) => !driver.personalCategory)
      .map((driver, index) => buildRecord({
        driver,
        index,
        overrides,
        driverNotes,
        ptaNotes,
        ptaIndex,
        apuIndex,
        bolIndex,
        now,
      }));

    sortRecords(records);
    records.forEach((record, queueIndex) => { record.queueIndex = queueIndex; });

    const required = window.VixenReportContract?.required || ["rolling7Day", "driverDetails"];
    return {
      records,
      generatedAt: now,
      coverage: {
        mode: window.VixenReportContract?.mode || "driver-centric",
        required: [...required],
        optional: [...(window.VixenReportContract?.optional || [])],
        coreReady: required.every((role) => analysis?.files?.[role]),
        hasDetail: Boolean(analysis?.files?.detail),
        hasPta: Boolean(analysis?.pta?.hasData),
        hasApu: Boolean(analysis?.apu?.hasData),
        hasMissingBols: validRecords(options.missingBolRecords || window.VixenMissingBolLive?.records).length > 0,
      },
      summary: {
        drivers: records.length,
        assigned: records.filter((record) => record.truck).length,
        overdue: records.filter((record) => record.priorityKey.startsWith("overdue")).length,
        noPreplan: records.filter((record) => record.planStatus === "No Preplan").length,
        unloaded: records.filter((record) => record.loadStatus === "Unloaded").length,
      },
    };
  }

  function buildRecord(context) {
    const { driver, index, overrides, driverNotes, ptaNotes, ptaIndex, apuIndex, bolIndex, now } = context;
    const driverKey = normalizeIdentity(driver.driverCode || driver.driverName || `driver-${index}`);
    const manualAssignment = window.VixenDriverOperations?.assignmentFor?.(driver) || null;
    const truck = normalizeTruck(manualAssignment?.truck || driver.assignedTruck || driver.csvTruck || driver.unit || driver.truck);
    const legacyTruckKey = truck ? `truck:${truck}` : "";
    const override = overrides[driverKey] || (legacyTruckKey ? overrides[legacyTruckKey] : null) || {};
    const sourcePta = selectPta(driver, truck, ptaIndex);
    const pta = parseDateTime(override.pta) || parseDateTime(sourcePta?.pta);
    const loadStatus = normalizeLoadStatus(override.loadStatus || sourcePta?.status);
    const planStatus = normalizePlanStatus(override.planStatus || sourcePta?.planStatus || sourcePta?.plans);
    const destination = clean(override.destination || sourcePta?.destination);
    const operatingNote = clean(override.operatingNote);
    const priority = priorityFor({ pta, loadStatus, planStatus, now });
    const apu = lookupIdentity(driver, truck, apuIndex);
    const missingBols = lookupBols(driver, bolIndex);
    const savedDriverNotes = noteList(driverNotes, driverKey);
    const savedPtaNotes = mergeNotes(
      noteList(ptaNotes, driverKey),
      truck ? noteList(ptaNotes, truck) : [],
      truck ? noteList(ptaNotes, normalizeIdentity(truck)) : [],
    );
    const latestIdle = latestIdleMetric(driver);

    return {
      key: driverKey,
      sourceIndex: index,
      driver,
      driverCode: clean(driver.driverCode),
      driverName: clean(driver.driverName) || clean(driver.driverCode) || "Unknown driver",
      driverLeader: clean(driver.driverLeader) || "Unassigned",
      truck,
      assignmentStatus: manualAssignment ? "Manual assignment" : clean(driver.assignmentStatus) || (truck ? "Report assignment" : "Assignment missing"),
      idleExcluded: Boolean(driver.idleExcluded),
      currentIdlePct: latestIdle.value,
      currentIdleSource: latestIdle.source,
      idle7DayPct: finiteOrNull(driver.idle7DayPct),
      idle28DayPct: finiteOrNull(driver.idle28DayPct),
      dispatchMpg: finiteOrNull(driver.dispatchMpg),
      movingMpg: finiteOrNull(driver.movingMpg),
      oorPct: finiteOrNull(driver.oorPct),
      excessGallons: finiteOrNull(driver.excessGallons),
      estimatedCost: finiteOrNull(driver.estimatedCost),
      reviewLabel: clean(driver.reviewLabel) || "Review",
      focus: clean(driver.focus),
      action: clean(driver.action),
      pta,
      loadStatus,
      planStatus,
      destination,
      operatingNote,
      priorityKey: priority.key,
      priorityRank: priority.rank,
      priorityLabel: priority.label,
      hoursFromPta: priority.hoursFromPta,
      sourcePta,
      apu,
      missingBols,
      driverNotes: savedDriverNotes,
      ptaNotes: savedPtaNotes,
      latestNote: latestNote([...savedDriverNotes, ...savedPtaNotes]),
    };
  }

  function selectPta(driver, truck, index) {
    const candidates = uniqueRecords([
      ...lookupMap(index.byCode, driver?.driverCode),
      ...lookupMap(index.byName, driver?.driverName),
      ...lookupMap(index.byTruck, truck),
    ]);
    return candidates.sort(comparePta)[0] || null;
  }

  function indexPta(records) {
    const index = emptyIndex();
    records.forEach((record) => {
      add(index.byCode, record.driverCode, record);
      add(index.byName, record.driverName || record.driver, record);
      add(index.byTruck, record.truck, record);
    });
    return index;
  }

  function indexApu(records) {
    const index = emptyIndex();
    records.forEach((record) => {
      add(index.byCode, record.driverCode, record);
      add(index.byName, record.driverName, record);
      add(index.byTruck, record.unit || record.truck, record);
    });
    return index;
  }

  function indexMissingBols(records) {
    const byCode = new Map();
    records.forEach((record) => add(byCode, record.driverCode, record));
    return { byCode };
  }

  function lookupIdentity(driver, truck, index) {
    return uniqueRecords([
      ...lookupMap(index.byCode, driver?.driverCode),
      ...lookupMap(index.byName, driver?.driverName),
      ...lookupMap(index.byTruck, truck),
    ])[0] || null;
  }

  function lookupBols(driver, index) {
    return lookupMap(index.byCode, driver?.driverCode)
      .sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }

  function priorityFor({ pta, loadStatus, planStatus, now = new Date() }) {
    const ptaTime = pta instanceof Date && !Number.isNaN(pta.getTime()) ? pta.getTime() : null;
    const hoursFromPta = ptaTime === null ? null : (ptaTime - now.getTime()) / 3600000;
    const noPreplan = planStatus === "No Preplan";
    const unloaded = loadStatus === "Unloaded";

    if (hoursFromPta === null) return { key: "missing-pta", rank: 70, label: "PTA missing", hoursFromPta };
    if (hoursFromPta < 0 && noPreplan) return { key: "overdue-no-preplan", rank: 0, label: "Overdue · no preplan", hoursFromPta };
    if (hoursFromPta < 0) return { key: "overdue", rank: 10, label: "Overdue", hoursFromPta };
    if (hoursFromPta <= 48 && noPreplan) return { key: "due-no-preplan", rank: 20, label: "Due soon · no preplan", hoursFromPta };
    if (hoursFromPta <= 48 && unloaded) return { key: "due-unloaded", rank: 30, label: "Due soon · unloaded", hoursFromPta };
    if (noPreplan) return { key: "future-no-preplan", rank: 40, label: "Future · no preplan", hoursFromPta };
    return { key: "planned", rank: 50, label: "Planned", hoursFromPta };
  }

  function sortRecords(records) {
    return records.sort((a, b) => a.priorityRank - b.priorityRank
      || dateValue(a.pta) - dateValue(b.pta)
      || compareNatural(a.truck, b.truck)
      || a.driverName.localeCompare(b.driverName));
  }

  function latestIdleMetric(driver) {
    if (isFiniteNumber(driver?.dailyIdlePct)) return { value: driver.dailyIdlePct, source: "Daily" };
    if (isFiniteNumber(driver?.idle7DayPct)) return { value: driver.idle7DayPct, source: "7-day" };
    if (isFiniteNumber(driver?.idle28DayPct)) return { value: driver.idle28DayPct, source: "28-day" };
    return { value: null, source: "Not reported" };
  }

  function comparePta(a, b) {
    const aDate = dateValue(parseDateTime(a?.pta));
    const bDate = dateValue(parseDateTime(b?.pta));
    return aDate - bDate;
  }

  function noteList(groups, key) {
    const values = groups?.[key];
    return Array.isArray(values) ? values.filter((note) => note && typeof note === "object") : [];
  }

  function mergeNotes(...lists) {
    const seen = new Set();
    return lists.flat().filter((note) => {
      const key = clean(note.id) || `${clean(note.savedAt)}|${clean(note.text)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => dateValue(b.savedAt) - dateValue(a.savedAt));
  }

  function latestNote(notes) {
    return [...notes].sort((a, b) => dateValue(b.savedAt) - dateValue(a.savedAt))[0] || null;
  }

  function emptyIndex() {
    return { byCode: new Map(), byName: new Map(), byTruck: new Map() };
  }

  function add(map, value, record) {
    const key = map === undefined ? "" : normalizeIdentity(value);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }

  function lookupMap(map, value) {
    const key = normalizeIdentity(value);
    return key ? map.get(key) || [] : [];
  }

  function uniqueRecords(records) {
    return [...new Set(records.filter(Boolean))];
  }

  function validRecords(value) {
    return Array.isArray(value) ? value.filter((record) => record && typeof record === "object") : [];
  }

  function normalizeLoadStatus(value) {
    const source = clean(value).toLowerCase();
    if (/unloaded|available|empty/.test(source)) return "Unloaded";
    if (/loaded|dispatched/.test(source)) return "Loaded";
    return "Unknown";
  }

  function normalizePlanStatus(value) {
    const source = clean(value).toLowerCase();
    if (/no\s*preplan|no\s*plan|unplanned/.test(source)) return "No Preplan";
    if (/preplan|planned|plan/.test(source)) return "Preplan";
    return "Unknown";
  }

  function parseDateTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (value === null || value === undefined || value === "") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateValue(value) {
    const date = parseDateTime(value);
    return date ? date.getTime() : Number.POSITIVE_INFINITY;
  }

  function normalizeIdentity(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizeTruck(value) {
    const truck = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
    return truck === "*" ? "" : truck;
  }

  function compareNatural(a, b) {
    return clean(a).localeCompare(clean(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function finiteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
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
