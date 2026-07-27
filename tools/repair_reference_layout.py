from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new), encoding="utf-8")


# The idle analyzer never reads a summary workbook. Requiring one only blocked valid
# operating sets and forced the auxiliary bridge to wait on irrelevant data.
replace_once(
    "app.js",
    '    idle: ["summary", "detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],',
    '    idle: ["detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],',
)
replace_once(
    "app.js",
    '      ? { summary: Object.fromEntries(REPORT_ROLE_GROUPS.legacy.map((role) => [role, true])).summary, detail: Object.fromEntries(REPORT_ROLE_GROUPS.legacy.map((role) => [role, true])).detail, ...Object.fromEntries(REPORT_ROLE_GROUPS.idle.filter((role) => !["summary", "detail"].includes(role)).map((role) => [role, true])), ...Object.fromEntries(["apu", "ptaTracker", "ptaFinder", "driverPdf"].map((role) => [role, true])) }',
    '      ? { ...Object.fromEntries(REPORT_ROLE_GROUPS.idle.map((role) => [role, true])), ...Object.fromEntries(["apu", "ptaTracker", "ptaFinder", "driverPdf"].map((role) => [role, true])) }',
)

# Stop wide phrase matches from promoting repeating driver-history and transaction
# reports into incompatible table roles. XLSX files must clear a structural threshold;
# PDFs retain their lower text-oriented threshold.
replace_once(
    "smart_data_loader.js",
    '    trend: { threshold: 14, phrases: [["date axis", 8], ["gallon over under cost", 7], ["location noncompliant cost", 7], ["total noncompliant cost", 7]] },',
    '    trend: { threshold: 14, xlsxThreshold: 24, phrases: [["date axis", 8], ["gallon over under cost", 7], ["location noncompliant cost", 7], ["total noncompliant cost", 7]] },',
)
replace_once(
    "smart_data_loader.js",
    '    reportDriverMetrics: { threshold: 12, phrases: [["driver fuel metrics", 10], ["dispatch mpg", 6], ["idle", 3], ["oor", 4], ["driver current position code", 5]] },',
    '    reportDriverMetrics: { threshold: 12, xlsxThreshold: 20, phrases: [["driver fuel metrics", 10], ["dispatch mpg", 6], ["idle", 3], ["oor", 4], ["driver current position code", 5]] },',
)
replace_once(
    "smart_data_loader.js",
    '    driverMetricsDetail: { threshold: 12, phrases: [["driver metrics detail", 10], ["driver fuel metrics", 8], ["dispatch mpg", 6], ["idle", 3], ["oor", 4]] },',
    '    driverMetricsDetail: { threshold: 12, xlsxThreshold: 20, phrases: [["driver metrics detail", 10], ["driver fuel metrics", 8], ["dispatch mpg", 6], ["idle", 3], ["oor", 4]] },',
)
replace_once(
    "smart_data_loader.js",
    '    reportMpg: { threshold: 11, phrases: [["mpg by driver", 10], ["dispatch mpg", 5], ["driver code", 4], ["driver name", 3], ["mpg", 2]] },',
    '    reportMpg: { threshold: 11, xlsxThreshold: 16, phrases: [["mpg by driver", 10], ["dispatch mpg", 5], ["driver code", 4], ["driver name", 3], ["mpg", 2]] },',
)
replace_once(
    "smart_data_loader.js",
    '    inspectFile,\n    supported: (file) => Boolean(file && SUPPORTED_REPORT.test(file.name || "")),',
    '    inspectFile,\n    test: { scoreInspection, structuralScore, roleThreshold, roleQualifies, normalize },\n    supported: (file) => Boolean(file && SUPPORTED_REPORT.test(file.name || "")),',
)
replace_once(
    "smart_data_loader.js",
    '        .filter((entry) => entry.value >= rule.threshold)',
    '        .filter((entry) => entry.value >= roleThreshold(rule, entry.inspection.kind))',
)
replace_once(
    "smart_data_loader.js",
    '  function structuralScore(role, inspection) {',
    '  function roleThreshold(rule, kind) {\n    return rule?.[`${kind}Threshold`] ?? rule?.threshold ?? Number.POSITIVE_INFINITY;\n  }\n\n  function roleQualifies(role, inspection) {\n    const rule = ROLE_RULES[role];\n    return Boolean(rule) && (scoreInspection(inspection)[role] || 0) >= roleThreshold(rule, inspection.kind);\n  }\n\n  function structuralScore(role, inspection) {',
)

# Build the missing metrics index directly from the two history reports and read the
# actual idle-value columns, not the preceding week-start date.
replace_once(
    "auxiliary_mode.js",
    '    idle: ["summary", "detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],',
    '    idle: ["detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],',
)
replace_once(
    "auxiliary_mode.js",
    '    if (routes.summary && routes.detail && routes.driverDetails && routes.rolling7Day && !routes.driverMetricsDetail) {',
    '    if (routes.detail && routes.driverDetails && routes.rolling7Day && !routes.driverMetricsDetail) {',
)
replace_once(
    "auxiliary_mode.js",
    '        const idlePct = item.slice(8).map(normalizePercent).find((value) => Number.isFinite(value));',
    '        const idlePct = item.slice(10).map(normalizePercent).find((value) => Number.isFinite(value));',
)

