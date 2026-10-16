/** Verify account mutations against real storage with current identity and deterministic submission metadata. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUser, deleteUser, canDeleteUser, getUserViews, userView } from './users.js';
import { getUsers, saveUsers } from './storage.js';
import { getSession, setSession } from './auth.js';

const ID = '00000000-0000-4000-8000-000000000010';
const NEW_ID = '00000000-0000-4000-8000-000000000011';
const OTHER_ID = '00000000-0000-4000-8000-000000000012';
const DATE = '2026-03-04T12:00:00.000Z';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const USER = { id: ID, displayName: 'Casey', username: 'casey', password: 'private-demo', role: 'user', createdAt: DATE };
const FIELDS = { displayName: 'Riley Writer', username: 'riley', password: 'secret-demo-only', role: 'user' };

/** Project a stored fixture into a session without including its password. */
function sessionFor(user) {
  return { userId: user.id, displayName: user.displayName, username: user.username, role: user.role };
}

beforeEach(() => {
  saveUsers([USER]);
  setSession(ADMIN);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-04-01T09:00:00.000Z'));
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
});
afterEach(() => { vi.useRealTimers(); });

/** Fail only account writes while preserving genuine read behavior and prior data. */
function failWrites(name = 'QuotaExceededError') {
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function persist(key, value) {
    if (key === 'writespace_users') throw new DOMException('private diagnostic', name);
    return write.call(this, key, value);
  });
}

/** Establish a forbidden current identity without mocking application authorization. */
function denyIdentity(kind) {
  if (kind === 'anonymous') localStorage.removeItem('writespace_session');
  if (kind === 'user') setSession(sessionFor(USER));
  if (kind === 'stale' || kind === 'demoted') {
    const admin = { ...USER, role: 'admin' };
    saveUsers([admin]);
    setSession(sessionFor(admin));
    saveUsers(kind === 'stale' ? [] : [USER]);
  }
}

describe('password-free views and eligibility', () => {
  it('projects only public fields and reads built-in plus stored accounts without writes', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const view = { id: ID, displayName: 'Casey', username: 'casey', role: 'user', createdAt: DATE };
    expect(userView({ ...USER, diagnostic: 'private' })).toEqual(view);
    expect(getUserViews()).toEqual([
      { id: 'admin', displayName: 'Admin', username: 'admin', role: 'admin', createdAt: '' }, view,
    ]);
    expect(JSON.stringify(getUserViews())).not.toContain(USER.password);
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps only synthetic admin for an invalid collection without repairing it', () => {
    localStorage.setItem('writespace_users', 'invalid');
    expect(getUserViews()).toHaveLength(1);
    expect(localStorage.getItem('writespace_users')).toBe('invalid');
  });

  it.each([
    [ADMIN, ID, true], [ADMIN, 'admin', false], [null, ID, false],
    [sessionFor(USER), OTHER_ID, false], [{ ...sessionFor(USER), role: 'admin' }, ID, false],
    [ADMIN, undefined, false], [ADMIN, '', false], [{ ...ADMIN, role: 'guest' }, ID, false],
  ])('fails closed for identity %j and target %s', (session, id, allowed) => {
    expect(canDeleteUser(session, id)).toBe(allowed);
  });
});

