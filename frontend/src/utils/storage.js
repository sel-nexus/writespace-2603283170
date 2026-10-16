/** Read browser-local collections without repair, and report explicit replacement-write outcomes. */

/**
 * @typedef {{id:string, title:string, content:string, createdAt:string, authorId:string, authorName:string}} Post
 * @typedef {{id:string, displayName:string, username:string, password:string, role:'admin'|'user', createdAt:string}} User
 * @typedef {{ok:true}|{ok:false, reason:'unavailable'|'quota'|'serialization'|'unknown'}} StorageWriteResult
 */

const POST_KEY = 'writespace_posts';
const USER_KEY = 'writespace_users';
const POST_FIELDS = ['id', 'title', 'content', 'createdAt', 'authorId', 'authorName'];
const USER_FIELDS = ['id', 'displayName', 'username', 'password', 'role', 'createdAt'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/**
 * Reject empty or whitespace-only fields without changing the stored string.
 * Args:
 *   value (unknown): Field to inspect.
 * Returns:
 *   {boolean} Whether the field is a usable string.
 */
function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Require an ISO date or zoned timestamp with a real calendar date.
 * Args:
 *   value (unknown): Stored creation time.
 * Returns:
 *   {boolean} Whether parsing is safe without accepting locale dates or calendar rollover.
 */
function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1]) return false;
  if (hour !== undefined) {
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return false;
    if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

/**
 * Check a record's exact fields before inspecting its values.
 * Args:
 *   record (unknown): Parsed JSON member.
 *   fields (string[]): Required persisted fields.
 * Returns:
 *   {boolean} Whether a plain object matches the record schema.
 */
function hasFields(record, fields) {
  return record !== null
    && typeof record === 'object'
    && Object.getPrototypeOf(record) === Object.prototype
    && Object.keys(record).length === fields.length
    && fields.every(field => Object.hasOwn(record, field));
}

/**
 * Validate every member and collection-wide uniqueness, never filtering malformed entries.
 * Args:
 *   value (unknown): Parsed collection.
 *   kind ('posts'|'users'): Schema to apply.
 * Returns:
 *   {boolean} Whether the entire array is usable.
 */
function isCollection(value, kind) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  const usernames = new Set();
  const fields = kind === 'posts' ? POST_FIELDS : USER_FIELDS;
  return value.every(record => {
    if (!hasFields(record, fields) || !fields.every(field => isNonEmpty(record[field]))) return false;
    if (!UUID.test(record.id) || !isIsoDate(record.createdAt)) return false;
    const canonicalId = record.id.toLowerCase();
    if (ids.has(canonicalId)) return false;
    ids.add(canonicalId);
    if (kind === 'users') {
      if (record.role !== 'admin' && record.role !== 'user') return false;
      if (record.username === 'admin' || usernames.has(record.username)) return false;
      usernames.add(record.username);
    }
    return true;
  });
}

/**
 * Read one key with an isolated fallback across storage acquisition, parsing, and validation.
 * Args:
 *   key (string): Collection key.
 *   kind ('posts'|'users'): Required schema.
 * Returns:
 *   {Post[]|User[]} Valid records or an empty array; never repairs or throws.
 */
function readCollection(key, kind) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const value = JSON.parse(raw);
    return isCollection(value, kind) ? value : [];
  } catch {
    return [];
  }
}

/**
 * Serialize and replace one collection only after safely acquiring browser storage.
 * Args:
 *   key (string): Collection key.
 *   value (Post[]|User[]): Full replacement supplied by a validated mutation.
 * Returns:
 *   {StorageWriteResult} Success only after setItem succeeds; never exposes records or exceptions.
 * Notes:
 *   Domain validation belongs to explicit mutation handlers. No repair or automatic retry occurs here.
 */
function writeCollection(key, value) {
  let storage;
  try {
    storage = window.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return { ok: false, reason: 'serialization' };
  } catch {
    return { ok: false, reason: 'serialization' };
  }
  try {
    storage.setItem(key, serialized);
    return { ok: true };
  } catch (error) {
    if (error?.name === 'QuotaExceededError') return { ok: false, reason: 'quota' };
    if (['SecurityError', 'NotAllowedError', 'InvalidStateError'].includes(error?.name)) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * Read only the posts collection with a safe whole-array fallback.
 * Returns:
 *   {Post[]} Valid posts or an empty array, without throwing or writing.
 */
export function getPosts() {
  return readCollection(POST_KEY, 'posts');
}

/**
 * Replace persisted posts after an explicit caller-validated mutation.
 * Args:
 *   posts (Post[]): Full replacement collection.
 * Returns:
 *   {StorageWriteResult} Explicit persistence outcome.
 */
export function savePosts(posts) {
  return writeCollection(POST_KEY, posts);
}

/**
 * Read only registered users with a safe whole-array fallback.
 * Returns:
 *   {User[]} Valid users or an empty array; plaintext passwords are for credential checks, not display.
 */
export function getUsers() {
  return readCollection(USER_KEY, 'users');
}

/**
 * Replace registered users after an explicit caller-validated mutation.
 * Args:
 *   users (User[]): Full replacement collection, including local demo passwords.
 * Returns:
 *   {StorageWriteResult} Explicit persistence outcome without echoing credentials.
 */
export function saveUsers(users) {
  return writeCollection(USER_KEY, users);
}
