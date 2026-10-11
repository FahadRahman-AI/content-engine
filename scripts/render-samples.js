// Validates seed.json against the brief's limits and renders each seed to out/samples/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { renderCarousel } from '../src/render.js';
import { BANNED_WORDS } from '../src/constants.js';

const words = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;
const seeds = JSON.parse(await readFile(new URL('../seed.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);

const problems = [];
for (const p of seeds) {
  const at = (m) => problems.push(`${p.topic_key}: ${m}`);
  if (words(p.hook) > 12) at(`hook ${words(p.hook)} words`);
  if (p.slides.length < 6 || p.slides.length > 8) at(`${p.slides.length} slides`);
  if (!p.slides[0].type.startsWith('COVER')) at('first slide not a cover');
  if (p.slides.at(-1).type !== 'CTA') at('last slide not CTA');
  if (p.slides.filter((s) => s.mascot).length > 2) at('more than 2 mascot slides');
  p.slides.forEach((s, i) => words(s.body) > 28 && at(`slide ${i + 1} body ${words(s.body)} words`));
  if (words(p.caption) > 150) at(`caption ${words(p.caption)} words`);
  if (p.hashtags.length > 8) at('too many hashtags');
  const text = JSON.stringify(p).toLowerCase();
  BANNED_WORDS.forEach((w) => new RegExp(`\\b${w}\\b`).test(text) && at(`banned word "${w}"`));
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const browser = await puppeteer.launch();
try {
  for (const p of seeds.filter((s) => !only.length || only.includes(s.topic_key))) {
    const dir = new URL(`../out/samples/${p.topic_key}/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    const slides = await renderCarousel(p, { browser });
    await Promise.all(slides.map((s, i) => writeFile(new URL(`${String(i + 1).padStart(2, '0')}.jpg`, dir), s.jpeg)));
    console.log(`${p.topic_key}: ${slides.length} slides`);
  }
} finally {
  await browser.close();
}
