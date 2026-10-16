/** Browse every browser-local post using immutable page-local snapshots. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BlogCard } from '../components/BlogCard.jsx';
import { getPosts, getUsers } from '../utils/storage.js';

const writeStyle = 'inline-flex min-h-11 items-center rounded bg-primary-700 px-5 text-surface hover:bg-primary-800 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Sort a copy newest first, preserving original order for ties and invalid dates.
 * Args:
 *   posts (object[]): Read-only source collection.
 * Returns:
 *   {object[]} All posts, with invalid dates after valid dates; never mutates the input.
 */
export function newestPosts(posts) {
  return posts.map((post, index) => ({ post, index, time: Date.parse(post.createdAt) }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.time) ? left.time : -Infinity;
      const rightTime = Number.isFinite(right.time) ? right.time : -Infinity;
      return (rightTime - leftTime) || (left.index - right.index);
    })
    .map(entry => entry.post);
}

/**
 * Render the authenticated list with its responsive grid and exact empty-state copy.
 * Returns:
 *   {JSX.Element} Reading links and a write CTA; storage failures use the ordinary empty state.
 * Notes:
 *   The route guard owns access. Only password-free author roles enter display state.
 */
export default function Home() {
  const [posts] = useState(() => newestPosts(getPosts()));
  const [roles] = useState(() => new Map(getUsers().map(user => [user.id, user.role])));
  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            All Posts
          </h1>
          <p className="mt-4 max-w-prose leading-relaxed text-foreground-muted">
            Read the thoughts and stories saved in this browser.
          </p>
        </div>
        <Link
          to="/write"
          className={writeStyle}
        >
          Write a Post
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className="border-t border-border py-12 text-foreground-muted">
          No blogs yet. Be the first to write one!
        </p>
      ) : (
        <section aria-label="All posts" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <BlogCard key={post.id} post={post} index={index} authorRole={roles.get(post.authorId)} />
          ))}
        </section>
      )}
    </main>
  );
}
