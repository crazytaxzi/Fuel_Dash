VIXEN FUEL DASHBOARD
====================

VERSION
-------
3.9.0 - Stable main release

Fuel Dash reads supported XLSX and text-based PDF reports from the local data folder. Report roles are determined from worksheet headers, values, layout, and cross-field structure. The filename is ignored.

START
-----
1. Put the current XLSX and PDF reports in the data folder.
2. Run the included dashboard launcher.
3. The browser opens the dashboard and classifies every supported report by content.

The folder may contain a complete fuel-analysis set, a partial set, or auxiliary operational reports. Complete data populates the related dashboards. Partial data remains available without inventing unavailable performance values.

DATA RULES
----------
- XLSX and readable PDF reports are inspected regardless of filename.
- A report can contribute to more than one role when its contents support those roles.
- Strong structural matches load automatically. Unrecognized files are listed in diagnostics rather than forced into the wrong parser.
- Driver codes are preserved as text.
- Missing BOL records are recognized from their operational columns and trip-value patterns, then sorted oldest first.
- Report data stays on the local computer.

NOTES AND TRANSITIONS
---------------------
Driver and PTA notes are stored in the browser used to run the dashboard. Export transitions regularly if the notes matter after a browser reset or computer change.

VALIDATION
----------
Run `node validate_dashboard.js` to check JavaScript syntax and confirm that explicit report-filename routing has not returned.
