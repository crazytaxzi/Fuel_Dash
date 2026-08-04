const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const bootstrap = fs.readFileSync("database/bootstrap.js", "utf8");
const workbench = fs.readFileSync("database/driver-workbench.js", "utf8");
const renderer = fs.readFileSync("database/driver-workbench-render.js", "utf8");
const parser = fs.readFileSync("core/driver_centric_parser.js", "utf8");

assert.match(bootstrap, /core\/driver_report_adapter\.js/);
assert.match(bootstrap, /core\/driver_assignments\.js/);
assert.match(bootstrap, /driver-workbench-render\.js/);
assert.doesNotMatch(bootstrap, /database\/driver-operations\.js/);
assert.doesNotMatch(bootstrap, /trip-planning-notes|trip-planning-table|missing_bol_driver_only|worked-navigation-fix/);
assert.match(bootstrap, /BUILD_VERSION = "3\.22\.0"/);
assert.doesNotMatch(workbench, /Open full fuel detail|Open PTA board|data-open-driver-modal|data-open-pta-board/);
assert.doesNotMatch(workbench, /vixenTripPlanningNotes305V1|VixenTripPlanningNotes/);
assert.match(renderer, /Save \+ next/);
assert.match(workbench, /VixenDashboardWorkflow = Object\.freeze/);
assert.doesNotMatch(parser, /planningRecords|VixenTripPlanningNotes|ptaDisplay/);
assert.match(parser, /currentIdleSource/);

const storage = new Map();
const events = [];
const context = {
  window: {},
  localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  document: { dispatchEvent: (event) => events.push(event) },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  Date,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("core/driver_assignments.js", "utf8"), context);
const assignments = context.window.VixenDriverOperations;
assert.ok(assignments.saveAssignment({ driverCode: "123", driverName: "A Driver", truck: "900" }));
assert.equal(assignments.assignmentFor({ driverCode: "123" }).truck, "900");
assert.equal(assignments.removeAssignment({ driverCode: "123" }), true);
assert.equal(assignments.assignmentFor({ driverCode: "123" }), null);
assert.equal(events.length, 2);
console.log("Cleanup architecture smoke passed.");
