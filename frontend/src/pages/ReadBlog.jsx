/** Resolve a route post and render complete plain text with current-session action visibility. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAvatar } from '../components/Avatar.jsx';
import { formatDate } from '../components/BlogCard.jsx';
import { getSession } from '../utils/auth.js';
import { getPosts, getUsers } from '../utils/storage.js';

const linkStyle = 'inline-flex min-h-11 items-center rounded underline underline-offset-4 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export { canManagePost } from '../utils/posts.js';
import { canManagePost, deletePost } from '../utils/posts.js';

/**
 * Read the URL-selected post and expose authorized, explicitly confirmed deletion.
 * Notes:
 *   Rendering never creates, repairs, edits, or deletes records.
 * Returns:
 *   {JSX.Element} Complete reader or exact not-found state, with an explicit back-to-list link.
 * Notes:
 *   Resolve the route ID on every render so in-place parameter navigation cannot retain another post.
 *   ProtectedRoute repeats current session validation; edit visibility also reads the current session.
 */
export default function ReadBlog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [failure, setFailure] = useState('');
  const post = getPosts().find(record => record.id === id);
  const session = getSession();

  /**
   * Request authorized confirmation only from explicit button activation.
   * Returns:
   *   {void} Navigate on durable deletion; retain the reader with safe feedback otherwise.
   */
  function removePost() {
    const result = deletePost({ id });
    if (result.ok) navigate(result.navigateTo);
    else if (result.reason !== 'cancelled') {
      const messages = {
        forbidden: 'You no longer have permission to delete this post.',
        not_found: 'Post not found.',
        storage_write_failed: 'Unable to delete this post. Nothing has been saved.',
      };
      setFailure(messages[result.reason]);
    }
  }
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
          {canManagePost(session, post) && (
            <button type="button" onClick={removePost} className={`${linkStyle} text-error`}>
              Delete post
            </button>
          )}
        </nav>
        {failure && (
          <p role="alert" className="mt-4 text-error">
            {failure}
          </p>
        )}
      </article>
    </main>
  );
}
