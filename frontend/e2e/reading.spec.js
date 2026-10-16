/** Exercise real reading links, local persistence, role boundaries, and responsive text layout. */
import { test, expect, post } from './fixtures.js';

const USER_ID = '00000000-0000-4000-8000-000000000010';
const USER = {
  id: USER_ID, displayName: 'Riley Writer', username: 'riley', password: 'demo-only',
  role: 'user', createdAt: '2026-01-01T00:00:00Z',
};
const SESSION = { userId: USER_ID, username: USER.username, displayName: USER.displayName, role: 'user' };
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };

/**
 * Seed schema-valid local data once before initial app entry; reload must use the existing persisted values.
 * Args:
 *   page (Page): Browser fixture with console and page-error assertions already attached.
 *   posts (object[]): Complete local posts.
 *   session (object|null): Valid local identity or guest.
 * Returns:
 *   {Promise<void>} Install a one-time initializer without network interception.
 */
async function seed(page, posts, session = SESSION) {
  await page.addInitScript(({ records, account, identity }) => {
    if (localStorage.getItem('reading_fixture_initialized')) return;
    localStorage.setItem('reading_fixture_initialized', 'yes');
    localStorage.setItem('writespace_posts', JSON.stringify(records));
    localStorage.setItem('writespace_users', JSON.stringify([account]));
    if (identity) localStorage.setItem('writespace_session', JSON.stringify(identity));
  }, { records: posts, account: USER, identity: session });
}

/** Assert intrinsic layout has not introduced page-wide horizontal scrolling. */
async function expectNoOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const [width, columns] of [[390, 1], [768, 2], [1024, 3]]) {
  test(`list -> reader -> back and reload at ${width}px with ${columns} columns`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const content = `First paragraph.\n\n  Indented second paragraph.\n${'unbroken'.repeat(100)}`;
    const records = [post(1), post(4, { content }), post(2), post(3)];
    await seed(page, records);
    await page.goto('/');
    await page.getByRole('link', { name: 'Start Reading' }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    const grid = page.getByRole('region', { name: 'All posts' });
    await expect(grid.getByRole('heading')).toHaveText(['Story 4', 'Story 3', 'Story 2', 'Story 1']);
    await expect(grid.getByRole('article')).toHaveCount(4);
    await expect.poll(() => grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length))
      .toBe(columns);
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`list-${width}.png`), fullPage: true });
    await grid.getByRole('link', { name: 'Story 4' }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${records[1].id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Story 4');
    const body = page.locator('article > p');
    expect(await body.textContent()).toBe(content);
    await expect.poll(() => body.evaluate(element => getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
    await expect.poll(() => body.evaluate(element => getComputedStyle(element).overflowWrap)).toBe('break-word');
    await expect(page.locator('article time')).toHaveText('Jan 04, 2026');
    await expect(page.locator('article').getByText('Admin', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expectNoOverflow(page);
    await page.reload();
    expect(await body.textContent()).toBe(content);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Story 4');
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`reader-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Back to All Posts' }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('region', { name: 'All posts' }).getByRole('article')).toHaveCount(4);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual(records);
  });
}

test('user receives Edit only on their own post, with no deletion controls', async ({ page }) => {
  const owned = post(2, { authorId: USER_ID, authorName: USER.displayName });
  const other = post(1);
  await seed(page, [other, owned]);
  await page.goto('/blogs');
  await page.getByRole('link', { name: owned.title }).click();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute('href', `/edit/${owned.id}`);
  await expect(page.getByRole('img', { name: 'User avatar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to All Posts' }).click();
  await page.getByRole('link', { name: other.title }).click();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Post actions' }).getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

test('administrator receives Edit on another author post', async ({ page }) => {
  const record = post(1, { authorId: USER_ID, authorName: USER.displayName });
  await seed(page, [record], ADMIN);
  await page.goto('/blogs');
  await page.getByRole('link', { name: record.title }).click();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute('href', `/edit/${record.id}`);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

test('plain-text hostile markup remains literal in list and reader through reload', async ({ page }) => {
  const title = '<img src=x onerror=window.readingXss=true>';
  const content = '<script>window.readingXss=true</script>\n\n  <b>Literal text only</b>\n' + 'x'.repeat(400);
  const record = post(1, { title, content, authorName: '<em>Admin</em>' });
  await seed(page, [record]);
  await page.goto('/blogs');
  expect(await page.locator('article > p').textContent()).toBe(content.slice(0, 120));
  await expect(page.locator('article img, article script, article b, article em')).toHaveCount(0);
  await page.getByRole('link', { name: title }).click();
  expect(await page.locator('article > p').textContent()).toBe(content);
  await expect(page.locator('article').getByText('<em>Admin</em>', { exact: true })).toBeVisible();
  await expect(page.locator('article img, article script, article b, article em')).toHaveCount(0);
  expect(await page.evaluate(() => window.readingXss)).toBeUndefined();
  await page.reload();
  expect(await page.locator('article > p').textContent()).toBe(content);
  await expect(page.locator('article img, article script, article b, article em')).toHaveCount(0);
  expect(await page.evaluate(() => window.readingXss)).toBeUndefined();
});

test('missing deep route shows exact message, reloads, and returns through its real back link', async ({ page }) => {
  await seed(page, [post(1)]);
  await page.goto('/blog/missing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Post not found.');
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Post not found.');
  await page.getByRole('link', { name: 'Back to All Posts' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('All Posts');
  await expect(page.getByRole('link', { name: 'Story 1' })).toBeVisible();
});

test('valid deep reader restores its full post after reload', async ({ page }) => {
  const record = post(1);
  await seed(page, [record]);
  await page.goto(`/blog/${record.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(record.title);
  expect(await page.locator('article > p').textContent()).toBe(record.content);
  await page.reload();
  expect(await page.locator('article > p').textContent()).toBe(record.content);
  await page.getByRole('link', { name: 'Back to All Posts' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
});

for (const path of ['/blogs', `/blog/${post(1).id}`]) {
  test(`guest is denied at initial protected entry ${path}`, async ({ page }) => {
    await seed(page, [post(1)], null);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Story 1' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'All posts' })).toHaveCount(0);
  });
}

test('empty list supplies exact copy and a real write-route CTA', async ({ page }, testInfo) => {
  await seed(page, []);
  await page.goto('/blogs');
  await expect(page.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Write a Post' })).toHaveAttribute('href', '/write');
  await page.screenshot({ path: testInfo.outputPath('empty-reading.png'), fullPage: true });
});
