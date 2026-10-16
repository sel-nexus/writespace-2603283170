/** Exercise identity form activation, retained fields, redirects, and parent shell persistence with real auth utilities. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App.jsx';
import LoginPage from './LoginPage.jsx';
import RegisterPage from './RegisterPage.jsx';
import { getSession } from '../utils/auth.js';
import { getUsers, saveUsers } from '../utils/storage.js';

const ID = '00000000-0000-4000-8000-000000000001';
const NEW_ID = '00000000-0000-4000-8000-000000000002';
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const USER = { id: ID, displayName: 'Riley', username: 'riley', password: 'demo-only', role: 'user', createdAt: '2026-01-01T00:00:00Z' };
const SESSION = { userId: ID, displayName: 'Riley', username: 'riley', role: 'user' };

/** Expose the current router URL as test harness output. */
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Location">
      {location.pathname}
    </output>
  );
}

/** Mount either the integrated shell or a form inside the existing single-router convention. */
function mount(path = '/', element = <App />) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        {element}
        <Location />
      </MemoryRouter>
    </StrictMode>,
  );
}

/** Fill a complete valid writer form through actual inputs without submitting it. */
async function fillRegistration(user, username = 'casey') {
  await user.type(screen.getByLabelText('Display name'), 'Casey Writer');
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), 'local-only');
  await user.type(screen.getByLabelText('Confirm password'), 'local-only');
}

/** Verify values retained in controlled inputs without displaying passwords as text. */
function expectRetained(username = 'casey') {
  expect(screen.getByLabelText('Display name')).toHaveValue('Casey Writer');
  expect(screen.getByLabelText('Username')).toHaveValue(username);
  expect(screen.getByLabelText('Password')).toHaveValue('local-only');
  expect(screen.getByLabelText('Confirm password')).toHaveValue('local-only');
}

