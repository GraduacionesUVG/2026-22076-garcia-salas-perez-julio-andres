// Conexión con Bruno abierto con --remote-debugging-port=9333.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../src/package.json'));
const { chromium } = require('playwright');
export async function connect() {
  const browser = await chromium.connectOverCDP(process.env.BRUNO_CDP || 'http://127.0.0.1:9333');
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('index.html'));
  const cdp = await page.context().newCDPSession(page);
  const bcdp = await browser.newBrowserCDPSession(); return { browser, page, cdp, bcdp };
}
