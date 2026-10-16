/** Verify real persisted authoring journeys; the shared fixture rejects console and uncaught browser errors. */
import { test, expect, post } from './fixtures.js';

const USER_ID = '00000000-0000-4000-8000-000000000010';
const USER = {
  id: USER_ID, username: 'riley', displayName: 'Riley Writer', password: 'local-demo-only',
  role: 'user', createdAt: '2026-03-04T12:00:00.000Z',
};
const SESSION = { userId: USER_ID, username: USER.username, displayName: USER.displayName, role: USER.role };
const OWN_POST = post(1, { title: 'Owner note', content: '  Original\n\n  Ending  ', authorId: USER_ID, authorName: USER.displayName });

/** Read actual durable records, not a page-local state snapshot. */
async function persistedPosts(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts') || '[]'));
}

/** Capture unchanged durable bytes through real browser reads, including unaffected authentication keys. */
async function durableBytes(page) {
  return page.evaluate(() => ({
    posts: localStorage.getItem('writespace_posts'),
    users: localStorage.getItem('writespace_users'),
    session: localStorage.getItem('writespace_session'),
  }));
}

/**
 * Test-only browser storage restriction at the native Storage boundary (LLD 8.1).
 * Only localStorage.setItem('writespace_posts', ...) throws a DOMException; real reads,
 * other keys, auth/posts functions, and routes remain untouched. No application-layer mocks.
 * Count blocked writes to prove explicit submission reached persistence rather than validation.
 */
async function restrictPostWrites(page) {
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__authoringBlockedWrites = 0;
    Storage.prototype.setItem = function restrictedSetItem(key, value) {
      if (this === localStorage && key === 'writespace_posts') {
        window.__authoringBlockedWrites += 1;
        throw new DOMException('private storage fault detail', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };
  });
}

/** Seed only once for an independent deep-link-entry scenario, leaving reloads free to prove persistence. */
async function seedEntry(page, posts = [OWN_POST]) {
  await page.addInitScript(({ user, session, posts }) => {
    if (!localStorage.getItem('writespace_users')) {
      localStorage.setItem('writespace_users', JSON.stringify([user]));
      localStorage.setItem('writespace_session', JSON.stringify(session));
      localStorage.setItem('writespace_posts', JSON.stringify(posts));
    }
  }, { user: USER, session: SESSION, posts });
}

