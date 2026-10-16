/** Review browser-local counts and recent posts with explicitly activated administrator controls. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatCard } from '../components/StatCard.jsx';
import { formatDate } from '../components/BlogCard.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { getSession } from '../utils/auth.js';
import { getPosts } from '../utils/storage.js';
import { getUserViews } from '../utils/users.js';
import { deletePost } from '../utils/posts.js';

const linkStyle = 'inline-flex min-h-11 items-center rounded px-3 underline '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Render the four source counts, two quick actions and five newest post rows.
 * Returns:
 *   {JSX.Element} Flat editorial dashboard with retained-state mutation errors.
 * Notes:
 *   Both user labels count stored accounts provisionally; the synthetic administrator is counted separately.
 */
export default function AdminDashboard() {
  const [posts] = useState(() => getPosts());
  const [users] = useState(() => getUserViews().filter(user => user.id !== 'admin'));
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const latest = [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);
  const stats = [
    { label: 'Total Posts', value: posts.length },
    { label: 'Total Users', value: users.length },
    { label: 'Total Admins', value: users.filter(user => user.role === 'admin').length + 1 },
    { label: 'Total users', value: users.length },
  ];

  /**
   * Recheck administrator status before invoking the current-session post deletion boundary.
   * Args:
   *   id (string): Explicitly selected target.
   * Returns:
   *   {void} Navigate to the post list only after persistence; retain rows on cancellation or failure.
   */
  function removePost(id) {
    setError('');
    if (getSession()?.role !== 'admin') {
      setError('You no longer have permission to manage posts.');
      return;
    }
    const result = deletePost({ id });
    if (result.ok) {
      navigate(result.navigateTo);
    } else if (result.reason !== 'cancelled') {
      const messages = {
        forbidden: 'You no longer have permission to manage posts.',
        not_found: 'Post not found.',
      };
      setError(messages[result.reason] || 'Unable to delete this post. It has not been deleted.');
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
      <h1 className="font-display text-4xl tracking-tight">
        Admin Dashboard
      </h1>
      <p className="mt-4 text-foreground-muted">
        A snapshot of the stories and accounts in this browser.
      </p>
      <section aria-label="Statistics" className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </section>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-foreground-muted">
        Provisional counts: Total Users and Total users both show stored accounts.
        Their duplicate meanings await product confirmation. Total Admins includes the default admin.
      </p>
      <nav aria-label="Quick actions" className="mt-10 flex flex-wrap gap-4">
        <Link
          to="/write"
          className="inline-flex min-h-12 items-center rounded bg-primary-700 px-6 text-surface focus-visible:ring-2 focus-visible:ring-ring"
        >
          Write New Post
        </Link>
        <Link to="/users" className={`${linkStyle} border border-border px-6`}>
          Manage Users
        </Link>
      </nav>
      <section aria-labelledby="latest-posts" className="mt-16">
        <h2 id="latest-posts" className="font-display text-2xl">
          Latest posts
        </h2>
        {error && (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        )}
        {latest.length === 0 ? (
          <p className="mt-6 text-foreground-muted">
            No posts yet.
          </p>
        ) : (
          <div className="mt-6 border-t border-border">
            {latest.map(post => (
              <article key={post.id} aria-label={post.title} className="min-w-0 border-b border-border py-6">
                <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <h3 className="break-words font-display text-xl">
                      <Link to={`/blog/${post.id}`} className="rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                        {post.title}
                      </Link>
                    </h3>
                    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 text-sm text-foreground-muted">
                      <Avatar role={post.authorId === 'admin' ? 'admin' : users.find(user => user.id === post.authorId)?.role} />
                      <span className="min-w-0 break-words">
                        {post.authorName}
                      </span>
                      <time dateTime={post.createdAt} className="tabular-nums">
                        {formatDate(post.createdAt)}
                      </time>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/edit/${post.id}`} className={linkStyle}>
                      Edit
                    </Link>
                    <button type="button" onClick={() => removePost(post.id)} className={linkStyle}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
