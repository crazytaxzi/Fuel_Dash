# Fuel Dash Beta

Release: `v2026.07.26-beta.4`

This is a beta build from the `testing` branch. It is intended for hands-on testing before anything is promoted to `main`.

## Fixed in beta 4

- The Missing BOL parser now recognizes the live export header layout instead of requiring a literal `Unbilled` column.
- The report signature uses `Driver Leader`, `Last Dispatch Driver cd`, `Empty Call Date`, and the available order-number fields.
- The trip column is selected by actual values matching `LLDDDD` across `Order #`, `TMEX Order #`, and `Logistics Order#`.
- Missing BOL rows are sorted oldest to newest using `Empty Call Date`.
- Driver codes are read from `Last Dispatch Driver cd` using the company and owner-operator code rules.
- The four-file idle set shown in normal operations is now accepted when `driver metrics detail.xlsx` is absent.
- A derived driver index is built locally from `rolling 7 day.xlsx` and `Driver Details.xlsx`, allowing `summary.xlsx` and `Detail.xlsx` to populate the rest of the dashboard.
- Exact filenames are used only as a fallback when content classification misses one of the known core files.
- Added a regression test for the exact 29-column Missing BOL export header.

## Earlier beta fixes retained

- Content-based loading for XLSX and text-based PDF reports in the local `data` folder.
- Partial-data startup without the obsolete complete-report bundle gate.
- Missing BOL navigation with trip counts.
- Blank unavailable KPIs instead of synthetic performance.
- Local-only processing and an empty packaged `data` folder.

## Beta cautions

- Launch through the included PowerShell dashboard launcher. Opening `index.html` directly cannot enumerate the local `data` folder.
- PDFs must contain selectable text. Image-only scans still require OCR.
- The derived driver index does not invent dispatch MPG, out-of-route, leader assignments, or fuel cost. Those fields remain unavailable unless a source report supplies them.
- The live workbooks still need hands-on validation because only the header layout, not the operating file itself, was provided here.
- Keep the production workflow on the stable build until this beta has been checked with normal weekly files.

## Data handling

Report files remain local. The packaged `data` folder is empty, and no operating data or dashboard server log is included in the release ZIP.
