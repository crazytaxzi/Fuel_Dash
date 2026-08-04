"use strict";

const fs = require("fs");
const assert = require("assert");

const parser = fs.readFileSync("core/driver_centric_parser.js", "utf8");
const workbench = fs.readFileSync("database/driver-workbench.js", "utf8");
const bootstrap = fs.readFileSync("database/bootstrap.js", "utf8");

assert.match(parser, /const ptaLookup = buildLookup\(ptaRecords\)/, "PTA joins should use indexed lookup maps");
assert.match(parser, /records\.sort\(sortRecords\)/, "driver records should be sorted by operational risk and PTA");
assert.match(parser, /overdue-no-preplan/, "overdue/no-preplan must remain the highest-priority state");
assert.match(workbench, /Idle current/);
assert.match(workbench, /Idle 7-day/);
assert.match(workbench, /Idle 28-day/);
assert.match(workbench, /Load status/);
assert.match(workbench, /Planning status/);
assert.match(workbench, /Save operating state/);
assert.match(workbench, /Missing BOL work/);
assert.match(workbench, /Electric APU/);
assert.match(workbench, /vixenDriverActionNotesV1/, "quick notes must use the existing driver-note store");
assert.match(bootstrap, /Promise\.all\(FOUNDATION_MODULES\.map\(loadOptionalScript\)\)/, "independent startup modules should load concurrently");
assert.match(bootstrap, /database\/driver-workbench\.js/);

console.log("driver_workbench_smoke: ok");
