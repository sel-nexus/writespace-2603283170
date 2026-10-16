/** Exercise real identity journeys via clicks, persistence and screenshots; protected-page journeys belong to later slices. */
import { test, expect } from './fixtures.js';

/** Open mobile navigation only if the current viewport exposes its explicit control. */
async function openNavigation(page) {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
}

/** Capture a named full-page state for human review through the existing Playwright artifact directory. */
async function capture(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

test('exact invalid login, built-in admin session, role CTA and logout', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('admin');
  await capture(page, testInfo, 'invalid-login');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Admin · Admin', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual({
    userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin',
  });
  await page.reload();
  await expect(page.getByText('Admin · Admin', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/admin');
  await capture(page, testInfo, 'admin-role-home-cta');
  await openNavigation(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Get Started Free' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
});

test('mobile register, reload, logout, and sign in to the retained account', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started Free' }).click();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText('Display name is required.', { exact: true })).toBeVisible();
  await page.getByLabel('Display name', { exact: true }).fill('Casey Writer');
  await page.getByLabel('Username', { exact: true }).fill('casey');
  await page.getByLabel('Password', { exact: true }).fill('local-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords must match.');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Casey Writer');
  await page.getByLabel('Confirm password', { exact: true }).fill('local-only');
  await capture(page, testInfo, 'mobile-registration');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByText('Casey Writer · Writer', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')).map(user => ({
    displayName: user.displayName, username: user.username, role: user.role,
  })))).toEqual([{ displayName: 'Casey Writer', username: 'casey', role: 'user' }]);
  await page.reload();
  await expect(page.getByText('Casey Writer · Writer', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Go to My Space' })).toHaveAttribute('href', '/blogs');
  await openNavigation(page);
  await expect(page.getByRole('navigation', { name: 'Authenticated navigation' })).toBeVisible();
  await capture(page, testInfo, 'mobile-signed-in-navigation');
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Get Started Free' })).toBeVisible();
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await page.getByLabel('Username', { exact: true }).fill('casey');
  await page.getByLabel('Password', { exact: true }).fill('local-only');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByText('Casey Writer · Writer', { exact: true })).toBeVisible();
});

// Guest/admin-only route boundaries are unit-tested with MemoryRouter now.
// Real guest journeys will be finalized when Home and Admin routes exist; no unknown-fallback assertions are frozen here.
