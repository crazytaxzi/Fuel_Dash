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
const sessionStorage = { getItem() { return null; }, setItem() {} };
const window = { setTimeout() {}, clearTimeout() {}, setInterval() {}, addEventListener() {}, VixenWorkedWorkflow: null, VixenTransitionExport: null };
const context = { window, document, localStorage, sessionStorage, console, Date, JSON, String, Number, Math, Array, Object, Blob: class {}, URL: {}, MutationObserver: class { observe() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("worked_workflow.js", "utf8"), context, { filename: "worked_workflow.js" });
const api = window.VixenWorkedWorkflow;
assert.ok(api);
assert.equal(api.normalizeKey(" 12-34 a "), "1234A");
assert.equal(api.noteStateKey("pta", "note-1"), "pta:note-1");

const navigationSource = fs.readFileSync("database/worked-navigation-fix.js", "utf8");
assert.match(navigationSource, /closest\?\.\("\.worked-card-open"\)/, "Worked navigation must only capture the card's dedicated open-details button");
assert.doesNotMatch(navigationSource, /event\.target\?\.closest\?\.\("\[data-worked-type\]"\)/, "Worked navigation must not capture finish and handoff action buttons");
const workflowSource = fs.readFileSync("worked_workflow.js", "utf8");
assert.equal((workflowSource.match(/new Notification\("Fuel Dash needs attention"/g) || []).length, 1, "Today must emit one browser notification per change");
assert.match(workflowSource, /vixenLastAttentionNoticeV2/, "Attention notification state must persist across reloads");
assert.doesNotMatch(workflowSource, /vixenLastAttentionNoticeV1/, "Session-only notification tracking must not return");

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
window.VixenDashboardWorkflow = {
  getAttentionTasks() {
    return [
      { type: "pta", index: 7, identity: "300999", label: "Truck 300999", meta: "Overdue", detail: "Find a load", urgent: true },
      { type: "pta", index: 8, identity: "300001", label: "Truck 300001", meta: "Duplicate", detail: "Already tracked", urgent: true },
    ];
  },
};
const withLiveTasks = api.collectWorkedItems(now, { "300001": [noteOne] }, {}, { "pta:p1": { complete: false } });
assert.equal(withLiveTasks.filter((item) => item.live).length, 1, "live attention tasks must join the queue without duplicating a tracked identity");
assert.equal(withLiveTasks.find((item) => item.live).overdue, true, "urgent live work must be raised to attention");
localStorage.setItem("vixenPtaActionNotesV1", JSON.stringify({ "300001": [noteOne, noteTwo] }));
assert.equal(api.finishNote("pta", "p2", true), true);
assert.equal(api.completionState("pta", noteTwo).done, true, "finish must complete the selected note");
assert.equal(JSON.parse(store.get("vixenTransitionNoteSelectionV1"))["pta:p2"], true, "normal finish must add the note to handoff");
assert.equal(api.finishNote("pta", "p2", true), false, "a duplicate finish event must be ignored");
api.setNoteComplete("pta", "p2", false);
assert.equal(api.completionState("pta", noteTwo).done, false, "a completed note must be reopenable");
console.log("Continuous Today workflow smoke test passed.");
