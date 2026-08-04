"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const listeners = new Map();
const dispatched = [];
let refreshes = 0;
const storage = new Map([
  ["vixenManualPtaActive", "true"],
  ["vixenManualPtaText", "Truck #\tDriver\tPTA\tStatus\tPlans\n100\tJane Driver\t2026-08-04T10:00:00-07:00\tAvailable\tNo Preplan"],
  ["vixenManualPtaSavedAt", String(Date.parse("2026-08-04T07:30:00-07:00"))],
]);

const analysis = {
  drivers: { records: [] },
  pta: { hasData: false, manualPaste: false, allRecords: [] },
};
const context = {
  window: {
    VixenCurrentAnalysis: analysis,
    VixenDriverWorkbench: { refresh: () => { refreshes += 1; } },
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
    addEventListener: (type, handler) => listeners.set(`window:${type}`, handler),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  },
  document: {
    addEventListener: (type, handler) => listeners.set(`document:${type}`, handler),
    dispatchEvent: (event) => dispatched.push(event),
  },
  localStorage: { getItem: (key) => storage.get(key) || null },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  Date,
  Map,
  Set,
  Promise,
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("database/workbench-pta-sync.js", "utf8"), context);

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
assert.equal(adapted.manualPaste, true);
assert.equal(adapted.dynamicWorkbenchSource, true);

assert.equal(api.applySnapshot({ id: "snapshot-1", records: [{ truck: "100", driver: "Jane Driver", ptaIso: "2026-08-04T10:00:00-07:00", status: "Available", planStatus: "No Preplan" }] }), true);
assert.equal(context.window.VixenCurrentAnalysis.pta.allRecords[0].truck, "100");
assert.equal(refreshes, 1);
assert.equal(dispatched.at(-1).type, "vixen:workbench-pta-synced");

console.log("Workbench PTA sync smoke passed.");
