"use strict";

const assert = require("assert");
const parser = require("../core/driver_centric_parser.js");

const now = new Date("2026-08-04T12:00:00-07:00");
const analysis = {
  drivers: {
    records: [
      { driverCode: "D100", driverName: "Ada Driver", assignedTruck: "101", dailyIdlePct: 0.31, idle7DayPct: 0.42, idle28DayPct: 0.37, dispatchMpg: 7.1 },
      { driverCode: "D200", driverName: "Ben Driver", assignedTruck: "202", dailyIdlePct: 0.55, idle7DayPct: 0.61, idle28DayPct: 0.49, dispatchMpg: 6.2 },
    ],
  },
  pta: {
    allRecords: [
      { index: 9, truck: "101", driver: "Ada Driver", pta: "2026-08-04T10:00:00-07:00", status: "Unloaded", planStatus: "No Preplan", destination: "Phoenix" },
      { index: 10, truck: "202", driver: "Ben Driver", pta: "2026-08-05T12:00:00-07:00", status: "Loaded", planStatus: "Preplan", destination: "Tucson" },
    ],
  },
  apu: { records: [{ driverCode: "D200", unit: "202", apuHours: 8, engineIdleHours: 3 }] },
};

const model = parser.build(analysis, {
  now,
  overrides: { d200: { preplanStatus: "No Preplan", updatedAt: "2026-08-04T11:00:00-07:00" } },
  missingBolRecords: [{ driverCode: "D100", trip: "ABC1234" }],
  driverNotes: { d100: [{ text: "Called driver", savedAt: "2026-08-04T11:30:00-07:00" }] },
});

assert.strictEqual(model.records.length, 2);
assert.strictEqual(model.records[0].driverCode, "D100", "overdue/no-preplan record should sort first");
assert.strictEqual(model.records[0].riskKey, "overdue-no-preplan");
assert.strictEqual(model.records[0].missingBols.length, 1);
assert.strictEqual(model.records[0].latestDriverNote.text, "Called driver");
assert.strictEqual(model.byDriver.get("d200").preplanStatus, "No Preplan", "local operating override should win");
assert.strictEqual(model.byDriver.get("d200").apu.apuHours, 8);
assert.strictEqual(model.byTruck.get("101").length, 1);
assert.strictEqual(model.stats.noPreplan, 2);
assert.strictEqual(parser.normalizeTruck(" truck-101 "), "TRUCK101");

console.log("driver_centric_parser_smoke: ok");
