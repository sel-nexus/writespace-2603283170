/** Manage explicitly activated administrator account changes without exposing credentials. */
import { getSession } from './auth.js';
import { getUsers, saveUsers } from './storage.js';

/**
 * @typedef {import('./auth.js').UserView} UserView
 * @typedef {{ok:true, value:UserView|string}|{ok:false, reason:'validation'|'duplicate_username'|'not_found'|'forbidden'|'cancelled'|'id_unavailable'|'storage_write_failed'}} MutationResult
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Project only public account fields, excluding passwords and additional data.
 * Args:
 *   user (import('./storage.js').User): Validated stored record.
 * Returns:
 *   {UserView} Password-free display record.
 */
export function userView(user) {
  const { id, displayName, username, role, createdAt } = user;
  return { id, displayName, username, role, createdAt };
}

/**
 * Read password-free stored accounts alongside the synthetic built-in identity.
 * Returns:
 *   {UserView[]} Display records; the built-in account has no creation timestamp.
 * Notes:
 *   Never persists the built-in identity or repairs storage.
 */
export function getUserViews() {
  return [
    { id: 'admin', displayName: 'Admin', username: 'admin', role: 'admin', createdAt: '' },
    ...getUsers().map(userView),
  ];
}

/**
 * Reject deletion of built-in and current accounts or ineligible identities.
 * Args:
 *   session (import('./auth.js').Session|null): Validated identity.
 *   id (string): Target account id.
 * Returns:
 *   {boolean} Eligibility only; callers must resolve the current session again.
 */
export function canDeleteUser(session, id) {
  return Boolean(session?.role === 'admin' && typeof id === 'string' && id
    && id !== 'admin' && id !== session.userId);
}

/**
 * Validate and append a browser-local account on explicit submission.
 * Args:
 *   fields (object): Required displayName, username, password and exact admin/user role.
 * Returns:
 *   {MutationResult} Password-free value after persistence or a safe failure.
 * Notes:
 *   Ignores supplied identity and metadata; UUID and ISO time are generated only here.
 */
export function createUser(fields) {
  if (!fields || !['displayName', 'username', 'password', 'role'].every(key =>
    typeof fields[key] === 'string' && fields[key].trim().length > 0)
    || !['admin', 'user'].includes(fields.role)) {
    return { ok: false, reason: 'validation' };
  }
  if (getSession()?.role !== 'admin') return { ok: false, reason: 'forbidden' };
  const users = getUsers();
  if (fields.username === 'admin' || users.some(user => user.username === fields.username)) {
    return { ok: false, reason: 'duplicate_username' };
  }
  let id;
  try {
    id = window.crypto.randomUUID();
    if (typeof id !== 'string' || !UUID.test(id)
      || users.some(user => user.id.toLowerCase() === id.toLowerCase())) {
      return { ok: false, reason: 'id_unavailable' };
    }
  } catch {
    return { ok: false, reason: 'id_unavailable' };
  }
  const user = {
    id, displayName: fields.displayName, username: fields.username, password: fields.password,
    role: fields.role, createdAt: new Date().toISOString(),
  };
  if (!saveUsers([...users, user]).ok) return { ok: false, reason: 'storage_write_failed' };
  return { ok: true, value: userView(user) };
}

/**
 * Confirm an eligible account deletion and reauthorize against current storage before writing.
 * Args:
 *   fields (object): Target id; supplied session or confirmation flags are ignored.
 * Returns:
 *   {MutationResult} Removed id only after persistence, or a safe failure.
 * Notes:
 *   Cancellation makes no write; unrelated changes during confirmation are retained.
 */
export function deleteUser(fields) {
  let session = getSession();
  const id = fields?.id;
  if (!session || session.role !== 'admin' || id === 'admin' || id === session.userId) {
    return { ok: false, reason: 'forbidden' };
  }
  let users = getUsers();
  if (!users.some(user => user.id === id)) return { ok: false, reason: 'not_found' };
  if (!window.confirm('Delete this user? This cannot be undone.')) return { ok: false, reason: 'cancelled' };
  session = getSession();
  users = getUsers();
  if (!canDeleteUser(session, id)) return { ok: false, reason: 'forbidden' };
  if (!users.some(user => user.id === id)) return { ok: false, reason: 'not_found' };
  if (!saveUsers(users.filter(user => user.id !== id)).ok) return { ok: false, reason: 'storage_write_failed' };
  return { ok: true, value: id };
}
