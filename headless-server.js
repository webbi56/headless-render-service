// headless-server.js – final WebKit-Version für Render Free
// Wichtig: MUSS auf process.env.PORT hören!

const express = require('express');
const { execSync } = require('child_process');
const { webkit } = require('playwright');

// Render gibt IMMER einen Port vor → kein Fallback verwenden!
const PORT = process.env.PORT;
if (!PORT) throw new Error("Render: PORT environment variable missing!");

const app = express();
let browser;

// Root Check-Route
app.get('/', (req, res) => {
  res.send('Headless Render Service is running ✔️');
});

// Installiert WebKit im Container, falls nötig
function ensureWebkitInstalled() {
  try {
    execSync('ls /opt/render/.cache/ms-playwright', { stdio: 'ignore' });
    console.log('Playwright cache directory exists.');
  } catch (e) {
    console.log('Installing Playwright WebKit...');
    execSync('npx playwright install webkit', { stdio: 'inherit' });
  }
}

async function getBrowser() {
  if (browser) return browser;

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

    await page.goto(targetUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await tryHandleCookieBanner(page);
    const html = await page.content();
    await context.close();

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);

  } catch (err) {
    console.error('Headless render failed:', err);
    res.status(500).json({
      error: 'Headless render failed',
      details: String(err),
    });
  }
});

// Shutdown
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Headless WebKit server running on port ${PORT}`);
});
