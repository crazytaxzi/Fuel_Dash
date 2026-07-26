from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.replace("\r\n", "\n"), encoding="utf-8")


def replace_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Could not replace {label}; matches={count}")
    return updated


SMART_LOADER = r'''(() => {
  "use strict";

  const SUPPORTED_REPORT = /\.(?:xlsx|xlsm|xlsb|xls|pdf)$/i;
  const diagnostics = { files: [], routes: {}, unclassified: [], errors: [] };
  const ROLE_RULES = Object.freeze({
    summary: { threshold: 12, phrases: [["zz recommendation", 8], ["zz compliance", 8], ["re opt count", 4], ["primary rec compliance", 4]] },
    drivers: { threshold: 14, phrases: [["driver leader name", 8], ["fleet manager match", 6], ["rolling 28 day dispatch miles", 8], ["rolling 4 week dispatch mpg", 8]] },
    detail: { threshold: 14, phrases: [["actual fuel date", 7], ["rec gallons", 6], ["actual gallons", 6], ["location compliant", 6], ["purchase type", 4]] },
    trend: { threshold: 14, phrases: [["date axis", 8], ["gallon over under cost", 7], ["location noncompliant cost", 7], ["total noncompliant cost", 7]] },
    reportDriverMetrics: { threshold: 12, phrases: [["driver fuel metrics", 10], ["dispatch mpg", 6], ["idle", 3], ["oor", 4], ["driver current position code", 5]] },
    driverMetricsDetail: { threshold: 12, phrases: [["driver metrics detail", 10], ["driver fuel metrics", 8], ["dispatch mpg", 6], ["idle", 3], ["oor", 4]] },
    reportCompliance: { threshold: 11, phrases: [["fuel compliance analysis", 10], ["compliance", 4], ["date range", 3], ["last refreshed", 2], ["recommendation", 2]] },
    reportCost: { threshold: 12, phrases: [["fuel noncompliant cost analysis", 10], ["gallon over under cost", 6], ["location noncompliant cost", 6], ["total noncompliant cost", 6]] },
    reportMpg: { threshold: 11, phrases: [["mpg by driver", 10], ["dispatch mpg", 5], ["driver code", 4], ["driver name", 3], ["mpg", 2]] },
    rolling7Day: { threshold: 12, phrases: [["rolling 7 day", 10], ["idle", 3], ["driver", 2]] },
    driverDetails: { threshold: 12, phrases: [["driver details", 8], ["cruise in time", 10], ["moving mpg", 4], ["idle", 3]] },
    apu: { threshold: 11, phrases: [["electric apu", 8], ["apu hours", 5], ["engine idle hours", 5], ["battery soc", 5], ["state of charge", 4], ["faults", 3]] },
    ptaTracker: { threshold: 11, phrases: [["projected time available", 8], ["pta", 4], ["truck", 3], ["driver", 3], ["status", 2], ["plans", 3]] },
    ptaFinder: { threshold: 12, phrases: [["pta", 4], ["preplan", 6], ["available", 4], ["dispatched", 4], ["flag", 3], ["truck", 2], ["driver", 2]] },
    driverPdf: { threshold: 11, pdfOnly: true, phrases: [["driver", 3], ["dispatch mpg", 5], ["idle", 3], ["fuel cost", 4], ["unit", 2]] },
  });

  const inspector = {
    diagnostics,
    ready: null,
    classifyFiles,
    inspectFile,
    supported: (file) => Boolean(file && SUPPORTED_REPORT.test(file.name || "")),
  };

  window.VixenDataInspector = inspector;
  window.VixenSmartDataLoader = inspector;
  inspector.ready = loadManifestFiles()
    .then((files) => classifyFiles(files))
    .catch((error) => {
      diagnostics.errors.push(error?.message || String(error));
      return { routes: {}, diagnostics };
    });

  async function loadManifestFiles() {
    const response = await fetch("data-manifest.json", { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json();
    const files = [];
    for (const item of Array.isArray(manifest) ? manifest : []) {
      if (!SUPPORTED_REPORT.test(item?.name || "") || !item?.path) continue;
      try {
        const fileResponse = await fetch(encodeURI(item.path), { cache: "no-store" });
        if (!fileResponse.ok) throw new Error(`HTTP ${fileResponse.status}`);
        const blob = await fileResponse.blob();
        files.push(new File([blob], item.name, {
          type: blob.type || genericMime(item.name),
          lastModified: Date.parse(item.lastModified) || 0,
        }));
      } catch (error) {
        diagnostics.errors.push(`${item?.name || "Report"}: ${error?.message || error}`);
      }
    }
    return files;
  }

  async function classifyFiles(inputFiles) {
    const files = Array.from(inputFiles || []).filter((file) => inspector.supported(file));
    const run = { files: [], routes: {}, unclassified: [], errors: [] };
    const inspected = [];

    for (const file of files) {
      try {
        const inspection = await inspectFile(file);
        const scores = scoreInspection(inspection);
        inspected.push({ file, inspection, scores });
        run.files.push({ name: file.name, kind: inspection.kind, sheets: inspection.sheetNames, scores });
      } catch (error) {
        run.errors.push(`${file.name}: ${error?.message || error}`);
      }
    }

    for (const [role, rule] of Object.entries(ROLE_RULES)) {
      const candidates = inspected
        .map((entry) => ({ ...entry, value: entry.scores[role] || 0 }))
        .filter((entry) => entry.value >= rule.threshold)
        .sort((a, b) => b.value - a.value || (b.file.lastModified || 0) - (a.file.lastModified || 0));
      if (candidates.length) {
        run.routes[role] = candidates[0].file;
        run.routes[role].vixenRole = role;
        run.routes[role].vixenConfidence = candidates[0].value;
        run.routes[role].vixenInspection = candidates[0].inspection;
      }
    }

    if (!run.routes.driverMetricsDetail && run.routes.reportDriverMetrics && !/\.pdf$/i.test(run.routes.reportDriverMetrics.name)) {
      run.routes.driverMetricsDetail = run.routes.reportDriverMetrics;
    }
    if (!run.routes.reportDriverMetrics && run.routes.driverMetricsDetail) {
      run.routes.reportDriverMetrics = run.routes.driverMetricsDetail;
    }
    if (!run.routes.driverPdf && run.routes.reportDriverMetrics && /\.pdf$/i.test(run.routes.reportDriverMetrics.name)) {
      run.routes.driverPdf = run.routes.reportDriverMetrics;
    }

    const used = new Set(Object.values(run.routes));
    run.unclassified = files.filter((file) => !used.has(file)).map((file) => file.name);
    Object.assign(diagnostics, run);
    console.info("[Vixen Data Inspector] content-based roles", Object.fromEntries(Object.entries(run.routes).map(([role, file]) => [role, { source: file.name, score: file.vixenConfidence || 0 }])));
    if (run.unclassified.length) console.warn("[Vixen Data Inspector] unclassified reports", run.unclassified);
    if (run.errors.length) console.warn("[Vixen Data Inspector] inspection errors", run.errors);
    return { routes: run.routes, diagnostics: run };
  }

  async function inspectFile(file) {
    const buffer = await file.arrayBuffer();
    return /\.pdf$/i.test(file.name) ? inspectPdf(buffer) : inspectWorkbook(buffer);
  }

  function inspectWorkbook(buffer) {
    if (!window.XLSX) throw new Error("SheetJS was not loaded before the data inspector.");
    const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false });
    const sheetNames = workbook.SheetNames.slice();
    const rows = [];
    const text = [...sheetNames];
    let cellsLeft = 20000;
    for (const name of sheetNames.slice(0, 15)) {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "", blankrows: true }).slice(0, 240);
      for (const row of sheetRows) {
        const sampled = Array.isArray(row) ? row.slice(0, 120) : [];
        rows.push(sampled);
        for (const value of sampled) {
          if (cellsLeft-- <= 0) break;
          if (value !== null && value !== undefined && value !== "") text.push(String(value));
        }
        if (cellsLeft <= 0) break;
      }
      if (cellsLeft <= 0) break;
    }
    return { kind: "xlsx", text: normalize(text.join("\n")), rows, sheetNames };
  }

  async function inspectPdf(buffer) {
    const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const text = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 16); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text.push(content.items.map((item) => item.str || "").join(" "));
    }
    return { kind: "pdf", text: normalize(text.join("\n")), rows: [], sheetNames: [] };
  }

  function scoreInspection(inspection) {
    const result = {};
    for (const [role, rule] of Object.entries(ROLE_RULES)) {
      if (rule.pdfOnly && inspection.kind !== "pdf") {
        result[role] = 0;
        continue;
      }
      result[role] = rule.phrases.reduce((total, [phrase, weight]) => total + (inspection.text.includes(normalize(phrase)) ? weight : 0), 0)
        + structuralScore(role, inspection);
    }
    return result;
  }

  function structuralScore(role, inspection) {
    if (inspection.kind !== "xlsx") return 0;
    const rows = inspection.rows;
    if (role === "detail" && headerRow(rows, ["actual fuel date", "rec gallons", "actual gallons", "location compliant"]) >= 0) return 14;
    if (role === "summary" && headerRow(rows, ["zz recommendation", "zz compliance", "re opt count"]) >= 0) return 12;
    if (role === "drivers" && headerRow(rows, ["driver leader name", "driver code", "driver name"]) >= 0 && rows.some((row) => normalize(row?.[6]).includes("rolling 28 day dispatch miles"))) return 14;
    if (role === "trend" && rows.some((row) => normalize(row?.[0]).includes("line tooltip title")) && rows.some((row) => normalize(row?.[1]).includes("total noncompliant cost"))) return 12;
    if ((role === "reportDriverMetrics" || role === "driverMetricsDetail") && headerRow(rows, ["driver", "dispatch mpg", "idle"]) >= 0) return 12;
    if (role === "rolling7Day" && rollingSevenStructure(rows)) return 14;
    if (role === "driverDetails" && rollingHistoryStructure(rows)) return 14;
    if (role === "apu" && headerRow(rows, ["apu", "idle", "driver"]) >= 0) return 10;
    if (role === "ptaTracker" && headerRow(rows, ["truck", "driver", "pta", "status"]) >= 0) return 12;
    if (role === "ptaFinder" && headerRow(rows, ["truck", "driver", "pta", "preplan"]) >= 0) return 12;
    return 0;
  }

  function headerRow(rows, wanted) {
    for (let index = 0; index < Math.min(rows.length, 80); index += 1) {
      const cells = (rows[index] || []).map(normalize);
      const matches = wanted.filter((term) => cells.some((cell) => cell === normalize(term) || cell.includes(normalize(term)))).length;
      if (matches >= Math.min(3, wanted.length)) return index;
    }
    return -1;
  }

  function rollingSevenStructure(rows) {
    let matches = 0;
    for (const row of rows) {
      if (normalize(row?.[1]) === "idle" && dateLike(row?.[2]) && row.slice(8).some(percentLike) && ++matches >= 2) return true;
    }
    return false;
  }

  function rollingHistoryStructure(rows) {
    for (let index = 0; index < rows.length - 9; index += 1) {
      if (normalize(rows[index]?.[13]) === "cruise in time" && dateLike(rows[index]?.[2]) && (rows[index + 5] || []).slice(12).some(percentLike)) return true;
    }
    return false;
  }

  function dateLike(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
    if (typeof value === "number") return value > 20000 && value < 80000;
    return /\b(?:\d{1,2}[/-]){2}\d{2,4}\b/.test(String(value || ""));
  }

  function percentLike(value) {
    return typeof value === "number" ? value >= 0 && value <= 1.5 : /^-?\d+(?:\.\d+)?%$/.test(String(value || "").trim());
  }

  function normalize(value) {
    return String(value ?? "").toLowerCase().replace(/[%#]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function genericMime(name) {
    return /\.pdf$/i.test(name) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
})();
'''