test('register -> create -> full reader -> edit -> delete -> reload uses durable post values', async ({ page }, testInfo) => {
  await page.goto('/register');
  await page.getByLabel('Display name', { exact: true }).fill('Journey Writer');
  await page.getByLabel('Username', { exact: true }).fill('journey-writer');
  await page.getByLabel('Password', { exact: true }).fill('demo-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')));
  const users = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')));
  expect(users).toHaveLength(1);
  expect(session.userId).toBe(users[0].id);
  await page.getByRole('link', { name: 'Write a Post', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  const content = '  First paragraph.\n\n  Second paragraph.\nFinal line  ';
  await page.getByLabel('Title', { exact: true }).fill('  Browser-local journey  ');
  await page.getByLabel('Content', { exact: true }).fill(content);
  await expect(page.getByText(`${content.length} characters`, { exact: true })).toBeVisible();
  expect(await persistedPosts(page)).toEqual([]);
  await page.getByRole('button', { name: 'Publish Post', exact: true }).click();
  const [created] = await persistedPosts(page);
  expect(created).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/i), title: 'Browser-local journey', content,
    createdAt: expect.any(String), authorId: session.userId, authorName: session.displayName,
  });
  expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(created.title);
  expect(await page.locator('article > p').textContent()).toBe(created.content);
  await page.reload();
  expect(await persistedPosts(page)).toEqual([created]);
  expect(await page.locator('article > p').textContent()).toBe(created.content);
  await page.getByRole('link', { name: 'Back to All Posts', exact: true }).click();
  await page.getByRole('article').getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(created.title);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(created.content);
  const revisedContent = '  Revised\n\n  Durable whitespace  ';
  await page.getByLabel('Title', { exact: true }).fill('  Revised journey  ');
  await page.getByLabel('Content', { exact: true }).fill(revisedContent);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  const expected = { ...created, title: 'Revised journey', content: revisedContent };
  expect(await persistedPosts(page)).toEqual([expected]);
  expect(await page.locator('article > p').textContent()).toBe(revisedContent);
  await page.reload();
  expect(await persistedPosts(page)).toEqual([expected]);
  const beforeReaderEdit = await page.evaluate(() => localStorage.getItem('writespace_posts'));
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${created.id}$`));
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(expected.title);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(expected.content);
  await page.getByLabel('Title', { exact: true }).fill('Reader edit to discard');
  await page.getByLabel('Content', { exact: true }).fill('Discarded reader content');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  expect(await persistedPosts(page)).toEqual([expected]);
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(beforeReaderEdit);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(expected.title);
  expect(await page.locator('article > p').textContent()).toBe(expected.content);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${created.id}$`));
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(expected.title);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(expected.content);
  const readerContent = '  Saved from reader\n\n  Metadata stays intact  ';
  await page.getByLabel('Title', { exact: true }).fill('  Reader revision  ');
  await page.getByLabel('Content', { exact: true }).fill(readerContent);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  const readerExpected = { ...expected, title: 'Reader revision', content: readerContent };
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  expect(await persistedPosts(page)).toEqual([readerExpected]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(readerExpected.title);
  expect(await page.locator('article > p').textContent()).toBe(readerExpected.content);
  await page.reload();
  expect(await persistedPosts(page)).toEqual([readerExpected]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(readerExpected.title);
  expect(await page.locator('article > p').textContent()).toBe(readerExpected.content);
  await page.screenshot({ path: testInfo.outputPath('authoring-reader.png'), fullPage: true });
  let confirmations = 0;
  page.once('dialog', async dialog => {
    confirmations += 1;
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete post', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(confirmations).toBe(1);
  expect(await persistedPosts(page)).toEqual([]);
  await page.reload();
  expect(await persistedPosts(page)).toEqual([]);
  await expect(page.getByText('No blogs yet. Be the first to write one!')).toBeVisible();
});

test('deep-link edit cancel and reader delete cancellation never persist unsaved changes', async ({ page }) => {
  await seedEntry(page);
  await page.goto(`/edit/${OWN_POST.id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(OWN_POST.title);
  await page.getByLabel('Title', { exact: true }).fill('Discard this draft');
  await page.getByLabel('Content', { exact: true }).fill('Discard this content');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${OWN_POST.id}$`));
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
  let confirmations = 0;
  page.once('dialog', async dialog => {
    confirmations += 1;
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Delete post', exact: true }).click();
  expect(confirmations).toBe(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(OWN_POST.title);
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
  await page.reload();
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
  expect(await page.locator('article > p').textContent()).toBe(OWN_POST.content);
  await page.getByRole('link', { name: 'Back to All Posts', exact: true }).click();
  await page.getByRole('link', { name: 'Write a Post', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Discard new draft');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
});

test('deep-link non-owner edit denies the form and reader/card management controls', async ({ page }) => {
  const otherPost = post(2, { title: 'Another author note' });
  await seedEntry(page, [otherPost]);
  await page.goto(`/edit/${otherPost.id}`);
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByLabel('Content', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('article').getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: otherPost.title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(otherPost.title);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete post', exact: true })).toHaveCount(0);
  expect(await persistedPosts(page)).toEqual([otherPost]);
});

test('deep-link write validates fields on mobile and retains the blank draft without writes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedEntry(page);
  await page.goto('/write');
  await page.getByRole('button', { name: 'Publish Post', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(2);
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Content', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Title is required.', { exact: true })).toBeVisible();
  await expect(page.getByText('Content is required.', { exact: true })).toBeVisible();
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
  await page.screenshot({ path: testInfo.outputPath('authoring-required-mobile.png'), fullPage: true });
  await page.getByLabel('Title', { exact: true }).fill('Valid title');
  await page.getByLabel('Content', { exact: true }).fill('\n   ');
  await page.getByRole('button', { name: 'Publish Post', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Valid title');
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('guest initial edit deep link redirects to login without exposing the editor', async ({ page }) => {
  await page.addInitScript(({ user, posts }) => {
    localStorage.setItem('writespace_users', JSON.stringify([user]));
    localStorage.setItem('writespace_posts', JSON.stringify(posts));
    localStorage.removeItem('writespace_session');
  }, { user: USER, posts: [OWN_POST] });
  await page.goto(`/edit/${OWN_POST.id}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Content', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  expect(await persistedPosts(page)).toEqual([OWN_POST]);
});

for (const mode of ['create', 'edit']) {
  test(`populated ${mode} retains draft and durable bytes when browser post persistence fails`, async ({ page }) => {
    const records = [OWN_POST, post(2, { title: 'Unrelated durable note' })];
    await seedEntry(page, records);
    await page.goto(mode === 'create' ? '/blogs' : `/blog/${OWN_POST.id}`);
    await page.getByRole('link', { name: mode === 'create' ? 'Write a Post' : 'Edit', exact: true }).click();
    const path = mode === 'create' ? '/write' : `/edit/${OWN_POST.id}`;
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (mode === 'edit') {
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue(OWN_POST.title);
      await expect(page.getByLabel('Content', { exact: true })).toHaveValue(OWN_POST.content);
    }
    const title = '  Filled draft must remain  ';
    const content = '  Filled first paragraph\n\n  Last paragraph  ';
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Content', { exact: true }).fill(content);
    const before = await durableBytes(page);
    await restrictPostWrites(page);
    await page.getByRole('button', { name: mode === 'create' ? 'Publish Post' : 'Save Changes', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to save this post. Your draft has not been saved.');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
    await expect(page.getByLabel('Content', { exact: true })).toHaveValue(content);
    await expect(page.getByText(`${content.length} characters`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: mode === 'create' ? 'Publish Post' : 'Save Changes', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(mode === 'create' ? 'Write a Post' : 'Edit Post');
    await expect(page.locator('article')).toHaveCount(0);
    expect(await page.evaluate(() => window.__authoringBlockedWrites)).toBe(1);
    expect(await durableBytes(page)).toEqual(before);
    expect(await persistedPosts(page)).toEqual(records);
  });
}

test('confirmed delete persistence failure retains the complete reader and durable bytes', async ({ page }) => {
  const records = [OWN_POST, post(2, { title: 'Unrelated durable note' })];
  await seedEntry(page, records);
  await page.goto(`/blog/${OWN_POST.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(OWN_POST.title);
  expect(await page.locator('article > p').textContent()).toBe(OWN_POST.content);
  const readerState = page.locator('article > :not([role="alert"])');
  const readerBefore = await readerState.allTextContents();
  const before = await durableBytes(page);
  await restrictPostWrites(page);
  let confirmations = 0;
  page.once('dialog', async dialog => {
    confirmations += 1;
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete post', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Unable to delete this post. Nothing has been saved.');
  await expect(page).toHaveURL(new RegExp(`/blog/${OWN_POST.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(OWN_POST.title);
  expect(await page.locator('article > p:not([role="alert"])').textContent()).toBe(OWN_POST.content);
  expect(await readerState.allTextContents()).toEqual(readerBefore);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete post', exact: true })).toBeVisible();
  expect(confirmations).toBe(1);
  expect(await page.evaluate(() => window.__authoringBlockedWrites)).toBe(1);
  expect(await durableBytes(page)).toEqual(before);
  expect(await persistedPosts(page)).toEqual(records);
});

test('anonymous deep-link authoring entry redirects to login without exposing fields', async ({ page }) => {
  await page.goto('/write');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.getByLabel('Content', { exact: true })).toHaveCount(0);
  expect(await persistedPosts(page)).toEqual([]);
});
