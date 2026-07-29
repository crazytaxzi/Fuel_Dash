(() => {
  "use strict";

  const STORAGE_KEY = "vixenTripPlanningNotes305V1";
  const PLACEHOLDERS = Object.freeze([
    "division_305_followups_html",
    "division_305_followups",
    "division_305_count",
  ]);
  const original = window.VixenTransitionExport;
  if (!original) {
    console.warn("Division 305 transition extension could not find the transition exporter.");
    return;
  }

  const api = Object.freeze({
    ...original,
    buildContext: (...args) => augmentContext(original.buildContext(...args)),
    buildEmail: (...args) => augmentEmail(original.buildEmail(...args)),
    buildTransition: (...args) => replacePlainTokens(original.buildTransition(...args), division305Context()),
    renderTemplate: (template, context = {}) => original.renderTemplate(template, augmentContext(context)),
  });
  window.VixenTransitionExport = api;
  window.VixenTransition305Ready = true;

  install();

  function install() {
    const start = () => {
      addPlaceholderButtons();
      bindUiHooks();
      schedulePreparedRefresh();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    document.addEventListener("vixen:bootstrap-complete", start);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) schedulePreparedRefresh();
    });
  }

  function addPlaceholderButtons() {
    const container = document.getElementById("transitionPlaceholderButtons");
    if (!container) return;
    PLACEHOLDERS.forEach((name) => {
      if (container.querySelector(`[data-transition-placeholder="${name}"]`)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.transitionPlaceholder = name;
      button.textContent = `{{${name}}}`;
      button.title = name === "division_305_followups_html"
        ? "Insert all open Division 305 trip-planning records as formatted cards"
        : name === "division_305_followups"
          ? "Insert all open Division 305 trip-planning records as plain text"
          : "Insert the count of open Division 305 trip-planning records";
      container.append(button);
    });
  }

  function bindUiHooks() {
    if (document.documentElement.dataset.vixenTransition305Bound === "1") return;
    document.documentElement.dataset.vixenTransition305Bound = "1";

    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.(
        "#copyTransitionRichBtn,#downloadTransitionEmlBtn,#openTransitionOutlookBtn,#copyTransitionPlainBtn"
      );
      if (target) applyToPreparedBody();

      const refreshTarget = event.target?.closest?.(
        "#exportTransitionBtn,#refreshTransitionEmailBtn,#saveTransitionTemplateBtn,#resetTransitionTemplateBtn,[data-view=\"transition\"]"
      );
      if (refreshTarget) schedulePreparedRefresh();
    }, true);

    document.addEventListener("change", (event) => {
      if (event.target?.matches?.("[data-transition-day-offset]")) schedulePreparedRefresh();
    }, true);
  }

  function schedulePreparedRefresh() {
    window.setTimeout(() => {
      addPlaceholderButtons();
      applyToPreparedBody();
    }, 0);
  }

  function applyToPreparedBody() {
    const body = document.getElementById("transitionPreparedBody");
    if (!body) return;
    const context = division305Context();
    const current = body.innerHTML;
    const next = replaceHtmlTokens(current, context);
    if (next !== current) {
      body.innerHTML = next;
      body.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const meta = document.getElementById("transitionPreviewMeta");
    if (meta && context.division_305_count !== "0" && !/Division 305/i.test(meta.textContent || "")) {
      meta.textContent = `${meta.textContent || "Prepared transition"} · ${context.division_305_count} open Division 305 truck${context.division_305_count === "1" ? "" : "s"}`;
    }
  }

  function augmentEmail(email) {
    const context = augmentContext(email?.context || {});
    return {
      ...email,
      subject: replacePlainTokens(email?.subject || "", context),
      html: replaceHtmlTokens(email?.html || "", context),
      text: replacePlainTokens(email?.text || "", context),
      context,
    };
  }

  function augmentContext(base = {}) {
    return { ...base, ...division305Context() };
  }

  function division305Context() {
    const records = readOpenRecords();
    const html = records.length
      ? records.map(recordHtml).join("")
      : emptyStateHtml("No open Division 305 trip-planning records.");
    const text = records.length
      ? records.map(recordText).join("\n\n")
      : "No open Division 305 trip-planning records.";
    return {
      division_305_followups_html: html,
      division_305_followups: text,
      division_305_count: String(records.length),
      division305: records,
    };
  }

  function readOpenRecords() {
    let parsed;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (_) {
      parsed = [];
    }
    if (!Array.isArray(parsed)) return [];
    const statusRank = { "Needs plan": 0, Waiting: 1, Hold: 2, Planned: 3 };
    return parsed
      .filter((record) => record && clean(record.truck) && !/^complete$/i.test(clean(record.status)))
      .map((record) => ({
        truck: clean(record.truck),
        driver: clean(record.driver),
        load: clean(record.load),
        destination: clean(record.destination),
        pta: clean(record.pta),
        status: clean(record.status) || "Needs plan",
        nextAction: clean(record.nextAction),
        latestNote: latestNote(record.notes),
        updatedAt: validTime(record.updatedAt),
      }))
      .sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
        || a.truck.localeCompare(b.truck, undefined, { numeric: true }));
  }

  function recordHtml(record) {
    const facts = [
      ["Driver", record.driver],
      ["Load / order", record.load],
      ["Destination", record.destination],
      ["PTA / ready", record.pta],
      ["Status", record.status],
    ].filter((item) => item[1]);
    const factsHtml = facts
      .map(([label, value]) => `<span style="display:inline-block;margin:2px 12px 2px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`)
      .join("");
    const note = record.latestNote?.text || "No planning note saved.";
    const noteTime = record.latestNote?.savedAt ? ` · ${formatDateTime(record.latestNote.savedAt)}` : "";
    const updated = record.updatedAt ? formatDateTime(record.updatedAt) : "Update time unavailable";
    return [
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:0 0 10px;border:1px solid #d8e0ea;border-left:5px solid #0ea5e9;border-radius:8px;">',
      '<tr><td style="padding:13px 15px;">',
      `<div style="font-size:15px;font-weight:700;">🚚 Division 305 · Truck ${escapeHtml(record.truck)}</div>`,
      `<div style="font-size:12px;margin-top:4px;line-height:1.55;">${factsHtml}</div>`,
      `<div style="font-size:14px;margin-top:9px;"><strong>Next action:</strong> ${escapeHtml(record.nextAction || "No next action entered.")}</div>`,
      `<div style="font-size:14px;margin-top:7px;"><strong>Latest note${escapeHtml(noteTime)}:</strong><br>${escapeHtml(note).replace(/\n/g, "<br>")}</div>`,
      `<div style="font-size:11px;color:#667085;margin-top:8px;">Last updated ${escapeHtml(updated)}</div>`,
      "</td></tr></table>",
    ].join("");
  }

  function recordText(record) {
    return [
      `Division 305 · Truck ${record.truck}`,
      record.driver ? `Driver: ${record.driver}` : "",
      record.load ? `Load / order: ${record.load}` : "",
      record.destination ? `Destination: ${record.destination}` : "",
      record.pta ? `PTA / ready: ${record.pta}` : "",
      `Status: ${record.status}`,
      `Next action: ${record.nextAction || "No next action entered."}`,
      `Latest note: ${record.latestNote?.text || "No planning note saved."}`,
      record.updatedAt ? `Last updated: ${formatDateTime(record.updatedAt)}` : "",
    ].filter(Boolean).join("\n");
  }

  function latestNote(notes) {
    if (!Array.isArray(notes)) return null;
    return notes
      .map((note) => ({ text: clean(note?.text), savedAt: validTime(note?.savedAt) }))
      .filter((note) => note.text)
      .sort((a, b) => b.savedAt - a.savedAt)[0] || null;
  }

  function replaceHtmlTokens(value, context) {
    return replaceTokens(value, context, true);
  }

  function replacePlainTokens(value, context) {
    return replaceTokens(value, context, false);
  }

  function replaceTokens(value, context, htmlMode) {
    return String(value ?? "").replace(/{{\s*(division_305_followups_html|division_305_followups|division_305_count)\s*}}/gi, (token, key) => {
      const normalized = key.toLowerCase();
      if (normalized === "division_305_followups_html" && !htmlMode) return context.division_305_followups;
      if (normalized === "division_305_followups" && htmlMode) return escapeHtml(context.division_305_followups).replace(/\n/g, "<br>");
      return String(context[normalized] ?? token);
    });
  }

  function emptyStateHtml(message) {
    return `<div style="border:1px dashed #c6cfda;border-radius:8px;background:#f8fafc;color:#667085;padding:14px 16px;font-size:13px;">${escapeHtml(message)}</div>`;
  }

  function validTime(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function formatDateTime(value) {
    const date = new Date(Number(value) || value);
    return Number.isNaN(date.getTime())
      ? clean(value)
      : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }
})();
