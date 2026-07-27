const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("app.js", "utf8");
const inspector = fs.readFileSync("smart_data_loader.js", "utf8");
const auxiliary = fs.readFileSync("auxiliary_mode.js", "utf8");

assert.match(app, /classifyReportFiles\(candidates\)/, "folder/manual loading must use the content classifier");
assert.match(inspector, /async function classifyFiles/, "shared classifier must expose file classification");
assert.match(inspector, /structuralScore/, "classification must use worksheet structure");
assert.match(auxiliary, /buildDerivedDriverMetrics/, "partial idle joins must be role based");
console.log("Content discovery smoke test passed.");