AUXILIARY_MODE = r'''(() => {
  "use strict";

  const inspector = window.VixenDataInspector || window.VixenSmartDataLoader;
  if (!inspector?.classifyFiles) return;

  const ROLE_GROUPS = Object.freeze({
    legacy: ["summary", "drivers", "detail", "trend"],
    idle: ["summary", "detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],
    basic: ["reportDriverMetrics", "reportCompliance", "reportCost", "reportMpg"],
  });
  const aux = {
    active: false,
    routes: {},
    reason: "",
    observer: null,
    applyTimer: null,
    derivedDriverCount: 0,
  };
  window.VixenAuxiliaryMode = aux;

  const nativeClassify = inspector.classifyFiles.bind(inspector);
  inspector.classifyFiles = async (files) => augment(await nativeClassify(files));
  inspector.ready = Promise.resolve(inspector.ready).then(augment).catch((error) => {
    aux.active = true;
    aux.reason = `The report classifier could not complete: ${error?.message || error}`;
    scheduleApply();
    return { routes: {}, diagnostics: { errors: [aux.reason] } };
  });
  window.VixenSmartDataLoader = inspector;

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector(".main-panel") || document.body;
    if ("MutationObserver" in window && root) {
      aux.observer = new MutationObserver(scheduleApply);
      aux.observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    }
    [0, 250, 1000].forEach((delay) => window.setTimeout(scheduleApply, delay));
  });

  async function augment(result) {
    const normalized = result?.routes ? result : { routes: result || {}, diagnostics: {} };
    const routes = { ...normalized.routes };

    if (routes.summary && routes.detail && routes.driverDetails && routes.rolling7Day && !routes.driverMetricsDetail) {
      try {
        const derived = await buildDerivedDriverMetrics(routes.rolling7Day, routes.driverDetails);
        routes.driverMetricsDetail = derived.file;
        aux.derivedDriverCount = derived.driverCount;
      } catch (error) {
        console.warn("[Partial idle bridge]", error);
      }
    }

    const complete = hasCompleteMode(routes);
    aux.active = !complete;
    aux.reason = aux.active
      ? "The available reports do not form a complete fuel-analysis set. Recognized auxiliary tools remain usable."
      : aux.derivedDriverCount
        ? `Driver coverage was joined from available idle-history reports for ${aux.derivedDriverCount.toLocaleString("en-US")} drivers.`
        : "";

    if (aux.active) addNeutralAnalysisRoles(routes);
    aux.routes = routes;
    scheduleApply();
    return { ...normalized, routes };
  }

  function hasCompleteMode(routes) {
    return Object.values(ROLE_GROUPS).some((roles) => roles.every((role) => routes[role]));
  }

  function addNeutralAnalysisRoles(routes) {
    if (!routes.reportDriverMetrics) routes.reportDriverMetrics = virtualWorkbook([[]], "driver-metrics-placeholder");
    if (!routes.reportCompliance) {
      const row = Array(33).fill(null);
      row[0] = "2000-01-01";
      row[32] = 0;
      routes.reportCompliance = virtualWorkbook([row], "compliance-placeholder");
    }
    if (!routes.reportCost) {
      const row = Array(32).fill(null);
      row[0] = "Grand Total";
      row[21] = 0;
      row[25] = 0;
      row[31] = 0;
      routes.reportCost = virtualWorkbook([row], "cost-placeholder");
    }
    if (!routes.reportMpg) routes.reportMpg = virtualWorkbook([[], [], [], [], []], "mpg-placeholder");
  }

  function virtualWorkbook(rows, label) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Placeholder");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
    const file = new File([bytes], `${label}.xlsx`, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: 0,
    });
    file.vixenVirtual = true;
    return file;
  }

  async function buildDerivedDriverMetrics(rollingFile, historyFile) {
    const [rollingWorkbook, historyWorkbook] = await Promise.all([readWorkbook(rollingFile), readWorkbook(historyFile)]);
    const rolling = parseRollingIdle(rollingWorkbook);
    const history = parseDriverHistory(historyWorkbook);
    const drivers = new Map();

    for (const record of rolling) {
      drivers.set(normalizeIdentity(record.driverName), {
        driverName: record.driverName,
        driverCode: extractDriverCode(record.driverName),
        idle28: null,
      });
    }
    for (const record of history) {
      const key = normalizeIdentity(record.driverName);
      const current = drivers.get(key) || {
        driverName: record.driverName,
        driverCode: extractDriverCode(record.driverName),
        idle28: null,
      };
      current.idle28 = record.idlePct;
      drivers.set(key, current);
    }
    if (!drivers.size) throw new Error("No driver identities could be derived from the available idle-history reports.");

    const rows = [["Driver", "Driver Code", "Driver Leader", "Dispatch MPG", "Idle %", "OOR"]];
    for (const record of drivers.values()) rows.push([record.driverName, record.driverCode, "", null, record.idle28, null]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Derived Driver Index");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
    const file = new File([bytes], "derived-driver-index.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: Math.max(rollingFile.lastModified || 0, historyFile.lastModified || 0),
    });
    file.vixenDerived = true;
    return { file, driverCount: drivers.size };
  }

  async function readWorkbook(file) {
    return XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false, dense: false });
  }

  function workbookRows(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) : [];
  }

  function parseRollingIdle(workbook) {
    const rows = workbookRows(workbook);
    const records = [];
    let currentDriver = "";
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      if (text(row[0]) && !/^grand total$/i.test(text(row[0]))) currentDriver = text(row[0]);
      if (!currentDriver || normalizeHeader(row[1]) !== "idle") continue;
      const values = [];
      for (let cursor = index; cursor < rows.length; cursor += 1) {
        const item = rows[cursor] || [];
        if (cursor > index && text(item[1])) break;
        const date = parseDate(item[2]);
        const idlePct = item.slice(8).map(normalizePercent).find((value) => Number.isFinite(value));
        if (date && Number.isFinite(idlePct)) values.push({ date, idlePct });
      }
      values.sort((a, b) => a.date - b.date);
      if (values.length) records.push({ driverName: currentDriver, idlePct: values.at(-1).idlePct });
    }
    return records;
  }

  function parseDriverHistory(workbook) {
    const rows = workbookRows(workbook);
    const latest = new Map();
    let currentDriver = "";
    for (let index = 0; index < rows.length - 5; index += 1) {
      const row = rows[index] || [];
      if (text(row[1]) && !/^total$/i.test(text(row[1]))) currentDriver = text(row[1]);
      const date = parseDate(row[2]);
      if (!currentDriver || !date || normalizeHeader(row[13]) !== "cruise in time") continue;
      const idlePct = (rows[index + 5] || []).slice(12).map(normalizePercent).find((value) => Number.isFinite(value));
      if (!Number.isFinite(idlePct)) continue;
      const prior = latest.get(normalizeIdentity(currentDriver));
      if (!prior || date > prior.date) latest.set(normalizeIdentity(currentDriver), { driverName: currentDriver, date, idlePct });
    }
    return [...latest.values()];
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizePercent(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value > 1.5 ? value / 100 : value;
    const match = String(value ?? "").trim().match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return String(value).includes("%") || number > 1.5 ? number / 100 : number;
  }

  function extractDriverCode(value) {
    const match = String(value || "").toUpperCase().match(/\b(?:[A-Z]{5}\d|[A-Z]{5,6}|\d{5,6})\b/);
    return match?.[0] || "";
  }

  function normalizeIdentity(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeHeader(value) {
    return String(value || "").toLowerCase().replace(/[%#]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function scheduleApply() {
    window.clearTimeout(aux.applyTimer);
    aux.applyTimer = window.setTimeout(applyAuxiliaryUi, 25);
  }

  function applyAuxiliaryUi() {
    if (!document.body) return;
    let banner = document.getElementById("auxiliaryModeBanner");
    if (!aux.active) {
      banner?.remove();
      return;
    }

    const overlay = document.getElementById("connectOverlay");
    const error = document.getElementById("connectError");
    if (error && /complete.*report|analysis mode|source reports/i.test(error.textContent || "")) error.textContent = "";
    if (overlay && Object.keys(aux.routes).length) overlay.classList.add("hidden");

    if (!banner) {
      banner = document.createElement("div");
      banner.id = "auxiliaryModeBanner";
      banner.setAttribute("role", "status");
      document.querySelector(".topbar")?.insertAdjacentElement("afterend", banner);
    }
    if (banner) {
      const html = `<strong>PARTIAL DATA MODE</strong><span>${escapeHtml(aux.reason)} Fuel KPIs stay blank rather than manufacturing performance.</span>`;
      if (banner.innerHTML !== html) banner.innerHTML = html;
      banner.style.cssText = "margin:0 0 14px;padding:12px 16px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);color:var(--white);display:flex;gap:12px;align-items:center;flex-wrap:wrap";
    }
    setText("reportingWeek", "Partial data");
    ["kpiCompliance", "kpiWeeklyCost", "kpiModeledSavings", "kpiAnnualExposure", "kpiIdle7Day", "kpiIdle28Day", "heroSavings", "trendWeekTotal"].forEach((id) => setText(id, "--"));
    setText("kpiComplianceDelta", "No complete compliance data loaded");
    setText("kpiWeeklyCostDelta", "No complete cost data loaded");
    setText("kpiModeledSavingsNote", "Requires driver miles, gallons, and MPG data");
    setText("kpiAnnualNote", "Requires a complete fuel-performance period");
    setText("kpiIdle7DayNote", "Requires usable rolling idle data");
    setText("kpiIdle28DayNote", "Requires usable idle-history data");
    setText("heroInsight", "The dashboard opened with every report it could recognize by content. Available operational tools remain usable while unsupported fuel panels stay blank.");
    setText("trendWeekDelta", "No complete fuel trend");
    const driverButton = document.getElementById("heroDriverDetailsBtn");
    if (driverButton) driverButton.disabled = true;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
'''


