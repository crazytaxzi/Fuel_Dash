"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");

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
const window = { addEventListener() {}, VixenNoteTransitionToggle: null };
const context = {
  window,
  document,
  localStorage,
  console,
  JSON,
  String,
  Object,
  Array,
  MutationObserver: class { observe() {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("note_transition_toggle.js", "utf8"), context, { filename: "note_transition_toggle.js" });

const api = window.VixenNoteTransitionToggle;
assert.ok(api);
assert.equal(api.selectionKey("pta", "note-1"), "pta:note-1");
assert.equal(api.isIncluded("pta", "note-1"), false, "new and existing notes must default off");
assert.equal(api.setIncluded("pta", "note-1", true), true);
assert.equal(api.isIncluded("pta", "note-1"), true);
assert.equal(api.setIncluded("pta", "note-1", false), true);
assert.equal(api.isIncluded("pta", "note-1"), false);
assert.equal(api.isIncluded("driver", "missing-note"), false);
console.log("Per-note transition toggle default-off smoke test passed.");
