# Fuel Dashboard browser database

This folder contains the dashboard's lightweight persistence layer.

- `dashboard-db.js` uses IndexedDB as the source of truth for dashboard settings, manual PTA data, driver notes, PTA notes, special notes and reminders, notification state, transition selections, and worked-note completion state.
- Existing supported localStorage keys are migrated once and then removed from localStorage.
- `pta-change-worker.js` compares each new manual PTA snapshot with the previous snapshot and flags large PTA moves, missing plans, driver swaps, duplicate truck rows, disappearing operationally relevant trucks, and one driver appearing on multiple trucks.
- `pta-history-ui.js` changes the manual PTA editor into a dialog and adds searchable snapshot/change history.
- `bootstrap.js` waits for the database to be ready before loading the existing application, so its synchronous settings reads remain compatible.

The database is stored by the browser for this site. It is not a server database and does not sync automatically between computers or browser profiles. A server-backed database would require a hosted API and authentication, which is deliberately outside this lightweight static deployment.