describe('createUser', () => {
  it.each(['admin', 'user'])('creates a durable %s with password-free MutationResult and unchanged session', role => {
    const time = vi.spyOn(Date.prototype, 'toISOString');
    const result = createUser({ ...FIELDS, role, id: 'forged', createdAt: 'forged', session: null });
    const expected = { id: NEW_ID, ...FIELDS, role, createdAt: '2026-04-01T09:00:00.000Z' };
    const { password, ...view } = expected;
    expect(result).toEqual({ ok: true, value: view });
    expect(JSON.stringify(result)).not.toContain(password);
    expect(getUsers()).toEqual([USER, expected]);
    expect(getSession()).toEqual(ADMIN);
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(time).toHaveBeenCalledTimes(1);
  });

  it.each(['displayName', 'username', 'password', 'role'])('requires %s independently without metadata or writes', key => {
    for (const value of [undefined, null, '', '  ', 4, {}, []]) {
      const write = vi.spyOn(Storage.prototype, 'setItem');
      expect(createUser({ ...FIELDS, [key]: value })).toEqual({ ok: false, reason: 'validation' });
      expect(getUsers()).toEqual([USER]);
      expect(write).not.toHaveBeenCalled();
      expect(window.crypto.randomUUID).not.toHaveBeenCalled();
    }
  });

  it.each([undefined, null, {}, 'input', { ...FIELDS, role: 'Admin' }, { ...FIELDS, role: 'writer' }])(
    'rejects malformed form or unsupported role %j', fields => {
      const time = vi.spyOn(Date.prototype, 'toISOString');
      expect(createUser(fields)).toEqual({ ok: false, reason: 'validation' });
      expect(getUsers()).toEqual([USER]);
      expect(time).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'casey'])('rejects exact reserved/duplicate username %s without exposing fields', username => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(createUser({ ...FIELDS, username })).toEqual({ ok: false, reason: 'duplicate_username' });
    expect(getUsers()).toEqual([USER]);
    expect(write).not.toHaveBeenCalled();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['Admin', 'Casey', ' casey '])('uses exact comparison rather than invented normalization for %s', username => {
    expect(createUser({ ...FIELDS, username }).ok).toBe(true);
    expect(getUsers()[1].username).toBe(username);
  });

  it.each(['anonymous', 'user', 'stale', 'demoted'])('rejects current %s despite supplied admin', kind => {
    denyIdentity(kind);
    const before = getUsers();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(createUser({ ...FIELDS, session: ADMIN })).toEqual({ ok: false, reason: 'forbidden' });
    expect(getUsers()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('allows a stored administrator and preserves newly added accounts from the latest read', () => {
    const admin = { ...USER, role: 'admin' };
    const newer = { ...USER, id: OTHER_ID, username: 'newer' };
    saveUsers([admin, newer]);
    setSession(sessionFor(admin));
    expect(createUser(FIELDS).ok).toBe(true);
    expect(getUsers().slice(0, 2)).toEqual([admin, newer]);
    expect(getSession()).toEqual(sessionFor(admin));
  });

  it('checks duplicates introduced after a prior view snapshot', () => {
    getUserViews();
    saveUsers([USER, { ...USER, id: OTHER_ID, username: FIELDS.username }]);
    expect(createUser(FIELDS)).toEqual({ ok: false, reason: 'duplicate_username' });
    expect(getUsers()).toHaveLength(2);
  });

  it.each(['missing', 'throws', 'malformed', 'empty', 'non-string', 'collision'])(
    'returns id_unavailable for %s UUID without fallback IDs or writes', kind => {
      const uuid = window.crypto.randomUUID;
      if (kind === 'missing') vi.spyOn(window, 'crypto', 'get').mockReturnValue({});
      if (kind === 'throws') uuid.mockImplementation(() => { throw new Error('private diagnostic'); });
      if (kind === 'malformed') uuid.mockReturnValue('weak-id');
      if (kind === 'empty') uuid.mockReturnValue('');
      if (kind === 'non-string') uuid.mockReturnValue(null);
      if (kind === 'collision') uuid.mockReturnValue(ID.toUpperCase());
      const write = vi.spyOn(Storage.prototype, 'setItem');
      expect(createUser(FIELDS)).toEqual({ ok: false, reason: 'id_unavailable' });
      expect(getUsers()).toEqual([USER]);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each(['QuotaExceededError', 'SecurityError', 'Error'])('retains durable bytes on %s without diagnostic data', name => {
    const before = localStorage.getItem('writespace_users');
    failWrites(name);
    expect(createUser(FIELDS)).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(localStorage.getItem('writespace_users')).toBe(before);
    expect(getUsers()).toEqual([USER]);
  });

  it('persists markup and long text as literal fields without echoing passwords', () => {
    const displayName = '<img src=x onerror=alert(1)>' + 'a'.repeat(10000);
    const result = createUser({ ...FIELDS, displayName });
    expect(result.value.displayName).toBe(displayName);
    expect(result.value).not.toHaveProperty('password');
    expect(getUsers()[1].displayName).toBe(displayName);
  });
});

describe('deleteUser', () => {
  it.each(['built-in', 'stored'])('deletes only the selected account as %s admin', kind => {
    const other = { ...USER, id: OTHER_ID, username: 'other', role: 'admin' };
    saveUsers([USER, other]);
    if (kind === 'stored') setSession(sessionFor(other));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deleteUser({ id: ID })).toEqual({ ok: true, value: ID });
    expect(getUsers()).toEqual([other]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['admin', ID])('denies built-in or current account %s before confirmation', id => {
    if (id === ID) {
      saveUsers([{ ...USER, role: 'admin' }]);
      setSession(sessionFor({ ...USER, role: 'admin' }));
    }
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const before = getUsers();
    expect(deleteUser({ id, confirmed: true })).toEqual({ ok: false, reason: 'forbidden' });
    expect(getUsers()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['anonymous', 'user', 'stale', 'demoted'])('denies %s before confirm despite caller flags', kind => {
    denyIdentity(kind);
    const before = getUsers();
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deleteUser({ id: ID, session: ADMIN, confirmed: true })).toEqual({ ok: false, reason: 'forbidden' });
    expect(getUsers()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { id: 'missing' }])('returns not_found for missing target %j before confirm', fields => {
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deleteUser(fields)).toEqual({ ok: false, reason: 'not_found' });
    expect(getUsers()).toEqual([USER]);
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('cancels without writing even when supplied confirmed=true', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deleteUser({ id: ID, confirmed: true })).toEqual({ ok: false, reason: 'cancelled' });
    expect(getUsers()).toEqual([USER]);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['logout', 'user', 'own', 'stale', 'demoted', 'removed'])(
    'rechecks %s during confirmation without a mutation write', change => {
      const storedAdmin = { ...USER, id: OTHER_ID, username: 'other', role: 'admin' };
      saveUsers([USER, storedAdmin]);
      setSession(sessionFor(storedAdmin));
      vi.spyOn(window, 'confirm').mockImplementation(() => {
        if (change === 'logout') localStorage.removeItem('writespace_session');
        if (change === 'user') setSession(sessionFor(USER));
        if (change === 'own') {
          saveUsers([{ ...USER, role: 'admin' }, storedAdmin]);
          setSession(sessionFor({ ...USER, role: 'admin' }));
        }
        if (change === 'stale') saveUsers([USER]);
        if (change === 'demoted') saveUsers([USER, { ...storedAdmin, role: 'user' }]);
        if (change === 'removed') saveUsers([storedAdmin]);
        return true;
      });
      const result = deleteUser({ id: ID });
      expect(result).toEqual({ ok: false, reason: change === 'removed' ? 'not_found' : 'forbidden' });
      expect(getUsers().some(user => user.id === ID)).toBe(change !== 'removed');
    },
  );

  it('retains unrelated additions and latest metadata during confirmation', () => {
    const newer = { ...USER, id: OTHER_ID, username: 'newer', displayName: 'Latest' };
    vi.spyOn(window, 'confirm').mockImplementation(() => { saveUsers([USER, newer]); return true; });
    expect(deleteUser({ id: ID })).toEqual({ ok: true, value: ID });
    expect(getUsers()).toEqual([newer]);
  });

  it('retains exact persisted bytes after a confirmed write failure', () => {
    const raw = localStorage.getItem('writespace_users');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    failWrites();
    expect(deleteUser({ id: ID })).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(localStorage.getItem('writespace_users')).toBe(raw);
    expect(getUsers()).toEqual([USER]);
  });
});
