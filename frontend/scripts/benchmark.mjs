/** Observe native browser collection costs without asserting an unsourced latency budget. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:4173');
const result = await page.evaluate(() => {
  const rows = [];
  for (const count of [0, 3, 100, 1000]) {
    const posts = Array.from({ length: count }, (_, i) => ({ id: crypto.randomUUID(), title: `Observation ${i}`,
      content: 'Browser-local benchmark text.\n\nPlain paragraphs.', createdAt: new Date(2026, 0, 1 + i).toISOString(),
      authorId: 'admin', authorName: 'Admin' }));
    const users = Array.from({ length: count }, (_, i) => ({ id: crypto.randomUUID(), displayName: `Writer ${i}`,
      username: `observation-${i}`, password: 'demo-only', role: 'user', createdAt: new Date().toISOString() }));
    const samples = { write: [], readAndSort: [], userRead: [] };
    for (let i = 0; i < 50; i += 1) {
      let start = performance.now();
      localStorage.setItem('writespace_posts', JSON.stringify(posts));
      localStorage.setItem('writespace_users', JSON.stringify(users));
      samples.write.push(performance.now() - start);
      start = performance.now();
      JSON.parse(localStorage.getItem('writespace_posts')).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      samples.readAndSort.push(performance.now() - start);
      start = performance.now();
      JSON.parse(localStorage.getItem('writespace_users'));
      samples.userRead.push(performance.now() - start);
    }
    const measurements = {};
    for (const [name, times] of Object.entries(samples)) {
      times.sort((a, b) => a - b);
      measurements[name] = { p50_ms: times[24], p95_ms: times[47] };
    }
    rows.push({ count, repetitions: 50, measurements });
  }
  localStorage.clear();
  return { scope: 'Native browser stringify/write, parse/sort and user parse only; not full UI render or an approved SLO', rows };
});
await mkdir('evidence', { recursive: true });
await writeFile('evidence/performance.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
