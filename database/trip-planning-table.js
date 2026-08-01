(() => {
  "use strict";

  const VIEW_ID = "tripPlanning305View";
  const SOURCE_LIST_ID = "trip305List";
  const expandedIds = new Set();
  let sourceList = null;
  let observer = null;

  document.addEventListener("DOMContentLoaded", install);

  function install() {
    if (!window.VixenTripPlanningNotes || document.getElementById("trip305TableBody")) return;
    sourceList = document.getElementById(SOURCE_LIST_ID);
    const view = document.getElementById(VIEW_ID);
    if (!sourceList || !view) return;

    installStyles();
    installEntryPanel();
    installTable();
    bindEvents();
    observeSourceList();
    render();
  }

  function installEntryPanel() {
    const form = document.getElementById("trip305Form");
    if (!form || document.getElementById("trip305EntryPanel")) return;

    const panel = document.createElement("details");
    panel.id = "trip305EntryPanel";
    panel.className = "trip305-entry-panel";
    panel.innerHTML = `<summary><span><strong id="trip305EntryTitle">Add or edit a truck plan</strong><small>Open this only when the glanceable table needs more context.</small></span><span>⌄</span></summary>`;
    form.insertAdjacentElement("beforebegin", panel);
    panel.append(form);

    const actions = document.querySelector(`#${VIEW_ID} .trip305-actions`);
    if (actions && !document.getElementById("trip305Add")) {
      const button = document.createElement("button");
      button.id = "trip305Add";
      button.className = "button button-secondary";
      button.type = "button";
      button.textContent = "Add truck plan";
      const exportButton = document.getElementById("trip305Export");
      exportButton ? exportButton.insertAdjacentElement("beforebegin", button) : actions.append(button);
    }
  }

  function installTable() {
    sourceList.classList.add("trip305-source-list");
    const shell = document.createElement("div");
    shell.id = "trip305TableShell";
    shell.className = "table-shell trip305-table-shell";
    shell.innerHTML = `<table id="trip305Table">
      <thead><tr>
        <th>Status</th><th>Truck</th><th>Driver</th><th>Load / order</th><th>PTA / ready</th>
        <th>Destination</th><th>Next action</th><th>Latest note</th><th>Updated</th><th>Details</th>
      </tr></thead>
      <tbody id="trip305TableBody"></tbody>
    </table>`;
    sourceList.insertAdjacentElement("afterend", shell);
  }

  function bindEvents() {
    const body = document.getElementById("trip305TableBody");
    body?.addEventListener("click", handleClick);
    body?.addEventListener("change", handleChange);

    document.getElementById("trip305Add")?.addEventListener("click", () => {
      document.getElementById("trip305Cancel")?.click();
      setEntryTitle("Add a truck plan");
      openEntryPanel();
      document.getElementById("trip305Truck")?.focus();
    });

    document.getElementById("trip305Form")?.addEventListener("submit", () => {
      window.setTimeout(() => {
        const panel = document.getElementById("trip305EntryPanel");
        if (panel) panel.open = false;
        setEntryTitle("Add or edit a truck plan");
      }, 0);
    });

    document.getElementById("trip305Cancel")?.addEventListener("click", () => {
      setEntryTitle("Add or edit a truck plan");
    });

    document.getElementById("trip305Search")?.addEventListener("input", queueRender);
    document.getElementById("trip305Filter")?.addEventListener("change", queueRender);
    window.addEventListener("storage", (event) => {
      if (event.key === "vixenTripPlanningNotes305V1") queueRender();
    });
  }

  function observeSourceList() {
    observer?.disconnect();
    observer = new MutationObserver(queueRender);
    observer.observe(sourceList, { childList: true, subtree: true });
  }

  function handleClick(event) {
    const toggle = event.target.closest("[data-trip-table-toggle]");
    if (toggle) {
      const id = toggle.dataset.tripTableToggle;
      expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id);
      return render();
    }

    const note = event.target.closest("[data-trip-table-note]");
    if (note) {
      const id = note.dataset.tripTableNote;
      const input = findTableInput("tripTableNoteInput", id);
      const text = String(input?.value || "").trim();
      if (!text) return showMessage("Type a note before saving it.", true);
      const sourceInput = findSourceControl("tripNoteInput", id);
      const sourceButton = findSourceControl("tripNote", id);
      if (!sourceInput || !sourceButton) return showMessage("That truck is no longer in the current table view. Refresh and try again.", true);
      sourceInput.value = text;
      expandedIds.add(id);
      sourceButton.click();
      return;
    }

    const edit = event.target.closest("[data-trip-table-edit]");
    if (edit) {
      const id = edit.dataset.tripTableEdit;
      const record = recordById(id);
      const sourceButton = findSourceControl("tripEdit", id);
      if (!sourceButton) return;
      sourceButton.click();
      setEntryTitle(`Edit truck ${record?.truck || "plan"}`);
      openEntryPanel();
      return;
    }

    const copy = event.target.closest("[data-trip-table-copy]");
    if (copy) return findSourceControl("tripCopy", copy.dataset.tripTableCopy)?.click();

    const remove = event.target.closest("[data-trip-table-remove]");
    if (remove) return findSourceControl("tripRemove", remove.dataset.tripTableRemove)?.click();
  }

  function handleChange(event) {
    const select = event.target.closest("[data-trip-table-status]");
    if (!select) return;
    const id = select.dataset.tripTableStatus;
    const sourceSelect = findSourceControl("tripStatus", id);
    if (!sourceSelect) return;
    sourceSelect.value = select.value;
    sourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function render() {
    const body = document.getElementById("trip305TableBody");
    const shell = document.getElementById("trip305TableShell");
    if (!body || !shell) return;

    const query = String(document.getElementById("trip305Search")?.value || "").toLowerCase();
    const filter = String(document.getElementById("trip305Filter")?.value || "");
    const records = window.VixenTripPlanningNotes.list()
      .filter((record) => (!filter || record.status === filter) && (!query || JSON.stringify(record).toLowerCase().includes(query)))
      .sort(sortRecords);

    body.innerHTML = records.map(renderRows).join("");
    shell.classList.toggle("hidden", records.length === 0);
  }

  function renderRows(record) {
    const latest = record.notes?.[0];
    const expanded = expandedIds.has(record.id);
    const statusOptions = ["Needs plan", "Planned", "Waiting", "Hold", "Complete"]
      .map((status) => `<option ${status === record.status ? "selected" : ""}>${escapeHtml(status)}</option>`)
      .join("");

    return `<tr class="trip305-table-row ${record.status === "Complete" ? "trip305-table-complete" : ""}">
      <td><select class="trip305-table-status status-${statusKey(record.status)}" data-trip-table-status="${escapeHtml(record.id)}">${statusOptions}</select></td>
      <td><strong class="trip305-table-truck">${escapeHtml(record.truck)}</strong></td>
      <td>${cell(record.driver, "Driver not listed")}</td>
      <td>${cell(record.load, "Not entered")}</td>
      <td>${cell(record.pta, "Not entered")}</td>
      <td>${cell(record.destination, "Not entered")}</td>
      <td title="${escapeHtml(record.nextAction || "")}">${escapeHtml(shortText(record.nextAction || "No next action entered.", 64))}</td>
      <td title="${escapeHtml(latest?.text || "")}"><span class="trip305-table-note-preview">${escapeHtml(shortText(latest?.text || "No note saved.", 70))}</span><small>${record.notes?.length ? `${record.notes.length} note${record.notes.length === 1 ? "" : "s"}` : "No history"}</small></td>
      <td class="trip305-table-updated">${escapeHtml(formatDate(record.updatedAt))}</td>
      <td><button class="button button-secondary trip305-table-open" data-trip-table-toggle="${escapeHtml(record.id)}" type="button" aria-expanded="${expanded}">${expanded ? "Close" : "Open"}</button></td>
    </tr>
    <tr class="trip305-table-detail-row ${expanded ? "" : "hidden"}">
      <td colspan="10"><div class="trip305-table-detail-grid">
        <section><span class="trip305-table-detail-label">Plan context</span><p><b>Next action:</b> ${escapeHtml(record.nextAction || "No next action entered.")}</p><p><b>Latest note:</b> ${escapeHtml(latest?.text || "No planning notes saved yet.")}</p>${latest ? `<small>Saved ${escapeHtml(formatDate(latest.savedAt))}</small>` : ""}</section>
        <section><label class="trip305-table-detail-label">Add planning / handoff note</label><textarea data-trip-table-note-input="${escapeHtml(record.id)}" rows="3" maxlength="3000" placeholder="Decision, blocker, call made, or handoff context"></textarea><button class="button button-primary" data-trip-table-note="${escapeHtml(record.id)}" type="button">Save note</button></section>
        <section class="trip305-table-detail-actions"><span class="trip305-table-detail-label">Actions</span><button class="button button-secondary" data-trip-table-copy="${escapeHtml(record.id)}" type="button">Copy handoff</button><button class="button button-secondary" data-trip-table-edit="${escapeHtml(record.id)}" type="button">Edit plan</button><button class="trip305-table-remove" data-trip-table-remove="${escapeHtml(record.id)}" type="button">Remove truck</button></section>
      </div></td>
    </tr>`;
  }

  function findSourceControl(datasetName, id) {
    return [...sourceList.querySelectorAll(`[data-${toKebab(datasetName)}]`)]
      .find((element) => element.dataset[datasetName] === id) || null;
  }

  function findTableInput(datasetName, id) {
    return [...document.querySelectorAll(`[data-${toKebab(datasetName)}]`)]
      .find((element) => element.dataset[datasetName] === id) || null;
  }

  function recordById(id) {
    return window.VixenTripPlanningNotes.list().find((record) => record.id === id) || null;
  }

  function openEntryPanel() {
    const panel = document.getElementById("trip305EntryPanel");
    if (!panel) return;
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setEntryTitle(value) {
    const title = document.getElementById("trip305EntryTitle");
    if (title) title.textContent = value;
  }

  function queueRender() {
    window.requestAnimationFrame ? window.requestAnimationFrame(render) : window.setTimeout(render, 0);
  }

  function showMessage(value, error = false) {
    const message = document.getElementById("trip305Message");
    if (!message) return;
    message.textContent = value;
    message.classList.toggle("trip305-error", error);
  }

  function sortRecords(a, b) {
    const rank = { "Needs plan": 0, Waiting: 1, Hold: 2, Planned: 3, Complete: 4 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || String(a.truck).localeCompare(String(b.truck), undefined, { numeric: true });
  }

  function cell(value, fallback) {
    const output = String(value || "").trim();
    return `<span title="${escapeHtml(output)}">${escapeHtml(shortText(output || fallback, 34))}</span>`;
  }

  function shortText(value, limit) {
    const output = String(value || "").replace(/\s+/g, " ").trim();
    return output.length > limit ? `${output.slice(0, limit - 1).trimEnd()}…` : output;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function statusKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function toKebab(value) {
    return String(value).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function installStyles() {
    if (document.getElementById("trip305TableStyles")) return;
    const style = document.createElement("style");
    style.id = "trip305TableStyles";
    style.textContent = `.trip305-source-list{display:none!important}.trip305-entry-panel{margin-bottom:1rem;border:1px solid rgba(143,99,255,.25);border-radius:16px;background:rgba(15,14,31,.82);overflow:hidden}.trip305-entry-panel summary{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:1rem;cursor:pointer;list-style:none}.trip305-entry-panel summary::-webkit-details-marker{display:none}.trip305-entry-panel summary span:first-child{display:grid;gap:.2rem}.trip305-entry-panel summary small{color:#8f9bb0;font-weight:400}.trip305-entry-panel .trip305-form{border:0;border-top:1px solid rgba(143,99,255,.2);border-radius:0}.trip305-table-shell{overflow:auto}.trip305-table-shell table{min-width:1450px}.trip305-table-shell th{white-space:nowrap}.trip305-table-shell td{vertical-align:top}.trip305-table-row:hover{background:rgba(134,255,210,.035)}.trip305-table-status,.trip305-table-detail-grid textarea{box-sizing:border-box;width:100%;padding:.62rem;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#0b1020;color:#f4f7ff;font:inherit}.trip305-table-status{min-width:132px;font-size:.8rem;font-weight:700}.trip305-table-status.status-needs-plan{border-color:rgba(255,112,151,.55);color:#ff9bb6}.trip305-table-status.status-hold{border-color:rgba(255,190,93,.55);color:#ffd08b}.trip305-table-status.status-waiting{border-color:rgba(169,126,255,.55);color:#c5aaff}.trip305-table-status.status-planned{border-color:rgba(104,232,255,.5);color:#8cecff}.trip305-table-status.status-complete{border-color:rgba(110,255,196,.45);color:#86ffd2}.trip305-table-truck{color:#f4f7ff;font-size:1rem}.trip305-table-note-preview{display:block;max-width:260px}.trip305-table-shell td small{display:block;margin-top:.25rem;color:#7f8ca0}.trip305-table-updated{white-space:nowrap;color:#93a0b4}.trip305-table-open{min-width:74px;padding:.5rem .7rem}.trip305-table-complete{opacity:.65}.trip305-table-detail-row td{padding:0!important;border-top:0!important}.trip305-table-detail-row:not(.hidden) td{background:rgba(7,12,24,.95)}.trip305-table-detail-grid{display:grid;grid-template-columns:minmax(260px,1.1fr) minmax(320px,1.4fr) 180px;gap:1rem;padding:1rem;border-left:3px solid rgba(134,255,210,.55)}.trip305-table-detail-grid section{min-width:0}.trip305-table-detail-grid p{margin:.35rem 0;color:#d9e0ec;white-space:normal}.trip305-table-detail-grid textarea{margin:.4rem 0 .55rem;resize:vertical}.trip305-table-detail-label{display:block;color:#86ffd2;font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.trip305-table-detail-actions{display:grid;align-content:start;gap:.55rem}.trip305-table-remove{border:0;background:transparent;color:#ff8da9;cursor:pointer;padding:.55rem;text-align:left}@media(max-width:900px){.trip305-table-detail-grid{grid-template-columns:1fr 1fr}.trip305-table-detail-actions{grid-column:1/-1;grid-template-columns:repeat(3,auto);justify-content:start}}`;
    document.head.append(style);
  }
})();
