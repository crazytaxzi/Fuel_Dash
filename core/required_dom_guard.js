(() => {
  "use strict";

  if (window.VixenRequiredDomGuard?.installed) return;

  const FALLBACKS = Object.freeze([
    ["kpiModeledSavings", "strong"],
    ["kpiModeledSavingsNote", "small"],
    ["kpiModeledSavingsBar", "i"],
    ["kpiAnnualExposure", "strong"],
    ["kpiAnnualNote", "small"],
    ["kpiAnnualBar", "i"],
  ]);
  let observer = null;

  const api = {
    installed: true,
    ensure,
    disconnect,
  };
  window.VixenRequiredDomGuard = api;

  ensure();
  observeUntilBootstrapCompletes();
  document.addEventListener("vixen:bootstrap-complete", disconnect, { once: true });

  function ensure() {
    const missing = FALLBACKS.filter(([id]) => !document.getElementById(id));
    if (!missing.length || !document.body) return 0;

    let container = document.getElementById("vixenRequiredDomFallbacks");
    if (!container) {
      container = document.createElement("div");
      container.id = "vixenRequiredDomFallbacks";
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      document.body.append(container);
    }

    for (const [id, tagName] of missing) {
      const element = document.createElement(tagName);
      element.id = id;
      container.append(element);
    }
    return missing.length;
  }

  function observeUntilBootstrapCompletes() {
    if (!("MutationObserver" in window) || !document.body) return;
    observer = new MutationObserver(() => ensure());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function disconnect() {
    observer?.disconnect();
    observer = null;
  }
})();
