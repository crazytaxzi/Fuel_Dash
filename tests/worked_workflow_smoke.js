"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");

const store = new Map();
const document = {
  head: { append() {} },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement() { return { id: "", style: {}, className: "", dataset: {}, append() {}, addEventListener() {}, insertAdjacentElement() {} }; },
  addEventListener() {},
};
const localStorage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, String(value)); },
};
const window = { setTimeout() {}, setInterval() {}, addEventListener() {}, VixenWorkedWorkflow: null };
const context = { window, document, localStorage, console, Date, JSON, String, Number, Math, Array, Object, Blob: class {}, URL: {}, MutationObserver: class { observe() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("worked_workflow.js", "utf8"), context, { filename: "worked_workflow.js" });
const api = window.VixenWorkedWorkflow;
assert.ok(api);
assert.equal(api.normalizeKey(" 12-34 a "), "1234A");
const latest = api.latestNote([{ text: "older", savedAt: "2026-07-26T10:00:00" }, { text: "newer", savedAt: "2026-07-26T11:00:00" }]);
assert.equal(latest.text, "newer");
assert.equal(api.completionState("pta", "123", latest, { "pta:123": { completedAt: "2026-07-26T11:30:00" } }).done, true);
assert.equal(api.completionState("pta", "123", latest, { "pta:123": { completedAt: "2026-07-26T10:30:00" } }).done, false);

const now = new Date(2026, 6, 26, 16, 0, 0);
const pta = {
  "300001": [
    { savedAt: new Date(2026, 6, 26, 9, 0).toISOString(), text: "Called driver" },
    { savedAt: new Date(2026, 6, 26, 10, 0).toISOString(), text: "  Reset confirmed\nReady at 18:00  " },
  ],
  "300002": [{ savedAt: new Date(2026, 6, 25, 10, 0).toISOString(), text: "Yesterday" }],
};
const drivers = {
  "123456": [
    { savedAt: new Date(2026, 6, 26, 11, 0).toISOString(), driverName: "Test Driver", driverCode: "123456", text: "Discussed high idle" },
    { savedAt: new Date(2026, 6, 26, 12, 0).toISOString(), driverName: "Test Driver", driverCode: "123456", text: "Will recheck tomorrow" },
  ],
};
const transition = api.buildTransition(now, pta, drivers);
assert.match(transition, /Truck 300001 - Called driver \| Reset confirmed Ready at 18:00/);
assert.match(transition, /High Idles contacted:\r\nTest Driver - Discussed high idle \| Will recheck tomorrow/);
assert.doesNotMatch(transition, /300002/);
console.log("Worked workflow smoke test passed.");
