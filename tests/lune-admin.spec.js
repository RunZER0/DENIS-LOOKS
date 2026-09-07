const assert = require('assert');
const { chromium } = require('playwright');

const BASE = process.env.LUNE_BASE_URL || 'http://127.0.0.1:3000';

async function desktopAdmin(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });

  await page.waitForSelector('#metric-grid .metric');
  assert.strictEqual(await page.locator('#metric-grid .metric').count(), 4, 'admin overview should show four network metrics');

  await page.locator('.admin-nav-item[data-view="orders"]').click();
  await page.waitForSelector('[data-view-panel="orders"].active #orders-body tr');
  assert((await page.locator('#orders-body tr').count()) >= 5, 'admin orders should populate');

  await page.locator('.admin-nav-item[data-view="partners"]').click();
  await page.waitForSelector('[data-view-panel="partners"].active #partners-grid .ops-card');
  assert((await page.locator('#partners-grid .ops-card').count()) >= 3, 'admin partners should populate');

  await page.locator('[data-add="partner"]').click();
  await page.locator('#admin-dialog[open]').waitFor({ state: 'visible' });
  await page.locator('#admin-dialog button[value="cancel"]').first().click();

  await page.locator('.admin-nav-item[data-view="curation"]').click();
  await page.waitForSelector('[data-view-panel="curation"].active #curation-grid .curation-card');
  assert((await page.locator('#curation-grid .curation-card').count()) >= 10, 'admin curation should expose the catalog');

  await page.locator('.admin-nav-item[data-view="recommendations"]').click();
  await page.waitForSelector('[data-view-panel="recommendations"].active #reco-form');
  const total = await page.locator('#reco-form').evaluate(form =>
    Number(form.affinity.value) + Number(form.quality.value) + Number(form.novelty.value)
  );
  assert.strictEqual(total, 100, 'recommendation weighting should start normalized');

  await context.close();
}

async function mobileAdmin(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#metric-grid .metric');

  const surface = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert(surface.scrollWidth <= surface.width + 2, `mobile admin should not overflow the viewport (${surface.scrollWidth}px > ${surface.width}px)`);

  await page.locator('[data-menu-toggle]').click();
  await page.locator('#admin-sidebar.open').waitFor({ state: 'visible' });
  await page.locator('.admin-nav-item[data-view="orders"]').click();
  await page.waitForSelector('[data-view-panel="orders"].active');
  assert(await page.locator('.table-wrap').first().evaluate(el => el.scrollWidth >= el.clientWidth), 'wide admin tables should stay inside their own scroll container');

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await desktopAdmin(browser);
    await mobileAdmin(browser);
    console.log('Lune admin smoke checks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