VALIDATOR = r'''const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const ignored = new Set([".git", "vendor", "assets", "data", "dist"]);
const textExtensions = new Set([".js", ".mjs", ".html", ".txt", ".md", ".ps1", ".yml", ".yaml", ".json"]);
const explicitReportFilename = /(?:summary|detail|c1|driver[ _-]*(?:fuel[ _-]*)?metrics(?:[ _-]*detail)?|driver[ _-]*details|rolling[ _-]*7[ _-]*day|fuel[ _-]*compliance[ _-]*analysis|fuel[ _-]*noncompliant[ _-]*cost[ _-]*analysis|mpg[ _-]*by[ _-]*driver|pta[ _-]*dispatch[ _-]*tracker|fleet[ _-]*pta[ _-]*finder|electric[ _-]*apu)\.(?:xlsx|xlsm|xlsb|xls|pdf)/i;
const filenameRouter = /ALL_FILE_PATTERNS|EXPECTED_FILES|BASIC_REPORT_FILES|IDLE_REPORT_FILES|matchSourceKey|filenameFallback/i;
const problems = [];
const scripts = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      const relative = path.relative(root, full).replace(/\\/g, "/");
      const text = fs.readFileSync(full, "utf8");
      if (explicitReportFilename.test(text)) problems.push(`${relative}: explicit report filename`);
      if (filenameRouter.test(text)) problems.push(`${relative}: filename-routing construct`);
      if (/\.m?js$/i.test(entry.name)) scripts.push(full);
    }
  }
}

walk(root);
for (const script of scripts) {
  try {
    execFileSync(process.execPath, ["--check", script], { stdio: "pipe" });
  } catch (error) {
    problems.push(`${path.relative(root, script)}: JavaScript syntax check failed\n${error.stderr || error.message}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Validated ${scripts.length} JavaScript files. Report discovery is content-based and no explicit report filenames remain.`);
'''


