(() => {
  "use strict";

  const TRIP_PATTERN = /\b([A-Z]{3}\d{4})\b/i;
  const DRIVER_CODE_PATTERN = /^(?:[A-Z]{5}\d|[A-Z]{4,6}|\d{5,6})$/i;
  const MAX_RENDERED_ROWS = 2000;
  const state = {
    loading: false,
    records: [],
    candidate: null,
    diagnostics: [],
    lastSignature: "",
    lastLoadedAt: 0,
    lastFiles: [],
    focusedOnce: false,
    initialized: false,
  };

  window.VixenMissingBolLive = state;
  installUi();
  bindEvents();

  function bindEvents() {
    if (state.initialized) return;
    state.initialized = true;

    document.addEventListener("vixen:data-classified", (event) => {
      const files = uniqueFiles(event.detail?.files || Object.values(event.detail?.routes || {}));
      state.lastFiles = files;
      loadFromFiles(files, false).catch((error) => handleLoadError(error));
    });

    document.addEventListener("vixen:bootstrap-complete", () => {
      installUi();
      bindUiControls();
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        installUi();
        bindUiControls();
      }, { once: true });
    } else {
      bindUiControls();
    }
  }

  function bindUiControls() {
    const bolButton = document.querySelector('[data-view="bols"]');
    if (bolButton && bolButton.dataset.vixenBolBound !== "1") {
      bolButton.dataset.vixenBolBound = "1";
      bolButton.addEventListener("click", () => {
        state.focusedOnce = true;
        if (!state.records.length && state.lastFiles.length) {
          loadFromFiles(state.lastFiles, true).catch((error) => handleLoadError(error));
        }
      });
    }

    const search = document.querySelector('#bolsView input[data-table="missingBolTable"]');
    if (search && search.dataset.vixenBolBound !== "1") {
      search.dataset.vixenBolBound = "1";
      search.addEventListener("input", () => render(search.value));
    }
  }

  function installUi() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="bols"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "bols";
      button.innerHTML = '<span>▦</span><span class="bol-nav-label">Missing BOLs</span><strong class="bol-nav-count">0</strong>';
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
          <input class="table-search" data-table="missingBolTable" placeholder="Search trip, leader, or driver code..." />
        </div>
        <div class="table-explainer"><strong>Oldest first.</strong> Missing BOL data now reuses workbooks already loaded by the dashboard. No second download, no second spreadsheet autopsy.</div>
        <div id="missingBolSummary" class="bol-summary-grid"></div>
        <div id="missingBolMessage" class="bol-message">Waiting for the dashboard report classifier...</div>
        <div id="missingBolTableShell" class="table-shell hidden">
          <table id="missingBolTable">
            <thead><tr><th>Oldest first</th><th>Trip</th><th>Driver leader</th><th>Driver code</th><th>Source</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>`;
      const exceptions = document.getElementById("exceptionsView");
      if (exceptions) exceptions.insertAdjacentElement("beforebegin", section);
      else document.querySelector(".main-panel")?.append(section);
    }

    if (!document.getElementById("missingBolLiveStyles")) {
      const style = document.createElement("style");
      style.id = "missingBolLiveStyles";
      style.textContent = `
        .bol-nav-label{min-width:0}.bol-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(255,181,46,.14);border:1px solid rgba(255,181,46,.38);color:var(--amber);font-size:9px;text-align:center}
        .bol-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
        .bol-summary-card{padding:14px 16px;border:1px solid var(--line);border-radius:var(--radius-md,16px);background:rgba(8,16,22,.88)}
        .bol-summary-card span{display:block;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
        .bol-summary-card strong{display:block;margin-top:5px;font-size:22px;color:var(--white)}
        .bol-message{padding:24px;border:1px dashed rgba(168,85,247,.35);border-radius:var(--radius-md,16px);background:rgba(168,85,247,.05);color:var(--muted);text-align:center}
        .bol-message.error{border-color:rgba(255,79,104,.5);color:#ff8797;background:rgba(255,79,104,.06)}
        .bol-secondary{display:block;margin-top:3px;color:var(--muted);font-size:10px}
        @media(max-width:900px){.bol-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `;
      document.head.append(style);
    }
  }

  async function loadFromFiles(files, force) {
    if (state.loading) return;
    const xlsxFiles = uniqueFiles(files).filter((file) => /\.xlsx$/i.test(file?.name || ""));
    const signature = xlsxFiles.map(fileSignature).sort().join("||");
    if (!force && signature && signature === state.lastSignature) return;

    state.loading = true;
    setMessage("Inspecting already-loaded workbooks for Missing BOL fields...");
    try {
      if (!xlsxFiles.length) throw new Error("No XLSX files were available to inspect for Missing BOL records.");
      const candidates = [];
      state.diagnostics = [];

      for (const file of xlsxFiles) {
        try {
          const workbook = await readWorkbook(file);
          const candidate = inspectWorkbook(file, workbook);
          if (candidate) candidates.push(candidate);
          else state.diagnostics.push(`${file.name}: no matching Missing BOL header signature`);
        } catch (error) {
          state.diagnostics.push(`${file.name}: ${error?.message || error}`);
        }
      }

      candidates.sort((a, b) => b.score - a.score || (b.file.lastModified || 0) - (a.file.lastModified || 0));
      state.lastSignature = signature;
      state.lastLoadedAt = Date.now();
      state.candidate = candidates[0] || null;
      state.records = state.candidate ? parseRecords(state.candidate) : [];
      render(document.querySelector('#bolsView input[data-table="missingBolTable"]')?.value || "");

      if (!state.candidate) {
        setMessage("No Missing BOL export was recognized. Expected Driver Leader, Last Dispatch Driver cd, Empty Call Date, and an order-number column.", true);
        maybeFocus(true);
      } else if (!state.records.length) {
        setMessage(`The report layout was recognized in ${state.candidate.file.name}, but no trip values matched the expected ABC1234 pattern.`, true);
        maybeFocus(true);
      } else {
        hideMessage();
        maybeFocus(false);
      }
    } finally {
      state.loading = false;
    }
  }

  async function readWorkbook(file) {
    if (file.vixenWorkbook) return file.vixenWorkbook;
    if (window.VixenResourceCoordinator?.readWorkbook) return window.VixenResourceCoordinator.readWorkbook(file);
    return XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false });
  }

  function inspectWorkbook(file, workbook) {
    let best = null;
    for (const sheetName of workbook.SheetNames.slice(0, 15)) {
      const rows = sheetRows(workbook, sheetName);
      const context = normalize(`${sheetName}\n${rows.slice(0, 20).flat().join("\n")}`);
      for (let headerRow = 0; headerRow < Math.min(rows.length, 100); headerRow += 1) {
        const headers = rows[headerRow] || [];
        const leader = findHeader(headers, ["driver leader"]);
        const driverCode = findHeader(headers, ["last dispatch driver cd", "last dispatch driver code", "last dispatched driver cd", "last dispatched"]);
        const date = findHeader(headers, ["empty call date", "unbilled date", "trip date", "delivery date", "created date"]);
        const orderColumns = uniqueIndexes([
          findHeader(headers, ["order #", "order number"]),
          findHeader(headers, ["tmex order #", "tmex order number"]),
          findHeader(headers, ["logistics order#", "logistics order #", "logistics order number"]),
        ]);
        if (leader < 0 || driverCode < 0 || date < 0 || !orderColumns.length) continue;

        const tripScores = orderColumns.map((column) => ({ column, hits: sampleTripHits(rows, headerRow + 1, column) })).sort((a, b) => b.hits - a.hits);
        let trip = tripScores[0]?.column ?? -1;
        let tripHits = tripScores[0]?.hits ?? 0;
        if (!tripHits) {
          const inferred = inferTripColumn(rows, headerRow + 1);
          trip = inferred.column;
          tripHits = inferred.hits;
        }

        const hasUnbilledContext = context.includes("unbilled");
        const score = 40 + Math.min(20, tripHits * 3) + (hasUnbilledContext ? 12 : 0);
        const candidate = {
          file,
          workbook,
          sheetName,
          rows,
          headerRow,
          columns: { leader, driverCode, date, trip, orderColumns },
          tripHits,
          hasUnbilledContext,
          score,
        };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
    return best;
  }

  function parseRecords(source) {
    const records = [];
    const maxRows = Math.min(source.rows.length, 50000);
    for (let rowIndex = source.headerRow + 1; rowIndex < maxRows; rowIndex += 1) {
      const row = source.rows[rowIndex] || [];
      const trip = extractTrip(source.columns.trip >= 0 ? row[source.columns.trip] : source.columns.orderColumns.map((column) => row[column]).join(" "));
      if (!trip) continue;
      const driverLeader = cleanText(row[source.columns.leader]) || "Not listed";
      const driverCode = extractDriverCode(row[source.columns.driverCode]) || "Not listed";
      const rawDate = row[source.columns.date];
      const date = parseDateValue(rawDate);
      records.push({
        trip,
        driverLeader,
        driverCode,
        rawDate: cleanText(rawDate),
        date,
        sourceRow: rowIndex + 1,
        sourceName: source.file.name,
        sheetName: source.sheetName,
      });
    }
    records.sort((a, b) => {
      const aTime = a.date?.getTime();
      const bTime = b.date?.getTime();
      if (Number.isFinite(aTime) && Number.isFinite(bTime)) return aTime - bTime || a.sourceRow - b.sourceRow;
      if (Number.isFinite(aTime)) return -1;
      if (Number.isFinite(bTime)) return 1;
      return a.sourceRow - b.sourceRow;
    });
    return records;
  }

  function render(searchTerm = "") {
    const tbody = document.querySelector("#missingBolTable tbody");
    const shell = document.getElementById("missingBolTableShell");
    const summary = document.getElementById("missingBolSummary");
    if (!tbody || !shell || !summary) return;

    const query = normalize(searchTerm);
    const filtered = query
      ? state.records.filter((record) => normalize(`${record.trip} ${record.driverLeader} ${record.driverCode} ${record.sourceName}`).includes(query))
      : state.records;
    const displayed = filtered.slice(0, MAX_RENDERED_ROWS);
    const recognizedCodes = state.records.filter((record) => DRIVER_CODE_PATTERN.test(record.driverCode)).length;
    const dated = state.records.filter((record) => record.date).length;
    const sourceName = state.candidate?.file?.name || "Not found";

    summary.innerHTML = [
      ["Missing BOL trips", state.records.length],
      ["Driver codes found", recognizedCodes],
      ["Rows with date", dated],
      ["Source", sourceName],
    ].map(([label, value]) => `<article class="bol-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

    updateNavCount(state.records.length);
    tbody.innerHTML = displayed.map((record) => `
      <tr>
        <td>${escapeHtml(formatDate(record.date) || record.rawDate || "Date not recognized")}</td>
        <td><strong>${escapeHtml(record.trip)}</strong></td>
        <td>${escapeHtml(record.driverLeader)}</td>
        <td>${escapeHtml(record.driverCode)}</td>
        <td>${escapeHtml(record.sourceName)}<span class="bol-secondary">${escapeHtml(record.sheetName)} · row ${record.sourceRow}</span></td>
      </tr>`).join("");
    shell.classList.toggle("hidden", !displayed.length);

    if (filtered.length > MAX_RENDERED_ROWS) {
      setMessage(`Showing the first ${MAX_RENDERED_ROWS.toLocaleString("en-US")} of ${filtered.length.toLocaleString("en-US")} matching rows. Narrow the search instead of asking the DOM to cosplay as a database.`);
    } else if (state.records.length) {
      hideMessage();
    }
  }

  function sheetRows(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) : [];
  }

  function findHeader(headers, aliases) {
    const normalized = headers.map(normalize);
    for (let index = 0; index < normalized.length; index += 1) {
      if (aliases.some((alias) => normalized[index] === normalize(alias) || normalized[index].includes(normalize(alias)))) return index;
    }
    return -1;
  }

  function sampleTripHits(rows, startRow, column) {
    let hits = 0;
    for (let index = startRow; index < Math.min(rows.length, startRow + 250); index += 1) {
      if (extractTrip(rows[index]?.[column])) hits += 1;
    }
    return hits;
  }

  function inferTripColumn(rows, startRow) {
    const scores = new Map();
    for (let index = startRow; index < Math.min(rows.length, startRow + 250); index += 1) {
      const row = rows[index] || [];
      row.forEach((value, column) => {
        if (extractTrip(value)) scores.set(column, (scores.get(column) || 0) + 1);
      });
    }
    const winner = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
    return { column: winner?.[0] ?? -1, hits: winner?.[1] ?? 0 };
  }

  function uniqueIndexes(indexes) {
    return [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0))];
  }

  function uniqueFiles(files) {
    const seen = new Set();
    return Array.from(files || []).filter((file) => {
      if (!file?.name) return false;
      const signature = fileSignature(file);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function fileSignature(file) {
    return `${file.name}|${file.size}|${file.lastModified || 0}`;
  }

  function extractTrip(value) {
    return cleanText(value).toUpperCase().match(TRIP_PATTERN)?.[1] || "";
  }

  function extractDriverCode(value) {
    const raw = cleanText(value).toUpperCase();
    if (DRIVER_CODE_PATTERN.test(raw)) return raw;
    return raw.match(/\b(?:[A-Z]{5}\d|[A-Z]{4,6}|\d{5,6})\b/)?.[0] || "";
  }

  function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) {
      const parsed = XLSX.SSF?.parse_date_code?.(value);
      if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
    const raw = cleanText(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
      : "";
  }

  function setMessage(message, error = false) {
    const element = document.getElementById("missingBolMessage");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.remove("hidden");
  }

  function hideMessage() {
    document.getElementById("missingBolMessage")?.classList.add("hidden");
  }

  function handleLoadError(error) {
    state.records = [];
    state.candidate = null;
    render();
    setMessage(error?.message || "The Missing BOL report could not be loaded.", true);
    maybeFocus(true);
  }

  function maybeFocus(settledError) {
    if (state.focusedOnce || !window.VixenAuxiliaryMode?.active) return;
    if (!state.records.length && !settledError) return;
    state.focusedOnce = true;
    const target = document.getElementById("bolsView");
    if (!target) return;
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active-view", view === target));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === "bols"));
    const reportingWeek = document.getElementById("reportingWeek");
    if (reportingWeek) reportingWeek.textContent = "Missing BOLs";
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }

  function updateNavCount(count) {
    const badge = document.querySelector('[data-view="bols"] .bol-nav-count');
    if (!badge) return;
    badge.textContent = String(count);
    badge.title = `${count} missing BOL trip${count === 1 ? "" : "s"}`;
  }

  function normalize(value) {
    return String(value ?? "").toLowerCase().replace(/[%#]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
