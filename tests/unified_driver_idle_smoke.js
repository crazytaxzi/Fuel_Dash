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
assert.match(transition, /<strong>\$\{escapeHtml\(truck\)\}<\/strong> - \$\{escapeHtml\(driver\)\}:/, "handoff lines must lead with a bold truck number without a Truck label");
assert.doesNotMatch(html, /data-view="units"/);
assert.match(html, /DRIVER \+ TRUCK EVIDENCE/);

console.log("Unified driver/truck idle model smoke test passed.");
