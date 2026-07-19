const MISMATCH_TYPE_LABELS = {
  extra: 'Extra access',
  revoked: 'Revoked access',
  'role-mismatch': 'Role mismatch',
  'unknown-accessor': 'Unknown accessor',
};

/**
 * Escapes text for safe inclusion in an HTML email body.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the HTML body for the mismatch report email, grouped by doc.
 * @param {AccessMismatch[]} mismatches
 * @returns {string}
 */
function buildMismatchReportHtml(mismatches) {
  const countsByType = mismatches.reduce((counts, mismatch) => {
    counts[mismatch.type] = (counts[mismatch.type] ?? 0) + 1;
    return counts;
  }, {});

  const summary = Object.keys(MISMATCH_TYPE_LABELS)
    .filter((type) => countsByType[type])
    .map((type) => `${countsByType[type]} ${MISMATCH_TYPE_LABELS[type].toLowerCase()}`)
    .join(', ');

  const mismatchesByDoc = new Map();
  mismatches.forEach((mismatch) => {
    if (!mismatchesByDoc.has(mismatch.docName)) mismatchesByDoc.set(mismatch.docName, []);
    mismatchesByDoc.get(mismatch.docName).push(mismatch);
  });

  const tableStyle = 'border-collapse: collapse; margin-bottom: 24px;';
  const cellStyle = 'border: 1px solid #ccc; padding: 4px 8px; text-align: left;';

  const docSections = Array.from(mismatchesByDoc.entries())
    .map(([docName, docMismatches]) => {
      const rows = docMismatches
        .map(
          (m) => `
            <tr>
              <td style="${cellStyle}">${escapeHtml(MISMATCH_TYPE_LABELS[m.type])}</td>
              <td style="${cellStyle}">${escapeHtml(m.accountName ?? '(unknown)')}</td>
              <td style="${cellStyle}">${escapeHtml(m.email)}</td>
              <td style="${cellStyle}">${escapeHtml(m.expected)}</td>
              <td style="${cellStyle}">${escapeHtml(m.actual)}</td>
            </tr>`
        )
        .join('');

      return `
        <h3>${escapeHtml(docName)}</h3>
        <table style="${tableStyle}">
          <tr>
            <th style="${cellStyle}">Type</th>
            <th style="${cellStyle}">Account</th>
            <th style="${cellStyle}">Email</th>
            <th style="${cellStyle}">Expected</th>
            <th style="${cellStyle}">Actual</th>
          </tr>
          ${rows}
        </table>`;
    })
    .join('');

  return `
    <p><strong>${mismatches.length} mismatch(es) across ${mismatchesByDoc.size} doc(s):</strong> ${escapeHtml(summary)}</p>
    ${docSections}`;
}

/**
 * Builds the plain-text fallback body for the mismatch report email.
 * @param {AccessMismatch[]} mismatches
 * @returns {string}
 */
function buildMismatchReportPlainText(mismatches) {
  const lines = mismatches.map(
    (m) =>
      `[${MISMATCH_TYPE_LABELS[m.type]}] ${m.docName} — ${m.accountName ?? '(unknown)'} <${m.email}>: expected ${m.expected}, actual ${m.actual}`
  );
  return `${mismatches.length} mismatch(es) found:\n\n${lines.join('\n')}`;
}

/**
 * Sends the mismatch report to every address in Handbook!G2:G.
 * @param {AccessMismatch[]} mismatches
 * @returns {void}
 */
function sendMismatchReportEmail(mismatches) {
  const recipients = getHandbookNotificationEmails();
  if (recipients.length === 0) {
    Logger.log('No notification emails configured in Handbook G2:G — skipping email.');
    return;
  }

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: `Drive access audit: ${mismatches.length} mismatch(es) found`,
    body: buildMismatchReportPlainText(mismatches),
    htmlBody: buildMismatchReportHtml(mismatches),
  });
}
