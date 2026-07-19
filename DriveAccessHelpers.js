/**
 * @typedef {{ status: 'ok', docId: string, editors: Set<string>, viewers: Set<string> }
 *          |{ status: 'unresolved' }
 *          |{ status: 'error', docId: string, error: string }} DocAccessCacheEntry
 */

/**
 * Resolves real Drive access for every doc referenced in the Access sheet
 * header, fetching editors/viewers exactly once per doc (never once per
 * account/doc cell) to stay within Drive quota. Unresolvable doc names and
 * DriveApp errors are logged once here rather than once per cell.
 * @param {string[]} docNames
 * @param {Map<string,string>} docIdsByName normalized doc name -> doc ID
 * @returns {Map<string, DocAccessCacheEntry>} keyed by normalizeKey(docName)
 */
function buildAllDocAccessCaches(docNames, docIdsByName) {
  const caches = new Map();

  docNames.forEach((docName) => {
    if (!docName) return;
    const key = normalizeKey(docName);
    if (caches.has(key)) return;

    const docId = docIdsByName.get(key);
    if (!docId) {
      Logger.log(`Unresolvable doc name "${docName}" in Access sheet header — not found in Handbook D:E`);
      caches.set(key, { status: 'unresolved' });
      return;
    }

    try {
      const file = DriveApp.getFileById(docId);
      const editors = new Set(file.getEditors().map((user) => normalizeEmail(user.getEmail())));
      const viewers = new Set(file.getViewers().map((user) => normalizeEmail(user.getEmail())));

      // getEditors() only returns explicitly-granted editors — the file owner
      // is a separate permission role and is NOT included by default, even
      // though they have full write access. Fold them into editors so
      // getAccessLevel() resolves the owner to 'W' instead of "no access".
      const owner = file.getOwner();
      if (owner) {
        editors.add(normalizeEmail(owner.getEmail()));
      }

      caches.set(key, { status: 'ok', docId, editors, viewers });
    } catch (error) {
      Logger.log(`Could not read access for doc "${docName}" (${docId}): ${error.message}`);
      caches.set(key, { status: 'error', docId, error: error.message });
    }
  });

  return caches;
}

/**
 * Resolves a person's access level for a doc from its cache entry.
 * @param {string} email
 * @param {DocAccessCacheEntry} docCacheEntry
 * @returns {'W'|'R'|null}
 */
function getAccessLevel(email, docCacheEntry) {
  if (!docCacheEntry || docCacheEntry.status !== 'ok') return null;

  const normalizedEmail = normalizeEmail(email);
  if (docCacheEntry.editors.has(normalizedEmail)) return ACCESS_LEVEL.WRITE;
  if (docCacheEntry.viewers.has(normalizedEmail)) return ACCESS_LEVEL.READ;
  return null;
}
