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
const window = { setTimeout() {}, setInterval() {}, addEventListener() {}, VixenWorkedWorkflow: null, VixenTransitionExport: null };
const context = { window, document, localStorage, console, Date, JSON, String, Number, Math, Array, Object, Blob: class {}, URL: {}, MutationObserver: class { observe() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("worked_workflow.js", "utf8"), context, { filename: "worked_workflow.js" });
const api = window.VixenWorkedWorkflow;
assert.ok(api);
assert.equal(api.normalizeKey(" 12-34 a "), "1234A");
assert.equal(api.noteStateKey("pta", "note-1"), "pta:note-1");

const noteOne = { id: "p1", text: "Called driver", savedAt: "2026-07-26T10:00:00" };
const noteTwo = { id: "p2", text: "Reset confirmed", savedAt: "2026-07-26T11:00:00" };
assert.equal(api.completionState("pta", noteOne, {}).done, false);
assert.equal(api.completionState("pta", noteOne, { "pta:p1": { completedAt: "2026-07-26T10:30:00" } }).done, true);
assert.equal(api.completionState("pta", noteTwo, { "pta:p1": { completedAt: "2026-07-26T10:30:00" } }).done, false, "completion must not spill to another note on the same truck");

const now = new Date("2026-07-26T13:30:00").getTime();
const items = api.collectWorkedItems(
  now,
  { "300001": [noteOne, noteTwo] },
  { "123456": [{ id: "d1", savedAt: "2026-07-26T13:00:00", driverName: "Test Driver", driverCode: "123456", text: "Discussed idle" }] },
  { "pta:p1": { completedAt: "2026-07-26T10:30:00" } },
);
assert.equal(items.length, 3, "Worked must show one card per note");
assert.equal(items.filter((item) => item.done).length, 1);
assert.equal(items.find((item) => item.noteId === "p1").done, true);
assert.equal(items.find((item) => item.noteId === "p2").done, false);
assert.equal(items.find((item) => item.noteId === "p2").overdue, true);
assert.equal(items.find((item) => item.noteId === "d1").overdue, false);
console.log("Per-note Worked completion smoke test passed.");
