/** Resolve a route post and render complete plain text with current-session action visibility. */
import { Link, useParams } from 'react-router-dom';
import { getAvatar } from '../components/Avatar.jsx';
import { formatDate } from '../components/BlogCard.jsx';
import { getSession } from '../utils/auth.js';
import { getPosts, getUsers } from '../utils/storage.js';

const linkStyle = 'inline-flex min-h-11 items-center rounded underline underline-offset-4 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Allow management only for a current administrator or a matching ordinary owner.
 * Args:
 *   session (object|null): Validated current identity, not the shell snapshot.
 *   post (object): Resolved post with its persisted author ID.
 * Returns:
 *   {boolean} Whether an edit action may be displayed; handlers must repeat this check when implemented.
 */
export function canManagePost(session, post) {
  return session?.role === 'admin'
    || (session?.role === 'user' && session.userId === post.authorId);
}

/**
 * Read the URL-selected post without creating, repairing, editing, or deleting any record.
 * Returns:
 *   {JSX.Element} Complete reader or exact not-found state, with an explicit back-to-list link.
 * Notes:
 *   Resolve the route ID on every render so in-place parameter navigation cannot retain another post.
 *   ProtectedRoute repeats current session validation; edit visibility also reads the current session.
 */
export default function ReadBlog() {
  const { id } = useParams();
  const post = getPosts().find(record => record.id === id);
  const session = getSession();
  if (!post) {
    return (
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
        <h1 className="font-display text-4xl">
          Post not found.
        </h1>
        <Link to="/blogs" className={`${linkStyle} mt-8`}>
          Back to All Posts
        </Link>
      </main>
    );
  }
  const authorRole = post.authorId === 'admin' ? 'admin' : getUsers().find(user => user.id === post.authorId)?.role;
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
      <article className="mx-auto min-w-0 max-w-[75ch]">
        <h1 className="break-words font-display text-4xl leading-tight sm:text-5xl">
          {post.title}
        </h1>
        <div className="mt-6 flex min-w-0 flex-wrap items-center gap-3 text-sm text-foreground-muted">
          {getAvatar(authorRole)}
          <span className="min-w-0 break-words">
            {post.authorName}
          </span>
          <time dateTime={post.createdAt} className="tabular-nums">
            {formatDate(post.createdAt)}
          </time>
        </div>
        <p className="mt-10 whitespace-pre-wrap break-words text-lg leading-relaxed">
          {post.content}
        </p>
        <nav aria-label="Post actions" className="mt-12 flex flex-wrap gap-6 border-t border-border pt-6">
          <Link to="/blogs" className={linkStyle}>
            Back to All Posts
          </Link>
          {canManagePost(session, post) && (
            <Link to={`/edit/${post.id}`} className={linkStyle}>
              Edit
            </Link>
          )}
        </nav>
      </article>
    </main>
  );
}
