# Drive Access Audit

Google Apps Script project, container-bound to a Google Sheet, deployed with `clasp`. All `.js` files share one global scope (Apps Script has no module system) — the split across files is organizational only, not a dependency boundary, so name things to avoid collisions.

## Spreadsheet contract (external, not derivable from code)

**Handbook sheet** — three independent, row-aligned-within-themselves column groups: `A2:A`/`B2:B` account name+email pairs, `D2:D`/`E2:E` doc name+ID pairs, `G2:G` a flat notification-email list. Column positions are defined in `Config.js` (`HANDBOOK_COLUMNS`).

**Access sheet** — a matrix: `A2:A` account names (rows), `B1:1` doc names (header columns), body cells `R`/`W`/blank meaning expected view/edit/no access. Layout constants live in `Config.js` (`ACCESS_SHEET_LAYOUT`). A leftover `X` in a cell means the (now-removed) one-time migration was never run for it, or the row/column was added after migration — treat as a data anomaly (log and skip), never guess at intent.

## File responsibilities

- `Config.js` — sheet names, column layout, cell-value constants. Change this first if the sheet structure changes.
- `SheetHelpers.js` — all Handbook/Access reads and writes. Always batches (`getDataRange().getValues()` / one `setValues()` call) — never read or write a single cell in a loop, that's what makes this workable at matrix scale under Apps Script quotas.
- `DriveAccessHelpers.js` — `buildAllDocAccessCaches()` fetches each doc's real access exactly once per audit run (keyed by normalized doc name), not once per account/doc cell.
- `Audit.js` — `collectAccessMismatches()` (pure detection, returns an array) and `auditAccessAndReport()` (trigger-ready entry point; emails only when mismatches exist).
- `EmailReport.js` — HTML + plain-text formatting and the `MailApp.sendEmail` call.

## Known gotcha

`DriveApp.getFileById(id).getEditors()` does **not** include the file owner — Drive treats ownership as a separate permission role from "writer". `buildAllDocAccessCaches()` explicitly folds `file.getOwner()` into the `editors` set to compensate; if this is ever refactored, keep that merge or owners will silently read as having no access.

## Conventions

Everything here follows the global CLAUDE.md JS/JSDoc conventions (plain `.js`, so every function needs typed `@param`/`@returns`). Emails and account/doc names are normalized (`trim().toLowerCase()`) via `normalizeEmail`/`normalizeKey` in `SheetHelpers.js` before any comparison or Map lookup — Drive API casing doesn't always match what's typed in the sheet, so skipping normalization anywhere reintroduces false mismatches.
