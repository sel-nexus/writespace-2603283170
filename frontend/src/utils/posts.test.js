/** Verify every mutation outcome using real localStorage, deterministic identity generation, and durable rereads. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); });
import { canManagePost, createPost, updatePost, deletePost } from './posts.js';
import { getPosts, savePosts, saveUsers } from './storage.js';
import { setSession } from './auth.js';

const ID = '00000000-0000-4000-8000-000000000001';
const NEW_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000010';
const DATE = '2026-03-04T12:00:00.000Z';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const USER = { id: USER_ID, username: 'riley', displayName: 'Riley', password: 'demo', role: 'user', createdAt: DATE };
const OWNER = { userId: USER.id, username: USER.username, displayName: USER.displayName, role: USER.role };
const POST = { id: ID, title: 'Original', content: 'Original\n\n text ', createdAt: DATE, authorId: USER_ID, authorName: 'Riley' };
const FIELDS = { title: '  Revised  ', content: '  First\n\n  Last  ' };

beforeEach(() => {
  saveUsers([USER]);
  setSession(OWNER);
  savePosts([POST]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-04-01T09:00:00.000Z'));
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
});

/** Deny only post writes, leaving real storage reads and previously durable bytes available. */
function failWrites() {
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function persist(key, value) {
    if (key === 'writespace_posts') throw new DOMException('private detail', 'QuotaExceededError');
    return write.call(this, key, value);
  });
}

/** Establish a current identity or deliberately stale/anonymous storage without mocking auth. */
function identity(kind) {
  if (kind === 'admin') setSession(ADMIN);
  if (kind === 'non-owner') savePosts([{ ...POST, authorId: 'other' }]);
  if (kind === 'anonymous') localStorage.removeItem('writespace_session');
  if (kind === 'stale') saveUsers([]);
}

describe('canManagePost', () => {
  it.each([
    [OWNER, POST, true], [ADMIN, POST, true], [null, POST, false],
    [OWNER, { ...POST, authorId: 'other' }, false], [{ ...OWNER, role: 'guest' }, POST, false],
    [ADMIN, null, false], [OWNER, undefined, false],
  ])('fails closed for missing targets or ineligible identities: %j / %j', (session, post, expected) => {
    expect(canManagePost(session, post)).toBe(expected);
  });
});

