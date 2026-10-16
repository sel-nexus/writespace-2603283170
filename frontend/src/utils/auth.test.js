/** Verify exact identity unions, fail-closed reads, and explicit persistence boundaries using real collection helpers. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, login, register, setSession } from './auth.js';
import { getUsers, saveUsers } from './storage.js';

const KEY = 'writespace_session';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const ID = '00000000-0000-4000-8000-000000000001';
const NEW_ID = '00000000-0000-4000-8000-000000000002';
const TIME = '2026-01-01T12:00:00.000Z';
const USER = { id: ID, displayName: 'Riley', username: 'riley', password: 'demo-only', role: 'user', createdAt: TIME };
const SESSION = { userId: ID, displayName: 'Riley', username: 'riley', role: 'user' };
const FORM = { displayName: 'Casey', username: 'casey', password: 'local-only', confirmPassword: 'local-only' };

beforeEach(() => {
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TIME));
});

// Restore the clock separately from the shared setup's storage/mocking cleanup.
afterEach(() => vi.useRealTimers());

/** Seed a serialized session without invoking the function under test. */
function seedSession(value) {
  localStorage.setItem(KEY, JSON.stringify(value));
}

/** Make storage acquisition unavailable, without changing unrelated browser capabilities. */
function denyStorage() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('private', 'SecurityError'); });
}

describe('getSession', () => {
  it('accepts the exact built-in identity before reading unavailable users', () => {
    seedSession(ADMIN);
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === 'writespace_users') throw new Error('users unavailable');
      return read.call(this, key);
    });
    expect(getSession()).toEqual(ADMIN);
  });

  it.each(['user', 'admin'])('restores a current registered %s without a password', role => {
    saveUsers([{ ...USER, role }]);
    seedSession({ ...SESSION, role });
    expect(getSession()).toEqual({ ...SESSION, role });
    expect(getSession()).not.toHaveProperty('password');
  });

  it.each([
    null, [], 'admin', 4, true, {},
    { ...SESSION, role: 'Admin' }, { ...SESSION, role: 'guest' },
    { ...SESSION, userId: '' }, { ...SESSION, username: '  ' }, { ...SESSION, displayName: 2 },
    { ...SESSION, username: null }, { ...SESSION, role: false },
    { userId: ID, username: 'riley', role: 'user' },
    { ...SESSION, password: 'secret' },
  ])('rejects malformed JSON shapes without repair: %j', value => {
    saveUsers([USER]);
    seedSession(value);
    const before = localStorage.getItem(KEY);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(KEY)).toBe(before);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    { ...ADMIN, role: 'user' }, { ...ADMIN, displayName: 'Imposter' },
    { ...ADMIN, username: 'someone' }, { ...ADMIN, userId: ID },
    { ...ADMIN, extra: true },
  ])('rejects forged built-in identity: %j', value => {
    saveUsers([USER]);
    seedSession(value);
    expect(getSession()).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(value);
  });

  it.each([
    [], [{ ...USER, id: NEW_ID }], [{ ...USER, username: 'renamed' }],
    [{ ...USER, displayName: 'Changed' }], [{ ...USER, role: 'admin' }],
  ])('rejects removed or changed accounts without removing the stale session: %j', users => {
    saveUsers(users);
    seedSession(SESSION);
    expect(getSession()).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(SESSION);
  });

  it('allows a password change because the current identity fields still match', () => {
    saveUsers([{ ...USER, password: 'changed-password' }]);
    seedSession(SESSION);
    expect(getSession()).toEqual(SESSION);
  });

  it.each(['{', '{}', 'null', '[1]'])('fails closed with corrupt or non-array users: %s', raw => {
    seedSession(SESSION);
    localStorage.setItem('writespace_users', raw);
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('writespace_users')).toBe(raw);
  });

  it('returns null for an absent session or invalid JSON without writes', () => {
    expect(getSession()).toBeNull();
    localStorage.setItem(KEY, '{');
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(KEY)).toBe('{');
  });

  it('returns null on a thrown localStorage getter', () => {
    denyStorage();
    expect(getSession()).toBeNull();
  });

  it('returns null on a thrown getItem', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private'); });
    expect(getSession()).toBeNull();
  });
});

