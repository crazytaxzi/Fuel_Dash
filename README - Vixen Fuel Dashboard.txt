VIXEN FLEET OPS - LOCAL HTML COMMAND CENTER
============================================

VERSION
-------
v3.2 PTA action notes + manual paste + dispatch integration + smooth-edge UI + driver modal + electric APU support

WHAT IT IS
----------
A local, streamer-themed HTML dashboard that reads your fleet workbooks without
rebuilding an Excel dashboard. Fuel, electric APU, and PTA dispatch work can live
in one command center instead of breeding separate spreadsheets in the dark.

REQUIRED FUEL SOURCE FILES
--------------------------
The dashboard accepts XLSX or XLSM versions of:

- summary
- c1
- Detail
- summary chart

For automatic loading, keep the files beside index.html with these names:

summary.xlsx / summary.xlsm
c1.xlsx / c1.xlsm
Detail.xlsx / Detail.xlsm
summary chart.xlsx / summary chart.xlsm

OPTIONAL PTA DISPATCH FILES
---------------------------
The dashboard automatically recognizes:

- Fleet_PTA_Finder.xlsx / XLSM
- PTA_Dispatch_Tracker.xlsx / XLSM
- PTA_Dispatch_Tracker_Updated_FIXED.xlsx
- similarly named files containing Fleet PTA Finder or PTA Dispatch Tracker

The two files have different jobs:

PTA Dispatch Tracker
- Full dispatch list
- Live overdue-hour calculation in the webpage
- Alert severity
- Plan status and action flags
- Dispatch notes

Fleet PTA Finder
- Available trucks with no preplan inside the planning window
- Dispatched trucks with no preplan inside the planning window
- Finder window setting, normally 48 hours

PTA BOARD SORTING
-----------------
The PTA Dispatch page sorts work in plain English:

1. Critical: 24 or more hours past PTA
2. High: 8 to 24 hours past PTA
3. Medium: 2 to 8 hours past PTA
4. New overdue: less than 2 hours past PTA
5. Due soon: inside the finder window without a preplan
6. Future: no immediate dispatch action

The default Needs Action view includes overdue PTAs and due-soon no-preplan rows.
Click any row for a pop-up with the truck, driver, PTA, time status, plan status,
destination, OM, count, notes, source row, and recommended next action.

PTA IN DRIVER DETAILS
---------------------
The driver pop-up also tries to match the driver to a PTA record. Dispatch files
often abbreviate names, so matching uses the full name plus a last-name/first-
initial pattern. Confirm the record manually when names are unusually mangled.

OPTIONAL ELECTRIC APU FILE
--------------------------
The dashboard will also read one optional workbook with APU in its filename,
for example:

APU.xlsx
Electric APU.xlsm
Weekly_APU_Report.xlsx

Helpful APU columns include Driver Code, Driver Name, Unit, Electric APU Hours,
Engine Idle Hours, APU Use %, Battery SOC, Faults, and Notes.

DRIVER DETAILS
--------------
Click a driver or Open Driver Details. The pop-up shows:

- Possible 28-day savings
- Estimated excess gallons
- Fuel MPG and peer target
- Engine idle and fleet review level
- Out-of-route percentage
- MPG while moving
- Possible yearly cost if the same gap repeats
- What stands out
- What to check next
- Matched electric APU information
- Matched PTA / dispatch information

“Possible savings” is estimated avoidable cost, not a good-performance score.
Higher means more cost to investigate, not better performance.

HOW TO RUN IT
-------------
1. Extract the entire package to a normal Windows folder.
2. Keep the four required fuel workbooks in that folder.
3. Add the PTA and APU files when available.
4. Double-click "Launch Fuel Dashboard.cmd".
5. The dashboard opens in your default browser.

If the workbooks are beside the dashboard, they load automatically. If they are
stored elsewhere, click Choose Data Folder and select the folder.

AUTO REFRESH
------------
The dashboard checks a selected folder every 60 seconds by default. The interval
can be changed under Settings. You can also click the refresh icon at the top.

BROWSER
-------
Microsoft Edge or Google Chrome is recommended. The launcher uses a local
127.0.0.1 web server so the browser can safely request folder access.

PRIVACY
-------
The dashboard is local. It does not upload the spreadsheets or dashboard data.
The only web address used is http://127.0.0.1:8765, which points back to the
same computer.

XLSM NOTE
---------
The dashboard reads worksheet values from XLSM files. It does not run VBA
macros. Formula results should be calculated and saved in Excel when you want
the cached workbook values available. PTA overdue time is recalculated live in
the webpage from the PTA date/time.

FILES
-----
index.html                  Dashboard page
styles.css                  Theme, modals, and layout
app.js                      Workbook reading and analysis
assets/vixen.png            Neon truck profile image
vendor/xlsx.full.min.js     Local spreadsheet parser
vendor/chart.umd.js         Local chart renderer
serve_dashboard.ps1         Tiny local static server
Launch Fuel Dashboard.cmd  Starts the server and opens the dashboard
Stop Dashboard Server.cmd  Stops the local server
PTA Column Guide.txt        PTA workbook requirements and matching notes
PTA Manual Paste Guide.txt Paste-once workflow for both PTA tools
APU Column Guide.txt        APU workbook requirements and matching notes

TROUBLESHOOTING
---------------
Dashboard says required files are missing:
- Confirm the four required fuel filenames match the supported names above.
- Confirm they are in the dashboard folder, or choose their folder manually.

PTA page says no data was found:
- Confirm the filename contains Fleet PTA Finder or PTA Dispatch Tracker.
- Confirm the expected sheets still exist: PTA Tracker, Available, Dispatched.
- Save the workbook after refreshing its source data.

Dashboard does not update:
- Save and close the source workbook, then click refresh.
- Check Settings to confirm auto-refresh is enabled.

Port 8765 is already in use:
- Run "Stop Dashboard Server.cmd", then launch again.

Do not open index.html directly if folder access is needed. Use the launcher.

MANUAL PTA PASTE
----------------
The PTA Dispatch page includes a paste box for the shared dispatch report. Paste
the data once and the dashboard creates both the overdue tracker and the
available/dispatched finder queues. The paste overrides the two PTA workbooks
until "Go back to PTA files" is selected.

Expected columns:
Truck #, Div #, Driver, PTA, Status, Plans, Plan, Team, Destination, OM, Count

The paste is stored locally in that browser only.

PTA ACTION NOTES (v3.2)
-----------------------
Open any truck in the PTA section and use the “Why did we take that action?” box.
Each saved note receives a timestamp plus the truck's PTA, status, plan status,
and destination at the time it was saved. The history stays attached to the
truck and is stored locally in that browser. Notes are not written back to Excel
and will not automatically move to a different computer or browser profile.

