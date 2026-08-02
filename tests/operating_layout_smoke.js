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
const csvInspection = (rows) => ({ ...inspection(rows), kind: "csv" });

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

const rollingCsv = csvInspection([
  ["Group by  (copy)", "Measure Names", "Week Start Date", "[Rolling 7 Day Engine Time]/60", "[Rolling 7 Day Idle Time]/60", "Rolling 7 Day Dispatch Miles", "Rolling 7 Day Qualcomm Miles", "Cost Center", "Driver Leader", "Driver Terminal", "Fleet Leader", "OPS LOB", "Rolling 7 Day Start Date", "Unit Code", "Week Start Date", "Measure Values"],
  ["92385 SAMPLE DRIVER", "Idle %", "7/26/2026", 42.9, 5.9, 1682, 1870, "611 - Lewiston", "VANHL", "Lewiston", "LEW1", "Line Haul", "7/20/2026", "260976", "7/26/2026", 0.1375],
]);
assert.equal(test.roleQualifies("rollingIdleCsv", rollingCsv), true, "the raw-hour CSV must be the authoritative idle source");
assert.equal(test.roleQualifies("rollingIdleCsv", { ...rollingCsv, kind: "xlsx" }), false, "an unrelated workbook must not take the CSV route");
const rolling28Csv = csvInspection([
  ["Group by  (copy)", "Week Start Date", "[Rolling 28 Day Engine Time]/60", "[Rolling 28 Day Idle Time]/60", "Dispatch MPG", "Moving MPG", "Unit Code"],
  ["92385 SAMPLE DRIVER", "7/26/2026", 160, 24, 6.8, 7.2, "260976"],
]);
assert.equal(test.roleQualifies("rolling28IdleCsv", rolling28Csv), true, "the direct raw-hour 28-day CSV must be recognized separately");

const historyRows = Array.from({ length: 10 }, () => []);
historyRows[0] = ["Driver", "92385 SAMPLE DRIVER", "7/19/2026", "6/22/2026", "Division", "*", "Terminal", "VANHL", "LEW1", "*", "19.0%", 0, 0, "% Cruise in Time", 0.60];
historyRows[3] = Array(13).fill("").concat(["Dispatch MPG", 7.1]);
historyRows[5] = Array(13).fill("").concat(["Idle %", 0.34]);
historyRows[9] = Array(13).fill("").concat(["Moving MPG", 7.7, "OOR %", 0.05]);
historyRows[6] = Array(13).fill("").concat(["Electric APU Hours", 4.5]);
historyRows[7] = Array(13).fill("").concat(["Engine Idle Hours", 1.5]);
historyRows[8] = Array(13).fill("").concat(["APU Utilization %", 0.75]);
const driverHistory = inspection(historyRows);
assert.equal(test.roleQualifies("driverDetails", driverHistory), true);
assert.equal(test.roleQualifies("apu", driverHistory), true, "Driver Details-shaped workbooks with APU metric rows must also route to the APU role");
assert.equal(test.roleQualifies("reportDriverMetrics", driverHistory), false, "repeating history blocks are not flat driver-metric tables");
assert.equal(test.roleQualifies("driverMetricsDetail", driverHistory), false);
assert.equal(test.roleQualifies("reportMpg", driverHistory), false);

const regularDriverDetails = {
  file: { name: "Primary Operating History.xlsx", lastModified: 100 },
  inspection: driverHistory,
  scores: test.scoreInspection(driverHistory),
};
const namedApuDetails = {
  file: { name: "LEW1 APU Trucks.xlsx", lastModified: 200 },
  inspection: driverHistory,
  scores: test.scoreInspection(driverHistory),
};
const driverDetailsWinner = test.selectRoleCandidate("driverDetails", { threshold: 12 }, [regularDriverDetails, namedApuDetails]);
const apuWinner = test.selectRoleCandidate("apu", { threshold: 11 }, [regularDriverDetails, namedApuDetails]);
assert.equal(driverDetailsWinner.file.name, "Primary Operating History.xlsx", "an APU-named workbook must never replace the core Driver Details source");
assert.equal(apuWinner.file.name, "LEW1 APU Trucks.xlsx", "an APU-named Driver Details-shaped workbook must feed the APU report");
assert.equal(test.isApuFileName("apu.xlsx"), true);
assert.equal(test.isApuFileName("LEW1-APU Trucks.XLSX"), true);
assert.equal(test.isApuFileName("LEW1APUTrucks.xlsx"), true);
assert.equal(test.isApuFileName("Capture.xlsx"), false, "APU must be matched as a filename token, not as part of another word");

console.log("Operating layout classifier smoke test passed.");
