# Fuel Dash Beta

Release: `v2026.07.27-beta.11`

## Freeze repair

- Fixed a note-history `MutationObserver` feedback loop introduced with per-note controls.
- The observer now disconnects before adding or refreshing note controls and reconnects afterward.
- Status labels are updated only when their displayed text actually changes.
- Saving a new PTA or driver note no longer causes the note-history observer to repeatedly trigger itself.
- Opening a note from the Worked tab no longer freezes while the related popup rebuilds its note history.
- Added a regression guard that requires the observer disconnect/reconnect pattern and conditional label updates.

## Worked and transition workflow retained

- The Worked tab keeps one independently colored card per saved PTA or driver note.
- Every note keeps separate `Include in transition` and `Follow-up complete` toggles, both defaulting off.
- Recent unfinished notes remain yellow for one hour, older unfinished notes remain red, and completed notes turn blue.
- Selected notes saved today remain grouped into one `{truck} - {all selected notes}` line per truck.
- Selected high-idle notes remain in the separate `High Idles contacted:` section.

## Parser and privacy

- Keeps the operating-layout parser repairs and Missing BOL handling from earlier betas.
- Supplied workbooks remain reference-only and are not committed or packaged.
- The two unused Overview savings cards remain removed.

## Beta warning

The Windows launcher and browser still get the final operating-computer test. Beta 10 is superseded because its note-history observer can freeze the page.
