/** Sign in to the browser-local demo through explicit controlled-form submission. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getSession, login } from '../utils/auth.js';

const inputStyle = 'mt-2 min-h-12 w-full rounded border border-border bg-surface px-4 text-foreground '
  + 'focus:outline-none focus:ring-2 focus:ring-ring';
const actionStyle = 'inline-flex min-h-12 items-center justify-center rounded bg-primary-700 px-6 font-medium '
  + 'text-surface hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Retain submitted fields on errors and notify the shell only after successful session persistence.
 * Args:
 *   props.onSessionChange (function): Publish the password-free persisted identity to App.
 * Returns:
 *   {JSX.Element} Accessible login form or role-home redirect for a current valid session.
 */
export default function LoginPage({ onSessionChange }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const session = getSession();

  /**
   * Validate submitted credentials and navigate only after the session write succeeds.
   * Args:
   *   event (object): Native form submission event.
   * Returns:
   *   {void} Display safe exact invalid-credential text or a generic persistence failure.
   */
  function submit(event) {
    event.preventDefault();
    const result = login(username, password);
    if (!result.ok) {
      setError(result.reason === 'invalid_credentials'
        ? 'Invalid username or password.'
        : 'Could not sign in in this browser. Please try again.');
      return;
    }
    onSessionChange(result.session);
    navigate(result.navigateTo);
  }

  if (session) return <Navigate to={session.role === 'admin' ? '/admin' : '/blogs'} replace />;

  return (
    <main id="main-content" className="mx-auto max-w-xl px-6 py-16 sm:px-8 sm:py-20">
      <h1 className="font-display text-4xl tracking-tight">
        Welcome back
      </h1>
      <p className="mt-4 leading-relaxed text-foreground-muted">
        Sign in to your local writing space.
      </p>
      <form onSubmit={submit} noValidate className="mt-10 space-y-6">
        <div>
          <label htmlFor="login-username" className="block font-medium">
            Username
          </label>
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            required
            aria-required="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : undefined}
            value={username}
            onChange={event => setUsername(event.target.value)}
            className={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block font-medium">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-required="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : undefined}
            value={password}
            onChange={event => setPassword(event.target.value)}
            className={inputStyle}
          />
        </div>
        {error && (
          <p id="login-error" role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button type="submit" className={actionStyle}>
          Login
        </button>
      </form>
      <p className="mt-8 text-foreground-muted">
        New here?{' '}
        <Link to="/register" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring">
          Register
        </Link>
      </p>
      <aside aria-label="Local demo security" className="mt-12 border-t border-border pt-8 text-sm leading-relaxed text-foreground-muted">
        <p>
          Demo admin: username admin, password admin.
        </p>
        <p className="mt-3">
          Client-side authentication only. Credentials are stored in plaintext in localStorage.
          Do not use real passwords or sensitive information. Accounts stay in this browser; there is no cloud backup.
        </p>
      </aside>
    </main>
  );
}

LoginPage.propTypes = {
  onSessionChange: PropTypes.func.isRequired,
};
