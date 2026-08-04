"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const listeners = new Map();
const dispatched = [];
const storage = new Map([
  ["vixenManualPtaActive", "true"],
  ["vixenManualPtaText", "Truck #\tDriver\tPTA\tStatus\tPlans\n100\tJane Driver\t2026-08-04T10:00:00-07:00\tAvailable\tNo Preplan"],
  ["vixenManualPtaSavedAt", String(Date.parse("2026-08-04T07:30:00-07:00"))],
  ["vixenDriverWorkbenchStateV1", JSON.stringify({
    janedriver: {
      pta: "2026-08-03T12:00:00-07:00",
      loadStatus: "Loaded",
      planStatus: "Preplan",
      destination: "Tucson",
      operatingNote: "Keep this note",
      updatedAt: "2026-08-04T07:00:00-07:00",
    },
    currentdriver: {
      pta: "2026-08-04T11:00:00-07:00",
      loadStatus: "Loaded",
      planStatus: "Preplan",
      destination: "Mesa",
      updatedAt: "2026-08-04T08:00:00-07:00",
    },
  })],
]);

function addListener(scope, type, handler) {
  const key = `${scope}:${type}`;
  if (!listeners.has(key)) listeners.set(key, []);
  listeners.get(key).push(handler);
}

function dispatch(scope, event) {
  dispatched.push(event);
  (listeners.get(`${scope}:${event.type}`) || []).forEach((handler) => handler(event));
  return true;
}

const analysis = {
  drivers: { records: [] },
  pta: { hasData: false, manualPaste: false, allRecords: [] },
};
const context = {
  window: {
    VixenCurrentAnalysis: analysis,
    FuelDashboardDb: {
      ready: Promise.resolve({ mode: "indexeddb" }),
      parsePtaText: () => ({ records: [{
        rowNumber: 2,
        truck: "100",
        driver: "Jane Driver",
        ptaIso: "2026-08-04T10:00:00-07:00",
        status: "Available",
        planStatus: "No Preplan",
        destination: "Phoenix",
      }] }),
      listPtaSnapshots: async () => [],
    },
    addEventListener: (type, handler) => addListener("window", type, handler),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  },
  document: {
    addEventListener: (type, handler) => addListener("document", type, handler),
    dispatchEvent: (event) => dispatch("document", event),
  },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  Date,
  Map,
  Set,
  Promise,
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("database/workbench-pta-sync.js", "utf8"), context);

let workbenchAnalysis = null;
context.document.addEventListener("vixen:analysis-rendered", (event) => {
  if (event.detail?.source === "pta-sync") workbenchAnalysis = event.detail.analysis;
});

const api = context.window.VixenWorkbenchPtaSync;
assert.ok(api, "sync API should be installed");
const adapted = api.adaptSnapshot({
  id: "snapshot-1",
  savedAt: "2026-08-04T07:30:00-07:00",
  records: [{
    rowNumber: 2,
    truck: "100",
    driver: "Jane Driver",
    ptaIso: "2026-08-04T10:00:00-07:00",
    status: "Available",
    planStatus: "No Preplan",
    destination: "Phoenix",
  }],
}, analysis.pta);
assert.equal(adapted.allRecords.length, 1);
assert.equal(adapted.allRecords[0].truck, "100");
assert.equal(adapted.allRecords[0].driver, "Jane Driver");
assert.equal(adapted.allRecords[0].planStatus, "No Preplan");
assert.equal(adapted.allRecords[0].snapshotSavedAt, "2026-08-04T07:30:00-07:00");
assert.equal(adapted.manualPaste, true);
assert.equal(adapted.dynamicWorkbenchSource, true);

assert.equal(api.applySnapshot({
  id: "snapshot-1",
  savedAt: "2026-08-04T07:30:00-07:00",
  records: [{
    truck: "100",
    driver: "Jane Driver",
    ptaIso: "2026-08-04T10:00:00-07:00",
    status: "Available",
    planStatus: "No Preplan",
    destination: "Phoenix",
  }],
}), true);

assert.equal(context.window.VixenCurrentAnalysis.pta.allRecords[0].truck, "100");
assert.equal(workbenchAnalysis, context.window.VixenCurrentAnalysis, "workbench event should receive the current analysis object");

const overrides = JSON.parse(storage.get("vixenDriverWorkbenchStateV1"));
assert.equal(overrides.janedriver.pta, undefined, "new snapshot should clear an older PTA override");
assert.equal(overrides.janedriver.loadStatus, undefined, "new snapshot should clear an older load-status override");
assert.equal(overrides.janedriver.planStatus, undefined, "new snapshot should clear an older plan override");
assert.equal(overrides.janedriver.destination, undefined, "new snapshot should clear an older destination override");
assert.equal(overrides.janedriver.operatingNote, "Keep this note", "operating notes must survive a PTA refresh");
assert.equal(overrides.currentdriver.destination, "Mesa", "a newer workbench edit should remain in control");

const analysisEvent = dispatched.find((event) => event.type === "vixen:analysis-rendered" && event.detail?.source === "pta-sync");
assert.ok(analysisEvent, "PTA sync must publish the refreshed analysis to the workbench listener");
const syncEvent = dispatched.at(-1);
assert.equal(syncEvent.type, "vixen:workbench-pta-synced");
assert.equal(syncEvent.detail.overridesCleared, 1);

console.log("Workbench PTA sync smoke passed.");
