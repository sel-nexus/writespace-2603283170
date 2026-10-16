/** Exercise authoring routes and explicitly activated mutations against real local persistence in StrictMode. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); });
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../App.jsx';
import Home from './Home.jsx';
import WriteBlog from './WriteBlog.jsx';
import { getPosts, savePosts, saveUsers } from '../utils/storage.js';
import { setSession } from '../utils/auth.js';

const ID = '00000000-0000-4000-8000-000000000001';
const NEW_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000010';
const DATE = '2026-03-04T12:00:00.000Z';
const USER = { id: USER_ID, username: 'riley', displayName: 'Riley', password: 'demo', role: 'user', createdAt: DATE };
const OWNER = { userId: USER_ID, username: 'riley', displayName: 'Riley', role: 'user' };
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const POST = { id: ID, title: 'Original note', content: '  First\n\n Last  ', createdAt: DATE, authorId: USER_ID, authorName: 'Riley' };

beforeEach(() => {
  saveUsers([USER]);
  setSession(OWNER);
  savePosts([POST]);
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
});

/** Mount the real guarded routes without a second router or mocked mutation layer. */
function mount(path = '/write') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
}

/** Keep one authoring instance mounted while explicit links change its matched child route. */
function mountRouteHarness() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/write']}>
        <nav aria-label="Authoring test targets">
          <Link to="/write">Create target</Link>
          <Link to={`/edit/${ID}`}>First edit target</Link>
          <Link to={`/edit/${NEW_ID}`}>Second edit target</Link>
        </nav>
        <Routes>
          <Route element={<WriteBlog />}>
            <Route path="/write" element={<></>} />
            <Route path="/edit/:id" element={<></>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

/** Fail only post writes, retaining normal storage reads and all durable data. */
function failWrites() {
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function persist(key, value) {
    if (key === 'writespace_posts') throw new DOMException('private detail', 'SecurityError');
    return write.call(this, key, value);
  });
}

/** Enter literal multiline content through real controls. */
async function fill(user, title = '  New title  ', content = '  New text\n\n Last line  ') {
  await user.clear(screen.getByRole('textbox', { name: 'Title' }));
  await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.clear(screen.getByRole('textbox', { name: 'Content' }));
  await user.type(screen.getByRole('textbox', { name: 'Content' }), content);
}

