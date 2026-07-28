(() => {
  "use strict";

  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const NOTE_SELECTION_KEY = "vixenTransitionNoteSelectionV1";
  const SETTINGS_KEY = "vixenTransitionEmailSettingsV1";
  const DRAFT_KEY = "vixenTransitionEmailDraftV1";

  const DEFAULT_SETTINGS = Object.freeze({
    to: "",
    cc: "",
    subjectTemplate: "Shift Transition - {{date}}",
    bodyTemplate: [
      "{{brand}} SHIFT TRANSITION",
      "Prepared: {{prepared}}",
      "",
      "TRUCK FOLLOW-UPS ({{truck_count}})",
      "{{truck_followups}}",
      "",
      "DRIVER / IDLE FOLLOW-UPS ({{driver_count}})",
      "{{driver_followups}}",
      "",
      "Total selected follow-ups: {{followup_count}}",
    ].join("\n"),
  });

  const PLACEHOLDERS = Object.freeze([
    "date", "time", "prepared", "weekday", "brand",
    "truck_followups", "driver_followups", "all_followups",
    "truck_count", "driver_count", "followup_count",
  ]);

  let settings = loadSettings();
  let installed = false;

  const api = Object.freeze({
    buildTransition,
    buildContext,
    buildEmail,
    renderTemplate,
    aggregateToday,
    sameLocalDay,
    noteIncluded,
    openEditor,
    refresh: () => prepareEmail(true),
  });

  window.VixenTransitionExport = api;
  window.addEventListener("click", intercept, true);
  window.addEventListener("storage", handleStorage);
  document.addEventListener("DOMContentLoaded", install);

  function install() {
    if (installed) return;
    installed = true;
    installStyles();
    installView();
    bindEvents();
    populateSettings();
    prepareEmail(true);
  }

  function intercept(event) {
    const target = event.target?.closest?.("#exportTransitionBtn");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEditor();
  }

  function openEditor() {
    if (!installed) install();
    prepareEmail(true);
    const nav = document.querySelector('[data-view="transition"]');
    if (nav) nav.click();
    else document.getElementById("transitionView")?.classList.add("active-view");
    setStatus("Transition refreshed from today’s selected notes.");
  }

  function installView() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="transition"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "transition";
      button.innerHTML = '<span>✉</span><span>Transition</span><strong id="transitionNavCount" class="transition-nav-count">0</strong>';
      const exclusions = nav.querySelector('[data-view="exclusions"]');
      const settingsButton = nav.querySelector('[data-view="settings"]');
      if (exclusions) exclusions.insertAdjacentElement("afterend", button);
      else if (settingsButton) settingsButton.insertAdjacentElement("beforebegin", button);
      else nav.append(button);
    }

    if (document.getElementById("transitionView")) return;
    const section = document.createElement("section");
    section.id = "transitionView";
    section.className = "view table-view transition-editor-view";
    section.innerHTML = `
      <div class="view-heading transition-heading">
        <div><span class="eyebrow">SHIFT HANDOFF</span><h2>Transition Email Editor</h2></div>
        <div class="transition-summary"><strong id="transitionSelectedCount">0</strong><span>selected notes</span></div>
      </div>
      <div class="table-explainer"><strong>How this works:</strong> notes marked “Included in transition” are merged into your saved template. Review the prepared email, edit anything that needs human judgment, then open it in Outlook or download an Outlook-readable .eml file. Recipients and templates stay in this browser.</div>
      <div class="transition-editor-grid">
        <article class="panel transition-template-panel">
          <div class="panel-title purple-text"><span>✦</span> EMAIL TEMPLATE</div>
          <div class="transition-address-grid">
            <label><span>To</span><input id="transitionToInput" type="text" placeholder="name@company.com; another@company.com" /></label>
            <label><span>Cc</span><input id="transitionCcInput" type="text" placeholder="Optional" /></label>
          </div>
          <label class="transition-field"><span>Subject template</span><input id="transitionSubjectTemplate" type="text" /></label>
          <label class="transition-field"><span>Body template</span><textarea id="transitionBodyTemplate" rows="16"></textarea></label>
          <div class="transition-placeholder-wrap">
            <span>Insert placeholder:</span>
            <div id="transitionPlaceholderButtons" class="transition-placeholder-buttons"></div>
          </div>
          <div class="transition-button-row">
            <button id="saveTransitionTemplateBtn" class="primary-btn" type="button">SAVE TEMPLATE</button>
            <button id="resetTransitionTemplateBtn" class="ghost-button" type="button">RESET TEMPLATE</button>
          </div>
        </article>
        <article class="panel transition-preview-panel">
          <div class="panel-title green-text"><span>✉</span> PREPARED OUTLOOK EMAIL</div>
          <div class="transition-preview-meta" id="transitionPreviewMeta">No selected notes yet.</div>
          <label class="transition-field"><span>Prepared subject</span><input id="transitionPreparedSubject" type="text" /></label>
          <label class="transition-field"><span>Prepared body</span><textarea id="transitionPreparedBody" rows="21"></textarea></label>
          <div class="transition-button-row transition-output-buttons">
            <button id="refreshTransitionEmailBtn" class="ghost-button" type="button">REFRESH FROM NOTES</button>
            <button id="openTransitionOutlookBtn" class="primary-btn" type="button">OPEN IN OUTLOOK</button>
            <button id="downloadTransitionEmlBtn" class="ghost-button" type="button">DOWNLOAD .EML</button>
            <button id="copyTransitionEmailBtn" class="ghost-button" type="button">COPY EMAIL</button>
          </div>
          <div id="transitionEditorStatus" class="transition-status" role="status" aria-live="polite"></div>
        </article>
      </div>`;

    const settingsView = document.getElementById("settingsView");
    if (settingsView) settingsView.insertAdjacentElement("beforebegin", section);
    else document.querySelector(".main-panel")?.append(section);

    const placeholderContainer = section.querySelector("#transitionPlaceholderButtons");
    if (placeholderContainer) {
      placeholderContainer.innerHTML = PLACEHOLDERS.map((name) => `<button type="button" data-transition-placeholder="${escapeAttribute(name)}">{{${escapeHtml(name)}}}</button>`).join("");
    }
  }

  function bindEvents() {
    byId("saveTransitionTemplateBtn")?.addEventListener("click", saveTemplate);
    byId("resetTransitionTemplateBtn")?.addEventListener("click", resetTemplate);
    byId("refreshTransitionEmailBtn")?.addEventListener("click", () => {
      prepareEmail(true);
      setStatus("Prepared email refreshed from today’s selected notes.");
    });
    byId("openTransitionOutlookBtn")?.addEventListener("click", openInOutlook);
    byId("downloadTransitionEmlBtn")?.addEventListener("click", downloadEml);
    byId("copyTransitionEmailBtn")?.addEventListener("click", copyEmail);

    byId("transitionPlaceholderButtons")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-transition-placeholder]");
      if (!button) return;
      insertAtCursor(byId("transitionBodyTemplate"), `{{${button.dataset.transitionPlaceholder}}}`);
    });

    ["transitionPreparedSubject", "transitionPreparedBody"].forEach((id) => {
      byId(id)?.addEventListener("input", saveDraft);
    });
  }

  function populateSettings() {
    setValue("transitionToInput", settings.to);
    setValue("transitionCcInput", settings.cc);
    setValue("transitionSubjectTemplate", settings.subjectTemplate);
    setValue("transitionBodyTemplate", settings.bodyTemplate);
  }

  function saveTemplate() {
    settings = sanitizeSettings({
      to: valueOf("transitionToInput"),
      cc: valueOf("transitionCcInput"),
      subjectTemplate: valueOf("transitionSubjectTemplate"),
      bodyTemplate: valueOf("transitionBodyTemplate"),
    });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    prepareEmail(true);
    setStatus("Template and recipients saved in this browser.");
  }

  function resetTemplate() {
    settings = { ...DEFAULT_SETTINGS };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    populateSettings();
    prepareEmail(true);
    setStatus("Transition template reset to the standard layout.");
  }

  function prepareEmail(fromTemplate = false) {
    settings = sanitizeSettings({
      ...settings,
      to: valueOf("transitionToInput") || settings.to,
      cc: valueOf("transitionCcInput") || settings.cc,
      subjectTemplate: valueOf("transitionSubjectTemplate") || settings.subjectTemplate,
      bodyTemplate: valueOf("transitionBodyTemplate") || settings.bodyTemplate,
    });
    const now = new Date();
    const email = buildEmail(now, settings);
    if (fromTemplate || !valueOf("transitionPreparedSubject")) setValue("transitionPreparedSubject", email.subject);
    if (fromTemplate || !valueOf("transitionPreparedBody")) setValue("transitionPreparedBody", email.body);
    saveDraft();
    updateSummary(email.context);
    return currentPreparedEmail(email.context);
  }

  function currentPreparedEmail(context = buildContext(new Date())) {
    return {
      to: valueOf("transitionToInput").trim(),
      cc: valueOf("transitionCcInput").trim(),
      subject: valueOf("transitionPreparedSubject").trim(),
      body: valueOf("transitionPreparedBody"),
      context,
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        subject: valueOf("transitionPreparedSubject"),
        body: valueOf("transitionPreparedBody"),
        savedAt: new Date().toISOString(),
      }));
    } catch (_) {
      // Draft persistence is convenient, not mission-critical.
    }
  }

  function openInOutlook() {
    const email = prepareEmail(false);
    if (!email.subject && !email.body) {
      setStatus("There is no prepared email to open.", true);
      return;
    }
    const recipients = normalizeRecipients(email.to).join(",");
    const params = new URLSearchParams();
    if (email.cc) params.set("cc", normalizeRecipients(email.cc).join(","));
    params.set("subject", email.subject);
    params.set("body", email.body);
    const url = `mailto:${encodeURIComponent(recipients)}?${params.toString()}`;
    if (url.length > 7000) {
      setStatus("This transition is large. Outlook may truncate a mail link; the .eml button is the safer route.", true);
    } else {
      setStatus("Opening the computer’s default mail app. Outlook must be the default handler to open directly there.");
    }
    window.location.href = url;
  }

  function downloadEml() {
    const email = prepareEmail(false);
    const now = new Date();
    const headers = [
      `To: ${normalizeRecipients(email.to).join(", ")}`,
      email.cc ? `Cc: ${normalizeRecipients(email.cc).join(", ")}` : "",
      `Subject: ${mimeHeader(email.subject || `Shift Transition - ${dateKey(now)}`)}`,
      `Date: ${now.toUTCString()}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(utf8Base64(email.body)),
      "",
    ].filter((line, index) => line || index >= 7).join("\r\n");
    downloadBlob(headers, `Shift_Transition_${dateKey(now)}.eml`, "message/rfc822;charset=utf-8");
    setStatus("Outlook-readable .eml file downloaded.");
  }

  async function copyEmail() {
    const email = prepareEmail(false);
    const content = [
      email.to ? `To: ${email.to}` : "",
      email.cc ? `Cc: ${email.cc}` : "",
      `Subject: ${email.subject}`,
      "",
      email.body,
    ].filter((line, index) => line || index >= 3).join("\n");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else fallbackCopy(content);
      setStatus("Prepared email copied.");
    } catch (_) {
      fallbackCopy(content);
      setStatus("Prepared email copied.");
    }
  }

  function buildEmail(now = new Date(), options = settings) {
    const context = buildContext(now);
    return {
      to: options.to || "",
      cc: options.cc || "",
      subject: renderTemplate(options.subjectTemplate || DEFAULT_SETTINGS.subjectTemplate, context).trim(),
      body: renderTemplate(options.bodyTemplate || DEFAULT_SETTINGS.bodyTemplate, context).replace(/\n{3,}/g, "\n\n").trim(),
      context,
    };
  }

  function buildTransition(
    now = new Date(),
    ptaNotes = readObject(PTA_NOTES_KEY),
    driverNotes = readObject(DRIVER_NOTES_KEY),
    selections = readObject(NOTE_SELECTION_KEY),
  ) {
    const context = buildContext(now, ptaNotes, driverNotes, selections);
    return renderTemplate(settings.bodyTemplate || DEFAULT_SETTINGS.bodyTemplate, context).replace(/\n/g, "\r\n");
  }

  function buildContext(
    now = new Date(),
    ptaNotes = readObject(PTA_NOTES_KEY),
    driverNotes = readObject(DRIVER_NOTES_KEY),
    selections = readObject(NOTE_SELECTION_KEY),
  ) {
    const trucks = collectTruckFollowups(ptaNotes, now, selections);
    const drivers = collectDriverFollowups(driverNotes, now, selections);
    const truckText = trucks.length ? trucks.map((item) => item.text).join("\n\n") : "None selected for today.";
    const driverText = drivers.length ? drivers.map((item) => item.text).join("\n\n") : "None selected for today.";
    const all = [...trucks, ...drivers].sort((a, b) => a.savedAt - b.savedAt);
    const date = now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
    return {
      date,
      time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      prepared: now.toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      weekday: now.toLocaleDateString([], { weekday: "long" }),
      brand: (localStorage.getItem("vixenBrand") || "VIXEN").trim().toUpperCase(),
      truck_followups: truckText,
      driver_followups: driverText,
      all_followups: all.length ? all.map((item) => item.text).join("\n\n") : "None selected for today.",
      truck_count: String(trucks.length),
      driver_count: String(drivers.length),
      followup_count: String(all.length),
      trucks,
      drivers,
    };
  }

  function collectTruckFollowups(groups, now, selections) {
    const items = [];
    Object.entries(groups || {}).forEach(([truck, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => sameLocalDay(note.savedAt, now) && noteIncluded("pta", note, selections))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      notes.forEach((note) => {
        const context = [
          note.driver ? `Driver ${cleanLine(note.driver)}` : "",
          note.pta ? `PTA ${formatDateTime(note.pta)}` : "",
          note.status ? `Status ${cleanLine(note.status)}` : "",
          note.planStatus ? `Plan ${cleanLine(note.planStatus)}` : "",
          note.destination ? `Destination ${cleanLine(note.destination)}` : "",
        ].filter(Boolean).join(" | ");
        items.push({
          savedAt: safeTime(note.savedAt),
          text: `Truck ${cleanLine(truck) || "Unknown"}${context ? ` | ${context}` : ""}\n  ${cleanLine(note.text) || "Note saved without text"}`,
        });
      });
    });
    return items.sort((a, b) => a.text.localeCompare(b.text));
  }

  function collectDriverFollowups(groups, now, selections) {
    const items = [];
    Object.entries(groups || {}).forEach(([key, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => sameLocalDay(note.savedAt, now) && noteIncluded("driver", note, selections))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      notes.forEach((note) => {
        const name = cleanLine(note.driverName || note.driverCode || key) || "Unknown driver";
        const code = cleanLine(note.driverCode);
        const metrics = [
          `Idle today ${formatPercent(note.dailyIdlePct)}`,
          `7-day ${formatPercent(note.idle7DayPct)}`,
          `28-day ${formatPercent(note.idle28DayPct)}`,
          Number.isFinite(Number(note.estimatedCost)) ? `Possible 28-day cost ${formatMoney(note.estimatedCost)}` : "",
        ].filter(Boolean).join(" | ");
        items.push({
          savedAt: safeTime(note.savedAt),
          text: `${name}${code && !name.includes(code) ? ` (${code})` : ""}\n  ${metrics}\n  ${cleanLine(note.text) || "Note saved without text"}`,
        });
      });
    });
    return items.sort((a, b) => a.text.localeCompare(b.text));
  }

  function aggregateToday(groups, now, labelFor, type, selections = {}) {
    return Object.entries(groups || {}).map(([key, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => sameLocalDay(note.savedAt, now) && noteIncluded(type, note, selections))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      if (!notes.length) return null;
      const combined = notes.map((note) => cleanLine(note.text)).filter(Boolean).join(" | ");
      return `${labelFor(key, notes)} - ${combined || "Note saved without text"}`;
    }).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function renderTemplate(template, context) {
    return String(template ?? "").replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (token, key) => {
      const normalized = key.toLowerCase();
      return Object.prototype.hasOwnProperty.call(context, normalized) ? String(context[normalized] ?? "") : token;
    });
  }

  function noteIncluded(type, note, selections = {}) {
    const noteId = String(note?.id ?? "").trim();
    if (!noteId) return false;
    return selections[`${type}:${noteId}`] === true;
  }

  function sameLocalDay(value, reference) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === reference.getFullYear()
      && date.getMonth() === reference.getMonth()
      && date.getDate() === reference.getDate();
  }

  function updateSummary(context) {
    const total = Number(context.followup_count) || 0;
    const count = byId("transitionSelectedCount");
    const navCount = byId("transitionNavCount");
    if (count) count.textContent = String(total);
    if (navCount) navCount.textContent = String(total);
    const meta = byId("transitionPreviewMeta");
    if (meta) meta.textContent = `${context.truck_count} truck note${context.truck_count === "1" ? "" : "s"} · ${context.driver_count} driver note${context.driver_count === "1" ? "" : "s"} · prepared ${context.prepared}`;
  }

  function handleStorage(event) {
    if (event.key === SETTINGS_KEY) {
      settings = loadSettings();
      populateSettings();
      prepareEmail(true);
    }
    if ([PTA_NOTES_KEY, DRIVER_NOTES_KEY, NOTE_SELECTION_KEY].includes(event.key)) prepareEmail(true);
  }

  function loadSettings() {
    try {
      return sanitizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") });
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function sanitizeSettings(value) {
    return {
      to: String(value?.to ?? "").slice(0, 2000),
      cc: String(value?.cc ?? "").slice(0, 2000),
      subjectTemplate: String(value?.subjectTemplate || DEFAULT_SETTINGS.subjectTemplate).slice(0, 1000),
      bodyTemplate: String(value?.bodyTemplate || DEFAULT_SETTINGS.bodyTemplate).slice(0, 50000),
    };
  }

  function normalizeRecipients(value) {
    return String(value ?? "").split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean);
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function installStyles() {
    if (document.getElementById("transitionEditorStyles")) return;
    const style = document.createElement("style");
    style.id = "transitionEditorStyles";
    style.textContent = `
      .transition-editor-grid{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:18px;align-items:start}
      .transition-template-panel,.transition-preview-panel{min-width:0}.transition-heading{align-items:center}.transition-summary{display:flex;align-items:baseline;gap:8px;padding:10px 14px;border:1px solid rgba(74,222,128,.35);background:rgba(34,197,94,.08);border-radius:12px}.transition-summary strong{font-size:22px;color:#86efac}.transition-summary span{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8}.transition-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(168,85,247,.22);color:#d8b4fe;font-size:10px;text-align:center}
      .transition-address-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.transition-address-grid label,.transition-field{display:grid;gap:7px;margin:0 0 12px}.transition-address-grid span,.transition-field>span,.transition-placeholder-wrap>span{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}
      .transition-editor-view input,.transition-editor-view textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(5,12,18,.78);color:#e5edf4;padding:11px 12px;font:inherit;outline:none}.transition-editor-view textarea{resize:vertical;line-height:1.48}.transition-editor-view input:focus,.transition-editor-view textarea:focus{border-color:rgba(168,85,247,.75);box-shadow:0 0 0 3px rgba(168,85,247,.12)}
      .transition-placeholder-wrap{display:grid;gap:8px;margin:4px 0 14px}.transition-placeholder-buttons{display:flex;gap:7px;flex-wrap:wrap}.transition-placeholder-buttons button{border:1px solid rgba(168,85,247,.35);border-radius:999px;background:rgba(168,85,247,.1);color:#d8b4fe;padding:5px 8px;font-size:10px;cursor:pointer}.transition-placeholder-buttons button:hover{background:rgba(168,85,247,.2)}
      .transition-button-row{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.transition-output-buttons{margin-top:4px}.transition-preview-meta{margin:-2px 0 12px;padding:9px 11px;border-left:3px solid #39ff63;background:rgba(57,255,99,.06);color:#a9b3bc;font-size:11px}.transition-status{min-height:20px;margin-top:12px;color:#86efac;font-size:11px}.transition-status.error{color:#fda4af}
      @media(max-width:1050px){.transition-editor-grid{grid-template-columns:1fr}}@media(max-width:620px){.transition-address-grid{grid-template-columns:1fr}.transition-button-row>*{width:100%;justify-content:center}}
    `;
    document.head.append(style);
  }

  function setStatus(message, error = false) {
    const status = byId("transitionEditorStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function insertAtCursor(input, value) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
    input.focus();
    input.setSelectionRange(start + value.length, start + value.length);
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    const href = link.href;
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function fallbackCopy(content) {
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function utf8Base64(value) {
    const bytes = new TextEncoder().encode(String(value ?? ""));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function wrapBase64(value) {
    return String(value || "").match(/.{1,76}/g)?.join("\r\n") || "";
  }

  function mimeHeader(value) {
    return `=?UTF-8?B?${utf8Base64(value)}?=`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "not captured" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "--";
  }

  function formatMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number) : "--";
  }

  function safeTime(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function cleanLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function dateKey(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function valueOf(id) {
    return byId(id)?.value ?? "";
  }

  function setValue(id, value) {
    const element = byId(id);
    if (element) element.value = value ?? "";
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();