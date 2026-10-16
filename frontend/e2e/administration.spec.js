/** Verify real administrator journeys; the shared fixture automatically rejects browser console and page errors. */
import { test, expect, post } from './fixtures.js';

const ID = '00000000-0000-4000-8000-000000000010';
const WRITER = {
  id: ID, username: 'fixture-writer', displayName: 'Fixture Writer', password: 'demo-only', role: 'user',
  createdAt: '2026-03-04T12:00:00.000Z',
};
const ADMIN = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };

/** Sign in through the current login page rather than injecting an authenticated session. */
async function signIn(page, username, password) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

/** Create an account through labelled controls without changing the current administrator. */
async function createAccount(page, username, displayName, role) {
  await page.getByLabel('Display name', { exact: true }).fill(displayName);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('local-demo-only');
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption(role);
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Account created successfully.');
}

/** Read durable account records for persistence assertions, never page-local display state. */
async function accounts(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users') || '[]'));
}

/** Read durable posts for precise administrator mutation assertions. */
async function posts(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts') || '[]'));
}

/**
 * Inject a test-only browser storage fault after seeding/sign-in, not an application mock.
 * Only localStorage.setItem for the selected key throws a real DOMException; all reads,
 * sessionStorage and nonblocked writes still use native Storage methods and durable data.
 * Installed in the current document only, so reload restores native writes automatically.
 */
async function blockStorageWrite(page, blockedKey) {
  await page.evaluate(keyToBlock => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && String(key) === keyToBlock) {
        throw new DOMException('Test-only storage write restriction', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };
  }, blockedKey);
}

/** Resolve an account action in the desktop table instead of its hidden mobile copy. */
function accountDelete(page, username) {
  return page.getByRole('table', { name: 'Local accounts' }).getByRole('button', { name: `Delete ${username}`, exact: true });
}

/** Seed complete records only once so page reloads can prove committed changes. */
async function seedEntry(page, session, initialPosts = []) {
  await page.addInitScript(({ user, session, initialPosts }) => {
    if (localStorage.getItem('writespace_users') === null) {
      localStorage.setItem('writespace_users', JSON.stringify([user]));
      if (session) localStorage.setItem('writespace_session', JSON.stringify(session));
      localStorage.setItem('writespace_posts', JSON.stringify(initialPosts));
    }
  }, { user: WRITER, session, initialPosts });
}

test('admin sign-in -> dashboard -> create writer/admin -> cancel/delete/reload -> current protection -> writer login', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin Dashboard');
  for (const [label, count] of [['Total Posts', 0], ['Total Users', 0], ['Total Admins', 1], ['Total users', 0]]) {
    await expect(page.getByRole('group', { name: label, exact: true })).toHaveText(`${label}${count}`);
  }
  await expect(page.getByText('No posts yet.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Provisional counts:/)).toBeVisible();
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(accountDelete(page, 'admin')).toBeDisabled();
  await expect(accountDelete(page, 'admin')).toHaveAttribute('title', 'Default admin cannot be deleted.');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(3);
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await createAccount(page, 'journey-writer', 'Journey Writer', 'user');
  await createAccount(page, 'journey-admin', 'Journey Admin', 'admin');
  await createAccount(page, 'temporary', 'Temporary Account', 'user');
  const created = await accounts(page);
  expect(created.map(user => [user.username, user.role])).toEqual([
    ['journey-writer', 'user'], ['journey-admin', 'admin'], ['temporary', 'user'],
  ]);
  created.forEach(user => {
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
  });
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect(await page.locator('body').textContent()).not.toContain('local-demo-only');
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    await dialog.dismiss();
  });
  await accountDelete(page, 'journey-writer').click();
  expect(await accounts(page)).toEqual(created);
  await expect(accountDelete(page, 'journey-writer')).toBeEnabled();
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await accountDelete(page, 'temporary').click();
  await expect(page.getByRole('status')).toHaveText('Account deleted successfully.');
  await expect(accountDelete(page, 'temporary')).toHaveCount(0);
  expect(await accounts(page)).toEqual(created.slice(0, 2));
  await page.reload();
  expect(await accounts(page)).toEqual(created.slice(0, 2));
  await expect(accountDelete(page, 'journey-admin')).toBeVisible();
  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Total Users', exact: true })).toHaveText('Total Users2');
  await expect(page.getByRole('group', { name: 'Total users', exact: true })).toHaveText('Total users2');
  await expect(page.getByRole('group', { name: 'Total Admins', exact: true })).toHaveText('Total Admins2');
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await signIn(page, 'journey-admin', 'local-demo-only');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(accountDelete(page, 'journey-admin')).toBeDisabled();
  await expect(accountDelete(page, 'admin')).toBeDisabled();
  await expect(accountDelete(page, 'journey-writer')).toBeEnabled();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await signIn(page, 'journey-writer', 'local-demo-only');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Manage Users', exact: true })).toHaveCount(0);
});

