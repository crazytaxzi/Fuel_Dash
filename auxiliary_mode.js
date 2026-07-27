(() => {
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
