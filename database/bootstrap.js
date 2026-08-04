(() => {
  "use strict";

  const BUILD_VERSION = "3.22.0";
  const domReady = document.readyState === "loading"
    ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  Promise.all([domReady, window.FuelDashboardDb?.ready || Promise.resolve()])
    .then(start)
    .catch(fail);

  async function start() {
    performance.mark("vixen-bootstrap-start");

    await Promise.all([
      loadOptionalScript("core/resource_coordinator.js"),
      loadOptionalScript("core/read_once_mode.js"),
    ]);

    await loadScript("smart_data_loader.js");

    await Promise.all([
      loadScript("core/driver_report_adapter.js"),
      loadScript("core/driver_assignments.js"),
      loadScript("core/driver_centric_parser.js"),
      loadOptionalScript("auxiliary_mode.js"),
      loadOptionalScript("database/exclusion-manager.js"),
    ]);

    await Promise.all([
      loadGroup(["database/idle-history-ui.js", "database/hero-chart-layout.js", "database/overview-layout-fix.js"]),
      loadGroup(["missing_bol.js", "special_notes.js"]),
      loadGroup(["worked_workflow.js", "core/required_dom_guard.js"]),
      loadGroup(["note_transition_toggle.js", "database/transition-grouping.js"]),
    ]);

    await loadOptionalScript("transition_export_v2.js");
    if (window.VixenRichTransitionReady) await window.VixenRichTransitionReady;

    window.VixenRequiredDomGuard?.ensure?.();
    await loadScript("app.js");
    await Promise.all([
      loadOptionalScript("database/pta-history-ui.js"),
      loadGroup(["database/driver-workbench-render.js", "database/driver-workbench.js"]),
    ]);

    document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
    installPtaShortcutBridge();
    performance.mark("vixen-bootstrap-end");
    performance.measure("vixen-bootstrap", "vixen-bootstrap-start", "vixen-bootstrap-end");
    document.dispatchEvent(new CustomEvent("vixen:bootstrap-complete", {
      detail: { version: BUILD_VERSION, reportContract: window.VixenReportContract || null },
    }));
  }

  async function loadGroup(sources) {
    for (const source of sources) await loadOptionalScript(source);
  }

  async function loadOptionalScript(source) {
    try {
      await loadScript(source);
    } catch (error) {
      console.warn(`Optional dashboard module was unavailable: ${source}`, error);
    }
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const selector = `script[data-vixen-src="${CSS.escape(source)}"]`;
      if (document.querySelector(selector)) return resolve();
      const script = document.createElement("script");
      script.src = `${source}?v=${BUILD_VERSION}`;
      script.async = false;
      script.dataset.vixenSrc = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}`));
      document.head.appendChild(script);
    });
  }

  function installPtaShortcutBridge() {
    const input = document.getElementById("ptaPasteInput");
    const saveButton = document.getElementById("applyPtaPasteBtn");
    if (!input || !saveButton || input.dataset.vixenShortcutInstalled === "1") return;
    input.dataset.vixenShortcutInstalled = "1";
    input.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      saveButton.click();
    }, { capture: true });
  }

  function fail(error) {
    console.error("Fuel dashboard bootstrap failed", error);
    const message = document.getElementById("connectError");
    if (message) message.textContent = `The dashboard could not start: ${error.message || error}`;
  }
})();
