// headless-server.js (WebKit-Version für Render Free) 
// Zuverlässiger Headless-Browser für FakeShopFinder ohne Browser-Pfad-Probleme.

const express = require('express');
const { webkit } = require('playwright');

const PORT = process.env.HEADLESS_PORT || 3000;
const app = express();

let browser;

// Browser dauerhaft offen halten (spart Ressourcen & Zeit)
async function getBrowser() {
  if (browser) return browser;
  browser = await webkit.launch({
    headless: true,
  });
  return browser;
}

// Cookie- / Consent-Banner automatisch versuchen zu schließen
async function tryHandleCookieBanner(page) {
  const texts = [
    'akzeptieren',
    'zustimmen',
    'einverstanden',
    'alle akzeptieren',
    'accept',
    'agree',
    'allow all'
  ];

  for (const t of texts) {
    const btn = await page.$(`button:has-text("${t}")`);
    if (btn) {
      try {
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      } catch (e) {
        // ignorieren und nächste Option versuchen
      }
    }
  }
}

// Haupt-Endpoint zum Rendern von Webseiten
app.get('/render', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'FakeShopFinder-Headless/1.0'
    });

    const page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

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

// Sauberes Herunterfahren
process.on('SIGINT', async () => {
  console.log('Shutting down WebKit headless server...');
  if (browser) await browser.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`WebKit render server running on http://localhost:${PORT}`);
});
