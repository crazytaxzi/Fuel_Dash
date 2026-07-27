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
console.log("Content discovery and partial-idle bridge smoke test passed.");
