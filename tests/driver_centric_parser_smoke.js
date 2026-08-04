const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const storage = new Map();
const context = {
  window: {
    VixenReportContract: { mode: "driver-centric-two-report", required: ["rolling7Day", "driverDetails"], optional: ["detail"] },
    VixenDriverOperations: { assignmentFor: (driver) => driver.driverCode === "2" ? { truck: "200" } : null },
  },
  localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  console,
  Date,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("core/driver_centric_parser.js", "utf8"), context);

const now = new Date("2026-08-04T12:00:00Z");
const analysis = {
  files: { rolling7Day: {}, driverDetails: {} },
  drivers: { records: [
    { driverCode: "1", driverName: "One Driver", assignedTruck: "100", idle7DayPct: .44, idle28DayPct: .32, dispatchMpg: 6.7 },
    { driverCode: "2", driverName: "Two Driver", assignedTruck: "999", idle7DayPct: .20, idle28DayPct: .25, dispatchMpg: 7.3 },
  ] },
  pta: { hasData: true, allRecords: [
    { truck: "100", driverCode: "1", pta: "2026-08-04T10:00:00Z", status: "Unloaded", planStatus: "No Preplan" },
    { truck: "200", driverCode: "2", pta: "2026-08-05T10:00:00Z", status: "Loaded", planStatus: "Preplan" },
  ] },
  apu: { hasData: false, records: [] },
};

const model = context.window.VixenDriverCentricParser.build(analysis, { now });
assert.equal(model.records.length, 2);
assert.equal(model.records[0].driverCode, "1");
assert.equal(model.records[0].priorityKey, "overdue-no-preplan");
assert.equal(model.records[0].currentIdleSource, "7-day");
assert.equal(model.records[1].truck, "200", "manual assignment must win");
assert.equal(model.coverage.coreReady, true);
assert.equal(model.coverage.hasDetail, false);
assert.deepEqual(Array.from(model.coverage.required), ["rolling7Day", "driverDetails"]);
console.log("Driver-centric parser smoke passed.");
