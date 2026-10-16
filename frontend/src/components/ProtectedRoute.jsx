/** Fail closed at route activation using the current persisted identity. */
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { getSession } from '../utils/auth.js';

/**
 * Deny anonymous visitors and non-admin visitors on admin-only routes.
 * Args:
 *   props.children (node): Authorized route content.
 *   props.adminOnly (boolean): Whether only an administrator may enter.
 * Returns:
 *   {JSX.Element} Authorized children or a replacing redirect; never mutates storage.
 */
export function ProtectedRoute({ children, adminOnly = false }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (adminOnly && session.role !== 'admin') return <Navigate to="/blogs" replace />;
  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  adminOnly: PropTypes.bool,
};
