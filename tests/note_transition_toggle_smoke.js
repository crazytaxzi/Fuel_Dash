"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync("note_transition_toggle.js", "utf8");
assert.match(source, /observer\.disconnect\(\)/, "history observer must disconnect before enhancing its own subtree");
assert.match(source, /observer\.observe\(history, OBSERVER_OPTIONS\)/, "history observer must resume after a guarded enhancement");
assert.match(source, /finish-handoff/, "the default finish action must include the note in handoff");
assert.match(source, /finish-only/, "users must be able to complete a note without adding it to handoff");
assert.match(source, /data-note-action=\"reopen\"/, "completed notes must be recoverable");

const store = new Map();
const localStorage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, String(value)); },
};
const document = {
  head: { append() {} },
  getElementById() { return null; },
  createElement() { return { id: "", textContent: "" }; },
  addEventListener() {},
};
const window = { addEventListener() {}, setTimeout() {}, VixenNoteTransitionToggle: null, VixenWorkedWorkflow: { render() {} } };
const context = {
  window,
  document,
  localStorage,
  console,
  Date,
  JSON,
  String,
  Object,
  Array,
  MutationObserver: class { observe() {} disconnect() {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: "note_transition_toggle.js" });

const api = window.VixenNoteTransitionToggle;
assert.ok(api);
assert.equal(api.selectionKey("pta", "note-1"), "pta:note-1");
assert.equal(api.completionKey("pta", "note-1"), "pta:note-1");
assert.equal(api.isIncluded("pta", "note-1"), false, "transition selection defaults off");
assert.equal(api.isComplete("pta", "note-1"), false, "completion defaults off");
assert.equal(api.setIncluded("pta", "note-1", true), true);
assert.equal(api.isIncluded("pta", "note-1"), true);
assert.equal(api.setComplete("pta", "note-1", true), true);
assert.equal(api.isComplete("pta", "note-1"), true);
assert.equal(api.isComplete("pta", "note-2"), false, "completion must be per-note");
assert.equal(api.setComplete("pta", "note-1", false), true);
assert.equal(api.isComplete("pta", "note-1"), false);
console.log("Per-note controls and observer-loop guard smoke test passed.");
