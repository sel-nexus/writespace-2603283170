/** Collect real browser failures for every feature journey. */
import { test as base, expect } from '@playwright/test';
export { expect };
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Browser console and uncaught errors').toEqual([]);
  }
});
/** Build a complete post fixture without weakening persisted schema. */
export function post(index, overrides = {}) {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, title: `Story ${index}`, content: `Local content ${index}`, createdAt: new Date(Date.UTC(2026, 0, index)).toISOString(), authorId: 'admin', authorName: 'Admin', ...overrides };
}
