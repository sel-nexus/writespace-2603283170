/** Provide role-aware navigation and logout only after successful session removal. */
import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession } from '../utils/auth.js';

const linkStyle = 'inline-flex min-h-11 items-center rounded px-3 text-sm hover:bg-surface-raised '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Render signed-in identity, planned role links, and an explicitly controlled mobile menu.
 * Args:
 *   props.session (object): Validated password-free identity supplied by App.
 *   props.onSessionChange (function): Notify App after successful persistence only.
 * Returns:
 *   {JSX.Element} Authenticated shell and inline retained-session logout failure.
 */
export function Navbar({ session, onSessionChange }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const menuId = useId();
  const navigate = useNavigate();
  const admin = session.role === 'admin';
  const links = [
    { to: '/blogs', label: 'Blogs' },
    { to: '/write', label: 'Write' },
    ...(admin ? [{ to: '/admin', label: 'Dashboard' }, { to: '/users', label: 'Users' }] : []),
  ];

  /**
   * Clear persistence before updating the parent shell and returning to the public root.
   * Returns:
   *   {void} Leave identity and location unchanged on failure.
   */
  function logout() {
    if (!clearSession().ok) {
      setError('Could not log out in this browser. Please try again.');
      return;
    }
    onSessionChange(null);
    navigate('/');
  }

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8">
        <Link
          to="/"
          className="rounded font-display text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          WriteSpace
        </Link>
        <span className="max-w-full break-words text-sm text-foreground-muted">
          {session.displayName} · {admin ? 'Admin' : 'Writer'}
        </span>
        <button
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen(open => !open)}
          className={`${linkStyle} gap-2 border border-border sm:hidden`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d={menuOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
          Menu
        </button>
        <nav
          id={menuId}
          aria-label="Authenticated navigation"
          className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 sm:flex sm:w-auto sm:flex-row sm:gap-3`}
        >
          {links.map(link => (
            <NavLink key={link.to} to={link.to} className={linkStyle}>
              {link.label}
            </NavLink>
          ))}
          <button type="button" onClick={logout} className={linkStyle}>
            Logout
          </button>
        </nav>
        {error && (
          <p role="alert" className="w-full text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </header>
  );
}

Navbar.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['admin', 'user']).isRequired,
  }).isRequired,
  onSessionChange: PropTypes.func.isRequired,
};
