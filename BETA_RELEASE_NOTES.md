# Fuel Dash Beta

Release: `v2026.07.27-beta.9`

## Operating-layout repair

- Validated the parser against the supplied operating workbook structures without committing or packaging the source files.
- Prevented repeating Driver Details blocks from being misclassified as flat driver metrics or MPG reports.
- Derived the driver index from rolling idle and driver-history data when a separate flat driver table is absent.
- Missing BOL trips are read from whichever order column contains exactly three letters followed by four digits.
- Dispatch driver codes are preserved directly from `Last Dispatch Driver cd`, including short legacy values.

## Worked and transition workflow

- Restored the Worked tab for PTA truck notes and driver follow-up notes.
- Recent unfinished items remain yellow for one hour; older unfinished items remain visible in red.
- Added a persistent popup toggle that marks the latest follow-up complete and turns the Worked item blue.
- A newer note automatically reopens an item so an old completion state cannot hide new work.
- Every saved PTA and driver note now has its own `Include in shift transition` toggle beside it.
- New and existing notes default to excluded. A note appears in the transition only after its toggle is explicitly switched on.
- Turning a note off removes only that note from the transition while keeping it in note history.
- Selected notes saved today are grouped into one `{truck} - {all selected notes}` line per truck.
- Selected high-idle driver notes appear in a separate `High Idles contacted:` section with one line per driver.
- Removed the Possible 28-Day Savings and Possible Yearly Cost cards from the Overview display.
- Added sanitized regression tests for default-off note selection and compact transition output. No operating workbook is stored in the repository or package.

## Beta warning

The Windows launcher and browser still get the final operating-computer test. Unsupported future export changes should appear as diagnostics rather than being forced into the wrong parser.
