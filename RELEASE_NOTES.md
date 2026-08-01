# Fuel Dash 3.18.0

## Continuous Today workflow

- Adds one prioritized Today queue for live PTA attention, high-priority driver reviews, and saved follow-ups.
- Adds Finish + handoff to complete work, select it for transition, and advance to the next task in one action.
- Adds Finish only for private work, plus Show all, Reopen, and Restore so completed or hidden tasks are never lost.
- Adds attention counts, an urgent-work banner, queue search, and optional browser notifications.
- Groups the existing navigation into Performance, Dispatch, Handoff, and Tools without removing any dashboard feature.

## Runtime and accuracy

- New notes now enter the workflow explicitly as open work.
- Live source tasks are de-duplicated when a matching tracked note exists.
- Report downloads and independent file inspection run concurrently.
- Large table searches are debounced to reduce unnecessary DOM work.
- Updates workflow and transition smoke coverage for the current rich-editor architecture.

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
