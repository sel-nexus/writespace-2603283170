/** Verify navigation activation, role links, and logout persistence before parent-visible changes. */
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar.jsx';

const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const WRITER = { userId: '00000000-0000-4000-8000-000000000001', username: 'riley', displayName: 'Riley', role: 'user' };

/** Expose navigation outcomes as public harness output, not component internal state. */
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Location">
      {location.pathname}
    </output>
  );
}

/** Mount the navbar with a parent callback and real router location. */
function mount(session = ADMIN, callback = vi.fn()) {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/write']}>
        <Navbar session={session} onSessionChange={callback} />
        <Location />
      </MemoryRouter>
    </StrictMode>,
  );
  return callback;
}

describe('Navbar', () => {
  it.each([ADMIN, WRITER])('renders password-free identity and only the planned role links for $role', session => {
    const callback = mount(session);
    expect(screen.getByText(`${session.displayName} · ${session.role === 'admin' ? 'Admin' : 'Writer'}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Blogs' })).toHaveAttribute('href', '/blogs');
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '/write');
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('aria-current', 'page');
    if (session.role === 'admin') {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
      expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
    } else {
      expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText('Location')).toHaveTextContent('/write');
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([['WriteSpace', '/'], ['Blogs', '/blogs'], ['Write', '/write'], ['Dashboard', '/admin'], ['Users', '/users']])(
    'navigates through the %s link only on activation', async (label, path) => {
      const user = userEvent.setup();
      mount();
      expect(screen.getByLabelText('Location')).toHaveTextContent('/write');
      await user.click(screen.getByRole('link', { name: label }));
      expect(screen.getByLabelText('Location').textContent).toBe(path);
    },
  );

  it('toggles mobile disclosure only on explicit activation without a storage mutation', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const callback = mount();
    const nav = screen.getByRole('navigation', { name: 'Authenticated navigation' });
    expect(nav).toHaveClass('hidden', 'sm:flex');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(nav).toHaveClass('flex');
    expect(nav).not.toHaveClass('hidden');
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-controls', nav.id);
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(nav).toHaveClass('hidden');
    expect(callback).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes only session before notifying the parent and navigating to root', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_session', JSON.stringify(ADMIN));
    localStorage.setItem('writespace_users', '[]');
    localStorage.setItem('writespace_posts', '[]');
    const callback = vi.fn(value => {
      expect(value).toBeNull();
      expect(localStorage.getItem('writespace_session')).toBeNull();
      expect(screen.getByLabelText('Location').textContent).toBe('/write');
    });
    mount(ADMIN, callback);
    expect(localStorage.getItem('writespace_session')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(callback.mock.calls).toEqual([[null]]);
    expect(screen.getByLabelText('Location').textContent).toBe('/');
    expect(localStorage.getItem('writespace_users')).toBe('[]');
    expect(localStorage.getItem('writespace_posts')).toBe('[]');
  });

  it('retains session, parent shell and route when removal fails, then permits an explicit retry', async () => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_session', JSON.stringify(ADMIN));
    const failure = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('private exception details', 'QuotaExceededError');
    });
    const callback = mount();
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not log out in this browser. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('QuotaExceededError');
    expect(screen.getByLabelText('Location').textContent).toBe('/write');
    expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(ADMIN);
    expect(callback).not.toHaveBeenCalled();
    failure.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByLabelText('Location').textContent).toBe('/');
    expect(callback.mock.calls).toEqual([[null]]);
  });

  it('shows a safe retained-shell error when storage acquisition fails on logout', async () => {
    const user = userEvent.setup();
    const callback = mount();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('private'); });
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not log out');
    expect(callback).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Location').textContent).toBe('/write');
  });
});
