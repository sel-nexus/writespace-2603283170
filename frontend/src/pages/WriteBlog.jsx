/** Render a controlled authoring form whose only persistence boundary is explicit submission. */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getSession } from '../utils/auth.js';
import { getPosts } from '../utils/storage.js';
import { canManagePost, createPost, updatePost } from '../utils/posts.js';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const inputStyle = `w-full rounded border border-border bg-surface px-4 py-3 text-foreground ${focus}`;
const messages = {
  validation: 'Title and content are required.',
  forbidden: 'You no longer have permission to save this post.',
  not_found: 'Post not found.',
  id_unavailable: 'Unable to create a post in this browser. Your draft has not been saved.',
  storage_write_failed: 'Unable to save this post. Your draft has not been saved.',
};

/**
 * Prefill an eligible edit or offer a blank draft, retaining values on every save failure.
 * Returns:
 *   {JSX.Element} Accessible form, exact missing state, or declarative ownership redirect.
 * Notes:
 *   All hooks run before conditional returns. Route-keyed form state prevents drafts leaking between targets.
 */
export default function WriteBlog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const post = id ? getPosts().find(record => record.id === id) : null;
  const session = getSession();
  const routeKey = id ?? 'create';
  const [draft, setDraft] = useState(() => ({ key: routeKey, title: post?.title ?? '', content: post?.content ?? '' }));
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  if (draft.key !== routeKey) {
    setDraft({ key: routeKey, title: post?.title ?? '', content: post?.content ?? '' });
    setErrors({});
    setFailure('');
  }

  /**
   * Validate required fields and navigate only after a durable mutation succeeds.
   * Args:
   *   event (Event): Explicit form submission.
   * Returns:
   *   {void} Keep the form and its values when validation or persistence fails.
   */
  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!draft.title.trim()) nextErrors.title = 'Title is required.';
    if (!draft.content.trim()) nextErrors.content = 'Content is required.';
    setErrors(nextErrors);
    setFailure('');
    if (Object.keys(nextErrors).length) return;
    const result = id ? updatePost({ id, title: draft.title, content: draft.content }) : createPost(draft);
    if (result.ok) navigate(result.navigateTo);
    else setFailure(messages[result.reason]);
  }

  if (id && !post) {
    return (
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
        <h1 className="font-display text-4xl">
          Post not found.
        </h1>
        <Link to="/blogs" className={`mt-8 inline-flex min-h-11 items-center rounded underline ${focus}`}>
          Back to All Posts
        </Link>
      </main>
    );
  }
  if (id && !canManagePost(session, post)) return <Navigate to="/blogs" replace />;
  return (
    <main id="main-content" className="mx-auto max-w-[75ch] px-6 py-16 sm:px-8 sm:py-20">
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">
        {id ? 'Edit Post' : 'Write a Post'}
      </h1>
      <p className="mt-4 leading-relaxed text-foreground-muted">
        Your words stay in this browser. Title and content are required.
      </p>
      <form onSubmit={submit} noValidate className="mt-10 space-y-6">
        <div>
          <label htmlFor="post-title" className="mb-2 block font-medium">
            Title
          </label>
          <input
            id="post-title" name="title" value={draft.title} required aria-required="true"
            aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'title-error' : undefined}
            onChange={event => setDraft({ ...draft, title: event.target.value })} className={inputStyle}
          />
          {errors.title && (
            <p id="title-error" role="alert" className="mt-2 text-sm text-error">
              {errors.title}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="post-content" className="mb-2 block font-medium">
            Content
          </label>
          <textarea
            id="post-content" name="content" value={draft.content} required aria-required="true"
            aria-invalid={Boolean(errors.content)}
            aria-describedby={errors.content ? 'content-error content-count' : 'content-count'}
            onChange={event => setDraft({ ...draft, content: event.target.value })}
            className={`${inputStyle} min-h-64 resize-y leading-relaxed`}
          />
          {errors.content && (
            <p id="content-error" role="alert" className="mt-2 text-sm text-error">
              {errors.content}
            </p>
          )}
          <p id="content-count" className="mt-2 text-sm tabular-nums text-foreground-muted">
            {draft.content.length} characters
          </p>
        </div>
        {failure && (
          <p role="alert" className="text-error">
            {failure}
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <button
            type="submit"
            className={`min-h-11 rounded bg-primary-700 px-5 text-surface hover:bg-primary-800 ${focus}`}
          >
            {id ? 'Save Changes' : 'Publish Post'}
          </button>
          <Link
            to={id ? `/blog/${id}` : '/blogs'}
            className={`inline-flex min-h-11 items-center rounded px-5 hover:bg-surface-raised ${focus}`}
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
