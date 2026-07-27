# Fuel Dash Beta

Release: `v2026.07.27-beta.10`

## Operating-layout repair

- Validated the parser against the supplied operating workbook structures without committing or packaging the source files.
- Prevented repeating Driver Details blocks from being misclassified as flat driver metrics or MPG reports.
- Derived the driver index from rolling idle and driver-history data when a separate flat driver table is absent.
- Missing BOL trips are read from whichever order column contains exactly three letters followed by four digits.
- Dispatch driver codes are preserved directly from `Last Dispatch Driver cd`, including short legacy values.

## Worked and transition workflow

- The Worked tab now creates one card for every saved PTA or driver note instead of collapsing all notes for a truck or driver into one item.
- Each note has its own `Follow-up complete` toggle beside its `Include in transition` toggle.
- Both note-level toggles default off.
- Recent unfinished notes remain yellow for one hour; older unfinished notes remain visible in red; individually completed notes turn blue.
- Completing one note does not complete any other note for the same truck or driver.
- The old truck-level and driver-level completion controls were removed from the popups.
- Clicking a Worked card opens the related popup and focuses the matching saved note when the current record is available.
- New and existing notes remain excluded from the transition until their individual transition toggle is explicitly switched on.
- Selected notes saved today are grouped into one `{truck} - {all selected notes}` line per truck.
- Selected high-idle driver notes appear in a separate `High Idles contacted:` section with one line per driver.
- The Possible 28-Day Savings and Possible Yearly Cost cards remain removed from the Overview display.
- Added sanitized regression tests proving completion is isolated per note and the Worked tab emits one item per note. No operating workbook is stored in the repository or package.

## Beta warning

The Windows launcher and browser still get the final operating-computer test. Unsupported future export changes should appear as diagnostics rather than being forced into the wrong parser.
