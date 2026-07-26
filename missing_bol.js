(() => {
  "use strict";

  const DAY_MS = 86400000;
  const TRIP_PATTERN = /\b([A-Z]{2}\d{4})\b/i;
  const DRIVER_CODE_PATTERN = /\b(?:[A-Z]{5}\d|[A-Z]{5,6}|\d{5,6})\b/i;
  const EXPECTED_TRUCK_MIN = 200000;
  const EXPECTED_TRUCK_MAX = 400000;
  const state = {
    loading: false,
    lastSignature: "",
    lastLoadedAt: 0,
    records: [],
    assignments: new Map(),
  };

  installUi();
  document.addEventListener("DOMContentLoaded", () => {
    loadMissingBols(true);
    const refreshButton = document.getElementById("refreshBtn");
    refreshButton?.addEventListener("click", () => window.setTimeout(() => loadMissingBols(true), 250));
    document.querySelector('[data-view="bols"]')?.addEventListener("click", () => {
      if (Date.now() - state.lastLoadedAt > 60000) loadMissingBols(false);
    });
    const lastRefresh = document.getElementById("lastRefresh");
    if (lastRefresh && "MutationObserver" in window) {
      let timer = null;
      new MutationObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => loadMissingBols(false), 400);
      }).observe(lastRefresh, { childList: true, subtree: true, characterData: true });
    }
  });

  function installUi() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="bols"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "bols";
      button.innerHTML = "<span>▦</span>Missing BOLs";
      const pta = nav.querySelector('[data-view="pta"]');
      if (pta) pta.insertAdjacentElement("afterend", button);
      else nav.append(button);
    }

    if (!document.getElementById("bolsView")) {
      const section = document.createElement("section");
      section.id = "bolsView";
      section.className = "view table-view";
      section.innerHTML = `
        <div class="view-heading">
          <div><span class="eyebrow">MISSING PAPERWORK FOLLOW-UP</span><h2>Missing BOLs</h2></div>
          <input class="table-search" data-table="missingBolTable" placeholder="Search trip, leader, driver, truck..." />
        </div>
        <div class="table-explainer"><strong>Oldest first.</strong> The report is identified by an <code>Unbilled</code> column. Truck numbers are matched from the driver code in <code>Last Dispatched</code> against the other XLSX reports in the data folder.</div>
        <div id="missingBolSummary" class="bol-summary-grid"></div>
        <div id="missingBolMessage" class="bol-message">Looking for an Unbilled workbook in the data folder…</div>
        <div id="missingBolTableShell" class="table-shell hidden">
          <table id="missingBolTable">
            <thead><tr><th>Oldest first</th><th>Trip</th><th>Driver leader</th><th>Driver code</th><th>Truck</th><th>Match status</th><th>Source</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>`;
      const exceptions = document.getElementById("exceptionsView");
      if (exceptions) exceptions.insertAdjacentElement("beforebegin", section);
      else document.querySelector(".main-panel")?.append(section);
    }

    if (!document.getElementById("missingBolStyles")) {
      const style = document.createElement("style");
      style.id = "missingBolStyles";
      style.textContent = `
        .bol-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
        .bol-summary-card{padding:14px 16px;border:1px solid var(--line);background:rgba(8,16,22,.88)}
        .bol-summary-card span{display:block;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
        .bol-summary-card strong{display:block;margin-top:5px;font-size:22px;color:var(--white)}
        .bol-message{padding:24px;border:1px dashed rgba(168,85,247,.35);background:rgba(168,85,247,.05);color:var(--muted);text-align:center}
        .bol-match{font-weight:850}.bol-match-ok{color:var(--green)}.bol-match-warning{color:var(--amber)}.bol-match-missing{color:var(--red)}
        .bol-secondary{display:block;margin-top:3px;color:var(--muted);font-size:10px}
        @media(max-width:900px){.bol-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:520px){.bol-summary-grid{grid-template-columns:1fr}}
      `;
      document.head.append(style);
    }
  }

  async function loadMissingBols(force) {
    if (state.loading) return;
    state.loading = true;
    setMessage("Scanning XLSX files for the Unbilled report and driver-to-truck assignments…");
    try {
      const manifestResponse = await fetch("data-manifest.json", { cache: "no-store" });
      if (!manifestResponse.ok) throw new Error("The data-folder manifest is unavailable. Launch the dashboard with the normal PowerShell launcher.");
      const manifest = (await manifestResponse.json()).filter((item) => /\.xlsx$/i.test(item?.name || ""));
      const signature = manifest.map((item) => `${item.path}|${item.size}|${item.lastModified}`).join("||");
      if (!force && state.lastSignature === signature && state.records.length) {
        state.loading = false;
        return;
      }
      state.lastSignature = signature;
      if (!manifest.length) throw new Error("No XLSX files were found in the data folder.");

      const workbooks = [];
      for (const item of manifest) {
        try {
          const response = await fetch(encodeURI(item.path), { cache: "no-store" });
          if (!response.ok) continue;
          const workbook = XLSX.read(await response.arrayBuffer(), {
            type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false,
          });
          workbooks.push({ item, workbook });
        } catch (error) {
          console.warn(`[Missing BOLs] Could not inspect ${item.name}`, error);
        }
      }

      const candidates = workbooks.map(findUnbilledCandidate).filter(Boolean)
        .sort((a, b) => b.score - a.score || modifiedTime(b.item) - modifiedTime(a.item));
      if (!candidates.length) {
        render([], { sourceName: "Not found", assignmentCount: 0, datedCount: 0 });
        setMessage("No worksheet with Unbilled, Driver Leader, and Last Dispatched columns was recognized.");
        return;
      }

      const source = candidates[0];
      const wantedCodes = collectUnbilledDriverCodes(source);
      const assignments = buildAssignmentLookup(
        workbooks.filter((entry) => entry.item.path !== source.item.path),
        wantedCodes,
      );
      const records = parseUnbilledRecords(source, assignments);
      state.records = records;
      state.assignments = assignments;
      state.lastLoadedAt = Date.now();
      render(records, {
        sourceName: source.item.name,
        assignmentCount: assignments.size,
        datedCount: records.filter((record) => record.sortDate).length,
      });
      if (!records.length) setMessage(`The Unbilled worksheet was found in ${source.item.name}, but no trip rows matching LLDDDD were recognized.`);
      else hideMessage();
    } catch (error) {
      console.error("[Missing BOLs]", error);
      state.records = [];
      render([], { sourceName: "Unavailable", assignmentCount: 0, datedCount: 0 });
      setMessage(error.message || "The Missing BOL report could not be loaded.", true);
    } finally {
      state.loading = false;
    }
  }

  function findUnbilledCandidate(entry) {
    let best = null;
    for (const sheetName of entry.workbook.SheetNames.slice(0, 12)) {
      const rows = sheetRows(entry.workbook, sheetName);
      for (let rowIndex = 0; rowIndex < Math.min(rows.length, 60); rowIndex += 1) {
        const headers = rows[rowIndex] || [];
        const unbilled = findHeader(headers, ["unbilled"]);
        const leader = findHeader(headers, ["driver leader"]);
        const dispatched = findHeader(headers, ["last dispatched"]);
        if (unbilled < 0 || leader < 0 || dispatched < 0) continue;
        let trip = findHeader(headers, ["trip number", "trip #", "trip no", "trip"]);
        if (trip < 0) trip = inferTripColumn(rows, rowIndex + 1);
        const tripHits = trip >= 0 ? sampleTripHits(rows, rowIndex + 1, trip) : 0;
        const score = 22 + (trip >= 0 ? 5 : 0) + Math.min(8, tripHits * 2);
        if (!best || score > best.score) {
          best = { ...entry, sheetName, rows, headerRow: rowIndex, columns: { unbilled, leader, dispatched, trip }, score };
        }
      }
    }
    return best;
  }

  function inferTripColumn(rows, startRow) {
    const width = Math.max(0, ...rows.slice(startRow, startRow + 50).map((row) => row?.length || 0));
    let best = -1;
    let bestHits = 0;
    for (let column = 0; column < width; column += 1) {
      const hits = sampleTripHits(rows, startRow, column);
      if (hits > bestHits) { bestHits = hits; best = column; }
    }
    return bestHits >= 2 ? best : -1;
  }

  function sampleTripHits(rows, startRow, column) {
    return rows.slice(startRow, startRow + 80).reduce((count, row) => count + (TRIP_PATTERN.test(String(row?.[column] ?? "")) ? 1 : 0), 0);
  }

  function parseUnbilledRecords(source, assignments) {
    const { rows, headerRow, columns } = source;
    const headers = rows[headerRow] || [];
    const fallbackDateColumn = findHeader(headers, ["unbilled date", "trip date", "delivery date", "completed date", "created date", "date"]);
    const records = [];
    for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const trip = extractTrip(columns.trip >= 0 ? row[columns.trip] : row.join(" "));
      if (!trip) continue;
      const driverLeader = cleanText(row[columns.leader]);
      const driverCode = extractDriverCode(row[columns.dispatched]);
      const unbilledRaw = row[columns.unbilled];
      const unbilledDate = parseDateValue(unbilledRaw) || (fallbackDateColumn >= 0 ? parseDateValue(row[fallbackDateColumn]) : null);
      const ageDays = unbilledDate ? null : parseAgeDays(unbilledRaw);
      const match = driverCode ? assignments.get(driverCode) : null;
      const selected = match?.candidates?.[0] || null;
      const distinctTrucks = match ? [...new Set(match.candidates.map((candidate) => candidate.truck))] : [];
      records.push({
        sourceRow: rowIndex + 1,
        trip,
        driverLeader: driverLeader || "Not listed",
        driverCode: driverCode || "Not recognized",
        unbilledRaw: cleanText(unbilledRaw),
        unbilledDate,
        ageDays,
        sortDate: unbilledDate || (ageDays !== null ? new Date(Date.now() - ageDays * DAY_MS) : null),
        truck: selected?.truck || "Not matched",
        assignmentSource: selected?.source || "No driver-to-truck match",
        assignmentDate: selected?.date || null,
        conflict: distinctTrucks.length > 1,
        outsideExpectedRange: Boolean(selected && !selected.expectedRange),
        sourceName: source.item.name,
      });
    }
    records.sort((a, b) => {
      const aTime = a.sortDate?.getTime();
      const bTime = b.sortDate?.getTime();
      if (Number.isFinite(aTime) && Number.isFinite(bTime)) return aTime - bTime || a.sourceRow - b.sourceRow;
      if (Number.isFinite(aTime)) return -1;
      if (Number.isFinite(bTime)) return 1;
      return a.sourceRow - b.sourceRow;
    });
    return records;
  }

  function collectUnbilledDriverCodes(source) {
    const codes = new Set();
    for (let rowIndex = source.headerRow + 1; rowIndex < source.rows.length; rowIndex += 1) {
      const code = extractDriverCode(source.rows[rowIndex]?.[source.columns.dispatched]);
      if (code) codes.add(code);
    }
    return codes;
  }

  function buildAssignmentLookup(entries, wantedCodes) {
    const lookup = new Map();
    for (const entry of entries) {
      for (const sheetName of entry.workbook.SheetNames.slice(0, 15)) {
        const rows = sheetRows(entry.workbook, sheetName);
        const mapping = findAssignmentColumns(rows, wantedCodes);
        if (!mapping) continue;
        const maxRows = Math.min(rows.length, 30000);
        for (let rowIndex = mapping.headerRow + 1; rowIndex < maxRows; rowIndex += 1) {
          const row = rows[rowIndex] || [];
          const code = extractDriverCode(row[mapping.driver]);
          const truck = extractTruck(row[mapping.truck]);
          if (!code || !truck || (wantedCodes.size && !wantedCodes.has(code))) continue;
          const date = mapping.date >= 0 ? parseDateValue(row[mapping.date]) : null;
          const candidate = {
            code,
            truck,
            date,
            expectedRange: isExpectedTruck(truck),
            source: `${entry.item.name} · ${sheetName} · row ${rowIndex + 1}`,
            fileModified: modifiedTime(entry.item),
            rowIndex,
          };
          if (!lookup.has(code)) lookup.set(code, { candidates: [] });
          lookup.get(code).candidates.push(candidate);
        }
      }
    }
    for (const match of lookup.values()) {
      match.candidates.sort((a, b) => {
        if (a.expectedRange !== b.expectedRange) return a.expectedRange ? -1 : 1;
        const aDate = a.date?.getTime() || 0;
        const bDate = b.date?.getTime() || 0;
        return bDate - aDate || b.fileModified - a.fileModified || b.rowIndex - a.rowIndex;
      });
    }
    return lookup;
  }

  function findAssignmentColumns(rows, wantedCodes) {
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 50); rowIndex += 1) {
      const headers = rows[rowIndex] || [];
      const truck = findHeader(headers, ["truck number", "truck #", "truck", "tractor number", "tractor #", "tractor", "unit number", "unit #", "unit", "power unit"]);
      if (truck < 0 || /status|type|count/.test(normalizeHeader(headers[truck]))) continue;
      let driver = findHeader(headers, ["driver code", "driver id", "employee code", "employee id", "driver current position code", "last dispatched"]);
      if (driver < 0) {
        const generic = findHeader(headers, ["driver"]);
        if (generic >= 0) {
          const samples = rows.slice(rowIndex + 1, rowIndex + 61)
            .map((row) => extractDriverCode(row?.[generic]))
            .filter((code) => code && wantedCodes.has(code));
          if (samples.length >= 1) driver = generic;
        }
      }
      if (driver < 0 || driver === truck) continue;
      const date = findHeader(headers, ["assignment date", "dispatch date", "report date", "week ending", "week end", "date"]);
      return { headerRow: rowIndex, driver, truck, date };
    }
    return null;
  }

  function render(records, meta) {
    const summary = document.getElementById("missingBolSummary");
    const tableShell = document.getElementById("missingBolTableShell");
    const tbody = document.querySelector("#missingBolTable tbody");
    if (!summary || !tableShell || !tbody) return;
    const matched = records.filter((record) => record.truck !== "Not matched").length;
    const unmatched = records.length - matched;
    const conflicts = records.filter((record) => record.conflict || record.outsideExpectedRange).length;
    summary.innerHTML = [
      ["Missing BOL trips", records.length],
      ["Truck matched", matched],
      ["Needs matching", unmatched],
      ["Assignment warnings", conflicts],
    ].map(([label, value]) => `<article class="bol-summary-card"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString("en-US")}</strong></article>`).join("");

    tbody.innerHTML = records.map((record) => {
      const statusClass = record.truck === "Not matched" ? "bol-match-missing" : record.conflict || record.outsideExpectedRange ? "bol-match-warning" : "bol-match-ok";
      const status = record.truck === "Not matched"
        ? "No truck match"
        : record.conflict
          ? "Multiple trucks found; newest used"
          : record.outsideExpectedRange
            ? "Matched outside normal 200000–400000 range"
            : "Matched";
      return `<tr>
        <td>${escapeHtml(formatUnbilled(record))}</td>
        <td><strong>${escapeHtml(record.trip)}</strong></td>
        <td>${escapeHtml(record.driverLeader)}</td>
        <td>${escapeHtml(record.driverCode)}</td>
        <td><strong>${escapeHtml(record.truck)}</strong></td>
        <td><span class="bol-match ${statusClass}">${escapeHtml(status)}</span><small class="bol-secondary">${escapeHtml(record.assignmentSource)}</small></td>
        <td>${escapeHtml(record.sourceName)}<small class="bol-secondary">row ${record.sourceRow}</small></td>
      </tr>`;
    }).join("");
    tableShell.classList.toggle("hidden", records.length === 0);
    document.getElementById("missingBolMessage")?.classList.toggle("hidden", records.length > 0);
    console.info("[Missing BOLs]", { source: meta.sourceName, trips: records.length, assignments: meta.assignmentCount });
  }

  function formatUnbilled(record) {
    if (record.unbilledDate) return record.unbilledDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    if (record.ageDays !== null) return `${record.ageDays.toLocaleString("en-US")} day${record.ageDays === 1 ? "" : "s"}`;
    return record.unbilledRaw || "Date not recognized";
  }

  function setMessage(message, error = false) {
    const element = document.getElementById("missingBolMessage");
    if (!element) return;
    element.textContent = message;
    element.classList.remove("hidden");
    element.style.borderColor = error ? "rgba(255,79,104,.55)" : "";
  }

  function hideMessage() {
    document.getElementById("missingBolMessage")?.classList.add("hidden");
  }

  function sheetRows(workbook, sheetName) {
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: true });
  }

  function findHeader(headers, aliases) {
    const normalized = headers.map(normalizeHeader);
    for (const alias of aliases.map(normalizeHeader)) {
      const exact = normalized.findIndex((header) => header === alias);
      if (exact >= 0) return exact;
    }
    for (const alias of aliases.map(normalizeHeader)) {
      const partial = normalized.findIndex((header) => header.includes(alias));
      if (partial >= 0) return partial;
    }
    return -1;
  }

  function normalizeHeader(value) {
    return String(value ?? "").toLowerCase().replace(/[%#]/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function extractTrip(value) {
    return String(value ?? "").toUpperCase().match(TRIP_PATTERN)?.[1] || "";
  }

  function extractDriverCode(value) {
    return String(value ?? "").trim().toUpperCase().match(DRIVER_CODE_PATTERN)?.[0] || "";
  }

  function extractTruck(value) {
    const matches = String(value ?? "").match(/\b\d{6}\b/g) || [];
    const expected = matches.find(isExpectedTruck);
    return expected || matches[0] || "";
  }

  function isExpectedTruck(value) {
    const truck = Number(value);
    return Number.isInteger(truck) && truck >= EXPECTED_TRUCK_MIN && truck <= EXPECTED_TRUCK_MAX;
  }

  function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + value * DAY_MS);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const text = cleanText(value);
    if (!text || TRIP_PATTERN.test(text)) return null;
    if (!/[\/-]|[A-Za-z]{3,}/.test(text)) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function parseAgeDays(value) {
    if (typeof value === "number" && value >= 0 && value < 10000) return Math.round(value);
    const match = cleanText(value).match(/\b(\d+(?:\.\d+)?)\s*(?:day|days|d)\b/i);
    return match ? Math.round(Number(match[1])) : null;
  }

  function modifiedTime(item) {
    return Date.parse(item?.lastModified || "") || 0;
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