describe('session writes', () => {
  it('sets then clears only the session key and clearing absent sessions is successful', () => {
    saveUsers([USER]);
    localStorage.setItem('writespace_posts', '[]');
    expect(setSession(SESSION)).toEqual({ ok: true });
    expect(getSession()).toEqual(SESSION);
    expect(clearSession()).toEqual({ ok: true });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(getUsers()).toEqual([USER]);
    expect(localStorage.getItem('writespace_posts')).toBe('[]');
    expect(clearSession()).toEqual({ ok: true });
  });

  it.each([setSession, clearSession])('reports storage acquisition exceptions for %s', operation => {
    denyStorage();
    expect(operation(ADMIN)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([null, {}, { setItem: null, removeItem: null }])('reports missing storage methods: %j', value => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(value);
    expect(setSession(ADMIN)).toEqual({ ok: false, reason: 'unavailable' });
    expect(clearSession()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([undefined, 1n])('reports absent or unsupported JSON serialization: %s', value => {
    seedSession(ADMIN);
    expect(setSession(value)).toEqual({ ok: false, reason: 'serialization' });
    expect(getSession()).toEqual(ADMIN);
  });

  it('rejects cyclic serialization and retains the old session', () => {
    seedSession(ADMIN);
    const cyclic = {};
    cyclic.self = cyclic;
    expect(setSession(cyclic)).toEqual({ ok: false, reason: 'serialization' });
    expect(getSession()).toEqual(ADMIN);
  });

  it.each([
    ['QuotaExceededError', 'quota'], ['SecurityError', 'unavailable'],
    ['NotAllowedError', 'unavailable'], ['InvalidStateError', 'unavailable'], ['Error', 'unknown'],
  ])('maps set/remove %s failures and retains persistence', (name, reason) => {
    seedSession(ADMIN);
    for (const method of ['setItem', 'removeItem']) {
      const spy = vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new DOMException('private', name); });
      const result = method === 'setItem' ? setSession(SESSION) : clearSession();
      expect(result).toEqual({ ok: false, reason });
      expect(getSession()).toEqual(ADMIN);
      spy.mockRestore();
    }
  });
});

describe('login', () => {
  it('persists admin/admin before reading any registered user credentials', () => {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === 'writespace_users') throw new Error('unavailable users');
      return read.call(this, key);
    });
    expect(login('admin', 'admin')).toEqual({ ok: true, session: ADMIN, navigateTo: '/admin' });
    expect(getSession()).toEqual(ADMIN);
    expect(Storage.prototype.getItem).not.toHaveBeenCalledWith('writespace_users');
    expect(read.call(localStorage, 'writespace_users')).toBeNull();
  });

  it.each(['user', 'admin'])('persists a registered %s with its role home and no password', role => {
    saveUsers([{ ...USER, role }]);
    const result = login('riley', 'demo-only');
    expect(result).toEqual({ ok: true, session: { ...SESSION, role }, navigateTo: role === 'admin' ? '/admin' : '/blogs' });
    expect(getSession()).toEqual({ ...SESSION, role });
    expect(JSON.stringify(result)).not.toContain('demo-only');
    expect(getUsers()).toEqual([{ ...USER, role }]);
  });

  it.each([
    ['admin', 'wrong'], ['Admin', 'admin'], [' admin', 'admin'],
    ['riley', 'wrong'], ['Riley', 'demo-only'], ['riley', 'demo-only '],
    ['', ''], [' ', 'demo-only'], [null, 'demo-only'], ['riley', undefined], [1, {}],
  ])('rejects exact mismatches or malformed credentials without a write: %j / %j', (username, password) => {
    saveUsers([USER]);
    seedSession(ADMIN);
    expect(login(username, password)).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(getSession()).toEqual(ADMIN);
    expect(getUsers()).toEqual([USER]);
  });

  it('returns invalid credentials when the users read throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private'); });
    expect(login('riley', 'demo-only')).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('returns storage_write_failed when matched credentials cannot persist', () => {
    saveUsers([USER]);
    seedSession(ADMIN);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('private', 'QuotaExceededError'); });
    expect(login('riley', 'demo-only')).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(getSession()).toEqual(ADMIN);
  });

  it('returns the auth failure union when admin session storage acquisition is blocked', () => {
    denyStorage();
    expect(login('admin', 'admin')).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(login('riley', 'demo-only')).toEqual({ ok: false, reason: 'invalid_credentials' });
  });
});

