(() => {
  "use strict";

  const DIVISION = "305";
  const STORAGE_KEY = "vixenTripPlanningNotes305V1";
  const STATUSES = ["Needs plan", "Planned", "Waiting", "Hold", "Complete"];
  let records = load();
  let editingId = "";

  window.VixenTripPlanningNotes = Object.freeze({
    division: DIVISION,
    list: () => records.map(copy),
    syncFromPta,
    refresh: render,
  });

  document.addEventListener("DOMContentLoaded", install);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      records = load();
      render();
    }
  });

  function install() {
    addStyles();
    addView();
    bind();
    render();
  }

  function addView() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="tripPlanning305"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "tripPlanning305";
      button.innerHTML = '<span>↝</span><span>305 Trip Notes</span><strong class="trip305-badge">0</strong>';
      const pta = nav.querySelector('[data-view="pta"]');
      pta ? pta.insertAdjacentElement("afterend", button) : nav.append(button);
    }
    if (document.getElementById("tripPlanning305View")) return;

    const section = document.createElement("section");
    section.id = "tripPlanning305View";
    section.className = "view table-view";
    section.innerHTML = `
      <div class="view-heading trip305-heading">
        <div><span class="eyebrow">DIVISION ${DIVISION} · TRIP PLANNING</span><h2>Truck Planning Notes</h2></div>
        <div class="trip305-actions"><button id="trip305Sync" class="button button-secondary" type="button">Sync 305 from PTA</button><button id="trip305Export" class="button button-primary" type="button">Export notes</button></div>
      </div>
      <div class="table-explainer"><strong>Purpose:</strong> keep Division ${DIVISION} trip decisions, next actions, and handoff notes in one place. Notes stay in this browser. Sync reads the current PTA paste, filters it to division ${DIVISION}, and adds missing trucks without replacing saved notes.</div>
      <div class="trip305-summary"><article><strong id="trip305Total">0</strong><span>trucks</span></article><article><strong id="trip305Open">0</strong><span>open</span></article><article><strong id="trip305Need">0</strong><span>need a plan</span></article></div>
      <form id="trip305Form" class="trip305-form">
        <label>Truck<input id="trip305Truck" required placeholder="12345"></label>
        <label>Driver<input id="trip305Driver" placeholder="Driver name or code"></label>
        <label>Load / order<input id="trip305Load" placeholder="Load, order, or trip ID"></label>
        <label>Destination<input id="trip305Destination" placeholder="City, customer, or lane"></label>
        <label>PTA / ready time<input id="trip305Pta" placeholder="7/28 18:00"></label>
        <label>Status<select id="trip305RecordStatus">${STATUSES.map((status) => `<option>${html(status)}</option>`).join("")}</select></label>
        <label class="trip305-wide">Next action<input id="trip305Next" placeholder="Who is doing what next?"></label>
        <label class="trip305-wide">Planning note<textarea id="trip305Note" rows="3" maxlength="3000" placeholder="Decision, blocker, calls made, promises given, or handoff context"></textarea></label>
        <div class="trip305-form-buttons trip305-wide"><span id="trip305FormMessage"></span><button id="trip305Cancel" class="button button-secondary hidden" type="button">Cancel edit</button><button class="button button-primary" type="submit"><span id="trip305SubmitText">Save truck plan</span></button></div>
      </form>
      <div class="trip305-toolbar"><input id="trip305Search" type="search" placeholder="Search truck, driver, destination, action, or notes"><select id="trip305Filter"><option value="">All statuses</option>${STATUSES.map((status) => `<option>${html(status)}</option>`).join("")}</select><span id="trip305Message"></span></div>
      <div id="trip305Empty" class="worked-empty-state">No Division ${DIVISION} trucks are tracked yet.</div>
      <div id="trip305List" class="trip305-list"></div>`;
    const ptaView = document.getElementById("ptaView");
    ptaView ? ptaView.insertAdjacentElement("afterend", section) : document.querySelector(".main-panel")?.append(section);
  }

  function bind() {
    once("trip305Form", "submit", saveForm);
    once("trip305Cancel", "click", resetForm);
    once("trip305Search", "input", render);
    once("trip305Filter", "change", render);
    once("trip305Export", "click", exportCsv);
    once("trip305Sync", "click", () => {
      const result = syncFromPta();
      if (!result.sourceRows) return message("No PTA paste found. Paste the PTA report on the PTA tab, then sync again.", true);
      if (!result.divisionRows) return message(`Read ${result.sourceRows} PTA rows, but none were Division ${DIVISION}.`, true);
      message(`Synced ${result.divisionRows} Division ${DIVISION} rows: ${result.added} added, ${result.updated} refreshed.`);
    });
    const list = document.getElementById("trip305List");
    if (!list || list.dataset.bound) return;
    list.dataset.bound = "true";
    list.addEventListener("click", listClick);
    list.addEventListener("change", listChange);
  }

  function once(id, type, handler) {
    const element = document.getElementById(id);
    if (!element || element.dataset[type]) return;
    element.dataset[type] = "true";
    element.addEventListener(type, handler);
  }

  function saveForm(event) {
    event.preventDefault();
    const truck = value("trip305Truck");
    if (!truck) return formMessage("Truck number is required.", true);
    const existing = records.find((record) => record.id === editingId || truckKey(record.truck) === truckKey(truck));
    const now = new Date().toISOString();
    const note = value("trip305Note");
    const saved = cleanRecord({
      ...(existing || {}),
      id: existing?.id || id("trip"),
      truck,
      driver: value("trip305Driver"),
      load: value("trip305Load"),
      destination: value("trip305Destination"),
      pta: value("trip305Pta"),
      status: value("trip305RecordStatus") || "Needs plan",
      nextAction: value("trip305Next"),
      notes: note ? [{ id: id("note"), text: note, savedAt: now }, ...(existing?.notes || [])] : (existing?.notes || []),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    records = existing ? records.map((record) => record.id === existing.id ? saved : record) : [...records, saved];
    persist();
    message(`${existing ? "Updated" : "Added"} truck ${saved.truck}.`);
    resetForm();
    render();
  }

  function listClick(event) {
    const edit = event.target.closest("[data-trip-edit]");
    if (edit) return editRecord(edit.dataset.tripEdit);
    const remove = event.target.closest("[data-trip-remove]");
    if (remove) {
      const record = records.find((item) => item.id === remove.dataset.tripRemove);
      if (!record || !window.confirm(`Remove truck ${record.truck} and its saved notes?`)) return;
      records = records.filter((item) => item.id !== record.id);
      persist();
      render();
      return message(`Removed truck ${record.truck}.`);
    }
    const add = event.target.closest("[data-trip-note]");
    if (add) {
      const input = document.querySelector(`[data-trip-note-input="${css(add.dataset.tripNote)}"]`);
      const text = String(input?.value || "").trim();
      if (!text) return message("Type a note before saving it.", true);
      const record = records.find((item) => item.id === add.dataset.tripNote);
      if (!record) return;
      record.notes.unshift({ id: id("note"), text, savedAt: new Date().toISOString() });
      record.updatedAt = new Date().toISOString();
      persist();
      render();
      return message(`Saved a note for truck ${record.truck}.`);
    }
    const copyButton = event.target.closest("[data-trip-copy]");
    if (copyButton) copyHandoff(copyButton.dataset.tripCopy);
  }

  function listChange(event) {
    const select = event.target.closest("[data-trip-status]");
    if (!select) return;
    const record = records.find((item) => item.id === select.dataset.tripStatus);
    if (!record) return;
    record.status = select.value;
    record.updatedAt = new Date().toISOString();
    persist();
    render();
    message(`Truck ${record.truck} changed to ${record.status}.`);
  }

  function editRecord(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    editingId = record.id;
    set("trip305Truck", record.truck);
    set("trip305Driver", record.driver);
    set("trip305Load", record.load);
    set("trip305Destination", record.destination);
    set("trip305Pta", record.pta);
    set("trip305RecordStatus", record.status);
    set("trip305Next", record.nextAction);
    set("trip305Note", "");
    document.getElementById("trip305Cancel")?.classList.remove("hidden");
    text("trip305SubmitText", "Update truck plan");
    formMessage(`Editing truck ${record.truck}. A new note is optional.`);
    document.getElementById("trip305Truck")?.focus();
  }

  function resetForm() {
    editingId = "";
    ["trip305Truck", "trip305Driver", "trip305Load", "trip305Destination", "trip305Pta", "trip305Next", "trip305Note"].forEach((item) => set(item, ""));
    set("trip305RecordStatus", "Needs plan");
    document.getElementById("trip305Cancel")?.classList.add("hidden");
    text("trip305SubmitText", "Save truck plan");
    formMessage("");
  }

  function syncFromPta() {
    const live = String(document.getElementById("ptaPasteInput")?.value || "").trim();
    const rows = parsePta(live || localStorage.getItem("vixenManualPtaText") || "");
    const divisionRows = rows.filter((row) => divisionKey(row.division) === DIVISION && row.truck);
    let added = 0;
    let updated = 0;
    divisionRows.forEach((row) => {
      const existing = records.find((record) => truckKey(record.truck) === truckKey(row.truck));
      const planned = Boolean(row.plan || row.plans) && !/^(0|no|none|false)$/i.test(row.plan || row.plans);
      const now = new Date().toISOString();
      const saved = cleanRecord({
        ...(existing || {}),
        id: existing?.id || id("trip"),
        truck: existing?.truck || row.truck,
        driver: existing?.driver || row.driver,
        destination: existing?.destination || row.destination,
        pta: row.pta || existing?.pta || "",
        status: existing?.status && existing.status !== "Needs plan" ? existing.status : planned ? "Planned" : "Needs plan",
        nextAction: existing?.nextAction || (planned ? "Confirm plan and timing with dispatch." : "Build or confirm the next trip plan."),
        notes: existing?.notes || [],
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      records = existing ? records.map((record) => record.id === existing.id ? saved : record) : [...records, saved];
      existing ? updated++ : added++;
    });
    persist();
    render();
    return { sourceRows: rows.length, divisionRows: divisionRows.length, added, updated };
  }

  function parsePta(input) {
    const rows = String(input).replace(/\r/g, "").split("\n").map((line) => line.split("\t").map((cell) => cell.trim())).filter((row) => row.some(Boolean));
    if (!rows.length) return [];
    const hasHeader = rows[0].some((cell) => /truck|tractor|unit/i.test(cell)) && rows[0].some((cell) => /div|division|terminal/i.test(cell));
    const headers = hasHeader ? rows.shift().map(header) : ["truck", "division", "driver", "pta", "status", "plans", "plan", "team", "destination", "om", "count"];
    return rows.map((cells) => Object.fromEntries(headers.map((name, index) => [name, cells[index] || ""]).filter(([name]) => name)));
  }

  function header(input) {
    const key = String(input).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^(truck|trucknumber|tractor|unit|unitnumber)$/.test(key)) return "truck";
    if (/^(div|divnumber|division|terminal|terminalnumber)$/.test(key)) return "division";
    if (/^(driver|drivername|operator)$/.test(key)) return "driver";
    if (/^(pta|projectedtimeavailable|readytime)$/.test(key)) return "pta";
    if (/^(status|truckstatus)$/.test(key)) return "status";
    if (key === "plans" || key === "plan") return key;
    if (/^(destination|dest)$/.test(key)) return "destination";
    return "";
  }

  function render() {
    const list = document.getElementById("trip305List");
    const empty = document.getElementById("trip305Empty");
    if (!list || !empty) return;
    const search = String(document.getElementById("trip305Search")?.value || "").toLowerCase();
    const filter = value("trip305Filter");
    const visible = records.filter((record) => (!filter || record.status === filter) && (!search || JSON.stringify(record).toLowerCase().includes(search))).sort(sortRecords);
    list.innerHTML = visible.map(card).join("");
    empty.classList.toggle("hidden", visible.length > 0);
    empty.textContent = records.length ? "No Division 305 notes match the current filters." : "No Division 305 trucks are tracked yet. Add one above or sync the current PTA paste.";
    const open = records.filter((record) => record.status !== "Complete").length;
    text("trip305Total", records.length);
    text("trip305Open", open);
    text("trip305Need", records.filter((record) => record.status === "Needs plan").length);
    const badge = document.querySelector('[data-view="tripPlanning305"] .trip305-badge');
    if (badge) badge.textContent = String(open);
  }

  function card(record) {
    const latest = record.notes[0];
    return `<article class="trip305-card ${record.status === "Complete" ? "complete" : ""}">
      <div class="trip305-card-head"><div><span>DIV ${DIVISION}</span><h3>Truck ${html(record.truck)}</h3><p>${html(record.driver || "Driver not listed")}</p></div><select data-trip-status="${html(record.id)}">${STATUSES.map((status) => `<option ${status === record.status ? "selected" : ""}>${html(status)}</option>`).join("")}</select></div>
      <div class="trip305-facts"><span><b>Load / order</b>${html(record.load || "Not entered")}</span><span><b>Destination</b>${html(record.destination || "Not entered")}</span><span><b>PTA / ready</b>${html(record.pta || "Not entered")}</span></div>
      <p class="trip305-next"><b>Next action</b>${html(record.nextAction || "No next action entered.")}</p>
      <p class="trip305-latest"><b>Latest note</b>${html(latest?.text || "No planning notes saved yet.")} ${latest ? `<small>${html(formatDate(latest.savedAt))}</small>` : ""}</p>
      <div class="trip305-add-note"><textarea data-trip-note-input="${html(record.id)}" rows="2" maxlength="3000" placeholder="Add a planning or handoff note"></textarea><button class="button button-primary" data-trip-note="${html(record.id)}" type="button">Save note</button></div>
      <div class="trip305-card-actions"><button class="button button-secondary" data-trip-copy="${html(record.id)}" type="button">Copy handoff</button><button class="button button-secondary" data-trip-edit="${html(record.id)}" type="button">Edit plan</button><button class="trip305-remove" data-trip-remove="${html(record.id)}" type="button">Remove</button></div>
    </article>`;
  }

  async function copyHandoff(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    const output = [`Division ${DIVISION} · Truck ${record.truck}`, record.driver && `Driver: ${record.driver}`, record.load && `Load/Order: ${record.load}`, record.destination && `Destination: ${record.destination}`, record.pta && `PTA: ${record.pta}`, `Status: ${record.status}`, record.nextAction && `Next action: ${record.nextAction}`, `Latest note: ${record.notes[0]?.text || "No note saved"}`].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(output);
      message(`Copied truck ${record.truck} handoff.`);
    } catch (_) {
      message("The browser blocked clipboard access.", true);
    }
  }

  function exportCsv() {
    if (!records.length) return message("There are no Division 305 trip notes to export.", true);
    const rows = [["Division", "Truck", "Driver", "Load / Order", "Destination", "PTA", "Status", "Next Action", "Latest Note", "Note Count", "Updated"]];
    records.slice().sort(sortRecords).forEach((record) => rows.push([DIVISION, record.truck, record.driver, record.load, record.destination, record.pta, record.status, record.nextAction, record.notes[0]?.text || "", record.notes.length, formatDate(record.updatedAt)]));
    const blob = new Blob(["\ufeff", rows.map((row) => row.map(csv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `division-305-trip-notes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    message(`Exported ${records.length} Division ${DIVISION} truck plans.`);
  }

  function cleanRecord(record) {
    const now = new Date().toISOString();
    return { id: String(record.id || id("trip")), division: DIVISION, truck: String(record.truck || "").trim(), driver: String(record.driver || "").trim(), load: String(record.load || "").trim(), destination: String(record.destination || "").trim(), pta: String(record.pta || "").trim(), status: STATUSES.includes(record.status) ? record.status : "Needs plan", nextAction: String(record.nextAction || "").trim(), notes: Array.isArray(record.notes) ? record.notes.filter((note) => note?.text).map((note) => ({ id: String(note.id || id("note")), text: String(note.text).trim(), savedAt: validDate(note.savedAt) || now })) : [], createdAt: validDate(record.createdAt) || now, updatedAt: validDate(record.updatedAt) || now };
  }

  function load() { try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(parsed) ? parsed.map(cleanRecord).filter((record) => record.truck) : []; } catch (_) { return []; } }
  function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
  function copy(record) { return { ...record, notes: record.notes.map((note) => ({ ...note })) }; }
  function sortRecords(a, b) { const rank = { "Needs plan": 0, Waiting: 1, Hold: 2, Planned: 3, Complete: 4 }; return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.truck.localeCompare(b.truck, undefined, { numeric: true }); }
  function truckKey(input) { const key = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, "") : key; }
  function divisionKey(input) { const match = String(input || "").match(/\d+/); return match ? String(Number(match[0])) : ""; }
  function validDate(input) { const date = new Date(input); return Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
  function formatDate(input) { const date = new Date(input); return Number.isNaN(date.getTime()) ? String(input || "") : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function value(idName) { return String(document.getElementById(idName)?.value || "").trim(); }
  function set(idName, input) { const element = document.getElementById(idName); if (element) element.value = input || ""; }
  function text(idName, input) { const element = document.getElementById(idName); if (element) element.textContent = String(input); }
  function id(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function csv(input) { return `"${String(input ?? "").replace(/"/g, '""')}"`; }
  function html(input) { return String(input ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function css(input) { return window.CSS?.escape ? window.CSS.escape(String(input)) : String(input).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
  function message(input, error = false) { const element = document.getElementById("trip305Message"); if (element) { element.textContent = input; element.classList.toggle("trip305-error", error); } }
  function formMessage(input, error = false) { const element = document.getElementById("trip305FormMessage"); if (element) { element.textContent = input; element.classList.toggle("trip305-error", error); } }

  function addStyles() {
    if (document.getElementById("trip305Styles")) return;
    const style = document.createElement("style");
    style.id = "trip305Styles";
    style.textContent = `.trip305-badge{margin-left:auto;padding:.1rem .42rem;border-radius:999px;background:rgba(110,255,196,.13);color:#82ffd0;font-size:.72rem}.trip305-heading,.trip305-actions,.trip305-form-buttons,.trip305-card-actions{display:flex;gap:.65rem;align-items:center;justify-content:space-between}.trip305-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem;margin:1rem 0}.trip305-summary article,.trip305-card{padding:1rem;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(10,15,29,.82)}.trip305-summary strong{display:block;color:#86ffd2;font-size:1.6rem}.trip305-summary span,.trip305-form label{color:#9ba8bd;font-size:.72rem;text-transform:uppercase;letter-spacing:.07em}.trip305-form{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem;padding:1rem;border:1px solid rgba(143,99,255,.25);border-radius:16px;background:rgba(15,14,31,.82)}.trip305-form label{display:flex;flex-direction:column;gap:.35rem}.trip305-form input,.trip305-form select,.trip305-form textarea,.trip305-toolbar input,.trip305-toolbar select,.trip305-card select,.trip305-card textarea{box-sizing:border-box;width:100%;padding:.7rem;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#0b1020;color:#f4f7ff;font:inherit}.trip305-wide{grid-column:1/-1}.trip305-form-buttons span{margin-right:auto;color:#9ba8bd;text-transform:none}.trip305-toolbar{display:grid;grid-template-columns:1fr 180px auto;gap:.7rem;align-items:center;margin:1rem 0}.trip305-list{display:grid;gap:1rem}.trip305-card.complete{opacity:.7}.trip305-card-head{display:flex;justify-content:space-between;gap:1rem}.trip305-card-head h3{margin:.2rem 0}.trip305-card-head p{margin:0;color:#9ba8bd}.trip305-card-head>div>span{color:#82ffd0;font-size:.68rem;font-weight:800}.trip305-card-head select{max-width:170px}.trip305-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin:.8rem 0}.trip305-facts span,.trip305-next,.trip305-latest{padding:.7rem;border-radius:10px;background:rgba(255,255,255,.035)}.trip305-facts b,.trip305-next b,.trip305-latest b{display:block;color:#8d9bb0;font-size:.65rem;text-transform:uppercase}.trip305-latest small{display:block;margin-top:.35rem;color:#7f8ca0}.trip305-add-note{display:grid;grid-template-columns:1fr auto;gap:.6rem;align-items:end}.trip305-card-actions{justify-content:flex-end;margin-top:.7rem}.trip305-remove{border:0;background:transparent;color:#ff8da9;cursor:pointer}.trip305-error{color:#ff8da9!important}@media(max-width:900px){.trip305-form{grid-template-columns:repeat(2,1fr)}.trip305-facts{grid-template-columns:1fr}}`;
    document.head.append(style);
  }
})();
