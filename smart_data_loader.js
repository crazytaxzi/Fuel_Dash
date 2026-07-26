(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  const diagnostics = { files: [], routes: {}, unclassified: [], errors: [] };
  const aliases = new Map();
  const addAliases = (key, names) => names.forEach((name) => aliases.set(name.toLowerCase(), key));

  addAliases("summary", ["data/summary.xlsx", "summary.xlsx", "summary.xlsm", "summary.xlsb", "summary.xls"]);
  addAliases("drivers", ["c1.xlsx", "c1.xlsm", "c1.xlsb", "c1.xls"]);
  addAliases("detail", ["data/detail.xlsx", "detail.xlsx", "detail.xlsm", "detail.xls"]);
  addAliases("trend", ["summary chart.xlsx", "summary chart.xlsm", "summary_chart.xlsx", "summary_chart.xlsm"]);
  addAliases("apu", ["apu.xlsx", "apu.xlsm", "electric apu.xlsx", "electric apu.xlsm", "electric_apu.xlsx", "electric_apu.xlsm"]);
  addAliases("ptaTracker", ["pta_dispatch_tracker_updated_fixed.xlsx", "pta dispatch tracker.xlsx", "pta_dispatch_tracker.xlsx", "pta dispatch tracker.xlsm"]);
  addAliases("ptaFinder", ["fleet_pta_finder.xlsx", "fleet pta finder.xlsx", "fleet_pta_finder.xlsm", "fleet pta finder.xlsm"]);
  addAliases("driverPdf", ["driver fuel report.pdf", "fuel driver report.pdf", "driver report.pdf", "fuel report.pdf"]);
  addAliases("reportDriverMetrics", ["data/driver fuel metrics.xlsx", "data/driver fuel metrics.pdf", "driver fuel metrics.xlsx", "driver fuel metrics.pdf"]);
  addAliases("reportCompliance", ["data/fuel compliance analysis.xlsx", "data/fuel compliance analysis.pdf", "fuel compliance analysis.xlsx", "fuel compliance analysis.pdf"]);
  addAliases("reportCost", ["data/fuel noncompliant cost analysis.xlsx", "data/fuel noncompliant cost analysis.pdf", "fuel noncompliant cost analysis.xlsx", "fuel noncompliant cost analysis.pdf"]);
  addAliases("reportMpg", ["data/mpg by driver.xlsx", "data/mpg by driver.pdf", "mpg by driver.xlsx", "mpg by driver.pdf"]);
  addAliases("driverMetricsDetail", ["data/driver metrics detail.xlsx", "driver metrics detail.xlsx"]);
  addAliases("driverDetails", ["data/driver details.xlsx", "driver details.xlsx"]);
  addAliases("rolling7Day", ["data/rolling 7 day.xlsx", "rolling 7 day.xlsx"]);

  const rules = {
    summary: [12, [["zz recommendation", 8], ["zz compliance", 8], ["re opt count", 4], ["primary rec compliance", 4]]],
    drivers: [14, [["driver leader name", 8], ["fleet manager match", 6], ["rolling 28 day dispatch miles", 8], ["rolling 4 week dispatch mpg", 8]]],
    detail: [14, [["actual fuel date", 7], ["rec gallons", 6], ["actual gallons", 6], ["location compliant", 6], ["purchase type", 4]]],
    trend: [14, [["date axis", 8], ["gallon over under cost", 7], ["location noncompliant cost", 7], ["total noncompliant cost", 7]]],
    reportDriverMetrics: [12, [["driver fuel metrics", 10], ["dispatch mpg", 6], ["idle", 3], ["oor", 4], ["driver current position code", 5]]],
    driverMetricsDetail: [12, [["driver metrics detail", 10], ["driver fuel metrics", 8], ["dispatch mpg", 6], ["idle", 3], ["oor", 4]]],
    reportCompliance: [11, [["fuel compliance analysis", 10], ["compliance", 4], ["date range", 3], ["last refreshed", 2], ["recommendation", 2]]],
    reportCost: [12, [["fuel noncompliant cost analysis", 10], ["gallon over under cost", 6], ["location noncompliant cost", 6], ["total noncompliant cost", 6]]],
    reportMpg: [11, [["mpg by driver", 10], ["dispatch mpg", 5], ["driver code", 4], ["driver name", 3], ["mpg", 2]]],
    rolling7Day: [12, [["rolling 7 day", 10], ["idle", 3], ["driver", 2]]],
    driverDetails: [12, [["driver details", 8], ["cruise in time", 10], ["moving mpg", 4], ["idle", 3]]],
    apu: [11, [["electric apu", 8], ["apu hours", 5], ["engine idle hours", 5], ["battery soc", 5], ["state of charge", 4], ["faults", 3]]],
    ptaTracker: [11, [["projected time available", 8], ["pta", 4], ["truck", 3], ["driver", 3], ["status", 2], ["plans", 3]]],
    ptaFinder: [12, [["pta", 4], ["preplan", 6], ["available", 4], ["dispatched", 4], ["flag", 3], ["truck", 2], ["driver", 2]]],
    driverPdf: [11, [["driver", 3], ["dispatch mpg", 5], ["idle", 3], ["fuel cost", 4], ["unit", 2]], true]
  };

  const routesPromise = buildRoutes();
  window.VixenSmartDataLoader = { ready: routesPromise, diagnostics };

  window.fetch = async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input?.url;
    const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
    const key = requestUrl && method === "GET" ? aliasKey(requestUrl) : null;
    if (!key) return nativeFetch(input, init);
    try {
      const route = (await routesPromise)[key];
      if (route?.path) return nativeFetch(encodeURI(route.path), { ...init, cache: "no-store" });
    } catch (error) {
      diagnostics.errors.push(`Routing failed for ${key}: ${error.message || error}`);
    }
    return nativeFetch(input, init);
  };

  async function buildRoutes() {
    const response = await nativeFetch("data-manifest.json", { cache: "no-store" });
    if (!response.ok) return {};
    const manifest = await response.json();
    const files = (Array.isArray(manifest) ? manifest : []).filter((item) => /\.(xlsx|pdf)$/i.test(item?.name || ""));
    const inspected = [];

    for (const item of files) {
      try {
        const inspection = await inspect(item);
        const scores = score(inspection);
        inspected.push({ item, inspection, scores });
        diagnostics.files.push({ name: item.name, kind: inspection.kind, sheets: inspection.sheetNames, scores });
      } catch (error) {
        diagnostics.errors.push(`${item.name}: ${error.message || error}`);
      }
    }

    const routes = {};
    for (const [key, [threshold]] of Object.entries(rules)) {
      const candidates = inspected
        .map((entry) => ({ ...entry, value: entry.scores[key] || 0 }))
        .filter((entry) => entry.value >= threshold)
        .sort((a, b) => b.value - a.value || newestFirst(a.item, b.item));
      if (candidates.length) {
        routes[key] = candidates[0].item;
        diagnostics.routes[key] = { name: candidates[0].item.name, score: candidates[0].value };
      }
    }

    if (!routes.driverMetricsDetail && routes.reportDriverMetrics) routes.driverMetricsDetail = routes.reportDriverMetrics;
    if (!routes.reportDriverMetrics && routes.driverMetricsDetail) routes.reportDriverMetrics = routes.driverMetricsDetail;
    if (!routes.driverPdf && routes.reportDriverMetrics && /\.pdf$/i.test(routes.reportDriverMetrics.name)) routes.driverPdf = routes.reportDriverMetrics;

    const used = new Set(Object.values(routes).map((item) => item.path));
    diagnostics.unclassified = files.filter((item) => !used.has(item.path)).map((item) => item.name);
    console.info("[Vixen Data Inspector] content-based routes", diagnostics.routes);
    if (diagnostics.unclassified.length) console.warn("[Vixen Data Inspector] unclassified files", diagnostics.unclassified);
    if (diagnostics.errors.length) console.warn("[Vixen Data Inspector] inspection errors", diagnostics.errors);
    return routes;
  }

  async function inspect(item) {
    const response = await nativeFetch(encodeURI(item.path), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return /\.pdf$/i.test(item.name) ? inspectPdf(buffer) : inspectWorkbook(buffer);
  }

  function inspectWorkbook(buffer) {
    if (!window.XLSX) throw new Error("SheetJS was not loaded before the data inspector.");
    const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false });
    const sheetNames = workbook.SheetNames.slice();
    const rows = [];
    const text = [...sheetNames];
    let cellsLeft = 12000;
    for (const name of sheetNames.slice(0, 8)) {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "", blankrows: true }).slice(0, 140);
      for (const row of sheetRows) {
        const sampled = Array.isArray(row) ? row.slice(0, 80) : [];
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
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 12); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text.push(content.items.map((item) => item.str || "").join(" "));
    }
    return { kind: "pdf", text: normalize(text.join("\n")), rows: [], sheetNames: [] };
  }

  function score(inspection) {
    const result = {};
    for (const [key, [, phrases, pdfOnly]] of Object.entries(rules)) {
      if (pdfOnly && inspection.kind !== "pdf") {
        result[key] = 0;
        continue;
      }
      result[key] = phrases.reduce((total, [phrase, weight]) => total + (inspection.text.includes(normalize(phrase)) ? weight : 0), 0) + structural(key, inspection);
    }
    return result;
  }

  function structural(key, inspection) {
    if (inspection.kind !== "xlsx") return 0;
    const rows = inspection.rows;
    if (key === "detail" && headerRow(rows, ["actual fuel date", "rec gallons", "actual gallons", "location compliant"]) >= 0) return 14;
    if (key === "summary" && headerRow(rows, ["zz recommendation", "zz compliance", "re opt count"]) >= 0) return 12;
    if (key === "drivers" && headerRow(rows, ["driver leader name", "driver code", "driver name"]) >= 0 && rows.some((row) => normalize(row?.[6]).includes("rolling 28 day dispatch miles"))) return 14;
    if (key === "trend" && rows.some((row) => normalize(row?.[0]).includes("line tooltip title")) && rows.some((row) => normalize(row?.[1]).includes("total noncompliant cost"))) return 12;
    if ((key === "reportDriverMetrics" || key === "driverMetricsDetail") && headerRow(rows, ["driver", "dispatch mpg", "idle"]) >= 0) return 12;
    if (key === "rolling7Day" && rolling7(rows)) return 14;
    if (key === "driverDetails" && rolling28(rows)) return 14;
    if (key === "apu" && headerRow(rows, ["apu", "idle", "driver"]) >= 0) return 10;
    if (key === "ptaTracker" && headerRow(rows, ["truck", "driver", "pta", "status"]) >= 0) return 12;
    if (key === "ptaFinder" && headerRow(rows, ["truck", "driver", "pta", "preplan"]) >= 0) return 12;
    return 0;
  }

  function headerRow(rows, wanted) {
    for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
      const cells = (rows[i] || []).map(normalize);
      const matches = wanted.filter((term) => cells.some((cell) => cell === normalize(term) || cell.includes(normalize(term)))).length;
      if (matches >= Math.min(3, wanted.length)) return i;
    }
    return -1;
  }

  function rolling7(rows) {
    let matches = 0;
    for (const row of rows) {
      if (normalize(row?.[1]) === "idle" && dateLike(row?.[2]) && row.slice(10).some(percentLike) && ++matches >= 2) return true;
    }
    return false;
  }

  function rolling28(rows) {
    for (let i = 0; i < rows.length - 9; i += 1) {
      if (normalize(rows[i]?.[13]) === "cruise in time" && dateLike(rows[i]?.[2]) && (rows[i + 5] || []).slice(14).some(percentLike)) return true;
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
    return String(value ?? "").toLowerCase().replace(/[%#]/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function aliasKey(requestUrl) {
    try {
      const url = new URL(requestUrl, location.href);
      if (url.origin !== location.origin) return null;
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, "").toLowerCase();
      return aliases.get(path) || aliases.get(path.split("/").at(-1)) || null;
    } catch (_) {
      return null;
    }
  }

  function newestFirst(a, b) {
    return (Date.parse(b.lastModified || "") || 0) - (Date.parse(a.lastModified || "") || 0);
  }
})();