# The dispatch-driver column is authoritative. Preserve its value even when the
# operational code is shorter than the usual classification rules (for example RATB).
replace_once(
    "missing_bol.js",
    '  const DRIVER_CODE_PATTERN = /(?:^|\\b)([A-Z]{5}\\d|[A-Z]{5,6}|\\d{5,6})(?:\\b|$)/i;',
    '  const DRIVER_CODE_PATTERN = /^(?:[A-Z]{5}\\d|[A-Z]{4,6}|\\d{5,6})$/i;',
)
replace_once(
    "missing_bol.js",
    '      const driverCode = extractDriverCode(row[source.columns.driverCode]) || "Not recognized";',
    '      const driverCode = extractDriverCode(row[source.columns.driverCode]) || "Not listed";',
)
replace_once(
    "missing_bol.js",
    '  function extractDriverCode(value) {\n    return String(value ?? "").trim().toUpperCase().match(DRIVER_CODE_PATTERN)?.[1] || "";\n  }',
    '  function extractDriverCode(value) {\n    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");\n  }',
)

Path("tests/live_bol_export_smoke.js").write_text(r'''"use strict";

const assert = require("node:assert/strict");

const headers = [
  "Order #", "TMEX Order #", "Logistics Order#", "Bill To", "Division#", "Shipper LOB",
  "Empty Call Date", "Origin City St", "Destination City St", "Billing Leader", "Billing Analyst",
  "AR Leader", "AR Analyst", "Bankq flg", "Rev Type", "Terminal", "Terminal Leader", "Buyer",
  "Carrier", "Dray Name", "Driver Leader", "Driver Status", "Last Dispatch Driver cd",
  "Last Dispatch Driver nm", "Terminal Leader", "Terminal Leader", "Loaded Miles",
  "Order Level Order Miles", "Total Revenue",
];

const rows = [
  headers,
  ["ABC1234", "", "", "Customer A", "305", "Line Haul", "7/25/26", "City A", "City B", "", "", "", "", "N", "Unbilled", "", "", "", "", "", "Leader A", "Active", "336189"],
  ["DEF2345", "", "", "Customer B", "305", "Line Haul", "7/20/26", "City C", "City D", "", "", "", "", "N", "Unbilled", "", "", "", "", "", "Leader B", "Active", "RATB"],
];

const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const find = (aliases) => {
  const normalized = headers.map(normalize);
  for (const alias of aliases.map(normalize)) {
    const exact = normalized.findIndex((header) => header === alias);
    if (exact >= 0) return exact;
  }
  return -1;
};
const tripPattern = /\b([A-Z]{3}\d{4})\b/i;
const driverPattern = /^(?:[A-Z]{5}\d|[A-Z]{4,6}|\d{5,6})$/i;
const cleanDriverCode = (value) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const sampleHits = (column) => rows.slice(1).filter((row) => tripPattern.test(String(row[column] ?? ""))).length;

assert.equal(tripPattern.test("AB1234"), false);
assert.equal(tripPattern.test("ABC1234"), true);
assert.equal(find(["empty call date"]), 6);
assert.equal(find(["driver leader"]), 20);
assert.equal(find(["last dispatch driver cd"]), 22);

const orderColumns = [find(["order #"]), find(["tmex order #"]), find(["logistics order#"])];
const selectedTripColumn = orderColumns
  .map((column) => ({ column, hits: sampleHits(column) }))
  .sort((a, b) => b.hits - a.hits)[0];
assert.equal(selectedTripColumn.column, 0, "the live export stores trip numbers in Order #");
assert.equal(selectedTripColumn.hits, 2);
assert.equal(cleanDriverCode(rows[2][22]), "RATB", "short legacy dispatch codes must be preserved");
assert.equal(driverPattern.test(cleanDriverCode(rows[2][22])), true);

const oldestFirst = rows.slice(1).sort((a, b) => new Date(a[6]) - new Date(b[6]));
assert.equal(oldestFirst[0][0], "DEF2345");
assert.equal(oldestFirst[1][0], "ABC1234");
console.log("Live Missing BOL export smoke test passed.");
''', encoding="utf-8")

