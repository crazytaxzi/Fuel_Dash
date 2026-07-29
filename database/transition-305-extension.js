(() => {
  "use strict";

  const STORAGE_KEY = "vixenTripPlanningNotes305V1";
  const PLACEHOLDERS = Object.freeze([
    {
      name: "division_305_followups",
      title: "Insert compact open Division 305 lines: truck, next action, and latest note",
    },
    {
      name: "division_305_count",
      title: "Insert the count of open Division 305 trucks",
    },
    {
      name: "card_start",
      title: "Start a manual Outlook-ready card",
    },
    {
      name: "card_end",
      title: "End the current manual card",
    },
    {
      name: "sep_red",
      title: "Insert a red section separator",
    },
    {
      name: "sep_blue",
      title: "Insert a blue section separator",
    },
  ]);

  const CARD_START_HTML = [
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"',
    ' style="border-collapse:separate;border-spacing:0;margin:0 0 10px;',
    'border:1px solid #d8e0ea;border-radius:8px;background:#ffffff;">',
    '<tr><td style="padding:13px 15px;">',
  ].join("");
  const CARD_END_HTML = "</td></tr></table>";
  const SEP_RED_HTML = separatorHtml("#dc2626");
  const SEP_BLUE_HTML = separatorHtml("#2563eb");

  const original = window.VixenTransitionExport;
  if (!original) {
    console.warn("Division 305 transition extension could not find the transition exporter.");
    return;
  }

  let previewTimer = null;
  let directBindingsInstalled = false;

  const api = Object.freeze({
    ...original,
    buildContext: (...args) => augmentContext(original.buildContext(...args)),
    buildEmail: (...args) => augmentEmail(original.buildEmail(...args)),
    buildTransition: (...args) => replacePlainTokens(
      original.buildTransition(...args),
      division305Context(),
    ),
    renderTemplate: (template, context = {}) => replaceHtmlTokens(
      original.renderTemplate(template, context),
      augmentContext(context),
    ),
    refresh: () => refreshPreview(true),
  });

  window.VixenTransitionExport = api;
  window.VixenTransition305Ready = true;

  install();

  function install() {
    const start = () => {
      addPlaceholderButtons();
      bindUiHooks();
      bindDirectRefreshControls();
      schedulePreparedRefresh({ rebuildBase: false, delay: 0 });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    document.addEventListener("vixen:bootstrap-complete", start);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        schedulePreparedRefresh({ rebuildBase: true, delay: 0 });
      }
    });
  }

  function addPlaceholderButtons() {
    const container = document.getElementById("transitionPlaceholderButtons");
    if (!container) return;

    PLACEHOLDERS.forEach(({ name, title }) => {
      if (container.querySelector(`[data-transition-placeholder="${name}"]`)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.transitionPlaceholder = name;
      button.textContent = `{{${name}}}`;
      button.title = title;
      container.append(button);
    });
  }

  function bindUiHooks() {
    if (document.documentElement.dataset.vixenTransition305Bound === "1") return;
    document.documentElement.dataset.vixenTransition305Bound = "1";

    document.addEventListener("click", (event) => {
      const outputTarget = event.target?.closest?.(
        "#copyTransitionRichBtn,#downloadTransitionEmlBtn,#openTransitionOutlookBtn,#copyTransitionPlainBtn",
      );
      if (outputTarget) applyToPreparedBody();

      const placeholderTarget = event.target?.closest?.(
        "#transitionPlaceholderButtons [data-transition-placeholder]",
      );
      if (placeholderTarget) {
        schedulePreparedRefresh({ rebuildBase: true, delay: 0 });
      }

      const viewTarget = event.target?.closest?.('[data-view="transition"],#exportTransitionBtn');
      if (viewTarget) schedulePreparedRefresh({ rebuildBase: true, delay: 0 });
    }, true);

    document.addEventListener("change", (event) => {
      if (event.target?.matches?.("[data-transition-day-offset]")) {
        schedulePreparedRefresh({ rebuildBase: true, delay: 0 });
      }
    }, true);
  }

  function bindDirectRefreshControls() {
    if (directBindingsInstalled) return;
    const template = document.getElementById("transitionTemplateEditor");
    const subject = document.getElementById("transitionSubjectTemplate");
    const save = document.getElementById("saveTransitionTemplateBtn");
    const reset = document.getElementById("resetTransitionTemplateBtn");
    const refresh = document.getElementById("refreshTransitionEmailBtn");
    if (!template || !save) return;

    directBindingsInstalled = true;

    const livePreview = () => schedulePreparedRefresh({ rebuildBase: true, delay: 220 });
    template.addEventListener("input", livePreview);
    subject?.addEventListener("input", livePreview);

    [save, reset, refresh].filter(Boolean).forEach((button) => {
      button.addEventListener("click", () => {
        schedulePreparedRefresh({ rebuildBase: false, delay: 0 });
      });
    });
  }

  function schedulePreparedRefresh({ rebuildBase = false, delay = 0 } = {}) {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => refreshPreview(rebuildBase), delay);
  }

  function refreshPreview(rebuildBase = true) {
    if (rebuildBase) original.refresh?.();
    addPlaceholderButtons();
    bindDirectRefreshControls();
    applyToPreparedBody();
    return division305Context();
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
    if (!meta) return;

    const currentText = String(meta.textContent || "Prepared transition").trim();
    const priorDecorated = String(meta.dataset.vixenDecoratedText || "");
    const base = (currentText === priorDecorated
      ? String(meta.dataset.vixenBaseText || currentText)
      : currentText
    ).replace(/\s*·\s*\d+ open Division 305 trucks?\s*$/i, "").trim();
    const decorated = context.division_305_count === "0"
      ? base
      : `${base} · ${context.division_305_count} open Division 305 truck${context.division_305_count === "1" ? "" : "s"}`;
    meta.dataset.vixenBaseText = base;
    meta.dataset.vixenDecoratedText = decorated;
    meta.textContent = decorated;
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
      ? records.map(recordLineHtml).join("")
      : '<div style="font-size:13px;color:#667085;">No open Division 305 trip-planning records.</div>';
    const text = records.length
      ? records.map(recordLineText).join("\n")
      : "No open Division 305 trip-planning records.";

    return {
      // The old HTML token remains an alias so saved templates do not break.
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
        route: clean(record.nextAction) || "No next action entered",
        truckNotes: latestNote(record.notes)?.text || "No planning note saved",
        status: clean(record.status) || "Needs plan",
      }))
      .sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
        || a.truck.localeCompare(b.truck, undefined, { numeric: true }));
  }

  function recordLineHtml(record) {
    return [
      '<div style="font-size:14px;line-height:1.45;margin:0 0 6px;">',
      `<strong>${escapeHtml(record.truck)}</strong> - Next action=${escapeHtml(record.route)}`,
      ` &nbsp;·&nbsp; Notes: ${escapeHtml(record.truckNotes)}`,
      "</div>",
    ].join("");
  }

  function recordLineText(record) {
    return `${record.truck} - Next action=${record.route} | Notes: ${record.truckNotes}`;
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
    let output = normalizeStandaloneCardMarkers(String(value ?? ""));

    output = output.replace(
      /{{\s*card_start\s*}}([\s\S]*?){{\s*card_end\s*}}/gi,
      (_, contents) => htmlMode
        ? `${CARD_START_HTML}${contents}${CARD_END_HTML}`
        : `\n${contents}\n`,
    );

    const tokenPattern = /{{\s*(division_305_followups_html|division_305_followups|division_305_count|card_start|card_end|sep_red|sep_blue)\s*}}/gi;
    return output.replace(tokenPattern, (token, key) => {
      const normalized = key.toLowerCase();
      if (normalized === "division_305_followups_html") {
        return htmlMode ? context.division_305_followups_html : context.division_305_followups;
      }
      if (normalized === "division_305_followups") {
        return htmlMode ? context.division_305_followups_html : context.division_305_followups;
      }
      if (normalized === "division_305_count") return context.division_305_count;

      if (htmlMode) {
        // Unmatched card markers still render safely instead of leaking raw tokens.
        if (normalized === "card_start") return CARD_START_HTML;
        if (normalized === "card_end") return CARD_END_HTML;
        if (normalized === "sep_red") return SEP_RED_HTML;
        if (normalized === "sep_blue") return SEP_BLUE_HTML;
      } else {
        if (normalized === "card_start" || normalized === "card_end") return "\n";
        if (normalized === "sep_red" || normalized === "sep_blue") {
          return "\n----------------------------------------\n";
        }
      }

      return token;
    });
  }

  function normalizeStandaloneCardMarkers(value) {
    return value
      .replace(
        /<(div|p)(?:\s[^>]*)?>\s*{{\s*card_start\s*}}\s*(?:<br\s*\/?>)?\s*<\/\1>/gi,
        "{{card_start}}",
      )
      .replace(
        /<(div|p)(?:\s[^>]*)?>\s*{{\s*card_end\s*}}\s*(?:<br\s*\/?>)?\s*<\/\1>/gi,
        "{{card_end}}",
      );
  }

  function separatorHtml(color) {
    return [
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"',
      ' style="border-collapse:collapse;margin:12px 0;">',
      `<tr><td style="border-top:3px solid ${color};font-size:1px;line-height:1px;">&nbsp;</td></tr>`,
      "</table>",
    ].join("");
  }

  function validTime(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
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
