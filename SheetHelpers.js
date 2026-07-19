/**
 * Lower-cases and trims an email address so lookups are insensitive to
 * casing/whitespace differences between the sheet and Drive's API.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return email.toString().trim().toLowerCase();
}

/**
 * Lower-cases and trims a free-text key (account or doc name) for lookups.
 * @param {string} value
 * @returns {string}
 */
function normalizeKey(value) {
  return value.toString().trim().toLowerCase();
}

/**
 * Gets a sheet by name, throwing a clear error if it's missing.
 * @param {string} sheetName
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheetByName(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }
  return sheet;
}

/**
 * Reads the Handbook account name/email pairs (columns A/B) into lookup maps.
 * @returns {{ byName: Map<string,string>, byEmail: Map<string,string> }}
 *   byName: normalized account name -> normalized email
 *   byEmail: normalized email -> original account name
 */
function getHandbookAccounts() {
  const values = getSheetByName(SHEET_NAMES.HANDBOOK).getDataRange().getValues();
  const byName = new Map();
  const byEmail = new Map();

  for (let i = 1; i < values.length; i++) {
    const name = values[i][HANDBOOK_COLUMNS.ACCOUNT_NAME - 1];
    const email = values[i][HANDBOOK_COLUMNS.ACCOUNT_EMAIL - 1];
    if (!name || !email) continue;

    const normalizedEmail = normalizeEmail(email);
    byName.set(normalizeKey(name), normalizedEmail);
    byEmail.set(normalizedEmail, name.toString().trim());
  }

  return { byName, byEmail };
}

/**
 * Reads the Handbook doc name/ID pairs (columns D/E) into a lookup map.
 * @returns {Map<string,string>} normalized doc name -> doc ID
 */
function getHandbookDocIds() {
  const values = getSheetByName(SHEET_NAMES.HANDBOOK).getDataRange().getValues();
  const docIds = new Map();

  for (let i = 1; i < values.length; i++) {
    const docName = values[i][HANDBOOK_COLUMNS.DOC_NAME - 1];
    const docId = values[i][HANDBOOK_COLUMNS.DOC_ID - 1];
    if (!docName || !docId) continue;

    docIds.set(normalizeKey(docName), docId.toString().trim());
  }

  return docIds;
}

/**
 * Reads the Handbook notification email list (column G).
 * @returns {string[]} deduplicated, trimmed email addresses
 */
function getHandbookNotificationEmails() {
  const values = getSheetByName(SHEET_NAMES.HANDBOOK).getDataRange().getValues();
  const emails = new Set();

  for (let i = 1; i < values.length; i++) {
    const email = values[i][HANDBOOK_COLUMNS.NOTIFICATION_EMAIL - 1];
    if (!email) continue;
    emails.add(email.toString().trim());
  }

  return Array.from(emails);
}

/**
 * Reads the Access sheet's doc-name header row, account-name column, and the
 * matrix body in a single range read.
 * @returns {{ sheet: GoogleAppsScript.Spreadsheet.Sheet, docNames: string[],
 *             accountNames: string[], matrix: string[][] }}
 */
function readAccessSheet() {
  const sheet = getSheetByName(SHEET_NAMES.ACCESS);
  const values = sheet.getDataRange().getValues();

  const headerRow = values[ACCESS_SHEET_LAYOUT.HEADER_ROW - 1] ?? [];
  const docNames = headerRow.slice(ACCESS_SHEET_LAYOUT.HEADER_FIRST_DOC_COLUMN - 1);

  const accountNames = [];
  const matrix = [];
  for (let i = ACCESS_SHEET_LAYOUT.FIRST_DATA_ROW - 1; i < values.length; i++) {
    const row = values[i];
    accountNames.push(row[ACCESS_SHEET_LAYOUT.ACCOUNT_NAME_COLUMN - 1]);
    matrix.push(row.slice(ACCESS_SHEET_LAYOUT.HEADER_FIRST_DOC_COLUMN - 1));
  }

  return { sheet, docNames, accountNames, matrix };
}

/**
 * Writes the Access sheet matrix body back in a single range write.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[][]} matrix
 * @returns {void}
 */
function writeAccessMatrixValues(sheet, matrix) {
  if (matrix.length === 0 || matrix[0].length === 0) return;

  sheet
    .getRange(
      ACCESS_SHEET_LAYOUT.FIRST_DATA_ROW,
      ACCESS_SHEET_LAYOUT.HEADER_FIRST_DOC_COLUMN,
      matrix.length,
      matrix[0].length
    )
    .setValues(matrix);
}
