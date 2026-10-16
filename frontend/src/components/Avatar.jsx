/** Present source-required role emoji avatars without reading or changing persistence. */
import PropTypes from 'prop-types';

const appearances = {
  admin: { emoji: '👑', label: 'Admin avatar', color: 'bg-violet-600' },
  user: { emoji: '📖', label: 'User avatar', color: 'bg-indigo-500' },
};

/**
 * Render a role-distinct avatar with an accessible name.
 * Args:
 *   props.role (string): Author role; unknown or missing roles use the ordinary user appearance.
 * Returns:
 *   {JSX.Element} Static emoji avatar; the source emoji requirement is an explicit icon-policy exception.
 */
export function Avatar({ role = 'user' }) {
  const appearance = Object.hasOwn(appearances, role) ? appearances[role] : appearances.user;
  return (
    <span
      role="img"
      aria-label={appearance.label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-white ${appearance.color}`}
    >
      <span aria-hidden="true">
        {appearance.emoji}
      </span>
    </span>
  );
}

Avatar.propTypes = {
  role: PropTypes.string,
};

/**
 * Return the source-compatible JSX helper for a role avatar.
 * Args:
 *   role (string): Admin or user; unsupported values fall back to user.
 * Returns:
 *   {JSX.Element} Presentational avatar with no side effects.
 */
export function getAvatar(role) {
  return (
    <Avatar role={role} />
  );
}
