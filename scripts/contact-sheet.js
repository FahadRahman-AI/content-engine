// Tiles rendered carousels into one PNG per carousel: node scripts/contact-sheet.js out/samples/<key> [...]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  for (const dir of process.argv.slice(2)) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
    const imgs = await Promise.all(
      files.map(async (f) => `<img src="data:image/jpeg;base64,${(await readFile(path.join(dir, f))).toString('base64')}">`)
    );
    await page.setViewport({ width: 1640, height: 800 });
    await page.setContent(
      `<style>body{margin:0;background:#888}div{display:grid;grid-template-columns:repeat(4,400px);gap:10px;padding:10px}img{width:400px}</style><div>${imgs.join('')}</div>`
    );
    const out = path.join(dir, '..', `${path.basename(dir)}-sheet.png`);
    await (await page.$('div')).screenshot({ path: out });
    console.log(out);
  }
} finally {
  await browser.close();
}
