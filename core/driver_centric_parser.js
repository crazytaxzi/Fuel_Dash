(() => {
  "use strict";

  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const DEFAULT_NOW = () => new Date();

  const api = Object.freeze({
    build,
    normalizeIdentity,
    normalizeTruck,
    parseDateTime,
    sortRecords,
    riskFor,
    test: Object.freeze({ collectPtaRecords, buildLookup, matchOperationalRecord, inferLoadedStatus, inferPreplanStatus }),
  });

  globalObject.VixenDriverCentricParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  function build(analysis, options = {}) {
    const now = validDate(options.now) || DEFAULT_NOW();
    const drivers = cleanArray(analysis?.drivers?.records);
    const ptaRecords = collectPtaRecords(analysis?.pta, options.planningRecords);
    const apuRecords = cleanArray(analysis?.apu?.records);
    const missingBolRecords = cleanArray(options.missingBolRecords ?? globalObject.VixenMissingBolLive?.records);
    const overrides = plainObject(options.overrides);
    const driverNotes = plainObject(options.driverNotes);
    const ptaNotes = plainObject(options.ptaNotes);

    const ptaLookup = buildLookup(ptaRecords);
    const apuLookup = buildLookup(apuRecords);
    const bolByCode = groupBy(missingBolRecords, (record) => normalizeIdentity(record.driverCode));
    const records = [];
    const byDriver = new Map();
    const byTruck = new Map();

    for (let index = 0; index < drivers.length; index += 1) {
      const driver = drivers[index];
      const driverCode = clean(driver.driverCode);
      const driverName = clean(driver.driverName) || "Unknown driver";
      const key = driverKey(driverCode, driverName);
      const manualAssignment = globalObject.VixenDriverOperations?.assignmentFor?.(driver) || null;
      const truck = normalizeTruck(manualAssignment?.truck || driver.assignedTruck || driver.csvTruck || driver.unit || driver.truck);
      const override = plainObject(overrides[key] || (truck ? overrides[`truck:${truck}`] : null));
      const pta = matchOperationalRecord(ptaLookup, { driverCode, driverName, truck });
      const apu = matchOperationalRecord(apuLookup, { driverCode, driverName, truck });
      const sourcePtaAt = parseDateTime(firstValue(pta, ["pta", "ptaAt", "ptaDate", "projectedTimeAvailable", "availableAt", "readyAt", "date"]));
      const ptaAt = parseDateTime(override.ptaAt) || sourcePtaAt;
      const loadedStatus = normalizeLoadedStatus(override.loadedStatus) || inferLoadedStatus(pta);
      const preplanStatus = normalizePreplanStatus(override.preplanStatus) || inferPreplanStatus(pta);
      const risk = riskFor({ ptaAt, loadedStatus, preplanStatus, pta }, now);
      const notes = normalizeNotes(driverNotes[key]);
      const truckNotes = truck ? normalizeNotes(ptaNotes[truck]) : [];
      const missingBols = bolByCode.get(normalizeIdentity(driverCode)) || [];
      const currentIdlePct = firstFinite(driver.dailyIdlePct, driver.currentIdlePct, driver.idleTodayPct, driver.idlePct, driver.idle7DayPct);
      const record = {
        key,
        index,
        driver,
        driverCode,
        driverName,
        truck,
        assignmentSource: manualAssignment ? "manual" : clean(driver.assignmentSource || driver.assignmentStatus || (truck ? "report" : "missing")),
        currentIdlePct,
        idle7DayPct: finiteOrNull(driver.idle7DayPct),
        idle28DayPct: finiteOrNull(driver.idle28DayPct),
        dispatchMpg: finiteOrNull(driver.dispatchMpg),
        movingMpg: finiteOrNull(driver.movingMpg),
        oorPct: finiteOrNull(driver.oorPct),
        idleHours7Day: finiteOrNull(driver.idleHours7Day),
        engineHours7Day: finiteOrNull(driver.engineHours7Day),
        idleHours28Day: finiteOrNull(driver.idleHours28Day),
        engineHours28Day: finiteOrNull(driver.engineHours28Day),
        estimatedCost: finiteOrNull(driver.estimatedCost),
        excessGallons: finiteOrNull(driver.excessGallons),
        reviewLabel: clean(driver.reviewLabel || driver.priority || "Review"),
        focus: clean(driver.focus || driver.whatStandsOut),
        action: clean(driver.nextAction || driver.action),
        pta,
        ptaAt,
        sourcePtaAt,
        ptaDisplay: clean(firstValue(pta, ["timeText", "ptaText", "displayPta"])),
        loadedStatus,
        preplanStatus,
        destination: clean(firstValue(pta, ["destination", "dest", "nextDestination"])),
        ptaStatus: clean(firstValue(pta, ["status", "urgency", "state"])),
        planStatus: clean(firstValue(pta, ["planStatus", "plans", "plan", "preplan"])),
        ptaAction: clean(firstValue(pta, ["action", "nextAction", "notes"])),
        ptaIndex: Number.isInteger(pta?.index) ? pta.index : null,
        apu,
        missingBols,
        driverNotes: notes,
        ptaNotes: truckNotes,
        latestDriverNote: notes[0] || null,
        latestPtaNote: truckNotes[0] || null,
        override,
        riskRank: risk.rank,
        riskKey: risk.key,
        riskLabel: risk.label,
        needsAction: risk.rank <= 3 || !truck || !ptaAt || preplanStatus === "No Preplan" || loadedStatus === "Unloaded",
        searchText: normalizeSearch([
          driverName, driverCode, truck, loadedStatus, preplanStatus, risk.label,
          firstValue(pta, ["destination", "notes", "action", "status", "planStatus"]),
          notes.map((note) => note.text).join(" "),
        ].join(" ")),
      };
      records.push(record);
      byDriver.set(key, record);
      if (truck) {
        const occupants = byTruck.get(truck) || [];
        occupants.push(record);
        byTruck.set(truck, occupants);
      }
    }

    records.sort(sortRecords);
    return {
      records,
      byDriver,
      byTruck,
      generatedAt: now,
      stats: {
        drivers: records.length,
        assigned: records.filter((record) => record.truck).length,
        missingTruck: records.filter((record) => !record.truck).length,
        noPreplan: records.filter((record) => record.preplanStatus === "No Preplan").length,
        unloaded: records.filter((record) => record.loadedStatus === "Unloaded").length,
        overdue: records.filter((record) => record.riskKey.startsWith("overdue")).length,
        needsAction: records.filter((record) => record.needsAction).length,
      },
    };
  }

  function collectPtaRecords(pta, planningRecords) {
    const arrays = [
      pta?.allRecords,
      pta?.records,
      pta?.actionQueue,
      pta?.trackerRecords,
      pta?.finderRecords,
      pta?.overdue,
      pta?.dueSoon,
      planningRecords,
    ];
    const seen = new Set();
    const output = [];
    for (const record of arrays.flatMap(cleanArray)) {
      const signature = [
        normalizeTruck(record.truck || record.unit || record.tractor),
        normalizeIdentity(record.driverCode || record.driver || record.driverName),
        String(record.pta || record.ptaAt || record.projectedTimeAvailable || record.availableAt || record.readyAt || ""),
        clean(record.status || record.urgency || record.planStatus),
      ].join("|");
      if (seen.has(signature)) continue;
      seen.add(signature);
      output.push(record);
    }
    return output;
  }

  function buildLookup(records) {
    const byTruck = new Map();
    const byCode = new Map();
    const byName = new Map();
    for (const record of cleanArray(records)) {
      const truck = normalizeTruck(firstValue(record, ["truck", "unit", "tractor", "unitCode"]));
      const code = normalizeIdentity(firstValue(record, ["driverCode", "code", "driverCd"]));
      const name = normalizeIdentity(firstValue(record, ["driverName", "driver", "name"]));
      if (truck) pushMap(byTruck, truck, record);
      if (code) pushMap(byCode, code, record);
      if (name) pushMap(byName, name, record);
    }
    return { byTruck, byCode, byName, records: cleanArray(records) };
  }

  function matchOperationalRecord(lookup, identity) {
    if (!lookup) return null;
    const truck = normalizeTruck(identity.truck);
    const code = normalizeIdentity(identity.driverCode);
    const name = normalizeIdentity(identity.driverName);
    const candidates = uniqueRecords([
      ...(truck ? lookup.byTruck.get(truck) || [] : []),
      ...(code ? lookup.byCode.get(code) || [] : []),
      ...(name ? lookup.byName.get(name) || [] : []),
    ]);
    if (!candidates.length) return null;
    return candidates.sort((a, b) => operationalScore(b, identity) - operationalScore(a, identity)
      || dateScore(a) - dateScore(b))[0] || null;
  }

  function operationalScore(record, identity) {
    let score = 0;
    const truck = normalizeTruck(firstValue(record, ["truck", "unit", "tractor", "unitCode"]));
    const code = normalizeIdentity(firstValue(record, ["driverCode", "code", "driverCd"]));
    const name = normalizeIdentity(firstValue(record, ["driverName", "driver", "name"]));
    if (identity.truck && truck === normalizeTruck(identity.truck)) score += 100;
    if (identity.driverCode && code === normalizeIdentity(identity.driverCode)) score += 80;
    if (identity.driverName && name === normalizeIdentity(identity.driverName)) score += 60;
    if (record.needsAction) score += 8;
    if (String(record.urgencyKey || "").toLowerCase() === "critical") score += 5;
    return score;
  }

  function riskFor(value, now = DEFAULT_NOW()) {
    const ptaAt = parseDateTime(value.ptaAt);
    const noPreplan = value.preplanStatus === "No Preplan";
    const unloaded = value.loadedStatus === "Unloaded";
    if (!ptaAt) return { rank: 6, key: "missing-pta", label: "PTA missing" };
    const hours = (ptaAt.getTime() - now.getTime()) / 3600000;
    if (hours < 0 && noPreplan) return { rank: 0, key: "overdue-no-preplan", label: "Overdue · no preplan" };
    if (hours < 0) return { rank: 1, key: "overdue", label: "Overdue" };
    if (hours <= 48 && noPreplan) return { rank: 2, key: "due-no-preplan", label: "Due soon · no preplan" };
    if (hours <= 48 && unloaded) return { rank: 3, key: "due-unloaded", label: "Due soon · unloaded" };
    if (noPreplan) return { rank: 4, key: "future-no-preplan", label: "No preplan" };
    return { rank: 5, key: "planned", label: "Planned" };
  }

  function inferLoadedStatus(record) {
    const raw = clean(firstValue(record, ["loadedStatus", "loadStatus", "status", "state"])).toLowerCase();
    if (/\bunloaded\b|\bempty\b/.test(raw)) return "Unloaded";
    if (/\bloaded\b|\bdispatched\b|\bunder load\b/.test(raw)) return "Loaded";
    return "Unknown";
  }

  function inferPreplanStatus(record) {
    const direct = firstValue(record, ["hasPreplan", "preplanned"]);
    if (direct === true || direct === 1 || String(direct).toLowerCase() === "true") return "Preplan";
    if (direct === false || direct === 0 || String(direct).toLowerCase() === "false") return "No Preplan";
    const raw = clean(firstValue(record, ["preplanStatus", "planStatus", "preplan", "plans", "plan"])).toLowerCase();
    if (/no\s*preplan|no\s*plan|unplanned|needs\s*plan|none/.test(raw)) return "No Preplan";
    if (/preplan|planned|plan\s*#|order/.test(raw)) return "Preplan";
    return "Unknown";
  }

  function sortRecords(a, b) {
    return (a.riskRank - b.riskRank)
      || compareDates(a.ptaAt, b.ptaAt)
      || compareTruck(a.truck, b.truck)
      || a.driverName.localeCompare(b.driverName);
  }

  function dateScore(record) {
    const value = parseDateTime(firstValue(record, ["pta", "ptaAt", "projectedTimeAvailable", "availableAt", "readyAt", "date"]));
    return value ? value.getTime() : Number.POSITIVE_INFINITY;
  }

  function compareDates(a, b) {
    const aTime = validDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = validDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aTime - bTime;
  }

  function compareTruck(a, b) {
    return String(a || "~").localeCompare(String(b || "~"), undefined, { numeric: true, sensitivity: "base" });
  }

  function driverKey(code, name) {
    return normalizeIdentity(code) || normalizeIdentity(name) || "unknown-driver";
  }

  function normalizeIdentity(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizeTruck(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  function normalizeLoadedStatus(value) {
    const normalized = clean(value).toLowerCase();
    if (normalized === "loaded") return "Loaded";
    if (normalized === "unloaded") return "Unloaded";
    if (normalized === "unknown") return "Unknown";
    return "";
  }

  function normalizePreplanStatus(value) {
    const normalized = clean(value).toLowerCase().replace(/\s+/g, "");
    if (normalized === "preplan" || normalized === "planned") return "Preplan";
    if (normalized === "nopreplan" || normalized === "unplanned") return "No Preplan";
    if (normalized === "unknown") return "Unknown";
    return "";
  }

  function parseDateTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" && value > 20000 && value < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(epoch.getTime() + value * 86400000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const raw = clean(value);
    if (!raw || /^(?:n\/?a|none|unknown)$/i.test(raw)) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeNotes(value) {
    return cleanArray(value)
      .filter((note) => note && typeof note === "object")
      .sort((a, b) => String(b.savedAt || b.updatedAt || "").localeCompare(String(a.savedAt || a.updatedAt || "")));
  }

  function groupBy(records, keyFn) {
    const map = new Map();
    for (const record of cleanArray(records)) {
      const key = keyFn(record);
      if (key) pushMap(map, key, record);
    }
    return map;
  }

  function pushMap(map, key, value) {
    const items = map.get(key) || [];
    items.push(value);
    map.set(key, items);
  }

  function uniqueRecords(records) {
    return [...new Set(records.filter(Boolean))];
  }

  function firstValue(object, fields) {
    if (!object) return null;
    for (const field of fields) {
      const value = object[field];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
  }

  function firstFinite(...values) {
    for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function finiteOrNull(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function validDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  }

  function cleanArray(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearch(value) {
    return clean(value).toLowerCase();
  }
})();
