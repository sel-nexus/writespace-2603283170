/** Verify immutable browsing snapshots, full readers, current-session guards, and ownership with real local records. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../App.jsx';
import Home, { newestPosts } from './Home.jsx';
import ReadBlog, { canManagePost } from './ReadBlog.jsx';
import { getPosts, savePosts, saveUsers } from '../utils/storage.js';

const USER_ID = '00000000-0000-4000-8000-000000000010';
const ADMIN_ID = '00000000-0000-4000-8000-000000000011';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const USER = {
  id: USER_ID, displayName: 'Riley Writer', username: 'riley', password: 'demo-only',
  role: 'user', createdAt: '2026-01-01T00:00:00Z',
};
const REGISTERED_ADMIN = { ...USER, id: ADMIN_ID, username: 'casey', displayName: 'Casey Admin', role: 'admin' };
const SESSION = { userId: USER_ID, username: USER.username, displayName: USER.displayName, role: 'user' };
const ADMIN_SESSION = {
  userId: ADMIN_ID, username: REGISTERED_ADMIN.username, displayName: REGISTERED_ADMIN.displayName, role: 'admin',
};

/** Build a complete schema-valid local post for isolated behavior tests. */
function post(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Post ${index}`,
    content: `First paragraph ${index}.\n\n  Second paragraph.\n${'long-word'.repeat(50)}`,
    createdAt: `2026-03-${String(index).padStart(2, '0')}T12:00:00Z`,
    authorId: USER_ID,
    authorName: USER.displayName,
    ...overrides,
  };
}

/** Seed complete accounts before establishing a matching password-free session. */
function seedSession(session = ADMIN) {
  saveUsers([USER, REGISTERED_ADMIN]);
  localStorage.setItem('writespace_session', JSON.stringify(session));
}

/** Mount the integrated route tree in StrictMode using the existing single-router convention. */
function mount(path = '/blogs', element = <App />) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        {element}
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('newestPosts', () => {
  it('handles empty and single-post collections by returning a copy', () => {
    const empty = Object.freeze([]);
    expect(newestPosts(empty)).toEqual([]);
    expect(newestPosts(empty)).not.toBe(empty);
    const single = Object.freeze([Object.freeze(post(1))]);
    expect(newestPosts(single)).toEqual(single);
    expect(newestPosts(single)).not.toBe(single);
  });

  it('sorts every post by timestamp descending without changing a frozen source or its records', () => {
    const original = Object.freeze([post(2), post(1), post(4), post(3)].map(Object.freeze));
    expect(newestPosts(original).map(record => record.title)).toEqual(['Post 4', 'Post 3', 'Post 2', 'Post 1']);
    expect(original.map(record => record.title)).toEqual(['Post 2', 'Post 1', 'Post 4', 'Post 3']);
  });

  it('preserves original order for equal instants including timezone-equivalent dates', () => {
    const records = [post(1), post(2, { createdAt: '2026-03-01T14:00:00+02:00' }), post(3, { createdAt: post(1).createdAt })];
    expect(newestPosts(records).map(record => record.id)).toEqual(records.map(record => record.id));
  });

  it('sorts invalid dates last and stably, on either side of a comparison', () => {
    const records = [post(1, { createdAt: 'bad' }), post(2), post(3, { createdAt: '' }), post(4)];
    expect(newestPosts(records).map(record => record.title)).toEqual(['Post 4', 'Post 2', 'Post 1', 'Post 3']);
    expect(newestPosts([records[2], records[0]])).toEqual([records[2], records[0]]);
  });
});

describe('Home', () => {
  it.each([ADMIN, SESSION])('renders exact empty copy and a write link for either authenticated role', session => {
    seedSession(session);
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
    expect(screen.getByText('No blogs yet. Be the first to write one!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write a Post' })).toHaveAttribute('href', '/write');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows all posts newest-first in the explicit one/two/three-column responsive grid', () => {
    seedSession();
    savePosts([post(1), post(3), post(2), post(4)]);
    const raw = localStorage.getItem('writespace_posts');
    mount();
    const grid = screen.getByRole('region', { name: 'All posts' });
    expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
    expect(within(grid).getAllByRole('heading').map(heading => heading.textContent))
      .toEqual(['Post 4', 'Post 3', 'Post 2', 'Post 1']);
    expect(within(grid).getAllByRole('article')).toHaveLength(4);
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
  });

  it.each(['former-user', '__proto__', 'constructor'])(
    'resolves administrator authors and safely falls back for missing author %s', formerId => {
    seedSession();
    savePosts([
      post(1, { authorId: ADMIN_ID, authorName: REGISTERED_ADMIN.displayName }),
      post(2, { authorId: formerId, authorName: 'Former Writer' }),
      post(3, { authorId: 'admin', authorName: 'Admin' }),
    ]);
    mount();
    expect(screen.getAllByRole('img', { name: 'Admin avatar' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'User avatar' })).toBeInTheDocument();
    expect(screen.getByText('Former Writer')).toBeInTheDocument();
    expect(screen.queryByText(USER.password)).not.toBeInTheDocument();
  });

  it('keeps its mount snapshot through rerenders, then reads fresh posts on remount', () => {
    savePosts([post(1)]);
    const view = mount('/blogs', <Home />);
    savePosts([post(2)]);
    view.rerender(
      <StrictMode>
        <MemoryRouter initialEntries={['/blogs']}>
          <Home />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(screen.getByRole('link', { name: 'Post 1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Post 2' })).not.toBeInTheDocument();
    view.unmount();
    mount('/blogs', <Home />);
    expect(screen.getByRole('link', { name: 'Post 2' })).toBeInTheDocument();
  });

  it.each(['{broken', '{}', '[{"id":"invalid"}]'])('uses the empty state for corrupted post storage without repair: %s', raw => {
    seedSession();
    localStorage.setItem('writespace_posts', raw);
    mount();
    expect(screen.getByText('No blogs yet. Be the first to write one!')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
  });

  it('uses the empty fallback when only post reads are unavailable, without hiding a valid built-in session', () => {
    seedSession();
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function readItem(key) {
      if (key === 'writespace_posts') throw new DOMException('private', 'SecurityError');
      return read.call(this, key);
    });
    mount();
    expect(screen.getByText('No blogs yet. Be the first to write one!')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Authenticated navigation' })).toBeInTheDocument();
  });
});

describe('canManagePost', () => {
  it.each([
    [ADMIN, true], [ADMIN_SESSION, true], [SESSION, true],
    [{ ...SESSION, userId: 'someone-else' }, false], [null, false], [undefined, false],
    [{ ...SESSION, role: 'guest' }, false], [{ ...SESSION, role: 'ADMIN' }, false],
  ])('allows only an administrator or ordinary matching owner: %j', (session, allowed) => {
    expect(canManagePost(session, post(1))).toBe(allowed);
  });
});

describe('ReadBlog and reading routes', () => {
  it('activates list -> reader -> back links with complete exact text and unchanged persisted records', async () => {
    seedSession(SESSION);
    const record = post(1);
    savePosts([record]);
    const raw = localStorage.getItem('writespace_posts');
    const user = userEvent.setup();
    mount();
    expect(document.querySelector('article > p').textContent).toBe(record.content.slice(0, 120));
    await user.click(screen.getByRole('link', { name: record.title }));
    expect(screen.getByRole('heading', { level: 1, name: record.title })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(record.content);
    expect(document.querySelector('article > p')).toHaveClass('whitespace-pre-wrap', 'break-words');
    expect(document.querySelector('article')).toHaveClass('max-w-[75ch]');
    expect(screen.getByText(record.authorName)).toBeInTheDocument();
    expect(screen.getByText('Mar 01, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/edit/${record.id}`);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to All Posts' }));
    expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual([record]);
  });

  it.each([ADMIN, ADMIN_SESSION, SESSION])('displays Edit for an administrator or owner on a deep reader route', session => {
    seedSession(session);
    savePosts([post(1)]);
    mount(`/blog/${post(1).id}`);
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/edit/${post(1).id}`);
  });

  it('shows only back-to-list for a non-owner, and uses the registered author role', () => {
    seedSession(SESSION);
    const record = post(1, { authorId: ADMIN_ID, authorName: REGISTERED_ADMIN.displayName });
    savePosts([record]);
    mount(`/blog/${record.id}`);
    const actions = screen.getByRole('navigation', { name: 'Post actions' });
    expect(within(actions).getAllByRole('link')).toHaveLength(1);
    expect(within(actions).getByRole('link', { name: 'Back to All Posts' })).toHaveAttribute('href', '/blogs');
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  });

  it('renders full hostile text as text, including title and author, with the built-in avatar', () => {
    seedSession();
    const record = post(1, {
      title: '<img src=x onerror=alert(1)>', authorId: 'admin', authorName: '<em>Admin</em>',
      content: `<script>alert(1)</script>\n\n  <b>literal</b>\n${'x'.repeat(10000)}`,
    });
    savePosts([record]);
    mount(`/blog/${record.id}`);
    expect(screen.getByRole('heading', { name: record.title })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(record.content);
    expect(screen.getByText(record.authorName)).toBeInTheDocument();
    expect(document.querySelector('article img, article script, article b, article em')).toBeNull();
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  });

  it.each(['missing', 'invalid-id'])('shows exact not-found text and back link for missing ID %s', id => {
    seedSession();
    savePosts([post(1)]);
    mount(`/blog/${id}`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Post not found.');
    expect(screen.getByRole('link', { name: 'Back to All Posts' })).toHaveAttribute('href', '/blogs');
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows not-found for corrupt posts without repairing the collection', () => {
    seedSession();
    localStorage.setItem('writespace_posts', '{broken');
    mount(`/blog/${post(1).id}`);
    expect(screen.getByRole('heading', { name: 'Post not found.' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe('{broken');
  });

  it('resolves a changed route parameter without retaining the previous reader content', async () => {
    savePosts([post(1), post(2)]);
    const user = userEvent.setup();
    mount(`/blog/${post(1).id}`, (
      <>
        <Link to={`/blog/${post(2).id}`}>
          Next test post
        </Link>
        <Routes>
          <Route path="/blog/:id" element={<ReadBlog />} />
        </Routes>
      </>
    ));
    await user.click(screen.getByRole('link', { name: 'Next test post' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Post 2' })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(post(2).content);
    expect(screen.queryByRole('heading', { name: 'Post 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it.each(['/blogs', `/blog/${post(1).id}`])('denies guest access to %s before rendering protected content', path => {
    savePosts([post(1)]);
    mount(path);
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All Posts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: post(1).title })).not.toBeInTheDocument();
  });

  it('rechecks current storage at route activation rather than trusting the older shell session', async () => {
    seedSession(SESSION);
    savePosts([post(1)]);
    const user = userEvent.setup();
    mount();
    localStorage.removeItem('writespace_session');
    await user.click(screen.getByRole('link', { name: 'Post 1' }));
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Post 1' })).not.toBeInTheDocument();
  });

  it('denies a stale account session without deleting or repairing it', () => {
    localStorage.setItem('writespace_session', JSON.stringify(SESSION));
    savePosts([post(1)]);
    mount(`/blog/${post(1).id}`);
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(SESSION);
  });

  it.each(['/blogs', `/blog/${post(1).id}`, '/blog/missing'])(
    'does not write, remove, generate IDs, or confirm during StrictMode render at %s', path => {
      seedSession();
      savePosts([post(1)]);
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const remove = vi.spyOn(Storage.prototype, 'removeItem');
      const uuid = vi.spyOn(window.crypto, 'randomUUID');
      const confirm = vi.spyOn(window, 'confirm');
      mount(path);
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(uuid).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(getPosts()).toEqual([post(1)]);
    },
  );

  it('preserves the public unknown-route fallback rather than treating it as a missing post', () => {
    mount('/unknown');
    expect(screen.getByRole('heading', { name: 'Page not found.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to WriteSpace' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('Post not found.')).not.toBeInTheDocument();
  });
});
