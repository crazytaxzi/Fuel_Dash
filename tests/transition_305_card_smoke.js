"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const records = [{
  truck: "30542",
  driver: "Jordan Smith",
  status: "Needs plan",
  nextAction: "Call dispatch with the route",
  notes: [{ text: "Waiting on receiver confirmation", savedAt: "2026-08-01T10:00:00Z" }],
}];
const original = {
  buildContext: () => ({}),
  buildEmail: () => ({ context: {}, subject: "", html: "", text: "" }),
  buildTransition: () => "",
  renderTemplate: (template) => template,
  refresh() {},
};
const window = { VixenTransitionExport: original, addEventListener() {}, setTimeout() { return 1; }, clearTimeout() {} };
const document = {
  readyState: "complete",
  documentElement: { dataset: {} },
  getElementById() { return null; },
  addEventListener() {},
};
const localStorage = { getItem(key) { return key === "vixenTripPlanningNotes305V1" ? JSON.stringify(records) : null; } };
const context = { window, document, localStorage, console, Date, JSON, String, Number, Math, Array, Object };
vm.createContext(context);
vm.runInContext(fs.readFileSync("database/transition-305-extension.js", "utf8"), context);

const output = window.VixenTransitionExport.buildContext();
assert.match(output.division_305_followups_html, /<strong>30542<\/strong> &mdash; Jordan Smith/);
assert.doesNotMatch(output.division_305_followups_html, /Truck <strong>/);
assert.match(output.division_305_followups_html, /border-left:5px solid #2563eb/);
assert.match(output.division_305_followups_html, /border-bottom:1px solid #d8e0ea/);
assert.match(output.division_305_followups_html, /Waiting on receiver confirmation/);
assert.doesNotMatch(output.division_305_followups_html, /Call dispatch|Next action|Needs plan/);

const manualCard = window.VixenTransitionExport.renderTemplate("{{card_start}}Manual note{{card_end}}", {});
assert.match(manualCard, /border-left:5px solid #7c3aed/);
assert.match(manualCard, />Manual note<\/td>/);

console.log("Simplified Division 305 and manual transition card smoke test passed.");
