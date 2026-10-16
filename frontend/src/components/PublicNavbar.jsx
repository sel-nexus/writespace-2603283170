/** Provide public navigation with a mobile disclosure controlled only by explicit activation. */
import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';

const linkStyle = 'inline-flex min-h-11 items-center rounded px-3 text-sm hover:bg-surface-raised '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Render the public shell and optional future role-home link.
 * Args:
 *   props.session (object|null): Already-resolved session supplied by the parent, never read from storage here.
 * Returns:
 *   {JSX.Element} Accessible desktop and mobile navigation.
 */
export function PublicNavbar({ session = null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const home = session?.role === 'admin' ? '/admin' : '/blogs';
  const links = session
    ? [{ to: home, label: session.role === 'admin' ? 'Dashboard' : 'My space' }]
    : [{ to: '/login', label: 'Login' }, { to: '/register', label: 'Register' }];

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8">
        <Link
          to="/"
          className="rounded font-display text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          WriteSpace
        </Link>
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
          aria-label="Public navigation"
          className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 sm:flex sm:w-auto sm:flex-row sm:gap-3`}
        >
          <NavLink to="/" end className={linkStyle}>
            Home
          </NavLink>
          {links.map(link => (
            <NavLink key={link.to} to={link.to} className={linkStyle}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

PublicNavbar.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string,
    username: PropTypes.string,
    displayName: PropTypes.string,
    role: PropTypes.oneOf(['admin', 'user']).isRequired,
  }),
};
