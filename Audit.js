// RECURRING AUDIT — wire auditAccessAndReport() to a time-based trigger via
// the Apps Script Triggers UI (few times a day).

/**
 * @typedef {{ type: 'extra'|'revoked'|'role-mismatch'|'unknown-accessor',
 *             docName: string, accountName: string|null, email: string,
 *             expected: string, actual: string }} AccessMismatch
 */

/**
 * Compares the Access sheet matrix against real Drive access for every doc
 * referenced in its header, across four drift categories: extra access
 * (blank cell but real access), revoked access (R/W cell but no real
 * access), role mismatch (R vs W disagree), and unknown accessors (real
 * editors/viewers with no matching Access-sheet row). Leftover 'X' cells and
 * doc-level failures (unresolvable name, DriveApp error) are logged and
 * skipped rather than guessed at. Pure detection — no email side effect.
 * @returns {AccessMismatch[]}
 */
function collectAccessMismatches() {
  const { docNames, accountNames, matrix } = readAccessSheet();
  const { byName: accountEmailsByName, byEmail: accountNamesByEmail } = getHandbookAccounts();
  const docIdsByName = getHandbookDocIds();
  const docAccessCaches = buildAllDocAccessCaches(docNames, docIdsByName);

  const mismatches = [];

  docNames.forEach((docName, col) => {
    if (!docName) return;
    const cache = docAccessCaches.get(normalizeKey(docName));
    if (!cache || cache.status !== 'ok') return; // doc-level failure already logged once

    const matchedEmails = new Set();

    accountNames.forEach((accountName, row) => {
      if (!accountName) return;

      const email = accountEmailsByName.get(normalizeKey(accountName));
      if (!email) {
        Logger.log(
          `Unresolvable account name "${accountName}" in Access sheet row ${row + ACCESS_SHEET_LAYOUT.FIRST_DATA_ROW}`
        );
        return;
      }

      const normalizedEmail = normalizeEmail(email);
      matchedEmails.add(normalizedEmail);

      const expected = matrix[row][col] || '';
      if (expected === ACCESS_LEVEL.PENDING) {
        Logger.log(`Leftover 'X' cell for "${accountName}" on "${docName}" — run the migration or fix manually; skipping.`);
        return;
      }

      const actualLevel = getAccessLevel(email, cache);

      if (!expected) {
        if (actualLevel) {
          mismatches.push({ type: 'extra', docName, accountName, email, expected: '(none)', actual: actualLevel });
        }
        return;
      }

      if (!actualLevel) {
        mismatches.push({ type: 'revoked', docName, accountName, email, expected, actual: '(none)' });
      } else if (actualLevel !== expected) {
        mismatches.push({ type: 'role-mismatch', docName, accountName, email, expected, actual: actualLevel });
      }
    });

    const allAccessors = new Map();
    cache.editors.forEach((email) => allAccessors.set(email, ACCESS_LEVEL.WRITE));
    cache.viewers.forEach((email) => {
      if (!allAccessors.has(email)) allAccessors.set(email, ACCESS_LEVEL.READ);
    });

    allAccessors.forEach((level, email) => {
      if (matchedEmails.has(email)) return;
      const knownAccountName = accountNamesByEmail.get(email) ?? null;
      mismatches.push({
        type: 'unknown-accessor',
        docName,
        accountName: knownAccountName,
        email,
        expected: '(no row)',
        actual: level,
      });
    });
  });

  return mismatches;
}

/**
 * Returns today's date key (yyyy-MM-dd) in the script's configured time
 * zone, used to key the once-per-day "all clear" heartbeat state.
 * @returns {string}
 */
function getTodayDateKey() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Whether an audit email (mismatch report or all-clear heartbeat) has
 * already been sent today, per the persisted lastReportDate script
 * property. Reads false on the very first run ever (no property set yet).
 * @returns {boolean}
 */
function hasReportedToday() {
  const lastReportDate = PropertiesService.getScriptProperties().getProperty(
    AUDIT_STATE_KEYS.LAST_REPORT_DATE
  );
  return lastReportDate === getTodayDateKey();
}

/**
 * Records that an audit email was sent today, so later runs the same day
 * skip sending a redundant one.
 * @returns {void}
 */
function markReportedToday() {
  PropertiesService.getScriptProperties().setProperty(
    AUDIT_STATE_KEYS.LAST_REPORT_DATE,
    getTodayDateKey()
  );
}

/**
 * Trigger-ready entry point: runs the audit and emails Handbook!G2:G.
 * Sends the mismatch report whenever mismatches are found. When none are
 * found, sends a once-per-calendar-day "all clear" heartbeat instead, so a
 * silently-broken trigger (or a run that erroneously finds nothing) doesn't
 * look identical to "everything's fine" — but only the first no-mismatch
 * run of the day emails; later same-day runs stay silent. A mismatch-report
 * email already proves the script ran, so that path also marks the day as
 * reported and suppresses a separate heartbeat.
 * @returns {void}
 */
function auditAccessAndReport() {
  const mismatches = collectAccessMismatches();

  if (mismatches.length === 0) {
    if (hasReportedToday()) {
      Logger.log('Access audit: no mismatches found; all-clear already sent today.');
      return;
    }
    Logger.log('Access audit: no mismatches found — sending all-clear heartbeat.');
    sendAllClearEmail();
    markReportedToday();
    return;
  }

  Logger.log(`Access audit: ${mismatches.length} mismatch(es) found — sending report.`);
  sendMismatchReportEmail(mismatches);
  markReportedToday();
}
