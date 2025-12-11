// headless-server.js – final WebKit-Version für Render Free
// Installiert WebKit im Runtime-Container und stellt die Routen / und /render bereit.

const express = require('express');
const { execSync } = require('child_process');
const { webkit } = require('playwright');

// Render stellt den Port über process.env.PORT bereit
const PORT = process.env.PORT || 3000;
const app = express();

let browser;

// Root-Route für Health-Checks und schnelle Prüfung im Browser
app.get('/', (req, res) => {
  res.send('Headless Render Service is running ✔️');
});

// Stellt sicher, dass WebKit im Laufzeit-Container installiert ist
function ensureWebkitInstalled() {
  try {
    console.log('Checking Playwright WebKit installation...');
    // Einfacher Check: gibt es irgendeinen ms-playwright-Ordner?
    execSync('ls /opt/render/.cache/ms-playwright', { stdio: 'ignore' });
    console.log('Playwright cache directory exists.');
  } catch (e) {
    console.log('Playwright WebKit seems missing – installing now...');
    try {
      execSync('npx playwright install webkit', { stdio: 'inherit' });
      console.log('Playwright WebKit install completed.');
    } catch (installErr) {
      console.error('Playwright WebKit install failed:', installErr);
    }
  }
}

// Browser einmal starten und wiederverwenden
async function getBrowser() {
  if (browser) return browser;

  // Sicherstellen, dass WebKit vorhanden ist
  ensureWebkitInstalled();

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
    'allow all',
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
      userAgent: 'FakeShopFinder-Headless/1.0',
    });

    const page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
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
      details: String(err),
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
  console.log(`Headless WebKit server running on port ${PORT}`);
});