README = '''VIXEN FUEL DASHBOARD\n====================\n\nFuel Dash reads supported XLSX and text-based PDF reports from the local data folder. Report roles are determined from worksheet headers, values, layout, and cross-field structure. The filename is ignored.\n\nSTART\n-----\n1. Put the current XLSX and PDF reports in the data folder.\n2. Run the included dashboard launcher.\n3. The browser opens the dashboard and classifies every supported report by content.\n\nThe folder may contain a complete fuel-analysis set, a partial set, or auxiliary operational reports. Complete data populates the related dashboards. Partial data remains available without inventing unavailable performance values.\n\nDATA RULES\n----------\n- XLSX and readable PDF reports are inspected regardless of filename.\n- A report can contribute to more than one role when its contents support those roles.\n- Strong structural matches load automatically. Unrecognized files are listed in diagnostics rather than forced into the wrong parser.\n- Driver codes are preserved as text.\n- Missing BOL records are recognized from their operational columns and trip-value patterns, then sorted oldest first.\n- Report data stays on the local computer.\n\nNOTES AND TRANSITIONS\n---------------------\nDriver and PTA notes are stored in the browser used to run the dashboard. Export transitions regularly if the notes matter after a browser reset or computer change.\n\nVALIDATION\n----------\nRun `node validate_dashboard.js` to check JavaScript syntax and confirm that explicit report-filename routing has not returned.\n'''


