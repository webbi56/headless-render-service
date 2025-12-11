// headless-server.js
// Einfacher Headless-Browser-Service für FakeShopFinder
// Start: node headless-server.js
// Endpoint: http://localhost:3000/render?url=https%3A%2F%2Fexample.com

const express = require('express');
const { firefox } = require('playwright');

const PORT = process.env.HEADLESS_PORT || 3000;
const app = express();

let browser;

// Hilfsfunktion: Browser einmal starten und wiederverwenden
async function getBrowser() {
  if (browser) return browser;
  browser = await firefox.launch({
    headless: true,
  });
  return browser;
}

// Versucht, typische Cookie-/Consent-Banner automatisch zu akzeptieren
async function tryHandleCookieBanner(page) {
  const buttonTexts = [
    'akzeptieren',
    'zustimmen',
    'einverstanden',
    'alle akzeptieren',
    'accept',
    'agree',
    'allow all',
  ];

  for (const text of buttonTexts) {
    const button = await page.$(`button:has-text("${text}")`);
    if (button) {
      try {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(1500);
        break;
      } catch (e) {
        // Ignorieren, wir versuchen einfach den nächsten Text
      }
    }
  }
}

app.get('/render', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'FakeShopFinder-Headless/1.0',
    });
    const page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Optional: Cookie-Banner versuchen zu schließen/akzeptieren
    await tryHandleCookieBanner(page);

    // Noch einmal kurz warten, damit dynamische Inhalte nachladen können
    await page.waitForTimeout(1500);

    const html = await page.content();

    await context.close();

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Headless render failed:', err);
    return res
      .status(500)
      .json({ error: 'Headless render failed', details: String(err) });
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down headless server...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Headless render server listening on http://localhost:${PORT}`);
});
