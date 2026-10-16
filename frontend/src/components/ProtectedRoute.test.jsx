/** Exercise current-session route boundaries in a harness without inventing unfinished application pages. */
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { saveUsers } from '../utils/storage.js';

const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const ID = '00000000-0000-4000-8000-000000000001';
const SESSION = { userId: ID, username: 'riley', displayName: 'Riley', role: 'user' };
const USER = { id: ID, username: 'riley', displayName: 'Riley', role: 'user', password: 'local', createdAt: '2026-01-01T00:00:00Z' };

/** Render real guards against clearly marked test-only route destinations. */
function mount(path, adminOnly = false) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path={path}
            element={(
              <ProtectedRoute adminOnly={adminOnly}>
                <h1>
                  Authorized test content
                </h1>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/login"
            element={(
              <h1>
                Login destination
              </h1>
            )}
          />
          <Route
            path="/blogs"
            element={(
              <h1>
                Writer destination
              </h1>
            )}
          />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('ProtectedRoute', () => {
  it.each(['/blogs', '/blog/example', '/write', '/edit/example', '/admin', '/users'])(
    'denies guests at the planned %s boundary without render mutations', path => {
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const remove = vi.spyOn(Storage.prototype, 'removeItem');
      mount(path, ['/admin', '/users'].includes(path));
      expect(screen.getByRole('heading', { name: 'Login destination' })).toBeInTheDocument();
      expect(screen.queryByText('Authorized test content')).not.toBeInTheDocument();
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it.each(['/admin', '/users'])('redirects current writers from %s to /blogs', path => {
    saveUsers([USER]);
    localStorage.setItem('writespace_session', JSON.stringify(SESSION));
    mount(path, true);
    expect(screen.getByRole('heading', { name: 'Writer destination' })).toBeInTheDocument();
    expect(screen.queryByText('Authorized test content')).not.toBeInTheDocument();
  });

  it.each([false, true])('allows a valid built-in admin with adminOnly=%s', adminOnly => {
    localStorage.setItem('writespace_session', JSON.stringify(ADMIN));
    mount('/test-protected', adminOnly);
    expect(screen.getByRole('heading', { name: 'Authorized test content' })).toBeInTheDocument();
  });

  it.each(['user', 'admin'])('allows a current registered %s at an eligible boundary', role => {
    saveUsers([{ ...USER, role }]);
    localStorage.setItem('writespace_session', JSON.stringify({ ...SESSION, role }));
    mount('/test-protected', role === 'admin');
    expect(screen.getByRole('heading', { name: 'Authorized test content' })).toBeInTheDocument();
  });

  it.each(['{', JSON.stringify({ ...ADMIN, displayName: 'Forged' }), JSON.stringify(SESSION)])(
    'fails closed on corrupt, forged or removed-account sessions: %s', raw => {
      localStorage.setItem('writespace_session', raw);
      mount('/test-protected', true);
      expect(screen.getByRole('heading', { name: 'Login destination' })).toBeInTheDocument();
      expect(localStorage.getItem('writespace_session')).toBe(raw);
    },
  );

  it('reads current records rather than trusting a previously validated writer snapshot', () => {
    saveUsers([{ ...USER, displayName: 'Changed since sign-in' }]);
    localStorage.setItem('writespace_session', JSON.stringify(SESSION));
    mount('/test-protected');
    expect(screen.getByRole('heading', { name: 'Login destination' })).toBeInTheDocument();
  });

  it('denies access when acquiring localStorage throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('private', 'SecurityError'); });
    mount('/test-protected', true);
    expect(screen.getByRole('heading', { name: 'Login destination' })).toBeInTheDocument();
  });
});
