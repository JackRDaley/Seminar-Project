const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const deployment = require('../../vercel.json');

const buildRoot = path.resolve(__dirname, '../../website/dist');
const contentTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
};
let server;
let baseURL;

test.beforeAll(async () => {
  // Test the built site, not Vite's permissive development server. Reuse the
  // actual deployment headers so a font/CSP mismatch fails before publishing.
  await fs.access(path.join(buildRoot, 'index.html'));
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    for (const rule of deployment.headers) {
      if (rule.source === '/(.*)' ||
          (rule.source === '/fonts/(.*)' && pathname.startsWith('/fonts/'))) {
        for (const header of rule.headers) response.setHeader(header.key, header.value);
      }
    }
    // Vercel injects this endpoint in production; it is not part of the build.
    if (pathname === '/_vercel/speed-insights/script.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end('');
      return;
    }
    const file = path.resolve(buildRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(buildRoot + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

async function headlineGeometry(page) {
  return page.locator('.hero h1').evaluate(heading => {
    const style = getComputedStyle(heading);
    const box = heading.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(heading);
    const textBoxes = [...range.getClientRects()].filter(rect => rect.width > 0);
    return {
      lines: Math.round(box.height / parseFloat(style.lineHeight)),
      fits: textBoxes.every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const width of [320, 390, 768, 780, 781, 935, 1024, 1440, 1920, 2560]) {
  test(`intended fonts and three headline lines at ${width}px under production CSP`, async ({ page }) => {
    const errors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).origin !== baseURL) externalRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(baseURL);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveTitle('Saturn - Block Distracting Websites in Chrome');
    await expect(page.locator('.hero h1')).toHaveText('Keep theinternet inits place.');
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    const loadedFamilies = await page.evaluate(() => [...document.fonts]
      .filter(font => font.status === 'loaded').map(font => font.family.replaceAll('"', '')));
    expect(loadedFamilies).toEqual(expect.arrayContaining(['Playfair Display', 'DM Sans', 'DM Mono']));
    expect(await headlineGeometry(page)).toEqual({ lines: 3, fits: true, overflow: 0 });
    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('headline layout stays stable as delayed fonts arrive', async ({ page }) => {
  let releaseFonts;
  const ready = new Promise(resolve => { releaseFonts = resolve; });
  await page.route('**/fonts/*.woff2', async route => {
    await ready;
    await route.continue();
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero h1')).toBeAttached();
    const before = await page.locator('.hero h1').boundingBox();
    expect(await headlineGeometry(page)).toEqual({ lines: 3, fits: true, overflow: 0 });
    releaseFonts();
    await page.evaluate(() => document.fonts.ready);
    const after = await page.locator('.hero h1').boundingBox();
    expect(after.height).toBeCloseTo(before.height, 0);
    expect(await headlineGeometry(page)).toEqual({ lines: 3, fits: true, overflow: 0 });
  } finally {
    releaseFonts();
  }
});

test('headline remains readable if fonts fail', async ({ page }) => {
  await page.route('**/fonts/*.woff2', route => route.abort());
  for (const width of [320, 390, 781, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(baseURL);
    await page.evaluate(() => document.fonts.ready);
    expect(await headlineGeometry(page)).toEqual({ lines: 3, fits: true, overflow: 0 });
    await expect(page.locator('.hero .store-button')).toBeVisible();
  }
});

test('navigation and FAQ still work with the intended fonts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseURL);
  await page.locator('.site-header').getByRole('link', { name: 'Features', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/#features`);
  await expect(page.locator('#features h2')).toBeVisible();
  await page.locator('.site-header').getByRole('link', { name: 'FAQ', exact: true }).click();
  await page.locator('.faq-list summary').first().click();
  await expect(page.locator('.faq-list details').first()).toHaveAttribute('open', '');
  await expect(page.locator('.faq-list details').first().locator('p')).toBeVisible();
  const fontResponse = await page.request.get(`${baseURL}/fonts/playfair-display-latin-v40.woff2`);
  expect(fontResponse.headers()['access-control-allow-origin']).toBe('*');
});

for (const name of ['privacy', 'changelog']) {
  test(`${name} uses the same local fonts under production CSP`, async ({ page }) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${baseURL}/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toBeVisible();
    const families = await page.evaluate(() => [...document.fonts]
      .filter(font => font.status === 'loaded').map(font => font.family.replaceAll('"', '')));
    expect(families).toEqual(expect.arrayContaining(['Playfair Display', 'DM Sans', 'DM Mono']));
    expect(errors).toEqual([]);
  });
}
