(() => {
  "use strict";

  const SUPPORTED_REPORT = /\.(?:xlsx|xlsm|xlsb|xls|pdf)$/i;
  const diagnostics = { files: [], routes: {}, unclassified: [], errors: [] };
  const inspectionCache = new Map();
  const ROLE_RULES = Object.freeze({
    summary: { threshold: 12, phrases: [["zz recommendation", 8], ["zz compliance", 8], ["re opt count", 4], ["primary rec compliance", 4]] },
    drivers: { threshold: 14, phrases: [["driver leader name", 8], ["fleet manager match", 6], ["rolling 28 day dispatch miles", 8], ["rolling 4 week dispatch mpg", 8]] },
    detail: { threshold: 14, phrases: [["actual fuel date", 7], ["rec gallons", 6], ["actual gallons", 6], ["location compliant", 6], ["purchase type", 4]] },
    trend: { threshold: 14, xlsxThreshold: 24, phrases: [["date axis", 8], ["gallon over under cost", 7], ["location noncompliant cost", 7], ["total noncompliant cost", 7]] },
    reportDriverMetrics: { threshold: 12, xlsxThreshold: 20, phrases: [["driver fuel metrics", 10], ["dispatch mpg", 6], ["idle", 3], ["oor", 4], ["driver current position code", 5]] },
    driverMetricsDetail: { threshold: 12, xlsxThreshold: 20, phrases: [["driver metrics detail", 10], ["driver fuel metrics", 8], ["dispatch mpg", 6], ["idle", 3], ["oor", 4]] },
    reportCompliance: { threshold: 11, phrases: [["fuel compliance analysis", 10], ["compliance", 4], ["date range", 3], ["last refreshed", 2], ["recommendation", 2]] },
    reportCost: { threshold: 12, phrases: [["fuel noncompliant cost analysis", 10], ["gallon over under cost", 6], ["location noncompliant cost", 6], ["total noncompliant cost", 6]] },
    reportMpg: { threshold: 11, xlsxThreshold: 16, phrases: [["mpg by driver", 10], ["dispatch mpg", 5], ["driver code", 4], ["driver name", 3], ["mpg", 2]] },
    rolling7Day: { threshold: 12, phrases: [["rolling 7 day", 10], ["idle", 3], ["driver", 2]] },
    driverDetails: { threshold: 12, phrases: [["driver details", 8], ["cruise in time", 10], ["moving mpg", 4], ["idle", 3]] },
    apu: { threshold: 11, phrases: [["electric apu", 8], ["apu hours", 5], ["engine idle hours", 5], ["battery soc", 5], ["state of charge", 4], ["faults", 3]] },
    ptaTracker: { threshold: 11, phrases: [["projected time available", 8], ["pta", 4], ["truck", 3], ["driver", 3], ["status", 2], ["plans", 3]] },
    ptaFinder: { threshold: 12, phrases: [["pta", 4], ["preplan", 6], ["available", 4], ["dispatched", 4], ["flag", 3], ["truck", 2], ["driver", 2]] },
    driverPdf: { threshold: 11, pdfOnly: true, phrases: [["driver", 3], ["dispatch mpg", 5], ["idle", 3], ["fuel cost", 4], ["unit", 2]] },
  });

  const inspector = {
    diagnostics,
    ready: Promise.resolve({ routes: {}, diagnostics }),
    classifyFiles,
    inspectFile,
    test: { scoreInspection, structuralScore, roleThreshold, roleQualifies, selectRoleCandidate, isApuFileName, normalize },
    supported: (file) => Boolean(file && SUPPORTED_REPORT.test(file.name || "")),
    clearCache: () => inspectionCache.clear(),
  };

  window.VixenDataInspector = inspector;
  window.VixenSmartDataLoader = inspector;

  async function classifyFiles(inputFiles) {
    const files = dedupeFiles(Array.from(inputFiles || []).filter((file) => inspector.supported(file)));
    const run = { files: [], routes: {}, unclassified: [], errors: [] };
    const inspectionResults = await Promise.all(files.map(async (file) => {
      try {
        const inspection = await inspectFile(file);
        const scores = scoreInspection(inspection);
        return { file, inspection, scores };
      } catch (error) {
        run.errors.push(`${file.name}: ${error?.message || error}`);
        return null;
      }
    }));
    const inspected = inspectionResults.filter(Boolean);
    inspected.forEach(({ file, inspection, scores }) => {
      run.files.push({ name: file.name, kind: inspection.kind, sheets: inspection.sheetNames, scores });
    });

    for (const [role, rule] of Object.entries(ROLE_RULES)) {
      const winner = selectRoleCandidate(role, rule, inspected);
      if (!winner) continue;
      winner.file.vixenRole = role;
      winner.file.vixenConfidence = winner.value;
      winner.file.vixenInspection = winner.inspection;
      run.routes[role] = winner.file;
    }

    if (!run.routes.driverMetricsDetail && run.routes.reportDriverMetrics && !/\.pdf$/i.test(run.routes.reportDriverMetrics.name)) {
      run.routes.driverMetricsDetail = run.routes.reportDriverMetrics;
    }
    if (!run.routes.reportDriverMetrics && run.routes.driverMetricsDetail) run.routes.reportDriverMetrics = run.routes.driverMetricsDetail;
    if (!run.routes.driverPdf && run.routes.reportDriverMetrics && /\.pdf$/i.test(run.routes.reportDriverMetrics.name)) {
      run.routes.driverPdf = run.routes.reportDriverMetrics;
    }

    const used = new Set(Object.values(run.routes));
    run.unclassified = files.filter((file) => !used.has(file)).map((file) => file.name);
    Object.assign(diagnostics, run);
    const result = { routes: run.routes, diagnostics: run };
    inspector.ready = Promise.resolve(result);
    document.dispatchEvent(new CustomEvent("vixen:data-classified", { detail: { ...result, files } }));
    return result;
  }

  function selectRoleCandidate(role, rule, inspected) {
    return inspected
      .map((entry) => {
        const apuNamed = isApuFileName(entry.file?.name);
        if (apuNamed && role !== "apu") return null;
        const roleScore = entry.scores[role] || 0;
        const driverDetailsScore = entry.scores.driverDetails || 0;
        const qualifies = roleScore >= roleThreshold(rule, entry.inspection.kind)
          || (role === "apu" && apuNamed && driverDetailsScore >= roleThreshold(ROLE_RULES.driverDetails, entry.inspection.kind));
        if (!qualifies) return null;
        return { ...entry, value: roleScore, apuNamed };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.apuNamed) - Number(a.apuNamed)
        || b.value - a.value
        || (b.file.lastModified || 0) - (a.file.lastModified || 0))[0] || null;
  }

  function isApuFileName(name) {
    return /apu/i.test(String(name || ""));
  }

  async function inspectFile(file) {
    const signature = fileSignature(file);
    if (inspectionCache.has(signature)) {
      const cached = inspectionCache.get(signature);
      if (cached.workbook) {
        file.vixenWorkbook = cached.workbook;
        window.VixenResourceCoordinator?.rememberWorkbook?.(file, cached.workbook);
      }
      file.vixenInspection = cached.inspection;
      return cached.inspection;
    }

    let workbook = null;
    const inspection = /\.pdf$/i.test(file.name)
      ? await inspectPdf(await file.arrayBuffer())
      : inspectWorkbook(workbook = await readWorkbook(file));

    file.vixenInspection = inspection;
    if (workbook) file.vixenWorkbook = workbook;
    inspectionCache.set(signature, { inspection, workbook });
    trimCache(inspectionCache, 48);
    return inspection;
  }

  async function readWorkbook(file) {
    if (window.VixenResourceCoordinator?.readWorkbook) {
      return window.VixenResourceCoordinator.readWorkbook(file, { cellText: false, cellNF: false });
    }
    return XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false });
  }

  function inspectWorkbook(workbook) {
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

  function roleThreshold(rule, kind) {
    return rule?.[`${kind}Threshold`] ?? rule?.threshold ?? Number.POSITIVE_INFINITY;
  }

  function roleQualifies(role, inspection) {
    const rule = ROLE_RULES[role];
    return Boolean(rule) && (scoreInspection(inspection)[role] || 0) >= roleThreshold(rule, inspection.kind);
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
    if (role === "apu" && (headerRow(rows, ["apu", "idle", "driver"]) >= 0 || (rollingHistoryStructure(rows) && rows.some((row) => row.some((cell) => /\b(?:electric\s+)?apu\b/.test(normalize(cell))))))) return 12;
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

  function fileSignature(file) {
    return `${file.name}|${file.size}|${file.lastModified || 0}`;
  }

  function dedupeFiles(files) {
    const seen = new Set();
    return files.filter((file) => {
      const signature = fileSignature(file);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function trimCache(map, limit) {
    while (map.size > limit) map.delete(map.keys().next().value);
  }
})();
