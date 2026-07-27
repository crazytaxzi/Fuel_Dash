(() => {
  "use strict";

  const INSTALL_FLAG = "workedOpenQueueInstalled";
  let observer = null;
  let refreshing = false;

  window.VixenWorkedOpenQueue = {
    refresh: pruneCompletedCards,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  function install() {
    const root = document.documentElement;
    if (!root || root.dataset[INSTALL_FLAG] === "true") return;

    const list = document.getElementById("workedList");
    if (!list) return;

    root.dataset[INSTALL_FLAG] = "true";
    observer = new MutationObserver(pruneCompletedCards);
    observer.observe(list, { childList: true });
    pruneCompletedCards();
  }

  function pruneCompletedCards() {
    const list = document.getElementById("workedList");
    if (!list || refreshing) return;

    refreshing = true;
    observer?.disconnect();
    try {
      list.querySelectorAll(".worked-card-done").forEach((card) => card.remove());

      const openCount = list.querySelectorAll(".worked-card").length;
      const empty = document.getElementById("workedEmptyState");
      if (empty) {
        empty.textContent = "No open PTA or driver follow-ups.";
        empty.classList.toggle("hidden", openCount > 0);
      }

      const badge = document.querySelector('[data-view="worked"] .worked-nav-count');
      if (badge) badge.textContent = String(openCount);

      document.querySelector("#workedView .worked-legend-done")?.remove();
      const explainer = document.querySelector("#workedView .table-explainer");
      if (explainer) {
        explainer.innerHTML = "<strong>At a glance:</strong> only open follow-ups appear here. Completed notes leave the queue until another note is marked open.";
      }
    } finally {
      if (observer && list.isConnected) observer.observe(list, { childList: true });
      refreshing = false;
    }
  }
})();
