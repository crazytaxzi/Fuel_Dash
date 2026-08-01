const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("app.js", "utf8");
const inspector = fs.readFileSync("smart_data_loader.js", "utf8");
const auxiliary = fs.readFileSync("auxiliary_mode.js", "utf8");

assert.match(app, /classifyReportFiles\(candidates\)/);
assert.match(app, /idle: \["detail", "driverMetricsDetail", "driverDetails", "rolling7Day"\]/);
assert.match(inspector, /xlsxThreshold/);
assert.match(inspector, /roleQualifies/);
assert.match(auxiliary, /routes\.detail && routes\.driverDetails && routes\.rolling7Day/);
assert.match(auxiliary, /item\.slice\(10\)/, "rolling idle bridge must skip the week-start date column");
assert.equal((app.match(/analyzeApu\(apuWorkbookRows\(workbooks\.apu\), drivers, files\.apu \|\| null\)/g) || []).length, 2, "basic and idle modes must both pass the routed APU workbook to the parser");
assert.match(app, /function apuWorkbookRows\(workbook\)[\s\S]*for \(const sheetName of workbook\.SheetNames\)[\s\S]*findApuHeaderRow\(rows\) >= 0/, "APU parsing must inspect every worksheet for its header row");
assert.match(app, /function ptaDriverCode\(fullName, driverCode = ""\)[\s\S]*last\.slice\(0, 7\)[\s\S]*slice\(0, 8\)/, "PTA driver codes must use up to seven surname characters plus the first-name initial, capped at eight characters");
assert.equal((app.match(/attachDriverTruckAssignments\(drivers, pta, apu\);/g) || []).length, 3, "every report mode must attach PTA and APU truck assignments to drivers");
assert.match(app, /function driverAssignmentLabel\(driver\)[\s\S]*Truck \$\{driver\.assignedTruck\} — \$\{name\}/, "linked trucks and drivers must remain one operational assignment in the UI");
assert.match(app, /truck: driver\.assignedTruck \|\| ""/, "driver follow-up notes must retain their matched truck for handoff grouping");
assert.doesNotMatch(app, /const emptyApu = analyzeApu\(\[\], drivers, null\)/, "basic mode must not discard routed APU data");
console.log("Content discovery and partial-idle bridge smoke test passed.");
