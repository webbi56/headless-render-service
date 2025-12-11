// headless-server.js – Render-Free-kompatible WebKit-Version
// Installiert WebKit im Runtime-Container, damit Render es nicht löscht.

const express = require('express');
const { execSync } = require('child_process');
const { webkit } = require('playwright');

const PORT = process.env.HEADLESS_PORT || 3000;
const app = express();

let browser;

// WebKit im Runtime installieren, falls Render es gelöscht hat
function ensureWebkitInstalled() {
  try {
    console.log('Checking WebKit installation...');
    execSync('ls /opt/render/.cache/ms-playwright', { stdio: 'ignore' });
  } catch {
    console.log('WebKit missing → Installing now...');
    execSync('npx playwright install webkit', { stdio: 'inherit' });
  }
}

async function getBrowser() {
  if (browser) return browser;

  // Sicherstellen, dass WebKit existiert
  ensureWebkitInstalled();

  browser = await webkit.launch({
    headless: true,
  });

  return browser;
}

async function tryHandleCookieBanner(page) {
  const texts = [
    'akzeptieren', 'zustimmen', 'einverstanden',
    'alle akzeptieren', 'accept', 'agree', 'allow all'
  ];

  for (const t of texts) {
    const btn = await page.$(`button:has-text("${t}")`);
    if (btn) {
      try {
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      } catch {}
    }
  }
}

app.get('/render', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'FakeShopFinder-Headless/1.0'
    });

    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await tryHandleCookieBanner(page);
    await page.waitForTimeout(1000);

    const html = await page.content();

    await context.close();
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } catch (err) {
    console.error('Headless render failed:', err);
    return res.status(500).json({
      error: 'Headless render failed',
      details: String(err)
    });
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down WebKit headless server...');
  if (browser) await browser.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`WebKit render server running on http://localhost:${PORT}`);
});
