"use strict";

self.onmessage = (event) => {
  const previous = event.data?.previous || {};
  const current = event.data?.current || {};
  self.postMessage({ changes: analyze(previous, current) });
};

function analyze(previous, current) {
  const oldRecords = Array.isArray(previous.records) ? previous.records : [];
  const newRecords = Array.isArray(current.records) ? current.records : [];
  const oldByTruck = groupByTruck(oldRecords);
  const newByTruck = groupByTruck(newRecords);
  const changes = [];

  newByTruck.forEach((records, truckKey) => {
    if (records.length > 1) {
      changes.push(change(records[0], "high", "duplicate-truck", `Truck ${records[0].truck || truckKey} appears ${records.length} times in the latest paste.`, `${records.length} rows`, `${records.length} rows`));
    }
  });

  const driverAssignments = new Map();
  newRecords.forEach((record) => {
    const driverKey = normalize(record.driver);
    if (!driverKey) return;
    const trucks = driverAssignments.get(driverKey) || new Set();
    trucks.add(record.truck || record.truckKey);
    driverAssignments.set(driverKey, trucks);
  });
  driverAssignments.forEach((trucks, driverKey) => {
    if (trucks.size > 1) {
      changes.push({
        truck: [...trucks].join(", "),
        driver: driverKey,
        severity: "high",
        type: "driver-multiple-trucks",
        summary: `The same driver appears on ${trucks.size} trucks in the latest paste.`,
        previousValue: "One active truck expected",
        currentValue: [...trucks].join(", "),
      });
    }
  });

  newByTruck.forEach((records, truckKey) => {
    const record = records[0];
    const old = oldByTruck.get(truckKey)?.[0];
    if (!old) return;

    const oldTime = Date.parse(old.ptaIso || "");
    const newTime = Date.parse(record.ptaIso || "");
    if (Number.isFinite(oldTime) && Number.isFinite(newTime)) {
      const deltaHours = (newTime - oldTime) / 3600000;
      if (deltaHours <= -2) {
        changes.push(change(record, Math.abs(deltaHours) >= 12 ? "high" : "medium", "pta-moved-earlier", `PTA moved earlier by ${Math.abs(deltaHours).toFixed(1)} hours.`, old.ptaDisplay, record.ptaDisplay));
      } else if (deltaHours >= 12) {
        changes.push(change(record, deltaHours >= 24 ? "high" : "medium", "pta-moved-later", `PTA moved later by ${deltaHours.toFixed(1)} hours.`, old.ptaDisplay, record.ptaDisplay));
      }
    } else if (old.ptaIso && !record.ptaIso) {
      changes.push(change(record, "high", "pta-removed", "A previously valid PTA is now missing or unreadable.", old.ptaDisplay, record.ptaDisplay));
    }

    if (old.driver && record.driver && normalize(old.driver) !== normalize(record.driver)) {
      changes.push(change(record, "medium", "driver-change", `Driver changed from ${old.driver} to ${record.driver}.`, old.driver, record.driver));
    }

    if (hasPlan(old.planStatus) && !hasPlan(record.planStatus)) {
      changes.push(change(record, "high", "plan-removed", "A previously reported plan is now missing or marked no preplan.", old.planStatus, record.planStatus || "No plan reported"));
    }

    const oldStatus = normalize(old.status);
    const newStatus = normalize(record.status);
    if (oldStatus && !newStatus) {
      changes.push(change(record, "medium", "status-removed", "Truck status disappeared from the latest paste.", old.status, "Blank"));
    }
  });

  oldByTruck.forEach((records, truckKey) => {
    if (newByTruck.has(truckKey)) return;
    const record = records[0];
    const pta = Date.parse(record.ptaIso || "");
    const hoursFromNow = Number.isFinite(pta) ? (pta - Date.now()) / 3600000 : null;
    if (hoursFromNow === null || hoursFromNow <= 48) {
      changes.push(change(record, hoursFromNow !== null && hoursFromNow <= 0 ? "high" : "medium", "truck-disappeared", "Truck disappeared from the latest PTA paste while it was still operationally relevant.", record.ptaDisplay || record.status || "Previously present", "Missing from latest paste"));
    }
  });

  return dedupe(changes);
}

function groupByTruck(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = normalize(record.truckKey || record.truck);
    if (!key) return;
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  });
  return groups;
}

function change(record, severity, type, summary, previousValue, currentValue) {
  return {
    truck: record.truck || record.truckKey || "Unknown truck",
    driver: record.driver || "",
    severity,
    type,
    summary,
    previousValue: previousValue || "",
    currentValue: currentValue || "",
  };
}

function dedupe(changes) {
  const seen = new Set();
  return changes.filter((item) => {
    const key = [item.truck, item.type, item.summary].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function hasPlan(value) {
  const normalized = normalize(value);
  return Boolean(normalized) && !/(NO PREPLAN|NO PLAN|UNKNOWN|NONE|MISSING)/.test(normalized);
}
