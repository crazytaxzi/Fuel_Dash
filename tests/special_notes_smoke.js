"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const store = new Map();
const localStorage = { getItem(key) { return store.get(key) ?? null; }, setItem(key, value) { store.set(key, String(value)); } };
const element = () => ({ id: "", className: "", innerHTML: "", dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, append() {}, addEventListener() {}, reset() {}, focus() {} });
const document = { hidden: false, head: { append() {} }, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement: element, addEventListener() {} };
const window = { VixenSpecialNotes: null, addEventListener() {}, setTimeout() { return 1; }, clearTimeout() {}, confirm() { return true; } };
const context = { window, document, localStorage, console, Notification: class {}, Date, JSON, String, Number, Math, Array, Object, Set };
vm.createContext(context);
vm.runInContext(fs.readFileSync("special_notes.js", "utf8"), context, { filename: "special_notes.js" });

const api = window.VixenSpecialNotes;
const now = new Date("2026-08-01T12:00:00Z").getTime();
const saved = api.saveNote({ title: "Call maintenance", body: "Confirm repair ETA", dueAt: now + 60000 }, now);
assert.equal(api.loadNotes().length, 1);
assert.equal(api.dueState(saved, now), "scheduled");
assert.equal(api.dueState(saved, now + 60001), "due");
assert.equal(api.notificationBody(saved), "Call maintenance: Confirm repair ETA");
api.completeNote(saved.id, true, now + 70000);
assert.equal(api.dueState(api.loadNotes()[0], now + 80000), "complete");
api.completeNote(saved.id, false, now + 90000);
assert.equal(api.dueState(api.loadNotes()[0], now + 90000), "due");
api.removeNote(saved.id);
assert.equal(api.loadNotes().length, 0);

console.log("Special notes, reminders, and completion smoke test passed.");
