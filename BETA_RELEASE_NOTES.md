# Fuel Dash Beta

Release: `v2026.07.26-beta.5`

## Filename-independent report discovery

- Every supported XLSX and text-based PDF in the local data folder is inspected.
- Report roles are assigned from headers, values, worksheet structure, and cross-field patterns.
- Folder selection, manual file selection, automatic local loading, partial-data handling, and auxiliary tools now use the same content classifier.
- Explicit report-name aliases, filename regular expressions, fallback names, and fixed report-name instructions were removed.
- The normal idle workflow can derive a driver index from compatible idle-history sources when a separate driver-index export is absent.
- Missing BOL detection uses operational headers and trip-value patterns, not the workbook name.
- Missing BOL trip numbers are recognized as exactly three letters followed by four digits, such as `ABC1234`.
- A repository validator now rejects explicit report filenames and filename-routing constructs.

## Beta warning

This is still a beta. New report layouts may need additional structural rules, but renaming a report should never be the fix.
