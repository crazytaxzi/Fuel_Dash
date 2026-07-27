(() => {
  "use strict";

  const DAY_MS = 86400000;
  const TRIP_PATTERN = /\b([A-Z]{3}\d{4})\b/i;
  const DRIVER_CODE_PATTERN = /^(?:[A-Z]{5}\d|[A-Z]{4,6}|\d{5,6})$/i;
  const state = {
    loading: false,
    records: [],
    candidate: null,
    diagnostics: [],
    lastSignature: "",
    lastLoadedAt: 0,
    focusedOnce: false,
  };

  window.VixenMissingBolLive = state;
  installUi();

  document.addEventListener("DOMContentLoaded", () => {
    load(true);
    document.getElementById("refreshBtn")?.addEventListener("click", () => window.setTimeout(() => load(true), 250));
    document.querySelector('[data-view="bols"]')?.addEventListener("click", () => {
      state.focusedOnce = true;
      if (Date.now() - state.lastLoadedAt > 60000) load(false);
    });
  });

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
        <div class="table-explainer"><strong>Oldest first.</strong> This export is recognized from its order fields, <code>Driver Leader</code>, <code>Last Dispatch Driver cd</code>, and <code>Empty Call Date</code>. The trip field is whichever order column actually contains values containing exactly three letters followed by four digits, such as <code>ABC1234</code>.</div>
        <div id="missingBolSummary" class="bol-summary-grid"></div>
        <div id="missingBolMessage" class="bol-message">Scanning XLSX files for the Missing BOL export…</div>
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
        @media(max-width:900px){.bol-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr)}}
        @media(max-width:520px){.bol-summary-grid{grid-template-columns:1fr}}
      `;
      document.head.append(style);
    }
  }

  async function load(force) {
    if (state.loading) return;
    state.loading = true;
    setMessage("Scanning XLSX files for order fields, Driver Leader, Last Dispatch Driver cd, and Empty Call Date…");
    try {
      const manifestResponse = await fetch("data-manifest.json", { cache: "no-store" });
      if (!manifestResponse.ok) throw new Error("The data-folder manifest is unavailable. Launch the dashboard with the included PowerShell launcher.");
      const manifest = (await manifestResponse.json()).filter((item) => /\.xlsx$/i.test(item?.name || ""));
      const signature = manifest.map((item) => `${item.path}|${item.size}|${item.lastModified}`).join("||");
      if (!force && signature === state.lastSignature && state.lastLoadedAt) return;
      state.lastSignature = signature;
      if (!manifest.length) throw new Error("No XLSX files were found in the data folder.");

      const candidates = [];
      state.diagnostics = [];
      for (const item of manifest) {
        try {
          const response = await fetch(encodeURI(item.path), { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const workbook = XLSX.read(await response.arrayBuffer(), {
            type: "array", raw: true, cellDates: false, cellText: false, cellNF: false, dense: false,
          });
          const candidate = inspectWorkbook(item, workbook);
          if (candidate) candidates.push(candidate);
          else state.diagnostics.push(`${item.name}: no matching Missing BOL header signature`);
        } catch (error) {
          state.diagnostics.push(`${item.name}: ${error?.message || error}`);
        }
      }

      candidates.sort((a, b) => b.score - a.score || modifiedTime(b.item) - modifiedTime(a.item));
      if (!candidates.length) {
        state.records = [];
        state.candidate = null;
        render();
        setMessage("No Missing BOL export was recognized. Expected Driver Leader, Last Dispatch Driver cd, Empty Call Date, and at least one order-number column.", true);
        maybeFocus(true);
        return;
      }

      state.candidate = candidates[0];
      state.records = parseRecords(state.candidate);
      state.lastLoadedAt = Date.now();
      render();
      if (!state.records.length) {
        setMessage(`The report layout was recognized in ${state.candidate.item.name}, but none of the order columns contained trips containing exactly three letters followed by four digits, such as ABC1234.`, true);
      } else {
        hideMessage();
      }
      maybeFocus(false);
    } catch (error) {
      state.records = [];
      state.candidate = null;
      render();
      setMessage(error?.message || "The Missing BOL report could not be loaded.", true);
      maybeFocus(true);
    } finally {
      state.loading = false;
    }
  }

  function inspectWorkbook(item, workbook) {
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

        const tripScores = orderColumns.map((column) => ({ column, hits: sampleTripHits(rows, headerRow + 1, column) }));
        tripScores.sort((a, b) => b.hits - a.hits);
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
          item, workbook, sheetName, rows, headerRow,
          columns: { leader, driverCode, date, trip, orderColumns },
          tripHits, hasUnbilledContext, score,
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
        sourceName: source.item.name,
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

  function render() {
    const tbody = document.querySelector("#missingBolTable tbody");
    const shell = document.getElementById("missingBolTableShell");
    const summary = document.getElementById("missingBolSummary");
    if (!tbody || !shell || !summary) return;

    const recognizedCodes = state.records.filter((record) => DRIVER_CODE_PATTERN.test(record.driverCode)).length;
    const dated = state.records.filter((record) => record.date).length;
    const sourceName = state.candidate?.item?.name || "Not found";
    summary.innerHTML = [
      ["Missing BOL trips", state.records.length],
      ["Driver codes found", recognizedCodes],
      ["Rows with date", dated],
      ["Source", sourceName],
    ].map(([label, value]) => `<article class="bol-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

    updateNavCount(state.records.length);
    tbody.innerHTML = state.records.map((record) => `
      <tr>
        <td>${escapeHtml(formatDate(record.date) || record.rawDate || "Date not recognized")}</td>
        <td><strong>${escapeHtml(record.trip)}</strong></td>
        <td>${escapeHtml(record.driverLeader)}</td>
        <td>${escapeHtml(record.driverCode)}</td>
        <td>${escapeHtml(record.sourceName)}<span class="bol-secondary">${escapeHtml(record.sheetName)} · row ${record.sourceRow}</span></td>
      </tr>`).join("");
    shell.classList.toggle("hidden", !state.records.length);
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
    if (badge) {
      badge.textContent = String(count);
      badge.title = `${count} missing BOL trip${count === 1 ? "" : "s"}`;
    }
  }

  function setMessage(message, error = false) {
    const element = document.getElementById("missingBolMessage");
    if (!element) return;
    element.textContent = message;
    element.classList.remove("hidden");
    element.classList.toggle("error", error);
  }

  function hideMessage() {
    document.getElementById("missingBolMessage")?.classList.add("hidden");
  }

  function inferTripColumn(rows, startRow) {
    const width = Math.max(0, ...rows.slice(startRow, startRow + 100).map((row) => row?.length || 0));
    let column = -1;
    let hits = 0;
    for (let index = 0; index < width; index += 1) {
      const value = sampleTripHits(rows, startRow, index);
      if (value > hits) { hits = value; column = index; }
    }
    return { column, hits };
  }

  function sampleTripHits(rows, startRow, column) {
    return rows.slice(startRow, startRow + 250).reduce((count, row) => count + (TRIP_PATTERN.test(String(row?.[column] ?? "")) ? 1 : 0), 0);
  }

  function findHeader(headers, aliases) {
    const normalized = headers.map(normalize);
    for (const alias of aliases.map(normalize)) {
      const exact = normalized.findIndex((header) => header === alias);
      if (exact >= 0) return exact;
    }
    for (const alias of aliases.map(normalize)) {
      const contains = normalized.findIndex((header) => header.includes(alias));
      if (contains >= 0) return contains;
    }
    return -1;
  }

  function uniqueIndexes(values) {
    return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 0))];
  }

  function extractTrip(value) {
    return String(value ?? "").toUpperCase().match(TRIP_PATTERN)?.[1] || "";
  }

  function extractDriverCode(value) {
    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * DAY_MS);
      if (value > 1000000000000) return new Date(value);
    }
    const text = cleanText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const match = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
    if (!match) return null;
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    const date = new Date(year, Number(match[1]) - 1, Number(match[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
      : "";
  }

  function sheetRows(workbook, sheetName) {
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true });
  }

  function modifiedTime(item) {
    const value = new Date(item?.lastModified || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value).toLowerCase().replace(/[\r\n]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
