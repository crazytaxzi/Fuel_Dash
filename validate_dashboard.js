const fs = require('fs');
const vm = require('vm');
const path = require('path');
const XLSX = require('/mnt/data/html_dashboard_build/node_modules/xlsx');

global.XLSX = XLSX;
global.window = {};
global.document = {
  addEventListener: () => {},
  getElementById: () => null,
  querySelectorAll: () => [],
  title: ''
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.indexedDB = {};
global.Chart = { defaults: { font: {} } };

const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
vm.runInThisContext(appCode, { filename: 'app.js' });

function readWorkbook(file) {
  return XLSX.read(fs.readFileSync(file), { type: 'buffer', raw: true });
}

const workbooks = {
  summary: readWorkbook('/mnt/data/summary.xlsx'),
  drivers: readWorkbook('/mnt/data/c1.xlsx'),
  detail: readWorkbook('/mnt/data/Detail.xlsx'),
  trend: readWorkbook('/mnt/data/summary chart.xlsx'),
  ptaTracker: readWorkbook('/mnt/data/PTA_Dispatch_Tracker_Updated_FIXED.xlsx'),
  ptaFinder: readWorkbook('/mnt/data/Fleet_PTA_Finder.xlsx'),
};
const files = {
  summary: { name: 'summary.xlsx' },
  drivers: { name: 'c1.xlsx' },
  detail: { name: 'Detail.xlsx' },
  trend: { name: 'summary chart.xlsx' },
  ptaTracker: { name: 'PTA_Dispatch_Tracker_Updated_FIXED.xlsx' },
  ptaFinder: { name: 'Fleet_PTA_Finder.xlsx' },
};

const analysis = window.VixenFuelDebug.analyzeWorkbooks(workbooks, files);
const output = {
  latestWeek: analysis.summary.latest.date.toISOString().slice(0, 10),
  compliance: analysis.summary.latest.compliance,
  drivers: analysis.drivers.records.length,
  topDriver: analysis.drivers.records[0]?.driverName,
  modeledCost: analysis.drivers.totals.modeledCost,
  detailRows: analysis.detail.records.length,
  netCost: analysis.detail.totals.netCost,
  trendWeeks: analysis.trend.weeks.length,
  qualityFindings: analysis.quality.findings.length,
  ptaRecords: analysis.pta.allRecords.length,
  overduePtas: analysis.pta.summary.overdue,
  ptaAvailableSoon: analysis.pta.summary.availableSoon,
  ptaDispatchedSoon: analysis.pta.summary.dispatchedSoon,
};

const iso = (hours) => new Date(Date.now() + (hours * 3600000)).toISOString();
const pastedPta = [
  'Truck #\tDiv #\tDriver\tPTA\tStatus\tPlans\tPlan\tTeam\tDestination\tOM\tCount',
  `1001\t110\tTESTA\t${iso(-30)}\tAvailable\tNo Preplan\t\tSolo\tSEA\t5000\t1`,
  `1002\t110\tTESTB\t${iso(12)}\tDispatched\tNo Preplan\t\tSolo\tSPO\t4200\t2`,
  `1003\t110\tTESTC\t${iso(24)}\tLoaded\tNo Preplan\t\tTeam\tPOR\t3500\t3`,
  `1004\t110\tTESTD\t${iso(8)}\tAvailable\tPreplan\tSWAP\tSolo\tSEA\t3000\t1`,
].join('\n');
const pastedRows = window.VixenFuelDebug.normalizePtaPasteRows(pastedPta);
const pastedAnalysis = window.VixenFuelDebug.analyzePta(null, null, {}, pastedRows);
output.manualPasteRows = pastedRows.length - 1;
output.manualPasteOverdue = pastedAnalysis.summary.overdue;
output.manualPasteAvailableSoon = pastedAnalysis.summary.availableSoon;
output.manualPasteDispatchedSoon = pastedAnalysis.summary.dispatchedSoon;
output.manualPasteActive = pastedAnalysis.manualPaste;
output.ptaNoteTruckKey = window.VixenFuelDebug.ptaTruckNoteKey({ truck: " 12-34 A " });

console.log(JSON.stringify(output, null, 2));
if (output.latestWeek !== '2026-07-18') process.exit(2);
if (output.drivers < 10 || output.detailRows < 200 || output.trendWeeks < 6) process.exit(3);
if (output.ptaRecords < 50 || output.ptaAvailableSoon < 1 || output.ptaDispatchedSoon < 1) process.exit(4);
if (output.manualPasteRows !== 4 || output.manualPasteAvailableSoon !== 1 || output.manualPasteDispatchedSoon !== 2 || !output.manualPasteActive) process.exit(5);
if (output.ptaNoteTruckKey !== "1234A") process.exit(6);
