(() => {
  "use strict";

  const CORE_ROLES = Object.freeze(["rolling7Day", "driverDetails"]);
  const OPTIONAL_ROLES = Object.freeze(["detail", "driverAssignments", "ptaTracker", "ptaFinder", "apu"]);
  const cache = new Map();

  const contract = Object.freeze({
    mode: "driver-centric-two-report",
    required: CORE_ROLES,
    optional: OPTIONAL_ROLES,
    requiredLabels: Object.freeze({
      rolling7Day: "Rolling 7 Day",
      driverDetails: "Driver Details",
    }),
    summary: "Rolling 7 Day supplies current idle and raw hours. Driver Details supplies 28-day idle, MPG, moving MPG, OOR, miles, gallons, and current driver metadata.",
  });

  window.VixenReportContract = contract;
  install();

  function install() {
    const inspector = window.VixenDataInspector || window.VixenSmartDataLoader;
    if (!inspector?.classifyFiles || inspector.classifyFiles.__vixenDriverAdapter) return;

    const original = inspector.classifyFiles.bind(inspector);
    const classifyFiles = async (files) => {
      const result = await original(files);
      const routes = result?.routes || result || {};
      const hasNativePair = routes.rollingIdleCsv && routes.rolling28IdleCsv;
      const hasCorePair = CORE_ROLES.every((role) => routes[role]);

      if (!hasNativePair && hasCorePair) {
        const adapted = await adaptCoreReports(routes.rolling7Day, routes.driverDetails);
        routes.rollingIdleCsv = adapted.rollingIdleCsv;
        routes.rolling28IdleCsv = adapted.rolling28IdleCsv;
        if (result?.diagnostics) {
          result.diagnostics.routes = routes;
          result.diagnostics.adapter = {
            mode: contract.mode,
            required: [...contract.required],
            optional: [...contract.optional],
            generated: [adapted.rollingIdleCsv.name, adapted.rolling28IdleCsv.name],
          };
        }
        document.dispatchEvent(new CustomEvent("vixen:report-contract-ready", {
          detail: { contract, routes, adapted: true },
        }));
      } else {
        document.dispatchEvent(new CustomEvent("vixen:report-contract-ready", {
          detail: { contract, routes, adapted: false },
        }));
      }
      return result;
    };
    classifyFiles.__vixenDriverAdapter = true;
    classifyFiles.__nativeClassifyFiles = original;
    inspector.classifyFiles = classifyFiles;
  }

  async function adaptCoreReports(rolling7File, driverDetailsFile) {
    const signature = [fileSignature(rolling7File), fileSignature(driverDetailsFile)].join("||");
    if (cache.has(signature)) return cache.get(signature);

    const [rollingWorkbook, detailsWorkbook] = await Promise.all([
      readWorkbook(rolling7File),
      readWorkbook(driverDetailsFile),
    ]);
    const rollingRows = workbookRows(rollingWorkbook);
    const detailRows = workbookRows(detailsWorkbook);
    const rollingFlat = flattenRolling7(rollingRows);
    const detailFlat = flattenDriverDetails(detailRows);

    if (!rollingFlat.length) throw new Error("Rolling 7 Day was recognized, but no usable driver idle rows were found.");
    if (!detailFlat.length) throw new Error("Driver Details was recognized, but no usable 28-day driver rows were found.");

    const rollingIdleCsv = buildSyntheticFile("driver-core-7-day.xlsx", rolling7Headers(), rollingFlat);
    const rolling28IdleCsv = buildSyntheticFile("driver-core-28-day.xlsx", rolling28Headers(), detailFlat);
    rollingIdleCsv.vixenSourceFiles = [rolling7File.name];
    rolling28IdleCsv.vixenSourceFiles = [driverDetailsFile.name];
    rollingIdleCsv.vixenSyntheticRole = "rollingIdleCsv";
    rolling28IdleCsv.vixenSyntheticRole = "rolling28IdleCsv";

    const value = { rollingIdleCsv, rolling28IdleCsv };
    cache.set(signature, value);
    while (cache.size > 6) cache.delete(cache.keys().next().value);
    return value;
  }

  function flattenRolling7(rows) {
    const grouped = new Map();
    let identity = "";
    let metric = "";

    for (const row of rows) {
      if (clean(row?.[0]) && !/^grand total$/i.test(clean(row[0]))) identity = clean(row[0]);
      if (clean(row?.[1])) metric = normalizeHeader(row[1]);
      const date = parseDate(row?.[2]);
      if (!identity || !date) continue;
      const field = rolling7Field(metric);
      if (!field) continue;
      const key = `${normalizeIdentity(identity)}|${dateKey(date)}`;
      const record = grouped.get(key) || {
        identity,
        date,
        costCenter: clean(row?.[3]),
        opsLob: clean(row?.[4]),
        driverLeader: clean(row?.[6]),
        fleetLeader: clean(row?.[7]),
        unitCode: normalizeTruck(row?.[8]),
      };
      const value = firstNumber(row?.slice(10));
      if (value !== null) record[field] = value;
      if (!record.unitCode) record.unitCode = normalizeTruck(row?.[8]);
      grouped.set(key, record);
    }

    return [...grouped.values()]
      .filter((record) => isFiniteNumber(record.engineHours) && isFiniteNumber(record.idleHours))
      .sort(compareIdentityDate)
      .map((record) => [
        record.identity,
        "Idle",
        record.date,
        record.engineHours,
        record.idleHours,
        record.dispatchMiles ?? null,
        record.qualcommMiles ?? null,
        record.costCenter,
        record.driverLeader,
        record.fleetLeader,
        record.opsLob,
        record.unitCode,
        record.idlePct ?? (record.engineHours > 0 ? record.idleHours / record.engineHours : null),
      ]);
  }

  function flattenDriverDetails(rows) {
    const grouped = new Map();
    let identity = "";
    let current = null;

    for (const row of rows) {
      const date = parseDate(row?.[2]);
      const label = normalizeHeader(row?.[13]);
      const rowIdentity = clean(row?.[1]);
      if (date && label === "cruise in time" && rowIdentity && !/^total$/i.test(rowIdentity)) identity = rowIdentity;
      if (identity && date && label === "cruise in time") {
        const key = `${normalizeIdentity(identity)}|${dateKey(date)}`;
        current = grouped.get(key) || {
          identity,
          date,
          costCenter: clean(row?.[4]),
          driverLeader: clean(row?.[7]),
          fleetLeader: clean(row?.[8]),
          unitCode: "",
        };
        grouped.set(key, current);
      }
      if (!current || !label) continue;
      const field = driverDetailsField(label);
      if (!field) continue;
      const value = firstNumber(row?.slice(14));
      if (value !== null) current[field] = value;
    }

    return [...grouped.values()]
      .filter((record) => isFiniteNumber(record.engineHours28Day) && isFiniteNumber(record.idleHours28Day))
      .sort(compareIdentityDate)
      .map((record) => [
        record.identity,
        record.date,
        record.engineHours28Day,
        record.idleHours28Day,
        record.dispatchMpg ?? null,
        record.movingMpg ?? null,
        record.oorPct ?? null,
        record.dispatchMiles ?? null,
        record.fuelGallons ?? null,
        record.qualcommMiles ?? null,
        record.costCenter,
        record.driverLeader,
        record.fleetLeader,
        record.unitCode,
      ]);
  }

  function rolling7Field(metric) {
    if (metric === "idle" || metric === "idle percent") return "idlePct";
    if (metric.includes("rolling 7 day engine time")) return "engineHours";
    if (metric.includes("rolling 7 day idle time")) return "idleHours";
    if (metric.includes("rolling 7 day dispatch miles")) return "dispatchMiles";
    if (metric.includes("rolling 7 day qualcomm miles")) return "qualcommMiles";
    return "";
  }

  function driverDetailsField(label) {
    if (label === "dispatch mpg") return "dispatchMpg";
    if (label === "moving mpg") return "movingMpg";
    if (label === "oor") return "oorPct";
    if (label.includes("rolling 28 day dispatch miles")) return "dispatchMiles";
    if (label.includes("rolling 28 day fuel gallons")) return "fuelGallons";
    if (label.includes("rolling 28 day qualcomm miles")) return "qualcommMiles";
    if (label.includes("rolling 28 day engine time")) return "engineHours28Day";
    if (label.includes("rolling 28 day idle time")) return "idleHours28Day";
    return "";
  }

  function rolling7Headers() {
    return [
      "Group By Copy", "Measure Names", "Week Start Date",
      "Rolling 7 Day Engine Time (60)", "Rolling 7 Day Idle Time (60)",
      "Rolling 7 Day Dispatch Miles", "Rolling 7 Day Qualcomm Miles",
      "Cost Center", "Driver Leader", "Fleet Leader", "Ops LOB", "Unit Code", "Measure Values",
    ];
  }

  function rolling28Headers() {
    return [
      "Group By Copy", "Week Start Date",
      "Rolling 28 Day Engine Time (60)", "Rolling 28 Day Idle Time (60)",
      "Dispatch MPG", "Moving MPG", "OOR",
      "Rolling 28 Day Dispatch Miles", "Rolling 28 Day Fuel Gallons", "Rolling 28 Day Qualcomm Miles",
      "Cost Center", "Driver Leader", "Fleet Leader", "Unit Code",
    ];
  }

  function buildSyntheticFile(name, headers, rows) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Driver Core");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
    const file = new File([bytes], name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      lastModified: Date.now(),
    });
    file.vixenWorkbook = workbook;
    file.vixenSynthetic = true;
    window.VixenResourceCoordinator?.rememberWorkbook?.(file, workbook);
    return file;
  }

  async function readWorkbook(file) {
    if (file?.vixenWorkbook) return file.vixenWorkbook;
    if (window.VixenResourceCoordinator?.readWorkbook) return window.VixenResourceCoordinator.readWorkbook(file);
    return XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false, dense: false });
  }

  function workbookRows(workbook) {
    if (!workbook?.SheetNames?.length) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
      header: 1, raw: true, defval: null, blankrows: true,
    });
  }

  function firstNumber(values) {
    for (const value of values || []) {
      const parsed = number(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function number(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = clean(value);
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      let year = Number(match[3]);
      if (year < 100) year += 2000;
      const date = new Date(year, Number(match[1]) - 1, Number(match[2]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function compareIdentityDate(a, b) {
    return normalizeIdentity(a.identity).localeCompare(normalizeIdentity(b.identity)) || a.date - b.date;
  }

  function fileSignature(file) {
    return [file?.name, file?.size, file?.lastModified].join("|");
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function normalizeHeader(value) {
    return clean(value).toLowerCase().replace(/[%#]/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeIdentity(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizeTruck(value) {
    const truck = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
    return truck === "*" ? "" : truck;
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  window.VixenReportAdapterTest = Object.freeze({
    flattenRolling7,
    flattenDriverDetails,
    rolling7Headers,
    rolling28Headers,
  });
})();