BETA_NOTES = '''# Fuel Dash Beta\n\nRelease: `v2026.07.26-beta.5`\n\n## Filename-independent report discovery\n\n- Every supported XLSX and text-based PDF in the local data folder is inspected.\n- Report roles are assigned from headers, values, worksheet structure, and cross-field patterns.\n- Folder selection, manual file selection, automatic local loading, partial-data handling, and auxiliary tools now use the same content classifier.\n- Explicit report-name aliases, filename regular expressions, fallback names, and fixed report-name instructions were removed.\n- The normal idle workflow can derive a driver index from compatible idle-history sources when a separate driver-index export is absent.\n- Missing BOL detection uses operational headers and trip-value patterns, not the workbook name.\n- A repository validator now rejects explicit report filenames and filename-routing constructs.\n\n## Beta warning\n\nThis is still a beta. New report layouts may need additional structural rules, but renaming a report should never be the fix.\n'''


def migrate_app() -> None:
    app = read("app.js")
    app = replace_once(
        app,
        r"  const EXPECTED_FILES = \{.*?  const ALL_FILE_PATTERNS = \{.*?\};\n",
        '''  const REPORT_ROLE_GROUPS = Object.freeze({\n    legacy: ["summary", "drivers", "detail", "trend"],\n    idle: ["summary", "detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],\n    basic: ["reportDriverMetrics", "reportCompliance", "reportCost", "reportMpg"],\n  });\n  const SUPPORTED_REPORT_FILE = /\\.(?:xlsx|xlsm|xlsb|xls|pdf)$/i;\n''',
        "top-level report filename patterns",
        re.S,
    )
    app = replace_once(
        app,
        r"      const legacyReady = Object\.keys\(EXPECTED_FILES\).*?throw new Error\(\"Choose the five idle-report XLSX files, the legacy workbook set, or all four basic reports\.\"\);\n      \}",
        '''      const legacyReady = reportModeReady(files, "legacy", { drivers: ["driverPdf"] });\n      const idleReady = reportModeReady(files, "idle");\n      const basicReady = reportModeReady(files, "basic");\n      if (!legacyReady && !idleReady && !basicReady) {\n        throw new Error("The available reports were inspected by content, but they do not yet provide a complete fuel-analysis mode.");\n      }''',
        "refresh readiness gate",
        re.S,
    )
    app = app.replace("          : analyzeBasicReports(workbooks, files);", "          : analyzeBasicReports(workbooks, files);")
    app = replace_once(
        app,
        r"\n  async function attemptSameFolderFiles\(\) \{.*?\n  async function collectSourceFiles\(\) \{",
        r'''
  async function attemptSameFolderFiles() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return false;
    let response;
    try {
      response = await fetch("data-manifest.json", { cache: "no-store" });
    } catch (_) {
      return false;
    }
    if (!response.ok) return false;
    const manifest = await response.json();
    const sourceFiles = [];
    for (const item of Array.isArray(manifest) ? manifest : []) {
      if (!SUPPORTED_REPORT_FILE.test(item?.name || "") || !item?.path) continue;
      try {
        const fileResponse = await fetch(encodeURI(item.path), { cache: "no-store" });
        if (!fileResponse.ok) continue;
        const blob = await fileResponse.blob();
        sourceFiles.push(new File([blob], item.name, {
          type: blob.type || (/\.pdf$/i.test(item.name) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
          lastModified: Date.parse(item.lastModified) || 0,
        }));
      } catch (_) {}
    }
    if (!sourceFiles.length) return false;
    const found = await classifyReportFiles(sourceFiles);
    if (!Object.keys(found).length) return false;
    state.staticFiles = found;
    state.directoryHandle = null;
    state.fallbackFiles = null;
    return true;
  }

  async function collectSourceFiles() {''',
        "same-folder filename probes",
        re.S,
    )
    app = replace_once(
        app,
        r"  async function collectSourceFiles\(\) \{.*?\n  function sourceLabel\(key\) \{",
        r'''  async function collectSourceFiles() {
    if (state.staticFiles) {
      const refreshed = await attemptSameFolderFiles();
      if (!refreshed) throw new Error("The local data folder could not be refreshed.");
      return { ...state.staticFiles };
    }

    const candidates = [];
    if (state.directoryHandle) {
      const permission = await verifyPermission(state.directoryHandle, false);
      if (!permission) throw new Error("Folder permission expired. Choose the data folder again.");
      for await (const [, handle] of state.directoryHandle.entries()) {
        if (handle.kind !== "file") continue;
        const file = await handle.getFile();
        if (SUPPORTED_REPORT_FILE.test(file.name || "")) candidates.push(file);
      }
    } else if (state.fallbackFiles) {
      candidates.push(...state.fallbackFiles.filter((file) => SUPPORTED_REPORT_FILE.test(file.name || "")));
    } else {
      throw new Error("Choose a folder or select XLSX/PDF reports to inspect.");
    }
    if (!candidates.length) throw new Error("No supported XLSX or PDF reports were found.");
    return classifyReportFiles(candidates);
  }

  async function classifyReportFiles(files) {
    const inspector = window.VixenDataInspector || window.VixenSmartDataLoader;
    if (!inspector?.classifyFiles) throw new Error("The content-based report inspector is unavailable.");
    const result = await inspector.classifyFiles(files);
    return { ...(result?.routes || result || {}) };
  }

  function reportModeReady(files, mode, alternatives = {}) {
    return (REPORT_ROLE_GROUPS[mode] || []).every((role) => files[role] || (alternatives[role] || []).some((alternate) => files[alternate]));
  }

  function sourceLabel(key) {''',
        "folder/manual filename matching",
        re.S,
    )
    app = replace_once(
        app,
        r"  function sourceLabel\(key\) \{.*?\n  function isIdleFocusedMode",
        '''  function sourceLabel(key) {\n    return ({\n      summary: "weekly summary data",\n      drivers: "driver performance data",\n      detail: "transaction detail data",\n      trend: "historical cost trend data",\n      apu: "optional APU operating data",\n      ptaTracker: "optional PTA dispatch data",\n      ptaFinder: "optional PTA planning data",\n      driverPdf: "optional driver-level PDF data",\n      reportDriverMetrics: "driver metrics data",\n      reportCompliance: "compliance history data",\n      reportCost: "noncompliant cost data",\n      reportMpg: "driver MPG history data",\n      driverMetricsDetail: "driver metrics detail data",\n      driverDetails: "driver operating history data",\n      rolling7Day: "rolling idle history data",\n    })[key] || key;\n  }\n\n  function isIdleFocusedMode''',
        "source filename labels",
        re.S,
    )

    replacements = {
        "No dated compliance values were found in the Fuel Compliance Analysis report.": "No dated compliance values were found in the recognized compliance report.",
        "Driver Fuel Metrics did not contain a recognizable driver table.": "The recognized driver-metrics report did not contain a usable driver table.",
        "The Driver Fuel Metrics PDF opened, but no driver rows were recognized.": "The recognized driver PDF opened, but no driver rows were recognized.",
        "rolling 7 day.xlsx did not contain recognizable driver idle history.": "The recognized rolling-idle report did not contain usable driver idle history.",
        "Five-file idle mode": "Joined idle-report mode",
        "Replace the same five XLSX exports each reporting week.": "Refresh the source reports for each reporting period.",
        "The four summary reports do not include transaction-level fueling events.": "The available summary reports do not include transaction-level fueling events.",
        "Use the legacy Detail workbook when unit and fueling-event drilldown is needed.": "Add transaction-detail data when unit and fueling-event drilldown is needed.",
    }
    for old, new in replacements.items():
        app = app.replace(old, new)

    forbidden_symbols = ["EXPECTED_FILES", "BASIC_REPORT_FILES", "IDLE_REPORT_FILES", "OPTIONAL_FILES", "ALL_FILE_PATTERNS", "matchSourceKey"]
    leftovers = [symbol for symbol in forbidden_symbols if symbol in app]
    if leftovers:
        raise RuntimeError(f"app.js still contains filename routers: {leftovers}")
    write("app.js", app)


