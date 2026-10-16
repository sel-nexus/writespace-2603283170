/** Capture text-based interface evidence and screenshots before full browser journeys. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const output = 'evidence/preflight';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
/** Save hierarchy, styles, HTML and a screenshot for the current meaningful state. */
async function capture(name) {
  const tree = await page.accessibility.snapshot();
  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.querySelector('#root > div'));
    const main = getComputedStyle(document.querySelector('main'));
    const h1 = getComputedStyle(document.querySelector('h1'));
    return { font: body.fontFamily, background: body.backgroundColor, color: body.color,
      mainWidth: main.width, padding: main.padding, headingFont: h1.fontFamily,
      headingSize: h1.fontSize, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  await writeFile(`${output}/${name}.json`, JSON.stringify({ tree, styles, title: await page.title() }, null, 2));
  await writeFile(`${output}/${name}.html`, await page.content());
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  console.log(name, JSON.stringify(styles));
}
await page.goto(baseURL);
await capture('landing-desktop-empty');
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
await capture('landing-mobile-menu');
await page.getByRole('link', { name: 'Login', exact: true }).click();
await page.getByLabel('Username', { exact: true }).fill('admin');
await page.getByLabel('Password', { exact: true }).fill('admin');
await page.getByRole('button', { name: 'Login', exact: true }).click();
await page.waitForURL('**/admin');
await capture('dashboard-mobile-empty');
await page.getByRole('link', { name: 'Write New Post' }).click();
await page.getByRole('button', { name: 'Publish Post' }).click();
await capture('editor-mobile-error');
await page.getByLabel('Title', { exact: true }).fill('A quieter kind of publishing');
await page.getByLabel('Content', { exact: true }).fill('Words first.\n\nThis story stays in this browser.');
await page.getByRole('button', { name: 'Publish Post' }).click();
await page.waitForURL('**/blog/*');
await capture('reader-mobile-populated');
await page.setViewportSize({ width: 1280, height: 900 });
await capture('reader-desktop-populated');
if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
await context.close();
await browser.close();
