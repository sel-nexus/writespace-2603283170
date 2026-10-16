/** Exercise collection schemas and every persistence outcome without exposing local credentials. */
import { describe, expect, it, vi } from 'vitest';
import { getPosts, getUsers, savePosts, saveUsers } from './storage.js';

/** Build a complete deterministic post for storage validation. */
function post(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'A quiet note',
    content: '  First paragraph.\n\nSecond paragraph.  ',
    createdAt: '2026-03-04T12:00:00.000Z',
    authorId: 'admin',
    authorName: 'Admin',
    ...overrides,
  };
}

/** Build a complete deterministic local demo user. */
function user(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    displayName: 'Riley Writer',
    username: 'riley',
    password: 'local-demo-only',
    role: 'user',
    createdAt: '2026-03-04T12:00:00.000Z',
    ...overrides,
  };
}

const collections = [
  { label: 'posts', key: 'writespace_posts', read: getPosts, save: savePosts, fixture: post },
  { label: 'users', key: 'writespace_users', read: getUsers, save: saveUsers, fixture: user },
];

const invalidDates = [
  'not-a-date', 'March 4, 2026', '2026-3-4', '2026-00-04', '2026-13-04', '2026-03-00',
  '2026-04-31', '2026-02-29', '1900-02-29', '2026-03-04T24:00:00Z', '2026-03-04T12:60:00Z',
  '2026-03-04T12:00:60Z', '2026-03-04T12:00:00+24:00', '2026-03-04T12:00:00+01:60',
  '2026-03-04T12:00:00', '2026-03-04junk', '2026-03-04T12:00:00.Z',
];

const validDates = [
  '2026-03-04T12:00:00.000Z', '2026-03-04', '2024-02-29T00:00:00Z', '2000-02-29',
  '2026-03-04T12:00:00+05:30', '2026-03-04T12:00:00-07:00', '2026-03-04T12:00Z',
];

describe.each(collections)('$label collection reads', ({ key, read, fixture }) => {
  it('returns complete records unchanged and performs no repair write', () => {
    const records = [fixture()];
    localStorage.setItem(key, JSON.stringify(records));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(read()).toEqual(records);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('returns an empty array for an absent key without creating it', () => {
    expect(read()).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('accepts a persisted empty array', () => {
    localStorage.setItem(key, '[]');
    expect(read()).toEqual([]);
    expect(localStorage.getItem(key)).toBe('[]');
  });

  it.each(['{broken', '', 'undefined', 'null', '{}', '"array"', '42', 'true'])
  ('rejects malformed or non-array JSON %j without changing it', raw => {
    localStorage.setItem(key, raw);
    expect(read()).toEqual([]);
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it.each([null, [], 'record', 42, true])('rejects a non-object member %j, not just that member', invalid => {
    localStorage.setItem(key, JSON.stringify([fixture(), invalid]));
    expect(read()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(key))).toHaveLength(2);
  });

  it.each(Object.keys(fixture()))('rejects a record missing %s', field => {
    const invalid = fixture();
    delete invalid[field];
    localStorage.setItem(key, JSON.stringify([fixture(), invalid]));
    expect(read()).toEqual([]);
  });

  it.each(Object.keys(fixture()))('rejects a wrong type for %s', field => {
    localStorage.setItem(key, JSON.stringify([fixture({ [field]: 123 })]));
    expect(read()).toEqual([]);
  });

  it.each(Object.keys(fixture()))('rejects a blank string in %s', field => {
    localStorage.setItem(key, JSON.stringify([fixture({ [field]: ' \n\t ' })]));
    expect(read()).toEqual([]);
  });

  it('rejects fields outside the exact persisted record schema', () => {
    localStorage.setItem(key, JSON.stringify([fixture({ image: 'not-supported' })]));
    expect(read()).toEqual([]);
  });

  it.each(['p-1', 'admin', '00000000-0000-0000-0000-000000000001', '00000000-0000-4000-7000-000000000001'])
  ('rejects non-UUID identity %s', id => {
    localStorage.setItem(key, JSON.stringify([fixture({ id })]));
    expect(read()).toEqual([]);
  });

  it('rejects duplicate UUIDs across the whole array', () => {
    localStorage.setItem(key, JSON.stringify([fixture(), fixture()]));
    expect(read()).toEqual([]);
  });

  it('treats upper and lowercase UUID spellings as the same identity', () => {
    const id = 'abcdefab-cdef-4abc-8abc-abcdefabcdef';
    localStorage.setItem(key, JSON.stringify([fixture({ id }), fixture({ id: id.toUpperCase() })]));
    expect(read()).toEqual([]);
  });

  it.each(validDates)('accepts a real ISO date %s', createdAt => {
    const record = fixture({ createdAt });
    localStorage.setItem(key, JSON.stringify([record]));
    expect(read()).toEqual([record]);
  });

  it.each(invalidDates)('rejects an invalid ISO date %s', createdAt => {
    localStorage.setItem(key, JSON.stringify([fixture({ createdAt })]));
    expect(read()).toEqual([]);
  });

  it('returns an empty array when the localStorage getter is denied', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(read()).toEqual([]);
  });

  it('returns an empty array when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('read failure');
    });
    expect(read()).toEqual([]);
  });

  it('returns an empty array if storage or the browser global is absent', () => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(undefined);
    expect(read()).toEqual([]);
    vi.stubGlobal('window', undefined);
    expect(read()).toEqual([]);
  });

  it('contains schema inspection exceptions as a read failure', () => {
    localStorage.setItem(key, '[]');
    vi.spyOn(JSON, 'parse').mockReturnValue([new Proxy({}, {
      getPrototypeOf() {
        throw new Error('unusable record');
      },
    })]);
    expect(read()).toEqual([]);
  });
});

