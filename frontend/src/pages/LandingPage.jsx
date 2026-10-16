/** Introduce the local writing demo and preview a read-only snapshot of its newest posts. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { getPosts } from '../utils/storage.js';

const features = [
  { title: 'Write Freely', description: 'Plain-text, distraction-free writing. A little room for your next idea.' },
  { title: 'Private & Local', description: 'Your posts stay in this browser profile, not on a shared server.' },
  { title: 'Instant & Fast', description: 'A no-server experience. Open your space and get straight to your words.' },
];
const focusStyle = 'rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring '
  + 'focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Sort a copied collection newest-first with stable ties and invalid dates last.
 * Args:
 *   posts (object[]): Validated local posts.
 * Returns:
 *   {object[]} At most three posts; never changes the source array.
 */
function latestPosts(posts) {
  return posts.map((post, index) => ({ post, index, time: Date.parse(post.createdAt) }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.time) ? left.time : -Infinity;
      const rightTime = Number.isFinite(right.time) ? right.time : -Infinity;
      return (rightTime - leftTime) || (left.index - right.index);
    })
    .slice(0, 3)
    .map(entry => entry.post);
}

/**
 * Format a creation date consistently without exposing invalid date output.
 * Args:
 *   value (string): ISO creation time.
 * Returns:
 *   {string} English month, two-digit day, and year, or a safe unavailable label.
 */
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/**
 * Render public copy, explicit navigation links, and a non-mutating local preview snapshot.
 * Args:
 *   props.session (object|null): Optional validated session for future signed-in CTAs.
 * Returns:
 *   {JSX.Element} Landing content, public security notice, and footer.
 */
export default function LandingPage({ session = null }) {
  const [posts] = useState(() => latestPosts(getPosts()));
  const home = session?.role === 'admin' ? '/admin' : '/blogs';

  return (
    <>
      <main id="main-content" className="mx-auto max-w-6xl px-6 sm:px-8">
        <section aria-labelledby="hero-title" className="py-20 sm:py-28">
          <p className="mb-6 text-sm font-medium uppercase tracking-widest text-foreground-muted">
            A quiet place to write
          </p>
          <h1 id="hero-title" className="max-w-3xl font-display text-5xl leading-tight tracking-tight sm:text-7xl">
            WriteSpace
          </h1>
          <p className="mt-6 max-w-xl font-display text-2xl leading-relaxed text-foreground-muted sm:text-3xl">
            Your thoughts. Your space. Beautifully simple.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              to={session ? home : '/register'}
              className={`${focusStyle} inline-flex min-h-12 items-center bg-primary-700 px-6 font-medium text-surface hover:bg-primary-800`}
            >
              {session ? (session.role === 'admin' ? 'Go to Dashboard' : 'Go to My Space') : 'Get Started Free'}
            </Link>
            <Link
              to={session ? '/blogs' : '/login'}
              className={`${focusStyle} inline-flex min-h-12 items-center border border-border px-6 hover:bg-surface-raised`}
            >
              Start Reading
            </Link>
          </div>
        </section>

        <section aria-labelledby="features-title" className="border-t border-border py-16 sm:py-20">
          <h2 id="features-title" className="mb-8 font-display text-3xl">
            Room for what matters
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map(feature => (
              <article key={feature.title} className="rounded border border-border p-6">
                <h3 className="font-display text-2xl">
                  {feature.title}
                </h3>
                <p className="mt-4 max-w-prose leading-relaxed text-foreground-muted">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="latest-title" className="border-t border-border py-16 sm:py-20">
          <h2 id="latest-title" className="mb-8 font-display text-3xl">
            Latest from the Blog
          </h2>
          {posts.length === 0 ? (
            <p className="text-foreground-muted">
              No posts yet — check back soon!
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map(post => (
                <article key={post.id} className="min-w-0 rounded border border-border p-6">
                  <time dateTime={post.createdAt} className="text-sm tabular-nums text-foreground-muted">
                    {formatDate(post.createdAt)}
                  </time>
                  <h3 className="mt-4 break-words font-display text-2xl">
                    <Link to={session ? `/blog/${post.id}` : '/login'} className={`${focusStyle} hover:underline`}>
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-foreground-muted">
                    {post.content.slice(0, 120)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside aria-labelledby="security-title" className="border-t border-border py-12">
          <h2 id="security-title" className="text-lg font-medium">
            A local demo, not production security
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-foreground-muted">
            Authentication and role checks are client-side only and can be changed by anyone controlling this browser.
            Credentials are stored in plaintext in localStorage. Do not use real passwords or sensitive information.
          </p>
          <p className="mt-3 max-w-prose leading-relaxed text-foreground-muted">
            Posts and accounts exist only in this browser profile. There is no cloud backup or cross-device sync;
            clearing browser storage removes your data.
          </p>
        </aside>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-foreground-muted sm:px-8">
          <p>
            © {new Date().getFullYear()} WriteSpace
          </p>
          <p>
            Your thoughts. Your space.
          </p>
        </div>
      </footer>
    </>
  );
}

LandingPage.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string,
    username: PropTypes.string,
    displayName: PropTypes.string,
    role: PropTypes.oneOf(['admin', 'user']).isRequired,
  }),
};