describe('identity forms and App', () => {
  it.each([LoginPage, RegisterPage])('does not write, generate IDs, navigate or invoke parent callbacks during form render', Page => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const uuid = vi.spyOn(window.crypto, 'randomUUID');
    const callback = vi.fn();
    mount('/form', <Page onSessionChange={callback} />);
    expect(screen.getByLabelText('Location').textContent).toBe('/form');
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Local demo security')).toHaveTextContent('plaintext in localStorage');
    expect(screen.getByLabelText('Local demo security')).toHaveTextContent('Do not use real passwords');
  });

  it('preserves guest discovery and activates registration only through a link', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Public navigation' })).toBeInTheDocument();
    expect(screen.getByLabelText('Location').textContent).toBe('/');
    await user.click(screen.getByRole('link', { name: 'Get Started Free' }));
    expect(screen.getByLabelText('Location').textContent).toBe('/register');
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
  });

  it.each([['admin', 'admin', '/admin', ADMIN], ['riley', 'demo-only', '/blogs', SESSION]])(
    'persists %s login and immediately updates the parent-visible shell', async (username, password, home, session) => {
      saveUsers([USER]);
      const user = userEvent.setup();
      mount('/login');
      expect(screen.getByLabelText('Location').textContent).toBe('/login');
      await user.type(screen.getByLabelText('Username'), username);
      await user.type(screen.getByLabelText('Password'), password);
      expect(getSession()).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Login' }));
      expect(getSession()).toEqual(session);
      expect(screen.getByLabelText('Location').textContent).toBe(home);
      expect(screen.getByRole('navigation', { name: 'Authenticated navigation' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Public navigation' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'WriteSpace' }));
      expect(screen.getByRole('link', { name: session.role === 'admin' ? 'Go to Dashboard' : 'Go to My Space' }))
        .toHaveAttribute('href', home);
    },
  );

  it.each([['', ''], ['riley', 'wrong'], ['admin', 'wrong']])(
    'shows exact invalid credentials and retains inputs without changing route or shell', async (username, password) => {
      saveUsers([USER]);
      const user = userEvent.setup();
      mount('/login');
      if (username) await user.type(screen.getByLabelText('Username'), username);
      if (password) await user.type(screen.getByLabelText('Password'), password);
      await user.click(screen.getByRole('button', { name: 'Login' }));
      expect(screen.getByRole('alert').textContent).toBe('Invalid username or password.');
      expect(screen.getByLabelText('Username')).toHaveValue(username);
      expect(screen.getByLabelText('Password')).toHaveValue(password);
      expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
      expect(getSession()).toBeNull();
      expect(screen.getByLabelText('Location').textContent).toBe('/login');
      expect(screen.getByRole('navigation', { name: 'Public navigation' })).toBeInTheDocument();
    },
  );

  it('retains login values and shell when session persistence fails', async () => {
    const user = userEvent.setup();
    mount('/login');
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'admin');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('private', 'QuotaExceededError'); });
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByRole('alert').textContent).toBe('Could not sign in in this browser. Please try again.');
    expect(screen.getByLabelText('Username')).toHaveValue('admin');
    expect(screen.getByLabelText('Password')).toHaveValue('admin');
    expect(screen.getByLabelText('Location').textContent).toBe('/login');
    expect(getSession()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  it('requires each of the four fields with associated inline errors and no UUID/write', async () => {
    const user = userEvent.setup();
    const uuid = vi.spyOn(window.crypto, 'randomUUID');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount('/register');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    for (const label of ['Display name', 'Username', 'Password', 'Confirm password']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(input.getAttribute('aria-describedby'))).toHaveTextContent(`${label} is required.`);
    }
    expect(uuid).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Location').textContent).toBe('/register');
  });

  it.each(['Display name', 'Username', 'Password', 'Confirm password'])(
    'reports the individually missing %s as required before checking password equality', async label => {
      const user = userEvent.setup();
      const uuid = vi.spyOn(window.crypto, 'randomUUID');
      mount('/register');
      await fillRegistration(user);
      await user.clear(screen.getByLabelText(label));
      await user.click(screen.getByRole('button', { name: 'Register' }));
      expect(screen.getByRole('alert').textContent).toBe(`${label} is required.`);
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
      expect(getUsers()).toEqual([]);
      expect(getSession()).toBeNull();
      expect(uuid).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Location').textContent).toBe('/register');
    },
  );

  it('rejects mismatch and retains all four values without persistence', async () => {
    const user = userEvent.setup();
    mount('/register');
    await fillRegistration(user);
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords must match.');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('different');
    expect(screen.getByLabelText('Display name')).toHaveValue('Casey Writer');
    expect(getUsers()).toEqual([]);
    expect(getSession()).toBeNull();
    expect(screen.getByLabelText('Location').textContent).toBe('/register');
  });

  it.each(['admin', 'riley'])('rejects reserved or duplicate %s, retains fields and associates username feedback', async username => {
    saveUsers([USER]);
    const user = userEvent.setup();
    mount('/register');
    await fillRegistration(user, username);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This username is already taken. Choose another username.');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', 'register-username-error');
    expectRetained(username);
    expect(getUsers()).toEqual([USER]);
    expect(getSession()).toBeNull();
    expect(screen.getByLabelText('Location').textContent).toBe('/register');
  });

  it('creates exactly one account on activation, updates shell, restores on remount, and logs out to root', async () => {
    const user = userEvent.setup();
    const uuid = vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
    const view = mount('/register');
    await fillRegistration(user);
    expect(getUsers()).toEqual([]);
    expect(uuid).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(getUsers()).toHaveLength(1);
    expect(getUsers()[0]).toMatchObject({ id: NEW_ID, displayName: 'Casey Writer', username: 'casey', password: 'local-only', role: 'user' });
    expect(screen.getByLabelText('Location').textContent).toBe('/blogs');
    expect(screen.getByText('Casey Writer · Writer')).toBeInTheDocument();
    view.unmount();
    mount('/');
    expect(screen.getByRole('link', { name: 'Go to My Space' })).toHaveAttribute('href', '/blogs');
    expect(screen.getByRole('navigation', { name: 'Authenticated navigation' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(getSession()).toBeNull();
    expect(getUsers()).toHaveLength(1);
    expect(screen.getByLabelText('Location').textContent).toBe('/');
    expect(screen.getByRole('navigation', { name: 'Public navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Started Free' })).toBeInTheDocument();
  });

  it.each(['account', 'session', 'uuid'])('retains fields and public shell on registration %s failure with sign-in guidance', async boundary => {
    const user = userEvent.setup();
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(NEW_ID);
    if (boundary === 'uuid') vi.spyOn(window, 'crypto', 'get').mockReturnValue({});
    const write = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === (boundary === 'account' ? 'writespace_users' : 'writespace_session')) {
        throw new DOMException('private', 'QuotaExceededError');
      }
      return write.call(this, key, value);
    });
    mount('/register');
    await fillRegistration(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expectRetained();
    expect(screen.getByRole('alert')).toHaveTextContent('If your account was saved, sign in with your chosen credentials.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('QuotaExceededError');
    expect(screen.getByLabelText('Location').textContent).toBe('/register');
    expect(getSession()).toBeNull();
    expect(getUsers()).toHaveLength(boundary === 'session' ? 1 : 0);
    expect(screen.getByRole('navigation', { name: 'Public navigation' })).toBeInTheDocument();
    if (boundary === 'session') {
      failure.mockRestore();
      await user.click(screen.getByRole('link', { name: 'Sign in' }));
      await user.type(screen.getByLabelText('Username'), 'casey');
      await user.type(screen.getByLabelText('Password'), 'local-only');
      await user.click(screen.getByRole('button', { name: 'Login' }));
      expect(screen.getByLabelText('Location').textContent).toBe('/blogs');
      expect(getSession().userId).toBe(NEW_ID);
      expect(getUsers()).toHaveLength(1);
    }
  });

  it.each([
    ['/login', 'admin', '/admin'], ['/register', 'admin', '/admin'],
    ['/login', 'user', '/blogs'], ['/register', 'user', '/blogs'],
  ])('redirects current %s visitors with role %s to %s without writes', (path, role, home) => {
    saveUsers([USER]);
    localStorage.setItem('writespace_session', JSON.stringify(role === 'admin' ? ADMIN : SESSION));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    mount(path);
    expect(screen.getByLabelText('Location').textContent).toBe(home);
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });

  it('treats a stale session as guest on initialization without deleting it', () => {
    localStorage.setItem('writespace_session', JSON.stringify(SESSION));
    mount('/login');
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Public navigation' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(SESSION);
  });

  it('retains the authenticated App shell when logout fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_session', JSON.stringify(ADMIN));
    mount('/');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('private'); });
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not log out');
    expect(screen.getByRole('navigation', { name: 'Authenticated navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/admin');
    expect(getSession()).toEqual(ADMIN);
  });

  it('activates login from the public header and registration from the login form', async () => {
    const user = userEvent.setup();
    mount('/');
    await user.click(within(screen.getByRole('navigation', { name: 'Public navigation' })).getByRole('link', { name: 'Login' }));
    expect(screen.getByLabelText('Location').textContent).toBe('/login');
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Register' }));
    expect(screen.getByLabelText('Location').textContent).toBe('/register');
  });
});
