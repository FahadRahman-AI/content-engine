// Renders a carousel (array of slides) to 1080x1350 JPEGs with Puppeteer.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { BUILDERS, DARK_TYPES, esc, headlineHtml } from '../templates/slides.js';
import { CTA_TEXT, SLIDE_TYPES } from './constants.js';
import { resolveLogos } from './logos.js';

export { esc as escapeHtml, headlineHtml };

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));

// NO_SANDBOX=1 is set in the Docker image, where Chrome runs as root.
export const launchBrowser = () =>
  puppeteer.launch(process.env.NO_SANDBOX ? { args: ['--no-sandbox', '--disable-setuid-sandbox'] } : {});

const cache = new Map();
async function file(name) {
  if (!cache.has(name)) cache.set(name, await readFile(`${TEMPLATES}${name}`, 'utf8'));
  return cache.get(name);
}

// ctx: { index, stepIndex, last, pillar, ctaType, handle, logos }
export async function slideHtml(slide, ctx) {
  const type = SLIDE_TYPES.includes(slide.type) ? slide.type : 'STEP';
  const s = { ...slide, type, items: slide.items ?? [], columns: slide.columns ?? [] };
  const full = { ...ctx, cta: ctx.ctaType === 'launch' ? `${CTA_TEXT.launch} →` : CTA_TEXT.starter, logos: ctx.logos ?? {} };
  const content = BUILDERS[type](s, full);
  const [base, tokens, css] = await Promise.all([file('base.html'), file('tokens.css'), file('slide.css')]);
  const dark = DARK_TYPES.has(type);
  return base
    .replace('{{{tokens}}}', () => tokens)
    .replace('{{{css}}}', () => css)
    .replace('{{theme}}', dark ? 'dark' : '')
    .replace('{{type}}', type)
    .replace('{{{content}}}', () => content)
    .replace('{{pillar}}', esc(ctx.pillar))
    .replace('{{num}}', String(ctx.index + 1).padStart(2, '0'))
    .replace('{{{arrow}}}', ctx.last ? '' : '<div class="frame-arrow">→</div>')
    .replace('{{{mascotClass}}}', s.mascot ? ' has-mascot' : '');
}

// post: { pillar, slides, variant: { cta_type } }. Returns [{ html, jpeg: Buffer }].
export async function renderCarousel(post, { handle = process.env.IG_HANDLE || 'forwardthinkingco', browser, logos } = {}) {
  const ownBrowser = !browser;
  browser ??= await launchBrowser();
  try {
    const logoMap = logos ?? (await resolveLogos(post.slides));
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    const out = [];
    let stepIndex = 0;
    for (const [index, slide] of post.slides.entries()) {
      if (slide.type === 'STEP' || !SLIDE_TYPES.includes(slide.type)) stepIndex++;
      const html = await slideHtml(slide, {
        index,
        stepIndex,
        last: index === post.slides.length - 1,
        pillar: post.pillar,
        ctaType: post.variant?.cta_type,
        handle,
        logos: logoMap,
      });
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__fitted === true, { timeout: 15000 });
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
      out.push({ html, jpeg: Buffer.from(jpeg) });
    }
    return out;
  } finally {
    if (ownBrowser) await browser.close();
  }
}
