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

Reading the sheets and reading real Drive access are both handled by dedicated helper modules so the audit logic itself only deals with already-normalized data. `SheetHelpers.js` batches all Handbook/Access sheet reads and writes (never per-cell). `DriveAccessHelpers.js` fetches each doc's editors/viewers exactly once per audit run — regardless of how many accounts reference that doc — and folds the file owner into the editor set, since `DriveApp`'s `getEditors()` does not include the owner by default. `Audit.js` compares the Access sheet matrix against that real-access cache and classifies drift into four categories (extra access, revoked access, role mismatch, unknown accessor); `EmailReport.js` formats and sends the result via `MailApp` to everyone in `Handbook!G2:G`, only when mismatches are found.

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

  EmailReport["EmailReport.js\nformat + send"]
  MailApp[("MailApp\nnotification emails")]

  Handbook --> SheetHelpers
  AccessSheet --> SheetHelpers
  Drive --> DriveAccessHelpers
  SheetHelpers --> Collect
  DriveAccessHelpers --> Collect
  Collect --> Report
  Report --> EmailReport
  EmailReport --> MailApp
```

## Usage

- **Run the recurring audit manually**: run `auditAccessAndReport()` from the Apps Script editor, or inspect drift without sending anything via `collectAccessMismatches()`.
- **Schedule it**: in the Apps Script editor, open Triggers → Add Trigger → function `auditAccessAndReport`, time-driven, a few times a day.
- **No email is sent** when `collectAccessMismatches()` returns no mismatches — the job only makes noise when there's something to report.

## Development

```sh
clasp push   # deploy — always confirm with the user first, never automatic
node --check <File>.js   # quick syntax check (Apps Script globals like DriveApp aren't defined locally, so this only catches syntax errors)
```
