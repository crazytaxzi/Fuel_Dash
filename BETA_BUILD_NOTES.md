# Beta 4 verification

- `missing_bol.js` passed `node --check`.
- `auxiliary_mode.js` passed `node --check`.
- The exact live Missing BOL header layout resolved `Empty Call Date`, `Driver Leader`, and `Last Dispatch Driver cd` at the expected columns.
- The trip-column smoke test selected `TMEX Order #` when its values matched `LLDDDD`.
- Oldest-first sorting used `Empty Call Date`.
- The four-file idle bridge derives only the driver index and idle fields available from `rolling 7 day.xlsx` and `Driver Details.xlsx`; it does not fabricate MPG, OOR, leader, or cost values.
