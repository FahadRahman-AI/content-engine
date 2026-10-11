// Renders every mascot pose to mascot-sheet.png for approval.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { mascot, POSES } from '../templates/mascot.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tokens = await readFile(`${root}templates/tokens.css`, 'utf8');

const cells = POSES.map(
  (pose, i) => `
  <div class="cell">
    <div class="mono label">${String(i + 1).padStart(2, '0')} / ${pose}</div>
    ${mascot({ pose, size: 270 })}
  </div>`
).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${tokens}
.sheet { width: 1080px; padding: 56px; background: var(--bg); }
.top { display: flex; justify-content: space-between; margin-bottom: 40px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); row-gap: 48px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.label { align-self: flex-start; color: var(--muted); }
</style></head><body>
<div class="sheet">
  <div class="top mono"><span>FORWARD THINKING CO / MASCOT</span><span>POSE SHEET</span></div>
  <div class="grid">${cells}</div>
</div></body></html>`;

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 800, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const el = await page.$('.sheet');
  await el.screenshot({ path: `${root}mascot-sheet.png` });
  console.log('wrote mascot-sheet.png');
} finally {
  await browser.close();
}
