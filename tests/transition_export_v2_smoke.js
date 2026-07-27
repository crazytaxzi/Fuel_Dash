"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");
const window = { addEventListener() {}, setTimeout() {}, VixenTransitionExport: null };
const context = { window, document: {}, localStorage: { getItem() { return null; } }, console, Date, JSON, String, Number, Math, Array, Object, Blob: class {}, URL: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("transition_export_v2.js", "utf8"), context);
const api = window.VixenTransitionExport;
const now = new Date(2026, 6, 27, 15, 0);
const pta = {
  "300001": [
    { id: "pta-a", savedAt: new Date(2026, 6, 27, 9, 0).toISOString(), text: "Called driver" },
    { id: "pta-b", savedAt: new Date(2026, 6, 27, 10, 0).toISOString(), text: "Reset confirmed" },
    { id: "pta-c", savedAt: new Date(2026, 6, 27, 11, 0).toISOString(), text: "Internal note only" },
  ],
};
const drivers = {
  "123456": [
    { id: "driver-a", savedAt: new Date(2026, 6, 27, 11, 0).toISOString(), driverName: "Test Driver", text: "Discussed idle" },
    { id: "driver-b", savedAt: new Date(2026, 6, 27, 12, 0).toISOString(), driverName: "Test Driver", text: "Private reminder" },
  ],
};

const defaultOff = api.buildTransition(now, pta, drivers, {});
assert.match(defaultOff, /Truck follow-ups:\r\nNone/);
assert.match(defaultOff, /High Idles contacted:\r\nNone/);

const selections = {
  "pta:pta-a": true,
  "pta:pta-b": true,
  "driver:driver-a": true,
};
const output = api.buildTransition(now, pta, drivers, selections);
assert.match(output, /Truck follow-ups:\r\n300001 - Called driver \| Reset confirmed/);
assert.match(output, /High Idles contacted:\r\nTest Driver - Discussed idle/);
assert.doesNotMatch(output, /Internal note only|Private reminder/);
assert.doesNotMatch(output, /Truck 300001/);
assert.equal(api.noteIncluded("pta", { id: "pta-a" }, selections), true);
assert.equal(api.noteIncluded("pta", { id: "pta-c" }, selections), false);
console.log("Transition export default-off selection smoke test passed.");
