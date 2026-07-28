from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EDITOR = ROOT / "database" / "rich-transition-editor.js"
BOOTSTRAP = ROOT / "database" / "bootstrap.js"
MANIFEST = ROOT / "database" / "rich-transition-editor.manifest.json"
VERSION = ROOT / "VERSION"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


editor = EDITOR.read_text(encoding="utf-8")
editor = replace_once(
    editor,
    '    "truck_count", "driver_count", "followup_count",',
    '    "truck_count", "driver_count", "followup_count", "group_count",',
    "group count placeholder",
)
editor = replace_once(
    editor,
    '<div class="table-explainer"><strong>Built for Outlook:</strong> selected notes are arranged into readable sections. Format the prepared message with bold, italic, underline, and emoji controls.',
    '<div class="table-explainer"><strong>Built for Outlook:</strong> selected notes are arranged into readable sections. Notes sharing a driver code, driver name, or truck number are grouped into one chronological follow-up card. Format the prepared message with bold, italic, underline, and emoji controls.',
    "transition grouping explainer",
)

replacement = r'''  function buildContext(
    now = new Date(),
    ptaNotes = readObject(PTA_NOTES_KEY),
    driverNotes = readObject(DRIVER_NOTES_KEY),
    selections = readObject(NOTE_SELECTION_KEY),
    dayOffsets = selectedDayOffsets,
  ) {
    const scope = resolveDateScope(now, dayOffsets);
    const truckNotes = collectTruckFollowups(ptaNotes, scope, selections);
    const driverNotesSelected = collectDriverFollowups(driverNotes, scope, selections);
    const selectedNotes = [...truckNotes, ...driverNotesSelected]
      .sort((a, b) => a.savedAt - b.savedAt || a.text.localeCompare(b.text));
    const groups = groupSelectedFollowups(selectedNotes, scope);
    const truckGroups = groups.filter((item) => item.hasTruck);
    const driverOnlyGroups = groups.filter((item) => !item.hasTruck);
    const truckHtml = truckGroups.length
      ? truckGroups.map((item) => item.html).join("")
      : emptyStateHtml(`No truck-linked follow-ups selected for ${scope.emptyLabel}.`);
    const driverHtml = driverOnlyGroups.length
      ? driverOnlyGroups.map((item) => item.html).join("")
      : emptyStateHtml(`No driver-only follow-ups selected for ${scope.emptyLabel}.`);
    return {
      date: scope.dateLabel,
      date_scope: scope.label,
      time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      prepared: now.toLocaleString([], { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      weekday: scope.weekdayLabel,
      brand: escapeHtml((localStorage.getItem("vixenBrand") || "VIXEN").trim().toUpperCase()),
      truck_followups_html: truckHtml,
      driver_followups_html: driverHtml,
      all_followups_html: groups.length ? groups.map((item) => item.html).join("") : emptyStateHtml(`No follow-ups selected for ${scope.emptyLabel}.`),
      truck_followups: truckGroups.length ? truckGroups.map((item) => item.text).join("\n\n") : `None selected for ${scope.emptyLabel}.`,
      driver_followups: driverOnlyGroups.length ? driverOnlyGroups.map((item) => item.text).join("\n\n") : `None selected for ${scope.emptyLabel}.`,
      all_followups: groups.length ? groups.map((item) => item.text).join("\n\n") : `None selected for ${scope.emptyLabel}.`,
      truck_count: String(truckNotes.length),
      driver_count: String(driverNotesSelected.length),
      followup_count: String(selectedNotes.length),
      group_count: String(groups.length),
      file_key: scope.fileKey,
      scope,
      notes: selectedNotes,
      groups,
      trucks: truckGroups,
      drivers: driverOnlyGroups,
    };
  }

  function collectTruckFollowups(groups, scope, selections) {
    const items = [];
    const grouping = window.VixenTransitionGrouping;
    Object.entries(groups || {}).forEach(([truck, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => dateMatchesScope(note.savedAt, scope.dates) && noteIncluded("pta", note, selections))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      notes.forEach((note) => {
        const truckLabel = cleanLine(note.truck || truck) || "Unknown";
        const parsed = grouping?.parseDriverIdentity?.(note.driver) || { name: cleanLine(note.driver), code: "" };
        const driverName = cleanLine(parsed.name);
        const driverCode = cleanLine(note.driverCode || parsed.code);
        const details = [
          note.driver ? `<strong>Driver:</strong> ${escapeHtml(cleanLine(note.driver))}` : "",
          note.pta ? `<strong>PTA:</strong> ${escapeHtml(formatDateTime(note.pta))}` : "",
          note.status ? `<strong>Status:</strong> ${escapeHtml(cleanLine(note.status))}` : "",
          note.planStatus ? `<strong>Plan:</strong> ${escapeHtml(cleanLine(note.planStatus))}` : "",
          note.destination ? `<strong>Destination:</strong> ${escapeHtml(cleanLine(note.destination))}` : "",
        ].filter(Boolean).join(" &nbsp;·&nbsp; ");
        const textDetails = [
          note.driver ? `Driver ${cleanLine(note.driver)}` : "",
          note.pta ? `PTA ${formatDateTime(note.pta)}` : "",
          note.status ? `Status ${cleanLine(note.status)}` : "",
          note.planStatus ? `Plan ${cleanLine(note.planStatus)}` : "",
          note.destination ? `Destination ${cleanLine(note.destination)}` : "",
        ].filter(Boolean).join(" | ");
        const noteText = cleanNoteText(note.text);
        items.push({
          type: "truck",
          sourceLabel: "Truck / PTA note",
          savedAt: safeTime(note.savedAt),
          truck: truckLabel,
          driverName,
          driverCode,
          driverRaw: cleanLine(note.driver),
          noteText,
          detailsHtml: details,
          detailsText: textDetails,
          identities: grouping?.identityTokens?.({
            truck: truckLabel,
            driverName,
            driverCode,
            driverRaw: note.driver,
          }) || [],
          text: `Truck ${truckLabel}${textDetails ? ` | ${textDetails}` : ""}\n${noteText}`,
        });
      });
    });
    return items.sort((a, b) => a.savedAt - b.savedAt || a.text.localeCompare(b.text));
  }

  function collectDriverFollowups(groups, scope, selections) {
    const items = [];
    const grouping = window.VixenTransitionGrouping;
    Object.entries(groups || {}).forEach(([key, values]) => {
      const notes = (Array.isArray(values) ? values : [])
        .filter((note) => dateMatchesScope(note.savedAt, scope.dates) && noteIncluded("driver", note, selections))
        .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
      notes.forEach((note) => {
        const parsedKey = grouping?.parseDriverIdentity?.(key) || { name: cleanLine(key), code: "" };
        const driverName = cleanLine(note.driverName || parsedKey.name || key) || "Unknown driver";
        const driverCode = cleanLine(note.driverCode || parsedKey.code);
        const truckLabel = cleanLine(note.truck || note.truckNumber || note.unit || note.unitNumber);
        const metricPairs = [
          ...(truckLabel ? [["Truck", truckLabel]] : []),
          ["Idle today", formatPercent(note.dailyIdlePct)],
          ["7-day idle", formatPercent(note.idle7DayPct)],
          ["28-day idle", formatPercent(note.idle28DayPct)],
          ["Possible 28-day cost", Number.isFinite(Number(note.estimatedCost)) ? formatMoney(note.estimatedCost) : ""],
        ].filter((item) => item[1] && item[1] !== "--");
        const metricsHtml = metricPairs
          .map(([label, value]) => `<span style="display:inline-block;margin:2px 10px 2px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`)
          .join("");
        const metricsText = metricPairs.map(([label, value]) => `${label} ${value}`).join(" | ");
        const noteText = cleanNoteText(note.text);
        items.push({
          type: "driver",
          sourceLabel: "Driver / idle note",
          savedAt: safeTime(note.savedAt),
          truck: truckLabel,
          driverName,
          driverCode,
          driverRaw: cleanLine(note.driverName || key),
          noteText,
          detailsHtml: metricsHtml,
          detailsText: metricsText,
          identities: grouping?.identityTokens?.({
            truck: truckLabel,
            driverName,
            driverCode,
            driverRaw: note.driverName || key,
          }) || [],
          text: `${driverName}${driverCode && !driverName.includes(driverCode) ? ` (${driverCode})` : ""}\n${metricsText}\n${noteText}`,
        });
      });
    });
    return items.sort((a, b) => a.savedAt - b.savedAt || a.text.localeCompare(b.text));
  }

  function groupSelectedFollowups(messages, scope) {
    const grouping = window.VixenTransitionGrouping;
    const rawGroups = grouping?.groupMessages
      ? grouping.groupMessages(messages)
      : messages.map((message) => ({ messages: [message], identities: message.identities || [], savedAt: message.savedAt }));
    return rawGroups
      .map((group) => renderFollowupGroup(group, scope))
      .sort((a, b) => a.savedAt - b.savedAt || a.text.localeCompare(b.text));
  }

  function renderFollowupGroup(group, scope) {
    const messages = [...(group.messages || [])]
      .sort((a, b) => a.savedAt - b.savedAt || a.text.localeCompare(b.text));
    const trucks = uniqueLabels(messages.map((message) => message.truck));
    const names = uniqueLabels(messages.map((message) => message.driverName).filter((name) => !/^unknown driver$/i.test(name)));
    const codes = uniqueLabels(messages.map((message) => message.driverCode));
    const hasTruck = messages.some((message) => message.type === "truck" || cleanLine(message.truck));
    const hasDriver = messages.some((message) => message.type === "driver" || cleanLine(message.driverName) || cleanLine(message.driverCode));
    const titleParts = [
      trucks.length ? `${trucks.length === 1 ? "Truck" : "Trucks"} ${formatIdentityList(trucks)}` : "",
      names.length ? formatIdentityList(names) : "",
      codes.length ? `(${formatIdentityList(codes)})` : "",
    ].filter(Boolean);
    const titleText = titleParts.join(" · ") || "Unmatched follow-up";
    const sourceTypes = [
      messages.some((message) => message.type === "truck") ? "Truck / PTA" : "",
      messages.some((message) => message.type === "driver") ? "Driver / idle" : "",
    ].filter(Boolean).join(" + ");
    const summary = `${messages.length} message${messages.length === 1 ? "" : "s"}${sourceTypes ? ` · ${sourceTypes}` : ""}`;
    const messageHtml = messages.map((message, index) => groupedMessageHtml(message, index, scope)).join("");
    const plainHeader = [
      trucks.length ? `${trucks.length === 1 ? "Truck" : "Trucks"} ${trucks.join(", ")}` : "",
      names.length ? names.join(", ") : "",
      codes.length ? `(${codes.join(", ")})` : "",
    ].filter(Boolean).join(" | ") || "Unmatched follow-up";
    const plainMessages = messages.map((message) => {
      const details = message.detailsText ? ` | ${message.detailsText}` : "";
      return `[${formatDateTime(message.savedAt)}] ${message.sourceLabel || "Follow-up"}${details}\n${message.noteText || "Note saved without text"}`;
    }).join("\n\n");
    return {
      savedAt: messages[0]?.savedAt || Number(group.savedAt || 0),
      text: `${plainHeader}\n${summary}\n${plainMessages}`,
      html: followupGroupHtml(`${hasTruck ? "🚛" : "⛽"} ${escapeHtml(titleText)}`, summary, messageHtml, hasTruck ? "#7c3aed" : "#16a34a"),
      hasTruck,
      hasDriver,
      messageCount: messages.length,
      messages,
      identities: group.identities || [],
    };
  }

  function groupedMessageHtml(message, index, scope) {
    const divider = index ? "border-top:1px solid #d8e0ea;" : "";
    const dateLabel = scope.dates.length > 1 ? `${formatNoteDay(message.savedAt)} · ` : "";
    const stamp = new Date(message.savedAt);
    const timeLabel = Number.isNaN(stamp.getTime())
      ? "Time not captured"
      : stamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const noteHtml = escapeHtml(message.noteText || "Note saved without text").replace(/\n/g, "<br>");
    return [
      `<div style="${divider}padding:10px 0 2px;">`,
      `<div style="font-size:12px;"><strong>${escapeHtml(message.sourceLabel || "Follow-up")}</strong> · ${escapeHtml(`${dateLabel}${timeLabel}`)}</div>`,
      message.detailsHtml ? `<div style="font-size:12px;margin-top:5px;line-height:1.55;">${message.detailsHtml}</div>` : "",
      `<div style="font-size:14px;margin-top:7px;line-height:1.5;">${noteHtml}</div>`,
      "</div>",
    ].join("");
  }

  function followupGroupHtml(title, summary, messagesHtml, accent) {
    return [
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:0 0 10px;border:1px solid #d8e0ea;border-left:5px solid ${accent};border-radius:8px;">`,
      '<tr><td style="padding:13px 15px;">',
      `<div style="font-size:15px;font-weight:700;">${title}</div>`,
      `<div style="font-size:12px;margin-top:4px;">${escapeHtml(summary)}</div>`,
      messagesHtml,
      "</td></tr></table>",
    ].join("");
  }

  function uniqueLabels(values) {
    const seen = new Set();
    return values.map(cleanLine).filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function formatIdentityList(values) {
    const visible = values.slice(0, 3);
    const extra = values.length - visible.length;
    return `${visible.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`;
  }

  function cleanNoteText(value) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || "Note saved without text";
  }

  function emptyStateHtml'''

