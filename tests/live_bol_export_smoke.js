"use strict";

const assert = require("node:assert/strict");

const headers = [
  "Order #", "TMEX Order #", "Logistics Order#", "Bill To", "Division#", "Shipper LOB",
  "Empty Call Date", "Origin City St", "Destination City St", "Billing Leader", "Billing Analyst",
  "AR Leader", "AR Analyst", "Bankq flg", "Rev Type", "Terminal", "Terminal Leader", "Buyer",
  "Carrier", "Dray Name", "Driver Leader", "Driver Status", "Last Dispatch Driver cd",
  "Last Dispatch Driver nm", "Terminal Leader", "Terminal Leader", "Loaded Miles",
  "Order Level Order Miles", "Total Revenue",
];

const rows = [
  headers,
  ["100001", "ABC1234", "900001", "", "", "", "7/20/2026", "", "", "", "", "", "", "", "", "", "", "", "", "", "Leader A", "", "123456"],
  ["100002", "DEF2345", "900002", "", "", "", "7/18/2026", "", "", "", "", "", "", "", "", "", "", "", "", "", "Leader B", "", "ABCDE1"],
];

const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const find = (aliases) => {
  const normalized = headers.map(normalize);
  for (const alias of aliases.map(normalize)) {
    const exact = normalized.findIndex((header) => header === alias);
    if (exact >= 0) return exact;
  }
  return -1;
};
const tripPattern = /\b([A-Z]{3}\d{4})\b/i;
const sampleHits = (column) => rows.slice(1).filter((row) => tripPattern.test(String(row[column] ?? ""))).length;
assert.equal(tripPattern.test("AB1234"), false, "two-letter trip numbers must not be accepted");
assert.equal(tripPattern.test("ABC1234"), true, "three letters plus four digits must be accepted");

assert.equal(find(["empty call date"]), 6);
assert.equal(find(["driver leader"]), 20);
assert.equal(find(["last dispatch driver cd"]), 22);

const orderColumns = [
  find(["order #"]),
  find(["tmex order #"]),
  find(["logistics order#"]),
];
const selectedTripColumn = orderColumns
  .map((column) => ({ column, hits: sampleHits(column) }))
  .sort((a, b) => b.hits - a.hits)[0];

assert.equal(selectedTripColumn.column, 1);
assert.equal(selectedTripColumn.hits, 2);
assert.equal(String(rows[1][selectedTripColumn.column]).match(tripPattern)[1], "ABC1234");
assert.equal(String(rows[2][selectedTripColumn.column]).match(tripPattern)[1], "DEF2345");

const oldestFirst = rows.slice(1).sort((a, b) => new Date(a[6]) - new Date(b[6]));
assert.equal(oldestFirst[0][1], "DEF2345");
assert.equal(oldestFirst[1][1], "ABC1234");

console.log("Live Missing BOL export smoke test passed.");
