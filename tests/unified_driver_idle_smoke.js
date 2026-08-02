const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("app.js", "utf8");
const inspector = fs.readFileSync("smart_data_loader.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const transition = fs.readFileSync("database/rich-transition-editor.js", "utf8");

assert.match(inspector, /driverAssignments:[\s\S]*last dispatch driver cd[\s\S]*last dispatch driver nm/);
assert.match(app, /function parseDriverTruckEvidence\([\s\S]*truckByOrder[\s\S]*evidenceDate/);
assert.ok(app.includes("function parseEmbeddedDriverIdentity"));
assert.match(app, /idleHours7Day[\s\S]*engineHours7Day/);
assert.match(app, /idle28Totals\.idle \/ idle28Totals\.engine/);
assert.match(app, /personalCategory[\s\S]*Personal category excluded from operational audit/);
assert.match(app, /record\.linkedDrivers = record\.linkedDrivers \|\| \[\]/);
assert.match(app, /const identityKey = driverNoteKey\(driver\)/);
assert.match(transition, /const identities = driverCode \? \[`code:/);
assert.match(app, /sort\(\(a, b\) => b\.driver\.idle7DayPct - a\.driver\.idle7DayPct\)[\s\S]*slice\(0, 5\)/, "Today must use the actual top five eligible 7-day idlers");
assert.match(app, /Assign this driver to a truck before saving a fuel note/);
assert.match(app, /Link this truck to a driver before saving a PTA note/);
assert.match(app, /const metrics = objectRecords\(parseBasicDriverMetricsReport/);
assert.match(app, /drivers\.records = objectRecords\(drivers\.records\)/, "driver rows must be normalized before APU and assignment joins");
assert.match(app, /function parseRollingIdleCsv\([\s\S]*engineHours28Day[\s\S]*idleHours28Day/, "CSV parsing must retain raw hours for weighted fleet calculations");
assert.match(app, /label: "7-Day Idle"[\s\S]*label: "28-Day Idle"/, "Hero Insight must compare weighted 7-day and 28-day idle instead of costs");
assert.match(app, /chartOptions\(\{ legend: true, compact: false, format: "percent" \}\)/, "Hero Insight must format its axis and tooltips as percentages");
assert.doesNotMatch(app, /label: "Actual Cost", data: actual/, "Hero Insight must not reuse the cost series");
assert.match(app, /\.filter\(\(record\) => record && record\.driverCode && record\.driverName && record\.truck\)/, "empty assignment-evidence rows must be discarded before reading driver fields");
assert.match(transition, /<strong>\$\{escapeHtml\(truck\)\}<\/strong> - \$\{escapeHtml\(driver\)\}:/, "handoff lines must lead with a bold truck number without a Truck label");
assert.doesNotMatch(html, /data-view="units"/);
assert.match(html, /DRIVER \+ TRUCK EVIDENCE/);

console.log("Unified driver/truck idle model smoke test passed.");
