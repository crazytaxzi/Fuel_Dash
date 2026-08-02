(() => {
  "use strict";

  const XLSX_API = window.XLSX;
  const NativeChart = window.Chart;
  if (!XLSX_API?.utils?.sheet_to_json || !NativeChart) return;

  const state = {
    rolling7: [],
    rolling28: [],
    lastTrend: [],
  };

  document.addEventListener("vixen:data-classified", (event) => {
    const routes = event.detail?.routes || {};
    ingest(routes).catch((error) => console.warn("[Idle history adapter]", error));
  });

  window.Chart = new Proxy(NativeChart, {
    construct(target, args) {
      const [canvas, config] = args;
      const canvasId = canvas?.id || canvas?.canvas?.id || "";
      const trend = buildFleetIdleTrend();
      const nextConfig = trend.length >= 2 && ["heroChart", "weeklyChart"].includes(canvasId)
        ? buildIdleChartConfig(config, canvasId, trend)
        : config;
      const chart = Reflect.construct(target, [canvas, nextConfig], target);
      if (trend.length >= 2 && ["heroChart", "weeklyChart"].includes(canvasId)) {
        state.lastTrend = trend;
        window.setTimeout(() => applyIdleHistoryUi(trend), 0);
      }
      return chart;
    },
  });

  window.VixenIdleHistoryAdapter = Object.freeze({
    refresh: () => applyIdleHistoryUi(buildFleetIdleTrend()),
    trend: () => buildFleetIdleTrend().map((week) => ({ ...week })),
  });

  async function ingest(routes) {
    const rolling7File = routes.rolling7Day || null;
    const rolling28File = routes.driverDetails || null;
    const [rolling7Workbook, rolling28Workbook] = await Promise.all([
      rolling7File ? readWorkbook(rolling7File) : null,
      rolling28File ? readWorkbook(rolling28File) : null,
    ]);

    state.rolling7 = rolling7Workbook ? parseRolling7(workbookRows(rolling7Workbook)) : [];
    state.rolling28 = rolling28Workbook ? parseRolling28(workbookRows(rolling28Workbook)) : [];
    const trend = buildFleetIdleTrend();
    if (trend.length) {
      state.lastTrend = trend;
      applyIdleHistoryUi(trend);
    }
  }

  async function readWorkbook(file) {
    if (file.vixenWorkbook) return file.vixenWorkbook;
    if (window.VixenResourceCoordinator?.readWorkbook) return window.VixenResourceCoordinator.readWorkbook(file);
    return XLSX_API.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false, dense: false });
  }

  function workbookRows(workbook) {
    const sheet = workbook?.Sheets?.[workbook?.SheetNames?.[0]];
    return sheet ? XLSX_API.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) : [];
  }

  function parseRolling7(rows) {
    if (!looksLikeRolling7(rows)) return [];
    const records = [];
    let currentDriver = "";
    let currentIsTotal = false;
    let fleetHistory = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      if (text(row[0])) {
        currentIsTotal = /^grand total$/i.test(text(row[0]));
        currentDriver = currentIsTotal ? "" : text(row[0]);
      }
      if ((!currentDriver && !currentIsTotal) || normalizeHeader(row[1]) !== "idle") continue;
      const history = [];
      for (let cursor = index; cursor < rows.length; cursor += 1) {
        const item = rows[cursor] || [];
        if (cursor > index && text(item[1])) break;
        const date = parseDate(item[2]);
        const idlePct = item.slice(10).map(normalizePercent).find(isFiniteNumber) ?? null;
        if (date && idlePct !== null) history.push({ date, idlePct });
      }
      history.sort((a, b) => a.date - b.date);
      if (history.length && currentIsTotal) fleetHistory = history;
      else if (history.length) records.push({ driverName: currentDriver, history });
    }
    records.fleetHistory = fleetHistory;
    return records;
  }

  function parseRolling28(rows) {
    if (!looksLikeDriverDetails(rows)) return [];
    const byDriver = new Map();
    let currentDriver = "";
    let currentIsTotal = false;
    const fleetHistory = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      if (text(row[1])) {
        currentIsTotal = /^total$/i.test(text(row[1]));
        currentDriver = currentIsTotal ? "" : text(row[1]);
      }
      const date = parseDate(row[2]);
      if ((!currentDriver && !currentIsTotal) || !date || normalizeHeader(row[13]) !== "cruise in time") continue;
      const idleRow = rows[index + 5] || [];
      const idlePct = idleRow.slice(14).map(normalizePercent).find(isFiniteNumber) ?? null;
      if (idlePct === null) continue;
      if (currentIsTotal) fleetHistory.push({ date, idlePct });
      else {
        const key = normalizeIdentity(currentDriver);
        if (!byDriver.has(key)) byDriver.set(key, { driverName: currentDriver, history: [] });
        byDriver.get(key).history.push({ date, idlePct });
      }
    }
    const records = [...byDriver.values()].map((record) => ({ ...record, history: record.history.sort((a, b) => a.date - b.date) }));
    records.fleetHistory = fleetHistory.sort((a, b) => a.date - b.date);
    return records;
  }

  function looksLikeRolling7(rows) {
    return normalizeHeader(rows?.[0]?.[10]) === "week start date" && normalizeHeader(rows?.[2]?.[1]) === "idle";
  }

  function looksLikeDriverDetails(rows) {
    const headerDates = (rows?.[0] || []).slice(14).filter((value) => parseDate(value)).length;
    const hasIdleMetric = rows.slice(0, 20).some((row) => normalizeHeader(row?.[13]) === "idle");
    return headerDates >= 4 && hasIdleMetric;
  }

  function buildFleetIdleTrend(limit = 4) {
    const byDate = new Map();
    const add = (date, field, value) => {
      if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !isFiniteNumber(value)) return;
      const key = dateKey(date);
      if (!byDate.has(key)) byDate.set(key, { date, idle7: [], idle28: [], fleet7: [], fleet28: [] });
      byDate.get(key)[field].push(value);
    };

    state.rolling7.forEach((record) => {
      if (isExcluded(record.driverName)) return;
      record.history.forEach((point) => add(point.date, "idle7", point.idlePct));
    });
    state.rolling28.forEach((record) => {
      if (isExcluded(record.driverName)) return;
      record.history.forEach((point) => add(point.date, "idle28", point.idlePct));
    });
    (state.rolling7.fleetHistory || []).forEach((point) => add(point.date, "fleet7", point.idlePct));
    (state.rolling28.fleetHistory || []).forEach((point) => add(point.date, "fleet28", point.idlePct));

    return [...byDate.values()]
      .sort((a, b) => a.date - b.date)
      .slice(-Math.max(1, limit))
      .map((entry) => ({
        date: entry.date,
        idle7DayPct: entry.fleet7?.at(-1) ?? (entry.idle7.length ? average(entry.idle7) : null),
        idle28DayPct: entry.fleet28?.at(-1) ?? (entry.idle28.length ? average(entry.idle28) : null),
        idle7DriverCount: entry.idle7.length,
        idle28DriverCount: entry.idle28.length,
      }));
  }

  function buildIdleChartConfig(config, canvasId, trend) {
    const labels = trend.map((week) => shortDate(week.date));
    const idle7 = trend.map((week) => week.idle7DayPct);
    const idle28 = trend.map((week) => week.idle28DayPct);
    const rolling = trend.map((_, index) => {
      const values = idle7.slice(Math.max(0, index - 3), index + 1).filter(isFiniteNumber);
      return values.length ? average(values) : null;
    });
    const datasets = canvasId === "heroChart"
      ? [
        { label: "7-Day Idle", data: idle7, borderColor: "#b55cff", backgroundColor: "rgba(168,85,247,.2)", fill: true, tension: .28, pointRadius: 3, pointBackgroundColor: "#d9a2ff", borderWidth: 2, spanGaps: true },
        { label: "28-Day Idle", data: idle28, borderColor: "#39ff63", backgroundColor: "transparent", borderDash: [7, 5], tension: .25, pointRadius: 2, borderWidth: 2, spanGaps: true },
      ]
      : [
        { label: "7-Day Idle", data: idle7, borderColor: "#b55cff", backgroundColor: "rgba(168,85,247,.14)", fill: true, tension: .3, pointRadius: 3, borderWidth: 2, spanGaps: true },
        { label: "4-Week Avg", data: rolling, borderColor: "#39ff63", backgroundColor: "transparent", borderDash: [6, 4], tension: .25, pointRadius: 0, borderWidth: 2, spanGaps: true },
      ];

    const existingOptions = config?.options || {};
    const existingPlugins = existingOptions.plugins || {};
    const existingScales = existingOptions.scales || {};
    return {
      ...config,
      data: { ...(config?.data || {}), labels, datasets },
      options: {
        ...existingOptions,
        interaction: { mode: "index", intersect: false },
        plugins: {
          ...existingPlugins,
          tooltip: {
            ...(existingPlugins.tooltip || {}),
            callbacks: { label: (context) => `${context.dataset.label}: ${formatPercent(context.parsed.y, 1)}` },
          },
        },
        scales: {
          ...existingScales,
          x: { ...(existingScales.x || {}), grid: { display: false } },
          y: {
            ...(existingScales.y || {}),
            beginAtZero: true,
            ticks: {
              ...((existingScales.y || {}).ticks || {}),
              callback: (value) => formatPercent(value, 0),
            },
          },
        },
      },
    };
  }

  function applyIdleHistoryUi(trend) {
    if (!trend?.length) return;
    const latest = trend.at(-1);
    const previous = trend.at(-2) || null;
    const change = previous && isFiniteNumber(latest.idle7DayPct) && isFiniteNumber(previous.idle7DayPct)
      ? latest.idle7DayPct - previous.idle7DayPct
      : null;
    const direction = change === null
      ? "No prior-week comparison is available."
      : `Fleet 7-day idle is ${change > 0 ? "up" : change < 0 ? "down" : "flat"} ${Math.abs(change * 100).toFixed(1)} percentage points from the prior week.`;

    const heading = document.querySelector(".hero-chart-wrap .chart-heading");
    if (heading) heading.textContent = "FLEET IDLE HISTORY";
    const calloutLabel = document.querySelector(".hero-chart-wrap .chart-callout span");
    if (calloutLabel) calloutLabel.textContent = "CURRENT 7-DAY IDLE";
    setText("heroSavings", formatPercent(latest.idle7DayPct, 1));
    const trendLabel = document.querySelector(".trend-total small");
    if (trendLabel) trendLabel.textContent = "CURRENT 7-DAY IDLE";
    setText("trendWeekTotal", formatPercent(latest.idle7DayPct, 1));
    setText("trendWeekDelta", change === null ? "No comparison" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(1)} pts vs prior`);

    const insight = document.getElementById("heroInsight");
    if (insight) {
      if (!insight.dataset.idleHistoryBase) insight.dataset.idleHistoryBase = insight.innerHTML;
      const base = insight.dataset.idleHistoryBase || "";
      insight.innerHTML = `<span data-idle-history-summary><strong>Four-week fleet idle.</strong> Current 7-day idle is <strong>${formatPercent(latest.idle7DayPct, 1)}</strong> and current 28-day idle is ${formatPercent(latest.idle28DayPct, 1)}. ${escapeHtml(direction)}</span>${base ? `<br><br>${base}` : ""}`;
    }
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function isExcluded(driverName) {
    const embeddedCode = text(driverName).match(/^\s*(\d{4,})\b/)?.[1] || "";
    return Boolean(window.VixenReportExclusions?.matches?.({ driverName, driverCode: embeddedCode }));
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) {
      const parsed = XLSX_API.SSF?.parse_date_code?.(value);
      if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizePercent(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value > 1.5 ? value / 100 : value;
    const match = text(value).match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return text(value).includes("%") || parsed > 1.5 ? parsed / 100 : parsed;
  }

  function normalizeHeader(value) {
    return text(value).toLowerCase().replace(/[%#]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function normalizeIdentity(value) {
    return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function shortDate(date) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function average(values) {
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function formatPercent(value, decimals) {
    return isFiniteNumber(value) ? `${(value * 100).toFixed(decimals)}%` : "--";
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
