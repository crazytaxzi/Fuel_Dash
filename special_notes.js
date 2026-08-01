(() => {
  "use strict";

  const STORAGE_KEY = "vixenSpecialNotesV1";
  const NOTIFICATION_KEY = "vixenAttentionNotificationsV1";
  let notes = loadNotes();
  let editingId = "";
  let timer = null;

  const api = Object.freeze({ loadNotes, saveNote, completeNote, removeNote, dueState, notificationBody, render });
  window.VixenSpecialNotes = api;
  installUi();
  installStyles();
  bindEvents();
  render();

  function installUi() {
    const nav = document.querySelector(".nav-list");
    if (nav && !nav.querySelector('[data-view="specialNotes"]')) {
      const button = document.createElement("button");
      button.className = "nav-item";
      button.dataset.view = "specialNotes";
      button.innerHTML = '<span>✎</span><span>Special Notes</span><strong class="special-notes-count">0</strong>';
      nav.append(button);
    }
    if (document.getElementById("specialNotesView")) return;
    const section = document.createElement("section");
    section.id = "specialNotesView";
    section.className = "view table-view special-notes-view";
    section.innerHTML = `
      <div class="view-heading special-notes-heading"><div><span class="eyebrow">PERSONAL DESK NOTES</span><h2>Special Notes &amp; Reminders</h2></div><div class="special-notes-summary"><strong data-special-open-count>0</strong><span>open</span><strong data-special-due-count>0</strong><span>due</span></div></div>
      <div class="table-explainer"><strong>Local and private:</strong> keep one-off notes here and optionally attach a reminder. Browser alerts use the Today alert setting and fire once when a reminder becomes due or its due details change.</div>
      <form id="specialNoteForm" class="special-note-form panel">
        <label><span>Title</span><input id="specialNoteTitle" maxlength="140" required placeholder="What needs attention?" /></label>
        <label class="special-note-wide"><span>Note</span><textarea id="specialNoteBody" maxlength="4000" rows="4" placeholder="Details, names, confirmation numbers, or the next action"></textarea></label>
        <label><span>Reminder (optional)</span><input id="specialNoteDue" type="datetime-local" /></label>
        <div class="special-note-quick"><button type="button" data-special-delay="15">15 min</button><button type="button" data-special-delay="60">1 hour</button><button type="button" data-special-delay="1440">Tomorrow</button><button type="button" data-special-clear-due>Clear time</button></div>
        <div class="special-note-form-actions"><button id="specialNoteCancel" class="button button-secondary hidden" type="button">Cancel edit</button><button class="button button-primary" type="submit"><span id="specialNoteSubmitText">Save note</span></button></div>
      </form>
      <div class="special-note-toolbar"><button class="special-note-filter active" type="button" data-special-filter="open">Open</button><button class="special-note-filter" type="button" data-special-filter="all">Show all</button><input id="specialNoteSearch" type="search" placeholder="Search special notes" /></div>
      <div id="specialNoteList" class="special-note-list"></div><div id="specialNoteEmpty" class="worked-empty-state">No special notes yet.</div>`;
    document.querySelector(".main-panel")?.append(section);
  }

  function bindEvents() {
    document.getElementById("specialNoteForm")?.addEventListener("submit", submitNote);
    document.getElementById("specialNoteCancel")?.addEventListener("click", resetForm);
    document.getElementById("specialNoteSearch")?.addEventListener("input", render);
    document.addEventListener("click", (event) => {
      const delay = event.target.closest("[data-special-delay]");
      if (delay) return setValue("specialNoteDue", localDateTime(Date.now() + Number(delay.dataset.specialDelay) * 60000));
      if (event.target.closest("[data-special-clear-due]")) return setValue("specialNoteDue", "");
      const filter = event.target.closest("[data-special-filter]");
      if (filter) {
        document.querySelectorAll("[data-special-filter]").forEach((item) => item.classList.toggle("active", item === filter));
        render();
        return;
      }
      const action = event.target.closest("[data-special-action]");
      if (!action) return;
      const id = action.dataset.specialId;
      if (action.dataset.specialAction === "edit") editNote(id);
      if (action.dataset.specialAction === "complete") completeNote(id, true);
      if (action.dataset.specialAction === "reopen") completeNote(id, false);
      if (action.dataset.specialAction === "delete" && window.confirm("Delete this special note permanently?")) removeNote(id);
    });
    window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) { notes = loadNotes(); render(); } });
    document.addEventListener("vixen:notification-setting-change", render);
    document.addEventListener("visibilitychange", () => document.hidden ? clearTimer() : render());
  }

  function submitNote(event) {
    event.preventDefault();
    const title = value("specialNoteTitle").trim();
    if (!title) return;
    saveNote({ id: editingId, title, body: value("specialNoteBody").trim(), dueAt: parseDue(value("specialNoteDue")) });
    resetForm();
  }

  function saveNote(input, now = Date.now()) {
    const existing = notes.find((note) => note.id === input.id);
    const dueAt = Number(input.dueAt) || 0;
    const unchangedReminder = existing && existing.dueAt === dueAt && existing.title === input.title && existing.body === input.body;
    const next = cleanNote({ ...(existing || {}), id: existing?.id || `special-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title: input.title, body: input.body, dueAt, completedAt: existing?.completedAt || 0, notifiedAt: unchangedReminder ? existing.notifiedAt : 0, createdAt: existing?.createdAt || now, updatedAt: now });
    notes = existing ? notes.map((note) => note.id === existing.id ? next : note) : [next, ...notes];
    persist();
    render(now);
    return next;
  }

  function completeNote(id, completed, now = Date.now()) {
    notes = notes.map((note) => note.id === id ? { ...note, completedAt: completed ? now : 0, notifiedAt: completed ? note.notifiedAt : 0, updatedAt: now } : note);
    persist();
    render(now);
  }

  function removeNote(id) { notes = notes.filter((note) => note.id !== id); if (editingId === id) resetForm(); persist(); render(); }

  function editNote(id) {
    const note = notes.find((item) => item.id === id);
    if (!note) return;
    editingId = id;
    setValue("specialNoteTitle", note.title); setValue("specialNoteBody", note.body); setValue("specialNoteDue", note.dueAt ? localDateTime(note.dueAt) : "");
    document.getElementById("specialNoteCancel")?.classList.remove("hidden");
    const label = document.getElementById("specialNoteSubmitText"); if (label) label.textContent = "Update note";
    document.getElementById("specialNoteTitle")?.focus();
  }

  function resetForm() {
    editingId = ""; document.getElementById("specialNoteForm")?.reset(); document.getElementById("specialNoteCancel")?.classList.add("hidden");
    const label = document.getElementById("specialNoteSubmitText"); if (label) label.textContent = "Save note";
  }

  function render(now = Date.now()) {
    const list = document.getElementById("specialNoteList");
    if (!list) return;
    const open = notes.filter((note) => !note.completedAt);
    const due = open.filter((note) => dueState(note, now) === "due");
    const showAll = document.querySelector('[data-special-filter="all"]')?.classList.contains("active");
    const query = value("specialNoteSearch").trim().toLowerCase();
    const visible = notes.filter((note) => (showAll || !note.completedAt) && (!query || `${note.title} ${note.body}`.toLowerCase().includes(query))).sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || dueRank(a, now) - dueRank(b, now) || b.updatedAt - a.updatedAt);
    list.innerHTML = visible.map((note) => noteHtml(note, now)).join("");
    document.getElementById("specialNoteEmpty")?.classList.toggle("hidden", visible.length > 0);
    document.querySelectorAll("[data-special-open-count]").forEach((node) => { node.textContent = String(open.length); });
    document.querySelectorAll("[data-special-due-count]").forEach((node) => { node.textContent = String(due.length); });
    const badge = document.querySelector('[data-view="specialNotes"] .special-notes-count'); if (badge) badge.textContent = String(due.length || open.length);
    notifyNewlyDue(due, now); scheduleNext(now);
  }

  function noteHtml(note, now) {
    const state = dueState(note, now);
    const status = note.completedAt ? "Completed" : state === "due" ? `Due ${relativeTime(note.dueAt, now)}` : state === "scheduled" ? `Reminds ${formatDate(note.dueAt)}` : "No reminder";
    return `<article class="special-note-card ${state === "due" ? "is-due" : ""} ${note.completedAt ? "is-complete" : ""}"><div class="special-note-copy"><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(status)}</small><p>${escapeHtml(note.body || "No additional details.")}</p></div><div class="special-note-actions"><button type="button" data-special-action="edit" data-special-id="${escapeHtml(note.id)}">Edit</button>${note.completedAt ? `<button type="button" data-special-action="reopen" data-special-id="${escapeHtml(note.id)}">Reopen</button>` : `<button type="button" data-special-action="complete" data-special-id="${escapeHtml(note.id)}">Complete</button>`}<button class="danger" type="button" data-special-action="delete" data-special-id="${escapeHtml(note.id)}">Delete</button></div></article>`;
  }

  function notifyNewlyDue(due, now) {
    const fresh = due.filter((note) => !note.notifiedAt);
    if (!fresh.length || localStorage.getItem(NOTIFICATION_KEY) !== "true" || window.Notification?.permission !== "granted") return;
    fresh.forEach((note) => new Notification("Fuel Dash reminder", { body: notificationBody(note) }));
    const ids = new Set(fresh.map((note) => note.id));
    notes = notes.map((note) => ids.has(note.id) ? { ...note, notifiedAt: now } : note); persist();
  }

  function notificationBody(note) { const detail = clean(note.body).slice(0, 140); return detail ? `${note.title}: ${detail}` : note.title; }
  function scheduleNext(now = Date.now()) { clearTimer(); if (document.hidden) return; const future = notes.filter((note) => !note.completedAt && note.dueAt > now).map((note) => note.dueAt - now); timer = window.setTimeout(() => render(), Math.max(250, Math.min(future.length ? Math.min(...future) + 50 : 60000, 60000))); }
  function clearTimer() { window.clearTimeout(timer); timer = null; }
  function dueState(note, now = Date.now()) { return note.completedAt ? "complete" : note.dueAt && note.dueAt <= now ? "due" : note.dueAt ? "scheduled" : "open"; }
  function dueRank(note, now) { const state = dueState(note, now); return state === "due" ? 0 : state === "scheduled" ? 1 : 2; }
  function parseDue(input) { const time = new Date(input).getTime(); return Number.isFinite(time) ? time : 0; }
  function localDateTime(time) { const date = new Date(time - new Date(time).getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16); }
  function formatDate(time) { return new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function relativeTime(time, now) { const minutes = Math.max(0, Math.floor((now - time) / 60000)); return minutes < 1 ? "now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`; }
  function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function cleanNote(note) { return { id: clean(note.id), title: clean(note.title).slice(0, 140), body: String(note.body ?? "").trim().slice(0, 4000), dueAt: Number(note.dueAt) || 0, completedAt: Number(note.completedAt) || 0, notifiedAt: Number(note.notifiedAt) || 0, createdAt: Number(note.createdAt) || Date.now(), updatedAt: Number(note.updatedAt) || Date.now() }; }
  function loadNotes() { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(value) ? value.map(cleanNote).filter((note) => note.id && note.title) : []; } catch (_) { return []; } }
  function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); }
  function value(id) { return document.getElementById(id)?.value || ""; }
  function setValue(id, next) { const input = document.getElementById(id); if (input) input.value = next; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }

  function installStyles() {
    const style = document.createElement("style"); style.id = "specialNotesStyles";
    style.textContent = `.special-notes-heading{display:flex;justify-content:space-between;align-items:end;gap:20px}.special-notes-summary{display:grid;grid-template-columns:auto auto;gap:2px 8px;align-items:baseline;padding:10px 14px;border:1px solid rgba(168,85,247,.3);background:rgba(88,28,135,.1)}.special-notes-summary strong{font-size:20px;color:#d8b4fe}.special-notes-summary span{font-size:9px;color:#94a3b8;text-transform:uppercase}.special-note-form{display:grid;grid-template-columns:minmax(300px,1fr) minmax(280px,.7fr);gap:13px;margin:16px 0;padding:17px}.special-note-form label{display:grid;gap:7px}.special-note-form label>span{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#a9b3bc}.special-note-form input,.special-note-form textarea,.special-note-toolbar input{width:100%;padding:11px 12px;border:1px solid rgba(148,163,184,.25);background:rgba(5,12,18,.82);color:#f5f7fb;outline:0}.special-note-wide{grid-column:1/-1}.special-note-quick,.special-note-form-actions,.special-note-toolbar,.special-note-actions{display:flex;align-items:center;gap:8px}.special-note-quick button,.special-note-filter,.special-note-actions button{padding:8px 10px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);color:#cbd5e1;cursor:pointer}.special-note-form-actions{justify-content:flex-end;grid-column:1/-1}.special-note-toolbar{margin:12px 0}.special-note-toolbar input{margin-left:auto;max-width:360px}.special-note-filter.active{border-color:rgba(168,85,247,.65);color:#d8b4fe;background:rgba(88,28,135,.2)}.special-note-list{display:grid;gap:10px}.special-note-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:15px 17px;border:1px solid rgba(168,85,247,.35);background:rgba(7,14,20,.9)}.special-note-card.is-due{border-left:5px solid #f43f5e;background:linear-gradient(100deg,rgba(244,63,94,.12),rgba(7,14,20,.94))}.special-note-card.is-complete{opacity:.62}.special-note-copy strong,.special-note-copy small{display:block}.special-note-copy strong{font-size:15px}.special-note-copy small{margin-top:4px;color:#c4b5fd;font-size:10px}.special-note-copy p{margin:10px 0 0;color:#d8e0e6;font-size:13px;line-height:1.55;white-space:pre-wrap}.special-note-actions{align-self:center}.special-note-actions .danger{color:#fda4af}.special-notes-count{margin-left:auto;min-width:22px;padding:2px 6px;border-radius:999px;background:rgba(168,85,247,.2);color:#d8b4fe;font-size:9px;text-align:center}`;
    document.head.append(style);
  }
})();
