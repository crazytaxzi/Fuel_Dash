# Fuel Dash 3.19.0

## In-app PDF conversion and cleaner package

- Moves PDF-to-XLSX conversion directly into Dashboard Settings with file selection and drag-and-drop.
- Keeps conversion local and lazy-loads PDF.js only after a PDF is submitted.
- Removes the obsolete standalone converter page, converter launcher, conversion guide, and unused Worked cleanup module.
- Excludes tests, validation tooling, sample workbooks, duplicate guides, and internal metadata from downloadable packages.
- Adds browser and smoke-test coverage for converter integration and release-package cleanup.

## Stationary sidebar image

- Keeps the full Vixen truck image visible instead of cropping it.
- Keeps the branding, image, motto, and refresh status stationary.
- Makes the navigation area scroll independently on shorter desktop displays.
- Adds a compact neon-styled navigation scrollbar for short desktop windows.
- Uses a desktop-only 1180px canvas; narrower windows scroll horizontally instead of switching to a mobile layout.

## Completion feedback hotfix

- Makes Finish only and Finish + handoff idempotent so duplicate browser click events cannot complete or announce the same follow-up twice.
- Prevents duplicate finish events from rewriting handoff state.
- Reuses one toast timer so completion feedback appears exactly once.
- Adds regression coverage for repeated completion events.

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
