# Submittal Tracker

A web app for tracking entitlement, plan check and agency submittals across land development projects (City of Ontario and other Inland Empire jurisdictions).

It runs in the browser and has no build step, server or dependencies.

## Run it

- **Locally:** open `index.html` in Chrome, Edge, Safari or Firefox. Data is saved in that browser's local storage.
- **Hosted:** in GitHub, go to *Settings → Pages* and deploy from the branch root. Data is still stored per browser.
- **As a claude.ai artifact:** run `node tools/build-artifact.mjs` to write `dist/submittal-tracker.html`, a single file without the document wrapper. When it's published with the `db` and `downloads` capabilities, data is stored in the artifact's database, so it follows you across devices.

On first run in local mode the app loads your six active projects (Bosma, The District, Rich Haven PA1, Pietersma Commercial, Randall South Commercial, Rais Devries) with the standard phases and no submittals. **Settings → Add my starter projects** restores any that are missing.

## How it's organized

```
Project → Phase → Package → Submittal → Review cycles
```

- **Projects** have a name, case/map numbers, jurisdiction, type and internal lead. New projects start with these phases: Entitlement, Design / Plan Check, Final Map & Recordation, Bonds & Agreements, Permits / Construction and Close-out. You can rename, reorder, add or delete phases on each project.
- **Packages** group related submittals inside a phase, for example "Rough Grading 1st Submittal".
- **Submittals** have a status, a ball in court (Us / Consultant / Agency), parties, a tracking number, priority, fees, a next action, notes, file links and an activity log.
- **Review cycles** (1st, 2nd, 3rd…) each record the date submitted, the turnaround in days, the due-back date and the date comments came back, plus a comment summary. The due-back date is calculated, but you can override it. The current (last) cycle drives the status and dates:
  - Entering a submitted date on an unsent cycle sets the status to *Submitted* and the ball to *Agency*.
  - Entering a comments-received date sets the status to *Comments Received* and the ball to *Us*.
  - **Log resubmittal** starts the next cycle today and carries over the previous turnaround.

## Views

- **Dashboard:** counts by status, overdue reviews, items in your court and the consultant's, stale items, reviews due back this week and next, upcoming next actions, and progress by project.
- **Submittals (table):** search, filters, quick-filter chips, grouping (project, phase, package, agency, status, ball in court, discipline), sortable columns and a column picker. Select rows to bulk-edit status, ball in court or priority, move them to a phase or package, log resubmittals, duplicate or delete.
- **Board:** a kanban by status. Drag a card to change its status.
- **Timeline:** a Gantt chart by Project, then Phase, then Package, then Submittal, with a red line at today. Each row shows:
  - **Actual history** as solid bars: prep (gray), agency review (blue), past-due review (red), and time with us or the consultant (amber).
  - **Forecast** as hatched bars, running to an approval diamond (green once approved, red outline if later than target).
  - **Target window** as a thin bar underneath. Drag it to move the dates, or drag its end to change only the target approval.
  - **Baseline** as a gray line. Use **Baseline…** to freeze the current plan so you can measure slip later.
  - **Summary rows** that roll up the date span, % approved and the latest target.

  Zoom by days, weeks, months or quarters. You can also show only items forecast later than their target, or only items that have slipped against the baseline.
- **Projects:** each project shows its phases, then packages, then submittals in collapsible sections, with % approved per phase and per package. Packages can be duplicated, saved as templates or filled from a template.
- **Templates:** seven built-in package templates (Standard Plan Check Set, Rough Grading 1st Submittal, Wet Utility Plans, Dry Utility Design, Final Map Package, Bonds & Agreements, Entitlement Application). You can also save your own.

## Scheduling and forecasting

Each submittal can carry:

- **Target submittal** and **Target approval** dates (your plan). If you leave target approval blank, it is calculated: target submittal + planned cycles × turnaround + resubmittal prep between cycles.
- **Planned review cycles**: how many rounds you expect (default 2).
- **Review days by cycle** (for example `35, 28, 28`) and **Response days after each cycle** (for example `21, 14`). These are optional per submittal; defaults can be set in Settings.
- A **Routed** date on each review cycle. The due-back clock starts when the city routes the plans, not on the submittal date. The time between submittal and routing shows as intake on the timeline.
- **Starts after**: predecessor submittals (finish-to-start). For example, the Final Map can wait for Rough Grading approval. The app blocks links that would create a loop.

The **forecast** is recalculated from actual review dates:

| Where it is now | Forecast |
| --- | --- |
| With the agency | Comes back on its due-back date, or today if overdue. Then a resubmittal prep gap and another review for each planned cycle left. |
| Comments back with us or the consultant | Resubmitted after the resubmittal prep days (or today if that has passed). Then reviews for the remaining planned cycles. |
| Not yet submitted | Submitted on the target submittal date (or today + prep days, or when predecessors are approved, whichever is later). Then the planned cycles. |
| Approved | Uses the actual approval date. |
| On hold | No forecast. |

The table's **Approval forecast** column, the **Forecast late** quick filter, dashboard panels, phase headers and project stats all use the same forecast. Set targets one at a time in the submittal editor, for several selected rows (**Set targets…** in the bulk bar), or for a whole package from its ⋯ menu. Use the stagger option there to space submittals a few days apart. Planned cycles, resubmittal prep days and default prep time are in Settings.

## Flags and aging

- **Overdue:** a review is still with the agency and past its due-back date. The row gets a red edge and a "⚠ Nd overdue" label.
- **Stale:** an item has been in our court or the consultant's longer than the threshold, which defaults to 7 days and can be changed in Settings.
- Rows also show days in the current status, days in the current court, and total days since the first submittal.

Every flag and status uses a text label and a glyph alongside its color.

## Data

- **Export:** an Excel workbook (Submittals, Review Cycles and Projects sheets), a submittals CSV (the current filtered view or everything) and a review cycles CSV.
- **Import CSV:** uses the same columns as the export. A row whose ID matches an existing submittal updates it; other rows are added. Missing projects, phases and packages are created. You see a preview before anything is written, and you can undo the import afterward.
- **Backup / restore:** a JSON file holding every record. Local mode keeps data in one browser only, so download backups regularly.

Most destructive or bulk actions can be undone from the toast that appears afterward.

## Keyboard

| Key | Action |
| --- | --- |
| `N` | New submittal |
| `/` | Search |
| `Esc` | Close a panel or dialog |
| `Ctrl/⌘ + Enter` | Save & add another (New submittal) |

## Code map

| File | Purpose |
| --- | --- |
| `js/store.js` | State, persistence (local storage or artifact database), undo |
| `js/model.js` | Derived dates and flags, review-cycle rules, duplication, templates |
| `js/schedule.js` | Targets, forecast to approval, baseline variance, predecessors |
| `js/constants.js` | Statuses, disciplines, agencies, phases, built-in templates, starter projects |
| `js/io.js` | CSV/XLSX/JSON import and export |
| `js/xlsx.js` | Dependency-free .xlsx writer |
| `js/forms.js` | Quick-add form and submittal editor |
| `js/views/*.js` | Dashboard, table, board, projects, templates, settings |
