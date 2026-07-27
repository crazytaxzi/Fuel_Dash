(() => {
  "use strict";
  const PTA_NOTES_KEY = "vixenPtaActionNotesV1";
  const DRIVER_NOTES_KEY = "vixenDriverActionNotesV1";

  const api = { buildTransition, aggregateToday, sameLocalDay };
  window.VixenTransitionExport = api;
  window.addEventListener("click", intercept, true);

  function intercept(event) {
    const target = event.target?.closest?.("#exportTransitionBtn");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = new Date();
    const content = buildTransition(now);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Shift_Transition_${dateKey(now)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function buildTransition(now = new Date(), ptaNotes = readObject(PTA_NOTES_KEY), driverNotes = readObject(DRIVER_NOTES_KEY)) {
    const truckLines = aggregateToday(ptaNotes, now, (key) => key);
    const driverLines = aggregateToday(driverNotes, now, (key, notes) => notes[0]?.driverName || notes[0]?.driverCode || key);
    return [
      "SHIFT TRANSITION",
      `Prepared: ${now.toLocaleString()}`,
      "",
      "Truck follow-ups:",
      ...(truckLines.length ? truckLines : ["None"]),
      "",
      "High Idles contacted:",
      ...(driverLines.length ? driverLines : ["None"]),
      "",
    ].join("\r\n");
  }

  function aggregateToday(groups, now, labelFor) {
    return Object.entries(groups || {}).map(([key, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => sameLocalDay(note.savedAt, now))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      if (!notes.length) return null;
      const combined = notes.map((note) => cleanLine(note.text)).filter(Boolean).join(" | ");
      return `${labelFor(key, notes)} - ${combined || "Note saved without text"}`;
    }).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function sameLocalDay(value, reference) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === reference.getFullYear()
      && date.getMonth() === reference.getMonth()
      && date.getDate() === reference.getDate();
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function cleanLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function dateKey(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
})();