def migrate_index() -> None:
    index = read("index.html")
    index = replace_once(
        index,
        r"      <p>\s*For the idle dashboard,.*?XLSX and XLSM are accepted; the older basic set also accepts matching text-based PDFs\.\s*</p>",
        '''      <p>\n        Choose a local folder or select reports manually. Every supported XLSX and text-based PDF is inspected by its headers, values, and worksheet structure. Filenames are ignored. Complete report sets populate the full dashboard; partial and auxiliary reports remain available without manufacturing missing metrics.\n      </p>''',
        "connect instructions",
        re.S,
    )
    write("index.html", index)


def migrate_missing_bol() -> None:
    content = read("missing_bol.js")
    content = re.sub(r"\s*\+ \(normalize\(item\.name\)\.includes\(\"last refresh\"\) \? 2 : 0\)", "", content)
    content = content.replace("The report filename is ignored; the live export is recognized from its operational columns.", "The live export is recognized from its operational columns and trip-value patterns.")
    write("missing_bol.js", content)


def migrate_support_files() -> None:
    write("smart_data_loader.js", SMART_LOADER)
    write("auxiliary_mode.js", AUXILIARY_MODE)
    write("validate_dashboard.js", VALIDATOR)
    write("README - Vixen Fuel Dashboard.txt", README)
    write("BETA_RELEASE_NOTES.md", BETA_NOTES)
    write("BETA_BUILD_NOTES.md", "Beta 5 removes report-filename dependencies and uses content-based discovery for all data-loading paths.\n")
    write("BETA_BUILD.txt", "Fuel Dash Beta\nVersion: v2026.07.26-beta.5\nSource: testing\nReport discovery: content-based; filenames ignored\n")
    write("BETA_SUPERSEDES.txt", "Betas 1 through 4 are superseded by v2026.07.26-beta.5.\n")
    write("BETA_VERSION", "v2026.07.26-beta.5\n")
    write("data/PLACE_REPORTS_HERE.txt", "Place supported XLSX and text-based PDF reports in this folder. Every file is inspected by content; filenames are ignored.\n")
    write("data/PARSER_NOTE.txt", "Report roles are assigned from headers, values, worksheet layout, and cross-field structure. Do not rename reports to make them load.\n")
    write("tests/README.md", "Run `node validate_dashboard.js`, `node tests/auxiliary_mode_smoke.js`, and `node tests/live_bol_export_smoke.js`. Tests enforce content-based report discovery and the live Missing BOL column contract.\n")
    write("tests/auxiliary_mode_smoke.js", r'''const fs = require("fs");
const assert = require("assert");

const app = fs.readFileSync("app.js", "utf8");
const inspector = fs.readFileSync("smart_data_loader.js", "utf8");
const auxiliary = fs.readFileSync("auxiliary_mode.js", "utf8");

assert.match(app, /classifyReportFiles\(candidates\)/, "folder/manual loading must use the content classifier");
assert.doesNotMatch(app, /ALL_FILE_PATTERNS|matchSourceKey|EXPECTED_FILES/, "legacy filename router must be absent");
assert.match(inspector, /async function classifyFiles/, "shared classifier must expose file classification");
assert.match(inspector, /structuralScore/, "classification must use worksheet structure");
assert.match(auxiliary, /buildDerivedDriverMetrics/, "partial idle joins must be role based");
assert.doesNotMatch(auxiliary, /filenameFallback|applyFilenameFallbacks/, "filename fallbacks must be absent");
console.log("Content discovery smoke test passed.");
''')
    live_test = read("tests/live_bol_export_smoke.js")
    live_test = live_test.replace("Last Refresh.xlsx", "arbitrary-report-name.xlsx")
    write("tests/live_bol_export_smoke.js", live_test)


