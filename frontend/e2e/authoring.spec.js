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

test('anonymous deep-link authoring entry redirects to login without exposing fields', async ({ page }) => {
  await page.goto('/write');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.getByLabel('Content', { exact: true })).toHaveCount(0);
  expect(await persistedPosts(page)).toEqual([]);
});
