# Fuel Dash Beta

Release: `v2026.07.26-beta.7`

## Reference-file repair

- Validated the parser against the supplied operating workbook structures without committing or packaging the source files.
- Removed the unused summary dependency from joined idle-report mode.
- Prevented repeating Driver Details blocks from being misclassified as flat driver metrics or MPG reports.
- Prevented transaction detail and one-period cost summaries from being misclassified as trend reports.
- Derived the driver index from rolling idle and driver-history data when a separate flat driver table is absent.
- Corrected rolling-idle extraction so the week-start date is not mistaken for a percentage.
- Missing BOL trips are read from whichever order column contains exactly three letters followed by four digits, including the live `Order #` layout.
- Dispatch driver codes are preserved directly from `Last Dispatch Driver cd`, including short legacy values such as four-letter codes.
- Added sanitized structural regression tests. No supplied operating workbook is stored in the repository or beta package.

## Beta warning

This build is intended for the supplied operating layouts. Unsupported future export changes should appear as diagnostics rather than being forced into the wrong parser.