def final_scan() -> None:
    explicit = re.compile(r"(?:summary|detail|c1|driver[ _-]*(?:fuel[ _-]*)?metrics(?:[ _-]*detail)?|driver[ _-]*details|rolling[ _-]*7[ _-]*day|fuel[ _-]*compliance[ _-]*analysis|fuel[ _-]*noncompliant[ _-]*cost[ _-]*analysis|mpg[ _-]*by[ _-]*driver|pta[ _-]*dispatch[ _-]*tracker|fleet[ _-]*pta[ _-]*finder|electric[ _-]*apu)\.(?:xlsx|xlsm|xlsb|xls|pdf)", re.I)
    router = re.compile(r"ALL_FILE_PATTERNS|EXPECTED_FILES|BASIC_REPORT_FILES|IDLE_REPORT_FILES|matchSourceKey|filenameFallback", re.I)
    ignored = {".git", "vendor", "assets", "data", "dist"}
    problems = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in ignored for part in path.parts):
            continue
        if path.suffix.lower() not in {".js", ".mjs", ".html", ".txt", ".md", ".ps1", ".yml", ".yaml", ".json"}:
            continue
        if path == pathlib.Path(__file__).resolve():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if explicit.search(text): problems.append(f"{path.relative_to(ROOT)}: explicit report filename")
        if router.search(text): problems.append(f"{path.relative_to(ROOT)}: filename router")
    if problems:
        raise RuntimeError("\n".join(problems))


migrate_app()
migrate_index()
migrate_missing_bol()
migrate_support_files()
final_scan()
pathlib.Path(__file__).unlink()
print("Repository-wide content discovery migration complete.")
