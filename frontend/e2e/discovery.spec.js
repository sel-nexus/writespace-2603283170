/** Exercise public discovery against built assets with console-error capture from the shared fixture. */
import { test, expect, post } from './fixtures.js';

const demoUser = {
  id: '00000000-0000-4000-8000-000000000099',
  displayName: 'Local reader',
  username: 'local-reader',
  password: 'demo-only-not-a-real-password',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Seed complete local records before the first document loads.
 * Args:
 *   page (Page): Fixture-owned page that captures console and uncaught errors.
 *   posts (object[]): Complete posts to seed.
 *   users (object[]): Complete registered users to seed.
 * Returns:
 *   {Promise<void>} Initialization registered without navigating.
 */
async function seed(page, posts = [], users = []) {
  await page.addInitScript(({ posts, users }) => {
    localStorage.setItem('writespace_posts', JSON.stringify(posts));
    localStorage.setItem('writespace_users', JSON.stringify(users));
    localStorage.removeItem('writespace_session');
  }, { posts, users });
}

/**
 * Assert a public readable notice and no horizontal document overflow.
 * Args:
 *   page (Page): Current discovery page.
 * Returns:
 *   {Promise<void>} Assertions complete.
 */
async function assertPublicLimits(page) {
  const notice = page.getByRole('complementary', { name: 'A local demo, not production security' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('client-side only');
  await expect(notice).toContainText('plaintext in localStorage');
  await expect(notice).toContainText('Do not use real passwords');
  await expect(notice).toContainText('no cloud backup or cross-device sync');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/**
 * Save and attach a human-review screenshot without treating it as visual proof.
 * Args:
 *   page (Page): Current rendered page.
 *   testInfo (TestInfo): Per-test output locations and attachments.
 *   name (string): Screenshot artifact label.
 * Returns:
 *   {Promise<void>} Screenshot written by Playwright when the parent executes this spec.
 */
async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('guest discovers the newest three previews, then activates reading and registration links', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const content = 'A'.repeat(120) + 'THIS_SUFFIX_MUST_NOT_APPEAR';
  await seed(page, [post(2), post(4, { content }), post(1), post(3)]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeVisible();
  await expect(page.getByText('Your thoughts. Your space. Beautifully simple.')).toBeVisible();
  const features = page.getByRole('region', { name: 'Room for what matters' });
  await expect(features.getByRole('article')).toHaveCount(3);
  await expect(features.getByRole('heading', { name: 'Write Freely' })).toBeVisible();
  await expect(features.getByRole('heading', { name: 'Private & Local' })).toBeVisible();
  await expect(features.getByRole('heading', { name: 'Instant & Fast' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('WriteSpace');
  const latest = page.getByRole('region', { name: 'Latest from the Blog' });
  await expect(latest.getByRole('article')).toHaveCount(3);
  await expect(latest.getByRole('heading', { level: 3 })).toHaveText(['Story 4', 'Story 3', 'Story 2']);
  await expect(latest.getByText('Jan 04, 2026')).toBeVisible();
  expect(await latest.getByRole('article').first().locator('p').textContent()).toBe(content.slice(0, 120));
  await expect(page.getByText('THIS_SUFFIX_MUST_NOT_APPEAR')).toHaveCount(0);
  await latest.getByRole('link', { name: 'Story 4' }).hover();
  await expect(page).toHaveURL(/\/$/);
  await assertPublicLimits(page);
  await screenshot(page, testInfo, 'discovery-desktop-populated');

  await latest.getByRole('link', { name: 'Story 4' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')).length)).toBe(4);
});

test('mobile preview and navigation remain usable, with one/two/three columns across breakpoints', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, [post(1), post(2), post(3, { title: 'A'.repeat(140), content: 'B'.repeat(180) })]);
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  const nav = page.getByRole('navigation', { name: 'Public navigation' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  await toggle.hover();
  await toggle.focus();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.press('Enter');
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  await screenshot(page, testInfo, 'discovery-mobile-menu-open');
  await page.getByRole('button', { name: 'Close navigation' }).press('Space');
  await expect(nav).toBeHidden();
  await assertPublicLimits(page);

  const latest = page.getByRole('region', { name: 'Latest from the Blog' });
  const grid = latest.getByRole('article').first().locator('..');
  for (const [width, columns] of [[390, 1], [768, 2], [1280, 3]]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(columns);
    await assertPublicLimits(page);
    await screenshot(page, testInfo, `discovery-preview-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await latest.getByRole('link', { name: 'Story 2', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const destinationToggle = page.getByRole('button', { name: /navigation/ });
  if (await destinationToggle.getAttribute('aria-expanded') === 'false') await destinationToggle.click();
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(latest.getByRole('article')).toHaveCount(3);
  await assertPublicLimits(page);
});

for (const [label, corrupted] of [
  ['malformed-json', '{broken'],
  ['non-array', '{"posts":[]}'],
  ['whole-array-invalid', JSON.stringify([post(1), post(2, { createdAt: '2026-02-30T00:00:00Z' })])],
  ['duplicate-ids', JSON.stringify([post(1), post(1)])],
]) {
  test(`corrupt posts (${label}) fall back without repairing data or touching valid users`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seed(page, [post(1)], [demoUser]);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Story 1', exact: true })).toBeVisible();
    await page.evaluate(raw => localStorage.setItem('writespace_posts', raw), corrupted);
    await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
    const latest = page.getByRole('region', { name: 'Latest from the Blog' });
    await expect(latest.getByText('No posts yet — check back soon!')).toBeVisible();
    await expect(latest.getByRole('article')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(corrupted);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual([demoUser]);
    await assertPublicLimits(page);
    await screenshot(page, testInfo, `discovery-corrupt-posts-${label}`);
  });
}

test('corrupt users do not hide valid posts or trigger a repair during discovery', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page, [post(1), post(2)], [demoUser]);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('writespace_users', '{broken-users'));
  await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  const latest = page.getByRole('region', { name: 'Latest from the Blog' });
  await expect(latest.getByRole('heading', { level: 3 })).toHaveText(['Story 2', 'Story 1']);
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe('{broken-users');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual([post(1), post(2)]);
  await assertPublicLimits(page);
  await screenshot(page, testInfo, 'discovery-corrupt-users-valid-posts');
});

test('an unavailable storage getter yields an empty public page with usable CTAs', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Browser storage denied', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await assertPublicLimits(page);
  await screenshot(page, testInfo, 'discovery-storage-unavailable');
  await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('unknown deep paths render a true not-found state and return home by link activation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page);
  await page.goto('/this-page-does-not-exist/deep');
  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to WriteSpace' })).toHaveAttribute('href', '/');
  await screenshot(page, testInfo, 'discovery-unknown-path');
  await page.getByRole('link', { name: 'Back to WriteSpace' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeVisible();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await assertPublicLimits(page);
  await screenshot(page, testInfo, 'discovery-empty');
});
