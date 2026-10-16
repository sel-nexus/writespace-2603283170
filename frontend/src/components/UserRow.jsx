/** Present password-free account details as a desktop row or a stacked mobile card. */
import PropTypes from 'prop-types';
import { Avatar } from './Avatar.jsx';
import { formatDate } from './BlogCard.jsx';
import { canDeleteUser } from '../utils/users.js';

const actionStyle = 'inline-flex min-h-11 items-center rounded px-3 text-sm underline '
  + 'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-foreground-muted';

/**
 * Render eligible deletion controls without performing account operations during render.
 * Args:
 *   props.user (object): Password-free account view.
 *   props.session (object|null): Identity snapshot for visibility; handlers must reauthorize.
 *   props.onDelete (function): Explicit deletion callback receiving only the id.
 *   props.mode (string): Table row or mobile card presentation.
 * Returns:
 *   {JSX.Element} Semantic account details and an explicitly activated delete button.
 */
export function UserRow({ user, session = null, onDelete, mode = 'table' }) {
  const builtIn = user.id === 'admin';
  const current = user.id === session?.userId;
  const tooltip = builtIn ? 'Default admin cannot be deleted.'
    : current ? 'Your current account cannot be deleted.' : undefined;
  const date = builtIn ? 'Default account' : formatDate(user.createdAt);
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar role={user.role} />
      <span className="min-w-0 break-words font-medium">
        {user.displayName}
      </span>
    </div>
  );
  const action = (
    <span title={tooltip}>
      <button
        type="button"
        disabled={!canDeleteUser(session, user.id)}
        title={tooltip}
        aria-label={`Delete ${user.username}`}
        onClick={() => onDelete(user.id)}
        className={actionStyle}
      >
        Delete
      </button>
    </span>
  );
  if (mode === 'card') {
    return (
      <article aria-label={`Account ${user.username}`} className="min-w-0 border-b border-border py-6">
        {identity}
        <dl className="mt-4 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground-muted">
            Username
          </dt>
          <dd className="break-words">
            {user.username}
          </dd>
          <dt className="text-foreground-muted">
            Role
          </dt>
          <dd>
            {user.role}
          </dd>
          <dt className="text-foreground-muted">
            Created
          </dt>
          <dd>
            {date}
          </dd>
        </dl>
        <div className="mt-4">
          {action}
        </div>
      </article>
    );
  }
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-5">
        {identity}
      </td>
      <td className="break-words px-4 py-5">
        {user.username}
      </td>
      <td className="px-4 py-5 text-sm">
        {user.role}
      </td>
      <td className="px-4 py-5 text-sm tabular-nums text-foreground-muted">
        {date}
      </td>
      <td className="px-4 py-5 text-right">
        {action}
      </td>
    </tr>
  );
}

UserRow.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['admin', 'user']).isRequired,
    createdAt: PropTypes.string.isRequired,
  }).isRequired,
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['admin', 'user']).isRequired,
  }),
  onDelete: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['table', 'card']),
};
