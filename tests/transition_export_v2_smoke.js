"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");
const window = { addEventListener() {}, setTimeout() {}, VixenTransitionExport: null };
const context = { window, document: { addEventListener() {} }, localStorage: { getItem() { return null; } }, console, Date, JSON, String, Number, Math, Array, Object, Blob: class {}, URL: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("database/rich-transition-editor.js", "utf8"), context);
const api = window.VixenTransitionExport;
const now = new Date(2026, 6, 27, 15, 0);
const pta = {
  "300001": [
    { id: "pta-a", savedAt: new Date(2026, 6, 27, 9, 0).toISOString(), driver: "Test Driver", status: "Late", destination: "Dallas", text: "Called driver" },
    { id: "pta-b", savedAt: new Date(2026, 6, 27, 10, 0).toISOString(), driver: "Test Driver", planStatus: "Planned", text: "Reset confirmed" },
    { id: "pta-c", savedAt: new Date(2026, 6, 27, 11, 0).toISOString(), text: "Internal note only" },
  ],
};
const drivers = {
  "123456": [
    { id: "driver-a", savedAt: new Date(2026, 6, 27, 11, 0).toISOString(), driverName: "Test Driver", text: "Discussed idle" },
    { id: "driver-b", savedAt: new Date(2026, 6, 27, 12, 0).toISOString(), driverName: "Test Driver", text: "Private reminder" },
  ],
};

const defaultOff = api.buildContext(now, pta, drivers, {});
assert.equal(defaultOff.truck_count, "0");
assert.equal(defaultOff.driver_count, "0");

const selections = {
  "pta:pta-a": true,
  "pta:pta-b": true,
  "driver:driver-a": true,
};
const output = api.buildContext(now, pta, drivers, selections);
assert.equal(output.truck_count, "2");
assert.equal(output.driver_count, "1");
assert.match(output.all_followups, /Called driver/);
assert.match(output.all_followups, /Reset confirmed/);
assert.match(output.all_followups, /Discussed idle/);
assert.doesNotMatch(output.all_followups, /Internal note only|Private reminder/);
assert.match(output.truck_followups_html, /Truck <strong>300001<\/strong> &mdash; Test Driver/);
assert.match(output.truck_followups_html, /border-bottom:1px solid #d8e0ea/);
assert.doesNotMatch(output.truck_followups_html, /Late|Dallas|Planned|Truck \/ PTA note|Idle today|message/);
assert.equal(api.noteIncluded("pta", { id: "pta-a" }, selections), true);
assert.equal(api.noteIncluded("pta", { id: "pta-c" }, selections), false);
console.log("Transition export default-off selection smoke test passed.");
