(() => {
  "use strict";

  const STORAGE_KEY = "vixenRefreshSeconds";
  const MANUAL_VALUE = "-1";
  const mode = {
    enabled: true,
    refreshSeconds: -1,
    manifestSignature: "",
    lastChangeDetectedAt: null,
  };

  window.VixenReadOnceMode = mode;
  localStorage.setItem(STORAGE_KEY, MANUAL_VALUE);

  applyUi();
  document.addEventListener("vixen:bootstrap-complete", applyUi);
  document.addEventListener("vixen:manifest-changed", (event) => {
    const next = String(event.detail?.signature || "");
    if (mode.manifestSignature && next && next !== mode.manifestSignature) {
      mode.lastChangeDetectedAt = new Date().toISOString();
    }
    mode.manifestSignature = next;
  });

  function applyUi() {
    const select = document.getElementById("refreshIntervalSelect");
    if (!select) return;
    if (!select.querySelector(`option[value="${MANUAL_VALUE}"]`)) {
      const option = document.createElement("option");
      option.value = MANUAL_VALUE;
      option.textContent = "Manual only";
      select.prepend(option);
    }
    select.value = MANUAL_VALUE;
    select.title = "Reports are read once. Use Refresh after replacing a source file.";
  }
})();
