VIXEN FUEL DASHBOARD
====================

VERSION
-------
3.19.3 - Stable main release

Fuel Dash reads supported XLSX and text-based PDF reports from the local data folder. Report roles are determined from worksheet headers, values, layout, and cross-field structure. The filename is ignored.

SYSTEM TARGET
-------------
- Windows desktop or laptop with a modern Chromium-based browser.
- The interface uses a minimum 1180-pixel desktop canvas and is not designed for phones or tablets.

START
-----
1. Put the current XLSX and PDF reports in the data folder.
2. Run the included dashboard launcher.
3. The browser opens the dashboard and classifies every supported report by content.

PDF TO XLSX
-----------
Open Settings and use the built-in PDF to XLSX converter when a spreadsheet copy is needed. Drop one or more supported text-based PDF fuel reports into the converter and move the downloaded XLSX files into the data folder. Conversion stays in the local browser.

The folder may contain a complete fuel-analysis set, a partial set, or auxiliary operational reports. Complete data populates the related dashboards. Partial data remains available without inventing unavailable performance values.

DATA RULES
----------
- XLSX and readable PDF reports are inspected regardless of filename.
- A report can contribute to more than one role when its contents support those roles.
- Strong structural matches load automatically. Unrecognized files are listed in diagnostics rather than forced into the wrong parser.
- Driver codes are preserved as text.
- Driver codes and names form the persistent identity; a truck is the driver's current operational assignment, not a separate idle record.
- Order numbers shared by the Missing BOL and fuel-detail reports provide evidence for driver-to-truck assignments and changes.
- Rolling idle is weighted from source hours: total idle hours divided by total engine hours for the selected period.
- Personal-category records and saved idle exclusions do not enter idle rankings or weighted idle KPIs.
- Missing BOL records are recognized from their operational columns and trip-value patterns, then sorted oldest first.
- Report data stays on the local computer.

NOTES AND TRANSITIONS
---------------------
Operational notes are stored in the browser used to run the dashboard and follow the persistent driver identity; the current truck remains visible as context. Export transitions regularly if the notes matter after a browser reset or computer change.

Fuel notes capture a record type, follow-up state, optional follow-up date, and the current rolling idle values. A note requires both a driver and a truck. Use Assignments and coaching history on Fuel Coaching to correct a link, support a two-driver team truck, or retrieve prior notes and fuel snapshots. Only explicitly selected notes enter handoff, formatted as a bold truck number followed by the driver and note.

CONTINUOUS WORKFLOW
-------------------
Today is the normal starting point. Live PTA attention items, high-priority driver reviews, and saved follow-ups share one prioritized queue.

- Open the first task and record the action taken.
- Finish + handoff completes the follow-up, includes it in the shift transition, and advances to the next open item.
- Finish only completes private or non-handoff work.
- Show all reveals completed or manually hidden items. Reopen restores an item to the active queue.
- The attention banner and sidebar count show pending work. Browser notifications are optional and remain off until enabled from Today.

SPECIAL NOTES AND REMINDERS
---------------------------
Use Special Notes under Tools for personal notes that are not tied to a truck or driver. A note can have no reminder or a specific date and time, can be completed and reopened, and remains available under Show all. Quick reminder buttons provide 15-minute, one-hour, and tomorrow options. Alerts use the Today notification permission and fire once when a reminder becomes due or its saved details change.

VALIDATION
----------
Run `node validate_dashboard.js` to check JavaScript syntax and confirm that explicit report-filename routing has not returned.
