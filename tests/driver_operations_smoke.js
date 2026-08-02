"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");

const store = new Map();
const localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
const document = { addEventListener() {}, getElementById() { return null; } };
const window = { setTimeout() {}, VixenDriverOperations: null };
const context = { window, document, localStorage, console, Date, JSON, String, Number, Object, Array };
vm.createContext(context);
vm.runInContext(fs.readFileSync("database/driver-operations.js", "utf8"), context);

const api = window.VixenDriverOperations;
assert.ok(api);
assert.ok(api.saveAssignment({ driverCode: "100001", driverName: "First Driver", truck: "300001" }));
assert.ok(api.saveAssignment({ driverCode: "100002", driverName: "Second Driver", truck: "300001" }));
assert.equal(api.saveAssignment({ driverCode: "100003", driverName: "Third Driver", truck: "300001" }), null, "a truck must not accept more than two manual driver links");
assert.equal(api.assignmentFor({ driverCode: "100002" }).truck, "300001");

api.captureSnapshot({
  drivers: {
    currentDate: new Date("2026-08-02T00:00:00Z"),
    records: [null, { driverCode: "100001", driverName: "First Driver", assignedTruck: "300001", idle7DayPct: .5, idle28DayPct: .4, idleExcluded: false }],
  },
});
assert.equal(api.assignmentFor(null), null, "null parser placeholders must not reach driver identity reads");
assert.equal(api.searchHistory("300001").length, 1);
assert.equal(api.searchHistory("100001")[0].domain, "Fuel snapshot");
console.log("Driver assignment and fuel-history smoke test passed.");
