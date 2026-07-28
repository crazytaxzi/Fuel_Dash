(() => {
  "use strict";

  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";
  const NOTE_SELECTION_KEY = "vixenTransitionNoteSelectionV1";
  const SETTINGS_KEY = "vixenTransitionEmailSettingsV2";
  const LEGACY_SETTINGS_KEY = "vixenTransitionEmailSettingsV1";
  const DRAFT_KEY = "vixenTransitionEmailDraftV2";
  const FORMAT_VERSION = 2;

  const DEFAULT_SETTINGS = Object.freeze({
    formatVersion: FORMAT_VERSION,
    to: "",
    cc: "",
    subjectTemplate: "Shift Transition - {{date}}",
    bodyTemplate: [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.45;max-width:760px;margin:0 auto;">',
      '  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#18263a;color:#ffffff;border-radius:10px;overflow:hidden;">',
      '    <tr><td style="padding:22px 24px;">',
      '      <div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:#a9f3c0;">{{brand}} Fleet Operations</div>',
      '      <div style="font-size:24px;font-weight:700;margin-top:4px;">Shift Transition</div>',
      '      <div style="font-size:13px;color:#d8e1ec;margin-top:7px;">{{weekday}}, {{date}} · Prepared {{time}}</div>',
      '    </td></tr>',
      '  </table>',
      '  <div style="height:16px;"></div>',
      '  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">',
      '    <tr>',
      '      <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">',
      '        <div style="border:1px solid #d8e0ea;border-radius:9px;padding:14px 16px;background:#f8fafc;">',
      '          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:#667085;">Truck follow-ups</div>',
      '          <div style="font-size:25px;font-weight:700;color:#172033;margin-top:3px;">{{truck_count}}</div>',
      '        </div>',
      '      </td>',
      '      <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">',
      '        <div style="border:1px solid #d8e0ea;border-radius:9px;padding:14px 16px;background:#f8fafc;">',
      '          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:#667085;">Driver follow-ups</div>',
      '          <div style="font-size:25px;font-weight:700;color:#172033;margin-top:3px;">{{driver_count}}</div>',
      '        </div>',
      '      </td>',
      '    </tr>',
      '  </table>',
      '  <div style="height:18px;"></div>',
      '  <div style="font-size:17px;font-weight:700;color:#172033;border-bottom:3px solid #7c3aed;padding-bottom:7px;margin-bottom:10px;">🚛 Truck / PTA follow-ups</div>',
      '  {{truck_followups_html}}',
      '  <div style="height:20px;"></div>',
      '  <div style="font-size:17px;font-weight:700;color:#172033;border-bottom:3px solid #16a34a;padding-bottom:7px;margin-bottom:10px;">⛽ Driver / idle follow-ups</div>',
      '  {{driver_followups_html}}',
      '  <div style="height:18px;"></div>',
      '  <div style="font-size:12px;color:#667085;border-top:1px solid #d8e0ea;padding-top:10px;">Total selected follow-ups: <strong>{{followup_count}}</strong></div>',
      '</div>',
    ].join("\n"),
  });

  const PLACEHOLDERS = Object.freeze([
    "date", "time", "prepared", "weekday", "brand",
    "truck_followups_html", "driver_followups_html", "all_followups_html",
    "truck_count", "driver_count", "followup_count",
  ]);
  const EMOJIS = Object.freeze(["✅", "⚠️", "🚨", "📌", "📞", "🔧", "⏳", "🚛", "⛽", "📊", "👍", "👀", "❗", "🟢", "🟡", "🔴"]);
  const ALLOWED_TAGS = new Set(["A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "H1", "H2", "H3", "HR", "I", "LI", "OL", "P", "SPAN", "STRONG", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL"]);

  let settings = loadSettings();
  let installed = false;
  let lastFocusedEditor = null;
  const savedRanges = new Map();

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
        <div><span class="eyebrow">SHIFT HANDOFF</span><h2>Rich Transition Email</h2></div>
        <div class="transition-summary"><strong id="transitionSelectedCount">0</strong><span>selected notes</span></div>
      </div>
      <div class="table-explainer"><strong>Built for Outlook:</strong> selected notes are arranged into readable sections. Format the prepared message with bold, italic, underline, and emoji controls. Use <strong>Copy Rich Email</strong> to paste into an Outlook draft or download the HTML .eml file. The mail-app shortcut is plain text because mail links cannot carry rich HTML.</div>
      <div class="transition-address-panel panel">
        <div class="transition-address-grid">
          <label><span>To</span><input id="transitionToInput" type="text" placeholder="name@company.com; another@company.com" /></label>
          <label><span>Cc</span><input id="transitionCcInput" type="text" placeholder="Optional" /></label>
          <label class="transition-subject-field"><span>Subject template</span><input id="transitionSubjectTemplate" type="text" /></label>
        </div>
      </div>
      <div class="transition-editor-grid">
        <article class="panel transition-template-panel">
          <div class="panel-title purple-text"><span>✦</span> SAVED EMAIL TEMPLATE</div>
          <p class="transition-panel-help">Edit the reusable layout. Placeholders are replaced when the email is prepared.</p>
          ${toolbarMarkup("transitionTemplateEditor")}
          <div id="transitionTemplateEditor" class="transition-rich-editor transition-template-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Transition email template"></div>
          <div class="transition-placeholder-wrap">
            <span>Insert live data:</span>
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
          ${toolbarMarkup("transitionPreparedBody")}
          <div id="transitionPreparedBody" class="transition-rich-editor transition-email-sheet" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Prepared transition email body"></div>
          <div class="transition-button-row transition-output-buttons">
            <button id="refreshTransitionEmailBtn" class="ghost-button" type="button">REFRESH FROM NOTES</button>
            <button id="copyTransitionRichBtn" class="primary-btn" type="button">COPY RICH EMAIL</button>
            <button id="downloadTransitionEmlBtn" class="primary-btn" type="button">DOWNLOAD OUTLOOK .EML</button>
            <button id="openTransitionOutlookBtn" class="ghost-button" type="button">OPEN MAIL APP (PLAIN)</button>
            <button id="copyTransitionPlainBtn" class="ghost-button" type="button">COPY PLAIN TEXT</button>
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
    section.querySelectorAll("[data-emoji-palette]").forEach((palette) => {
      palette.innerHTML = EMOJIS.map((emoji) => `<button type="button" data-editor-emoji="${escapeAttribute(emoji)}" title="Insert ${escapeAttribute(emoji)}">${emoji}</button>`).join("");
    });
  }

  function toolbarMarkup(targetId) {
    return `
      <div class="transition-toolbar" data-toolbar-target="${targetId}" role="toolbar" aria-label="Formatting controls">
        <button type="button" data-editor-command="bold" title="Bold"><strong>B</strong></button>
        <button type="button" data-editor-command="italic" title="Italic"><em>I</em></button>
        <button type="button" data-editor-command="underline" title="Underline"><u>U</u></button>
        <span class="transition-toolbar-divider"></span>
        <button type="button" data-editor-command="insertUnorderedList" title="Bulleted list">• List</button>
        <button type="button" data-editor-command="removeFormat" title="Remove formatting">Clear</button>
        <details class="transition-emoji-menu">
          <summary title="Insert emoji">😊 Emotes</summary>
          <div class="transition-emoji-palette" data-emoji-palette></div>
        </details>
      </div>`;
  }

  function bindEvents() {
    byId("saveTransitionTemplateBtn")?.addEventListener("click", saveTemplate);
    byId("resetTransitionTemplateBtn")?.addEventListener("click", resetTemplate);
    byId("refreshTransitionEmailBtn")?.addEventListener("click", () => {
      prepareEmail(true);
      setStatus("Prepared email refreshed from today’s selected notes.");
    });
    byId("copyTransitionRichBtn")?.addEventListener("click", copyRichEmail);
    byId("downloadTransitionEmlBtn")?.addEventListener("click", downloadEml);
    byId("openTransitionOutlookBtn")?.addEventListener("click", openInOutlook);
    byId("copyTransitionPlainBtn")?.addEventListener("click", copyPlainEmail);

    byId("transitionPlaceholderButtons")?.addEventListener("mousedown", (event) => event.preventDefault());
    byId("transitionPlaceholderButtons")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-transition-placeholder]");
      if (!button) return;
      insertHtmlAtCursor(byId("transitionTemplateEditor"), `{{${button.dataset.transitionPlaceholder}}}`);
      saveDraft();
    });

    document.querySelectorAll(".transition-toolbar").forEach((toolbar) => {
      toolbar.addEventListener("mousedown", (event) => {
        if (event.target.closest("button,summary")) event.preventDefault();
      });
      toolbar.addEventListener("click", handleToolbarClick);
    });

    ["transitionTemplateEditor", "transitionPreparedBody"].forEach((id) => {
      const editor = byId(id);
      editor?.addEventListener("focus", () => { lastFocusedEditor = editor; });
      editor?.addEventListener("keyup", () => saveEditorRange(editor));
      editor?.addEventListener("mouseup", () => saveEditorRange(editor));
      editor?.addEventListener("input", () => {
        lastFocusedEditor = editor;
        saveDraft();
      });
      editor?.addEventListener("paste", handleEditorPaste);
    });
    byId("transitionPreparedSubject")?.addEventListener("input", saveDraft);
  }

  function handleToolbarClick(event) {
    const toolbar = event.currentTarget;
    const editor = byId(toolbar.dataset.toolbarTarget) || lastFocusedEditor;
    if (!editor) return;
    restoreEditorRange(editor);
    const emojiButton = event.target.closest("[data-editor-emoji]");
    if (emojiButton) {
      insertHtmlAtCursor(editor, escapeHtml(emojiButton.dataset.editorEmoji));
      toolbar.querySelector("details")?.removeAttribute("open");
      saveDraft();
      return;
    }
    const commandButton = event.target.closest("[data-editor-command]");
    if (!commandButton) return;
    editor.focus();
    document.execCommand(commandButton.dataset.editorCommand, false, null);
    saveEditorRange(editor);
    saveDraft();
  }

  function handleEditorPaste(event) {
    event.preventDefault();
    const plain = event.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, plain);
  }

  function saveEditorRange(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    savedRanges.set(editor.id, selection.getRangeAt(0).cloneRange());
  }

  function restoreEditorRange(editor) {
    editor.focus();
    const range = savedRanges.get(editor.id);
    if (!range) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function populateSettings() {
    setValue("transitionToInput", settings.to);
    setValue("transitionCcInput", settings.cc);
    setValue("transitionSubjectTemplate", settings.subjectTemplate);
    setEditorHtml("transitionTemplateEditor", settings.bodyTemplate);
  }

  function saveTemplate() {
    settings = sanitizeSettings({
      formatVersion: FORMAT_VERSION,
      to: valueOf("transitionToInput"),
      cc: valueOf("transitionCcInput"),
      subjectTemplate: valueOf("transitionSubjectTemplate"),
      bodyTemplate: editorHtml("transitionTemplateEditor"),
    });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    prepareEmail(true);
    setStatus("Rich template and recipients saved in this browser.");
  }

  function resetTemplate() {
    settings = { ...DEFAULT_SETTINGS };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    populateSettings();
    prepareEmail(true);
    setStatus("Transition template reset to the readable Outlook layout.");
  }

  function prepareEmail(fromTemplate = false) {
    settings = sanitizeSettings({
      ...settings,
      formatVersion: FORMAT_VERSION,
      to: valueOf("transitionToInput") || settings.to,
      cc: valueOf("transitionCcInput") || settings.cc,
      subjectTemplate: valueOf("transitionSubjectTemplate") || settings.subjectTemplate,
      bodyTemplate: editorHtml("transitionTemplateEditor") || settings.bodyTemplate,
    });
    const now = new Date();
    const email = buildEmail(now, settings);
    if (fromTemplate || !valueOf("transitionPreparedSubject")) setValue("transitionPreparedSubject", email.subject);
    if (fromTemplate || !editorHtml("transitionPreparedBody")) setEditorHtml("transitionPreparedBody", email.html);
    saveDraft();
    updateSummary(email.context);
    return currentPreparedEmail(email.context);
  }

  function currentPreparedEmail(context = buildContext(new Date())) {
    const html = sanitizeHtml(editorHtml("transitionPreparedBody"));
    return {
      to: valueOf("transitionToInput").trim(),
      cc: valueOf("transitionCcInput").trim(),
      subject: valueOf("transitionPreparedSubject").trim(),
      html,
      text: htmlToPlainText(html),
      context,
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        subject: valueOf("transitionPreparedSubject"),
        html: editorHtml("transitionPreparedBody"),
        savedAt: new Date().toISOString(),
      }));
    } catch (_) {
      // Draft persistence is convenient, not mission-critical.
    }
  }

  async function copyRichEmail() {
    const email = prepareEmail(false);
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) {
        const item = new ClipboardItem({
          "text/html": new Blob([email.html], { type: "text/html" }),
          "text/plain": new Blob([email.text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
         setStatus("Rich email copied. Paste it into an Outlook draft to keep the formatting.");
        return;
      }
      copyRichFallback(email.html);
      setStatus("Rich email copied. Paste it into Outlook.");
    } catch (_) {
      copyRichFallback(email.html);
      setStatus("Rich email copied using the browser fallback. Paste it into Outlook.");
    }
  }

  function openInOutlook() {
    const email = prepareEmail(false);
    if (!email.subject && !email.text) {
      setStatus("There is no prepared email to open.", true);
      return;
    }
    const recipients = normalizeRecipients(email.to).join(",");
    const params = new URLSearchParams();
    if (email.cc) params.set("cc", normalizeRecipients(email.cc).join(","));
    params.set("subject", email.subject);
    params.set("body", email.text);
    const url = `mailto:${encodeURIComponent(recipients)}?${params.toString()}`;
    if (url.length > 7000) {
      setStatus("This message is too large for a reliable mail link. Copy the rich email or use the .eml file instead.", true);
      return;
    }
    setStatus("Opening the default mail app with plain text. Use Copy Rich Email or .eml to preserve formatting.");
    window.location.href = url;
  }

  function downloadEml() {
    const email = prepareEmail(false);
    const now = new Date();
    const boundary = `vixen-transition-${Date.now().toString(36)}`;
    const headers = [
      `To: ${normalizeRecipients(email.to).join(", ")}`,
      email.cc ? `Cc: ${normalizeRecipients(email.cc).join(", ")}` : "",
      `Subject: ${mimeHeader(email.subject || `Shift Transition - ${dateKey(now)}`)}`,
      `Date: ${now.toUTCString()}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(utf8Base64(email.text)),
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(utf8Base64(outlookDocument(email.html))),
      "",
      `--${boundary}--`,
      "",
    ].filter((line, index) => line || index >= 5).join("\r\n");
    downloadBlob(headers, `Shift_Transition_${dateKey(now)}.eml`, "message/rfc822;charset=utf-8");
    setStatus("Formatted Outlook .eml downloaded. Open it with Outlook to review the email.");
  }

  async function copyPlainEmail() {
    const email = prepareEmail(false);
    const content = [
      email.to ? `To: ${email.to}` : "",
      email.cc ? `Cc: ${email.cc}` : "",
      `Subject: ${email.subject}`,
      "",
      email.text,
    ].filter((line, index) => line || index >= 3).join("\n");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content);
      else fallbackCopy(content);
      setStatus("Plain-text email copied.");
    } catch (_) {
      fallbackCopy(content);
      setStatus("Plain-text email copied.");
    }
  }

  function buildEmail(now = new Date(), options = settings) {
    const context = buildContext(now);
    const html = sanitizeHtml(renderTemplate(options.bodyTemplate || DEFAULT_SETTINGS.bodyTemplate, context));
    return {
      to: options.to || "",
      cc: options.cc || "",
      subject: renderTemplate(options.subjectTemplate || DEFAULT_SETTINGS.subjectTemplate, context).trim(),
      html,
      text: htmlToPlainText(html),
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
    const html = sanitizeHtml(renderTemplate(settings.bodyTemplate || DEFAULT_SETTINGS.bodyTemplate, context));
    return htmlToPlainText(html).replace(/\n/g, "\r\n");
  }

  function buildContext(
    now = new Date(),
    ptaNotes = readObject(PTA_NOTES_KEY),
    driverNotes = readObject(DRIVER_NOTES_KEY),
    selections = readObject(NOTE_SELECTION_KEY),
  ) {
    const trucks = collectTruckFollowups(ptaNotes, now, selections);
    const drivers = collectDriverFollowups(driverNotes, now, selections);
    const truckHtml = trucks.length ? trucks.map((item) => item.html).join("") : emptyStateHtml("No truck follow-ups selected for today.");
    const driverHtml = drivers.length ? drivers.map((item) => item.html).join("") : emptyStateHtml("No driver follow-ups selected for today.");
    const all = [...trucks, ...drivers].sort((a, b) => a.savedAt - b.savedAt);
    const date = now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
    return {
      date,
      time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      prepared: now.toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      weekday: now.toLocaleDateString([], { weekday: "long" }),
      brand: escapeHtml((localStorage.getItem("vixenBrand") || "VIXEN").trim().toUpperCase()),
      truck_followups_html: truckHtml,
      driver_followups_html: driverHtml,
      all_followups_html: all.length ? all.map((item) => item.html).join("") : emptyStateHtml("No follow-ups selected for today."),
      truck_followups: trucks.length ? trucks.map((item) => item.text).join("\n\n") : "None selected for today.",
      driver_followups: drivers.length ? drivers.map((item) => item.text).join("\n\n") : "None selected for today.",
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
        const truckLabel = cleanLine(truck) || "Unknown";
        const details = [
          note.driver ? `<strong>Driver:</strong> ${escapeHtml(cleanLine(note.driver))}` : "",
          note.pta ? `<strong>PTA:</strong> ${escapeHtml(formatDateTime(note.pta))}` : "",
          note.status ? `<strong>Status:</strong> ${escapeHtml(cleanLine(note.status))}` : "",
          note.planStatus ? `<strong>Plan:</strong> ${escapeHtml(cleanLine(note.planStatus))}` : "",
          note.destination ? `<strong>Destination:</strong> ${escapeHtml(cleanLine(note.destination))}` : "",
        ].filter(Boolean).join(" &nbsp;·&nbsp; ");
        const textDetails = [
          note.driver ? `Driver ${cleanLine(note.driver)}` : "",
          note.pta ? `PTA ${formatDateTime(note.pta)}` : "",
          note.status ? `Status ${cleanLine(note.status)}` : "",
          note.planStatus ? `Plan ${cleanLine(note.planStatus)}` : "",
          note.destination ? `Destination ${cleanLine(note.destination)}` : "",
        ].filter(Boolean).join(" | ");
        items.push({
          savedAt: safeTime(note.savedAt),
          text: `Truck ${truckLabel}${textDetails ? ` | ${textDetails}` : ""}\n${cleanLine(note.text) || "Note saved without text"}`,
          html: followupCardHtml(`🚛 Truck ${escapeHtml(truckLabel)}`, details, note.text, "#7c3aed"),
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
        const title = `⛽ ${escapeHtml(name)}${code && !name.includes(code) ? ` <span style="font-weight:400;color:#667085;">(${escapeHtml(code)})</span>` : ""}`;
        const metricPairs = [
          ["Idle today", formatPercent(note.dailyIdlePct)],
          ["7-day idle", formatPercent(note.idle7DayPct)],
          ["28-day idle", formatPercent(note.idle28DayPct)],
          ["Possible 28-day cost", Number.isFinite(Number(note.estimatedCost)) ? formatMoney(note.estimatedCost) : ""],
        ].filter((item) => item[1] && item[1] !== "--");
        const metricsHtml = metricPairs.map(([label, value]) => `<span style="display:inline-block;margin:2px 10px 2px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`).join("");
        const metricsText = metricPairs.map(([label, value]) => `${label} ${value}`).join(" | ");
        items.push({
          savedAt: safeTime(note.savedAt),
          text: `${name}${code && !name.includes(code) ? ` (${code})` : ""}\n${metricsText}\n${cleanLine(note.text) || "Note saved without text"}`,
          html: followupCardHtml(title, metricsHtml, note.text, "#16a34a"),
        });
      });
    });
    return items.sort((a, b) => a.text.localeCompare(b.text));
  }

  function followupCardHtml(title, details, noteText, accent) {
    return [
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:0 0 10px;border:1px solid #d8e0ea;border-left:5px solid ${accent};border-radius:8px;background:#ffffff;">`,
      '<tr><td style="padding:13px 15px;">',
      `<div style="font-size:15px;font-weight:700;color:#172033;">${title}</div>`,
      details ? `<div style="font-size:12px;color:#475467;margin-top:5px;line-height:1.55;">${details}</div>` : "",
      `<div style="font-size:14px;color:#172033;margin-top:9px;padding-top:9px;border-top:1px solid #edf0f4;">${escapeHtml(cleanLine(noteText) || "Note saved without text")}</div>`,
      "</td></tr></table>",
    ].join("");
  }

  function emptyStateHtml(message) {
    return `<div style="border:1px dashed #c6cfda;border-radius:8px;background:#f8fafc;color:#667085;padding:14px 16px;font-size:13px;">${escapeHtml(message)}</div>`;
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
    if ([SETTINGS_KEY, LEGACY_SETTINGS_KEY].includes(event.key)) {
      settings = loadSettings();
      populateSettings();
      prepareEmail(true);
    }
    if ([PTA_NOTES_KEY, DRIVER_NOTES_KEY, NOTE_SELECTION_KEY].includes(event.key)) prepareEmail(true);
  }

  function loadSettings() {
    try {
      const current = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (current?.formatVersion === FORMAT_VERSION) return sanitizeSettings({ ...DEFAULT_SETTINGS, ...current });
      const legacy = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || "{}");
      return sanitizeSettings({
        ...DEFAULT_SETTINGS,
        to: legacy?.to || "",
        cc: legacy?.cc || "",
        subjectTemplate: legacy?.subjectTemplate || DEFAULT_SETTINGS.subjectTemplate,
      });
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function sanitizeSettings(value) {
    return {
      formatVersion: FORMAT_VERSION,
      to: String(value?.to ?? "").slice(0, 2000),
      cc: String(value?.cc ?? "").slice(0, 2000),
      subjectTemplate: String(value?.subjectTemplate || DEFAULT_SETTINGS.subjectTemplate).slice(0, 1000),
      bodyTemplate: sanitizeHtml(String(value?.bodyTemplate || DEFAULT_SETTINGS.bodyTemplate).slice(0, 100000)),
    };
  }

  function sanitizeHtml(value) {

    return removeEmailBackgrounds(sanitizeHtmlBase(value));

  }


  function removeEmailBackgrounds(html) {

    const container = document.createElement("div");

    container.innerHTML = String(html ?? "");

    const readableColors = {

      "#fff": "#172033",

      "#ffffff": "#172033",

      "white": "#172033",

      "#a9f3c0": "#475467",

      "#d8e1ec": "#667085",

    };

    container.querySelectorAll("*").forEach((element) => {

      element.style.removeProperty("background");

      element.style.removeProperty("background-color");

      element.style.removeProperty("background-image");

      element.removeAttribute("bgcolor");

      element.removeAttribute("background");

      const color = String(element.style.color || "").trim().toLowerCase();

      if (readableColors[color]) element.style.color = readableColors[color];

    });

    return stripEmailBackgroundCss(container.innerHTML);

  }


  function stripEmailBackgroundCss(value) {

    return String(value ?? "")

      .replace(/(?:background(?:-color|-image)?)\s*:[^;"']*;?/gi, "")

      .replace(/\s(?:bgcolor|background)\s*=\s*(["']).*?\1/gi, "");

  }


  function sanitizeHtmlBase(value) {
    const template = document.createElement("template");
    template.innerHTML = String(value ?? "");
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
    const removals = [];
    let node = walker.nextNode();
    while (node) {
      if (!ALLOWED_TAGS.has(node.tagName)) {
        removals.push(node);
      } else {
        [...node.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          if (name === "style") {
            const style = attribute.value.replace(/url\s*\(|expression\s*\(|javascript:/gi, "");
            node.setAttribute("style", style.slice(0, 5000));
          } else if (!["href", "role", "width", "height", "cellspacing", "cellpadding", "colspan", "rowspan"].includes(name)) {
            node.removeAttribute(attribute.name);
          } else if (name === "href" && !/^https?:|^mailto:/i.test(attribute.value)) {
            node.removeAttribute(attribute.name);
          }
        });
      }
      node = walker.nextNode();
    }
    removals.reverse().forEach((element) => element.replaceWith(...element.childNodes));
    return template.innerHTML;
  }

  function htmlToPlainText(html) {
    const container = document.createElement("div");
    container.innerHTML = sanitizeHtml(html);
    container.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    container.querySelectorAll("p,div,li,tr,h1,h2,h3,blockquote").forEach((element) => {
      element.insertAdjacentText("beforeend", "\n");
    });
    return (container.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function outlookDocument(bodyHtml) {

    return stripEmailBackgroundCss(outlookDocumentBase(bodyHtml));

  }


  function outlookDocumentBase(bodyHtml) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="x-apple-disable-message-reformatting"><title>Shift Transition</title></head><body style="margin:0;padding:20px;background:#ffffff;">${sanitizeHtml(bodyHtml)}</body></html>`;
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
    if (document.getElementById("transitionEditorStyles")) document.getElementById("transitionEditorStyles").remove();
    const style = document.createElement("style");
    style.id = "transitionEditorStyles";
    style.textContent = `
      .transition-editor-grid{display:grid;grid-template-columns:minmax(340px,.78fr) minmax(480px,1.22fr);gap:18px;align-items:start}.transition-template-panel,.transition-preview-panel{min-width:0}.transition-heading{align-items:center}.transition-summary{display:flex;align-items:baseline;gap:8px;padding:10px 14px;border:1px solid rgba(74,222,128,.35);background:rgba(34,197,94,.08);border-radius:12px}.transition-summary strong{font-size:22px;color:#86efac}.transition-summary span{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8}.transition-nav-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(168,85,247,.22);color:#d8b4fe;font-size:10px;text-align:center}
      .transition-address-panel{margin-bottom:18px;padding:16px}.transition-address-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.transition-subject-field{grid-column:1/-1}.transition-address-grid label,.transition-field{display:grid;gap:7px;margin:0}.transition-address-grid span,.transition-field>span,.transition-placeholder-wrap>span{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}.transition-editor-view input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(5,12,18,.78);color:#e5edf4;padding:11px 12px;font:inherit;outline:none}.transition-editor-view input:focus{border-color:rgba(168,85,247,.75);box-shadow:0 0 0 3px rgba(168,85,247,.12)}
      .transition-panel-help{margin:-3px 0 12px;color:#94a3b8;font-size:12px}.transition-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid rgba(148,163,184,.25);border-bottom:0;border-radius:10px 10px 0 0;background:rgba(15,23,42,.92)}.transition-toolbar>button,.transition-emoji-menu summary{min-width:34px;height:31px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(148,163,184,.25);border-radius:7px;background:rgba(30,41,59,.9);color:#e2e8f0;padding:0 9px;font-size:12px;cursor:pointer;list-style:none}.transition-toolbar>button:hover,.transition-emoji-menu summary:hover{border-color:rgba(168,85,247,.65);background:rgba(88,28,135,.3)}.transition-toolbar-divider{width:1px;height:22px;background:rgba(148,163,184,.25);margin:0 2px}.transition-emoji-menu{position:relative}.transition-emoji-menu summary::-webkit-details-marker{display:none}.transition-emoji-palette{position:absolute;z-index:20;top:37px;right:0;width:232px;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:9px;border:1px solid rgba(148,163,184,.35);border-radius:10px;background:#101923;box-shadow:0 14px 30px rgba(0,0,0,.35)}.transition-emoji-palette button{border:0;border-radius:6px;background:transparent;font-size:19px;line-height:1;padding:5px;cursor:pointer}.transition-emoji-palette button:hover{background:rgba(168,85,247,.2)}
      .transition-rich-editor{box-sizing:border-box;width:100%;overflow:auto;outline:none}.transition-template-editor{min-height:410px;max-height:620px;padding:18px;border:1px solid rgba(148,163,184,.28);border-radius:0 0 10px 10px;background:#ffffff;color:#172033;font:14px/1.45 Arial,Helvetica,sans-serif}.transition-email-sheet{min-height:570px;max-height:780px;padding:24px;border:1px solid rgba(148,163,184,.28);border-radius:0 0 10px 10px;background:#ffffff;color:#172033;font:14px/1.45 Arial,Helvetica,sans-serif;box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)}.transition-rich-editor:focus{border-color:rgba(168,85,247,.75);box-shadow:0 0 0 3px rgba(168,85,247,.12)}
      .transition-placeholder-wrap{display:grid;gap:8px;margin:12px 0 14px}.transition-placeholder-buttons{display:flex;gap:7px;flex-wrap:wrap}.transition-placeholder-buttons button{border:1px solid rgba(168,85,247,.35);border-radius:999px;background:rgba(168,85,247,.1);color:#d8b4fe;padding:5px 8px;font-size:10px;cursor:pointer}.transition-placeholder-buttons button:hover{background:rgba(168,85,247,.2)}.transition-button-row{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.transition-output-buttons{margin-top:14px}.transition-preview-meta{margin:-2px 0 12px;padding:9px 11px;border-left:3px solid #39ff63;background:rgba(57,255,99,.06);color:#a9b3bc;font-size:11px}.transition-status{min-height:20px;margin-top:12px;color:#86efac;font-size:11px}.transition-status.error{color:#fda4af}
      @media(max-width:1180px){.transition-editor-grid{grid-template-columns:1fr}}@media(max-width:680px){.transition-address-grid{grid-template-columns:1fr}.transition-subject-field{grid-column:auto}.transition-button-row>*{width:100%;justify-content:center}.transition-email-sheet,.transition-template-editor{padding:14px}.transition-emoji-palette{left:0;right:auto}}
    `;
    document.head.append(style);
  }

  function setStatus(message, error = false) {
    const status = byId("transitionEditorStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function insertHtmlAtCursor(editor, value) {
    if (!editor) return;
    restoreEditorRange(editor);
    editor.focus();
    document.execCommand("insertHTML", false, value);
    saveEditorRange(editor);
  }

  function copyRichFallback(html) {
    const container = document.createElement("div");
    container.contentEditable = "true";
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.innerHTML = sanitizeHtml(html);
    document.body.appendChild(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
    container.remove();
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

  function editorHtml(id) {
    return byId(id)?.innerHTML ?? "";
  }

  function setEditorHtml(id, value) {
    const element = byId(id);
    if (element) element.innerHTML = sanitizeHtml(value ?? "");
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
