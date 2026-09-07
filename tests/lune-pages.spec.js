const assert = require('assert');
const { chromium } = require('playwright');

const BASE = process.env.LUNE_BASE_URL || 'http://127.0.0.1:3000';
const publicPages = ['/', '/work.html', '/inspo.html', '/favorites.html', '/standard.html'];

async function waitForLune(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 5000 }).catch(() => {});
}

async function assertSurface(page, path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await waitForLune(page);
  const state = await page.evaluate(() => {
    const transition = document.querySelector('.page-transition');
    const hero = document.querySelector('.hero-art');
    const width = document.documentElement.clientWidth;
    const overflowers = [...document.querySelectorAll('body *')].flatMap(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right <= width + 2 && rect.left >= -2) return [];
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.display === 'none') return [];
      return [{
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: typeof el.className === 'string' ? el.className.slice(0, 90) : '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        transform: style.transform
      }];
    }).slice(0, 12);
    return {
      width,
      scrollWidth: document.documentElement.scrollWidth,
      text: document.body.innerText,
      title: document.title,
      transitionLabel: transition ? getComputedStyle(transition, '::after').content : '',
      heroLabel: hero ? getComputedStyle(hero, '::before').content : '',
      overflowers
    };
  });
  assert(state.scrollWidth <= state.width + 2, `${label}: horizontal overflow ${state.scrollWidth}px > ${state.width}px; offenders=${JSON.stringify(state.overflowers)}`);
  assert(!/\bAURA\b|Denis|Embu/i.test(state.text), `${label}: legacy public branding is visible`);
  assert(/Lune/i.test(state.title), `${label}: document title does not identify Lune`);
  if (state.transitionLabel) assert(/LUNE/i.test(state.transitionLabel), `${label}: page transition still uses legacy branding`);
  if (state.heroLabel) assert(/LUNE/i.test(state.heroLabel), `${label}: hero label still uses legacy branding`);
  await page.locator('.site-header').first().waitFor({ state: 'visible' });
}

async function desktopJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  for (const path of publicPages) await assertSurface(page, path, `desktop ${path}`);

  await page.goto(`${BASE}/favorites.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#taste-recommendations .taste-card');
  assert((await page.locator('#taste-recommendations .taste-card').count()) >= 4, 'saved: zero state should still contain useful recommendations');

  await page.goto(`${BASE}/work.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gallery-grid .gallery-card');
  assert.strictEqual(await page.locator('#gallery-grid .gallery-card').count(), 14, 'work: expected 14 catalog cards');
  const desktopColumns = await page.locator('#gallery-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.strictEqual(desktopColumns, 3, 'desktop work gallery should use three columns');

  await page.waitForSelector('#gallery-grid .card-image-wrap > img[role="button"]');
  const image = page.locator('#gallery-grid .gallery-card').first().locator('.card-image-wrap > img');
  await image.focus();
  await page.keyboard.press('Enter');
  await page.locator('#work-lightbox[open]').waitFor({ state: 'visible' });
  await page.locator('#work-lightbox .v2-lightbox-close').click();

  await page.locator('[data-save-set="set_03"]').first().click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lune_saved_work') || '[]').includes('set_03'));
  await page.goto(`${BASE}/favorites.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-set-id="set_03"]');

  await page.goto(`${BASE}/work.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gallery-search');
  await page.locator('#gallery-search').fill('Chrome');
  await page.waitForFunction(() => {
    const link = document.querySelector('.nav-actions a[href*="inspo.html"]');
    return link && /focus=Chrome/i.test(link.getAttribute('href') || '');
  });
  const inspoHref = await page.locator('.nav-actions a[href*="inspo.html"]').getAttribute('href');
  assert(inspoHref && /focus=Chrome/i.test(inspoHref), 'work -> inspo should retain the current direction');

  await page.goto(`${BASE}/${inspoHref}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#inspo-scroll .inspo-card');
  const desktopInspoColumns = await page.locator('#inspo-scroll').evaluate(el => getComputedStyle(el).columnCount);
  assert.strictEqual(desktopInspoColumns, '3', 'desktop inspo edit should use three columns');
  await page.waitForSelector('.lune-context-note');
  assert(/Chrome/i.test(await page.locator('.lune-context-note').innerText()), 'inspo should explain the retained direction');

  await page.waitForSelector('#inspo-scroll .inspo-img-wrap > img[role="button"]');
  const inspoImage = page.locator('#inspo-scroll .inspo-card').first().locator('.inspo-img-wrap > img');
  await inspoImage.focus();
  await page.keyboard.press('Enter');
  await page.locator('#inspo-dialog[open]').waitFor({ state: 'visible' });
  const related = page.locator('#inspo-dialog [data-dialog-book]');
  await Promise.all([
    page.waitForURL(url => url.pathname.endsWith('/work.html') && url.searchParams.has('focus')),
    related.click()
  ]);
  assert(page.url().includes('focus='), 'inspo -> work should carry a usable direction');

  await context.close();
}

async function mobileSurfaces(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  for (const path of publicPages) await assertSurface(page, path, `mobile ${path}`);

  await page.goto(`${BASE}/work.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gallery-grid .gallery-card');
  const columns = await page.locator('#gallery-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.strictEqual(columns, 1, 'mobile work gallery should collapse to one column');

  await page.goto(`${BASE}/inspo.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#inspo-scroll .inspo-card');
  const columnCount = await page.locator('#inspo-scroll').evaluate(el => getComputedStyle(el).columnCount);
  assert.strictEqual(columnCount, '1', 'mobile inspo edit should collapse to one column');

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await desktopJourney(browser);
    await mobileSurfaces(browser);
    console.log('Lune page smoke checks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
