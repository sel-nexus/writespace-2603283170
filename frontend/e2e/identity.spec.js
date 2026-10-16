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

const registeredWriter = {
  id: 'c4aecb1d-2db0-4bdb-bdb1-3f7192a6f29b',
  displayName: 'Riley Writer', username: 'riley', password: 'local-demo-only',
  role: 'user', createdAt: '2026-03-04T12:00:00.000Z',
};
const writerSession = {
  userId: registeredWriter.id, username: registeredWriter.username,
  displayName: registeredWriter.displayName, role: 'user',
};
const adminSession = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const registrationFailure = 'Could not complete registration in this browser. '
  + 'If your account was saved, sign in with your chosen credentials.';

/**
 * Seed complete records before app initialization using native localStorage.
 * TEST-ONLY faults restrict one Storage operation/key with a DOMException, never
 * app auth/session functions. Reads and all unblocked writes/removals stay native;
 * sessionStorage is unaffected. Delete window.__identityStorageRestriction via
 * page.evaluate to explicitly enable native writes again without creating a session.
 */
async function prepareIdentity(page, { users = [], session = null, fault = null } = {}) {
  await page.addInitScript(({ users, session, fault }) => {
    localStorage.setItem('writespace_users', JSON.stringify(users));
    localStorage.setItem('writespace_posts', '[]');
    if (session) localStorage.setItem('writespace_session', JSON.stringify(session));
    else localStorage.removeItem('writespace_session');
    if (!fault) return;
    window.__identityStorageRestriction = fault;
    const nativeOperation = Storage.prototype[fault.operation];
    Storage.prototype[fault.operation] = function (key, ...args) {
      const restriction = window.__identityStorageRestriction;
      if (this === window.localStorage && restriction?.key === key) {
        throw new DOMException('TEST-ONLY identity storage restriction', restriction.name);
      }
      return nativeOperation.call(this, key, ...args);
    };
  }, { users, session, fault });
}

// E-16 / LLD 39–40, 453: each role/route pair is an independent initial entry.
for (const { role, users, session, home, identity } of [
  { role: 'user', users: [registeredWriter], session: writerSession, home: '/blogs', identity: 'Riley Writer · Writer' },
  { role: 'admin', users: [], session: adminSession, home: '/admin', identity: 'Admin · Admin' },
]) {
  for (const entry of ['/login', '/register']) {
    test(`authenticated ${role} initially entering ${entry} redirects to exact role home without credentials`, async ({ page }) => {
      await prepareIdentity(page, { users, session });
      await page.goto(entry);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expect(page.getByText(identity, { exact: true })).toBeVisible();
      await openNavigation(page);
      await expect(page.getByRole('navigation', { name: 'Authenticated navigation' })).toBeVisible();
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Confirm password', { exact: true })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(session);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual(users);
    });
  }
}

// E-17 / LLD 210, 423–425: deny only the session setItem, not credential lookup.
test('login session-write failure retains credentials and guest shell without navigation or session', async ({ page }) => {
  await prepareIdentity(page, {
    users: [registeredWriter],
    fault: { operation: 'setItem', key: 'writespace_session', name: 'QuotaExceededError' },
  });
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('riley');
  await page.getByLabel('Password', { exact: true }).fill('local-demo-only');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not sign in in this browser. Please try again.');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('riley');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('local-demo-only');
  await openNavigation(page);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Authenticated navigation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual([registeredWriter]);
});

// E-17 / LLD 73: deny the FIRST write (users); session writes remain native.
test('registration account-write denied retains all fields and existing accounts without a session', async ({ page }) => {
  await prepareIdentity(page, {
    users: [registeredWriter],
    fault: { operation: 'setItem', key: 'writespace_users', name: 'SecurityError' },
  });
  await page.goto('/register');
  await page.getByLabel('Display name', { exact: true }).fill('Casey Writer');
  await page.getByLabel('Username', { exact: true }).fill('casey');
  await page.getByLabel('Password', { exact: true }).fill('local-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('local-only');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(registrationFailure);
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Casey Writer');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('casey');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('local-only');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('local-only');
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
  await openNavigation(page);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Authenticated navigation' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual([registeredWriter]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
});

// E-17 / LLD 73: the native account write succeeds; only the SECOND write fails.
test('registration session-write failure retains created account and guidance until explicit sign-in', async ({ page }) => {
  await prepareIdentity(page, {
    users: [registeredWriter],
    fault: { operation: 'setItem', key: 'writespace_session', name: 'QuotaExceededError' },
  });
  await page.goto('/register');
  await page.getByLabel('Display name', { exact: true }).fill('Casey Writer');
  await page.getByLabel('Username', { exact: true }).fill('casey');
  await page.getByLabel('Password', { exact: true }).fill('local-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('local-only');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(registrationFailure);
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Casey Writer');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('casey');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('local-only');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('local-only');
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Authenticated navigation' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')).length)).toBe(2);
  const savedUsers = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')));
  expect(savedUsers[0]).toEqual(registeredWriter);
  const createdAccount = savedUsers[1];
  expect(createdAccount).toEqual({
    id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    displayName: 'Casey Writer', username: 'casey', password: 'local-only', role: 'user',
    createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  });
  expect(Number.isFinite(Date.parse(createdAccount.createdAt))).toBe(true);

  // Explicit browser permission change only; no auth calls, session seed or automatic retry.
  await page.evaluate(() => { delete window.__identityStorageRestriction; });
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('alert')).toHaveText(registrationFailure);
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual(savedUsers);
  await openNavigation(page);
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username', { exact: true }).fill('casey');
  await page.getByLabel('Password', { exact: true }).fill('local-only');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByText('Casey Writer · Writer', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual({
    userId: createdAccount.id, username: 'casey', displayName: 'Casey Writer', role: 'user',
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual(savedUsers);
});

// E-17 / LLD 210, 425: deny only session removeItem; native reads prove it remains.
test('logout session-clear failure retains signed-in shell and session without navigating to root', async ({ page }) => {
  await prepareIdentity(page, {
    users: [registeredWriter], session: writerSession,
    fault: { operation: 'removeItem', key: 'writespace_session', name: 'SecurityError' },
  });
  await page.goto('/blogs');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByText('Riley Writer · Writer', { exact: true })).toBeVisible();
  await openNavigation(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not log out in this browser. Please try again.');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page).not.toHaveURL(/\/$/);
  await expect(page.getByText('Riley Writer · Writer', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Authenticated navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Blogs', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Get Started Free' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(writerSession);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual([registeredWriter]);
});
