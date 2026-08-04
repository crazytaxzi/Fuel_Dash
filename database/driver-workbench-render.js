(() => {
  "use strict";

  window.VixenDriverWorkbenchRender = Object.freeze({ contract, queue, card });

  function contract(container, model) {
    if (!container || !model) return;
    const required = model.coverage.required.map(reportLabel).join(" + ");
    const optional = [
      model.coverage.hasDetail ? "Fuel detail connected" : "Detail optional",
      model.coverage.hasPta ? "PTA connected" : "PTA optional",
      model.coverage.hasApu ? "APU connected" : "APU optional",
      model.coverage.hasMissingBols ? "BOL connected" : "Missing BOL optional",
    ];
    container.innerHTML = `<div><strong>Core reports:</strong> ${escapeHtml(required)}</div><small>${escapeHtml(optional.join(" · "))}</small>`;
  }

  function queue(container, records, selectedKey) {
    if (!container) return;
    container.innerHTML = records.length ? records.map((record) => `<button class="driver-workbench-row ${record.key === selectedKey ? "active" : ""}" type="button" data-driver-workbench-key="${escapeHtml(record.key)}">
      <span class="driver-workbench-priority priority-${escapeHtml(record.priorityKey)}">${escapeHtml(record.priorityLabel)}</span>
      <span class="driver-workbench-row-main"><strong>${escapeHtml(record.truck || "No truck")} — ${escapeHtml(record.driverName)}</strong><small>${escapeHtml(record.driverCode || "No code")} · ${escapeHtml(formatPta(record.pta))}</small></span>
      <span class="driver-workbench-row-state"><b>${escapeHtml(record.loadStatus)}</b><small>${escapeHtml(record.planStatus)}</small></span>
      <span class="driver-workbench-row-idle"><b>${percent(record.idle7DayPct)}</b><small>7-day idle</small></span>
    </button>`).join("") : '<div class="empty-state">No matching driver/truck records.</div>';
  }

  function card(container, record) {
    if (!container) return;
    if (!record) {
      container.innerHTML = '<div class="empty-state">No driver is available.</div>';
      return;
    }
    container.innerHTML = `<header class="driver-card-header">
      <div><span class="eyebrow">DRIVER OPERATIONS CARD</span><h2>${escapeHtml(record.truck || "No truck")} — ${escapeHtml(record.driverName)}</h2><p>${escapeHtml(record.driverCode || "No code")} · ${escapeHtml(record.driverLeader)} · ${escapeHtml(record.assignmentStatus)}</p></div>
      <span class="driver-card-priority priority-${escapeHtml(record.priorityKey)}">${escapeHtml(record.priorityLabel)}</span>
    </header>
    <section class="driver-card-metrics">${metric(`Latest idle · ${record.currentIdleSource}`, percent(record.currentIdlePct))}${metric("7-day idle", percent(record.idle7DayPct))}${metric("28-day idle", percent(record.idle28DayPct))}${metric("Dispatch MPG", number(record.dispatchMpg, 2))}</section>
    <section class="driver-card-section driver-card-operations">
      <div class="driver-card-section-heading"><div><span class="eyebrow">LIVE OPERATIONS</span><h3>Assignment, PTA, load, and preplan</h3></div><small>Save once; the queue resorts immediately.</small></div>
      <form id="driverOperationsForm" class="driver-card-form">
        <label>Truck<input name="truck" value="${escapeHtml(record.truck)}" inputmode="numeric" placeholder="Truck number" /></label>
        <label>Current PTA<input name="pta" type="datetime-local" value="${escapeHtml(dateTimeLocal(record.pta))}" /></label>
        <label>Load status<select name="loadStatus">${options(["Unknown", "Loaded", "Unloaded"], record.loadStatus)}</select></label>
        <label>Plan status<select name="planStatus">${options(["Unknown", "Preplan", "No Preplan"], record.planStatus)}</select></label>
        <label class="driver-card-wide">Destination<input name="destination" value="${escapeHtml(record.destination)}" placeholder="Current or next destination" /></label>
        <label class="driver-card-wide">Operating note<textarea name="operatingNote" rows="3" maxlength="2500" placeholder="Decision, blocker, call made, or handoff context">${escapeHtml(record.operatingNote)}</textarea></label>
        <div class="driver-card-form-actions"><button class="button button-primary" type="submit">Save updates</button><button class="button button-secondary" type="button" data-save-next>Save + next</button><span data-save-status></span></div>
      </form>
    </section>
    <div class="driver-card-two-column">${fuel(record)}${apu(record)}${bols(record)}${notes(record)}</div>`;
  }

  function fuel(record) {
    return `<section class="driver-card-section"><span class="eyebrow">FUEL CONTEXT</span><h3>What the current reports say</h3><dl class="driver-card-facts">${fact("Moving MPG", number(record.movingMpg, 2))}${fact("Out-of-route", percent(record.oorPct))}${fact("Estimated excess gallons", number(record.excessGallons, 1))}${fact("Possible 28-day savings", money(record.estimatedCost))}</dl><p>${escapeHtml(record.focus || "No additional fuel exception was calculated.")}</p><small>${escapeHtml(record.action || "Review route, load, weather, equipment, and necessary idle before assigning cause.")}</small></section>`;
  }

  function apu(record) {
    const value = record.apu;
    if (!value) return `<section class="driver-card-section"><span class="eyebrow">ELECTRIC APU</span><h3>No matched APU record</h3><p>APU evidence is optional. Do not blame the driver for engine idle until equipment availability is known.</p></section>`;
    return `<section class="driver-card-section"><span class="eyebrow">ELECTRIC APU</span><h3>${escapeHtml(value.status || "APU record")}</h3><dl class="driver-card-facts">${fact("APU hours", number(value.apuHours, 1))}${fact("Engine idle hours", number(value.engineIdleHours, 1))}${fact("APU use", percent(value.calculatedUsePct))}${fact("Battery", percent(value.batterySoc))}</dl><p>${escapeHtml(value.plainNote || value.notes || "APU evidence is available.")}</p></section>`;
  }

  function bols(record) {
    const rows = record.missingBols || [];
    const list = rows.length ? rows.slice(0, 8).map((item) => `<div><strong>${escapeHtml(item.trip || "Unknown trip")}</strong><small>${escapeHtml(formatDate(item.date) || item.rawDate || "Date unavailable")}</small></div>`).join("") : '<p>No Missing BOL records matched this driver.</p>';
    return `<section class="driver-card-section"><span class="eyebrow">MISSING BOLS</span><h3>${rows.length} open trip${rows.length === 1 ? "" : "s"}</h3><div class="driver-card-list">${list}</div></section>`;
  }

  function notes(record) {
    const rows = [...(record.driverNotes || []), ...(record.ptaNotes || [])].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    const list = rows.length ? rows.slice(0, 12).map((note) => `<article><strong>${escapeHtml(note.recordType || note.domain || "Note")}</strong><time>${escapeHtml(formatDateTime(note.savedAt))}</time><p>${escapeHtml(note.text || "")}</p><small>${escapeHtml([note.followUpStatus, note.truck, note.destination].filter(Boolean).join(" · "))}</small></article>`).join("") : '<p>No follow-up notes yet.</p>';
    return `<section class="driver-card-section"><span class="eyebrow">FOLLOW-UP HISTORY</span><h3>${rows.length} saved note${rows.length === 1 ? "" : "s"}</h3><form id="driverWorkbenchNoteForm" class="driver-note-form"><div><label>Type<select name="recordType">${options(["Coaching", "Observation", "Driver explanation", "Commitment", "Outcome", "Best-practice idea"], "Coaching")}</select></label><label>Status<select name="followUpStatus">${options(["Open", "Waiting", "Improved", "No change", "Closed"], "Open")}</select></label></div><textarea name="text" rows="3" maxlength="2500" placeholder="Conversation, commitment, result, or next action"></textarea><button class="button button-primary" type="submit">Save follow-up</button></form><div class="driver-card-note-list">${list}</div></section>`;
  }

  function metric(label, value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
  function fact(label, value) { return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`; }
  function options(values, selected) { return values.map((value) => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join(""); }
  function reportLabel(role) { return window.VixenReportContract?.requiredLabels?.[role] || role; }
  function percent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "--"; }
  function number(value, decimals = 0) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "--"; }
  function money(value) { return Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value)) : "--"; }
  function formatPta(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "PTA not reported" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }
  function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Saved previously" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function dateTimeLocal(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
})();
