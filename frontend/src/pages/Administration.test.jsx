/** Exercise administration components and real guarded routes against durable browser storage. */
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { UserRow } from '../components/UserRow.jsx';
import { getUsers, getPosts, saveUsers, savePosts } from '../utils/storage.js';
import { getSession, setSession } from '../utils/auth.js';
import { userView } from '../utils/users.js';

const DATE = '2026-03-04T12:00:00.000Z';
const ID = '00000000-0000-4000-8000-000000000010';
const NEW_ID = '00000000-0000-4000-8000-000000000011';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const USER = { id: ID, displayName: 'Casey', username: 'casey', password: 'private-demo', role: 'user', createdAt: DATE };
const STORED_ADMIN = { ...USER, role: 'admin' };
const SESSION = { userId: ID, displayName: USER.displayName, username: USER.username, role: 'user' };

/** Build complete posts with deterministic ids and increasing creation timestamps. */
function post(index) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Story ${index}`, content: `Literal content ${index}`, createdAt: `2026-03-${String(index).padStart(2, '0')}T12:00:00.000Z`,
    authorId: ID, authorName: 'Casey',
  };
}

beforeEach(() => {
  saveUsers([USER]);
  setSession(ADMIN);
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
});

/** Mount the production route composition in StrictMode under its single test router. */
function mount(path = '/admin') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
}

/** Fail one collection's writes without hiding the actual durable collection. */
function failWrites(collection) {
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function persist(key, value) {
    if (key === `writespace_${collection}`) throw new DOMException('private diagnostic', 'QuotaExceededError');
    return write.call(this, key, value);
  });
}

/** Fill the actual controlled management inputs with a demo credential. */
async function fill(user, role = 'user', username = 'riley') {
  await user.type(screen.getByLabelText('Display name', { exact: true }), 'Riley Writer');
  await user.type(screen.getByLabelText('Username', { exact: true }), username);
  await user.type(screen.getByLabelText('Password', { exact: true }), 'secret-demo-only');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Role' }), role);
}

/** Select the desktop table account action; responsive copies are tested separately. */
function deleteAccount(username = 'casey') {
  return within(screen.getByRole('table', { name: 'Local accounts' }))
    .getByRole('button', { name: `Delete ${username}` });
}

describe('StatCard and UserRow props', () => {
  it('renders exact labels and counts including zero without side effects', () => {
    const view = render(
      <StatCard label="Total Users" value={12} />,
    );
    expect(within(screen.getByRole('group', { name: 'Total Users' })).getByText('12')).toHaveClass('tabular-nums');
    view.rerender(
      <StatCard label="Total users" value={0} />,
    );
    expect(screen.getByRole('group', { name: 'Total users' })).toHaveTextContent('0');
  });

  it.each([-1, NaN, Infinity])('fails safely to zero for unusable count %s', value => {
    render(
      <StatCard label="Total Posts" value={value} />,
    );
    expect(screen.getByRole('group')).toHaveTextContent('Total Posts0');
  });

  it.each(['table', 'card'])('renders password-free literal account details in %s mode and activates only by click', async mode => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const view = { ...userView(USER), displayName: '<b>Casey</b>' };
    const row = (
      <UserRow user={view} session={ADMIN} onDelete={onDelete} mode={mode} />
    );
    render(mode === 'table' ? (
      <table>
        <tbody>
          {row}
        </tbody>
      </table>
    ) : row);
    expect(screen.getByText('<b>Casey</b>')).toBeInTheDocument();
    expect(screen.getByText('Mar 04, 2026')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'User avatar' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(USER.password);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete casey' }));
    expect(onDelete).toHaveBeenCalledWith(ID);
  });

  it.each(['built-in', 'current', 'anonymous', 'user'])('disables %s account deletion without callback', async kind => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const view = kind === 'built-in'
      ? { id: 'admin', displayName: 'Admin', username: 'admin', role: 'admin', createdAt: '' } : userView(STORED_ADMIN);
    const session = kind === 'current' ? { ...SESSION, role: 'admin' }
      : kind === 'anonymous' ? null : kind === 'user' ? SESSION : ADMIN;
    render(
      <UserRow user={view} session={session} onDelete={onDelete} mode="card" />,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    if (kind === 'built-in') expect(button).toHaveAttribute('title', 'Default admin cannot be deleted.');
    await user.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  });
});

describe('administration routes and dashboard', () => {
  it.each(['/admin', '/users'])('never mutates, generates metadata or confirms during StrictMode render at %s', path => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const confirm = vi.spyOn(window, 'confirm');
    const date = vi.spyOn(Date.prototype, 'toISOString');
    mount(path);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(date).not.toHaveBeenCalled();
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['/admin', '/users'])('redirects anonymous %s to login without exposing admin pages', path => {
    localStorage.removeItem('writespace_session');
    mount(path);
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create User' })).not.toBeInTheDocument();
  });

  it.each(['/admin', '/users'])('redirects ordinary user %s to blogs with no admin navigation', path => {
    setSession(SESSION);
    mount(path);
    expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users', exact: true })).not.toBeInTheDocument();
  });

  it.each(['/admin', '/users'])('treats demoted stored-admin session as stale at %s without repair', path => {
    saveUsers([STORED_ADMIN]);
    setSession({ ...SESSION, role: 'admin' });
    saveUsers([USER]);
    const raw = localStorage.getItem('writespace_session');
    mount(path);
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_session')).toBe(raw);
  });

  it('shows all four exact counts at zero with one default admin and provisional disclaimer', () => {
    saveUsers([]);
    mount();
    const stats = screen.getByRole('region', { name: 'Statistics' });
    expect(within(stats).getAllByRole('group')).toHaveLength(4);
    for (const [label, count] of [['Total Posts', 0], ['Total Users', 0], ['Total Admins', 1], ['Total users', 0]]) {
      expect(within(stats).getByRole('group', { name: label }).textContent).toBe(`${label}${count}`);
    }
    expect(screen.getByText(/Provisional counts:/)).toHaveTextContent('await product confirmation');
    expect(screen.getByText('No posts yet.')).toBeInTheDocument();
  });

  it('counts stored admins plus built-in, duplicates stored-user counts, sorts and limits latest five', () => {
    saveUsers([USER, { ...STORED_ADMIN, id: NEW_ID, username: 'second-admin' }]);
    savePosts([post(2), post(6), post(1), post(4), post(3), post(5)]);
    mount();
    for (const [label, count] of [['Total Posts', 6], ['Total Users', 2], ['Total Admins', 2], ['Total users', 2]]) {
      expect(screen.getByRole('group', { name: label }).textContent).toBe(`${label}${count}`);
    }
    const rows = screen.getAllByRole('article');
    expect(rows.map(row => within(row).getByRole('heading').textContent)).toEqual(['Story 6', 'Story 5', 'Story 4', 'Story 3', 'Story 2']);
    expect(screen.queryByRole('link', { name: 'Story 1' })).not.toBeInTheDocument();
    rows.forEach(row => {
      expect(within(row).getByRole('link', { name: 'Edit' })).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });
  });

  it.each([['Write New Post', 'Write a Post'], ['Manage Users', 'User Management']])(
    'activates quick action %s through real route navigation', async (label, heading) => {
      const user = userEvent.setup();
      mount();
      const nav = screen.getByRole('navigation', { name: 'Quick actions' });
      expect(within(nav).getAllByRole('link')).toHaveLength(2);
      await user.click(within(nav).getByRole('link', { name: label }));
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    },
  );

  it('inline edit manages another writer post and preserves all metadata on save', async () => {
    savePosts([post(1)]);
    const user = userEvent.setup();
    mount();
    await user.click(within(screen.getByRole('article')).getByRole('link', { name: 'Edit' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Story 1');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Revised by admin');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(getPosts()).toEqual([{ ...post(1), title: 'Revised by admin' }]);
  });

  it('cancelled dashboard deletion keeps the post and route without writes', async () => {
    savePosts([post(1)]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    mount();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(getPosts()).toEqual([post(1)]);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument();
  });

  it('successful dashboard deletion navigates to blogs only after removing the selected post', async () => {
    savePosts([post(1), post(2)]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    mount();
    await user.click(within(screen.getByRole('article', { name: 'Story 1' })).getByRole('button', { name: 'Delete' }));
    expect(getPosts()).toEqual([post(2)]);
    expect(screen.getByRole('heading', { level: 1, name: 'All Posts' })).toBeInTheDocument();
  });

  it('keeps dashboard rows on failed post writes and excludes raw errors', async () => {
    savePosts([post(1)]);
    const raw = localStorage.getItem('writespace_posts');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    mount();
    failWrites('posts');
    await user.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to delete this post. It has not been deleted.');
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(document.body.textContent).not.toMatch(/private diagnostic|quota|storage_write_failed/);
  });

  it.each(['logout', 'user', 'demoted', 'removed'])('rechecks %s before dashboard delete', async change => {
    savePosts([post(1)]);
    if (change === 'demoted') {
      saveUsers([STORED_ADMIN]);
      setSession({ ...SESSION, role: 'admin' });
    }
    const user = userEvent.setup();
    mount();
    if (change === 'logout') localStorage.removeItem('writespace_session');
    if (change === 'user') setSession(SESSION);
    if (change === 'demoted') saveUsers([USER]);
    if (change === 'removed') savePosts([]);
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(change === 'removed' ? 'Post not found.' : 'You no longer have permission');
    expect(getPosts()).toEqual(change === 'removed' ? [] : [post(1)]);
  });
});

describe('user management', () => {
  it('shows scoped desktop headers and stacked mobile cards without password projections', () => {
    mount('/users');
    const table = screen.getByRole('table', { name: 'Local accounts' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
    within(table).getAllByRole('columnheader').forEach(header => expect(header).toHaveAttribute('scope', 'col'));
    expect(table.parentElement).toHaveClass('hidden', 'sm:block');
    expect(screen.getByRole('article', { name: 'Account casey' }).parentElement).toHaveClass('sm:hidden');
    expect(deleteAccount('admin')).toBeDisabled();
    expect(deleteAccount('admin')).toHaveAttribute('title', 'Default admin cannot be deleted.');
    expect(document.body.textContent).not.toContain(USER.password);
  });

  it('marks required blank fields with associated aria alerts without writes', async () => {
    const user = userEvent.setup();
    mount('/users');
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    for (const label of ['Display name', 'Username', 'Password']) {
      const input = screen.getByLabelText(label, { exact: true });
      expect(input).toHaveAttribute('required');
      expect(input).toHaveAttribute('aria-required', 'true');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription(`${label} is required.`);
    }
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveAttribute('aria-required', 'true');
    expect(getUsers()).toEqual([USER]);
    expect(window.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['displayName', 'username', 'password'])('validates whitespace-only %s while retaining other fields', async name => {
    const user = userEvent.setup();
    mount('/users');
    await fill(user);
    const label = { displayName: 'Display name', username: 'Username', password: 'Password' }[name];
    await user.clear(screen.getByLabelText(label, { exact: true }));
    await user.type(screen.getByLabelText(label, { exact: true }), '   ');
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText(label, { exact: true })).toHaveValue('   ');
    expect(getUsers()).toEqual([USER]);
  });

  it.each(['admin', 'user'])('creates %s, reports success, clears inputs and never echoes password', async role => {
    const user = userEvent.setup();
    mount('/users');
    await fill(user, role);
    expect(getUsers()).toEqual([USER]);
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    expect(getUsers()[1]).toMatchObject({ id: NEW_ID, displayName: 'Riley Writer', username: 'riley', role, password: 'secret-demo-only' });
    expect(getUsers()[1].createdAt).toBe(new Date(getUsers()[1].createdAt).toISOString());
    expect(screen.getByRole('status')).toHaveTextContent('Account created successfully.');
    expect(deleteAccount('riley')).toBeEnabled();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('');
    expect(document.body.textContent).not.toContain('secret-demo-only');
    expect(getSession()).toEqual(ADMIN);
  });

  it.each(['admin', 'casey'])('rejects reserved/duplicate %s while retaining fields and associating username error', async username => {
    const user = userEvent.setup();
    mount('/users');
    await fill(user, 'admin', username);
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    expect(screen.getByLabelText('Username', { exact: true })).toHaveAccessibleDescription('This username is already taken. Choose another username.');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('secret-demo-only');
    expect(screen.getByRole('combobox')).toHaveValue('admin');
    expect(getUsers()).toEqual([USER]);
    expect(document.body.textContent).not.toContain('secret-demo-only');
  });

  it('rejects a tampered role with an associated error and no mutation', async () => {
    const user = userEvent.setup();
    mount('/users');
    await fill(user);
    const select = screen.getByRole('combobox');
    const invalid = document.createElement('option');
    invalid.value = 'owner';
    invalid.textContent = 'Owner';
    select.append(invalid);
    fireEvent.change(select, { target: { value: 'owner' } });
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    expect(select).toHaveAccessibleDescription('Choose Admin or User.');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(getUsers()).toEqual([USER]);
  });

  it.each(['write', 'missing-uuid', 'throwing-uuid'])('retains controlled fields and stored list after %s failure', async kind => {
    const user = userEvent.setup();
    mount('/users');
    await fill(user, 'admin');
    const raw = localStorage.getItem('writespace_users');
    if (kind === 'write') failWrites('users');
    if (kind === 'missing-uuid') vi.spyOn(window, 'crypto', 'get').mockReturnValue({});
    if (kind === 'throwing-uuid') window.crypto.randomUUID.mockImplementation(() => { throw new Error('private diagnostic'); });
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    expect(screen.getByRole('alert')).toHaveTextContent(kind === 'write' ? 'Unable to save account changes.' : 'Unable to create an account');
    expect(screen.getByLabelText('Display name', { exact: true })).toHaveValue('Riley Writer');
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('riley');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('secret-demo-only');
    expect(screen.getByRole('combobox')).toHaveValue('admin');
    expect(localStorage.getItem('writespace_users')).toBe(raw);
    expect(document.body.textContent).not.toMatch(/secret-demo-only|private diagnostic|storage_write_failed|id_unavailable/);
  });

  it.each(['logout', 'user', 'demoted'])('rechecks current %s on create and preserves draft with safe forbidden feedback', async kind => {
    if (kind === 'demoted') {
      saveUsers([STORED_ADMIN]);
      setSession({ ...SESSION, role: 'admin' });
    }
    const user = userEvent.setup();
    mount('/users');
    await fill(user);
    if (kind === 'logout') localStorage.removeItem('writespace_session');
    if (kind === 'user') setSession(SESSION);
    if (kind === 'demoted') saveUsers([USER]);
    const before = getUsers();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(screen.getByRole('button', { name: 'Create User' }));
    expect(screen.getByRole('alert')).toHaveTextContent('You no longer have permission to manage accounts.');
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('riley');
    expect(getUsers()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });

  it('disables both built-in and current stored admin before any confirmation', async () => {
    saveUsers([STORED_ADMIN]);
    setSession({ ...SESSION, role: 'admin' });
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    mount('/users');
    expect(deleteAccount()).toBeDisabled();
    await user.click(deleteAccount());
    await user.click(deleteAccount('admin'));
    expect(confirm).not.toHaveBeenCalled();
    expect(getUsers()).toEqual([STORED_ADMIN]);
  });

  it('cancels delete without writes or losing typed form fields', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount('/users');
    await fill(user);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(deleteAccount());
    expect(getUsers()).toEqual([USER]);
    expect(deleteAccount()).toBeInTheDocument();
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('riley');
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps list and draft after failed confirmed delete then deletes through the mobile callback', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount('/users');
    await fill(user);
    failWrites('users');
    await user.click(deleteAccount());
    expect(screen.getByRole('alert')).toHaveTextContent('No changes have been saved.');
    expect(getUsers()).toEqual([USER]);
    expect(screen.getByLabelText('Username', { exact: true })).toHaveValue('riley');
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(within(screen.getByRole('article', { name: 'Account casey' })).getByRole('button'));
    expect(getUsers()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Delete casey' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Account deleted successfully.');
  });

  it.each(['logout', 'user', 'own', 'removed'])('rechecks %s at delete activation rather than trusting the displayed row', async kind => {
    const user = userEvent.setup();
    mount('/users');
    const button = deleteAccount();
    if (kind === 'logout') localStorage.removeItem('writespace_session');
    if (kind === 'user') setSession(SESSION);
    if (kind === 'own') {
      saveUsers([STORED_ADMIN]);
      setSession({ ...SESSION, role: 'admin' });
    }
    if (kind === 'removed') saveUsers([]);
    const before = getUsers();
    const confirm = vi.spyOn(window, 'confirm');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await user.click(button);
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(getUsers()).toEqual(before);
    expect(screen.getByRole('alert')).toHaveTextContent(kind === 'removed' ? 'This account no longer exists.' : 'You no longer have permission');
  });

  it('reauthorizes a changed active account while confirmation is open', async () => {
    const user = userEvent.setup();
    mount('/users');
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      saveUsers([STORED_ADMIN]);
      setSession({ ...SESSION, role: 'admin' });
      return true;
    });
    await user.click(deleteAccount());
    expect(screen.getByRole('alert')).toHaveTextContent('You no longer have permission');
    expect(getUsers()).toEqual([STORED_ADMIN]);
    expect(deleteAccount()).toBeDisabled();
  });
});
