(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    void initializePtaDatabaseUi();
  }, { once: true });

  async function initializePtaDatabaseUi() {
    const db = window.FuelDashboardDb;
    if (!db) return;
    const databaseStatus = await db.ready;
    if (databaseStatus?.mode !== "indexeddb") return;
    injectStyles();

    const panel = document.getElementById("ptaPastePanel");
    const pasteContent = panel?.querySelector(".pta-paste-content");
    const status = document.getElementById("ptaPasteStatus");
    const applyButton = document.getElementById("applyPtaPasteBtn");
    const clearButton = document.getElementById("clearPtaPasteBtn");
    const pasteInput = document.getElementById("ptaPasteInput");
    if (!panel || !pasteContent || !status || !applyButton || !pasteInput) return;

    const dialogs = buildDialogs(pasteContent);
    panel.replaceWith(buildToolbar(status, dialogs));
    document.body.append(dialogs.pasteDialog, dialogs.historyDialog);

    applyButton.addEventListener("click", async () => {
      try {
        const result = await db.savePtaSnapshot(pasteInput.value);
        if (!result.duplicate) showDatabaseToast(`PTA snapshot saved. ${result.changes.length} change alert${result.changes.length === 1 ? "" : "s"} found.`);
        else showDatabaseToast("That PTA paste already matches the latest saved snapshot.");
        updateDatabaseStatusCopy();
        dialogs.pasteDialog.close();
        await refreshBadge();
      } catch (error) {
        showDatabaseToast(error.message || "The PTA snapshot could not be saved.", true);
      }
    });

    clearButton?.addEventListener("click", () => {
      window.setTimeout(updateDatabaseStatusCopy, 0);
    });

    dialogs.openPaste.addEventListener("click", () => dialogs.pasteDialog.showModal());
    dialogs.closePaste.addEventListener("click", () => dialogs.pasteDialog.close());
    dialogs.openHistory.addEventListener("click", async () => {
      dialogs.historyDialog.showModal();
      await renderHistory(dialogs);
    });
    dialogs.closeHistory.addEventListener("click", () => dialogs.historyDialog.close());
    dialogs.searchInput.addEventListener("input", debounce(() => renderHistory(dialogs), 180));
    dialogs.unreviewedOnly.addEventListener("change", () => renderHistory(dialogs));
    dialogs.markAllReviewed.addEventListener("click", async () => {
      const count = await db.markAllPtaChangesReviewed();
      showDatabaseToast(`${count} change alert${count === 1 ? "" : "s"} marked reviewed.`);
      await renderHistory(dialogs);
      await refreshBadge();
    });
    dialogs.historyResults.addEventListener("click", async (event) => {
      const review = event.target.closest("[data-change-review]");
      if (review) {
        await db.markPtaChangeReviewed(review.dataset.changeReview, review.dataset.reviewed !== "true");
        await renderHistory(dialogs);
        await refreshBadge();
        return;
      }
      const restore = event.target.closest("[data-snapshot-restore]");
      if (restore) {
        const snapshots = await db.listPtaSnapshots({ limit: 500 });
        const snapshot = snapshots.find((item) => item.id === restore.dataset.snapshotRestore);
        if (!snapshot) return;
        pasteInput.value = snapshot.rawText;
        dialogs.historyDialog.close();
        dialogs.pasteDialog.showModal();
        pasteInput.focus();
        showDatabaseToast("Snapshot loaded into the PTA paste dialog. Review it, then save to make it current.");
        return;
      }
      const remove = event.target.closest("[data-snapshot-delete]");
      if (remove) {
        await db.deletePtaSnapshot(remove.dataset.snapshotDelete);
        await renderHistory(dialogs);
        await refreshBadge();
      }
    });

    window.addEventListener("fuel-dashboard-database-change", (event) => {
      if (String(event.detail?.action || "").startsWith("pta-")) void refreshBadge();
    });

    installStatusCopyObserver();
    updateDatabaseStatusCopy();
    await refreshBadge();

    async function refreshBadge() {
      const count = await db.getUnreviewedPtaChangeCount();
      dialogs.alertBadge.textContent = String(count);
      dialogs.alertBadge.classList.toggle("hidden", count === 0);
      dialogs.openHistory.classList.toggle("has-alerts", count > 0);
    }
  }

  function buildToolbar(status, dialogs) {
    const toolbar = document.createElement("section");
    toolbar.className = "pta-db-toolbar";
    toolbar.innerHTML = `
      <div class="pta-db-toolbar-copy">
        <span class="eyebrow">PTA DATABASE</span>
        <strong>Saved snapshots, notes, and change history</strong>
        <small>Data is stored in this browser's IndexedDB database, not localStorage.</small>
      </div>
      <div class="pta-db-toolbar-actions"></div>`;
    toolbar.querySelector(".pta-db-toolbar-copy").append(status);
    const actions = toolbar.querySelector(".pta-db-toolbar-actions");
    actions.append(dialogs.openPaste, dialogs.openHistory);
    dialogs.openHistory.append(dialogs.alertBadge);
    return toolbar;
  }

  function buildDialogs(pasteContent) {
    const openPaste = button("Update PTA snapshot", "button button-primary");
    const openHistory = button("Search PTA history", "button button-secondary pta-history-open");
    const alertBadge = document.createElement("span");
    alertBadge.className = "pta-db-alert-badge hidden";
    alertBadge.setAttribute("aria-label", "Unreviewed PTA change alerts");

    const pasteDialog = document.createElement("dialog");
    pasteDialog.id = "ptaDatabasePasteDialog";
    pasteDialog.className = "driver-modal pta-db-dialog";
    pasteDialog.innerHTML = `<div class="modal-shell pta-db-modal-shell"><button class="modal-close" type="button" aria-label="Close PTA paste dialog">×</button><div class="modal-kicker">PTA DATABASE UPDATE</div><div class="modal-heading"><div><h2>Paste the latest PTA report</h2><p>The paste is saved as a dated snapshot and compared with the previous one.</p></div></div><div class="pta-db-paste-slot"></div></div>`;
    pasteDialog.querySelector(".pta-db-paste-slot").append(pasteContent);
    const closePaste = pasteDialog.querySelector(".modal-close");

    const historyDialog = document.createElement("dialog");
    historyDialog.id = "ptaDatabaseHistoryDialog";
    historyDialog.className = "driver-modal pta-db-dialog pta-history-dialog";
    historyDialog.innerHTML = `
      <div class="modal-shell pta-db-modal-shell">
        <button class="modal-close" type="button" aria-label="Close PTA history">×</button>
        <div class="modal-kicker">PTA DATABASE</div>
        <div class="modal-heading"><div><h2>Search history and change alerts</h2><p>Search truck, driver, destination, status, plan, or PTA.</p></div></div>
        <div class="pta-db-search-row">
          <input class="pta-db-search" type="search" placeholder="Search truck, driver, status, destination..." />
          <label><input class="pta-db-unreviewed" type="checkbox" /> Unreviewed alerts only</label>
          <button class="button button-secondary pta-db-review-all" type="button">Mark alerts reviewed</button>
        </div>
        <div class="pta-db-history-results"></div>
      </div>`;

    return {
      openPaste,
      openHistory,
      alertBadge,
      pasteDialog,
      historyDialog,
      closePaste,
      closeHistory: historyDialog.querySelector(".modal-close"),
      searchInput: historyDialog.querySelector(".pta-db-search"),
      unreviewedOnly: historyDialog.querySelector(".pta-db-unreviewed"),
      markAllReviewed: historyDialog.querySelector(".pta-db-review-all"),
      historyResults: historyDialog.querySelector(".pta-db-history-results"),
    };
  }

  async function renderHistory(dialogs) {
    const db = window.FuelDashboardDb;
    const query = dialogs.searchInput.value.trim();
    const [changes, snapshots, matches, notes] = await Promise.all([
      db.listPtaChanges({ query, unreviewedOnly: dialogs.unreviewedOnly.checked, limit: 150 }),
      db.listPtaSnapshots({ limit: 50 }),
      db.searchPtaHistory(query, { limit: 150 }),
      db.searchPtaNotes(query, { limit: 150 }),
    ]);
    const filteredSnapshots = query
      ? snapshots.filter((snapshot) => normalize([snapshot.label, snapshot.savedAt, snapshot.rowCount].join(" ")).includes(normalize(query)))
      : snapshots;

    dialogs.historyResults.innerHTML = `
      <section class="pta-db-section">
        <div class="pta-db-section-heading"><h3>Change alerts</h3><span>${changes.length}</span></div>
        <div class="pta-db-change-list">${changes.length ? changes.map(renderChange).join("") : empty("No matching change alerts.")}</div>
      </section>
      <section class="pta-db-section">
        <div class="pta-db-section-heading"><h3>Matching PTA rows</h3><span>${matches.length}</span></div>
        <div class="pta-db-record-list">${matches.length ? matches.map(renderMatch).join("") : empty("No PTA history rows match that search.")}</div>
      </section>
      <section class="pta-db-section">
        <div class="pta-db-section-heading"><h3>Saved action notes</h3><span>${notes.length}</span></div>
        <div class="pta-db-note-list">${notes.length ? notes.map(renderNote).join("") : empty("No saved PTA action notes match that search.")}</div>
      </section>
      <section class="pta-db-section">
        <div class="pta-db-section-heading"><h3>Saved snapshots</h3><span>${filteredSnapshots.length}</span></div>
        <div class="pta-db-snapshot-list">${filteredSnapshots.length ? filteredSnapshots.map(renderSnapshot).join("") : empty("No PTA snapshots have been saved yet.")}</div>
      </section>`;
  }

  function renderChange(change) {
    const reviewed = Boolean(change.reviewedAt);
    return `<article class="pta-db-change ${escapeHtml(change.severity || "medium")} ${reviewed ? "reviewed" : ""}">
      <div class="pta-db-change-head"><span>${escapeHtml((change.severity || "medium").toUpperCase())}</span><strong>Truck ${escapeHtml(change.truck || "Unknown")}</strong><time>${escapeHtml(formatDate(change.detectedAt))}</time></div>
      <p>${escapeHtml(change.summary || "PTA change detected.")}</p>
      <small>${escapeHtml([change.driver ? `Driver: ${change.driver}` : "", change.previousValue ? `Before: ${change.previousValue}` : "", change.currentValue ? `Now: ${change.currentValue}` : ""].filter(Boolean).join(" · "))}</small>
      <button class="pta-db-text-button" type="button" data-change-review="${escapeHtml(change.id)}" data-reviewed="${reviewed}">${reviewed ? "Mark unreviewed" : "Mark reviewed"}</button>
    </article>`;
  }

  function renderMatch(match) {
    const record = match.record || {};
    return `<article class="pta-db-record"><strong>Truck ${escapeHtml(record.truck || "Unknown")}</strong><span>${escapeHtml(record.driver || "No driver")}</span><span>${escapeHtml(record.ptaDisplay || "No PTA")}</span><small>${escapeHtml([record.status, record.planStatus, record.destination].filter(Boolean).join(" · "))}</small><time>Snapshot ${escapeHtml(formatDate(match.savedAt))}</time></article>`;
  }

  function renderNote(note) {
    const pta = note.pta ? formatDate(note.pta) : "PTA not captured";
    return `<article class="pta-db-record pta-db-note"><strong>Truck ${escapeHtml(note.truck || "Unknown")}</strong><span>${escapeHtml(note.driver || "No driver")}</span><span>${escapeHtml(pta)}</span><small>${escapeHtml(note.text || "No note text")}</small><time>${escapeHtml(formatDate(note.savedAt))}</time></article>`;
  }

  function renderSnapshot(snapshot) {
    return `<article class="pta-db-snapshot"><div><strong>${escapeHtml(formatDate(snapshot.savedAt))}</strong><small>${snapshot.rowCount || 0} rows · ${snapshot.changeCount || 0} alerts${snapshot.highChangeCount ? ` · ${snapshot.highChangeCount} high` : ""}</small></div><div><button class="pta-db-text-button" type="button" data-snapshot-restore="${escapeHtml(snapshot.id)}">Load</button><button class="pta-db-text-button danger" type="button" data-snapshot-delete="${escapeHtml(snapshot.id)}">Delete</button></div></article>`;
  }

  function updateDatabaseStatusCopy() {
  const message = document.getElementById("ptaPasteMessage");
  const noteStatus = document.getElementById("ptaActionNoteStatus");
  const driverStatus = document.getElementById("driverActionNoteStatus");
  setTextIfChanged(message, "The current paste and every saved snapshot are stored in the dashboard database.");
  if (noteStatus) {
    setTextIfChanged(noteStatus, noteStatus.textContent.replace(/Saved only in this browser\.|Notes stay in this browser\./g, "Saved in the dashboard database."));
  }
  if (driverStatus) {
    setTextIfChanged(driverStatus, driverStatus.textContent.replace(/browser/gi, "dashboard database"));
  }
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function installStatusCopyObserver() {
    const targets = [
      document.getElementById("ptaPasteMessage"),
      document.getElementById("ptaActionNoteStatus"),
      document.getElementById("driverActionNoteStatus"),
    ].filter(Boolean);
    if (!targets.length) return;
    let applying = false;
    const observer = new MutationObserver(() => {
      if (applying) return;
      applying = true;
      try { updateDatabaseStatusCopy(); } finally { applying = false; }
    });
    targets.forEach((target) => observer.observe(target, { childList: true, characterData: true, subtree: true }));
  }

  function injectStyles() {
    if (document.getElementById("ptaDatabaseStyles")) return;
    const link = document.createElement("link");
    link.id = "ptaDatabaseStyles";
    link.rel = "stylesheet";
    link.href = "database/database-ui.css";
    document.head.append(link);
  }

  function button(label, className) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = label;
    return element;
  }

  function showDatabaseToast(message, error = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function normalize(value) {
    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  }

  function empty(message) {
    return `<div class="pta-db-empty">${escapeHtml(message)}</div>`;
  }
})();