test('dashboard inline edit and delete manage another author post with cancellation and reload persistence', async ({ page }) => {
  const stories = [post(1, { authorId: ID, authorName: WRITER.displayName }), post(2)];
  await seedEntry(page, null, stories);
  await page.goto('/login');
  await signIn(page, 'admin', 'admin');
  await page.getByRole('link', { name: 'Write New Post', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const row = page.getByRole('article', { name: 'Story 1', exact: true });
  await row.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(stories[0].title);
  await page.getByLabel('Title', { exact: true }).fill('Admin revision of writer story');
  await page.getByLabel('Content', { exact: true }).fill('  Revised\n\n  Whitespace  ');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  const revised = { ...stories[0], title: 'Admin revision of writer story', content: '  Revised\n\n  Whitespace  ' };
  expect(await posts(page)).toEqual([revised, stories[1]]);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const revisedRow = page.getByRole('article', { name: revised.title, exact: true });
  page.once('dialog', async dialog => { await dialog.dismiss(); });
  await revisedRow.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await posts(page)).toEqual([revised, stories[1]]);
  page.once('dialog', async dialog => { await dialog.accept(); });
  await revisedRow.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await posts(page)).toEqual([stories[1]]);
  await page.reload();
  expect(await posts(page)).toEqual([stories[1]]);
  await expect(page.getByRole('link', { name: revised.title, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: stories[1].title, exact: true })).toBeVisible();
});

test('admin account create and confirmed deletion write failures retain form, accounts and route without false success', async ({ page }) => {
  await seedEntry(page, null);
  await page.goto('/login');
  await signIn(page, 'admin', 'admin');
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  const originalURL = page.url();
  const originalAccounts = await accounts(page);
  const fields = { displayName: 'Unsaved Administrator', username: 'unsaved-admin', password: 'local-failure-only', role: 'admin' };
  await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
  await page.getByLabel('Username', { exact: true }).fill(fields.username);
  await page.getByLabel('Password', { exact: true }).fill(fields.password);
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption(fields.role);
  await blockStorageWrite(page, 'writespace_users');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Unable to save account changes. No changes have been saved.');
  await expect(page.getByRole('status')).toHaveText('');
  await expect(page).toHaveURL(originalURL);
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(fields.displayName);
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(fields.username);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(fields.password);
  await expect(page.getByRole('combobox', { name: 'Role', exact: true })).toHaveValue(fields.role);
  await expect(accountDelete(page, fields.username)).toHaveCount(0);
  expect(await accounts(page)).toEqual(originalAccounts);

  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await accountDelete(page, WRITER.username).click();
  await expect(page.getByRole('alert')).toHaveText('Unable to save account changes. No changes have been saved.');
  await expect(page.getByRole('status')).toHaveText('');
  await expect(page).toHaveURL(originalURL);
  await expect(accountDelete(page, WRITER.username)).toBeVisible();
  await expect(accountDelete(page, WRITER.username)).toBeEnabled();
  expect(await accounts(page)).toEqual(originalAccounts);
  await page.reload();
  await expect(page).toHaveURL(originalURL);
  await expect(accountDelete(page, WRITER.username)).toBeVisible();
  await expect(accountDelete(page, fields.username)).toHaveCount(0);
  expect(await accounts(page)).toEqual(originalAccounts);
});

