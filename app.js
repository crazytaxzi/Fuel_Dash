(() => {
  "use strict";

  const EXPECTED_FILES = {
    summary: /^summary\.(xlsx|xlsm|xlsb|xls)$/i,
    drivers: /^c1\.(xlsx|xlsm|xlsb|xls)$/i,
    detail: /^detail\.(xlsx|xlsm|xlsb|xls)$/i,
    trend: /^summary[ _-]*chart\.(xlsx|xlsm|xlsb|xls)$/i,
  };
  const BASIC_REPORT_FILES = {
    reportDriverMetrics: /^driver[ _-]*fuel[ _-]*metrics\.(xlsx|xlsm|xlsb|xls|pdf)$/i,
    reportCompliance: /^fuel[ _-]*compliance[ _-]*analysis\.(xlsx|xlsm|xlsb|xls|pdf)$/i,
    reportCost: /^fuel[ _-]*noncompliant[ _-]*cost[ _-]*analysis\.(xlsx|xlsm|xlsb|xls|pdf)$/i,
    reportMpg: /^mpg[ _-]*by[ _-]*driver\.(xlsx|xlsm|xlsb|xls|pdf)$/i,
  };
  const IDLE_REPORT_FILES = {
    driverMetricsDetail: /^driver[ _-]*metrics[ _-]*detail\.(xlsx|xlsm|xlsb|xls)$/i,
    driverDetails: /^driver[ _-]*details\.(xlsx|xlsm|xlsb|xls)$/i,
    rolling7Day: /^rolling[ _-]*7[ _-]*day\.(xlsx|xlsm|xlsb|xls)$/i,
  };
  const OPTIONAL_FILES = {
    apu: /(?:^|[ _-])(?:electric[ _-]*)?apu(?:[ _-].*)?\.(xlsx|xlsm|xlsb|xls)$/i,
    ptaTracker: /pta[ _-]*dispatch[ _-]*tracker.*\.(xlsx|xlsm|xlsb|xls)$/i,
    ptaFinder: /fleet[ _-]*pta[ _-]*finder.*\.(xlsx|xlsm|xlsb|xls)$/i,
    driverPdf: /\.pdf$/i,
  };
  const ALL_FILE_PATTERNS = { ...EXPECTED_FILES, ...BASIC_REPORT_FILES, ...IDLE_REPORT_FILES, ...OPTIONAL_FILES };
  const PTA_PASTE_HEADERS = ["Truck #", "Div #", "Driver", "PTA", "Status", "Plans", "Plan", "Team", "Destination", "OM", "Count"];
  const PTA_PASTE_KEYS = {
    active: "vixenManualPtaActive",
    text: "vixenManualPtaText",
    savedAt: "vixenManualPtaSavedAt",
  };
  const PTA_ACTION_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_ACTION_NOTES_KEY = "vixenDriverActionNotesV1";

  const state = {
    directoryHandle: null,
    fallbackFiles: null,
    staticFiles: null,
    sourceFiles: {},
    sourceSignatures: {},
    analysis: null,
    heroChart: null,
    weeklyChart: null,
    refreshTimer: null,
    workedStatusTimer: null,
    ptaFilter: "action",
    activePtaRecordIndex: null,
    activeDriverRecordIndex: null,
    ptaActionNotes: loadPtaActionNotes(),
    driverActionNotes: loadStoredNotes(DRIVER_ACTION_NOTES_KEY),
    manualPta: {
      active: localStorage.getItem(PTA_PASTE_KEYS.active) === "true",
      text: localStorage.getItem(PTA_PASTE_KEYS.text) || "",
      savedAt: Number(localStorage.getItem(PTA_PASTE_KEYS.savedAt)) || null,
      rowCount: 0,
      error: "",
    },
    settings: {
      planningPpg: Number(localStorage.getItem("vixenPlanningPpg")) || 4,
      refreshSeconds: Number(localStorage.getItem("vixenRefreshSeconds")) || 60,
      brand: localStorage.getItem("vixenBrand") || "VIXEN",
      tagline: localStorage.getItem("vixenTagline") || "CUT WASTE. BOOST MARGINS. OUTPERFORM.",
    },
  };

  const els = {};
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", async () => {
    cacheElements();
    bindEvents();
    applyBranding();
    populateSettings();
    configureCharts();
    scheduleWorkedStatusRefresh();
    await attemptRestoreDirectory();
  });

  function cacheElements() {
    [
      "connectOverlay", "connectFolderBtn", "fallbackFilesBtn", "fallbackFilesInput", "connectError",
      "refreshBtn", "changeFolderBtn", "reportingWeek", "lastRefresh", "toast", "brandName", "tagline",
      "kpiCompliance", "kpiComplianceDelta", "kpiComplianceBar", "kpiWeeklyCost", "kpiWeeklyCostDelta",
      "kpiWeeklyCostBar", "kpiModeledSavings", "kpiModeledSavingsNote", "kpiModeledSavingsBar",
      "kpiAnnualExposure", "kpiAnnualNote", "kpiAnnualBar", "heroInsight", "heroSavings",
      "kpiIdle7Day", "kpiIdle7DayNote", "kpiIdle7DayBar", "kpiIdle28Day", "kpiIdle28DayNote", "kpiIdle28DayBar",
      "topDriversList", "bestIdlersList", "unitWatchList", "qualityAlerts", "nextActions", "trendWeekTotal", "trendWeekDelta",
      "planningPpgInput", "refreshIntervalSelect", "brandInput", "taglineInput", "saveSettingsBtn", "saveBrandBtn",
      "sourceStatusList", "qualityCards", "heroDriverDetailsBtn", "driverModal", "closeDriverModalBtn",
      "closeDriverModalFooterBtn", "openDriversTableBtn", "modalDriverName", "modalDriverMeta", "modalReviewBadge",
      "modalDriverMetrics", "modalDriverFocus", "modalDriverAction", "modalDriverApu", "modalDriverPta", "modalDriverContext",
      "apuSummaryGrid", "apuEmptyState", "apuTableShell", "ptaPulseSummary", "ptaOverviewQueue", "ptaDueSoonQueue",
      "ptaSummaryGrid", "ptaEmptyState", "ptaTableShell", "ptaFilterBar", "ptaModal", "closePtaModalBtn",
      "closePtaModalFooterBtn", "openPtaTableBtn", "modalPtaTruck", "modalPtaMeta", "modalPtaBadge",
      "modalPtaMetrics", "modalPtaAction", "modalPtaNotes", "modalPtaContext", "modalPtaSource",
      "ptaPastePanel", "ptaPasteStatus", "ptaPasteInput", "applyPtaPasteBtn", "clearPtaPasteBtn",
      "copyPtaHeaderBtn", "ptaPasteMessage", "ptaActionNoteInput", "savePtaActionNoteBtn",
      "clearPtaActionNoteBtn", "ptaActionNoteStatus", "ptaActionNoteHistory", "exportTransitionBtn",
      "driverActionNoteInput", "saveDriverActionNoteBtn", "clearDriverActionNoteBtn",
      "driverActionNoteStatus", "driverActionNoteHistory", "workedEmptyState", "workedList"
    ].forEach((id) => { els[id] = $(id); });
  }

  function bindEvents() {
    els.connectFolderBtn.addEventListener("click", chooseDirectory);
    els.fallbackFilesBtn.addEventListener("click", () => els.fallbackFilesInput.click());
    els.fallbackFilesInput.addEventListener("change", handleFallbackFiles);
    els.refreshBtn.addEventListener("click", () => refreshData(true));
    els.changeFolderBtn.addEventListener("click", () => {
      els.connectOverlay.classList.remove("hidden");
      els.connectError.textContent = "";
    });
    els.saveSettingsBtn.addEventListener("click", saveSettings);
    els.saveBrandBtn.addEventListener("click", saveBranding);

    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
    document.querySelectorAll("[data-view-target]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.viewTarget));
    });
    document.querySelectorAll(".table-search").forEach((input) => {
      input.addEventListener("input", () => filterTable(input.dataset.table, input.value));
    });
    els.heroDriverDetailsBtn.addEventListener("click", () => openDriverModal(0));
    els.closeDriverModalBtn.addEventListener("click", closeDriverModal);
    els.closeDriverModalFooterBtn.addEventListener("click", closeDriverModal);
    els.openDriversTableBtn.addEventListener("click", () => {
      closeDriverModal();
      switchView("drivers");
    });
    els.driverModal.addEventListener("click", (event) => {
      if (event.target === els.driverModal) closeDriverModal();
    });
    els.closePtaModalBtn.addEventListener("click", closePtaModal);
    els.closePtaModalFooterBtn.addEventListener("click", closePtaModal);
    els.openPtaTableBtn.addEventListener("click", () => {
      closePtaModal();
      switchView("pta");
    });
    els.ptaModal.addEventListener("click", (event) => {
      if (event.target === els.ptaModal) closePtaModal();
    });
    document.querySelectorAll("[data-pta-filter]").forEach((button) => {
      button.addEventListener("click", () => setPtaFilter(button.dataset.ptaFilter));
    });
    els.applyPtaPasteBtn.addEventListener("click", applyManualPtaPaste);
    els.clearPtaPasteBtn.addEventListener("click", clearManualPtaPaste);
    els.copyPtaHeaderBtn.addEventListener("click", copyPtaHeader);
    els.savePtaActionNoteBtn.addEventListener("click", savePtaActionNote);
    els.clearPtaActionNoteBtn.addEventListener("click", () => {
      els.ptaActionNoteInput.value = "";
      els.ptaActionNoteInput.focus();
    });
    els.ptaActionNoteInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        savePtaActionNote();
      }
    });
    els.ptaActionNoteHistory.addEventListener("click", handlePtaActionNoteHistoryClick);
    els.exportTransitionBtn.addEventListener("click", exportShiftTransition);
    els.saveDriverActionNoteBtn.addEventListener("click", saveDriverActionNote);
    els.clearDriverActionNoteBtn.addEventListener("click", () => {
      els.driverActionNoteInput.value = "";
      els.driverActionNoteInput.focus();
    });
    els.driverActionNoteInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        saveDriverActionNote();
      }
    });
    els.driverActionNoteHistory.addEventListener("click", handleDriverActionNoteHistoryClick);
    els.ptaPasteInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        applyManualPtaPaste();
      }
    });
    document.addEventListener("click", (event) => {
      const driverTrigger = event.target.closest("[data-driver-index]");
      if (driverTrigger && !driverTrigger.closest("#driverModal")) {
        const index = Number(driverTrigger.dataset.driverIndex);
        if (Number.isInteger(index)) openDriverModal(index);
        return;
      }
      const ptaTrigger = event.target.closest("[data-pta-index]");
      if (ptaTrigger && !ptaTrigger.closest("#ptaModal")) {
        const index = Number(ptaTrigger.dataset.ptaIndex);
        if (Number.isInteger(index)) openPtaModal(index);
      }
    });
  }

  function populateSettings() {
    els.planningPpgInput.value = state.settings.planningPpg.toFixed(2);
    els.refreshIntervalSelect.value = String(state.settings.refreshSeconds);
    els.brandInput.value = state.settings.brand;
    els.taglineInput.value = state.settings.tagline;
    els.ptaPasteInput.value = state.manualPta.text;
    updatePtaPasteUi();
  }

  function applyBranding() {
    els.brandName.textContent = state.settings.brand;
    els.tagline.textContent = state.settings.tagline;
    document.title = `${state.settings.brand} Fuel Ops`;
  }

  function saveBranding() {
    state.settings.brand = (els.brandInput.value || "VIXEN").trim().toUpperCase();
    state.settings.tagline = (els.taglineInput.value || "CUT WASTE. BOOST MARGINS. OUTPERFORM.").trim().toUpperCase();
    localStorage.setItem("vixenBrand", state.settings.brand);
    localStorage.setItem("vixenTagline", state.settings.tagline);
    applyBranding();
    showToast("Branding updated.");
  }

  function saveSettings() {
    const ppg = Number(els.planningPpgInput.value);
    if (!Number.isFinite(ppg) || ppg <= 0) {
      showToast("Planning price must be greater than zero.", true);
      return;
    }
    state.settings.planningPpg = ppg;
    state.settings.refreshSeconds = Number(els.refreshIntervalSelect.value) || 0;
    localStorage.setItem("vixenPlanningPpg", String(ppg));
    localStorage.setItem("vixenRefreshSeconds", String(state.settings.refreshSeconds));
    scheduleAutoRefresh();
    if (state.analysis) {
      refreshData(true);
    }
    showToast("Cost model updated.");
  }

  async function attemptRestoreDirectory() {
    try {
      if (await attemptSameFolderFiles()) {
        await refreshData(false);
        return;
      }
    } catch (error) {
      console.warn("Same-folder auto-load was unavailable", error);
    }

    if (!("showDirectoryPicker" in window)) {
      els.connectError.textContent = "Folder auto-refresh requires Edge or Chrome. You can still choose the files manually.";
      return;
    }
    try {
      const handle = await idbGet("directoryHandle");
      if (!handle) return;
      const permission = await handle.queryPermission({ mode: "read" });
      if (permission === "granted") {
        state.directoryHandle = handle;
        await refreshData(false);
      }
    } catch (error) {
      console.warn("Could not restore folder handle", error);
    }
  }

  async function chooseDirectory() {
    if (!("showDirectoryPicker" in window)) {
      els.connectError.textContent = "This browser does not support persistent folder access. Use Edge/Chrome or choose the files manually.";
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "read", id: "vixen-fuel-folder" });
      const permission = await verifyPermission(handle, true);
      if (!permission) throw new Error("Folder access was not granted.");
      state.directoryHandle = handle;
      state.fallbackFiles = null;
      state.staticFiles = null;
      await idbSet("directoryHandle", handle);
      await refreshData(false);
    } catch (error) {
      if (error?.name !== "AbortError") {
        els.connectError.textContent = error.message || "Could not read that folder.";
      }
    }
  }

  async function handleFallbackFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    state.fallbackFiles = files;
    state.directoryHandle = null;
    state.staticFiles = null;
    await refreshData(false);
  }

  async function verifyPermission(handle, request) {
    const options = { mode: "read" };
    if ((await handle.queryPermission(options)) === "granted") return true;
    if (request && (await handle.requestPermission(options)) === "granted") return true;
    return false;
  }

  async function refreshData(manual = false) {
    setBusy(true);
    try {
      const files = await collectSourceFiles();
      const legacyReady = Object.keys(EXPECTED_FILES).every((key) => files[key] || (key === "drivers" && files.driverPdf));
      const idleReady = files.summary && files.detail && Object.keys(IDLE_REPORT_FILES).every((key) => files[key]);
      const basicMissing = Object.keys(BASIC_REPORT_FILES).filter((key) => !files[key]);
      if (!legacyReady && !idleReady && basicMissing.length) {
        throw new Error("Choose the five idle-report XLSX files, the legacy workbook set, or all four basic reports.");
      }

      const signatures = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, `${file.name}|${file.size}|${file.lastModified}`]));
      if (!manual && state.analysis && shallowEqual(signatures, state.sourceSignatures)) {
        updateLastRefresh("Checked, no file changes");
        setBusy(false);
        return;
      }

      const workbooks = {};
      for (const [key, file] of Object.entries(files)) {
        const buffer = await file.arrayBuffer();
        if (/\.pdf$/i.test(file.name)) {
          const pdfLines = await extractPdfTextLines(buffer);
          workbooks[key] = key === "driverPdf" ? parseBasicDriverPdfLines(pdfLines) : { pdfLines };
        } else {
          workbooks[key] = XLSX.read(buffer, { type: "array", cellDates: false, raw: true, dense: false });
        }
      }

      state.sourceFiles = files;
      state.sourceSignatures = signatures;
      state.analysis = idleReady
        ? analyzeIdleReports(workbooks, files)
        : legacyReady
          ? analyzeWorkbooks(workbooks, files)
          : analyzeBasicReports(workbooks, files);
      renderDashboard(state.analysis);
      updateSourceStatus();
      updateLastRefresh(new Date());
      els.connectOverlay.classList.add("hidden");
      els.connectError.textContent = "";
      scheduleAutoRefresh();
      const hasPdf = Object.values(files).some((file) => /\.pdf$/i.test(file.name));
      showToast(`Dashboard refreshed from local ${hasPdf ? "XLSX/PDF reports" : "workbooks"}.`);
    } catch (error) {
      console.error(error);
      els.connectOverlay.classList.remove("hidden");
      els.connectError.textContent = error.message || "The dashboard could not read the source files.";
      showToast(error.message || "Refresh failed.", true);
    } finally {
      setBusy(false);
    }
  }


  async function attemptSameFolderFiles() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return false;
    const candidates = {
      summary: ["data/summary.xlsx", "summary.xlsx", "summary.xlsm", "summary.xlsb", "summary.xls"],
      drivers: ["c1.xlsx", "c1.xlsm", "c1.xlsb", "c1.xls"],
      detail: ["data/Detail.xlsx", "Detail.xlsx", "Detail.xlsm", "detail.xlsx", "detail.xlsm"],
      trend: ["summary chart.xlsx", "summary chart.xlsm", "summary_chart.xlsx", "summary_chart.xlsm"],
      apu: ["APU.xlsx", "APU.xlsm", "apu.xlsx", "apu.xlsm", "Electric APU.xlsx", "Electric APU.xlsm", "electric_apu.xlsx", "electric_apu.xlsm"],
      ptaTracker: ["PTA_Dispatch_Tracker_Updated_FIXED.xlsx", "PTA Dispatch Tracker.xlsx", "PTA_Dispatch_Tracker.xlsx", "PTA Dispatch Tracker.xlsm"],
      ptaFinder: ["Fleet_PTA_Finder.xlsx", "Fleet PTA Finder.xlsx", "Fleet_PTA_Finder.xlsm", "Fleet PTA Finder.xlsm"],
      driverPdf: ["Driver Fuel Report.pdf", "Fuel Driver Report.pdf", "driver report.pdf", "fuel report.pdf"],
      reportDriverMetrics: ["data/Driver Fuel Metrics.xlsx", "data/Driver Fuel Metrics.pdf", "Driver Fuel Metrics.xlsx", "Driver Fuel Metrics.pdf"],
      reportCompliance: ["data/Fuel Compliance Analysis.xlsx", "data/Fuel Compliance Analysis.pdf", "Fuel Compliance Analysis.xlsx", "Fuel Compliance Analysis.pdf"],
      reportCost: ["data/Fuel Noncompliant Cost Analysis.xlsx", "data/Fuel Noncompliant Cost Analysis.pdf", "Fuel Noncompliant Cost Analysis.xlsx", "Fuel Noncompliant Cost Analysis.pdf"],
      reportMpg: ["data/MPG by Driver.xlsx", "data/MPG by Driver.pdf", "MPG by Driver.xlsx", "MPG by Driver.pdf"],
      driverMetricsDetail: ["data/driver metrics detail.xlsx", "driver metrics detail.xlsx"],
      driverDetails: ["data/Driver Details.xlsx", "Driver Details.xlsx"],
      rolling7Day: ["data/rolling 7 day.xlsx", "rolling 7 day.xlsx"],
    };
    const found = {};
    for (const [key, names] of Object.entries(candidates)) {
      for (const name of names) {
        try {
          const response = await fetch(encodeURI(name), { cache: "no-store" });
          if (!response.ok) continue;
          const blob = await response.blob();
          const modifiedHeader = response.headers.get("Last-Modified");
          found[key] = new File([blob], name, {
            type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            lastModified: modifiedHeader ? new Date(modifiedHeader).getTime() : Date.now(),
          });
          break;
        } catch (_) {}
      }
    }
    const legacyReady = Object.keys(EXPECTED_FILES).every((key) => found[key] || (key === "drivers" && found.driverPdf));
    const basicReady = Object.keys(BASIC_REPORT_FILES).every((key) => found[key]);
    const idleReady = found.summary && found.detail && Object.keys(IDLE_REPORT_FILES).every((key) => found[key]);
    if (!legacyReady && !basicReady && !idleReady) return false;
    state.staticFiles = found;
    state.directoryHandle = null;
    state.fallbackFiles = null;
    return true;
  }

  async function collectSourceFiles() {
    const found = {};
    if (state.staticFiles) {
      const refreshed = await attemptSameFolderFiles();
      if (!refreshed) throw new Error("The required same-folder workbooks could not be reloaded.");
      return { ...state.staticFiles };
    }
    if (state.directoryHandle) {
      const permission = await verifyPermission(state.directoryHandle, false);
      if (!permission) throw new Error("Folder permission expired. Choose the data folder again.");
      for await (const [name, handle] of state.directoryHandle.entries()) {
        if (handle.kind !== "file") continue;
        const key = matchSourceKey(name);
        if (key) {
          const file = await handle.getFile();
          if (!found[key] || shouldReplaceSource(found[key], file)) found[key] = file;
        }
      }
    } else if (state.fallbackFiles) {
      for (const file of state.fallbackFiles) {
        const key = matchSourceKey(file.name);
        if (key && (!found[key] || shouldReplaceSource(found[key], file))) found[key] = file;
      }
    } else {
      throw new Error("Choose the folder containing the five idle-report XLSX files, the legacy workbook set, or the four basic reports. Electric APU and PTA workbooks are optional.");
    }
    return found;
  }

  function matchSourceKey(name) {
    return Object.entries(ALL_FILE_PATTERNS).find(([, regex]) => regex.test(name))?.[0] || null;
  }

  function shouldReplaceSource(existing, candidate) {
    return /\.pdf$/i.test(existing?.name || "") && !/\.pdf$/i.test(candidate?.name || "");
  }

  function sourceLabel(key) {
    return ({
      summary: "summary.xlsx/xlsm",
      drivers: "c1.xlsx/xlsm or a basic driver PDF",
      detail: "Detail.xlsx/xlsm",
      trend: "summary chart.xlsx/xlsm",
      apu: "optional APU.xlsx/xlsm",
      ptaTracker: "optional PTA Dispatch Tracker.xlsx/xlsm",
      ptaFinder: "optional Fleet PTA Finder.xlsx/xlsm",
      driverPdf: "optional basic driver report PDF",
      reportDriverMetrics: "Driver Fuel Metrics.xlsx/pdf",
      reportCompliance: "Fuel Compliance Analysis.xlsx/pdf",
      reportCost: "Fuel Noncompliant Cost Analysis.xlsx/pdf",
      reportMpg: "MPG by Driver.xlsx/pdf",
      driverMetricsDetail: "driver metrics detail.xlsx",
      driverDetails: "Driver Details.xlsx",
      rolling7Day: "rolling 7 day.xlsx",
    })[key] || key;
  }

  function isIdleFocusedMode(analysis = state.analysis) {
    return analysis?.sourceMode === "basic-reports" || analysis?.sourceMode === "idle-reports";
  }

  function analyzeWorkbooks(workbooks, files) {
    const summaryRows = workbookRows(workbooks.summary, 0);
    const driverRows = workbooks.drivers ? workbookRows(workbooks.drivers, 0) : [];
    const detailRows = workbookRows(workbooks.detail, 0);
    const trendRows = workbookRows(workbooks.trend, 0);
    const apuRows = workbooks.apu ? workbookRows(workbooks.apu, 0) : [];

    const summary = analyzeSummary(summaryRows);
    const drivers = driverRows.length
      ? analyzeDrivers(driverRows, summary.latest.date, state.settings.planningPpg, workbooks.driverPdf || [])
      : analyzePdfDrivers(workbooks.driverPdf || [], summary.latest.date, state.settings.planningPpg);
    const detail = analyzeDetail(detailRows);
    const trend = analyzeTrend(trendRows, summary.completed, summary.latest.date);
    const apu = analyzeApu(apuRows, drivers, files.apu || null);
    const pta = analyzePta(workbooks.ptaTracker || null, workbooks.ptaFinder || null, files, activeManualPtaRows());
    const quality = buildDataQuality(detail, drivers, summary);
    const actions = buildActions(drivers, detail, quality, apu, pta);

    return {
      summary,
      drivers,
      detail,
      trend,
      apu,
      pta,
      quality,
      actions,
      files,
      settings: { ...state.settings },
      generatedAt: new Date(),
    };
  }

  function analyzeBasicReports(workbooks, files) {
    const compliance = parseBasicComplianceReport(workbooks.reportCompliance);
    const cost = parseBasicCostReport(workbooks.reportCost);
    const metricRows = parseBasicDriverMetricsReport(workbooks.reportDriverMetrics);
    const mpgRows = parseBasicMpgReport(workbooks.reportMpg);
    const summary = {
      completed: compliance.weeks,
      allDated: compliance.weeks,
      latest: compliance.weeks.at(-1),
      previous: compliance.weeks.at(-2) || null,
      partialRows: [],
    };
    if (!summary.latest) throw new Error("No dated compliance values were found in the Fuel Compliance Analysis report.");

    const drivers = buildBasicReportDrivers(metricRows, mpgRows, summary.latest.date);
    const detail = {
      records: [],
      units: [],
      stops: [],
      totals: { grossPositive: Math.max(0, cost.totalCost), negativeOffsets: Math.min(0, cost.totalCost), netCost: cost.totalCost },
      quality: { invalidNextDates: 0, invalidPpgRows: 0, badPurchaseType: 0, badRecGallons: 0, duplicateCount: 0 },
      basicReport: true,
    };
    const weeks = compliance.weeks.map((week, index) => ({
      date: week.date,
      compliance: week.compliance,
      gallonCost: index === compliance.weeks.length - 1 ? cost.gallonCost : 0,
      locationCost: index === compliance.weeks.length - 1 ? cost.locationCost : 0,
      totalCost: index === compliance.weeks.length - 1 ? cost.totalCost : 0,
    }));
    const trend = {
      weeks,
      recent: weeks,
      latest: weeks.at(-1) || null,
      previous: weeks.at(-2) || null,
      change: null,
      rollingAverage: weeks.map((_, index) => average(weeks.slice(Math.max(0, index - 3), index + 1).map((week) => week.totalCost))),
    };
    const emptyApu = analyzeApu([], drivers, null);
    const pta = analyzePta(workbooks.ptaTracker || null, workbooks.ptaFinder || null, files, activeManualPtaRows());
    const quality = {
      findings: [{
        severity: "Medium",
        count: 1,
        title: "Basic report mode",
        impact: "The four summary reports do not include transaction-level fueling events.",
        fix: "Use the legacy Detail workbook when unit and fueling-event drilldown is needed.",
      }],
    };
    const actions = buildActions(drivers, detail, quality, emptyApu, pta);
    return {
      summary, drivers, detail, trend, apu: emptyApu, pta, quality, actions, files,
      settings: { ...state.settings }, generatedAt: new Date(), sourceMode: "basic-reports",
    };
  }

  function analyzeIdleReports(workbooks, files) {
    const detail = analyzeDetail(workbookRows(workbooks.detail, 0));
    const metrics = parseBasicDriverMetricsReport(workbooks.driverMetricsDetail);
    const rolling7 = parseRolling7DayReport(workbooks.rolling7Day);
    const rolling28 = parseRolling28DayHistory(workbooks.driverDetails);
    const sevenByName = new Map(rolling7.map((record) => [normalizeIdentity(record.driverName), record]));
    const twentyEightByName = new Map(rolling28.map((record) => [normalizeIdentity(record.driverName), record]));

    const mergedMetrics = metrics.map((record) => {
      const seven = sevenByName.get(normalizeIdentity(record.driverName));
      const history28 = twentyEightByName.get(normalizeIdentity(record.driverName));
      const embeddedCode = text(record.driverName).match(/^\s*(\d{4,})\b/)?.[1] || "";
      return {
        ...record,
        driverCode: embeddedCode || record.driverCode,
        idle7DayPct: seven?.idle7DayPct ?? null,
        priorIdle7DayPct: seven?.history?.at(-2)?.idlePct ?? null,
        priorIdlePct: history28?.history?.at(-2)?.idlePct ?? null,
        movingMpg: history28?.movingMpg ?? null,
        reportDate: seven?.reportDate || record.reportDate || history28?.reportDate || null,
      };
    });

    const allDates = mergedMetrics.map((record) => record.reportDate).filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
    const detailDates = detail.records.map((record) => record.actualFuelDate).filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
    const latestDate = allDates.sort((a, b) => a - b).at(-1)
      || detailDates.sort((a, b) => a - b).at(-1)
      || new Date();
    const complianceRows = detail.records.filter((record) => ["Y", "N"].includes(text(record.locationCompliant).toUpperCase()));
    const compliance = complianceRows.length
      ? complianceRows.filter((record) => text(record.locationCompliant).toUpperCase() === "Y").length / complianceRows.length
      : 0;
    const latest = { date: latestDate, compliance, marker: "*", recommendations: detail.records.length, followed: Math.round(detail.records.length * compliance) };
    const summary = { completed: [latest], allDated: [latest], latest, previous: null, partialRows: [] };
    const drivers = buildBasicReportDrivers(mergedMetrics, [], latestDate);
    const week = {
      date: latestDate,
      compliance,
      gallonCost: detail.totals.grossPositive,
      locationCost: 0,
      totalCost: detail.totals.netCost,
    };
    const trend = { weeks: [week], recent: [week], latest: week, previous: null, change: null, rollingAverage: [week.totalCost] };
    const apu = analyzeApu([], drivers, null);
    const pta = analyzePta(workbooks.ptaTracker || null, workbooks.ptaFinder || null, files, activeManualPtaRows());
    const quality = buildDataQuality(detail, drivers, summary);
    quality.findings.unshift({
      severity: "Medium",
      count: 0,
      title: "Five-file idle mode",
      impact: `${formatCount(drivers.records.length)} drivers joined across the rolling 7-day and 28-day reports.`,
      fix: "Replace the same five XLSX exports each reporting week.",
    });
    const actions = buildActions(drivers, detail, quality, apu, pta);
    return {
      summary, drivers, detail, trend, apu, pta, quality, actions, files,
      settings: { ...state.settings }, generatedAt: new Date(), sourceMode: "idle-reports",
    };
  }

  function parseRolling7DayReport(workbook) {
    const rows = workbookRows(workbook, 0);
    const records = [];
    let currentDriver = "";
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      if (text(row[0]) && !/^grand total$/i.test(text(row[0]))) currentDriver = text(row[0]);
      if (!currentDriver || normalizeHeader(row[1]) !== "idle") continue;
      const history = [];
      for (let cursor = index; cursor < rows.length; cursor += 1) {
        const item = rows[cursor] || [];
        if (cursor > index && text(item[1])) break;
        const date = parseDate(item[2]);
        const idlePct = item.slice(10).map(normalizePercent).find(isFiniteNumber) ?? null;
        if (date && idlePct !== null) history.push({ date, idlePct });
      }
      history.sort((a, b) => a.date - b.date);
      if (history.length) records.push({ driverName: currentDriver, history });
    }
    if (!records.length) throw new Error("rolling 7 day.xlsx did not contain recognizable driver idle history.");
    const reportDate = records.flatMap((record) => record.history.map((item) => item.date)).sort((a, b) => a - b).at(-1);
    return records.map((record) => {
      const latest = record.history.at(-1);
      return {
        ...record,
        idle7DayPct: latest && dateKey(latest.date) === dateKey(reportDate) ? latest.idlePct : null,
        reportDate,
      };
    });
  }

  function parseRolling28DayHistory(workbook) {
    const rows = workbookRows(workbook, 0);
    const byDriver = new Map();
    let currentDriver = "";
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      if (text(row[1]) && !/^total$/i.test(text(row[1]))) currentDriver = text(row[1]);
      const date = parseDate(row[2]);
      if (!currentDriver || !date || normalizeHeader(row[13]) !== "cruise in time") continue;
      const idleRow = rows[index + 5] || [];
      const movingRow = rows[index + 9] || [];
      const idlePct = idleRow.slice(14).map(normalizePercent).find(isFiniteNumber) ?? null;
      const movingMpg = movingRow.slice(14).map(number).find(isFiniteNumber) ?? null;
      if (idlePct === null) continue;
      if (!byDriver.has(currentDriver)) byDriver.set(currentDriver, []);
      byDriver.get(currentDriver).push({ date, idlePct, movingMpg });
    }
    return Array.from(byDriver.entries()).map(([driverName, history]) => {
      history.sort((a, b) => a.date - b.date);
      return { driverName, history, reportDate: history.at(-1)?.date || null, movingMpg: history.at(-1)?.movingMpg ?? null };
    });
  }

  function basicReportRows(source) {
    return source?.pdfLines ? [] : workbookRows(source, 0);
  }

  function parseBasicDriverMetricsReport(source) {
    if (source?.pdfLines) return parseDriverMetricsPdfLines(source.pdfLines);
    const rows = basicReportRows(source);
    const headerIndex = findHeaderRowIndex(rows, ["driver", "dispatch mpg", "idle"]);
    if (headerIndex < 0) throw new Error("Driver Fuel Metrics did not contain a recognizable driver table.");
    const headers = rows[headerIndex] || [];
    const driverColumn = findHeaderIndex(headers, ["driver"]);
    const codeColumn = findHeaderIndex(headers, ["driver current position code", "driver code"]);
    const leaderColumn = findHeaderIndex(headers, ["driver leader"]);
    const mpgColumn = findHeaderIndex(headers, ["dispatch mpg"]);
    const idleColumn = headers.findIndex((value) => /idle\s*%/i.test(text(value)));
    const oorColumn = findHeaderIndex(headers, ["oor"]);
    const idleDate = idleColumn >= 0 ? parseDate(text(headers[idleColumn]).split(/\r?\n/)[0]) : null;
    return rows.slice(headerIndex + 1).map((row) => ({
      driverName: text(row[driverColumn]),
      driverCode: text(row[codeColumn]),
      driverLeader: text(row[leaderColumn]) || "Unassigned",
      dispatchMpg: number(row[mpgColumn]),
      dailyIdlePct: null,
      idle7DayPct: null,
      idle28DayPct: normalizePercent(row[idleColumn]),
      oorPct: normalizePercent(row[oorColumn]),
      reportDate: idleDate,
    })).filter((record) => record.driverName && !/^grand total$/i.test(record.driverName));
  }

  function parseDriverMetricsPdfLines(lines) {
    const records = [];
    lines.forEach((line) => {
      const values = [...line.matchAll(/-?\d+(?:\.\d+)?%?/g)].map((match) => match[0]);
      if (values.length < 3 || /grand total|last refreshed|date range/i.test(line)) return;
      const tail = values.slice(-3);
      const tailStart = line.lastIndexOf(tail[0]);
      const identity = line.slice(0, tailStart).trim();
      const codeMatch = identity.match(/\b(\d{4,}|[A-Z]{4,}|[A-Z]{2,}\d+[A-Z0-9]*)\b/);
      const name = identity.slice(0, codeMatch?.index ?? identity.length).trim();
      if (!name || /driver|terminal|leader|cost center/i.test(name)) return;
      records.push({
        driverName: name,
        driverCode: codeMatch?.[1] || "",
        driverLeader: "Unassigned",
        dispatchMpg: number(tail[0]),
        dailyIdlePct: null,
        idle7DayPct: null,
        idle28DayPct: normalizePercent(tail[1]),
        oorPct: normalizePercent(tail[2]),
        reportDate: null,
      });
    });
    if (!records.length) throw new Error("The Driver Fuel Metrics PDF opened, but no driver rows were recognized.");
    return records;
  }

  function parseBasicComplianceReport(source) {
    if (source?.pdfLines) {
      const weeks = [];
      source.pdfLines.forEach((line) => {
        const dateMatch = line.match(/\b(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))\b/);
        if (!dateMatch || /date range|last refreshed/i.test(line)) return;
        const percentages = [...line.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]) / 100);
        if (percentages.length) weeks.push({ date: parseDate(dateMatch[1]), compliance: percentages.at(-1), marker: "*" });
      });
      return { weeks: weeks.filter((week) => week.date).sort((a, b) => a.date - b.date) };
    }
    const rows = basicReportRows(source);
    const weeks = rows.map((row) => {
      const date = parseDate(row[0]);
      const compliance = normalizePercent(row[32]) ?? normalizePercent(row[15]);
      return date && compliance !== null ? { date, compliance, marker: "*" } : null;
    }).filter(Boolean).sort((a, b) => a.date - b.date);
    return { weeks };
  }

  function parseBasicCostReport(source) {
    if (source?.pdfLines) {
      const line = source.pdfLines.find((value) => /grand total/i.test(value)) || "";
      const values = [...line.matchAll(/-?\$?[\d,]+(?:\.\d+)?/g)].map((match) => number(match[0])).filter((value) => value !== null);
      const totalCost = values.at(-3) ?? values.at(-1) ?? 0;
      return { gallonCost: values.at(-5) || 0, locationCost: values.at(-4) || 0, totalCost };
    }
    const rows = basicReportRows(source);
    const totalRow = rows.find((row) => /^grand total$/i.test(text(row[0]))) || [];
    return { gallonCost: number(totalRow[21]) || 0, locationCost: number(totalRow[25]) || 0, totalCost: number(totalRow[31]) || 0 };
  }

  function parseBasicMpgReport(source) {
    if (source?.pdfLines) {
      const records = [];
      source.pdfLines.forEach((line) => {
        const id = line.match(/\b(\d{5,8})\b/);
        const values = [...line.matchAll(/\b\d+\.\d+\b/g)].map((match) => Number(match[0]));
        if (!id || !values.length) return;
        const before = line.slice(0, id.index).trim();
        const after = line.slice((id.index || 0) + id[0].length).trim();
        const name = after.replace(/\s+\d+\.\d+[\s\S]*$/, "").trim() || before;
        records.push({ driverCode: id[1], driverName: name, dispatchMpg: values.at(-1), history: values });
      });
      return records;
    }
    const rows = basicReportRows(source);
    return rows.slice(5).map((row) => {
      const identity = [text(row[0]), text(row[1])].filter(Boolean).join(" ").replace(/\r?\n/g, " ");
      const match = identity.match(/\b(\d{5,8})\s+(.+)/);
      const history = row.slice(2, 13).map(number).filter((value) => value !== null);
      return match && history.length ? { driverCode: match[1], driverName: match[2].trim(), dispatchMpg: history.at(-1), history } : null;
    }).filter(Boolean);
  }

  function buildBasicReportDrivers(metrics, mpgRows, currentDate) {
    const mpgByCode = new Map(mpgRows.map((row) => [normalizeIdentity(row.driverCode), row]));
    const mpgByName = new Map(mpgRows.map((row) => [normalizeIdentity(row.driverName), row]));
    const base = metrics.length ? metrics : mpgRows;
    const raw = base.map((record) => {
      const mpg = mpgByCode.get(normalizeIdentity(record.driverCode)) || mpgByName.get(normalizeIdentity(record.driverName));
      return {
        ...record,
        dispatchMpg: record.dispatchMpg ?? mpg?.dispatchMpg ?? null,
        priorDispatchMpg: mpg?.history?.at(-2) ?? null,
        dailyIdlePct: record.dailyIdlePct ?? null,
        idle7DayPct: record.idle7DayPct ?? null,
        idle28DayPct: record.idle28DayPct ?? null,
        idlePct: record.idle7DayPct ?? record.idle28DayPct ?? null,
        movingMpg: record.movingMpg ?? null, fuelGallons: null, dispatchMiles: null, drivingFuel: null, qualcommMiles: null,
        oorPct: record.oorPct ?? null, priorIdlePct: record.priorIdlePct ?? record.priorIdle7DayPct ?? null, priorOorPct: null,
      };
    });
    const mpgValues = raw.map((driver) => driver.dispatchMpg).filter(isFiniteNumber);
    const idleValues = raw.map((driver) => driver.idlePct).filter(isFiniteNumber);
    const targetMpg = percentile(mpgValues, .75);
    const idleThreshold = percentile(idleValues, .5);
    const records = raw.map((driver) => {
      const highIdle = driver.idlePct !== null && driver.idlePct > idleThreshold;
      const lowMpg = driver.dispatchMpg !== null && driver.dispatchMpg < targetMpg;
      return {
        ...driver, mpgChange: driver.priorDispatchMpg === null ? null : driver.dispatchMpg - driver.priorDispatchMpg,
        excessGallons: 0, estimatedCost: 0, annualizedCost: 0,
        priority: highIdle && lowMpg ? "High" : highIdle || lowMpg ? "Medium" : "Monitor",
        reviewLabel: highIdle && lowMpg ? "Talk first" : highIdle || lowMpg ? "Review" : "Watch",
        confidence: "Basic report", likelyDriver: highIdle ? "High idle" : lowMpg ? "Low dispatch MPG" : "Monitor",
        managerMatch: "Unknown",
        focus: highIdle ? `Idle is above the fleet middle at ${pct(driver.idlePct, 1)}` : `Dispatch MPG is ${num(driver.dispatchMpg, 2)}`,
        action: "Review the basic report values and record any follow-up for the next shift.",
      };
    }).sort((a, b) => (b.idlePct || 0) - (a.idlePct || 0));
    return {
      records,
      totals: { excessGallons: 0, modeledCost: 0, annualizedCost: 0, topFourShare: 0 },
      targetMpg, idleThreshold, oorThreshold: percentile(raw.map((driver) => driver.oorPct).filter(isFiniteNumber), .5),
      movingThreshold: 0, currentDate,
    };
  }

  function workbookRows(workbook, sheetIndex) {
    if (!workbook?.SheetNames?.length) return [];
    const sheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true });
  }

  function workbookRowsByName(workbook, names) {
    if (!workbook?.SheetNames?.length) return [];
    const wanted = names.map((name) => normalizeHeader(name));
    const sheetName = workbook.SheetNames.find((name) => wanted.includes(normalizeHeader(name)))
      || workbook.SheetNames.find((name) => wanted.some((candidate) => normalizeHeader(name).includes(candidate)))
      || workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true });
  }

  function analyzeSummary(rows) {
    const completed = [];
    const allDated = [];
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index] || [];
      const date = parseDate(row[0]);
      const compliance = number(row[12]);
      if (!date || compliance === null) continue;
      const item = {
        row: index + 1,
        date,
        marker: String(row[1] ?? "").trim(),
        recommendations: number(row[11]) || 0,
        followed: number(row[10]) || 0,
        compliance,
        reopt: number(row[13]) || 0,
        acall: number(row[14]) || 0,
      };
      allDated.push(item);
      if (item.marker === "*") completed.push(item);
    }
    completed.sort((a, b) => a.date - b.date);
    if (!completed.length) throw new Error("No completed reporting week was found in the summary workbook.");
    const latest = completed.at(-1);
    const previous = completed.at(-2) || null;
    const partialRows = allDated.filter((item) => item.date > latest.date || item.marker !== "*");
    return { completed, latest, previous, partialRows };
  }

  function analyzeDrivers(rows, latestWeek, planningPpg, pdfRecords = []) {
    if (!rows.length) throw new Error("The c1 driver workbook is empty.");
    const header = rows[0] || [];
    const dateColumns = [];
    for (let column = 7; column < header.length; column += 1) {
      const date = parseHeaderDate(header[column], latestWeek.getFullYear());
      if (date && date <= endOfDay(latestWeek)) dateColumns.push({ column, date });
    }
    dateColumns.sort((a, b) => b.date - a.date);
    if (!dateColumns.length) throw new Error("No usable date column was found in c1.xlsx/xlsm.");
    const currentColumn = dateColumns[0].column;

    const starts = [];
    let currentLeader = "Unassigned";
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      if (text(row[0])) currentLeader = cleanLeader(text(row[0]));
      if (text(row[2])) {
        starts.push({
          rowIndex,
          driverLeader: currentLeader,
          driverCode: text(row[1]),
          driverName: text(row[2]),
          fleetLeader: text(row[3]),
          managerMatch: text(row[4]),
        });
      }
    }
    if (!starts.length) throw new Error("No driver blocks were found in c1.xlsx/xlsm.");

    const rawDrivers = starts.map((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1].rowIndex : rows.length;
      const metrics = new Map();
      for (let rowIndex = start.rowIndex; rowIndex < end; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const metric = text(row[6]);
        const current = number(row[currentColumn]);
        if (metric && current !== null) metrics.set(metric, { row, rowIndex });
      }
      const metricValue = (name) => metrics.has(name) ? number(metrics.get(name).row[currentColumn]) : null;
      const priorValue = (name) => {
        const metric = metrics.get(name);
        if (!metric) return null;
        for (let column = currentColumn - 1; column >= 7; column -= 1) {
          const value = number(metric.row[column]);
          if (value !== null) return value;
        }
        return null;
      };
      const metricValueAny = (patterns) => {
        for (const [metricName, metric] of metrics.entries()) {
          if (patterns.some((pattern) => pattern.test(metricName))) {
            const value = number(metric.row[currentColumn]);
            if (value !== null) return value;
          }
        }
        return null;
      };
      const dailyIdlePct = metricValueAny([/^daily\s+(?:engine\s+)?idle\s*%$/i, /^today(?:'s)?\s+(?:engine\s+)?idle\s*%$/i]);
      const idle7DayPct = metricValueAny([/(?:rolling\s*)?7\s*day.*idle\s*%/i, /idle\s*%.*(?:rolling\s*)?7\s*day/i]);
      const idle28DayPct = metricValue("Rolling 4 Week Idle %")
        ?? metricValueAny([/(?:rolling\s*)?28\s*day.*idle\s*%/i, /idle\s*%.*(?:rolling\s*)?28\s*day/i]);
      return {
        ...start,
        dispatchMiles: metricValue("Rolling 28 Day Dispatch Miles"),
        drivingFuel: metricValue("Rolling 28 day Driving Fuel"),
        fuelGallons: metricValue("Rolling 28 day Fuel Gallons"),
        qualcommMiles: metricValue("Rolling 28 day Qualcomm Miles"),
        dispatchMpg: metricValue("Rolling 4 Week Dispatch MPG"),
        dailyIdlePct,
        idle7DayPct,
        idle28DayPct,
        idlePct: idle28DayPct,
        movingMpg: metricValue("Rolling 4 Week Moving MPG"),
        oorPct: metricValue("Rolling 4 Week OOR"),
        priorDispatchMpg: priorValue("Rolling 4 Week Dispatch MPG"),
        priorIdlePct: priorValue("Rolling 4 Week Idle %"),
        priorOorPct: priorValue("Rolling 4 Week OOR"),
        electricApuHours: metricValueAny([/electric\s*apu.*hours?/i, /apu.*run(?:time)?\s*hours?/i]),
        engineIdleHours: metricValueAny([/engine.*idle.*hours?/i, /tractor.*idle.*hours?/i]),
        apuUsePct: metricValueAny([/apu.*(?:use|usage|utilization).*%?/i]),
        apuBatterySoc: metricValueAny([/apu.*battery/i, /battery.*(?:soc|state of charge|charge)/i]),
        apuFaults: metricValueAny([/apu.*fault/i, /apu.*alert/i]),
      };
    }).filter((driver) => [driver.dispatchMiles, driver.fuelGallons, driver.dispatchMpg].every((value) => value !== null));

    const targetMpg = percentile(rawDrivers.map((driver) => driver.dispatchMpg).filter(isFiniteNumber), 0.75);
    const idleThreshold = percentile(rawDrivers.map((driver) => driver.idlePct).filter(isFiniteNumber), 0.5);
    const oorThreshold = percentile(rawDrivers.map((driver) => driver.oorPct).filter(isFiniteNumber), 0.5);
    const movingThreshold = percentile(rawDrivers.map((driver) => driver.movingMpg).filter(isFiniteNumber), 0.5);

    let records = rawDrivers.map((driver) => {
      const excessGallons = Math.max(0, driver.fuelGallons - (driver.dispatchMiles / targetMpg));
      const estimatedCost = excessGallons * planningPpg;
      const annualizedCost = estimatedCost * 13;
      const highIdle = driver.idlePct !== null && driver.idlePct > idleThreshold;
      const highOor = driver.oorPct !== null && driver.oorPct > oorThreshold;
      const lowMoving = driver.movingMpg !== null && driver.movingMpg < movingThreshold;
      const reasons = [];
      if (highIdle) reasons.push("High idle");
      if (highOor) reasons.push("High OOR");
      if (lowMoving) reasons.push("Low moving MPG");
      if (!reasons.length) reasons.push("Overall MPG gap");
      const flags = [highIdle, highOor, lowMoving].filter(Boolean).length;
      return {
        ...driver,
        mpgChange: driver.priorDispatchMpg === null ? null : driver.dispatchMpg - driver.priorDispatchMpg,
        excessGallons,
        estimatedCost,
        annualizedCost,
        likelyDriver: reasons.join(", "),
        priority: estimatedCost >= 400 ? "High" : estimatedCost >= 150 ? "Medium" : "Monitor",
        reviewLabel: estimatedCost >= 400 ? "Talk first" : estimatedCost >= 150 ? "Review" : "Watch",
        confidence: estimatedCost >= 400 && flags >= 2 ? "Medium-High" : estimatedCost >= 150 || flags >= 2 ? "Medium" : "Low-Medium",
        focus: buildDriverFocus(driver, highIdle, highOor, lowMoving),
        action: buildDriverAction(highIdle, highOor, lowMoving),
      };
    }).sort((a, b) => b.estimatedCost - a.estimatedCost);

    records = mergePdfDriverRecords(records, pdfRecords);

    const totals = {
      excessGallons: sum(records.map((item) => item.excessGallons)),
      modeledCost: sum(records.map((item) => item.estimatedCost)),
      annualizedCost: sum(records.map((item) => item.annualizedCost)),
      topFourShare: 0,
    };
    totals.topFourShare = totals.modeledCost ? sum(records.slice(0, 4).map((item) => item.estimatedCost)) / totals.modeledCost : 0;

    return { records, totals, targetMpg, idleThreshold, oorThreshold, movingThreshold, currentDate: dateColumns[0].date };
  }

  function buildDriverFocus(driver, highIdle, highOor, lowMoving) {
    const focus = [];
    if (highIdle) focus.push(`Engine idle is high at ${pct(driver.idlePct, 1)}`);
    if (highOor) focus.push(`Out-of-route miles are high at ${pct(driver.oorPct, 1)}`);
    if (lowMoving) focus.push(`MPG while moving is low at ${num(driver.movingMpg, 2)}`);
    if (!focus.length) focus.push(`Overall fuel MPG is below the strong-peer target at ${num(driver.dispatchMpg, 2)}`);
    return focus.join(" · ");
  }

  async function extractPdfTextLines(buffer) {
    const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const lines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const rows = new Map();
      content.items.forEach((item) => {
        const y = Math.round(item.transform?.[5] || 0);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: item.transform?.[4] || 0, text: item.str || "" });
      });
      [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
        const line = items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
      });
    }
    return lines;
  }

  function parseBasicDriverPdfLines(lines) {
    const records = [];
    let current = null;
    const commit = () => {
      if (current?.driverName || current?.driverCode || current?.unit) records.push(current);
      current = null;
    };
    const percentFrom = (value) => {
      const parsed = number(value);
      return parsed === null ? null : parsed > 1 ? parsed / 100 : parsed;
    };
    const read = (line, patterns) => {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) return match[1]?.trim() || "";
      }
      return "";
    };

    lines.forEach((line) => {
      const driver = read(line, [
        /\bdriver(?:\s+name)?\s*[:#-]\s*([A-Z][A-Z .,'-]+?)(?=\s{2,}|\s+(?:driver\s*(?:id|code)|unit|truck|daily|today|7\s*day|28\s*day|fuel\s*cost)\b|$)/i,
      ]);
      if (driver) {
        if (current && normalizeIdentity(current.driverName) !== normalizeIdentity(driver)) commit();
        current ||= {};
        current.driverName = driver;
      }
      const hasMetrics = /\b(?:idle|fuel\s*cost|driver\s*(?:id|code)|unit|truck)\b/i.test(line);
      if (!current && hasMetrics) current = {};
      if (!current) return;

      current.driverCode ||= read(line, [/\bdriver\s*(?:id|code|#)\s*[:#-]\s*([A-Z0-9-]+)/i]);
      current.unit ||= read(line, [/\b(?:unit|truck|tractor)\s*(?:#|number)?\s*[:#-]\s*([A-Z0-9-]+)/i]);
      const daily = read(line, [/\b(?:daily|today(?:'s)?)\s+(?:engine\s+)?idle(?:\s*%)?\s*[:=-]?\s*([\d.]+\s*%?)/i]);
      const seven = read(line, [/\b(?:rolling\s*)?7[\s-]*day\s+(?:average\s+)?(?:engine\s+)?idle(?:\s*%)?\s*[:=-]?\s*([\d.]+\s*%?)/i]);
      const twentyEight = read(line, [/\b(?:rolling\s*)?28[\s-]*day\s+(?:average\s+)?(?:engine\s+)?idle(?:\s*%)?\s*[:=-]?\s*([\d.]+\s*%?)/i, /\b4[\s-]*week\s+(?:average\s+)?(?:engine\s+)?idle(?:\s*%)?\s*[:=-]?\s*([\d.]+\s*%?)/i]);
      const cost = read(line, [/\b(?:high\s+)?fuel\s+(?:cost|impact|savings)\s*[:=$-]?\s*(\$?[\d,.]+)/i]);
      const mpg = read(line, [/\b(?:fuel|dispatch)\s*mpg\s*[:=-]?\s*([\d.]+)/i]);
      if (daily) current.dailyIdlePct = percentFrom(daily);
      if (seven) current.idle7DayPct = percentFrom(seven);
      if (twentyEight) current.idle28DayPct = percentFrom(twentyEight);
      if (cost) current.fuelCost = number(cost);
      if (mpg) current.dispatchMpg = number(mpg);
      current.source = "PDF";
    });
    commit();
    return records.filter((record) => record.driverName || record.driverCode || record.unit);
  }

  function mergePdfDriverRecords(records, pdfRecords) {
    if (!pdfRecords.length) return records;
    const byIdentity = new Map();
    records.forEach((driver) => {
      [driver.driverCode, driver.driverName].filter(Boolean).forEach((value) => byIdentity.set(normalizeIdentity(value), driver));
    });
    pdfRecords.forEach((pdfRecord) => {
      const driver = byIdentity.get(normalizeIdentity(pdfRecord.driverCode))
        || byIdentity.get(normalizeIdentity(pdfRecord.driverName));
      if (!driver) return;
      ["dailyIdlePct", "idle7DayPct", "idle28DayPct"].forEach((field) => {
        if (pdfRecord[field] !== null && pdfRecord[field] !== undefined) driver[field] = pdfRecord[field];
      });
      if (pdfRecord.idle28DayPct !== null && pdfRecord.idle28DayPct !== undefined) driver.idlePct = pdfRecord.idle28DayPct;
      if (pdfRecord.fuelCost !== null && pdfRecord.fuelCost !== undefined) {
        driver.pdfFuelCost = pdfRecord.fuelCost;
        driver.estimatedCost = pdfRecord.fuelCost;
      }
      driver.pdfSupplemented = true;
    });
    return records.sort((a, b) => b.estimatedCost - a.estimatedCost);
  }

  function analyzePdfDrivers(pdfRecords, latestWeek, planningPpg) {
    if (!pdfRecords.length) throw new Error("No c1 workbook or readable basic driver PDF was found.");
    const records = pdfRecords.map((record) => {
      const estimatedCost = record.fuelCost || 0;
      const idle28DayPct = record.idle28DayPct ?? null;
      return {
        driverLeader: "Not reported", driverCode: record.driverCode || "", driverName: record.driverName || record.unit || "Unknown driver",
        managerMatch: "", dispatchMiles: null, drivingFuel: null, fuelGallons: null, qualcommMiles: null,
        dispatchMpg: record.dispatchMpg ?? null, dailyIdlePct: record.dailyIdlePct ?? null,
        idle7DayPct: record.idle7DayPct ?? null, idle28DayPct, idlePct: idle28DayPct,
        movingMpg: null, oorPct: null, priorDispatchMpg: null, priorIdlePct: null, priorOorPct: null,
        excessGallons: 0, estimatedCost, annualizedCost: estimatedCost * 13, mpgChange: null,
        likelyDriver: "Basic PDF report", priority: estimatedCost >= 400 ? "High" : estimatedCost >= 150 ? "Medium" : "Monitor",
        reviewLabel: estimatedCost >= 400 ? "Talk first" : estimatedCost >= 150 ? "Review" : "Watch",
        confidence: "Basic PDF", focus: `PDF report: daily idle ${pct(record.dailyIdlePct, 1)}, 7-day ${pct(record.idle7DayPct, 1)}, 28-day ${pct(idle28DayPct, 1)}`,
        action: "Review the PDF values and add a follow-up note for the next shift.", pdfSupplemented: true,
      };
    }).sort((a, b) => b.estimatedCost - a.estimatedCost);
    const totals = {
      excessGallons: 0,
      modeledCost: sum(records.map((item) => item.estimatedCost)),
      annualizedCost: sum(records.map((item) => item.annualizedCost)),
      topFourShare: 0,
    };
    totals.topFourShare = totals.modeledCost ? sum(records.slice(0, 4).map((item) => item.estimatedCost)) / totals.modeledCost : 0;
    return { records, totals, targetMpg: 0, idleThreshold: percentile(records.map((r) => r.idlePct).filter(isFiniteNumber), .5), oorThreshold: 0, movingThreshold: 0, currentDate: latestWeek, planningPpg };
  }

  function buildDriverAction(highIdle, highOor, lowMoving) {
    if (highIdle && highOor && !lowMoving) return "Check which idle was necessary, then review route changes and extra miles. The truck's moving MPG looks acceptable.";
    if (highIdle && highOor) return "Review idle events, route changes, tractor condition, weather, load, and delays before coaching the driver.";
    if (highOor && lowMoving) return "Check route assignment and extra miles, then compare the tractor, terrain, load, speed, and maintenance condition.";
    if (highIdle && lowMoving) return "Separate necessary idle from avoidable idle and inspect the tractor because fuel use is also weak while moving.";
    if (highOor) return "Confirm detours, dispatch changes, and route practicality before treating the extra miles as driver-controlled.";
    if (highIdle) return "Review idle events and weather. Target only the avoidable engine idle, especially where an electric APU was available.";
    if (lowMoving) return "Compare tractor condition, route, load, governed speed, tires, alignment, and maintenance history.";
    return "Confirm the tractor assignment, route mix, and source records before taking action.";
  }

  function analyzeApu(rows, drivers, file) {
    const embedded = drivers.records
      .filter((driver) => [driver.electricApuHours, driver.engineIdleHours, driver.apuUsePct, driver.apuBatterySoc, driver.apuFaults].some((value) => value !== null && value !== undefined))
      .map((driver) => ({
        source: "c1 driver report",
        date: drivers.currentDate,
        driverCode: driver.driverCode,
        driverName: driver.driverName,
        unit: "",
        apuHours: driver.electricApuHours,
        engineIdleHours: driver.engineIdleHours,
        apuUsePct: normalizePercent(driver.apuUsePct),
        batterySoc: normalizePercent(driver.apuBatterySoc),
        faultCount: number(driver.apuFaults) || 0,
        faultText: number(driver.apuFaults) ? `${number(driver.apuFaults)} reported` : "",
        available: true,
        notes: "",
      }));

    let external = [];
    let parserNote = "";
    if (rows?.length) {
      const headerRowIndex = findApuHeaderRow(rows);
      if (headerRowIndex < 0) {
        parserNote = "An APU workbook was found, but its column headings were not recognized.";
      } else {
        const headers = rows[headerRowIndex] || [];
        const columns = {
          date: findHeaderIndex(headers, ["week end", "week ending", "report date", "date"]),
          driverCode: findHeaderIndex(headers, ["driver code", "driver id", "employee code", "employee id"]),
          driverName: findHeaderIndex(headers, ["driver name", "operator name", "driver"]),
          unit: findHeaderIndex(headers, ["unit number", "unit #", "unit", "tractor number", "tractor", "truck number", "truck"]),
          apuHours: findHeaderIndex(headers, ["electric apu hours", "apu runtime hours", "apu run hours", "apu hours", "apu runtime"]),
          engineIdleHours: findHeaderIndex(headers, ["engine idle hours", "tractor idle hours", "idle hours"]),
          apuUsePct: findHeaderIndex(headers, ["apu utilization %", "apu usage %", "apu use %", "apu utilization", "apu usage", "apu use"]),
          batterySoc: findHeaderIndex(headers, ["battery state of charge", "battery soc %", "battery soc", "state of charge", "battery charge %", "battery charge", "battery %"]),
          faults: findHeaderIndex(headers, ["apu fault count", "apu faults", "fault count", "faults", "apu alerts", "alerts"]),
          available: findHeaderIndex(headers, ["apu available", "apu installed", "electric apu available", "electric apu"]),
          notes: findHeaderIndex(headers, ["notes", "comment", "comments", "status note"]),
        };
        const usefulColumns = [columns.driverCode, columns.driverName, columns.unit, columns.apuHours, columns.engineIdleHours, columns.apuUsePct, columns.batterySoc, columns.faults].filter((index) => index >= 0);
        if (!usefulColumns.length) {
          parserNote = "An APU workbook was found, but none of the useful APU columns were recognized.";
        } else {
          for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex] || [];
            const read = (index) => index >= 0 ? row[index] : null;
            const driverCode = text(read(columns.driverCode));
            const driverName = text(read(columns.driverName));
            const unit = text(read(columns.unit));
            const apuHours = number(read(columns.apuHours));
            const engineIdleHours = number(read(columns.engineIdleHours));
            const apuUsePct = normalizePercent(read(columns.apuUsePct));
            const batterySoc = normalizePercent(read(columns.batterySoc));
            const faultRaw = read(columns.faults);
            const faultNumber = number(faultRaw);
            const faultText = text(faultRaw);
            const faultCount = faultNumber !== null ? Math.max(0, faultNumber) : faultText && !/^(none|no|ok|clear|0)$/i.test(faultText) ? 1 : 0;
            const availableRaw = text(read(columns.available));
            const available = availableRaw ? !/^(no|false|n|0|not installed)$/i.test(availableRaw) : apuHours !== null || apuUsePct !== null;
            const notes = text(read(columns.notes));
            if (![driverCode, driverName, unit, notes].some(Boolean) && [apuHours, engineIdleHours, apuUsePct, batterySoc].every((value) => value === null) && !faultCount) continue;
            external.push({
              source: file?.name || "APU workbook",
              date: parseDate(read(columns.date)),
              driverCode,
              driverName,
              unit,
              apuHours,
              engineIdleHours,
              apuUsePct,
              batterySoc,
              faultCount,
              faultText,
              available,
              notes,
            });
          }
        }
      }
    }

    if (external.length) {
      external.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
      const latestByIdentity = new Map();
      for (const record of external) {
        const key = normalizeIdentity(record.driverCode || record.driverName || record.unit || `${record.source}-${latestByIdentity.size}`);
        if (!latestByIdentity.has(key)) latestByIdentity.set(key, record);
      }
      external = [...latestByIdentity.values()];
    }

    const records = external.length ? external : embedded;
    const driverByCode = new Map(drivers.records.filter((driver) => driver.driverCode).map((driver) => [normalizeIdentity(driver.driverCode), driver]));
    const driverByName = new Map(drivers.records.filter((driver) => driver.driverName).map((driver) => [normalizeIdentity(driver.driverName), driver]));

    for (const record of records) {
      const linkedDriver = driverByCode.get(normalizeIdentity(record.driverCode)) || driverByName.get(normalizeIdentity(record.driverName)) || null;
      record.linkedDriver = linkedDriver;
      if (linkedDriver) {
        record.driverCode ||= linkedDriver.driverCode;
        record.driverName ||= linkedDriver.driverName;
      }
      const driverIdlePct = linkedDriver?.idlePct ?? null;
      const highDriverIdle = driverIdlePct !== null && driverIdlePct > drivers.idleThreshold;
      const usePct = record.apuUsePct !== null && record.apuUsePct !== undefined
        ? record.apuUsePct
        : record.apuHours !== null && record.engineIdleHours !== null && (record.apuHours + record.engineIdleHours) > 0
          ? record.apuHours / (record.apuHours + record.engineIdleHours)
          : null;
      record.calculatedUsePct = usePct;
      const hasFault = record.faultCount > 0;
      const lowBattery = record.batterySoc !== null && record.batterySoc < 0.25;
      const lowUse = usePct !== null ? usePct < 0.35 : record.apuHours !== null ? record.apuHours <= 0.25 : false;

      if (hasFault || lowBattery) {
        record.status = "Check equipment";
        record.statusKey = "check-equipment";
        record.plainNote = hasFault
          ? "The APU has a fault or alert. Check equipment before treating engine idle as a driver behavior problem."
          : "Battery charge is low. Confirm the APU can support normal cab comfort before coaching idle.";
      } else if (highDriverIdle && (lowUse || record.available === false)) {
        record.status = "Use APU more";
        record.statusKey = "use-apu-more";
        record.plainNote = "Engine idle is high while electric APU use appears low. First confirm the APU was available, charged, and working.";
      } else if (highDriverIdle) {
        record.status = "Review idle";
        record.statusKey = "review-idle";
        record.plainNote = "The driver is using the APU, but engine idle is still high. Review weather, delays, battery limits, and necessary idle events.";
      } else if ((record.apuHours || 0) > 0 || (usePct !== null && usePct >= 0.35)) {
        record.status = "Working well";
        record.statusKey = "working-well";
        record.plainNote = "Electric APU use is present and driver engine idle is not above the fleet review level.";
      } else {
        record.status = "No recent use";
        record.statusKey = "no-recent-use";
        record.plainNote = "No meaningful APU use was reported. Confirm whether the unit has an APU and whether this period required it.";
      }
    }

    const order = { "check-equipment": 0, "use-apu-more": 1, "review-idle": 2, "no-recent-use": 3, "working-well": 4 };
    records.sort((a, b) => (order[a.statusKey] ?? 9) - (order[b.statusKey] ?? 9) || (b.linkedDriver?.idlePct || 0) - (a.linkedDriver?.idlePct || 0));

    const byDriver = new Map();
    for (const record of records) {
      if (record.driverCode) byDriver.set(`code:${normalizeIdentity(record.driverCode)}`, record);
      if (record.driverName) byDriver.set(`name:${normalizeIdentity(record.driverName)}`, record);
    }
    const summary = {
      records: records.length,
      matchedDrivers: records.filter((record) => record.linkedDriver).length,
      needsEquipment: records.filter((record) => record.statusKey === "check-equipment").length,
      useMore: records.filter((record) => record.statusKey === "use-apu-more").length,
      workingWell: records.filter((record) => record.statusKey === "working-well").length,
    };
    return { records, byDriver, summary, hasData: records.length > 0, parserNote, sourceName: file?.name || (embedded.length ? "c1 driver report" : "No APU source") };
  }


  function analyzePta(trackerWorkbook, finderWorkbook, files, manualRows = null) {
    const now = new Date();
    let soonWindowHours = 48;
    let trackerRecords = [];
    let availableSoon = [];
    let dispatchedSoon = [];
    let sourceNames = {
      tracker: files.ptaTracker?.name || "Not found",
      finder: files.ptaFinder?.name || "Not found",
    };

    if (manualRows?.length) {
      const sourceName = "Manual PTA paste";
      trackerRecords = parsePtaTrackerRows(manualRows, now, sourceName);
      const cutoff = now.getTime() + (soonWindowHours * 3600000);
      const finderEligible = (record) => record.pta
        && record.pta.getTime() <= cutoff
        && /no preplan/i.test(record.planStatus);

      availableSoon = trackerRecords
        .filter((record) => finderEligible(record) && /^available$/i.test(record.status))
        .map((record) => cloneManualFinderRecord(record, "available", sourceName));

      dispatchedSoon = trackerRecords
        .filter((record) => finderEligible(record) && /^(dispatched|loaded)$/i.test(record.status))
        .map((record) => cloneManualFinderRecord(record, "dispatched", sourceName));

      sourceNames = { tracker: sourceName, finder: `${sourceName} · derived queues` };
    } else {
      const trackerRows = trackerWorkbook ? workbookRowsByName(trackerWorkbook, ["PTA Tracker"]) : [];
      const availableRows = finderWorkbook ? workbookRowsByName(finderWorkbook, ["Available"]) : [];
      const dispatchedRows = finderWorkbook ? workbookRowsByName(finderWorkbook, ["Dispatched"]) : [];
      const settingsRows = finderWorkbook ? workbookRowsByName(finderWorkbook, ["Settings"]) : [];

      trackerRecords = parsePtaTrackerRows(trackerRows, now, files.ptaTracker?.name || "PTA Dispatch Tracker");
      availableSoon = parsePtaFinderRows(availableRows, now, "available", files.ptaFinder?.name || "Fleet PTA Finder");
      dispatchedSoon = parsePtaFinderRows(dispatchedRows, now, "dispatched", files.ptaFinder?.name || "Fleet PTA Finder");

      for (const row of settingsRows.slice(0, 15)) {
        if (/soon window/i.test(text(row?.[0]))) soonWindowHours = number(row?.[1]) || soonWindowHours;
      }
    }

    const overdue = trackerRecords.filter((record) => record.overdueHours > 0)
      .sort((a, b) => b.overdueHours - a.overdueHours);
    const overdueNoPreplan = overdue.filter((record) => /no preplan/i.test(record.planStatus));
    const critical = overdue.filter((record) => record.overdueHours >= 24);
    const high = overdue.filter((record) => record.overdueHours >= 8 && record.overdueHours < 24);

    const actionQueue = dedupePtaRecords([
      ...overdue,
      ...availableSoon,
      ...dispatchedSoon,
    ]).sort(comparePtaPriority);

    const allRecords = [...trackerRecords, ...availableSoon, ...dispatchedSoon];
    allRecords.forEach((record, index) => { record.index = index; });

    const byDriver = new Map();
    allRecords.forEach((record) => {
      const key = normalizeIdentity(record.driver);
      if (!key) return;
      const existing = byDriver.get(key);
      if (!existing || comparePtaPriority(record, existing) < 0) byDriver.set(key, record);
    });

    return {
      hasData: allRecords.length > 0,
      trackerRecords,
      overdue,
      overdueNoPreplan,
      availableSoon,
      dispatchedSoon,
      actionQueue,
      allRecords,
      byDriver,
      now,
      soonWindowHours,
      summary: {
        trackerRows: trackerRecords.length,
        overdue: overdue.length,
        critical: critical.length,
        high: high.length,
        overdueNoPreplan: overdueNoPreplan.length,
        availableSoon: availableSoon.length,
        dispatchedSoon: dispatchedSoon.length,
        actionCount: actionQueue.filter((record) => record.needsAction).length,
      },
      sourceNames,
      manualPaste: Boolean(manualRows?.length),
    };
  }

  function cloneManualFinderRecord(record, queueType, sourceName) {
    const clone = {
      ...record,
      sourceType: queueType,
      sourceName,
      notes: record.notes || "",
    };
    decoratePtaRecord(clone, true);
    return clone;
  }

  function activeManualPtaRows() {
    if (!state.manualPta.active || !state.manualPta.text.trim()) return null;
    try {
      const rows = normalizePtaPasteRows(state.manualPta.text);
      state.manualPta.rowCount = Math.max(0, rows.length - 1);
      state.manualPta.error = "";
      return rows;
    } catch (error) {
      state.manualPta.error = error.message || "The saved PTA paste could not be read.";
      state.manualPta.rowCount = 0;
      return null;
    }
  }

  function normalizePtaPasteRows(rawText) {
    const parsed = parseDelimitedText(rawText)
      .map((row) => row.map((cell) => typeof cell === "string" ? cell.trim() : cell))
      .filter((row) => row.some((cell) => text(cell)));

    if (!parsed.length) throw new Error("Paste at least one PTA row.");

    const headerRowIndex = findHeaderRowIndex(parsed.slice(0, 12), ["truck", "driver", "pta", "status"]);
    let headers;
    let dataRows;

    if (headerRowIndex >= 0) {
      headers = parsed[headerRowIndex] || [];
      dataRows = parsed.slice(headerRowIndex + 1);
    } else {
      headers = PTA_PASTE_HEADERS;
      dataRows = parsed;
    }

    const columns = {
      truck: findHeaderIndex(headers, ["truck #", "truck", "unit", "tractor"]),
      division: findHeaderIndex(headers, ["div #", "division", "div"]),
      driver: findHeaderIndex(headers, ["driver", "driver name"]),
      pta: findHeaderIndex(headers, ["pta", "projected time available"]),
      status: findHeaderIndex(headers, ["status"]),
      plans: findHeaderIndex(headers, ["plans", "preplan", "plan status"]),
      plan: findHeaderIndex(headers, ["plan", "plan type", "flag"]),
      team: findHeaderIndex(headers, ["team", "driver type", "type"]),
      destination: findHeaderIndex(headers, ["destination", "area"]),
      om: findHeaderIndex(headers, ["om", "miles"]),
      count: findHeaderIndex(headers, ["count"]),
    };

    if (headerRowIndex < 0) {
      Object.keys(columns).forEach((key, index) => { columns[key] = index; });
    }

    const missing = ["truck", "driver", "pta", "status"].filter((key) => columns[key] < 0);
    if (missing.length) throw new Error(`The paste is missing required columns: ${missing.join(", ")}.`);

    const normalizedRows = dataRows.map((row) => [
      columns.truck >= 0 ? row[columns.truck] : "",
      columns.division >= 0 ? row[columns.division] : "",
      columns.driver >= 0 ? row[columns.driver] : "",
      columns.pta >= 0 ? coercePtaPasteValue(row[columns.pta]) : "",
      columns.status >= 0 ? row[columns.status] : "",
      columns.plans >= 0 ? row[columns.plans] : "",
      columns.plan >= 0 ? row[columns.plan] : "",
      columns.team >= 0 ? row[columns.team] : "",
      columns.destination >= 0 ? row[columns.destination] : "",
      columns.om >= 0 ? row[columns.om] : "",
      columns.count >= 0 ? row[columns.count] : "",
    ]).filter((row) => text(row[0]) || text(row[2]) || text(row[3]));

    if (!normalizedRows.length) throw new Error("No PTA data rows were found under the headers.");

    const invalidPta = normalizedRows.filter((row) => text(row[3]) && !parseDateTime(row[3])).length;
    if (invalidPta === normalizedRows.length) {
      throw new Error("None of the PTA values could be read as a date and time.");
    }

    return [PTA_PASTE_HEADERS, ...normalizedRows];
  }

  function coercePtaPasteValue(value) {
    const numeric = number(value);
    if (numeric !== null && numeric > 20000 && numeric < 80000) return numeric;
    return value;
  }

  function parseDelimitedText(rawText) {
    const source = String(rawText || "").replace(/\r\n?/g, "\n");
    if (!source.trim()) return [];
    const firstMeaningfulLine = source.split("\n").find((line) => line.trim()) || "";
    const delimiter = firstMeaningfulLine.includes("\t")
      ? "\t"
      : firstMeaningfulLine.includes(",")
        ? ","
        : firstMeaningfulLine.includes("|")
          ? "|"
          : "\t";

    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }

  async function applyManualPtaPaste() {
    try {
      const rawText = els.ptaPasteInput.value;
      const rows = normalizePtaPasteRows(rawText);
      state.manualPta.active = true;
      state.manualPta.text = rawText;
      state.manualPta.savedAt = Date.now();
      state.manualPta.rowCount = rows.length - 1;
      state.manualPta.error = "";
      localStorage.setItem(PTA_PASTE_KEYS.active, "true");
      localStorage.setItem(PTA_PASTE_KEYS.text, rawText);
      localStorage.setItem(PTA_PASTE_KEYS.savedAt, String(state.manualPta.savedAt));
      updatePtaPasteUi();
      await refreshData(true);
      showToast(`${formatCount(state.manualPta.rowCount)} PTA rows loaded from the manual paste.`);
    } catch (error) {
      state.manualPta.error = error.message || "The pasted PTA data could not be read.";
      updatePtaPasteUi();
      showToast(state.manualPta.error, true);
    }
  }

  async function clearManualPtaPaste() {
    state.manualPta.active = false;
    state.manualPta.text = "";
    state.manualPta.savedAt = null;
    state.manualPta.rowCount = 0;
    state.manualPta.error = "";
    localStorage.removeItem(PTA_PASTE_KEYS.active);
    localStorage.removeItem(PTA_PASTE_KEYS.text);
    localStorage.removeItem(PTA_PASTE_KEYS.savedAt);
    els.ptaPasteInput.value = "";
    updatePtaPasteUi();
    await refreshData(true);
    showToast("PTA source switched back to the workbook files.");
  }

  async function copyPtaHeader() {
    const header = PTA_PASTE_HEADERS.join("\t");
    try {
      await navigator.clipboard.writeText(header);
      showToast("PTA header copied.");
    } catch (_) {
      els.ptaPasteInput.value = `${header}\n${els.ptaPasteInput.value}`;
      els.ptaPasteInput.focus();
      showToast("Header added to the paste box.");
    }
  }

  function updatePtaPasteUi() {
    if (!els.ptaPasteStatus || !els.ptaPasteMessage) return;
    els.ptaPasteStatus.classList.toggle("active", state.manualPta.active && !state.manualPta.error);
    els.ptaPasteStatus.classList.toggle("error", Boolean(state.manualPta.error));

    if (state.manualPta.error) {
      els.ptaPasteStatus.textContent = "Paste needs attention";
      els.ptaPasteMessage.textContent = state.manualPta.error;
      els.ptaPasteMessage.className = "pta-paste-message error";
      return;
    }

    if (state.manualPta.active) {
      const saved = state.manualPta.savedAt ? new Date(state.manualPta.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "this browser";
      els.ptaPasteStatus.textContent = `Manual paste active · ${formatCount(state.manualPta.rowCount)} rows`;
      els.ptaPasteMessage.textContent = `Using pasted data saved ${saved}. Both PTA queues are rebuilt from this one source.`;
      els.ptaPasteMessage.className = "pta-paste-message success";
      return;
    }

    els.ptaPasteStatus.textContent = "Using PTA workbook files";
    els.ptaPasteMessage.textContent = "Pasted data is stored only in this browser.";
    els.ptaPasteMessage.className = "pta-paste-message";
  }

  function parsePtaTrackerRows(rows, now, sourceName) {
    if (!rows.length) return [];
    const headerRowIndex = findHeaderRowIndex(rows, ["truck", "driver", "pta", "status"]);
    if (headerRowIndex < 0) return [];
    const headers = rows[headerRowIndex] || [];
    const columns = {
      truck: findHeaderIndex(headers, ["truck #", "truck", "unit", "tractor"]),
      division: findHeaderIndex(headers, ["div #", "division", "div"]),
      driver: findHeaderIndex(headers, ["driver", "driver name"]),
      pta: findHeaderIndex(headers, ["pta", "projected time available"]),
      status: findHeaderIndex(headers, ["status"]),
      plans: findHeaderIndex(headers, ["plans", "preplan", "plan status"]),
      plan: findHeaderIndex(headers, ["plan", "plan type"]),
      team: findHeaderIndex(headers, ["team", "driver type"]),
      destination: findHeaderIndex(headers, ["destination", "area"]),
      om: findHeaderIndex(headers, ["om"]),
      count: findHeaderIndex(headers, ["count"]),
      notes: findHeaderIndex(headers, ["notes", "dispatch notes"]),
    };

    return rows.slice(headerRowIndex + 1).map((row, offset) => {
      const read = (column) => column >= 0 ? row?.[column] : null;
      const truck = text(read(columns.truck));
      const driver = text(read(columns.driver));
      const pta = parseDateTime(read(columns.pta));
      if (!truck && !driver && !pta) return null;
      const overdueHours = pta ? (now.getTime() - pta.getTime()) / 3600000 : 0;
      const planStatus = text(read(columns.plans)) || "Unknown";
      const record = {
        sourceType: "tracker",
        sourceName,
        sourceRow: headerRowIndex + offset + 2,
        truck,
        division: text(read(columns.division)),
        driver,
        pta,
        status: text(read(columns.status)),
        planStatus,
        plan: text(read(columns.plan)),
        team: text(read(columns.team)),
        destination: text(read(columns.destination)),
        om: number(read(columns.om)),
        count: number(read(columns.count)),
        notes: text(read(columns.notes)),
        overdueHours,
      };
      decoratePtaRecord(record);
      return record;
    }).filter(Boolean);
  }

  function parsePtaFinderRows(rows, now, queueType, sourceName) {
    if (!rows.length) return [];
    const headerRowIndex = findHeaderRowIndex(rows, ["truck", "driver", "pta", "preplan"]);
    if (headerRowIndex < 0) return [];
    const headers = rows[headerRowIndex] || [];
    const columns = {
      truck: findHeaderIndex(headers, ["truck", "truck #", "unit"]),
      division: findHeaderIndex(headers, ["division", "div #", "div"]),
      driver: findHeaderIndex(headers, ["driver"]),
      pta: findHeaderIndex(headers, ["pta"]),
      status: findHeaderIndex(headers, ["status"]),
      plans: findHeaderIndex(headers, ["preplan", "plans"]),
      flag: findHeaderIndex(headers, ["flag"]),
      team: findHeaderIndex(headers, ["type", "team"]),
      destination: findHeaderIndex(headers, ["area", "destination"]),
      om: findHeaderIndex(headers, ["miles", "om"]),
      count: findHeaderIndex(headers, ["count"]),
    };

    return rows.slice(headerRowIndex + 1).map((row, offset) => {
      const read = (column) => column >= 0 ? row?.[column] : null;
      const truck = text(read(columns.truck));
      const driver = text(read(columns.driver));
      const pta = parseDateTime(read(columns.pta));
      if (!truck && !driver && !pta) return null;
      const overdueHours = pta ? (now.getTime() - pta.getTime()) / 3600000 : 0;
      const record = {
        sourceType: queueType,
        sourceName,
        sourceRow: headerRowIndex + offset + 2,
        truck,
        division: text(read(columns.division)),
        driver,
        pta,
        status: text(read(columns.status)) || (queueType === "available" ? "Available" : "Dispatched"),
        planStatus: text(read(columns.plans)) || "No Preplan",
        plan: text(read(columns.flag)),
        team: text(read(columns.team)),
        destination: text(read(columns.destination)),
        om: number(read(columns.om)),
        count: number(read(columns.count)),
        notes: "",
        overdueHours,
      };
      decoratePtaRecord(record, true);
      return record;
    }).filter(Boolean);
  }

  function findHeaderRowIndex(rows, requiredHeaders) {
    let best = -1;
    let bestScore = 0;
    for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
      const headers = (rows[index] || []).map(normalizeHeader);
      const score = requiredHeaders.reduce((total, wanted) => total + (headers.some((header) => header === normalizeHeader(wanted) || header.includes(normalizeHeader(wanted))) ? 1 : 0), 0);
      if (score > bestScore) { best = index; bestScore = score; }
    }
    return bestScore >= Math.min(3, requiredHeaders.length) ? best : -1;
  }

  function decoratePtaRecord(record, finderQueue = false) {
    const hours = record.overdueHours;
    const noPreplan = /no preplan/i.test(record.planStatus);
    const ucSent = /uc sent/i.test(record.planStatus);
    const preplanned = /preplan/i.test(record.planStatus) && !noPreplan;

    if (hours >= 24) {
      record.urgency = "Critical";
      record.urgencyKey = "critical";
    } else if (hours >= 8) {
      record.urgency = "High";
      record.urgencyKey = "high";
    } else if (hours >= 2) {
      record.urgency = "Medium";
      record.urgencyKey = "medium";
    } else if (hours > 0) {
      record.urgency = "New overdue";
      record.urgencyKey = "new-overdue";
    } else if (finderQueue) {
      record.urgency = "Due soon";
      record.urgencyKey = "due-soon";
    } else {
      record.urgency = "Future";
      record.urgencyKey = "future";
    }

    record.timeText = hours > 0
      ? `${num(hours, hours >= 10 ? 0 : 1)} hr past PTA`
      : `${num(Math.abs(hours), Math.abs(hours) >= 10 ? 0 : 1)} hr until PTA`;

    if (hours > 0 && noPreplan) {
      record.action = "Find or confirm the next load now.";
      record.needsAction = true;
    } else if (hours > 0 && ucSent) {
      record.action = "Follow up on the uncommitted load.";
      record.needsAction = true;
    } else if (hours > 0 && preplanned) {
      record.action = "Confirm the preplan is accepted and dispatch-ready.";
      record.needsAction = true;
    } else if (hours > 0) {
      record.action = "Contact the driver and confirm readiness.";
      record.needsAction = true;
    } else if (finderQueue && noPreplan) {
      record.action = "Build or confirm a preplan before PTA.";
      record.needsAction = true;
    } else {
      record.action = "Monitor; no dispatch action is due yet.";
      record.needsAction = false;
    }
  }

  function dedupePtaRecords(records) {
    const seen = new Set();
    return records.filter((record) => {
      const key = `${normalizeIdentity(record.truck)}|${record.pta ? record.pta.toISOString() : ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function comparePtaPriority(a, b) {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, "new-overdue": 3, "due-soon": 4, future: 5 };
    const aOrder = urgencyOrder[a.urgencyKey] ?? 9;
    const bOrder = urgencyOrder[b.urgencyKey] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.overdueHours > 0 || b.overdueHours > 0) return b.overdueHours - a.overdueHours;
    return (a.pta?.getTime() || Infinity) - (b.pta?.getTime() || Infinity);
  }

  function findApuHeaderRow(rows) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
      const headers = (rows[index] || []).map(normalizeHeader);
      const score = headers.reduce((total, header) => total + (/apu/.test(header) ? 3 : /driver|unit|tractor|idle|battery|fault/.test(header) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    }
    return bestScore >= 3 ? bestIndex : -1;
  }

  function findHeaderIndex(headers, aliases) {
    const normalized = headers.map(normalizeHeader);
    const normalizedAliases = aliases.map(normalizeHeader);
    for (const alias of normalizedAliases) {
      const exact = normalized.indexOf(alias);
      if (exact >= 0) return exact;
    }
    for (const alias of normalizedAliases) {
      const partial = normalized.findIndex((header) => header && (header.includes(alias) || alias.includes(header)));
      if (partial >= 0) return partial;
    }
    return -1;
  }

  function normalizeHeader(value) {
    return text(value).toLowerCase().replace(/[%#]/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeIdentity(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizePercent(value) {
    const parsed = number(value);
    if (parsed === null) return null;
    return parsed > 1 ? parsed / 100 : parsed;
  }

  function analyzeDetail(rows) {
    if (rows.length < 3) throw new Error("The Detail workbook does not contain transaction rows.");
    const records = [];
    const unitGroups = new Map();
    const stopGroups = new Map();
    let currentUnit = "Unknown";
    let currentLob = "";
    const quality = { invalidNextDates: 0, invalidPpgRows: 0, badPurchaseType: 0, badRecGallons: 0, duplicateCount: 0 };
    const duplicateKeys = new Set();

    for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      if (text(row[0])) currentUnit = text(row[0]);
      if (text(row[1])) currentLob = text(row[1]);
      const order = text(row[2]);
      const purchaseType = text(row[7]);
      const actualFuelType = text(row[8]);
      const recStop = text(row[9]);
      const locationCompliant = text(row[13]);
      const actualStop = text(row[15]);
      const recGallons = number(row[11]);
      const actualGallons = number(row[17]);
      const gallonVariance = number(row[25]) || 0;
      const gallonCost = number(row[26]) || 0;
      const locationCost = number(row[27]) || 0;
      const totalCost = number(row[28]) || 0;
      const actualDate = parseDate(row[5]);
      const nextDateRaw = row[6];

      const flags = [];
      if (nextDateRaw !== null && text(nextDateRaw) && text(nextDateRaw).toUpperCase() !== "N/A" && !parseDate(nextDateRaw)) {
        quality.invalidNextDates += 1;
        flags.push("Bad next date");
      }
      const ppgValues = [row[12], row[18], row[19], row[22]].map(number).filter((value) => value !== null);
      if (ppgValues.some((value) => value <= 0 || value > 10)) quality.invalidPpgRows += 1;
      if (!["Fill", "Partial"].includes(purchaseType)) {
        quality.badPurchaseType += 1;
        flags.push("Bad purchase type");
      }
      if (recGallons === null || recGallons < 0 || recGallons > 250) {
        quality.badRecGallons += 1;
        flags.push("Bad rec gallons");
      }
      const duplicateKey = [currentUnit, order, row[4], row[5], actualStop, actualGallons].join("|");
      if (duplicateKeys.has(duplicateKey)) quality.duplicateCount += 1;
      duplicateKeys.add(duplicateKey);

      const record = {
        sourceRow: rowIndex + 1,
        unit: currentUnit,
        lob: currentLob,
        order,
        recReqDate: parseDate(row[3]),
        actualFuelDate: actualDate,
        purchaseType,
        actualFuelType,
        recStop,
        actualStop,
        recGallons,
        actualGallons,
        locationCompliant,
        gallonVariance,
        gallonCost,
        locationCost,
        totalCost,
        dataFlag: flags.join(", "),
      };
      records.push(record);

      if (!unitGroups.has(currentUnit)) unitGroups.set(currentUnit, newGroup());
      const unit = unitGroups.get(currentUnit);
      unit.transactions += 1;
      if (order) unit.orders.add(order);
      if (totalCost > 0) unit.grossPositive += totalCost; else unit.negativeOffsets += totalCost;
      unit.netCost += totalCost;
      unit.gallonVariance += gallonVariance;
      if (locationCompliant.toUpperCase() === "N") unit.locationNoncompliant += 1;
      if (actualFuelType.toLowerCase() === "did not follow") unit.didNotFollow += 1;
      increment(unit.types, actualFuelType || "Unknown");
      increment(unit.stops, actualStop || "Unknown");

      if (!stopGroups.has(actualStop || "Unknown")) stopGroups.set(actualStop || "Unknown", { transactions: 0, grossPositive: 0, netCost: 0 });
      const stop = stopGroups.get(actualStop || "Unknown");
      stop.transactions += 1;
      if (totalCost > 0) stop.grossPositive += totalCost;
      stop.netCost += totalCost;
    }

    const units = Array.from(unitGroups.entries()).map(([unit, group]) => {
      const topType = topMapKey(group.types);
      const topStop = topMapKey(group.stops);
      let issue = "Fuel amount or timing differs from plan";
      let owner = "Fuel planning + driver leader";
      if (group.locationNoncompliant) { issue = "Actual fuel stop differed from the plan"; owner = "Fuel planning + dispatch"; }
      else if (topType === "Terminal Fueling") { issue = "Terminal fuel amount or timing differs from plan"; owner = "Terminal operations + fuel planning"; }
      else if (group.didNotFollow) { issue = "Fuel plan was not followed"; owner = "Driver leader + dispatch"; }
      return { unit, ...group, orderCount: group.orders.size, topType, topStop, issue, owner };
    }).sort((a, b) => b.grossPositive - a.grossPositive);

    const stops = Array.from(stopGroups.entries()).map(([stop, values]) => ({ stop, ...values })).sort((a, b) => b.grossPositive - a.grossPositive);
    const totals = {
      grossPositive: sum(records.map((item) => Math.max(0, item.totalCost))),
      negativeOffsets: sum(records.map((item) => Math.min(0, item.totalCost))),
      netCost: sum(records.map((item) => item.totalCost)),
    };
    records.sort((a, b) => b.totalCost - a.totalCost);
    return { records, units, stops, totals, quality };
  }

  function newGroup() {
    return { transactions: 0, orders: new Set(), grossPositive: 0, negativeOffsets: 0, netCost: 0, gallonVariance: 0, locationNoncompliant: 0, didNotFollow: 0, types: new Map(), stops: new Map() };
  }

  function analyzeTrend(rows, completedSummary, latestWeek) {
    const headerDates = rows[1] || [];
    const metricRows = new Map();
    for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const label = text(row[1]);
      if (label) metricRows.set(label, row);
    }
    const gallonRow = metricRows.get("Gallon Over/Under Cost") || rows[2] || [];
    const locationRow = metricRows.get("Location Noncompliant Cost") || rows[3] || [];
    const totalRow = metricRows.get("Total Noncompliant Cost") || rows[4] || [];
    const complianceByDate = new Map(completedSummary.map((item) => [dateKey(item.date), item.compliance]));
    const weeks = [];
    for (let column = 2; column < headerDates.length; column += 1) {
      const date = parseDate(headerDates[column]);
      const totalCost = number(totalRow[column]);
      if (!date || date > endOfDay(latestWeek) || totalCost === null) continue;
      weeks.push({
        date,
        gallonCost: number(gallonRow[column]) || 0,
        locationCost: number(locationRow[column]) || 0,
        totalCost,
        compliance: complianceByDate.get(dateKey(date)) ?? null,
      });
    }
    weeks.sort((a, b) => a.date - b.date);
    const recent = weeks.slice(-8);
    const latest = recent.at(-1) || null;
    const previous = recent.at(-2) || null;
    const change = latest && previous && previous.totalCost !== 0 ? (latest.totalCost - previous.totalCost) / previous.totalCost : null;
    const rollingAverage = recent.map((_, index) => average(recent.slice(Math.max(0, index - 3), index + 1).map((week) => week.totalCost)));
    return { weeks: recent, latest, previous, change, rollingAverage };
  }

  function buildDataQuality(detail, drivers, summary) {
    const findings = [
      { severity: "Critical", title: "Fuel-price fields look broken", count: detail.quality.invalidPpgRows, impact: "The dashboard cannot reliably compare fuel prices, discounts, or expensive stops from these fields.", fix: "Re-export the price-per-gallon fields as normal numeric currency values." },
      { severity: "High", title: "Some next-fuel dates are not dates", count: detail.quality.invalidNextDates, impact: "The dashboard cannot reliably tell when the next fuel stop happened for these rows.", fix: "Correct the export or the source formula references." },
      { severity: "High", title: "Some transaction rows appear shifted", count: detail.quality.badPurchaseType, impact: "Values may be sitting in the wrong columns, which can make the transaction misleading.", fix: "Inspect the flagged source rows and repair the export." },
      { severity: "High", title: "Some planned gallon amounts are not believable", count: detail.quality.badRecGallons, impact: "These values probably came from a bad export or shifted row, not a real fuel plan.", fix: "Repair the source rows before judging fuel quantities." },
      { severity: "Medium", title: "A driver may be assigned to the wrong leader", count: drivers.records.filter((driver) => driver.managerMatch.toLowerCase() === "no").length, impact: "The review could be sent to the wrong person.", fix: "Confirm the current driver-to-leader assignment." },
      { severity: "Medium", title: "Partial summary rows excluded", count: summary.partialRows.length, impact: "Incomplete weeks are not comparable with completed periods.", fix: "Allow the period to close before headline reporting." },
      { severity: detail.quality.duplicateCount ? "High" : "Pass", title: "Potential duplicate transaction keys", count: detail.quality.duplicateCount, impact: detail.quality.duplicateCount ? "Duplicate rows could overstate costs." : "No exact normalized duplicate keys were found.", fix: detail.quality.duplicateCount ? "Investigate the duplicated source rows." : "Continue monitoring after source repairs." },
    ];
    return { findings };
  }

  function buildActions(drivers, detail, quality, apu, pta) {
    const topDrivers = drivers.records.slice(0, 4).map((driver) => driver.driverName.split(" ")[0]);
    const topUnits = detail.units.slice(0, 2).map((unit) => unit.unit);
    const topStops = detail.stops.slice(0, 2).map((stop) => stop.stop);
    const dataIssue = quality.findings.find((finding) => finding.count > 0 && ["Critical", "High"].includes(finding.severity));
    const actions = [];
    if (pta?.hasData) {
      if (pta.summary.overdueNoPreplan) actions.push(`Find or confirm loads for ${pta.summary.overdueNoPreplan} overdue PTA${pta.summary.overdueNoPreplan === 1 ? "" : "s"} with no preplan.`);
      else if (pta.summary.overdue) actions.push(`Review ${pta.summary.overdue} overdue PTA${pta.summary.overdue === 1 ? "" : "s"} and confirm dispatch readiness.`);
      else if (pta.summary.availableSoon || pta.summary.dispatchedSoon) actions.push(`Plan ahead for ${pta.summary.availableSoon + pta.summary.dispatchedSoon} truck${pta.summary.availableSoon + pta.summary.dispatchedSoon === 1 ? "" : "s"} due soon without a preplan.`);
    }
    actions.push(
      drivers.totals.modeledCost > 0
        ? `Review the drivers with the largest possible savings: ${topDrivers.join(", ") || "none identified"}.`
        : `Review the current highest idlers: ${topDrivers.join(", ") || "none identified"}.`,
      `Check units ${topUnits.join(" and ") || "with the highest added costs"}.`,
      `Confirm whether the fuel plan was practical at ${topStops.join(" and ") || "the highest-cost stops"}.`,
    );
    if (apu.hasData) {
      if (apu.summary.needsEquipment) actions.push(`Check ${apu.summary.needsEquipment} electric APU record${apu.summary.needsEquipment === 1 ? "" : "s"} for faults or low battery.`);
      else if (apu.summary.useMore) actions.push(`Review ${apu.summary.useMore} driver${apu.summary.useMore === 1 ? "" : "s"} with high engine idle and low APU use.`);
      else actions.push("Electric APU use does not show an urgent problem in the available data.");
    } else {
      actions.push("Add the optional electric APU workbook to separate APU use from engine idle.");
    }
    actions.push(dataIssue ? `Fix the report export problem: ${dataIssue.title}.` : "Keep the data-quality checks clean.");
    return actions.slice(0, 5);
  }

  function renderDashboard(analysis) {
    renderOverview(analysis);
    renderDriversTable(analysis.drivers.records);
    renderUnitsTable(analysis.detail.units);
    renderExceptionsTable(analysis.detail.records);
    renderApu(analysis.apu);
    renderPta(analysis.pta);
    renderWorkedView();
    renderQuality(analysis.quality.findings);
  }

  function renderOverview(analysis) {
    const { summary, drivers, detail, trend, quality, actions, apu, pta } = analysis;
    const complianceDelta = summary.previous ? summary.latest.compliance - summary.previous.compliance : null;
    const costChange = trend.change;

    els.reportingWeek.textContent = formatDateRange(summary.latest.date);
    els.kpiCompliance.textContent = pct(summary.latest.compliance, 1);
    els.kpiComplianceDelta.textContent = deltaLabel(complianceDelta, "vs previous week", true);
    els.kpiComplianceBar.style.width = `${clamp(summary.latest.compliance * 100, 0, 100)}%`;

    els.kpiWeeklyCost.textContent = money(detail.totals.netCost, 2);
    els.kpiWeeklyCostDelta.textContent = costChange === null ? "Current detail period" : deltaLabel(costChange, "vs previous week", false);
    els.kpiWeeklyCostBar.style.width = `${clamp(100 - Math.abs((costChange || 0) * 100), 18, 100)}%`;

    els.kpiModeledSavings.textContent = moneyCompact(drivers.totals.modeledCost);
    els.kpiModeledSavingsNote.textContent = isIdleFocusedMode(analysis)
      ? "Driver-level cost and gallons are not supplied by the basic reports"
      : `${num(drivers.totals.excessGallons, 0)} estimated gallons above the strong-peer target`;
    els.kpiModeledSavingsBar.style.width = `${clamp(drivers.totals.topFourShare * 100, 12, 100)}%`;

    els.kpiAnnualExposure.textContent = moneyCompact(drivers.totals.annualizedCost);
    els.kpiAnnualNote.textContent = `If the current gap repeats · ${money(state.settings.planningPpg, 2)}/gal`;
    els.kpiAnnualBar.style.width = `${clamp(drivers.totals.topFourShare * 100, 20, 100)}%`;

    const idle7Values = drivers.records.map((driver) => driver.idle7DayPct).filter(isFiniteNumber);
    const idle28Values = drivers.records.map((driver) => driver.idle28DayPct).filter(isFiniteNumber);
    const idle7Average = idle7Values.length ? average(idle7Values) : null;
    const idle28Average = idle28Values.length ? average(idle28Values) : null;
    els.kpiIdle7Day.textContent = pct(idle7Average, 1);
    els.kpiIdle7DayNote.textContent = `${formatCount(idle7Values.length)} driver${idle7Values.length === 1 ? "" : "s"} with 7-day data`;
    els.kpiIdle7DayBar.style.width = `${clamp((idle7Average || 0) * 100, idle7Average === null ? 0 : 4, 100)}%`;
    els.kpiIdle28Day.textContent = pct(idle28Average, 1);
    els.kpiIdle28DayNote.textContent = `${formatCount(idle28Values.length)} driver${idle28Values.length === 1 ? "" : "s"} with 28-day data`;
    els.kpiIdle28DayBar.style.width = `${clamp((idle28Average || 0) * 100, idle28Average === null ? 0 : 4, 100)}%`;

    const idleRecords = drivers.records.filter((driver) => isFiniteNumber(currentIdlePct(driver)));
    const highestIdlers = [...idleRecords].sort((a, b) => currentIdlePct(b) - currentIdlePct(a)).slice(0, 5);
    const bestIdlers = [...idleRecords].sort((a, b) => currentIdlePct(a) - currentIdlePct(b)).slice(0, 5);
    const topDriver = isIdleFocusedMode(analysis) ? highestIdlers[0] : drivers.records[0];
    els.heroInsight.innerHTML = topDriver
      ? analysis.sourceMode === "idle-reports"
        ? `<strong>Current idle review.</strong> ${escapeHtml(topDriver.driverName)} has the highest current 7-day idle at <strong>${pct(topDriver.idle7DayPct, 1)}</strong>, compared with ${pct(topDriver.idle28DayPct, 1)} over 28 days.`
        : analysis.sourceMode === "basic-reports"
          ? `<strong>Basic XLSX/PDF report mode.</strong> ${escapeHtml(topDriver.driverName)} is first in the idle/MPG review order. ${escapeHtml(topDriver.focus)}. Transaction-level driver cost is not included in these reports.`
        : `${escapeHtml(topDriver.driverName)} has the largest estimated cost gap to review. ${escapeHtml(topDriver.focus)}. The dashboard estimates <strong>${moneyCompact(topDriver.estimatedCost)}</strong> in possible 28-day savings if performance reaches the strong-peer target. Fleet-wide possible savings are <strong>${moneyCompact(drivers.totals.modeledCost)}</strong>.`
      : "No estimated driver cost gap was found.";
    els.heroSavings.textContent = moneyCompact(drivers.totals.modeledCost);

    renderIdleDrivers(els.topDriversList, highestIdlers, "highest");
    renderIdleDrivers(els.bestIdlersList, bestIdlers, "best");
    renderUnitWatch(detail.units.slice(0, 5));
    renderQualityAlerts(quality.findings.filter((item) => item.count > 0).slice(0, 3));
    renderActions(actions);
    renderPtaPulse(pta);
    renderCharts(trend);

    els.trendWeekTotal.textContent = trend.latest ? moneyCompact(trend.latest.totalCost) : "--";
    els.trendWeekDelta.textContent = trend.change === null ? "No comparison" : deltaLabel(trend.change, "vs prior", false);
  }

  function renderIdleDrivers(container, drivers, group) {
    if (!drivers.length) { container.innerHTML = '<div class="empty-state">No idle data.</div>'; return; }
    container.innerHTML = drivers.map((driver, rank) => {
      const index = state.analysis?.drivers?.records?.indexOf(driver) ?? -1;
      const idle = currentIdlePct(driver);
      const context = group === "best"
        ? `28-day ${pct(driver.idle28DayPct, 1)} · MPG ${num(driver.dispatchMpg, 2)}`
        : `28-day ${pct(driver.idle28DayPct, 1)} · ${pct(idle - state.analysis.drivers.idleThreshold, 1)} vs middle`;
      return `
      <div class="mini-row" data-driver-index="${index}" role="button" tabindex="0" aria-label="Open details for ${escapeHtml(driver.driverName)}">
        <div class="driver-cell"><span class="rank-badge">${rank + 1}</span><span class="driver-name">${escapeHtml(driver.driverName)}<small>${escapeHtml(driver.driverCode || "No code")}</small></span></div>
        <span class="impact-value">${pct(idle, 1)}</span>
        <span class="focus-value">${escapeHtml(context)}</span>
        <button class="action-pill" type="button" data-driver-index="${index}">OPEN</button>
      </div>`;
    }).join("");
  }

  function currentIdlePct(driver) {
    return driver?.idle7DayPct ?? driver?.idle28DayPct ?? driver?.idlePct ?? null;
  }

  function renderUnitWatch(units) {
    if (!units.length) { els.unitWatchList.innerHTML = '<div class="empty-state">No unit data.</div>'; return; }
    els.unitWatchList.innerHTML = units.map((unit) => {
      const status = unit.grossPositive >= 30 ? "Review first" : unit.grossPositive >= 12 ? "Review" : "Watch";
      const statusClass = status === "Review first" ? "status-high" : status === "Review" ? "status-med" : "status-monitor";
      return `<div class="watch-row"><span>${escapeHtml(unit.unit)}</span><span>${money(unit.grossPositive, 2)}</span><span class="${unit.netCost >= 0 ? "cost-positive" : "cost-negative"}">${money(unit.netCost, 2)}</span><span class="status-pill ${statusClass}">${status}</span></div>`;
    }).join("");
  }

  function renderQualityAlerts(findings) {
    if (!findings.length) { els.qualityAlerts.innerHTML = '<div class="empty-state">No active alerts.</div>'; return; }
    els.qualityAlerts.innerHTML = findings.map((finding) => {
      const cardClass = finding.severity === "Critical" ? "" : finding.severity === "High" ? "warning" : "info";
      const icon = finding.severity === "Critical" ? "!" : finding.severity === "High" ? "!" : "i";
      return `<div class="alert-card ${cardClass}"><span class="alert-icon">${icon}</span><div><strong>${formatCount(finding.count)} ${escapeHtml(finding.title)}</strong><small>${escapeHtml(finding.impact)}</small></div></div>`;
    }).join("");
  }

  function renderActions(actions) {
    els.nextActions.innerHTML = actions.map((action) => `<div class="action-item"><span>✦</span><span>${escapeHtml(action)}</span><span>›</span></div>`).join("");
  }

  function configureCharts() {
    Chart.defaults.color = "#a9b3bc";
    Chart.defaults.font.family = '"Segoe UI", Arial, sans-serif';
    Chart.defaults.borderColor = "rgba(255,255,255,.07)";
  }

  function renderCharts(trend) {
    const labels = trend.weeks.map((week) => shortDate(week.date));
    const actual = trend.weeks.map((week) => week.totalCost);
    const rolling = trend.rollingAverage;

    if (state.heroChart) state.heroChart.destroy();
    state.heroChart = new Chart($("heroChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Actual Cost", data: actual, borderColor: "#b55cff", backgroundColor: "rgba(168,85,247,.2)", fill: true, tension: .28, pointRadius: 3, pointBackgroundColor: "#d9a2ff", borderWidth: 2 },
          { label: "4-Week Avg", data: rolling, borderColor: "#39ff63", backgroundColor: "transparent", borderDash: [7,5], tension: .25, pointRadius: 0, borderWidth: 2 },
        ],
      },
      options: chartOptions({ legend: true, compact: false }),
    });

    if (state.weeklyChart) state.weeklyChart.destroy();
    state.weeklyChart = new Chart($("weeklyChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Total", data: actual, borderColor: "#b55cff", backgroundColor: "rgba(168,85,247,.14)", fill: true, tension: .3, pointRadius: 3, borderWidth: 2 },
          { label: "Location", data: trend.weeks.map((week) => week.locationCost), borderColor: "#39ff63", borderDash: [6,4], tension: .25, pointRadius: 0, borderWidth: 2 },
        ],
      },
      options: chartOptions({ legend: true, compact: true }),
    });
  }

  function chartOptions({ legend, compact }) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: legend, position: "top", align: "start", labels: { boxWidth: 9, boxHeight: 9, font: { size: 9 }, padding: 12 } },
        tooltip: { backgroundColor: "rgba(4,9,13,.95)", borderColor: "rgba(168,85,247,.5)", borderWidth: 1, callbacks: { label: (context) => `${context.dataset.label}: ${money(context.parsed.y, 2)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: compact ? 8 : 9 }, maxRotation: 0 } },
        y: { grid: { color: "rgba(255,255,255,.06)" }, ticks: { font: { size: compact ? 8 : 9 }, callback: (value) => moneyCompact(value) } },
      },
    };
  }

  function renderDriversTable(records) {
    const tbody = $("driversTable").querySelector("tbody");
    const basicMode = isIdleFocusedMode();
    tbody.innerHTML = records.map((driver, index) => `
      <tr data-driver-index="${index}">
        <td class="priority-${driver.priority.toLowerCase()}">${escapeHtml(driver.reviewLabel)}</td>
        <td>${escapeHtml(driver.driverName)}</td><td>${escapeHtml(driver.driverLeader)}</td>
        <td class="numeric">${num(driver.dispatchMpg, 2)}</td>
        <td class="numeric">${pct(driver.dailyIdlePct, 1)}</td><td class="numeric">${pct(driver.idle7DayPct, 1)}</td><td class="numeric">${pct(driver.idle28DayPct, 1)}</td>
        <td class="numeric">${pct(driver.oorPct, 1)}</td><td class="numeric">${num(driver.movingMpg, 2)}</td>
        <td class="numeric">${basicMode ? "--" : num(driver.excessGallons, 1)}</td><td class="numeric cost-positive">${basicMode ? "--" : money(driver.estimatedCost, 0)}</td>
        <td class="numeric">${basicMode ? "--" : money(driver.annualizedCost, 0)}</td><td>${escapeHtml(driver.focus)}</td><td>${escapeHtml(driver.action)}</td>
        <td><button class="driver-details-button" type="button" data-driver-index="${index}">Open</button></td>
      </tr>`).join("");
  }

  function renderUnitsTable(units) {
    const tbody = $("unitsTable").querySelector("tbody");
    if (!units.length && isIdleFocusedMode()) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Unit-level records are not included in the four basic XLSX/PDF reports.</td></tr>';
      return;
    }
    tbody.innerHTML = units.slice(0, 80).map((unit) => `
      <tr><td>${escapeHtml(unit.unit)}</td><td class="numeric">${unit.transactions}</td><td class="numeric cost-positive">${money(unit.grossPositive, 2)}</td>
      <td class="numeric cost-negative">${money(unit.negativeOffsets, 2)}</td><td class="numeric ${unit.netCost >= 0 ? "cost-positive" : "cost-negative"}">${money(unit.netCost, 2)}</td>
      <td class="numeric">${num(unit.gallonVariance, 1)}</td><td class="numeric">${unit.locationNoncompliant}</td><td class="numeric">${unit.didNotFollow}</td>
      <td>${escapeHtml(unit.topStop)}</td><td>${escapeHtml(unit.issue)}</td><td>${escapeHtml(unit.owner)}</td></tr>`).join("");
  }

  function renderExceptionsTable(records) {
    const tbody = $("exceptionsTable").querySelector("tbody");
    if (!records.length && isIdleFocusedMode()) {
      tbody.innerHTML = '<tr><td colspan="13" class="empty-state">Transaction-level fueling events are not included in the four basic XLSX/PDF reports.</td></tr>';
      return;
    }
    tbody.innerHTML = records.slice(0, 400).map((record) => `
      <tr><td>${escapeHtml(record.unit)}</td><td>${escapeHtml(record.order)}</td><td>${record.actualFuelDate ? shortDate(record.actualFuelDate) : ""}</td>
      <td>${escapeHtml(record.actualFuelType)}</td><td>${escapeHtml(record.recStop)}</td><td>${escapeHtml(record.actualStop)}</td>
      <td class="numeric">${nullableNum(record.recGallons, 1)}</td><td class="numeric">${nullableNum(record.actualGallons, 1)}</td><td>${escapeHtml(record.locationCompliant)}</td>
      <td class="numeric ${record.gallonCost >= 0 ? "cost-positive" : "cost-negative"}">${money(record.gallonCost, 2)}</td>
      <td class="numeric ${record.locationCost >= 0 ? "cost-positive" : "cost-negative"}">${money(record.locationCost, 2)}</td>
      <td class="numeric ${record.totalCost >= 0 ? "cost-positive" : "cost-negative"}">${money(record.totalCost, 2)}</td><td>${escapeHtml(record.dataFlag)}</td></tr>`).join("");
  }

  function renderApu(apu) {
    const tbody = $("apuTable").querySelector("tbody");
    if (!apu?.hasData) {
      els.apuSummaryGrid.innerHTML = "";
      els.apuEmptyState.classList.remove("hidden");
      els.apuTableShell.classList.add("hidden");
      if (apu?.parserNote) els.apuEmptyState.innerHTML = `<strong>APU file found, but it needs a column match.</strong>${escapeHtml(apu.parserNote)} Helpful columns include Driver Code, Driver Name, Unit, Electric APU Hours, Engine Idle Hours, APU Use %, Battery SOC, and Faults.`;
      tbody.innerHTML = "";
      return;
    }
    els.apuEmptyState.classList.add("hidden");
    els.apuTableShell.classList.remove("hidden");
    els.apuSummaryGrid.innerHTML = `
      <article class="apu-summary-card"><span>APU records</span><strong>${formatCount(apu.summary.records)}</strong></article>
      <article class="apu-summary-card purple"><span>Check equipment</span><strong>${formatCount(apu.summary.needsEquipment)}</strong></article>
      <article class="apu-summary-card"><span>Use APU more</span><strong>${formatCount(apu.summary.useMore)}</strong></article>
      <article class="apu-summary-card purple"><span>Matched to drivers</span><strong>${formatCount(apu.summary.matchedDrivers)}</strong></article>`;
    tbody.innerHTML = apu.records.map((record) => `
      <tr>
        <td><span class="apu-status ${record.statusKey}">${escapeHtml(record.status)}</span></td>
        <td>${escapeHtml(record.driverName || "Unmatched")}</td>
        <td>${escapeHtml(record.driverCode)}</td>
        <td>${escapeHtml(record.unit)}</td>
        <td class="numeric">${nullableNum(record.apuHours, 1)}</td>
        <td class="numeric">${nullableNum(record.engineIdleHours, 1)}</td>
        <td class="numeric">${record.calculatedUsePct === null ? "" : pct(record.calculatedUsePct, 1)}</td>
        <td class="numeric">${record.batterySoc === null ? "" : pct(record.batterySoc, 0)}</td>
        <td>${record.faultCount ? escapeHtml(record.faultText || String(record.faultCount)) : "None reported"}</td>
        <td class="numeric">${record.linkedDriver ? pct(record.linkedDriver.idlePct, 1) : ""}</td>
        <td>${escapeHtml(record.plainNote)}</td>
      </tr>`).join("");
  }


  function renderPtaPulse(pta) {
    if (!pta?.hasData) {
      els.ptaPulseSummary.classList.add("empty-state");
      els.ptaOverviewQueue.classList.add("empty-state");
      els.ptaDueSoonQueue.classList.add("empty-state");
      els.ptaPulseSummary.innerHTML = "Paste the shared PTA report or add the optional PTA workbooks to see overdue and due-soon dispatch work.";
      els.ptaOverviewQueue.innerHTML = "No PTA tracker data.";
      els.ptaDueSoonQueue.innerHTML = "No PTA Finder data.";
      return;
    }

    els.ptaPulseSummary.classList.remove("empty-state");
    els.ptaOverviewQueue.classList.remove("empty-state");
    els.ptaDueSoonQueue.classList.remove("empty-state");
    els.ptaPulseSummary.innerHTML = `
      <div class="pta-pulse-card danger"><span>Overdue</span><strong>${formatCount(pta.summary.overdue)}</strong><small>${formatCount(pta.summary.overdueNoPreplan)} with no preplan</small></div>
      <div class="pta-pulse-card purple"><span>24+ hours past</span><strong>${formatCount(pta.summary.critical)}</strong><small>Critical dispatch risk</small></div>
      <div class="pta-pulse-card"><span>Available soon</span><strong>${formatCount(pta.summary.availableSoon)}</strong><small>No preplan in finder window</small></div>
      <div class="pta-pulse-card purple"><span>Dispatched soon</span><strong>${formatCount(pta.summary.dispatchedSoon)}</strong><small>No preplan in finder window</small></div>`;

    const overdueRows = pta.overdue.slice(0, 4);
    els.ptaOverviewQueue.innerHTML = overdueRows.length ? overdueRows.map(ptaOverviewRow).join("") : '<div class="empty-state">No overdue PTAs.</div>';

    const dueSoonRows = dedupePtaRecords([...pta.availableSoon, ...pta.dispatchedSoon]).sort(comparePtaPriority).slice(0, 4);
    els.ptaDueSoonQueue.innerHTML = dueSoonRows.length ? dueSoonRows.map(ptaOverviewRow).join("") : '<div class="empty-state">No due-soon no-preplan trucks.</div>';
  }

  function ptaOverviewRow(record) {
    const worked = recentTruckWork(record);
    return `<button class="pta-overview-row ${worked ? "worked-recently" : ""}" type="button" data-pta-index="${record.index}">
      <span class="pta-urgency ${record.urgencyKey}">${escapeHtml(record.urgency)}</span>
      <span><strong>${escapeHtml(record.truck || "No truck")}${worked ? ' <em class="worked-marker">Worked recently</em>' : ""}</strong><small>${escapeHtml(record.driver || "No driver")} · ${escapeHtml(record.destination || "No destination")}${worked ? ` · gold for ${escapeHtml(worked.remainingText)}` : ""}</small></span>
      <span class="pta-time">${escapeHtml(record.timeText)}</span>
      <span>›</span>
    </button>`;
  }

  function renderPta(pta) {
    const tbody = $("ptaTable").querySelector("tbody");
    if (!pta?.hasData) {
      els.ptaSummaryGrid.innerHTML = "";
      els.ptaEmptyState.classList.remove("hidden");
      els.ptaTableShell.classList.add("hidden");
      els.ptaFilterBar.classList.add("hidden");
      tbody.innerHTML = "";
      return;
    }

    els.ptaEmptyState.classList.add("hidden");
    els.ptaTableShell.classList.remove("hidden");
    els.ptaFilterBar.classList.remove("hidden");
    els.ptaSummaryGrid.innerHTML = `
      <article class="pta-summary-card danger"><span>Overdue now</span><strong>${formatCount(pta.summary.overdue)}</strong><small>${formatCount(pta.summary.overdueNoPreplan)} have no preplan</small></article>
      <article class="pta-summary-card purple"><span>Critical 24+ hours</span><strong>${formatCount(pta.summary.critical)}</strong><small>Oldest PTAs first</small></article>
      <article class="pta-summary-card"><span>Available due soon</span><strong>${formatCount(pta.summary.availableSoon)}</strong><small>Inside ${formatCount(pta.soonWindowHours)}-hour finder window</small></article>
      <article class="pta-summary-card purple"><span>Dispatched due soon</span><strong>${formatCount(pta.summary.dispatchedSoon)}</strong><small>No preplan in finder list</small></article>`;
    renderPtaTable();
  }

  function setPtaFilter(filter) {
    state.ptaFilter = filter || "action";
    document.querySelectorAll("[data-pta-filter]").forEach((button) => button.classList.toggle("active", button.dataset.ptaFilter === state.ptaFilter));
    renderPtaTable();
  }

  function currentPtaRecords(pta) {
    if (!pta?.hasData) return [];
    if (state.ptaFilter === "overdue") return pta.overdue;
    if (state.ptaFilter === "available") return pta.availableSoon;
    if (state.ptaFilter === "dispatched") return pta.dispatchedSoon;
    if (state.ptaFilter === "all") return [...pta.trackerRecords].sort(comparePtaPriority);
    return pta.actionQueue.filter((record) => record.needsAction);
  }

  function renderPtaTable() {
    const pta = state.analysis?.pta;
    const tbody = $("ptaTable")?.querySelector("tbody");
    if (!tbody) return;
    const records = currentPtaRecords(pta);
    tbody.innerHTML = records.length ? records.map((record) => {
      const worked = recentTruckWork(record);
      return `
      <tr class="${worked ? "worked-recently" : ""}">
        <td><span class="pta-urgency ${record.urgencyKey}">${escapeHtml(record.urgency)}</span>${worked ? `<span class="worked-marker">Worked recently · ${escapeHtml(worked.remainingText)}</span>` : ""}</td>
        <td><strong>${escapeHtml(record.truck)}</strong></td>
        <td>${escapeHtml(record.driver || "Unassigned")}</td>
        <td>${escapeHtml(formatPtaDate(record.pta))}</td>
        <td>${escapeHtml(record.timeText)}</td>
        <td>${escapeHtml(record.status)}</td>
        <td>${escapeHtml(record.planStatus)}${record.plan ? `<small class="table-subtext">${escapeHtml(record.plan)}</small>` : ""}</td>
        <td>${escapeHtml(record.destination)}</td>
        <td class="numeric">${nullableNum(record.om, 0)}</td>
        <td class="numeric">${nullableNum(record.count, 0)}</td>
        <td>${escapeHtml(record.action)}</td>
        <td>${escapeHtml(record.notes)}</td>
        <td><button class="driver-details-button" type="button" data-pta-index="${record.index}">OPEN</button></td>
      </tr>`;
    }).join("") : '<tr><td colspan="13" class="empty-state">No records match this PTA view.</td></tr>';
  }

  function openPtaModal(index) {
    const record = state.analysis?.pta?.allRecords?.[index];
    if (!record) {
      showToast("No PTA details are available for that row.", true);
      return;
    }
    state.activePtaRecordIndex = index;
    els.ptaActionNoteInput.value = "";
    renderPtaActionNotes(record);
    els.modalPtaTruck.textContent = `Truck ${record.truck || "Unknown"}`;
    els.modalPtaMeta.textContent = `${record.driver || "No driver"} · Division ${record.division || "Unknown"} · ${record.destination || "No destination"}`;
    els.modalPtaBadge.textContent = record.urgency;
    els.modalPtaBadge.className = `modal-review-badge pta-${record.urgencyKey}`;
    els.modalPtaMetrics.innerHTML = [
      modalMetric("PTA", formatPtaDate(record.pta), "Expected ready time"),
      modalMetric("Time status", record.timeText, record.overdueHours > 0 ? "PTA is already past" : "Time remaining before PTA", record.overdueHours > 0),
      modalMetric("Truck status", record.status || "Not reported", "Current dispatch status"),
      modalMetric("Plan status", record.planStatus || "Not reported", record.plan || "No plan type reported"),
      modalMetric("Destination", record.destination || "Not reported", "Current or expected area"),
      modalMetric("OM", record.om === null ? "Not reported" : num(record.om, 0), "Operational metric from the source file"),
      modalMetric("Count", record.count === null ? "Not reported" : num(record.count, 0), "Count supplied in the dispatch report"),
      modalMetric("Team type", record.team || "Not reported", "Solo, team, or mentor/student"),
    ].join("");
    els.modalPtaAction.textContent = record.action;
    els.modalPtaNotes.textContent = record.notes || "No dispatch note was entered in the source workbook.";
    els.modalPtaContext.innerHTML = `<strong>${escapeHtml(record.planStatus || "Plan status unknown")}</strong><br>${record.overdueHours > 0 ? "This PTA is past due." : "This PTA is still ahead."}<br>Truck status: <strong>${escapeHtml(record.status || "Unknown")}</strong>.`;
    els.modalPtaSource.innerHTML = `${escapeHtml(record.sourceName)}<br>Source row ${formatCount(record.sourceRow)}<br>Queue: ${escapeHtml(record.sourceType === "tracker" ? "PTA Dispatch Tracker" : record.sourceType === "available" ? "Available due soon" : "Dispatched due soon")}`;
    if (typeof els.ptaModal.showModal === "function") els.ptaModal.showModal();
    else els.ptaModal.setAttribute("open", "");
  }

  function closePtaModal() {
    if (typeof els.ptaModal.close === "function" && els.ptaModal.open) els.ptaModal.close();
    else els.ptaModal.removeAttribute("open");
    state.activePtaRecordIndex = null;
  }

  function loadPtaActionNotes() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PTA_ACTION_NOTES_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function loadStoredNotes(storageKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function persistPtaActionNotes() {
    try {
      localStorage.setItem(PTA_ACTION_NOTES_KEY, JSON.stringify(state.ptaActionNotes));
      return true;
    } catch (_) {
      showToast("The browser could not save that PTA note.", true);
      return false;
    }
  }

  function ptaTruckNoteKey(record) {
    const truck = text(record?.truck).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return truck || "UNKNOWN-TRUCK";
  }

  function recentTruckWork(record, now = Date.now()) {
    const notes = state.ptaActionNotes[ptaTruckNoteKey(record)];
    if (!Array.isArray(notes) || !notes.length) return null;
    const latestTime = Math.max(...notes.map((note) => new Date(note.savedAt).getTime()).filter(Number.isFinite));
    const remainingMs = latestTime + 3600000 - now;
    if (!Number.isFinite(latestTime) || remainingMs <= 0) return null;
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return {
      savedAt: new Date(latestTime),
      remainingMs,
      remainingMinutes,
      remainingText: remainingMinutes === 60 ? "about 1 hour" : `${remainingMinutes} min`,
    };
  }

  function updatePtaWorkStatusViews() {
    if (state.analysis?.pta) {
      renderPtaPulse(state.analysis.pta);
      renderPtaTable();
    }
    renderWorkedView();
  }

  function scheduleWorkedStatusRefresh() {
    if (state.workedStatusTimer) window.clearInterval(state.workedStatusTimer);
    state.workedStatusTimer = window.setInterval(updatePtaWorkStatusViews, 30000);
  }

  function currentPtaModalRecord() {
    const index = state.activePtaRecordIndex;
    return Number.isInteger(index) ? state.analysis?.pta?.allRecords?.[index] : null;
  }

  function savePtaActionNote() {
    const record = currentPtaModalRecord();
    if (!record) {
      showToast("Open a PTA truck before saving a note.", true);
      return;
    }
    const noteText = text(els.ptaActionNoteInput.value);
    if (!noteText) {
      showToast("Type a quick action note first.", true);
      els.ptaActionNoteInput.focus();
      return;
    }

    const key = ptaTruckNoteKey(record);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: noteText.slice(0, 2500),
      savedAt: new Date().toISOString(),
      driver: record.driver || "",
      pta: record.pta instanceof Date && !Number.isNaN(record.pta.getTime()) ? record.pta.toISOString() : "",
      status: record.status || "",
      planStatus: record.planStatus || "",
      destination: record.destination || "",
    };
    const existing = Array.isArray(state.ptaActionNotes[key]) ? state.ptaActionNotes[key] : [];
    state.ptaActionNotes[key] = [entry, ...existing].slice(0, 75);
    if (!persistPtaActionNotes()) return;

    els.ptaActionNoteInput.value = "";
    renderPtaActionNotes(record);
    updatePtaWorkStatusViews();
    showToast(`Action note saved for Truck ${record.truck || "Unknown"}.`);
  }

  function renderPtaActionNotes(record) {
    const key = ptaTruckNoteKey(record);
    const notes = Array.isArray(state.ptaActionNotes[key]) ? state.ptaActionNotes[key] : [];
    els.ptaActionNoteStatus.textContent = notes.length
      ? `${formatCount(notes.length)} saved note${notes.length === 1 ? "" : "s"} for Truck ${record.truck || "Unknown"}. Saved only in this browser.`
      : `No saved action notes for Truck ${record.truck || "Unknown"} yet. Notes stay in this browser.`;
    els.ptaActionNoteHistory.innerHTML = notes.length ? notes.map((note) => {
      const saved = new Date(note.savedAt);
      const savedLabel = Number.isNaN(saved.getTime()) ? "Saved previously" : saved.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      const ptaDate = note.pta ? new Date(note.pta) : null;
      const ptaLabel = ptaDate && !Number.isNaN(ptaDate.getTime()) ? formatPtaDate(ptaDate) : "PTA not captured";
      const context = [
        `PTA: ${ptaLabel}`,
        note.status ? `Status: ${note.status}` : "",
        note.planStatus ? `Plan: ${note.planStatus}` : "",
        note.destination ? `Destination: ${note.destination}` : "",
      ].filter(Boolean).join(" · ");
      return `<article class="pta-action-note-entry">
        <div class="pta-action-note-entry-head"><strong>${escapeHtml(savedLabel)}</strong><button type="button" class="pta-note-delete" data-pta-note-delete="${escapeHtml(note.id)}" aria-label="Delete this saved note">Delete</button></div>
        <p>${escapeHtml(note.text).replace(/\n/g, "<br>")}</p>
        <small>${escapeHtml(context)}</small>
      </article>`;
    }).join("") : '<div class="pta-action-note-empty">Your saved action history will appear here.</div>';
  }

  function handlePtaActionNoteHistoryClick(event) {
    const button = event.target.closest("[data-pta-note-delete]");
    if (!button) return;
    const record = currentPtaModalRecord();
    if (!record) return;
    const key = ptaTruckNoteKey(record);
    const noteId = button.dataset.ptaNoteDelete;
    const notes = Array.isArray(state.ptaActionNotes[key]) ? state.ptaActionNotes[key] : [];
    state.ptaActionNotes[key] = notes.filter((note) => note.id !== noteId);
    if (!state.ptaActionNotes[key].length) delete state.ptaActionNotes[key];
    if (persistPtaActionNotes()) {
      renderPtaActionNotes(record);
      updatePtaWorkStatusViews();
      showToast(`Saved note removed for Truck ${record.truck || "Unknown"}.`);
    }
  }

  function driverNoteKey(driver) {
    return normalizeIdentity(driver?.driverCode || driver?.driverName || "unknown-driver");
  }

  function currentDriverModalRecord() {
    const index = state.activeDriverRecordIndex;
    return Number.isInteger(index) ? state.analysis?.drivers?.records?.[index] : null;
  }

  function persistDriverActionNotes() {
    try {
      localStorage.setItem(DRIVER_ACTION_NOTES_KEY, JSON.stringify(state.driverActionNotes));
      return true;
    } catch (_) {
      showToast("The browser could not save that driver note.", true);
      return false;
    }
  }

  function saveDriverActionNote() {
    const driver = currentDriverModalRecord();
    if (!driver) return showToast("Open a driver before saving a note.", true);
    const noteText = text(els.driverActionNoteInput.value);
    if (!noteText) {
      showToast("Type a driver follow-up note first.", true);
      els.driverActionNoteInput.focus();
      return;
    }
    const key = driverNoteKey(driver);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: noteText.slice(0, 2500),
      savedAt: new Date().toISOString(),
      driverName: driver.driverName || "",
      driverCode: driver.driverCode || "",
      dailyIdlePct: driver.dailyIdlePct,
      idle7DayPct: driver.idle7DayPct,
      idle28DayPct: driver.idle28DayPct,
      estimatedCost: driver.estimatedCost,
    };
    const existing = Array.isArray(state.driverActionNotes[key]) ? state.driverActionNotes[key] : [];
    state.driverActionNotes[key] = [entry, ...existing].slice(0, 75);
    if (!persistDriverActionNotes()) return;
    els.driverActionNoteInput.value = "";
    renderDriverActionNotes(driver);
    renderWorkedView();
    showToast(`Driver note saved for ${driver.driverName}.`);
  }

  function renderDriverActionNotes(driver) {
    const key = driverNoteKey(driver);
    const notes = Array.isArray(state.driverActionNotes[key]) ? state.driverActionNotes[key] : [];
    const today = notes.filter((note) => isToday(note.savedAt));
    els.driverActionNoteStatus.textContent = `${formatCount(today.length)} note${today.length === 1 ? "" : "s"} today · ${formatCount(notes.length)} total. Included in shift transition.`;
    els.driverActionNoteHistory.innerHTML = notes.length ? notes.map((note) => {
      const saved = new Date(note.savedAt);
      const savedLabel = Number.isNaN(saved.getTime()) ? "Saved previously" : saved.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      return `<article class="pta-action-note-entry">
        <div class="pta-action-note-entry-head"><strong>${escapeHtml(savedLabel)}</strong><button type="button" class="pta-note-delete" data-driver-note-delete="${escapeHtml(note.id)}">Delete</button></div>
        <p>${escapeHtml(note.text).replace(/\n/g, "<br>")}</p>
        <small>Idle: daily ${pct(note.dailyIdlePct, 1)} · 7-day ${pct(note.idle7DayPct, 1)} · 28-day ${pct(note.idle28DayPct, 1)}${isIdleFocusedMode() ? "" : ` · Fuel cost ${money(note.estimatedCost, 0)}`}</small>
      </article>`;
    }).join("") : '<div class="pta-action-note-empty">Driver follow-up notes will appear here.</div>';
  }

  function handleDriverActionNoteHistoryClick(event) {
    const button = event.target.closest("[data-driver-note-delete]");
    if (!button) return;
    const driver = currentDriverModalRecord();
    if (!driver) return;
    const key = driverNoteKey(driver);
    state.driverActionNotes[key] = (state.driverActionNotes[key] || []).filter((note) => note.id !== button.dataset.driverNoteDelete);
    if (!state.driverActionNotes[key].length) delete state.driverActionNotes[key];
    if (persistDriverActionNotes()) {
      renderDriverActionNotes(driver);
      renderWorkedView();
    }
  }

  function isToday(value) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && dateKey(date) === dateKey(new Date());
  }

  function latestWorkedNote(notes, now = Date.now()) {
    if (!Array.isArray(notes) || !notes.length) return null;
    const latest = notes
      .map((note) => ({ note, time: new Date(note.savedAt).getTime() }))
      .filter((entry) => Number.isFinite(entry.time))
      .sort((a, b) => b.time - a.time)[0];
    if (!latest) return null;
    const remainingMs = latest.time + 3600000 - now;
    return {
      ...latest.note,
      savedAtDate: new Date(latest.time),
      active: remainingMs > 0,
      remainingMinutes: Math.max(1, Math.ceil(remainingMs / 60000)),
    };
  }

  function renderWorkedView() {
    if (!els.workedList || !els.workedEmptyState) return;
    const now = Date.now();
    const items = [];
    const ptaRecords = state.analysis?.pta?.allRecords || [];
    const seenTrucks = new Set();
    ptaRecords.forEach((record) => {
      const key = ptaTruckNoteKey(record);
      if (seenTrucks.has(key)) return;
      const note = latestWorkedNote(state.ptaActionNotes[key], now);
      if (!note) return;
      seenTrucks.add(key);
      items.push({ type: "pta", label: `Truck ${record.truck || "Unknown"}`, meta: `${record.driver || "No driver"} · ${record.destination || "No destination"}`, note, index: record.index });
    });
    (state.analysis?.drivers?.records || []).forEach((driver, index) => {
      const note = latestWorkedNote(state.driverActionNotes[driverNoteKey(driver)], now);
      if (!note) return;
      items.push({ type: "driver", label: driver.driverName || "Unknown driver", meta: `Driver follow-up · ${driver.driverCode || "No code"}`, note, index });
    });
    items.sort((a, b) => new Date(b.note.savedAt).getTime() - new Date(a.note.savedAt).getTime());
    els.workedEmptyState.classList.toggle("hidden", items.length > 0);
    els.workedList.innerHTML = items.map((item) => `<button class="worked-card ${item.note.active ? "" : "worked-card-expired"}" type="button" data-${item.type}-index="${item.index}">
      <span class="worked-card-icon">✓</span>
      <span class="worked-card-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)} · worked ${escapeHtml(formatWorkedAge(item.note.savedAtDate))}</small><em>${escapeHtml(item.note.text)}</em></span>
      <span class="worked-card-time">${item.note.active ? `${formatCount(item.note.remainingMinutes)} min left` : "Needs attention"}</span>
    </button>`).join("");
  }

  function formatWorkedAge(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "recently";
    const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60000));
    return minutes < 1 ? "just now" : `${minutes} min ago`;
  }

  function exportShiftTransition() {
    if (!state.analysis) return showToast("Load dashboard data before exporting a transition.", true);
    const now = new Date();
    const lines = [
      `${state.settings.brand} SHIFT TRANSITION`,
      `Prepared: ${now.toLocaleString()}`,
      "",
    ];
    const actions = [];
    Object.entries(state.ptaActionNotes).forEach(([truck, notes]) => {
      (Array.isArray(notes) ? notes : []).filter((note) => isToday(note.savedAt)).reverse().forEach((note) => {
        actions.push({ time: new Date(note.savedAt).getTime(), label: truck, text: note.text, isTruck: true });
      });
    });
    (state.analysis.drivers.records || []).forEach((driver) => {
      (Array.isArray(state.driverActionNotes[driverNoteKey(driver)]) ? state.driverActionNotes[driverNoteKey(driver)] : [])
        .filter((note) => isToday(note.savedAt))
        .forEach((note) => {
          const pta = findDriverPtaRecord(driver);
          actions.push({ time: new Date(note.savedAt).getTime(), label: pta?.truck || driver.driverName || "Driver", text: note.text, isTruck: Boolean(pta?.truck) });
        });
    });
    actions.sort((a, b) => a.time - b.time);
    const groupedActions = [];
    const groupedByTruck = new Map();
    actions.forEach((action) => {
      const key = action.isTruck ? normalizeIdentity(action.label) : `individual-${groupedActions.length}`;
      if (!groupedByTruck.has(key)) {
        const group = { label: action.label, texts: [] };
        groupedByTruck.set(key, group);
        groupedActions.push(group);
      }
      groupedByTruck.get(key).texts.push(action.text);
    });
    lines.push(...(groupedActions.length
      ? groupedActions.map((group) => `${group.label} - ${group.texts.join("; ")}`)
      : ["No worked actions were saved today."]));

    const content = lines.join("\r\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Shift_Transition_${dateKey(now)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("Shift transition exported.");
  }

  function formatPtaDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "Not reported";
    return value.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function findDriverPtaRecord(driver) {
    const pta = state.analysis?.pta;
    if (!pta?.hasData) return null;
    return pta.allRecords
      .filter((record) => ptaDriverNameMatches(record.driver, driver.driverName))
      .sort(comparePtaPriority)[0] || null;
  }

  function ptaDriverNameMatches(dispatchName, fullName) {
    const short = normalizeIdentity(dispatchName);
    const full = normalizeIdentity(fullName);
    if (!short || !full) return false;
    if (short === full || full.includes(short) || short.includes(full)) return true;
    const parts = text(fullName).toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length < 2) return false;
    const first = parts[0];
    const last = parts.at(-1);
    const compactLast = normalizeIdentity(last);
    return short.startsWith(compactLast.slice(0, Math.min(6, compactLast.length))) && short.endsWith(first[0]);
  }

  function renderQuality(findings) {
    els.qualityCards.innerHTML = findings.map((finding) => {
      const className = finding.severity.toLowerCase() === "medium" ? "high" : finding.severity.toLowerCase();
      return `<article class="quality-card ${className}"><span class="severity">${finding.severity}</span><strong>${formatCount(finding.count)}</strong><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.impact)}<br><br><b>Fix:</b> ${escapeHtml(finding.fix)}</p></article>`;
    }).join("");
  }

  function openDriverModal(index) {
    const driver = state.analysis?.drivers?.records?.[index];
    if (!driver) {
      showToast("No driver details are available yet.", true);
      return;
    }
    const driverApu = findDriverApuRecord(driver);
    const driverPta = findDriverPtaRecord(driver);
    state.activeDriverRecordIndex = index;
    els.driverActionNoteInput.value = "";
    renderDriverActionNotes(driver);
    els.modalDriverName.textContent = driver.driverName;
    els.modalDriverMeta.textContent = `${driver.driverCode || "No driver code"} · Leader: ${driver.driverLeader || "Unassigned"} · Latest rolling period`;
    els.modalReviewBadge.textContent = driver.reviewLabel;
    els.modalReviewBadge.className = `modal-review-badge ${driver.priority.toLowerCase()}`;
    const basicMode = isIdleFocusedMode();
    els.modalDriverMetrics.innerHTML = [
      ...(basicMode ? [] : [
        modalMetric("Possible 28-day savings", money(driver.estimatedCost, 0), "Estimated avoidable cost, not guaranteed savings", true),
        modalMetric("Estimated excess gallons", num(driver.excessGallons, 1), `Compared with ${num(state.analysis.drivers.targetMpg, 2)} MPG strong-peer target`, true),
      ]),
      modalMetric("Fuel MPG", num(driver.dispatchMpg, 2), `${driver.dispatchMpg >= state.analysis.drivers.targetMpg ? "At or above" : "Below"} ${num(state.analysis.drivers.targetMpg, 2)} target`),
      modalMetric("Idle today", pct(driver.dailyIdlePct, 1), "Most recent daily idle value"),
      modalMetric("7-day idle", pct(driver.idle7DayPct, 1), "Rolling seven-day average"),
      modalMetric("28-day idle", pct(driver.idle28DayPct, 1), `${driver.idlePct > state.analysis.drivers.idleThreshold ? "Above" : "At or below"} ${pct(state.analysis.drivers.idleThreshold, 1)} fleet review level`),
      modalMetric("Out-of-route", pct(driver.oorPct, 1), `${driver.oorPct > state.analysis.drivers.oorThreshold ? "Above" : "At or below"} ${pct(state.analysis.drivers.oorThreshold, 1)} fleet review level`),
      modalMetric("MPG while moving", num(driver.movingMpg, 2), `${driver.movingMpg < state.analysis.drivers.movingThreshold ? "Below" : "At or above"} ${num(state.analysis.drivers.movingThreshold, 2)} fleet middle`),
      ...(basicMode ? [] : [modalMetric("Possible yearly cost", money(driver.annualizedCost, 0), "If the same gap repeats for 13 rolling periods")]),
      modalMetric("MPG change", driver.mpgChange === null ? "No comparison" : `${driver.mpgChange >= 0 ? "+" : ""}${num(driver.mpgChange, 2)}`, "Compared with the prior available rolling period"),
    ].join("");
    els.modalDriverFocus.textContent = driver.focus;
    els.modalDriverAction.textContent = driver.action;
    els.modalDriverContext.innerHTML = `Confidence in this ranking: <strong>${escapeHtml(driver.confidence)}</strong>.<br>Manager assignment match: <strong>${escapeHtml(driver.managerMatch || "Unknown")}</strong>.<br>This model compares the driver with strong peers. It does not prove misconduct or separate weather, load, route, equipment, and necessary idle without more detail.`;
    els.modalDriverApu.innerHTML = driverApu
      ? `<span class="apu-status ${driverApu.statusKey}">${escapeHtml(driverApu.status)}</span><br><br>${escapeHtml(driverApu.plainNote)}<br><br><strong>APU hours:</strong> ${nullableNum(driverApu.apuHours, 1) || "Not reported"} · <strong>Engine idle hours:</strong> ${nullableNum(driverApu.engineIdleHours, 1) || "Not reported"} · <strong>APU use:</strong> ${driverApu.calculatedUsePct === null ? "Not reported" : pct(driverApu.calculatedUsePct, 1)} · <strong>Battery:</strong> ${driverApu.batterySoc === null ? "Not reported" : pct(driverApu.batterySoc, 0)}`
      : `No APU record matched this driver. Add Driver Code or Driver Name to the optional APU workbook so the dashboard can connect the records.`;
    els.modalDriverPta.innerHTML = driverPta
      ? `<span class="pta-urgency ${driverPta.urgencyKey}">${escapeHtml(driverPta.urgency)}</span><br><br><strong>Truck:</strong> ${escapeHtml(driverPta.truck || "Not reported")} · <strong>PTA:</strong> ${escapeHtml(formatPtaDate(driverPta.pta))}<br><strong>Time:</strong> ${escapeHtml(driverPta.timeText)} · <strong>Plan:</strong> ${escapeHtml(driverPta.planStatus)}<br><br>${escapeHtml(driverPta.action)}`
      : `No PTA record matched this driver. Dispatch reports often abbreviate names, so confirm the spelling if a match should exist.`;
    if (typeof els.driverModal.showModal === "function") els.driverModal.showModal();
    else els.driverModal.setAttribute("open", "");
  }

  function modalMetric(label, value, note, green = false) {
    return `<div class="modal-metric ${green ? "green" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
  }

  function findDriverApuRecord(driver) {
    const apu = state.analysis?.apu;
    if (!apu?.hasData) return null;
    return apu.byDriver.get(`code:${normalizeIdentity(driver.driverCode)}`) || apu.byDriver.get(`name:${normalizeIdentity(driver.driverName)}`) || null;
  }

  function closeDriverModal() {
    if (typeof els.driverModal.close === "function" && els.driverModal.open) els.driverModal.close();
    else els.driverModal.removeAttribute("open");
    state.activeDriverRecordIndex = null;
  }

  function updateSourceStatus() {
    const activePatterns = state.analysis?.sourceMode === "idle-reports"
      ? { summary: EXPECTED_FILES.summary, detail: EXPECTED_FILES.detail, ...IDLE_REPORT_FILES, ...OPTIONAL_FILES }
      : state.analysis?.sourceMode === "basic-reports"
        ? { ...BASIC_REPORT_FILES, ...OPTIONAL_FILES }
      : { ...EXPECTED_FILES, ...OPTIONAL_FILES };
    const fileRows = Object.entries(activePatterns).map(([key]) => {
      const file = state.sourceFiles[key];
      const isPtaFile = key === "ptaTracker" || key === "ptaFinder";
      const missingLabel = Object.prototype.hasOwnProperty.call(OPTIONAL_FILES, key) ? "Optional, not found" : "Missing";
      const detail = state.manualPta.active && isPtaFile
        ? `${file ? escapeHtml(file.name) : "No file"} · overridden by manual paste`
        : file
          ? `${escapeHtml(file.name)} · ${formatBytes(file.size)}`
          : missingLabel;
      return `<div class="source-row"><span>${escapeHtml(sourceLabel(key))}</span><span>${detail}</span></div>`;
    });
    const manualDetail = state.manualPta.active
      ? `${formatCount(state.manualPta.rowCount)} rows · active`
      : "Not active";
    fileRows.push(`<div class="source-row"><span>Manual PTA paste</span><span>${escapeHtml(manualDetail)}</span></div>`);
    els.sourceStatusList.innerHTML = fileRows.join("");
    updatePtaPasteUi();
  }

  function switchView(view) {
    document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const target = $(`${view}View`);
    if (target) target.classList.add("active-view");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function filterTable(tableId, query) {
    const normalized = query.trim().toLowerCase();
    document.querySelectorAll(`#${tableId} tbody tr`).forEach((row) => {
      row.hidden = normalized && !row.textContent.toLowerCase().includes(normalized);
    });
  }

  function scheduleAutoRefresh() {
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
    if (state.settings.refreshSeconds > 0 && (state.directoryHandle || state.staticFiles)) {
      state.refreshTimer = window.setInterval(() => refreshData(false), state.settings.refreshSeconds * 1000);
    }
  }

  function setBusy(busy) {
    els.refreshBtn.disabled = busy;
    els.refreshBtn.textContent = busy ? "…" : "↻";
  }

  function updateLastRefresh(value) {
    els.lastRefresh.textContent = typeof value === "string" ? value : value.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function showToast(message, error = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle("error", error);
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3800);
  }

  function cleanLeader(value) {
    const leader = value.replace(/\s+L\/H\s*$/i, "").trim();
    const known = [
      [/^FREEB-BRENDA FREEBURG/i, "Brenda Freeburg"],
      [/^RISHM-MIKE RISHOR/i, "Mike Rishor"],
      [/^VANHL-LISA STRICKLER/i, "Lisa Strickler"],
    ];
    return known.find(([pattern]) => pattern.test(leader))?.[1] || leader.replace(/^[A-Z]{4}-/, "").replace(/\s+/g, " ");
  }

  function parseHeaderDate(value, year) {
    if (value instanceof Date) return value;
    const raw = text(value);
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!match) return parseDate(value);
    let parsedYear = match[3] ? Number(match[3]) : year;
    if (parsedYear < 100) parsedYear += 2000;
    return validDate(parsedYear, Number(match[1]), Number(match[2]));
  }

  function parseDateTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const numeric = number(value);
    if (numeric !== null && numeric > 20000 && numeric < 80000) {
      const parsed = XLSX.SSF.parse_date_code(numeric);
      if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
    }
    return parseDate(value);
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return validDate(parsed.y, parsed.m, parsed.d);
    }
    const raw = text(value);
    if (!raw || raw.toUpperCase() === "N/A") return null;
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (us) {
      let year = Number(us[3]); if (year < 100) year += 2000;
      return validDate(year, Number(us[1]), Number(us[2]));
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function validDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function endOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); }
  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function shortDate(date) { return date.toLocaleDateString([], { month: "short", day: "numeric" }); }
  function formatDateRange(date) { return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }
  function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
  function number(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const cleaned = String(value).replace(/[$,%\s,]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function isFiniteNumber(value) { return typeof value === "number" && Number.isFinite(value); }
  function sum(values) { return values.reduce((total, value) => total + (Number(value) || 0), 0); }
  function average(values) { return values.length ? sum(values) / values.length : 0; }
  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * p;
    const base = Math.floor(position);
    const rest = position - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  }
  function increment(map, key) { map.set(key, (map.get(key) || 0) + 1); }
  function topMapKey(map) { return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ""; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function shallowEqual(a, b) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]); }

  function money(value, decimals = 0) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0); }
  function moneyCompact(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0); }
  function num(value, decimals = 0) { return value === null || value === undefined ? "--" : Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
  function nullableNum(value, decimals = 0) { return value === null || value === undefined ? "" : num(value, decimals); }
  function pct(value, decimals = 1) { return value === null || value === undefined ? "--" : `${(value * 100).toFixed(decimals)}%`; }
  function formatCount(value) { return Number(value || 0).toLocaleString("en-US"); }
  function formatBytes(bytes) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`; }
  function deltaLabel(value, suffix, positiveIsGood = true) {
    if (value === null || value === undefined || !Number.isFinite(value)) return suffix;
    const good = positiveIsGood ? value >= 0 : value <= 0;
    const arrow = value >= 0 ? "▲" : "▼";
    return `${arrow} ${Math.abs(value * 100).toFixed(1)}% ${suffix}${good ? "" : " · attention"}`;
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("vixen-fuel-dashboard", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readonly");
      const request = tx.objectStore("handles").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }
  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // Lightweight diagnostic hook used by the included validation script.
  window.VixenFuelDebug = {
    analyzeWorkbooks, analyzeBasicReports, analyzeIdleReports, analyzeApu, analyzePta, normalizePtaPasteRows,
    parseDelimitedText, parseBasicDriverPdfLines, analyzePdfDrivers,
    parseBasicDriverMetricsReport, parseBasicComplianceReport, parseBasicCostReport, parseBasicMpgReport,
    parseRolling7DayReport, parseRolling28DayHistory,
    parseDate, parseDateTime, sourceLabel, ptaTruckNoteKey, driverNoteKey, recentTruckWork
  };
})();
