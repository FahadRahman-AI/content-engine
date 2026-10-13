// Validates seed.json with the real schema and rules, then renders each seed to out/samples/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser, renderCarousel } from '../src/render.js';
import { PostSchema, formatZodError } from '../src/schema.js';
import { lintPost } from '../src/rules.js';

const seeds = JSON.parse(await readFile(new URL('../seed.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
let failed = false;
const parsed = [];
for (const s of seeds) {
  const r = PostSchema.safeParse(s);
  if (!r.success) {
    failed = true;
    console.error(`${s.topic_key}:\n${formatZodError(r.error)}`);
    continue;
  }
  const issues = lintPost(r.data, { pillar: r.data.pillar, cta_type: 'starter', variant: r.data.variant, topicKeys: [], searchUrls: [], noteIds: [] }).filter((i) => !/banned|CTA|variant|pillar/.test(i) || /banned/.test(i));
  if (issues.length) {
    failed = true;
    console.error(`${s.topic_key}: ${issues.join('; ')}`);
  }
  parsed.push(r.data);
}
if (failed) process.exit(1);

const browser = await launchBrowser();
try {
  for (const p of parsed.filter((x) => !only.length || only.includes(x.topic_key))) {
    const dir = new URL(`../out/samples/${p.topic_key}/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    const slides = await renderCarousel(p, { browser });
    await Promise.all(slides.map((s, i) => writeFile(new URL(`${String(i + 1).padStart(2, '0')}.jpg`, dir), s.jpeg)));
    console.log(`${p.topic_key}: ${slides.length} slides`);
  }
} finally {
  await browser.close();
}
