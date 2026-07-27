# Fuel Dash 3.9.0

## Stability repair

- Fixed the note-history `MutationObserver` feedback loop that could freeze the page when saving a note or opening one from Worked.
- The observer now disconnects before adding or refreshing note controls and reconnects afterward.
- Status labels update only when their displayed text changes.
- Added a regression guard for the observer lifecycle and conditional label updates.

## Worked and transition workflow

- The Worked tab keeps one independently colored card per saved PTA or driver note.
- Every note has separate `Include in transition` and `Follow-up complete` toggles, both defaulting off.
- Recent unfinished notes remain yellow for one hour, older unfinished notes remain red, and completed notes turn blue.
- Selected notes saved today are grouped into one line per truck.
- Selected high-idle notes remain in the separate `High Idles contacted:` section.

## Parser and privacy

- Includes the operating-layout parser repairs and Missing BOL handling developed during beta testing.
- Supplied operating workbooks remain reference-only and are not committed or packaged.
- Report discovery remains content-based rather than filename-based.
