/** Resolve browser-local identity without repair, and persist only explicitly activated identity changes. */
import { getUsers, saveUsers } from './storage.js';

/**
 * @typedef {{userId:string, username:string, displayName:string, role:'admin'|'user'}} Session
 * @typedef {import('./storage.js').StorageWriteResult} StorageWriteResult
 * @typedef {{ok:true, session:Session, navigateTo:'/admin'|'/blogs'}|{ok:false, reason:'invalid_credentials'|'storage_write_failed'}} AuthResult
 * @typedef {{id:string, displayName:string, username:string, role:'admin'|'user', createdAt:string}} UserView
 * @typedef {{ok:true, user:UserView, session:Session, navigateTo:'/blogs'}|{ok:false, reason:'validation'|'duplicate_username'|'storage_write_failed'}} RegistrationResult
 */
const SESSION_KEY = 'writespace_session';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const FIELDS = ['userId', 'username', 'displayName', 'role'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reject missing, non-string, or blank form and session fields without coercion.
 * Args:
 *   value (unknown): Candidate field.
 * Returns:
 *   {boolean} Whether the original string is usable.
 */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Project an account into its password-free session.
 * Args:
 *   user (import('./storage.js').User): Validated account.
 * Returns:
 *   {Session} Only the four identity fields.
 */
function sessionFor(user) {
  return { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

/**
 * Read and validate the current session against the current account collection.
 * Returns:
 *   {Session|null} A matching identity or null on any access, parse, shape, or stale-record failure.
 * Notes:
 *   Built-in identity is checked first. This read never repairs, removes, or writes storage.
 */
export function getSession() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_KEY));
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return null;
    if (Object.keys(value).length !== FIELDS.length || !FIELDS.every(field => nonEmpty(value[field]))) return null;
    if (value.role !== 'admin' && value.role !== 'user') return null;
    if (value.userId === 'admin' || value.username === 'admin') {
      return FIELDS.every(field => value[field] === ADMIN[field]) ? { ...ADMIN } : null;
    }
    const user = getUsers().find(record => record.id === value.userId
      && record.username === value.username && record.displayName === value.displayName && record.role === value.role);
    return user ? sessionFor(user) : null;
  } catch {
    return null;
  }
}

/**
 * Map browser write exceptions without exposing exception text or credentials.
 * Args:
 *   error (unknown): Failed browser operation.
 * Returns:
 *   {StorageWriteResult} Canonical safe failure.
 */
function writeFailure(error) {
  if (error?.name === 'QuotaExceededError') return { ok: false, reason: 'quota' };
  if (['SecurityError', 'NotAllowedError', 'InvalidStateError'].includes(error?.name)) {
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: false, reason: 'unknown' };
}

/**
 * Persist a caller-validated session after explicit credential activation.
 * Args:
 *   session (Session): Identity to serialize.
 * Returns:
 *   {StorageWriteResult} Success only after the session-key write completes; never throws.
 */
export function setSession(session) {
  let storage;
  try {
    storage = window.localStorage;
    if (!storage || typeof storage.setItem !== 'function') return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  let serialized;
  try {
    serialized = JSON.stringify(session);
    if (typeof serialized !== 'string') return { ok: false, reason: 'serialization' };
  } catch {
    return { ok: false, reason: 'serialization' };
  }
  try {
    storage.setItem(SESSION_KEY, serialized);
    return { ok: true };
  } catch (error) {
    return writeFailure(error);
  }
}

/**
 * Remove only the session on explicit logout, leaving accounts and posts intact.
 * Returns:
 *   {StorageWriteResult} Success only after removal; a failed removal never reports logout success.
 */
export function clearSession() {
  let storage;
  try {
    storage = window.localStorage;
    if (!storage || typeof storage.removeItem !== 'function') return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    storage.removeItem(SESSION_KEY);
    return { ok: true };
  } catch (error) {
    return writeFailure(error);
  }
}

/**
 * Check exact demo credentials before checking the current registered accounts.
 * Args:
 *   username (string): Submitted username, not normalized.
 *   password (string): Submitted local-demo password, never returned.
 * Returns:
 *   {AuthResult} Password-free identity and role home only after persistence succeeds.
 */
export function login(username, password) {
  let session;
  if (username === 'admin' && password === 'admin') {
    session = { ...ADMIN };
  } else {
    if (!nonEmpty(username) || !nonEmpty(password)) return { ok: false, reason: 'invalid_credentials' };
    const user = getUsers().find(record => record.username === username && record.password === password);
    if (!user) return { ok: false, reason: 'invalid_credentials' };
    session = sessionFor(user);
  }
  if (!setSession(session).ok) return { ok: false, reason: 'storage_write_failed' };
  return { ok: true, session, navigateTo: session.role === 'admin' ? '/admin' : '/blogs' };
}

/**
 * Validate and create a local writer account before establishing its session.
 * Args:
 *   fields (object): Four required strings: displayName, username, password, confirmPassword.
 * Returns:
 *   {RegistrationResult} Password-free user/session on success, or a canonical failure without navigation.
 * Notes:
 *   UUID/time are generated only during explicit submission. Missing UUID is storage_write_failed.
 *   A successful account write is retained if the subsequent session write fails; no rollback or retry occurs.
 */
export function register(fields) {
  if (!fields || !['displayName', 'username', 'password', 'confirmPassword'].every(field => nonEmpty(fields[field]))) {
    return { ok: false, reason: 'validation' };
  }
  const { displayName, username, password, confirmPassword } = fields;
  if (password !== confirmPassword) return { ok: false, reason: 'validation' };
  const users = getUsers();
  if (username === 'admin' || users.some(user => user.username === username)) {
    return { ok: false, reason: 'duplicate_username' };
  }
  let id;
  let createdAt;
  try {
    id = window.crypto.randomUUID();
    if (typeof id !== 'string' || !UUID.test(id) || users.some(user => user.id.toLowerCase() === id.toLowerCase())) {
      return { ok: false, reason: 'storage_write_failed' };
    }
    createdAt = new Date().toISOString();
  } catch {
    return { ok: false, reason: 'storage_write_failed' };
  }
  const user = { id, displayName, username, password, role: 'user', createdAt };
  if (!saveUsers([...users, user]).ok) return { ok: false, reason: 'storage_write_failed' };
  const session = sessionFor(user);
  if (!setSession(session).ok) return { ok: false, reason: 'storage_write_failed' };
  const view = { id, displayName, username, role: 'user', createdAt };
  return { ok: true, user: view, session, navigateTo: '/blogs' };
}