describe('createPost', () => {
  it.each(['owner', 'admin'])('creates exactly one attributed durable post as %s, ignoring supplied session', kind => {
    identity(kind);
    const timestamp = vi.spyOn(Date.prototype, 'toISOString');
    const result = createPost({ ...FIELDS, session: { ...ADMIN, displayName: 'Forged' }, authorId: 'forged' });
    expect(timestamp).toHaveBeenCalledTimes(1);
    const expected = {
      id: NEW_ID, title: 'Revised', content: FIELDS.content, createdAt: '2026-04-01T09:00:00.000Z',
      authorId: kind === 'admin' ? 'admin' : USER_ID, authorName: kind === 'admin' ? 'Admin' : 'Riley',
    };
    expect(result).toEqual({ ok: true, post: expected, navigateTo: `/blog/${NEW_ID}` });
    expect(getPosts()).toEqual([POST, expected]);
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, {}, { title: ' ', content: 'x' }, { title: 'x', content: '\n ' },
    { title: 3, content: 'x' }, { title: 'x', content: null }])('rejects invalid fields %j without IDs or writes', fields => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(createPost(fields)).toEqual({ ok: false, reason: 'validation' });
    expect(getPosts()).toEqual([POST]);
    expect(write).not.toHaveBeenCalled();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['anonymous', 'stale'])('rejects %s despite a supplied administrator session', kind => {
    identity(kind);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(createPost({ ...FIELDS, session: ADMIN })).toEqual({ ok: false, reason: 'forbidden' });
    expect(getPosts()).toEqual([POST]);
    expect(write).not.toHaveBeenCalled();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['missing', 'throws', 'malformed', 'empty', 'non-string', 'collision'])(
    'returns id_unavailable for %s UUID without damaging storage', kind => {
      const uuid = window.crypto.randomUUID;
      if (kind === 'missing') vi.spyOn(window, 'crypto', 'get').mockReturnValue({});
      if (kind === 'throws') uuid.mockImplementation(() => { throw new Error('private'); });
      if (kind === 'malformed') uuid.mockReturnValue('not-a-uuid');
      if (kind === 'empty') uuid.mockReturnValue('');
      if (kind === 'non-string') uuid.mockReturnValue(null);
      if (kind === 'collision') uuid.mockReturnValue(ID.toUpperCase());
      const write = vi.spyOn(Storage.prototype, 'setItem');
      expect(createPost(FIELDS)).toEqual({ ok: false, reason: 'id_unavailable' });
      expect(getPosts()).toEqual([POST]);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('reads latest posts and keeps unrelated additions rather than using an earlier snapshot', () => {
    const other = { ...POST, id: '00000000-0000-4000-8000-000000000003', title: 'Newer addition' };
    savePosts([POST, other]);
    expect(createPost(FIELDS).ok).toBe(true);
    expect(getPosts().slice(0, 2)).toEqual([POST, other]);
  });

  it('returns storage_write_failed and retains exact durable bytes on quota exception', () => {
    const raw = localStorage.getItem('writespace_posts');
    failWrites();
    expect(createPost(FIELDS)).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual([POST]);
  });
});

describe('updatePost', () => {
  it.each(['owner', 'admin'])('updates only title/content as %s with latest metadata and unrelated posts preserved', kind => {
    identity(kind);
    const latest = { ...POST, authorName: 'Original attribution', createdAt: '2026-01-01T00:00:00Z' };
    const other = { ...POST, id: NEW_ID };
    savePosts([latest, other]);
    const expected = { ...latest, title: 'Revised', content: FIELDS.content };
    expect(updatePost({ id: ID, ...FIELDS, createdAt: 'forged', authorId: 'forged', session: ADMIN }))
      .toEqual({ ok: true, post: expected, navigateTo: `/blog/${ID}` });
    expect(getPosts()).toEqual([expected, other]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each([{ title: '', content: 'x' }, { title: 'x', content: ' ' }, { title: null, content: 'x' },
    { title: 'x', content: 1 }, {}, null])('rejects invalid update fields %j without writing', fields => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(updatePost(fields && { id: ID, ...fields })).toEqual({ ok: false, reason: 'validation' });
    expect(getPosts()).toEqual([POST]);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['non-owner', 'anonymous', 'stale'])('rejects %s with forbidden despite supplied session', kind => {
    identity(kind);
    const before = getPosts();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(updatePost({ id: ID, ...FIELDS, session: ADMIN })).toEqual({ ok: false, reason: 'forbidden' });
    expect(getPosts()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['missing', 'deleted'])('returns not_found for a %s target and preserves unrelated posts', kind => {
    if (kind === 'deleted') savePosts([{ ...POST, id: NEW_ID }]);
    const before = getPosts();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(updatePost({ id: kind === 'missing' ? 'absent' : ID, ...FIELDS })).toEqual({ ok: false, reason: 'not_found' });
    expect(getPosts()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });

  it('retains original metadata and content after a failed write', () => {
    const raw = localStorage.getItem('writespace_posts');
    failWrites();
    expect(updatePost({ id: ID, ...FIELDS })).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual([POST]);
  });
});

describe('deletePost', () => {
  it.each(['owner', 'admin'])('confirms and removes only the target as %s', kind => {
    identity(kind);
    const other = { ...POST, id: NEW_ID };
    savePosts([POST, other]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(deletePost({ id: ID })).toEqual({ ok: true, removedId: ID, navigateTo: '/blogs' });
    expect(getPosts()).toEqual([other]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('never writes or removes on cancelled confirmation, even with supplied confirmed=true', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deletePost({ id: ID, confirmed: true })).toEqual({ ok: false, reason: 'cancelled' });
    expect(getPosts()).toEqual([POST]);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['non-owner', 'anonymous', 'stale'])('preauthorizes %s before showing any confirmation', kind => {
    identity(kind);
    const before = getPosts();
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deletePost({ id: ID, session: ADMIN, confirmed: true })).toEqual({ ok: false, reason: 'forbidden' });
    expect(getPosts()).toEqual(before);
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([{ id: 'missing' }, {}, undefined])('does not confirm a missing target %j', fields => {
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deletePost(fields)).toEqual({ ok: false, reason: 'not_found' });
    expect(getPosts()).toEqual([POST]);
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['removed', 'ownership', 'logout', 'stale'])('rechecks %s changes during confirmation before any write', change => {
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      if (change === 'removed') savePosts([{ ...POST, id: NEW_ID }]);
      if (change === 'ownership') savePosts([{ ...POST, authorId: 'other' }]);
      if (change === 'logout') localStorage.removeItem('writespace_session');
      if (change === 'stale') saveUsers([]);
      return true;
    });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(deletePost({ id: ID })).toEqual({ ok: false, reason: change === 'removed' ? 'not_found' : 'forbidden' });
    const expected = change === 'removed' ? [{ ...POST, id: NEW_ID }]
      : change === 'ownership' ? [{ ...POST, authorId: 'other' }] : [POST];
    expect(getPosts()).toEqual(expected);
    expect(write.mock.calls.filter(([key]) => key === 'writespace_posts')).toHaveLength(
      ['removed', 'ownership'].includes(change) ? 1 : 0,
    );
  });

  it('preserves posts added during confirmation by rereading instead of overwriting a stale array', () => {
    const other = { ...POST, id: NEW_ID, title: 'Added during confirmation' };
    vi.spyOn(window, 'confirm').mockImplementation(() => { savePosts([POST, other]); return true; });
    expect(deletePost({ id: ID })).toEqual({ ok: true, removedId: ID, navigateTo: '/blogs' });
    expect(getPosts()).toEqual([other]);
  });

  it('leaves durable state intact when confirmed deletion cannot be saved', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const raw = localStorage.getItem('writespace_posts');
    failWrites();
    expect(deletePost({ id: ID })).toEqual({ ok: false, reason: 'storage_write_failed' });
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual([POST]);
  });
});
