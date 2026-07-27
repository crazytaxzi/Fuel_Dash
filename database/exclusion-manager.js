(() => {
  "use strict";

  const STORAGE_KEY = "vixenReportExclusionsV1";
  const SEEDED_KEY = "vixenReportExclusionsSeededV1";
  const DEFAULT_ENTRIES = Object.freeze([
    Object.freeze({ id: "seed-kevin-lammerding", name: "Kevin Lammerding", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
    Object.freeze({ id: "seed-jason-lucas", name: "Jason Lucas", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
    Object.freeze({ id: "seed-ferris-rust", name: "Ferris Rust", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
    Object.freeze({ id: "seed-dion-pajimola", name: "Dion Pajimola", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
    Object.freeze({ id: "seed-robert-newson", name: "Robert Newson", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
    Object.freeze({ id: "seed-paul-thibodo", name: "Paul Thibodo", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
    Object.freeze({ id: "seed-aaron-242051", name: "", code: "242051", truck: "", note: "Aaron", enabled: true }),
    Object.freeze({ id: "seed-chris-covington", name: "Chris Covington", code: "", truck: "", note: "Existing idle exclusion", enabled: true }),
  ]);

  let entries = loadEntries();
  seedDefaultsOnce();

  const api = Object.freeze({
    storageKey: STORAGE_KEY,
    matches,
    isExcluded: matches,
    list: () => entries.map(cloneEntry),
    add: addEntry,
    update: updateEntry,
    remove: removeEntry,
    refresh: render,
  });

  window.VixenReportExclusions = api;

  document.addEventListener("DOMContentLoaded", install);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    entries = loadEntries();
    render();
  });

  function install() {
    window.VixenIdleExclusions = api;
    installStyles();
    installView();
    bindEvents();
    render();
  }

  function installView() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="exclusions"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "exclusions";
      button.innerHTML = '<span>⊘</span><span>Exclusions</span><strong class="exclusion-nav-count">0</strong>';
      const settings = nav.querySelector('[data-view="settings"]');
      if (settings) settings.insertAdjacentElement("beforebegin", button);
      else nav.append(button);
    }

    if (document.getElementById("exclusionsView")) return;
    const section = document.createElement("section");
    section.id = "exclusionsView";
    section.className = "view table-view";
    section.innerHTML = `
      <div class="view-heading">
        <div><span class="eyebrow">LOCAL REPORT CONTROLS</span><h2>Exclusions</h2></div>
        <div class="exclusion-summary"><strong id="exclusionEnabledCount">0</strong><span>active</span></div>
      </div>
      <div class="table-explainer"><strong>What this does:</strong> exclude matching drivers from idle averages, idle thresholds, high/best-idler rankings, and idle-related APU coaching. Driver rows remain available for audit and non-idle review. Truck matching applies when the source record includes a truck or unit assignment. Exclusions are saved only in this browser.</div>
      <form id="exclusionForm" class="exclusion-form" autocomplete="off">
        <label><span>Driver name</span><input id="exclusionNameInput" type="text" placeholder="Example: Jason Lucas" /></label>
        <label><span>Driver code</span><input id="exclusionCodeInput" type="text" placeholder="Example: 242051" /></label>
        <label><span>Truck number</span><input id="exclusionTruckInput" type="text" placeholder="Example: 12345" /></label>
        <label class="exclusion-note-field"><span>Reason or note</span><input id="exclusionNoteInput" type="text" placeholder="Optional context" /></label>
        <button class="primary-btn" type="submit">ADD EXCLUSION</button>
      </form>
      <div class="exclusion-toolbar">
        <input id="exclusionSearchInput" type="search" placeholder="Search exclusions" aria-label="Search exclusions" />
        <span id="exclusionStatus" role="status"></span>
      </div>
      <div id="exclusionEmptyState" class="worked-empty-state">No exclusions saved.</div>
      <div id="exclusionList" class="exclusion-list"></div>`;
    const settingsView = document.getElementById("settingsView");
    if (settingsView) settingsView.insertAdjacentElement("beforebegin", section);
    else document.querySelector(".main-panel")?.append(section);
  }

  function bindEvents() {
    const form = document.getElementById("exclusionForm");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", handleSubmit);
    }

    const list = document.getElementById("exclusionList");
    if (list && !list.dataset.bound) {
      list.dataset.bound = "true";
      list.addEventListener("click", (event) => {
        const button = event.target.closest("[data-exclusion-delete]");
        if (!button) return;
        const removed = removeEntry(button.dataset.exclusionDelete);
        if (removed) {
          showStatus("Exclusion removed. Refreshing report data.");
          requestDashboardRefresh();
        }
      });
      list.addEventListener("change", (event) => {
        const toggle = event.target.closest("[data-exclusion-toggle]");
        if (!toggle) return;
        updateEntry(toggle.dataset.exclusionToggle, { enabled: toggle.checked });
        showStatus(toggle.checked ? "Exclusion enabled. Refreshing report data." : "Exclusion disabled. Refreshing report data.");
        requestDashboardRefresh();
      });
    }

    const search = document.getElementById("exclusionSearchInput");
    if (search && !search.dataset.bound) {
      search.dataset.bound = "true";
      search.addEventListener("input", render);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const name = readInput("exclusionNameInput");
    const code = readInput("exclusionCodeInput");
    const truck = readInput("exclusionTruckInput");
    const note = readInput("exclusionNoteInput");
    if (![name, code, truck].some(Boolean)) {
      showStatus("Enter a driver name, driver code, or truck number.", true);
      return;
    }

    const duplicate = entries.find((entry) =>
      normalizeName(entry.name) === normalizeName(name)
      && normalizeId(entry.code) === normalizeId(code)
      && normalizeId(entry.truck) === normalizeId(truck));
    if (duplicate) {
      updateEntry(duplicate.id, { enabled: true, note: note || duplicate.note });
      showStatus("That exclusion already existed, so it was re-enabled.");
    } else {
      addEntry({ name, code, truck, note, enabled: true });
      showStatus("Exclusion added. Refreshing report data.");
    }

    ["exclusionNameInput", "exclusionCodeInput", "exclusionTruckInput", "exclusionNoteInput"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    document.getElementById("exclusionNameInput")?.focus();
    requestDashboardRefresh();
  }

  function addEntry(value) {
    const entry = sanitizeEntry({ ...value, id: value?.id || makeId() });
    if (![entry.name, entry.code, entry.truck].some(Boolean)) return null;
    entries = [...entries, entry];
    persist();
    render();
    return cloneEntry(entry);
  }

  function updateEntry(id, patch) {
    let changed = false;
    entries = entries.map((entry) => {
      if (entry.id !== id) return entry;
      changed = true;
      return sanitizeEntry({ ...entry, ...patch, id: entry.id });
    });
    if (changed) {
      persist();
      render();
    }
    return changed;
  }

  function removeEntry(id) {
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return false;
    entries = next;
    persist();
    render();
    return true;
  }

  function matches(record) {
    if (!record || typeof record !== "object") return false;
    const names = collectNames(record);
    const codes = collectIds(record, ["driverCode", "driverId", "employeeCode", "employeeId", "code"], true);
    const trucks = collectIds(record, ["truck", "truckNumber", "unit", "unitNumber", "tractor", "tractorNumber", "assignedTruck"]);

    return entries.some((entry) => {
      if (!entry.enabled) return false;
      const nameMatch = entry.name && names.some((name) => name === normalizeName(entry.name));
      const codeMatch = entry.code && codes.has(normalizeId(entry.code));
      const truckMatch = entry.truck && trucks.has(normalizeId(entry.truck));
      return Boolean(nameMatch || codeMatch || truckMatch);
    });
  }

  function collectNames(record) {
    const values = [record.driverName, record.name, record.driver, record.operatorName];
    return values.map(normalizeName).filter(Boolean);
  }

  function collectIds(record, fields, includeDriverName = false) {
    const values = new Set();
    for (const field of fields) {
      const normalized = normalizeId(record?.[field]);
      if (normalized) values.add(normalized);
    }
    const text = fields.map((field) => String(record?.[field] ?? "")).join(" ") + (includeDriverName ? ` ${record.driverName || ""}` : "");
    for (const match of text.match(/\b[A-Z0-9-]{4,}\b/gi) || []) {
      const normalized = normalizeId(match);
      if (normalized) values.add(normalized);
    }
    return values;
  }

  function normalizeName(value) {
    return (String(value ?? "").toLowerCase().match(/[a-z]+/g) || []).sort().join("|");
  }

  function normalizeId(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function seedDefaultsOnce() {
    if (localStorage.getItem(SEEDED_KEY) === "true") return;
    const existingKeys = new Set(entries.map(entryKey));
    const seeded = DEFAULT_ENTRIES.filter((entry) => !existingKeys.has(entryKey(entry))).map(sanitizeEntry);
    if (seeded.length) entries = [...entries, ...seeded];
    localStorage.setItem(SEEDED_KEY, "true");
    persist();
  }

  function entryKey(entry) {
    return `${normalizeName(entry.name)}|${normalizeId(entry.code)}|${normalizeId(entry.truck)}`;
  }

  function loadEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(sanitizeEntry).filter((entry) => [entry.name, entry.code, entry.truck].some(Boolean)) : [];
    } catch (_) {
      return [];
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function sanitizeEntry(entry) {
    return {
      id: String(entry?.id || makeId()),
      name: String(entry?.name || "").trim(),
      code: String(entry?.code || "").trim(),
      truck: String(entry?.truck || "").trim(),
      note: String(entry?.note || "").trim(),
      enabled: entry?.enabled !== false,
      createdAt: entry?.createdAt || new Date().toISOString(),
    };
  }

  function cloneEntry(entry) {
    return { ...entry };
  }

  function makeId() {
    return `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function render() {
    const list = document.getElementById("exclusionList");
    const empty = document.getElementById("exclusionEmptyState");
    if (!list || !empty) return;
    const query = normalizeSearch(document.getElementById("exclusionSearchInput")?.value);
    const visible = entries.filter((entry) => !query || normalizeSearch([entry.name, entry.code, entry.truck, entry.note].join(" ")).includes(query));
    list.innerHTML = visible.map(renderEntry).join("");
    empty.classList.toggle("hidden", visible.length > 0);
    empty.textContent = entries.length ? "No exclusions match that search." : "No exclusions saved.";

    const enabled = entries.filter((entry) => entry.enabled).length;
    const badge = document.querySelector('[data-view="exclusions"] .exclusion-nav-count');
    if (badge) badge.textContent = String(enabled);
    const count = document.getElementById("exclusionEnabledCount");
    if (count) count.textContent = String(enabled);
  }

  function renderEntry(entry) {
    const identifiers = [
      entry.name ? `<span><b>Name</b>${escapeHtml(entry.name)}</span>` : "",
      entry.code ? `<span><b>Code</b>${escapeHtml(entry.code)}</span>` : "",
      entry.truck ? `<span><b>Truck</b>${escapeHtml(entry.truck)}</span>` : "",
    ].filter(Boolean).join("");
    return `<article class="exclusion-card ${entry.enabled ? "" : "exclusion-card-disabled"}">
      <label class="exclusion-toggle"><input type="checkbox" data-exclusion-toggle="${escapeHtml(entry.id)}" ${entry.enabled ? "checked" : ""} /><span></span><b>${entry.enabled ? "Active" : "Paused"}</b></label>
      <div class="exclusion-identifiers">${identifiers}</div>
      <div class="exclusion-note">${escapeHtml(entry.note || "No note")}</div>
      <button class="secondary-btn" type="button" data-exclusion-delete="${escapeHtml(entry.id)}">REMOVE</button>
    </article>`;
  }

  function requestDashboardRefresh() {
    window.setTimeout(() => {
      const refresh = document.getElementById("refreshBtn");
      if (refresh && !refresh.disabled) refresh.click();
    }, 75);
  }

  function readInput(id) {
    return document.getElementById(id)?.value?.trim() || "";
  }

  function showStatus(message, error = false) {
    const status = document.getElementById("exclusionStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => {
      status.textContent = "";
      status.classList.remove("is-error");
    }, 5000);
  }

  function normalizeSearch(value) {
    return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function installStyles() {
    if (document.getElementById("exclusionManagerStyles")) return;
    const style = document.createElement("style");
    style.id = "exclusionManagerStyles";
    style.textContent = `
      .exclusion-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(244,63,94,.12);border:1px solid rgba(244,63,94,.35);color:#fda4af;font-size:9px;text-align:center}
      .exclusion-summary{display:flex;align-items:baseline;gap:7px;padding:8px 12px;border:1px solid rgba(244,63,94,.35);background:rgba(244,63,94,.08)}.exclusion-summary strong{font-size:22px;color:#fda4af}.exclusion-summary span{font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:900}
      .exclusion-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0;padding:16px;border:1px solid rgba(148,163,184,.18);background:rgba(7,14,20,.72)}.exclusion-form label{display:grid;gap:6px}.exclusion-form label span{font-size:10px;color:var(--muted);font-weight:900;text-transform:uppercase;letter-spacing:.04em}.exclusion-form input,.exclusion-toolbar input{width:100%;min-height:40px;padding:9px 11px;border:1px solid rgba(148,163,184,.28);background:#081019;color:var(--white);font:inherit}.exclusion-note-field{grid-column:span 2}.exclusion-form .primary-btn{align-self:end;min-height:40px}
      .exclusion-toolbar{display:flex;gap:12px;align-items:center;margin:0 0 12px}.exclusion-toolbar input{max-width:340px}.exclusion-toolbar span{font-size:11px;color:#86efac}.exclusion-toolbar span.is-error{color:#fda4af}
      .exclusion-list{display:grid;gap:10px}.exclusion-card{display:grid;grid-template-columns:auto minmax(0,1.4fr) minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border:1px solid rgba(244,63,94,.34);background:linear-gradient(110deg,rgba(244,63,94,.09),rgba(7,14,20,.94))}.exclusion-card-disabled{opacity:.58;border-color:rgba(148,163,184,.24);background:rgba(7,14,20,.72)}
      .exclusion-toggle{display:flex;align-items:center;gap:7px;cursor:pointer}.exclusion-toggle input{position:absolute;opacity:0}.exclusion-toggle span{position:relative;width:36px;height:20px;border-radius:999px;background:#25313a;border:1px solid #475569}.exclusion-toggle span:after{content:"";position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#94a3b8;transition:.18s}.exclusion-toggle input:checked+span{background:rgba(244,63,94,.24);border-color:#fb7185}.exclusion-toggle input:checked+span:after{left:19px;background:#fda4af}.exclusion-toggle b{font-size:10px;color:var(--muted)}
      .exclusion-identifiers{display:flex;gap:8px;flex-wrap:wrap}.exclusion-identifiers span{display:flex;gap:6px;padding:5px 8px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.62);font-size:11px}.exclusion-identifiers b{color:#fda4af;text-transform:uppercase;font-size:9px}.exclusion-note{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
      @media(max-width:900px){.exclusion-form{grid-template-columns:1fr 1fr}.exclusion-note-field{grid-column:span 1}.exclusion-card{grid-template-columns:1fr auto}.exclusion-identifiers,.exclusion-note{grid-column:1/-1}}
      @media(max-width:620px){.exclusion-form{grid-template-columns:1fr}.exclusion-card{grid-template-columns:1fr}.exclusion-toolbar{align-items:stretch;flex-direction:column}.exclusion-toolbar input{max-width:none}}
    `;
    document.head.append(style);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();
