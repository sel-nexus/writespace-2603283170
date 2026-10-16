/** Display a plain-text post preview and a declarative link without storage side effects. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { getAvatar } from './Avatar.jsx';

const accents = ['border-t-indigo-500', 'border-t-violet-500', 'border-t-pink-500', 'border-t-teal-500'];

/**
 * Format a creation timestamp in the source English date format.
 * Args:
 *   value (string): Stored creation date.
 * Returns:
 *   {string} MMM DD, YYYY in UTC, or a safe label for an invalid date.
 */
export function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/**
 * Render the first 120 JavaScript characters exactly, with author and date metadata.
 * Args:
 *   props.post (object): Complete validated post.
 *   props.index (number): Display position for the source cycling top accent.
 *   props.authorRole (string): Resolved author role; built-in admin defaults to admin, others to user.
 *   props.guest (boolean): Whether preview activation must route to login.
 * Returns:
 *   {JSX.Element} Non-mutating card; management actions belong to their owning pages.
 */
export function BlogCard({ post, index = 0, authorRole, guest = false }) {
  const role = authorRole ?? (post.authorId === 'admin' ? 'admin' : 'user');
  const accent = accents[index % accents.length] || accents[0];
  return (
    <article className={`flex min-w-0 flex-col rounded border border-border border-t-4 bg-surface p-6 ${accent}`}>
      <time dateTime={post.createdAt} className="text-sm tabular-nums text-foreground-muted">
        {formatDate(post.createdAt)}
      </time>
      <h2 className="mt-4 min-w-0 break-words font-display text-2xl leading-snug">
        <Link
          to={guest ? '/login' : `/blog/${post.id}`}
          className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {post.title}
        </Link>
      </h2>
      <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-foreground-muted">
        {post.content.slice(0, 120)}
      </p>
      <div className="mt-auto flex min-w-0 items-center gap-3 pt-6">
        {getAvatar(role)}
        <span className="min-w-0 break-words text-sm text-foreground-muted">
          {post.authorName}
        </span>
      </div>
    </article>
  );
}

BlogCard.propTypes = {
  post: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    createdAt: PropTypes.string.isRequired,
    authorId: PropTypes.string.isRequired,
    authorName: PropTypes.string.isRequired,
  }).isRequired,
  index: PropTypes.number,
  authorRole: PropTypes.string,
  guest: PropTypes.bool,
};
