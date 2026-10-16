/** Commit explicitly activated post mutations using current browser identity and durable collections. */
import { getSession } from './auth.js';
import { getPosts, savePosts } from './storage.js';

/**
 * @typedef {import('./storage.js').Post} Post
 * @typedef {import('./auth.js').Session} Session
 * @typedef {{ok:true, post:Post, navigateTo:string}|{ok:true, removedId:string, navigateTo:'/blogs'}|{ok:false, reason:'validation'|'forbidden'|'not_found'|'cancelled'|'id_unavailable'|'storage_write_failed'}} MutationResult
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Allow a validated administrator or matching ordinary owner to manage an existing post.
 * Args:
 *   session (Session|null): Validated identity; mutation callers resolve it again.
 *   post (Post|null): Existing target.
 * Returns:
 *   {boolean} Permission only for an existing target and eligible identity.
 */
export function canManagePost(session, post) {
  return Boolean(post && (session?.role === 'admin'
    || (session?.role === 'user' && session.userId === post.authorId)));
}

/**
 * Require usable title and content strings without coercing or trimming content.
 * Args:
 *   fields (object): Submitted title and content.
 * Returns:
 *   {boolean} Whether both required fields are nonblank.
 */
function validFields(fields) {
  return Boolean(fields && ['title', 'content'].every(key =>
    typeof fields[key] === 'string' && fields[key].trim().length > 0));
}

/**
 * Append one attributed post after explicit submission; never trust a supplied session.
 * Args:
 *   fields (object): Title and plain-text content.
 * Returns:
 *   {MutationResult} Durable post and reader destination, or safe failure without navigation.
 * Notes:
 *   Generate one UUID and ISO time only after validation and authorization; never retry.
 */
export function createPost(fields) {
  if (!validFields(fields)) return { ok: false, reason: 'validation' };
  const session = getSession();
  if (!session) return { ok: false, reason: 'forbidden' };
  const posts = getPosts();
  let id;
  try {
    id = window.crypto.randomUUID();
    if (typeof id !== 'string' || !UUID.test(id)
      || posts.some(post => post.id.toLowerCase() === id.toLowerCase())) {
      return { ok: false, reason: 'id_unavailable' };
    }
  } catch {
    return { ok: false, reason: 'id_unavailable' };
  }
  const post = {
    id, title: fields.title.trim(), content: fields.content, createdAt: new Date().toISOString(),
    authorId: session.userId, authorName: session.displayName,
  };
  if (!savePosts([...posts, post]).ok) return { ok: false, reason: 'storage_write_failed' };
  return { ok: true, post, navigateTo: `/blog/${id}` };
}

/**
 * Replace only title and content on the latest authorized target.
 * Args:
 *   fields (object): Target id, required title and content; supplied metadata is ignored.
 * Returns:
 *   {MutationResult} Durable updated post or failure, preserving all attribution and creation metadata.
 */
export function updatePost(fields) {
  if (!validFields(fields)) return { ok: false, reason: 'validation' };
  const session = getSession();
  if (!session) return { ok: false, reason: 'forbidden' };
  const posts = getPosts();
  const target = posts.find(post => post.id === fields.id);
  if (!target) return { ok: false, reason: 'not_found' };
  if (!canManagePost(session, target)) return { ok: false, reason: 'forbidden' };
  const post = { ...target, title: fields.title.trim(), content: fields.content };
  if (!savePosts(posts.map(record => record.id === target.id ? post : record)).ok) {
    return { ok: false, reason: 'storage_write_failed' };
  }
  return { ok: true, post, navigateTo: `/blog/${post.id}` };
}

/**
 * Confirm an explicitly requested deletion, then resolve identity and target again before writing.
 * Args:
 *   fields (object): Target id; supplied session or confirmation flags are not trusted.
 * Returns:
 *   {MutationResult} Removed id and list destination only after persistence, or safe failure.
 * Notes:
 *   Cancellation never writes. Re-reading after confirmation retains unrelated newer posts.
 */
export function deletePost(fields) {
  let session = getSession();
  if (!session) return { ok: false, reason: 'forbidden' };
  let posts = getPosts();
  let target = posts.find(post => post.id === fields?.id);
  if (!target) return { ok: false, reason: 'not_found' };
  if (!canManagePost(session, target)) return { ok: false, reason: 'forbidden' };
  if (!window.confirm('Delete this post? This cannot be undone.')) return { ok: false, reason: 'cancelled' };
  session = getSession();
  posts = getPosts();
  target = posts.find(post => post.id === fields.id);
  if (!target) return { ok: false, reason: 'not_found' };
  if (!canManagePost(session, target)) return { ok: false, reason: 'forbidden' };
  if (!savePosts(posts.filter(post => post.id !== target.id)).ok) {
    return { ok: false, reason: 'storage_write_failed' };
  }
  return { ok: true, removedId: target.id, navigateTo: '/blogs' };
}