Path("tests/operating_layout_smoke.js").write_text(r'''"use strict";

const assert = require("node:assert/strict");

global.window = {};
global.fetch = async () => ({ ok: false, json: async () => [] });
require("../smart_data_loader.js");

const test = window.VixenDataInspector.test;
const inspection = (rows) => ({
  kind: "xlsx",
  rows,
  sheetNames: ["Sheet 1"],
  text: test.normalize(rows.flat().filter((value) => value !== null && value !== "").join("\n")),
});

const costSummary = inspection([
  ["Groupby", "Thenby", "Fuel Rec Count", "Actual Gallon Amounts", "Gallon Over/Under Cost", "Location Noncompliant Cost", "Total Noncompliant Cost"],
  ["Grand Total", "Total", 2000, 200000, 4500, 2300, 6800],
]);
assert.equal(test.roleQualifies("reportCost", costSummary), true);
assert.equal(test.roleQualifies("trend", costSummary), false, "a one-period cost summary is not a trend report");

const transactionDetail = inspection([
  ["Unit#", "Order#", "Actual Fuel Date", "Purchase Type", "Rec Gallons", "Location Compliant", "Actual Gallons", "Gallon Over/Under Cost", "Location Noncompliant Cost", "Total Noncompliant Cost"],
  [220001, "ABC1234-01", "7/21/26", "Fill", 100, "Y", 95, 0, 0, 0],
]);
assert.equal(test.roleQualifies("detail", transactionDetail), true);
assert.equal(test.roleQualifies("trend", transactionDetail), false, "transaction detail must not be routed as trend data");

const rollingRows = [
  ["", "", "", "", "", "", "", "", "", "", "Week Start Date"],
  ["Grand Total", "Rolling 7 Day Dispatch Miles", "Total", "", "", "", "", "", "", "", 100000],
  ["92385 SAMPLE DRIVER", "Idle %", "7/19/2026", "Division", "Line Haul", "Terminal", "VANHL", "LEW1", "*", "7/13/2026", 0.16],
  ["ABCDE1 SAMPLE DRIVER", "Idle %", "7/19/2026", "Division", "Line Haul", "Terminal", "VANHL", "LEW1", "*", "7/13/2026", 0.22],
];
const rolling = inspection(rollingRows);
assert.equal(test.roleQualifies("rolling7Day", rolling), true);
assert.equal(test.roleQualifies("driverMetricsDetail", rolling), false);

const historyRows = Array.from({ length: 10 }, () => []);
historyRows[0] = ["Driver", "92385 SAMPLE DRIVER", "7/19/2026", "6/22/2026", "Division", "*", "Terminal", "VANHL", "LEW1", "*", "19.0%", 0, 0, "% Cruise in Time", 0.60];
historyRows[3] = Array(13).fill("").concat(["Dispatch MPG", 7.1]);
historyRows[5] = Array(13).fill("").concat(["Idle %", 0.34]);
historyRows[9] = Array(13).fill("").concat(["Moving MPG", 7.7, "OOR %", 0.05]);
const driverHistory = inspection(historyRows);
assert.equal(test.roleQualifies("driverDetails", driverHistory), true);
assert.equal(test.roleQualifies("reportDriverMetrics", driverHistory), false, "repeating history blocks are not flat driver-metric tables");
assert.equal(test.roleQualifies("driverMetricsDetail", driverHistory), false);
assert.equal(test.roleQualifies("reportMpg", driverHistory), false);

console.log("Operating layout classifier smoke test passed.");
''', encoding="utf-8")

Path("tests/auxiliary_mode_smoke.js").write_text(r'''const fs = require("fs");
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
''', encoding="utf-8")

Path("tests/README.md").write_text(
    "Run `node validate_dashboard.js`, `node tests/auxiliary_mode_smoke.js`, "
    "`node tests/operating_layout_smoke.js`, and `node tests/live_bol_export_smoke.js`. "
    "The fixtures are synthetic and contain no operating data.\n",
    encoding="utf-8",
)

Path("BETA_VERSION").write_text("v2026.07.26-beta.7\n", encoding="utf-8")
Path("BETA_BUILD.txt").write_text(
    "Fuel Dash Beta\nVersion: v2026.07.26-beta.7\nSource: testing\n"
    "Report discovery: content-based; validated against sanitized operating layouts\n",
    encoding="utf-8",
)
Path("BETA_BUILD_NOTES.md").write_text(
    "Beta 7 corrects classifier false positives and validates the normal five-file operating layout with sanitized fixtures.\n",
    encoding="utf-8",
)
Path("BETA_SUPERSEDES.txt").write_text(
    "Betas 1 through 6 are superseded by v2026.07.26-beta.7.\n",
    encoding="utf-8",
)
Path("BETA_RELEASE_NOTES.md").write_text('''# Fuel Dash Beta

Release: `v2026.07.26-beta.7`

## Reference-file repair

- Validated the parser against the supplied operating workbook structures without committing or packaging the source files.
- Removed the unused summary dependency from joined idle-report mode.
- Prevented repeating Driver Details blocks from being misclassified as flat driver metrics or MPG reports.
- Prevented transaction detail and one-period cost summaries from being misclassified as trend reports.
- Derived the driver index from rolling idle and driver-history data when a separate flat driver table is absent.
- Corrected rolling-idle extraction so the week-start date is not mistaken for a percentage.
- Missing BOL trips are read from whichever order column contains exactly three letters followed by four digits, including the live `Order #` layout.
- Dispatch driver codes are preserved directly from `Last Dispatch Driver cd`, including short legacy values such as four-letter codes.
- Added sanitized structural regression tests. No supplied operating workbook is stored in the repository or beta package.

## Beta warning

This build is intended for the supplied operating layouts. Unsupported future export changes should appear as diagnostics rather than being forced into the wrong parser.
''', encoding="utf-8")

# Remove the one-time script in the same repair commit.
Path("tools/repair_reference_layout.py").unlink()
