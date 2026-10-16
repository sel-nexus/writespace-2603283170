/** Test the production artifact with history fallback and one worker. */
import { defineConfig } from '@playwright/test';
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 30000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 0.0.0.0', url: baseURL, reuseExistingServer: true, timeout: 30000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
