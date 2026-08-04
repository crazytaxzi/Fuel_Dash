(() => {
  "use strict";

  const STORAGE_KEY = "vixenDriverTruckAssignmentsV1";
  let assignments = readObject();

  const api = Object.freeze({
    assignmentFor,
    listAssignments: () => Object.values(assignments).map((item) => ({ ...item })),
    saveAssignment,
    removeAssignment,
  });

  window.VixenDriverAssignments = api;
  window.VixenDriverOperations = api;

  function assignmentFor(driver) {
    const key = driverKey(driver);
    return key && assignments[key] ? { ...assignments[key] } : null;
  }

  function saveAssignment(value) {
    const driverCode = normalizeId(value?.driverCode);
    const driverName = clean(value?.driverName);
    const truck = normalizeId(value?.truck);
    const key = driverCode || normalizeName(driverName);
    if (!key || !truck) return null;

    const otherOccupants = Object.entries(assignments)
      .filter(([otherKey, item]) => otherKey !== key && item?.truck === truck);
    if (otherOccupants.length >= 2) return null;

    assignments[key] = {
      driverCode,
      driverName,
      truck,
      reason: clean(value?.reason),
      confirmedAt: new Date().toISOString(),
      source: "manual",
    };
    persist();
    notify("saved", assignments[key]);
    return { ...assignments[key] };
  }

  function removeAssignment(value) {
    const key = typeof value === "string" ? normalizeId(value) || normalizeName(value) : driverKey(value);
    if (!key || !assignments[key]) return false;
    const removed = assignments[key];
    delete assignments[key];
    persist();
    notify("removed", removed);
    return true;
  }

  function driverKey(driver) {
    return normalizeId(driver?.driverCode) || normalizeName(driver?.driverName);
  }

  function notify(action, assignment) {
    document.dispatchEvent(new CustomEvent("vixen:driver-assignment-changed", {
      detail: { action, assignment: { ...assignment } },
    }));
  }

  function readObject() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  }

  function normalizeId(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeName(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
})();
