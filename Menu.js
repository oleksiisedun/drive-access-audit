/**
 * Simple trigger: adds the "More... ⭐️" custom menu when the spreadsheet
 * opens, with a shortcut to run the access audit on demand.
 * @returns {void}
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('More... ⭐️')
    .addItem('Run access audit', 'auditAccessAndReport')
    .addToUi();
}
