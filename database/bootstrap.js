(() => {
  "use strict";

  const OPTIONAL_MODULES = [
    "core/resource_coordinator.js",
    "core/read_once_mode.js",
    "smart_data_loader.js",
    "auxiliary_mode.js",
    "database/exclusion-manager.js",
    "database/trip-planning-notes.js",
    "database/trip-planning-table.js",
    "database/idle-history-ui.js",
    "database/hero-chart-layout.js",
    "database/overview-layout-fix.js",
    "missing_bol.js",
    "missing_bol_driver_only.js",
    "special_notes.js",
    "worked_workflow.js",
    "core/required_dom_guard.js",
    "note_transition_toggle.js",
    "database/transition-grouping.js",
    "transition_export_v2.js",
  ];

  const domReady = document.readyState === "loading"
    ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  Promise.all([domReady, window.FuelDashboardDb?.ready || Promise.resolve()])
    .then(async () => {
      performance.mark("vixen-bootstrap-start");
      for (const src of OPTIONAL_MODULES) {
        await loadOptionalScript(src);
        if (src === "transition_export_v2.js" && window.VixenRichTransitionReady) {
          await window.VixenRichTransitionReady;
        }
      }
      window.VixenRequiredDomGuard?.ensure?.();
      await loadScript("app.js");
      await loadScript("database/pta-history-ui.js");
      await loadScript("database/worked-navigation-fix.js");
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
      installPtaShortcutBridge();
      performance.mark("vixen-bootstrap-end");
      performance.measure("vixen-bootstrap", "vixen-bootstrap-start", "vixen-bootstrap-end");
      document.dispatchEvent(new CustomEvent("vixen:bootstrap-complete"));
    })
    .catch((error) => {
      console.error("Fuel dashboard bootstrap failed", error);
      const message = document.getElementById("connectError");
      if (message) message.textContent = `The dashboard could not start: ${error.message || error}`;
    });

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

  async function loadOptionalScript(src) {
    try {
      await loadScript(src);
    } catch (error) {
      console.warn(`Optional dashboard module was unavailable: ${src}`, error);
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-vixen-src="${CSS.escape(src)}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.vixenSrc = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }
})();
