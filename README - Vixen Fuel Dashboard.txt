VIXEN FLEET OPS - LOCAL HTML COMMAND CENTER
============================================

VERSION
-------
Four-report idle ranking + rolling idle review + shift-transition export

WHAT IT IS
----------
A local, streamer-themed HTML dashboard that reads your fleet workbooks without
rebuilding an Excel dashboard. Fuel, electric APU, and PTA dispatch work can live
in one command center instead of breeding separate spreadsheets in the dark.

PRIMARY SOURCE MODE - FIVE IDLE XLSX REPORTS
--------------------------------------------
Place these files in the data folder:

- summary.xlsx
- Detail.xlsx
- driver metrics detail.xlsx
- Driver Details.xlsx
- rolling 7 day.xlsx

The dashboard automatically joins the driver reports and ranks the five highest
and five best current idlers using the latest 7-day idle percentage. The current
28-day idle percentage appears beside it for context. Drivers without a current
7-day value fall back to their 28-day value instead of using stale 7-day data.

SOURCE MODE 1 - LEGACY WORKBOOKS
--------------------------------
The full-detail dashboard accepts XLSX or XLSM versions of:

- summary
- c1
- Detail
- summary chart

For automatic loading, keep the files beside index.html with these names:

summary.xlsx / summary.xlsm
c1.xlsx / c1.xlsm
Detail.xlsx / Detail.xlsm
summary chart.xlsx / summary chart.xlsm

SOURCE MODE 2 - BASIC XLSX/PDF REPORTS
--------------------------------------
The dashboard can instead load these four reports from the data folder:

- Driver Fuel Metrics.xlsx / Driver Fuel Metrics.pdf
- Fuel Compliance Analysis.xlsx / Fuel Compliance Analysis.pdf
- Fuel Noncompliant Cost Analysis.xlsx / Fuel Noncompliant Cost Analysis.pdf
- MPG by Driver.xlsx / MPG by Driver.pdf

Each report may independently be XLSX or PDF, so mixed sets are supported. The
basic reports provide compliance, driver MPG/idle/OOR, overall noncompliant
cost, and available MPG history. They do not contain transaction-level fueling
events or unit-level cost details; those panels explain this when basic mode is
active.

In basic-report mode, the Overview is centered on two lists:

- Five highest idlers, sorted from highest idle percentage down
- Five best idlers, sorted from lowest idle percentage up

The older four-report set contains a 28-day idle value but not a 7-day value.
The primary five-XLSX mode supplies both 7-day and 28-day idle. Dollar estimates
are not used to rank drivers in either idle-focused mode.

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

PDF REQUIREMENTS
----------------
PDFs must contain selectable text. Scanned/image-only PDFs need OCR before the
browser can read them. Keep the four basic reports in the data folder using the
recognized filenames above. See "PDF Driver Report Guide.txt" for limitations.

DRIVER DETAILS
--------------
Click a driver or Open Driver Details. The pop-up shows:

- Fuel MPG and peer target
- Daily, 7-day, and 28-day engine idle when supplied
- Out-of-route percentage
- MPG while moving
- What stands out
- What to check next
- Matched electric APU information
- Matched PTA / dispatch information

Legacy detailed workbooks also show modeled cost fields. Basic-report mode
keeps those fields blank and ranks drivers by idle percentage.

HOW TO RUN IT
-------------
1. Extract the entire package to a normal Windows folder.
2. Keep the five idle XLSX reports in the data folder. The legacy workbooks and
   older four-report set remain supported as alternatives.
3. Add the PTA and APU files when available.
4. Double-click "Launch Fuel Dashboard.cmd".
5. The dashboard opens in your default browser.

If the reports are beside the dashboard or in its data folder, they load
automatically. If stored elsewhere, click Choose Data Folder and select the
folder containing the selected source set.

PDF TO XLSX CONVERTER
---------------------
For the most reliable PDF workflow:

1. Double-click "Convert PDF Reports to XLSX.cmd".
2. Choose one or more of the four supported PDF reports.
3. Allow multiple downloads if the browser asks.
4. Move the downloaded XLSX files into the dashboard's data folder.
5. Launch or refresh the dashboard.

The converter repairs the PDFs' character-by-character text layout and writes
dashboard-ready XLSX files. It runs locally using the bundled PDF.js and
SheetJS libraries. Each converted workbook includes a structured "Table 1"
sheet plus an "Extracted Text" sheet for troubleshooting.

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
pdf_to_xlsx.html            Local PDF conversion page
pdf_to_xlsx.js              Position-aware PDF-to-XLSX conversion
assets/vixen.png            Neon truck profile image
vendor/xlsx.full.min.js     Local spreadsheet parser
vendor/chart.umd.js         Local chart renderer
serve_dashboard.ps1         Tiny local static server
Launch Fuel Dashboard.cmd  Starts the server and opens the dashboard
Convert PDF Reports to XLSX.cmd  Starts the local PDF conversion tool
Stop Dashboard Server.cmd  Stops the local server
PTA Column Guide.txt        PTA workbook requirements and matching notes
PTA Manual Paste Guide.txt Paste-once workflow for both PTA tools
APU Column Guide.txt        APU workbook requirements and matching notes

TROUBLESHOOTING
---------------
Dashboard says required files are missing:
- Confirm either the legacy set or all four basic report filenames match the
  supported names above.
- Confirm they are beside the dashboard, in its data folder, or choose their
  folder manually.

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

When a note is saved for a truck on the PTA watch board, that truck turns gold
and shows "Worked recently" for one hour. The remaining gold time is displayed
on the row. After the hour expires, the row automatically returns to its normal
urgency/watch styling so worked and waiting trucks are easy to distinguish.

SHIFT TRANSITION (v3.3)
-----------------------
Driver details now include a daily fuel/idle follow-up log. On the PTA Dispatch
page, click "Export shift transition" to download a dated text handoff containing:

- All PTA truck notes saved today
- High fuel-cost drivers
- Each included driver's daily, 7-day, and 28-day idle percentages
- Driver follow-up notes saved today

PTA and driver notes remain local to that browser. Export the transition before
moving to another computer or browser profile.
