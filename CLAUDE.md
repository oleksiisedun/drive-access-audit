# Drive Access Audit

Google Apps Script project, container-bound to a Google Sheet, deployed with `clasp`. All `.js` files share one global scope (Apps Script has no module system) — the split across files is organizational only, not a dependency boundary, so name things to avoid collisions.

## Spreadsheet contract (external, not derivable from code)

**Handbook sheet** — three independent, row-aligned-within-themselves column groups: `A2:A`/`B2:B` account name+email pairs, `D2:D`/`E2:E` doc name+ID pairs, `G2:G` a flat notification-email list. Column positions are defined in `Config.js` (`HANDBOOK_COLUMNS`).

**Access sheet** — a matrix: `A2:A` account names (rows), `B1:1` doc names (header columns), body cells `R`/`W`/blank meaning expected view/edit/no access. Layout constants live in `Config.js` (`ACCESS_SHEET_LAYOUT`). A leftover `X` in a cell means the (now-removed) one-time migration was never run for it, or the row/column was added after migration — treat as a data anomaly (log and skip), never guess at intent.

## File responsibilities

- `Config.js` — sheet names, column layout, cell-value constants. Change this first if the sheet structure changes.
- `SheetHelpers.js` — all Handbook/Access reads and writes. Always batches (`getDataRange().getValues()` / one `setValues()` call) — never read or write a single cell in a loop, that's what makes this workable at matrix scale under Apps Script quotas.
- `DriveAccessHelpers.js` — `buildAllDocAccessCaches()` fetches each doc's real access exactly once per audit run (keyed by normalized doc name), not once per account/doc cell.
- `Audit.js` — `collectAccessMismatches()` (pure detection, returns an array) and `auditAccessAndReport()` (trigger-ready entry point). Sends the mismatch report whenever mismatches exist; otherwise sends a once-per-calendar-day "all clear" heartbeat, tracked via `PropertiesService` (`getTodayDateKey()`/`hasReportedToday()`/`markReportedToday()`, keyed by `AUDIT_STATE_KEYS.LAST_REPORT_DATE`).
- `EmailReport.js` — HTML + plain-text formatting and the `MailApp.sendEmail` calls: `sendMismatchReportEmail()` for drift, `sendAllClearEmail()` for the daily heartbeat.
- `Menu.js` — `onOpen()` simple trigger adding the "More... ⭐️" custom menu (Run access audit → `auditAccessAndReport`) to the spreadsheet UI.

## Known gotchas

`DriveApp.getFileById(id).getEditors()` does **not** include the file owner — Drive treats ownership as a separate permission role from "writer". `buildAllDocAccessCaches()` explicitly folds `file.getOwner()` into the `editors` set to compensate; if this is ever refactored, keep that merge or owners will silently read as having no access.

The four mismatch `type` strings (`'extra'`, `'revoked'`, `'role-mismatch'`, `'unknown-accessor'`) are hardcoded literals in `Audit.js` (where they're pushed onto the `mismatches` array) and separately as keys in `EmailReport.js`'s `MISMATCH_TYPE_LABELS`. Nothing enforces they stay in sync — adding or renaming a type in `Audit.js` without updating `MISMATCH_TYPE_LABELS` prints `undefined` in the email report instead of erroring.

`auditAccessAndReport()`'s once-daily heartbeat is tracked by a single Script Property (`lastReportDate`), shared script-wide (not per-user, not per-sheet). It resets naturally at local midnight in the project's configured time zone (`Europe/Kyiv`, per `appsscript.json`) — no cleanup job needed. To force-retest the all-clear path within the same day, clear it manually: Apps Script editor → Project Settings → Script Properties, or run `PropertiesService.getScriptProperties().deleteProperty('lastReportDate')` once from the editor.

## Operational setup

`auditAccessAndReport` is invoked in production by a time-based trigger set up manually via the Apps Script Triggers UI (a few times a day) — this wiring lives outside the codebase entirely, not in any `.js` file. Don't add trigger-creation code (e.g. `ScriptApp.newTrigger`) unless explicitly asked.

The report email addresses all of `Handbook!G2:G` in a single comma-joined `To:` field (see `EmailReport.js`), not `Bcc:` — this was a deliberate choice, not an oversight. Don't switch to Bcc without checking with the user first.

The daily heartbeat exists so *silence* is the dead-trigger signal, not a false "all clear". If the trigger stops firing entirely, no email arrives at all — neither a mismatch report nor a heartbeat — since nothing runs to update `lastReportDate` or send anything. That silence is the intended failure signature, not a residual bug to fix.

## Verification

There's no automated test suite, and `DriveApp`/`SpreadsheetApp`/`MailApp` can't run outside the Apps Script runtime. `node --check <file>.js` only catches JS syntax errors locally. To actually verify a change: run the relevant function manually from the Apps Script editor's function dropdown (after `clasp push`, with the user's confirmation) and check the Executions log for errors and `Logger.log` output.

Any change touching `writeAccessMatrixValues()` (i.e. anything that writes real cells in the Access sheet) should be tested against a scratch copy of the spreadsheet first, not production — Sheets' undo/version history is the only safety net for a bad write.

## Conventions

Everything here follows the global CLAUDE.md JS/JSDoc conventions (plain `.js`, so every function needs typed `@param`/`@returns`). Emails and account/doc names are normalized (`trim().toLowerCase()`) via `normalizeEmail`/`normalizeKey` in `SheetHelpers.js` before any comparison or Map lookup — Drive API casing doesn't always match what's typed in the sheet, so skipping normalization anywhere reintroduces false mismatches.
