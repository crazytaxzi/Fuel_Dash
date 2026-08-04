const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  window: {},
  document: { dispatchEvent() {} },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  console,
  Date,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("core/driver_report_adapter.js", "utf8"), context);
const test = context.window.VixenReportAdapterTest;

const rolling7 = [
  ["92385 JAMES S NEBLETT", "Idle %", "7/19/2026", "611 - Lewiston - Van", "Line Haul", "Lewiston", "VANHL", "LEW1", "231540", "7/13/2026", .20],
  ["", "Rolling 7 Day Dispatch Miles", "7/19/2026", "611 - Lewiston - Van", "Line Haul", "Lewiston", "VANHL", "LEW1", "231540", "7/13/2026", 2200],
  ["", "Rolling 7 Day Qualcomm Miles", "7/19/2026", "611 - Lewiston - Van", "Line Haul", "Lewiston", "VANHL", "LEW1", "231540", "7/13/2026", 2300],
  ["", "[Rolling 7 Day Engine Time]/60", "7/19/2026", "611 - Lewiston - Van", "Line Haul", "Lewiston", "VANHL", "LEW1", "231540", "7/13/2026", 50],
  ["", "[Rolling 7 Day Idle Time]/60", "7/19/2026", "611 - Lewiston - Van", "Line Haul", "Lewiston", "VANHL", "LEW1", "231540", "7/13/2026", 10],
];
const details = [
  ["Driver", "92385 JAMES S NEBLETT", "7/19/2026", "6/22/2026", "611 - Lewiston - Van", "*", "Lewiston", "VANHL", "LEW1", "*", "20%", 0, 0, "% Cruise in Time", .68],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "Dispatch MPG", 7.2],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "Moving MPG", 7.8],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "OOR %", .04],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "Rolling 28 Day Dispatch Miles", 8000],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "Rolling 28 Day Fuel Gallons", 1100],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "Rolling 28 Day Qualcomm Miles", 8200],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "[Rolling 28 Day Engine Time]/60", 200],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "[Rolling 28 Day Idle Time]/60", 40],
];

const seven = test.flattenRolling7(rolling7);
const twentyEight = test.flattenDriverDetails(details);
assert.equal(seven.length, 1);
assert.equal(twentyEight.length, 1);
assert.equal(seven[0][0], "92385 JAMES S NEBLETT");
assert.equal(seven[0][11], "231540");
assert.equal(seven[0][3], 50);
assert.equal(seven[0][4], 10);
assert.equal(twentyEight[0][4], 7.2);
assert.equal(twentyEight[0][5], 7.8);
assert.equal(twentyEight[0][6], .04);
assert.equal(twentyEight[0][2], 200);
assert.equal(twentyEight[0][3], 40);
console.log("Driver report adapter smoke passed.");
