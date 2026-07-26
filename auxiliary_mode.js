(() => {
  "use strict";

  const routedFetch = window.fetch.bind(window);
  const virtualReports = new Map();
  const CORE_GROUPS = {
    legacy: ["summary", "drivers", "detail", "trend"],
    idle: ["summary", "detail", "driverMetricsDetail", "driverDetails", "rolling7Day"],
    basic: ["reportDriverMetrics", "reportCompliance", "reportCost", "reportMpg"],
  };

  const state = {
    active: false,
    routes: {},
    reason: "",
    virtualRequests: new Set(),
    observer: null,
    applyTimer: null,
  };

  window.VixenAuxiliaryMode = state;

  window.fetch = async (input, init) => {
    const response = await routedFetch(input, init);
    if (response.ok) return response;

    const requestUrl = typeof input === "string" ? input : input?.url;
    const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
    const reportType = method === "GET" ? virtualReportType(requestUrl) : null;
    if (!reportType) return response;

    state.virtualRequests.add(reportType);
    const body = buildVirtualReport(reportType);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Last-Modified": new Date(0).toUTCString(),
        "X-Vixen-Virtual-Report": reportType,
      },
    });
  };

  Promise.resolve(window.VixenSmartDataLoader?.ready || {})
    .then((routes) => {
      state.routes = routes || {};
      const completeGroup = Object.values(CORE_GROUPS).some((keys) => keys.every((key) => state.routes[key]));
      state.active = !completeGroup;
      state.reason = state.active
        ? "No complete fuel-report set was found. Available auxiliary and partial reports remain usable."
        : "";
      scheduleApply();
    })
    .catch((error) => {
      state.active = true;
      state.reason = `The report classifier could not complete: ${error?.message || error}`;
      scheduleApply();
    });

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector(".main-panel") || document.body;
    if ("MutationObserver" in window && root) {
      state.observer = new MutationObserver(scheduleApply);
      state.observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    }
    scheduleApply();
    window.setTimeout(scheduleApply, 250);
    window.setTimeout(scheduleApply, 1000);
  });

  function virtualReportType(requestUrl) {
    if (!requestUrl) return null;
    try {
      const url = new URL(requestUrl, location.href);
      if (url.origin !== location.origin) return null;
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, "").toLowerCase();
      const file = path.split("/").at(-1) || "";
      if (/^driver[ _-]*fuel[ _-]*metrics\.xlsx$/.test(file)) return "reportDriverMetrics";
      if (/^fuel[ _-]*compliance[ _-]*analysis\.xlsx$/.test(file)) return "reportCompliance";
      if (/^fuel[ _-]*noncompliant[ _-]*cost[ _-]*analysis\.xlsx$/.test(file)) return "reportCost";
      if (/^mpg[ _-]*by[ _-]*driver\.xlsx$/.test(file)) return "reportMpg";
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
    window.clearTimeout(state.applyTimer);
    state.applyTimer = window.setTimeout(applyAuxiliaryUi, 25);
  }

  function applyAuxiliaryUi() {
    if (!state.active || !document.body) return;

    const overlay = document.getElementById("connectOverlay");
    const error = document.getElementById("connectError");
    if (error && /five idle-report|legacy workbook set|four basic reports/i.test(error.textContent || "")) error.textContent = "";
    if (overlay && state.virtualRequests.size) overlay.classList.add("hidden");

    let banner = document.getElementById("auxiliaryModeBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "auxiliaryModeBanner";
      banner.setAttribute("role", "status");
      const topbar = document.querySelector(".topbar");
      if (topbar) topbar.insertAdjacentElement("afterend", banner);
    }
    if (banner) {
      banner.innerHTML = `<strong>PARTIAL DATA MODE</strong><span>${escapeHtml(state.reason)} Fuel KPIs stay blank rather than manufacturing performance.</span>`;
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

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
