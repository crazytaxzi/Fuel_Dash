(() => {
  "use strict";

  const smart = window.VixenSmartDataLoader;
  if (!smart?.ready) return;

  const routedFetch = window.fetch.bind(window);
  const virtualReports = new Map();
  const CORE_GROUPS = {
    legacy: ["summary", "drivers", "detail", "trend"],
    idle: ["summary", "detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],
    basic: ["reportDriverMetrics", "reportCompliance", "reportCost", "reportMpg"],
  };
  const aux = {
    active: false,
    routes: {},
    reason: "",
    virtualRequests: new Set(),
    observer: null,
    applyTimer: null,
  };
  const bridge = {
    active: false,
    buffer: null,
    driverCount: 0,
    reason: "",
    ready: null,
  };

  window.VixenAuxiliaryMode = aux;
  window.VixenPartialIdleBridge = bridge;

  const originalReady = smart.ready;
  bridge.ready = Promise.resolve(originalReady).then(async (routes) => {
    const resolved = routes || {};
    await applyFilenameFallbacks(resolved);

    const canDerive = resolved.summary && resolved.detail && resolved.driverDetails && resolved.rolling7Day && !resolved.driverMetricsDetail;
    if (canDerive) {
      const derived = await buildDerivedDriverMetrics(resolved.rolling7Day, resolved.driverDetails);
      bridge.buffer = derived.buffer;
      bridge.driverCount = derived.driverCount;
      bridge.active = true;
      bridge.reason = `Derived a driver index for ${derived.driverCount} drivers from rolling 7 day and Driver Details because driver metrics detail was not supplied.`;
      resolved.driverMetricsDetail = {
        name: "Derived Driver Metrics.xlsx",
        virtual: true,
        source: "rolling 7 day.xlsx + Driver Details.xlsx",
      };
      if (smart.diagnostics?.routes) {
        smart.diagnostics.routes.driverMetricsDetail = {
          name: "Derived Driver Metrics.xlsx",
          score: 100,
          derived: true,
        };
      }
    }

    aux.routes = resolved;
    const completeGroup = Object.values(CORE_GROUPS).some((keys) => keys.every((key) => resolved[key]));
    aux.active = !completeGroup;
    aux.reason = aux.active
      ? "No complete fuel-report set was found. Available auxiliary and partial reports remain usable."
      : "";
    scheduleApply();
    return resolved;
  }).catch((error) => {
    bridge.reason = error?.message || String(error);
    aux.active = true;
    aux.reason = `The report classifier could not complete: ${error?.message || error}`;
    console.warn("[Partial Idle Bridge]", error);
    scheduleApply();
    return {};
  });

  smart.ready = bridge.ready;

  window.fetch = async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input?.url;
    const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
    const knownKey = method === "GET" ? knownReportKey(requestUrl) : null;
    if (knownKey) await bridge.ready;

    if (knownKey === "driverMetricsDetail" && bridge.buffer) {
      return new Response(bridge.buffer.slice(0), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Last-Modified": new Date().toUTCString(),
          "X-Vixen-Derived-Report": "driverMetricsDetail",
        },
      });
    }

    const response = await routedFetch(input, init);
    if (response.ok) return response;

    const reportType = method === "GET" ? virtualBasicReportType(requestUrl) : null;
    if (!reportType || !aux.active) return response;

    aux.virtualRequests.add(reportType);
    return new Response(buildVirtualReport(reportType), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Last-Modified": new Date(0).toUTCString(),
        "X-Vixen-Virtual-Report": reportType,
      },
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector(".main-panel") || document.body;
    if ("MutationObserver" in window && root) {
      aux.observer = new MutationObserver(scheduleApply);
      aux.observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    }
    scheduleApply();
    window.setTimeout(scheduleApply, 250);
    window.setTimeout(scheduleApply, 1000);
  });

  async function applyFilenameFallbacks(routes) {
    let manifest = [];
    try {
      const response = await routedFetch("data-manifest.json", { cache: "no-store" });
      if (response.ok) manifest = await response.json();
    } catch (_) {}
    if (!Array.isArray(manifest)) return;

    const fallbackRules = {
      summary: /^summary\.(xlsx|xlsm)$/i,
      detail: /^detail\.(xlsx|xlsm)$/i,
      driverDetails: /^driver[ _-]*details\.(xlsx|xlsm)$/i,
      rolling7Day: /^rolling[ _-]*7[ _-]*day\.(xlsx|xlsm)$/i,
    };
    for (const [key, pattern] of Object.entries(fallbackRules)) {
      if (routes[key]) continue;
      const file = manifest.find((item) => pattern.test(item?.name || ""));
      if (!file) continue;
      routes[key] = file;
      if (smart.diagnostics?.routes) smart.diagnostics.routes[key] = { name: file.name, score: 1, filenameFallback: true };
    }
  }

  async function buildDerivedDriverMetrics(rollingRoute, detailsRoute) {
    const [rollingWorkbook, detailsWorkbook] = await Promise.all([
      readWorkbook(rollingRoute),
      readWorkbook(detailsRoute),
    ]);
    const rolling = parseRolling7(rollingWorkbook);
    const details = parseDriverDetails(detailsWorkbook);
    const names = new Map();

    for (const record of rolling) {
      names.set(normalizeIdentity(record.driverName), {
        driverName: record.driverName,
        driverCode: extractDriverCode(record.driverName),
        idle7: record.idlePct,
        idle28: null,
      });
    }
    for (const record of details) {
      const key = normalizeIdentity(record.driverName);
      const current = names.get(key) || {
        driverName: record.driverName,
        driverCode: extractDriverCode(record.driverName),
        idle7: null,
        idle28: null,
      };
      current.idle28 = record.idlePct;
      names.set(key, current);
    }

    if (!names.size) throw new Error("The rolling 7 day and Driver Details files were found, but no driver idle rows could be derived from them.");

    const rows = [["Driver", "Driver Code", "Driver Leader", "Dispatch MPG", "Idle %", "OOR"]];
    for (const record of names.values()) {
      rows.push([
        record.driverName,
        record.driverCode,
        "Unassigned",
        null,
        record.idle28 ?? record.idle7 ?? null,
        null,
      ]);
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Derived Driver Metrics");
    return {
      buffer: XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }),
      driverCount: rows.length - 1,
    };
  }

  async function readWorkbook(route) {
    if (!route?.path) throw new Error(`A routed workbook path was not available for ${route?.name || "an idle report"}.`);
    const response = await routedFetch(encodeURI(route.path), { cache: "no-store" });
    if (!response.ok) throw new Error(`${route.name || route.path} returned HTTP ${response.status}.`);
    return XLSX.read(await response.arrayBuffer(), { type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false });
  }

  function parseRolling7(workbook) {
    const rows = workbookRows(workbook);
    const latest = new Map();
    let currentDriver = "";
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      if (cleanText(row[0]) && !/^grand total$/i.test(cleanText(row[0]))) currentDriver = cleanText(row[0]);
      if (!currentDriver || normalize(row[1]) !== "idle") continue;
      for (let cursor = index; cursor < rows.length; cursor += 1) {
        const item = rows[cursor] || [];
        if (cursor > index && cleanText(item[1])) break;
        const date = parseDate(item[2]);
        const idlePct = item.slice(10).map(normalizePercent).find((value) => Number.isFinite(value));
        if (!date || !Number.isFinite(idlePct)) continue;
        const key = normalizeIdentity(currentDriver);
        const previous = latest.get(key);
        if (!previous || date > previous.date) latest.set(key, { driverName: currentDriver, date, idlePct });
      }
    }
    return [...latest.values()];
  }

  function parseDriverDetails(workbook) {
    const rows = workbookRows(workbook);
    const latest = new Map();
    let currentDriver = "";
    for (let index = 0; index < rows.length - 5; index += 1) {
      const row = rows[index] || [];
      if (cleanText(row[1]) && !/^total$/i.test(cleanText(row[1]))) currentDriver = cleanText(row[1]);
      const date = parseDate(row[2]);
      if (!currentDriver || !date || normalize(row[13]) !== "cruise in time") continue;
      const idlePct = (rows[index + 5] || []).slice(14).map(normalizePercent).find((value) => Number.isFinite(value));
      if (!Number.isFinite(idlePct)) continue;
      const key = normalizeIdentity(currentDriver);
      const previous = latest.get(key);
      if (!previous || date > previous.date) latest.set(key, { driverName: currentDriver, date, idlePct });
    }
    return [...latest.values()];
  }

  function knownReportKey(requestUrl) {
    if (!requestUrl) return null;
    try {
      const url = new URL(requestUrl, location.href);
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, "").toLowerCase();
      const file = path.split("/").at(-1) || "";
      if (/^summary\.(xlsx|xlsm|xlsb|xls)$/.test(file)) return "summary";
      if (/^detail\.(xlsx|xlsm|xlsb|xls)$/.test(file)) return "detail";
      if (/^driver[ _-]*details\.(xlsx|xlsm|xlsb|xls)$/.test(file)) return "driverDetails";
      if (/^rolling[ _-]*7[ _-]*day\.(xlsx|xlsm|xlsb|xls)$/.test(file)) return "rolling7Day";
      if (/^driver[ _-]*metrics[ _-]*detail\.(xlsx|xlsm|xlsb|xls)$/.test(file)) return "driverMetricsDetail";
      return null;
    } catch (_) {
      return null;
    }
  }

  function virtualBasicReportType(requestUrl) {
    if (!requestUrl) return null;
    try {
      const url = new URL(requestUrl, location.href);
      if (url.origin !== location.origin) return null;
      const file = decodeURIComponent(url.pathname).split("/").at(-1) || "";
      if (/^driver[ _-]*fuel[ _-]*metrics\.xlsx$/i.test(file)) return "reportDriverMetrics";
      if (/^fuel[ _-]*compliance[ _-]*analysis\.xlsx$/i.test(file)) return "reportCompliance";
      if (/^fuel[ _-]*noncompliant[ _-]*cost[ _-]*analysis\.xlsx$/i.test(file)) return "reportCost";
      if (/^mpg[ _-]*by[ _-]*driver\.xlsx$/i.test(file)) return "reportMpg";
    } catch (_) {}
    return null;
  }

  function buildVirtualReport(reportType) {
    if (virtualReports.has(reportType)) return virtualReports.get(reportType).slice(0);
    if (!window.XLSX) throw new Error("SheetJS is required to build the auxiliary-mode placeholders.");

    let rows;
    if (reportType === "reportCompliance") {
      const row = Array(33).fill(null);
      row[0] = "2000-01-01";
      row[32] = 0;
      rows = [row];
    } else if (reportType === "reportCost") {
      const row = Array(32).fill(null);
      row[0] = "Grand Total";
      row[21] = 0;
      row[25] = 0;
      row[31] = 0;
      rows = [row];
    } else if (reportType === "reportDriverMetrics") {
      rows = [["Driver", "Driver Code", "Driver Leader", "Dispatch MPG", "Idle %", "OOR"]];
    } else {
      rows = [[], [], [], [], []];
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Auxiliary Placeholder");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
    virtualReports.set(reportType, buffer);
    return buffer.slice(0);
  }

  function scheduleApply() {
    window.clearTimeout(aux.applyTimer);
    aux.applyTimer = window.setTimeout(applyAuxiliaryUi, 25);
  }

  function applyAuxiliaryUi() {
    if (!aux.active || !document.body) return;

    const overlay = document.getElementById("connectOverlay");
    const error = document.getElementById("connectError");
    if (error && /five idle-report|legacy workbook set|four basic reports/i.test(error.textContent || "")) error.textContent = "";
    if (overlay && aux.virtualRequests.size) overlay.classList.add("hidden");

    let banner = document.getElementById("auxiliaryModeBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "auxiliaryModeBanner";
      banner.setAttribute("role", "status");
      const topbar = document.querySelector(".topbar");
      if (topbar) topbar.insertAdjacentElement("afterend", banner);
    }
    if (banner) {
      const bannerHtml = `<strong>PARTIAL DATA MODE</strong><span>${escapeHtml(aux.reason)} Fuel KPIs stay blank rather than manufacturing performance.</span>`;
      if (banner.innerHTML !== bannerHtml) banner.innerHTML = bannerHtml;
      banner.style.cssText = "margin:0 0 14px;padding:12px 16px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);color:var(--white);display:flex;gap:12px;align-items:center;flex-wrap:wrap";
      const strong = banner.querySelector("strong");
      if (strong) strong.style.cssText = "color:var(--amber);font-size:11px;letter-spacing:.08em";
      const span = banner.querySelector("span");
      if (span) span.style.cssText = "color:var(--muted);font-size:12px";
    }

    setText("reportingWeek", "Partial data");
    ["kpiCompliance", "kpiWeeklyCost", "kpiModeledSavings", "kpiAnnualExposure", "kpiIdle7Day", "kpiIdle28Day", "heroSavings", "trendWeekTotal"].forEach((id) => setText(id, "--"));
    setText("kpiComplianceDelta", "No complete compliance report set loaded");
    setText("kpiWeeklyCostDelta", "No complete cost report set loaded");
    setText("kpiModeledSavingsNote", "Requires driver miles, gallons, and MPG data");
    setText("kpiAnnualNote", "Requires a complete fuel-performance period");
    setText("kpiIdle7DayNote", "Requires a usable rolling idle source");
    setText("kpiIdle28DayNote", "Requires a usable rolling idle source");
    setText("heroInsight", "The dashboard opened with the files it could recognize. Use the available operational tools, including Missing BOLs, while incomplete fuel panels remain blank.");
    setText("trendWeekDelta", "No complete fuel trend");

    const driverButton = document.getElementById("heroDriverDetailsBtn");
    if (driverButton) driverButton.disabled = true;
  }

  function workbookRows(workbook) {
    if (!workbook?.SheetNames?.length) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
  }

  function extractDriverCode(value) {
    const source = cleanText(value).toUpperCase();
    return source.match(/(?:^|\b)([A-Z]{5}\d|[A-Z]{5,6}|\d{5,6})(?:\b|$)/)?.[1] || "";
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    const parsed = new Date(cleanText(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizePercent(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value > 1.5 ? value / 100 : value;
    const text = cleanText(value).replace(/,/g, "");
    if (!text) return null;
    const number = Number(text.replace(/%$/, ""));
    if (!Number.isFinite(number)) return null;
    return /%$/.test(text) || number > 1.5 ? number / 100 : number;
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function normalizeIdentity(value) {
    return normalize(value).replace(/\s+/g, "");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
