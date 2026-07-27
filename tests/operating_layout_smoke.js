"use strict";

const assert = require("node:assert/strict");

global.window = {};
global.fetch = async () => ({ ok: false, json: async () => [] });
require("../smart_data_loader.js");

const test = window.VixenDataInspector.test;
const inspection = (rows) => ({
  kind: "xlsx",
  rows,
  sheetNames: ["Sheet 1"],
  text: test.normalize(rows.flat().filter((value) => value !== null && value !== "").join("\n")),
});

const costSummary = inspection([
  ["Groupby", "Thenby", "Fuel Rec Count", "Actual Gallon Amounts", "Gallon Over/Under Cost", "Location Noncompliant Cost", "Total Noncompliant Cost"],
  ["Grand Total", "Total", 2000, 200000, 4500, 2300, 6800],
]);
assert.equal(test.roleQualifies("reportCost", costSummary), true);
assert.equal(test.roleQualifies("trend", costSummary), false, "a one-period cost summary is not a trend report");

const transactionDetail = inspection([
  ["Unit#", "Order#", "Actual Fuel Date", "Purchase Type", "Rec Gallons", "Location Compliant", "Actual Gallons", "Gallon Over/Under Cost", "Location Noncompliant Cost", "Total Noncompliant Cost"],
  [220001, "ABC1234-01", "7/21/26", "Fill", 100, "Y", 95, 0, 0, 0],
]);
assert.equal(test.roleQualifies("detail", transactionDetail), true);
assert.equal(test.roleQualifies("trend", transactionDetail), false, "transaction detail must not be routed as trend data");

const rollingRows = [
  ["", "", "", "", "", "", "", "", "", "", "Week Start Date"],
  ["Grand Total", "Rolling 7 Day Dispatch Miles", "Total", "", "", "", "", "", "", "", 100000],
  ["92385 SAMPLE DRIVER", "Idle %", "7/19/2026", "Division", "Line Haul", "Terminal", "VANHL", "LEW1", "*", "7/13/2026", 0.16],
  ["ABCDE1 SAMPLE DRIVER", "Idle %", "7/19/2026", "Division", "Line Haul", "Terminal", "VANHL", "LEW1", "*", "7/13/2026", 0.22],
];
const rolling = inspection(rollingRows);
assert.equal(test.roleQualifies("rolling7Day", rolling), true);
assert.equal(test.roleQualifies("driverMetricsDetail", rolling), false);

const historyRows = Array.from({ length: 10 }, () => []);
historyRows[0] = ["Driver", "92385 SAMPLE DRIVER", "7/19/2026", "6/22/2026", "Division", "*", "Terminal", "VANHL", "LEW1", "*", "19.0%", 0, 0, "% Cruise in Time", 0.60];
historyRows[3] = Array(13).fill("").concat(["Dispatch MPG", 7.1]);
historyRows[5] = Array(13).fill("").concat(["Idle %", 0.34]);
historyRows[9] = Array(13).fill("").concat(["Moving MPG", 7.7, "OOR %", 0.05]);
const driverHistory = inspection(historyRows);
assert.equal(test.roleQualifies("driverDetails", driverHistory), true);
assert.equal(test.roleQualifies("reportDriverMetrics", driverHistory), false, "repeating history blocks are not flat driver-metric tables");
assert.equal(test.roleQualifies("driverMetricsDetail", driverHistory), false);
assert.equal(test.roleQualifies("reportMpg", driverHistory), false);

console.log("Operating layout classifier smoke test passed.");