describe('authoring routes and form', () => {
  it.each(['/write', `/edit/${ID}`, '/edit/missing', `/blog/${ID}`])(
    'never writes, generates IDs/dates, or confirms during StrictMode render at %s', path => {
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const remove = vi.spyOn(Storage.prototype, 'removeItem');
      const confirm = vi.spyOn(window, 'confirm');
      const date = vi.spyOn(Date.prototype, 'toISOString');
      mount(path);
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(window.crypto.randomUUID).not.toHaveBeenCalled();
      expect(date).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(getPosts()).toEqual([POST]);
    },
  );

  it.each(['/write', `/edit/${ID}`])('guards %s for anonymous and stale sessions', path => {
    saveUsers([]);
    const raw = localStorage.getItem('writespace_session');
    mount(path);
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();
    expect(localStorage.getItem('writespace_session')).toBe(raw);
  });

  it('guards anonymous write before revealing form', () => {
    localStorage.removeItem('writespace_session');
    mount();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();
  });

  it('shows exact missing post state without editable fields', () => {
    mount('/edit/missing');
    expect(screen.getByRole('heading', { name: 'Post not found.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to All Posts' })).toHaveAttribute('href', '/blogs');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(getPosts()).toEqual([POST]);
  });

  it('redirects a non-owner declaratively before displaying the form', () => {
    savePosts([{ ...POST, authorId: 'other' }]);
    mount(`/edit/${ID}`);
    expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('reports both required fields with associated errors and no mutation on blank submission', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Publish Post' }));
    const title = screen.getByRole('textbox', { name: 'Title' });
    const content = screen.getByRole('textbox', { name: 'Content' });
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Title is required.');
    expect(content).toHaveAttribute('aria-invalid', 'true');
    expect(content).toHaveAccessibleDescription('Content is required. 0 characters');
    expect(content).toHaveClass('min-h-64');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(getPosts()).toEqual([POST]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['title', 'content'])('validates whitespace-only %s independently without losing the other value', async field => {
    const user = userEvent.setup();
    mount();
    await fill(user, field === 'title' ? '   ' : 'Valid title', field === 'content' ? '\n  ' : 'Valid content');
    await user.click(screen.getByRole('button', { name: 'Publish Post' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(field === 'title' ? 'Title is required.' : 'Content is required.');
    expect(getPosts()).toEqual([POST]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('creates once on explicit submission with exact multiline content and current attribution', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-01T09:00:00Z'));
    const user = userEvent.setup();
    mount();
    const content = '  New text\n\n Last line  ';
    await fill(user, '  New title  ', content);
    expect(screen.getByText(`${content.length} characters`)).toBeInTheDocument();
    expect(getPosts()).toEqual([POST]);
    await user.click(screen.getByRole('button', { name: 'Publish Post' }));
    const expected = {
      id: NEW_ID, title: 'New title', content, createdAt: '2026-04-01T09:00:00.000Z', authorId: USER_ID, authorName: 'Riley',
    };
    expect(getPosts()).toEqual([POST, expected]);
    expect(screen.getByRole('heading', { level: 1, name: expected.title })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(content);
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([OWNER, ADMIN])('prefills edit and preserves every metadata field after saving as %j', async session => {
    setSession(session);
    const user = userEvent.setup();
    mount(`/edit/${ID}`);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(POST.title);
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(POST.content);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(getPosts()).toEqual([{ ...POST, title: 'New title', content: '  New text\n\n Last line  ' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'New title' })).toBeInTheDocument();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['validation', 'storage'])('resets %s errors across same-instance authoring targets', async kind => {
    const user = userEvent.setup();
    let records = [POST, { ...POST, id: NEW_ID, title: 'Second note', content: 'Second content' }];
    savePosts(records);
    window.crypto.randomUUID.mockReturnValue('00000000-0000-4000-8000-000000000003');
    mountRouteHarness();
    const title = screen.getByRole('textbox', { name: 'Title' });
    const content = screen.getByRole('textbox', { name: 'Content' });
    const nativeWrite = Storage.prototype.setItem;
    let blocked = false;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function persist(key, value) {
      if (blocked && key === 'writespace_posts') throw new DOMException('private detail', 'SecurityError');
      return nativeWrite.call(this, key, value);
    });
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const date = vi.spyOn(Date.prototype, 'toISOString');
    const confirm = vi.spyOn(window, 'confirm');
    const targets = [
      { link: 'First edit target', index: 0 },
      { link: 'Second edit target', index: 1 },
      { link: 'Create target', index: null },
    ];
    for (const [step, target] of targets.entries()) {
      if (kind === 'validation') {
        await user.clear(title);
        await user.clear(content);
      } else {
        await fill(user, 'Unsaved target title', 'Unsaved target content');
        blocked = true;
      }
      await user.click(screen.getByRole('button', { name: step === 0 ? 'Publish Post' : 'Save Changes' }));
      blocked = false;
      if (kind === 'validation') {
        expect(screen.getAllByRole('alert')).toHaveLength(2);
        expect(title).toHaveAccessibleDescription('Title is required.');
        expect(content).toHaveAccessibleDescription('Content is required. 0 characters');
      } else {
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to save this post. Your draft has not been saved.');
      }
      if (target.index !== null) {
        records = records.map((record, index) => index === target.index
          ? { ...record, title: `Latest title ${step}`, content: `Latest content ${step}` }
          : record);
        savePosts(records);
      }
      const raw = localStorage.getItem('writespace_posts');
      for (const spy of [write, remove, date, confirm, window.crypto.randomUUID]) spy.mockClear();
      await user.click(screen.getByRole('link', { name: target.link }));
      expect(screen.getByRole('textbox', { name: 'Title' })).toBe(title);
      expect(screen.getByRole('textbox', { name: 'Content' })).toBe(content);
      expect(title).toHaveValue(target.index === null ? '' : records[target.index].title);
      expect(content).toHaveValue(target.index === null ? '' : records[target.index].content);
      expect(title).toHaveAttribute('aria-invalid', 'false');
      expect(content).toHaveAttribute('aria-invalid', 'false');
      expect(title).not.toHaveAttribute('aria-describedby');
      expect(content).toHaveAccessibleDescription(`${content.value.length} characters`);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      for (const spy of [write, remove, date, confirm, window.crypto.randomUUID]) expect(spy).not.toHaveBeenCalled();
      expect(localStorage.getItem('writespace_posts')).toBe(raw);
      expect(getPosts()).toEqual(records);
    }
  });

  it.each(['/write', `/edit/${ID}`])('cancel at %s returns without saving typed changes', async path => {
    const user = userEvent.setup();
    mount(path);
    await fill(user);
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { level: 1, name: path === '/write' ? 'All Posts' : POST.title })).toBeInTheDocument();
    expect(getPosts()).toEqual([POST]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['/write', `/edit/${ID}`])('retains values and durable bytes on storage error at %s without navigating', async path => {
    const user = userEvent.setup();
    mount(path);
    await fill(user);
    const raw = localStorage.getItem('writespace_posts');
    failWrites();
    await user.click(screen.getByRole('button', { name: path === '/write' ? 'Publish Post' : 'Save Changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save this post. Your draft has not been saved.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('  New title  ');
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('  New text\n\n Last line  ');
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(getPosts()).toEqual([POST]);
  });

  it.each(['missing', 'throws'])('retains create form for %s UUID support with safe error', async kind => {
    const user = userEvent.setup();
    mount();
    await fill(user);
    if (kind === 'missing') vi.spyOn(window, 'crypto', 'get').mockReturnValue({});
    else window.crypto.randomUUID.mockImplementation(() => { throw new Error('private detail'); });
    await user.click(screen.getByRole('button', { name: 'Publish Post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to create a post in this browser.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('  New title  ');
    expect(getPosts()).toEqual([POST]);
  });

  it.each(['logout', 'ownership', 'deleted'])('rechecks %s before saving an already displayed edit form', async change => {
    const user = userEvent.setup();
    mount(`/edit/${ID}`);
    await fill(user);
    if (change === 'logout') localStorage.removeItem('writespace_session');
    if (change === 'ownership') savePosts([{ ...POST, authorId: 'other' }]);
    if (change === 'deleted') savePosts([]);
    const before = getPosts();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(getPosts()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    if (change === 'deleted') expect(screen.getByRole('heading', { name: 'Post not found.' })).toBeInTheDocument();
    else if (change === 'ownership') expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
    else {
      expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();
    }
  });

  it.each(['logout', 'stale'])('retains a displayed create draft with safe forbidden feedback after %s', async change => {
    const user = userEvent.setup();
    mount();
    await fill(user);
    if (change === 'logout') localStorage.removeItem('writespace_session');
    else saveUsers([]);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Publish Post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('You no longer have permission to save this post.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('  New title  ');
    expect(getPosts()).toEqual([POST]);
    expect(write).not.toHaveBeenCalled();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('uses the current submit identity instead of the identity that rendered the create form', async () => {
    const user = userEvent.setup();
    mount();
    await fill(user);
    setSession(ADMIN);
    await user.click(screen.getByRole('button', { name: 'Publish Post' }));
    expect(getPosts()[1]).toMatchObject({ authorId: 'admin', authorName: 'Admin' });
    expect(getPosts()[0]).toEqual(POST);
  });

  it.each(['logout', 'stale'])('passes current %s session state to home cards on rerender', change => {
    const view = render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    if (change === 'logout') localStorage.removeItem('writespace_session');
    else saveUsers([]);
    view.rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: POST.title })).toBeInTheDocument();
    expect(getPosts()).toEqual([POST]);
  });
});

describe('reader deletion', () => {
  it.each([OWNER, ADMIN])('shows the explicit delete control to eligible identity %j', session => {
    setSession(session);
    mount(`/blog/${ID}`);
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeInTheDocument();
  });

  it('hides both management actions for a non-owner', () => {
    savePosts([{ ...POST, authorId: 'other' }]);
    mount(`/blog/${ID}`);
    expect(screen.queryByRole('button', { name: 'Delete post' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('cancelled deletion preserves the reader and exact durable post without a write', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount(`/blog/${ID}`);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(getPosts()).toEqual([POST]);
    expect(screen.getByRole('heading', { name: POST.title })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirmed deletion keeps unrelated posts and navigates only after successful persistence', async () => {
    const other = { ...POST, id: NEW_ID, title: 'Keep me' };
    savePosts([POST, other]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    mount(`/blog/${ID}`);
    await user.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(getPosts()).toEqual([other]);
    expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'All posts' })).getByRole('link', { name: 'Keep me' })).toBeInTheDocument();
  });

  it('retains the full reader and safe alert when confirmed deletion fails to write', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    mount(`/blog/${ID}`);
    failWrites();
    await user.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to delete this post. Nothing has been saved.');
    expect(screen.getByRole('heading', { name: POST.title })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(POST.content);
    expect(getPosts()).toEqual([POST]);
  });

  it('rechecks permission before confirmation when an already visible delete button is activated', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    mount(`/blog/${ID}`);
    localStorage.removeItem('writespace_session');
    await user.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('You no longer have permission to delete this post.');
    expect(getPosts()).toEqual([POST]);
  });
});