test('admin dashboard confirmed post deletion write failure retains post and route with generic feedback', async ({ page }) => {
  const stories = [post(1, { authorId: ID, authorName: WRITER.displayName }), post(2)];
  await seedEntry(page, null, stories);
  await page.goto('/login');
  await signIn(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  const originalURL = page.url();
  const row = page.getByRole('article', { name: stories[0].title, exact: true });
  await expect(row).toBeVisible();
  await blockStorageWrite(page, 'writespace_posts');
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Unable to delete this post. It has not been deleted.');
  await expect(page).toHaveURL(originalURL);
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Total Posts', exact: true })).toHaveText('Total Posts2');
  expect(await posts(page)).toEqual(stories);
  await page.reload();
  await expect(page).toHaveURL(originalURL);
  await expect(row).toBeVisible();
  await expect(page.getByRole('article', { name: stories[1].title, exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Total Posts', exact: true })).toHaveText('Total Posts2');
  expect(await posts(page)).toEqual(stories);
});

for (const path of ['/admin', '/users']) {
  test(`normal writer deep-entry ${path} denies administrator content`, async ({ page }) => {
    await seedEntry(page, { userId: ID, username: WRITER.username, displayName: WRITER.displayName, role: 'user' });
    await page.goto(path);
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All Posts');
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create User', exact: true })).toHaveCount(0);
  });

  test(`anonymous deep-entry ${path} redirects to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'User Management', exact: true })).toHaveCount(0);
  });
}

test('responsive account table becomes stacked mobile cards without overflow and saves review screenshots', async ({ page }, testInfo) => {
  await seedEntry(page, ADMIN);
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Local accounts' })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(5);
  expect(await page.getByRole('columnheader').evaluateAll(headers => headers.every(header => header.scope === 'col'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('administration-table-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('table', { name: 'Local accounts' })).toBeHidden();
  await expect(page.getByRole('article', { name: `Account ${WRITER.username}` })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Account admin', exact: true }).getByRole('button')).toBeDisabled();
  const mobileUsername = 'long-account-name-without-spaces'.repeat(3);
  await createAccount(page, mobileUsername, 'Long editorial display name '.repeat(4), 'user');
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('administration-cards-mobile.png'), fullPage: true });
  const created = await accounts(page);
  const mobileCard = page.getByRole('article', { name: `Account ${mobileUsername}`, exact: true });
  const mobileDelete = mobileCard.getByRole('button', { name: `Delete ${mobileUsername}`, exact: true });
  await expect(mobileCard).toBeVisible();
  await expect(mobileDelete).toBeVisible();
  await expect(mobileDelete).toBeEnabled();
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    await dialog.dismiss();
  });
  await mobileDelete.click();
  await expect(mobileCard).toBeVisible();
  await expect(mobileDelete).toBeEnabled();
  await expect(page.getByRole('status')).toHaveText('');
  expect(await accounts(page)).toEqual(created);
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await mobileDelete.click();
  await expect(page.getByRole('status')).toHaveText('Account deleted successfully.');
  await expect(mobileCard).toHaveCount(0);
  const remaining = created.filter(user => user.username !== mobileUsername);
  expect(await accounts(page)).toEqual(remaining);
  await page.reload();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('table', { name: 'Local accounts' })).toBeHidden();
  await expect(mobileCard).toHaveCount(0);
  await expect(page.getByRole('article', { name: `Account ${WRITER.username}`, exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Account admin', exact: true }).getByRole('button')).toBeDisabled();
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await accounts(page)).toEqual(remaining);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
