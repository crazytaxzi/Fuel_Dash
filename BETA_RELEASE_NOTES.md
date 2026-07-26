# Fuel Dash Beta

Release: `v2026.07.26-beta.3`

This is a beta build from the `testing` branch. It is intended for hands-on testing before anything is promoted to `main`.

## Fixed in beta 3

- In partial-data mode, a recognized Missing BOL report now becomes the active view automatically.
- The app no longer leaves the operator staring at an empty fuel overview while the BOL results sit on another page.
- The Missing BOL navigation item displays the current trip count.
- Clicking Missing BOLs directly activates that view even when the dashboard started without a complete fuel-report set.
- The reporting-period chip changes to `Missing BOLs` when the BOL workflow is opened.

## Fixed in beta 2

- Removed the effective complete-bundle startup requirement when the local `data` folder contains only auxiliary or partial reports.
- A Missing BOL workbook can open the dashboard by itself.
- Incomplete fuel panels display blank values and a clear Partial Data Mode banner instead of reporting invented zero-performance results.
- The old “choose the five idle-report XLSX files, the legacy workbook set, or all four basic reports” error is suppressed when usable auxiliary data is present.

## Included

- Content-based loading for `.xlsx` and text-based `.pdf` reports placed in the local `data` folder.
- Report recognition based on worksheet headers, values, and structure rather than filenames.
- Missing BOL view that recognizes a worksheet containing `Unbilled`, `Driver Leader`, and `Last Dispatched`.
- Missing BOL trip extraction using the `LLDDDD` pattern, oldest-to-newest ordering, and driver codes read directly from `Last Dispatched`.
- Existing fuel, idle, data-quality, electric APU, PTA, notes, and shift-transition dashboard functions from the `testing` branch.

## Beta cautions

- Launch through the included PowerShell dashboard launcher. Opening `index.html` directly cannot enumerate the local `data` folder.
- PDFs must contain selectable text. Image-only scans still require OCR.
- The content classifier is deterministic and may need tuning when a new report layout uses unfamiliar headings.
- Partial Data Mode keeps the application usable, but a report can only populate metrics that its contents actually supply.
- The Missing BOL parser still needs validation against the live BOL workbook.
- Keep the production workflow on the current stable build until this beta has been checked with normal weekly files.

## Data handling

Report files remain local. The packaged `data` folder is empty, and no operating data or dashboard server log is included in the release ZIP.
