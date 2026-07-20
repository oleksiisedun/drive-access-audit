# Drive Access Audit

A Google Apps Script utility that audits who actually has access to a set of tracked Google Drive documents, cross-referenced against an access matrix maintained by hand in the Sheet.

## Spreadsheet contract

**Handbook sheet** — three independent, row-aligned-within-themselves column groups:
- `A2:A` account names / `B2:B` emails (paired by row)
- `D2:D` doc names / `E2:E` doc IDs (paired by row)
- `G2:G` notification emails (flat list of audit-report recipients)

**Access sheet** — a matrix:
- `A2:A` account names (rows), `B1:1` doc names (header row/columns)
- Body cells: `R` (view-only access expected), `W` (edit access expected), or blank (no access expected)

The matrix started out filled with a placeholder `X` in every cell that expected some access. A one-time migration script (since run and removed) resolved each `X` against real Drive permissions and replaced it with `R` or `W`; the matrix is now maintained by hand going forward.

## Architecture

Reading the sheets and reading real Drive access are both handled by dedicated helper modules so the audit logic itself only deals with already-normalized data. `SheetHelpers.js` batches all Handbook/Access sheet reads and writes (never per-cell). `DriveAccessHelpers.js` fetches each doc's editors/viewers exactly once per audit run — regardless of how many accounts reference that doc — and folds the file owner into the editor set, since `DriveApp`'s `getEditors()` does not include the owner by default. `Audit.js` compares the Access sheet matrix against that real-access cache and classifies drift into four categories (extra access, revoked access, role mismatch, unknown accessor); `EmailReport.js` formats and sends the result via `MailApp` to everyone in `Handbook!G2:G`. A mismatch report is sent every run that finds drift. When a run finds none, `Audit.js` sends a once-per-calendar-day "all clear" heartbeat instead — tracked via a `PropertiesService` script property — so repeated same-day trigger runs don't spam an inbox, but the maintainer still gets daily proof the trigger is alive even when there's nothing to report. `Menu.js` adds a "More... ⭐️" custom menu on spreadsheet open, letting a user trigger `auditAccessAndReport()` on demand alongside the scheduled trigger.

```mermaid
graph TD
  Handbook[("Handbook sheet\naccounts, docs, notify emails")]
  AccessSheet[("Access sheet\nR/W matrix")]
  Drive[("Drive API\nDriveApp")]

  subgraph Helpers["Shared helpers"]
    SheetHelpers["SheetHelpers.js\nread/write sheet data"]
    DriveAccessHelpers["DriveAccessHelpers.js\nper-doc access cache\n(editors + viewers + owner)"]
  end

  subgraph Audit["Audit.js"]
    Collect["collectAccessMismatches()"]
    Report["auditAccessAndReport()"]
  end

  Props[("Script Properties\nlastReportDate")]
  EmailReport["EmailReport.js\nsendMismatchReportEmail()\nsendAllClearEmail()"]
  MailApp[("MailApp\nnotification emails")]
  Menu["Menu.js\nonOpen()\n\"More... ⭐️\" menu"]
  User(["Spreadsheet user"])

  Handbook --> SheetHelpers
  AccessSheet --> SheetHelpers
  Drive --> DriveAccessHelpers
  SheetHelpers --> Collect
  DriveAccessHelpers --> Collect
  Collect --> Report
  Report <--> Props
  Report --> EmailReport
  EmailReport --> MailApp
  User --> Menu
  Menu --> Report
```

## Usage

- **Run the recurring audit manually**: use the spreadsheet's "More... ⭐️" menu → "Run access audit", or run `auditAccessAndReport()` from the Apps Script editor. Inspect drift without sending anything via `collectAccessMismatches()`.
- **Schedule it**: in the Apps Script editor, open Triggers → Add Trigger → function `auditAccessAndReport`, time-driven, a few times a day.
- **When there are no mismatches**, you still get one "all clear" email per calendar day — the first no-mismatch run of the day. A heartbeat, so a silently-broken trigger doesn't look identical to "everything's fine." Later same-day no-mismatch runs stay silent, and a mismatch-report email on a given day also counts as that day's signal (no separate heartbeat follows).

## Development

```sh
clasp push   # deploy — always confirm with the user first, never automatic
node --check <File>.js   # quick syntax check (Apps Script globals like DriveApp aren't defined locally, so this only catches syntax errors)
```