describe('register', () => {
  it('writes the appended account before session and returns only a password-free UserView', () => {
    saveUsers([USER]);
    const write = Storage.prototype.setItem;
    const order = [];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      order.push(key);
      if (key === KEY) expect(getUsers()).toHaveLength(2);
      return write.call(this, key, value);
    });
    const result = register(FORM);
    const view = { id: NEW_ID, displayName: 'Casey', username: 'casey', role: 'user', createdAt: TIME };
    const session = { userId: NEW_ID, displayName: 'Casey', username: 'casey', role: 'user' };
    expect(result).toEqual({ ok: true, user: view, session, navigateTo: '/blogs' });
    expect(order).toEqual(['writespace_users', KEY]);
    expect(getUsers()).toEqual([USER, { ...view, password: FORM.password }]);
    expect(getSession()).toEqual(session);
    expect(JSON.stringify(result)).not.toContain(FORM.password);
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each(['displayName', 'username', 'password', 'confirmPassword'])('rejects missing, blank, or non-string %s before UUID/writes', field => {
    for (const value of [undefined, null, '', '  ', 1, false, {}, []]) {
      expect(register({ ...FORM, [field]: value })).toEqual({ ok: false, reason: 'validation' });
      expect(getUsers()).toEqual([]);
      expect(getSession()).toBeNull();
    }
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, false, 1])('rejects invalid form objects: %j', fields => {
    expect(register(fields)).toEqual({ ok: false, reason: 'validation' });
    expect(getUsers()).toEqual([]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without generating an ID', () => {
    expect(register({ ...FORM, confirmPassword: 'different' })).toEqual({ ok: false, reason: 'validation' });
    expect(getUsers()).toEqual([]);
    expect(getSession()).toBeNull();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['admin', 'riley'])('rejects reserved or duplicate exact username %s without writing', username => {
    saveUsers([USER]);
    expect(register({ ...FORM, username })).toEqual({ ok: false, reason: 'duplicate_username' });
    expect(getUsers()).toEqual([USER]);
    expect(getSession()).toBeNull();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['Admin', 'Riley', ' riley '])('preserves exact strings and permits non-identical usernames: %s', username => {
    saveUsers([USER]);
    expect(register({ ...FORM, username }).ok).toBe(true);
    expect(getUsers()[1].username).toBe(username);
    expect(getSession().username).toBe(username);
  });

  it.each([undefined, null, () => { throw new Error('UUID unavailable'); }, () => '', () => 'weak-id', () => ID])(
    'maps unavailable, invalid or colliding UUID to the registration failure union', randomUUID => {
      saveUsers([USER]);
      vi.spyOn(window, 'crypto', 'get').mockReturnValue({ randomUUID });
      expect(register(FORM)).toEqual({ ok: false, reason: 'storage_write_failed' });
      expect(getUsers()).toEqual([USER]);
      expect(getSession()).toBeNull();
    },
  );

  it('does not establish a session if the account write fails', () => {
    saveUsers([USER]);
    seedSession(ADMIN);
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === 'writespace_users') throw new DOMException('private', 'QuotaExceededError');
      return write.call(this, key, value);
    });
    expect(register(FORM)).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(getUsers()).toEqual([USER]);
    expect(getSession()).toEqual(ADMIN);
  });

  it('retains the new account and previous session when only session persistence fails', () => {
    saveUsers([USER]);
    seedSession(ADMIN);
    const write = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === KEY) throw new DOMException('private', 'SecurityError');
      return write.call(this, key, value);
    });
    expect(register(FORM)).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(getUsers()).toEqual([USER, {
      id: NEW_ID, displayName: FORM.displayName, username: FORM.username, password: FORM.password, role: 'user', createdAt: TIME,
    }]);
    expect(getSession()).toEqual(ADMIN);
    failure.mockRestore();
    expect(login(FORM.username, FORM.password).ok).toBe(true);
    expect(getSession().userId).toBe(NEW_ID);
  });

  it('maps denied storage to registration storage_write_failed with no UUID fallback', () => {
    denyStorage();
    expect(register(FORM)).toEqual({ ok: false, reason: 'storage_write_failed' });
  });
});
