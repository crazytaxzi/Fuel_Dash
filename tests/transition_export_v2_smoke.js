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
const output = api.buildTransition(now,
  { "300001": [{ savedAt: new Date(2026, 6, 27, 9, 0).toISOString(), text: "Called driver" }, { savedAt: new Date(2026, 6, 27, 10, 0).toISOString(), text: "Reset confirmed" }] },
  { "123456": [{ savedAt: new Date(2026, 6, 27, 11, 0).toISOString(), driverName: "Test Driver", text: "Discussed idle" }] }
);
assert.match(output, /Truck follow-ups:\r\n300001 - Called driver \| Reset confirmed/);
assert.match(output, /High Idles contacted:\r\nTest Driver - Discussed idle/);
assert.doesNotMatch(output, /Truck 300001/);
console.log("Transition export v2 smoke test passed.");
