// Renders a carousel (array of slides) to 1080x1350 JPEGs with Puppeteer.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { mascot } from '../templates/mascot.js';
import { CTA_TEXT, SLIDE_TYPES } from './constants.js';

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));
const INK = '#141414';
const CREAM = '#F2F0EB';
const DARK_BG = '#141412';
const DARK_TYPES = new Set(['COVER_GRADIENT', 'STAT']);

// NO_SANDBOX=1 is set in the Docker image, where Chrome runs as root.
export const launchBrowser = () =>
  puppeteer.launch(process.env.NO_SANDBOX ? { args: ['--no-sandbox', '--disable-setuid-sandbox'] } : {});

const cache = new Map();
async function tpl(name) {
  if (!cache.has(name)) cache.set(name, await readFile(`${TEMPLATES}${name}`, 'utf8'));
  return cache.get(name);
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// *word* marks the one emphasised (serif italic) word. Only the first marker is
// honoured, and only its first word is emphasised.
export function headlineHtml(text = '') {
  let used = false;
  return escapeHtml(text).replace(/\*([^*]+)\*/g, (_, span) => {
    if (used) return span;
    used = true;
    const [first, ...rest] = span.split(' ');
    return `<em>${first}</em>${rest.length ? ' ' + rest.join(' ') : ''}`;
  });
}

// Minimal mustache: {{x}} escaped, {{{x}}} raw, {{#x}}...{{/x}} shown when x is truthy.
export function fill(template, data) {
  return template
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => (data[k] ? inner : ''))
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => data[k] ?? '')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => escapeHtml(data[k] ?? ''));
}

function itemsHtml(items = []) {
  return items
    .map((it, i) => `<li><span class="i">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(it)}</span></li>`)
    .join('');
}

// COMPARE rows are "before | after" strings.
function compareCols(items = []) {
  const rows = items.map((r) => r.split('|').map((s) => s.trim()));
  const cell = (t) => `<div class="cell">${escapeHtml(t ?? '')}</div>`;
  return { before: rows.map((r) => cell(r[0])).join(''), after: rows.map((r) => cell(r[1])).join('') };
}

export function slideData(slide, ctx) {
  const type = SLIDE_TYPES.includes(slide.type) ? slide.type : 'STEP';
  const dark = DARK_TYPES.has(type);
  const hasMascot = Boolean(slide.mascot) && type !== 'CTA';
  const mascotSvg = hasMascot
    ? mascot({
        pose: slide.mascot,
        size: type === 'COVER_MASCOT' ? 560 : 340,
        ink: dark ? CREAM : INK,
        bg: dark ? DARK_BG : CREAM,
      })
    : '';
  const cols = type === 'COMPARE' ? compareCols(slide.items) : {};
  return {
    type,
    theme: dark ? 'dark' : '',
    mascotClass: hasMascot ? ' has-mascot' : '',
    pillar: ctx.pillar,
    num: String(ctx.index + 1).padStart(2, '0'),
    arrow: ctx.last ? '' : '<div class="frame-arrow">→</div>',
    headline: headlineHtml(slide.headline),
    body: slide.body || '',
    kicker: slide.stat || ctx.pillar,
    pill: slide.stat || `${ctx.pillar} / SAVE THIS`,
    mascot: mascotSvg,
    step: String(ctx.stepIndex).padStart(2, '0'),
    numClass: hasMascot ? '' : ' accent', // the mascot is the one accent element
    emClass: hasMascot ? '' : ' em-accent',
    stat: slide.stat || '',
    items: itemsHtml(slide.items),
    // COMPARE column labels come from stat as "LEFT | RIGHT".
    beforeLabel: (type === 'COMPARE' && slide.stat?.split('|')[0]?.trim()) || 'BEFORE',
    afterLabel: (type === 'COMPARE' && slide.stat?.split('|')[1]?.trim()) || 'AFTER',
    before: cols.before,
    after: cols.after,
    cta: ctx.ctaType === 'launch' ? `${CTA_TEXT.launch} →` : CTA_TEXT.starter,
    handle: ctx.handle,
  };
}

export async function slideHtml(slide, ctx) {
  const data = slideData(slide, ctx);
  const [base, tokens, css, body] = await Promise.all([
    tpl('base.html'),
    tpl('tokens.css'),
    tpl('slide.css'),
    tpl(`${data.type}.html`),
  ]);
  return fill(base, { ...data, tokens, css, content: fill(body, data) });
}

// post: { pillar, slides, variant: { cta_type } }. Returns [{ html, jpeg: Buffer }].
export async function renderCarousel(post, { handle = process.env.IG_HANDLE || 'forwardthinkingco', browser } = {}) {
  const ownBrowser = !browser;
  browser ??= await launchBrowser();
  try {
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