pattern = re.compile(r"  function buildContext\(.*?\n  function emptyStateHtml", re.S)
editor, count = pattern.subn(lambda _: replacement, editor, count=1)
if count != 1:
    raise SystemExit(f"follow-up grouping block: expected one match, found {count}")

editor = replace_once(
    editor,
    '    if (meta) meta.textContent = `${context.date_scope} · ${context.truck_count} truck note${context.truck_count === "1" ? "" : "s"} · ${context.driver_count} driver note${context.driver_count === "1" ? "" : "s"} · prepared ${context.prepared}`;',
    '    if (meta) meta.textContent = `${context.date_scope} · ${context.followup_count} selected message${context.followup_count === "1" ? "" : "s"} in ${context.group_count} matched group${context.group_count === "1" ? "" : "s"} · ${context.truck_count} truck note${context.truck_count === "1" ? "" : "s"} · ${context.driver_count} driver note${context.driver_count === "1" ? "" : "s"} · prepared ${context.prepared}`;',
    "transition summary grouping count",
)
EDITOR.write_text(editor, encoding="utf-8")

bootstrap = BOOTSTRAP.read_text(encoding="utf-8")
bootstrap = replace_once(
    bootstrap,
    '    "note_transition_toggle.js",\n    "transition_export_v2.js",',
    '    "note_transition_toggle.js",\n    "database/transition-grouping.js",\n    "transition_export_v2.js",',
    "grouping bootstrap module",
)
BOOTSTRAP.write_text(bootstrap, encoding="utf-8")

manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
manifest["version"] = "3.14.2"
manifest["transitionMessageGrouping"] = "selected notes sharing a normalized driver code, driver name, or truck number are rendered in one chronological card"
manifest["groupingMatchFields"] = ["driverCode", "driverName", "truckNumber"]
manifest["groupingCounts"] = "selected note counts remain raw-note counts; group_count reports matched cards"
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
VERSION.write_text("3.14.2\n", encoding="utf-8")

print("Applied transition identity grouping for v3.14.2.")
