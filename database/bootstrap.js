(() => {
  "use strict";

  const OPTIONAL_MODULES = [
    "smart_data_loader.js",
    "auxiliary_mode.js",
    "database/exclusion-manager.js",
    "missing_bol.js",
    "missing_bol_driver_only.js",
    "worked_workflow.js",
    "note_transition_toggle.js",
    "transition_export_v2.js",
  ];

  const domReady = document.readyState === "loading"
    ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  Promise.all([domReady, window.FuelDashboardDb?.ready || Promise.resolve()])
    .then(async () => {
      for (const src of OPTIONAL_MODULES) await loadOptionalScript(src);
      await loadScript("app.js");
      await loadScript("database/pta-history-ui.js");
      await loadScript("database/worked-navigation-fix.js");
      await loadScript("database/worked-open-queue.js");
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
      installPtaShortcutBridge();
    })
    .catch((error) => {
      console.error("Fuel dashboard bootstrap failed", error);
      const message = document.getElementById("connectError");
      if (message) message.textContent = `The dashboard could not start: ${error.message || error}`;
    });

  function installPtaShortcutBridge() {
    const input = document.getElementById("ptaPasteInput");
    const saveButton = document.getElementById("applyPtaPasteBtn");
    if (!input || !saveButton) return;
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
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }
})();
