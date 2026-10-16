/** Create a local writer account and session only on explicit form submission. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getSession, register } from '../utils/auth.js';

const fieldDefinitions = [
  { name: 'displayName', label: 'Display name', type: 'text', autoComplete: 'nickname' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
];
const inputStyle = 'mt-2 min-h-12 w-full rounded border border-border bg-surface px-4 text-foreground '
  + 'focus:outline-none focus:ring-2 focus:ring-ring';
const actionStyle = 'inline-flex min-h-12 items-center justify-center rounded bg-primary-700 px-6 font-medium '
  + 'text-surface hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Retain the four controlled fields on validation or either persistence failure.
 * Args:
 *   props.onSessionChange (function): Publish a successfully persisted password-free session to App.
 * Returns:
 *   {JSX.Element} Registration form or current-session role-home redirect.
 * Notes:
 *   Conditional sign-in guidance covers a retained account after partial registration without widening the result union.
 */
export default function RegisterPage({ onSessionChange }) {
  const [fields, setFields] = useState({ displayName: '', username: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const session = getSession();
  const navigate = useNavigate();

  /**
   * Validate required fields and matching passwords before invoking the registration contract.
   * Args:
   *   event (object): Native form submit event.
   * Returns:
   *   {void} Persist before notifying the parent or navigating; leave all inputs intact on failure.
   */
  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    fieldDefinitions.forEach(field => {
      if (!fields[field.name].trim()) nextErrors[field.name] = `${field.label} is required.`;
    });
    if (!nextErrors.password && !nextErrors.confirmPassword && fields.password !== fields.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords must match.';
    }
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;
    const result = register(fields);
    if (!result.ok) {
      if (result.reason === 'duplicate_username') {
        setErrors({ username: 'This username is already taken. Choose another username.' });
      } else {
        setError(result.reason === 'validation'
          ? 'Please complete all four fields with matching passwords.'
          : 'Could not complete registration in this browser. If your account was saved, sign in with your chosen credentials.');
      }
      return;
    }
    onSessionChange(result.session);
    navigate(result.navigateTo);
  }

  if (session) return <Navigate to={session.role === 'admin' ? '/admin' : '/blogs'} replace />;

  return (
    <main id="main-content" className="mx-auto max-w-xl px-6 py-16 sm:px-8 sm:py-20">
      <h1 className="font-display text-4xl tracking-tight">
        Make room for your words
      </h1>
      <p className="mt-4 leading-relaxed text-foreground-muted">
        Create a writer account in this browser.
      </p>
      <form onSubmit={submit} noValidate className="mt-10 space-y-6">
        {fieldDefinitions.map(field => (
          <div key={field.name}>
            <label htmlFor={`register-${field.name}`} className="block font-medium">
              {field.label}
            </label>
            <input
              id={`register-${field.name}`}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              required
              aria-required="true"
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={errors[field.name] ? `register-${field.name}-error` : undefined}
              value={fields[field.name]}
              onChange={event => setFields(current => ({ ...current, [field.name]: event.target.value }))}
              className={inputStyle}
            />
            {errors[field.name] && (
              <p id={`register-${field.name}-error`} role="alert" className="mt-2 text-sm text-error">
                {errors[field.name]}
              </p>
            )}
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button type="submit" className={actionStyle}>
          Register
        </button>
      </form>
      <p className="mt-8 text-foreground-muted">
        Already have an account?{' '}
        <Link to="/login" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring">
          Sign in
        </Link>
      </p>
      <aside aria-label="Local demo security" className="mt-12 border-t border-border pt-8 text-sm leading-relaxed text-foreground-muted">
        Client-side authentication only. Credentials are stored in plaintext in localStorage.
        Do not use real passwords or sensitive information. Accounts stay in this browser; there is no cloud backup.
      </aside>
    </main>
  );
}

RegisterPage.propTypes = {
  onSessionChange: PropTypes.func.isRequired,
};
