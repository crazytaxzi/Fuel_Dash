(() => {
  "use strict";

  const domReady = document.readyState === "loading"
    ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  Promise.all([domReady, window.FuelDashboardDb?.ready || Promise.resolve()])
    .then(async () => {
      await loadScript("app.js");
      await loadScript("database/pta-history-ui.js");
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
    })
    .catch((error) => {
      console.error("Fuel dashboard bootstrap failed", error);
      const message = document.getElementById("connectError");
      if (message) message.textContent = `The dashboard could not start: ${error.message || error}`;
    });

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