describe('collection-specific integrity and isolation', () => {
  it('preserves post whitespace and renders markup only as stored plain text', () => {
    const record = post({ content: '  <script>not executed</script>\n\n  ' });
    localStorage.setItem('writespace_posts', JSON.stringify([record]));
    expect(getPosts()[0].content).toBe(record.content);
  });

  it('accepts admin-created users and exact-case distinct usernames', () => {
    const records = [user({ role: 'admin' }), user({
      id: '00000000-0000-4000-8000-000000000003', username: 'Riley',
    }), user({ id: '00000000-0000-4000-8000-000000000004', username: 'Admin' })];
    localStorage.setItem('writespace_users', JSON.stringify(records));
    expect(getUsers()).toEqual(records);
  });

  it.each(['Admin', 'writer', '', null])('rejects unsupported user role %j', role => {
    localStorage.setItem('writespace_users', JSON.stringify([user({ role })]));
    expect(getUsers()).toEqual([]);
  });

  it('rejects the reserved exact admin username in registered users', () => {
    localStorage.setItem('writespace_users', JSON.stringify([user({ username: 'admin' })]));
    expect(getUsers()).toEqual([]);
  });

  it('rejects duplicate usernames even with distinct valid UUIDs', () => {
    localStorage.setItem('writespace_users', JSON.stringify([
      user(), user({ id: '00000000-0000-4000-8000-000000000003' }),
    ]));
    expect(getUsers()).toEqual([]);
  });

  it.each(['{broken', '{}', JSON.stringify([user({ role: 'invalid' })])])
  ('preserves valid posts when users are corrupted as %s', raw => {
    localStorage.setItem('writespace_posts', JSON.stringify([post()]));
    localStorage.setItem('writespace_users', raw);
    expect(getUsers()).toEqual([]);
    expect(getPosts()).toEqual([post()]);
    expect(localStorage.getItem('writespace_users')).toBe(raw);
  });

  it.each(['{broken', '{}', JSON.stringify([post({ title: '' })])])
  ('preserves valid users when posts are corrupted as %s', raw => {
    localStorage.setItem('writespace_posts', raw);
    localStorage.setItem('writespace_users', JSON.stringify([user()]));
    expect(getPosts()).toEqual([]);
    expect(getUsers()).toEqual([user()]);
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
  });

  it.each(collections)('isolates a getItem failure on only $label', ({ key, read }) => {
    const values = {
      writespace_posts: JSON.stringify([post()]),
      writespace_users: JSON.stringify([user()]),
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(requested => {
      if (requested === key) throw new DOMException('blocked', 'SecurityError');
      return values[requested] ?? null;
    });
    expect(read()).toEqual([]);
    expect(key === 'writespace_posts' ? getUsers() : getPosts()).toEqual([key === 'writespace_posts' ? user() : post()]);
  });
});

describe.each(collections)('$label replacement writes', ({ key, read, save, fixture }) => {
  it('writes a complete replacement and returns success only after persistence', () => {
    const records = [fixture()];
    expect(save(records)).toEqual({ ok: true });
    expect(localStorage.getItem(key)).toBe(JSON.stringify(records));
    expect(read()).toEqual(records);
    expect(save([])).toEqual({ ok: true });
    expect(read()).toEqual([]);
  });

  it('changes only its own key and preserves the session', () => {
    const otherKey = key === 'writespace_posts' ? 'writespace_users' : 'writespace_posts';
    localStorage.setItem(otherKey, 'untouched-other-collection');
    localStorage.setItem('writespace_session', 'untouched-session');
    expect(save([fixture()])).toEqual({ ok: true });
    expect(localStorage.getItem(otherKey)).toBe('untouched-other-collection');
    expect(localStorage.getItem('writespace_session')).toBe('untouched-session');
  });

  it('returns unavailable for a denied localStorage getter', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(save([fixture()])).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([null, undefined, {}])('returns unavailable for unusable storage %j', storage => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage);
    expect(save([fixture()])).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('returns unavailable without a browser global', () => {
    vi.stubGlobal('window', undefined);
    expect(save([fixture()])).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('contains an exception while acquiring the setItem property', () => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      get setItem() {
        throw new Error('denied method access');
      },
    });
    expect(save([fixture()])).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([
    ['QuotaExceededError', 'quota'], ['SecurityError', 'unavailable'], ['NotAllowedError', 'unavailable'],
    ['InvalidStateError', 'unavailable'], ['UnexpectedError', 'unknown'],
  ])('maps a %s write error to %s and retains the old collection', (name, reason) => {
    localStorage.setItem(key, JSON.stringify([fixture()]));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('never show local-demo-only', name);
    });
    expect(save([])).toEqual({ ok: false, reason });
    expect(read()).toEqual([fixture()]);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each([null, 'failure', new Error('unexpected')])('contains arbitrary write exceptions %j', error => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw error; });
    expect(save([fixture()])).toEqual({ ok: false, reason: 'unknown' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('does not write a cyclic value or change the previously saved value', () => {
    localStorage.setItem(key, JSON.stringify([fixture()]));
    const cyclic = [];
    cyclic.push(cyclic);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(save(cyclic)).toEqual({ ok: false, reason: 'serialization' });
    expect(write).not.toHaveBeenCalled();
    expect(read()).toEqual([fixture()]);
  });

  it('reports BigInt serialization failure without a write', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(save([1n])).toEqual({ ok: false, reason: 'serialization' });
    expect(write).not.toHaveBeenCalled();
  });

  it('contains a throwing toJSON without leaking the exception', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const value = [{ toJSON() { throw new Error('local-demo-only must not leak'); } }];
    expect(save(value)).toEqual({ ok: false, reason: 'serialization' });
    expect(write).not.toHaveBeenCalled();
  });

  it.each([undefined, () => {}, Symbol('unserializable')])('rejects a non-string serialization result', value => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(save(value)).toEqual({ ok: false, reason: 'serialization' });
    expect(write).not.toHaveBeenCalled();
  });
});
