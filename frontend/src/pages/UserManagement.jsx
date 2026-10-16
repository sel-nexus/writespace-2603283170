/** Create and delete browser-local accounts only through explicit administrator activation. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRow } from '../components/UserRow.jsx';
import { getSession } from '../utils/auth.js';
import { createUser, deleteUser, getUserViews } from '../utils/users.js';

const definitions = [
  { name: 'displayName', label: 'Display name', type: 'text', autoComplete: 'nickname' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
];
const emptyFields = { displayName: '', username: '', password: '', role: 'user' };
const inputStyle = 'mt-2 min-h-12 w-full rounded border border-border bg-surface px-4 text-foreground '
  + 'focus:outline-none focus:ring-2 focus:ring-ring';
const failureMessages = {
  forbidden: 'You no longer have permission to manage accounts.',
  not_found: 'This account no longer exists.',
  id_unavailable: 'Unable to create an account in this browser.',
  validation: 'Complete all required fields and choose Admin or User.',
  storage_write_failed: 'Unable to save account changes. No changes have been saved.',
};

/**
 * Render password-free account projections and a controlled creation form.
 * Returns:
 *   {JSX.Element} Desktop table, stacked mobile cards, accessible errors and success feedback.
 * Notes:
 *   Password input is retained on failure but never copied to results, lists or diagnostic messages.
 */
export default function UserManagement() {
  const [users, setUsers] = useState(() => getUserViews());
  const [fields, setFields] = useState({ ...emptyFields });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const session = getSession();

  /**
   * Validate required fields and commit a new account without replacing the active session.
   * Args:
   *   event (object): Explicit form submission.
   * Returns:
   *   {void} Retain fields on failure; refresh views and clear inputs only after successful persistence.
   */
  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    definitions.forEach(field => {
      if (!fields[field.name].trim()) nextErrors[field.name] = `${field.label} is required.`;
    });
    if (!['admin', 'user'].includes(fields.role)) nextErrors.role = 'Choose Admin or User.';
    setErrors(nextErrors);
    setError('');
    setFeedback('');
    if (Object.keys(nextErrors).length) return;
    const result = createUser(fields);
    if (!result.ok) {
      if (result.reason === 'duplicate_username') {
        setErrors({ username: 'This username is already taken. Choose another username.' });
      } else {
        setError(failureMessages[result.reason] || 'Unable to save account changes.');
      }
      return;
    }
    setUsers(getUserViews());
    setFields({ ...emptyFields });
    setFeedback('Account created successfully.');
  }

  /**
   * Delegate deletion safeguards and confirmation to the current-session mutation boundary.
   * Args:
   *   id (string): Explicitly selected account id.
   * Returns:
   *   {void} Retain list on cancellation/failure and refresh it only after persistence succeeds.
   */
  function removeUser(id) {
    setError('');
    setFeedback('');
    const result = deleteUser({ id });
    if (result.ok) {
      setUsers(getUserViews());
      setFeedback('Account deleted successfully.');
    } else if (result.reason !== 'cancelled') {
      setError(failureMessages[result.reason] || 'Unable to save account changes.');
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
      <Link to="/admin" className="rounded text-sm underline focus-visible:ring-2 focus-visible:ring-ring">
        Back to Dashboard
      </Link>
      <h1 className="mt-6 font-display text-4xl tracking-tight">
        User Management
      </h1>
      <p className="mt-4 max-w-prose leading-relaxed text-foreground-muted">
        Manage accounts in this browser. Credentials are stored in plaintext locally; do not use real passwords.
      </p>
      <section aria-labelledby="create-account" className="mt-12">
        <h2 id="create-account" className="font-display text-2xl">
          Create account
        </h2>
        <form onSubmit={submit} noValidate className="mt-6 grid min-w-0 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {definitions.map(field => (
            <div key={field.name} className="min-w-0">
              <label htmlFor={`user-${field.name}`} className="block text-sm font-medium">
                {field.label}
              </label>
              <input
                id={`user-${field.name}`}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                required
                aria-required="true"
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={errors[field.name] ? `user-${field.name}-error` : undefined}
                value={fields[field.name]}
                onChange={event => setFields(current => ({ ...current, [field.name]: event.target.value }))}
                className={inputStyle}
              />
              {errors[field.name] && (
                <p id={`user-${field.name}-error`} role="alert" className="mt-2 text-sm text-error">
                  {errors[field.name]}
                </p>
              )}
            </div>
          ))}
          <div className="min-w-0">
            <label htmlFor="user-role" className="block text-sm font-medium">
              Role
            </label>
            <select
              id="user-role"
              name="role"
              required
              aria-required="true"
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'user-role-error' : undefined}
              value={fields.role}
              onChange={event => setFields(current => ({ ...current, role: event.target.value }))}
              className={inputStyle}
            >
              <option value="user">
                User
              </option>
              <option value="admin">
                Admin
              </option>
            </select>
            {errors.role && (
              <p id="user-role-error" role="alert" className="mt-2 text-sm text-error">
                {errors.role}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="min-h-12 rounded bg-primary-700 px-6 font-medium text-surface focus-visible:ring-2 focus-visible:ring-ring"
            >
              Create User
            </button>
          </div>
        </form>
      </section>
      {error && (
        <p role="alert" className="mt-6 text-sm text-error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className="mt-6 text-sm text-success">
        {feedback}
      </p>
      <section aria-labelledby="accounts" className="mt-12">
        <h2 id="accounts" className="font-display text-2xl">
          Accounts
        </h2>
        <div className="mt-6 hidden sm:block">
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">
              Local accounts
            </caption>
            <thead className="border-b border-border text-sm text-foreground-muted">
              <tr>
                {['Display name', 'Username', 'Role', 'Created', 'Actions'].map(label => (
                  <th key={label} scope="col" className="px-4 py-4 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <UserRow key={user.id} user={user} session={session} onDelete={removeUser} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 min-w-0 border-t border-border sm:hidden">
          {users.map(user => (
            <UserRow key={user.id} user={user} session={session} onDelete={removeUser} mode="card" />
          ))}
        </div>
      </section>
    </main>
  );
}
