import { test } from '@playwright/test';

test('step4 e2e', async ({ page, request }) => {
  const base = 'http://localhost:3000';
  const samplePath = '/tmp/werbz-contact-sheet.png';

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console:${msg.text()}`); });

  await page.goto(`${base}/studio`);
  await page.fill('#password', 'qa-pass');
  await Promise.all([
    page.waitForURL(`${base}/studio`),
    page.getByRole('button', { name: /Sign In/i }).click(),
  ]);

  await page.getByRole('button', { name: /New Storybook/i }).click();
  await page.waitForURL(/\/studio\/[a-zA-Z0-9-]+/);
  const createdId = page.url().split('/studio/')[1].split('?')[0];

  await page.goto(`${base}/studio/${createdId}?upload=1`);
  await page.setInputFiles('input[type="file"]', samplePath);
  await page.getByRole('button', { name: /^Upload$/i }).click();

  await page.waitForSelector('text=Upload succeeded', { timeout: 120000 });
  const detectedText = (await page.locator('text=/Detected\\s+\\d+\\s+pages/i').first().textContent())?.trim();
  console.log('DETECTED_TEXT', detectedText);

  await page.getByRole('button', { name: /^Import Book$/i }).first().click();
  await page.waitForSelector('text=Import confirmation');
  await page.getByRole('button', { name: /^Import Book$/i }).nth(1).click();
  await page.waitForURL(/\/studio\/[a-zA-Z0-9-]+\?imported=1/, { timeout: 120000 });

  const importedId = page.url().split('/studio/')[1].split('?')[0];
  console.log('IMPORTED_ID', importedId);

  const body = await page.textContent('body');
  console.log('HAS_COVER', /Cover/.test(body || ''));
  console.log('HAS_END', /End/.test(body || ''));

  const apiList = await request.get(`${base}/api/storybooks`);
  console.log('API_STORYBOOKS_STATUS', apiList.status());

  if (errors.length) {
    console.log('BROWSER_ERRORS', JSON.stringify(errors));
  }
});
