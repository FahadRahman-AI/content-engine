import { z } from 'zod';
import { COVER_TYPES, DENSE_TYPES, PILLARS, SLIDE_TYPES } from './constants.js';
import { wordCount } from './util.js';

export const POSES = ['flex', 'smug', 'shades', 'sweat', 'faceplant', 'victory'];
export const MASCOT_TYPES = ['COVER_MASCOT', 'STEP', 'LIST', 'STAT', 'COMPARE', 'TOOLS', 'MATRIX']; // mascot never on CTA, QUOTE or other covers
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

// An item is a bullet string, or a card {title, text, logo?, tag?, cells?}.
const ItemObject = z.object({
  title: z.string().min(1).max(60),
  text: z.string().nullish().transform((v) => v ?? ''),
  logo: z.string().regex(DOMAIN, 'logo must be a bare domain like claude.ai').nullish().transform((v) => v?.toLowerCase() ?? null),
  tag: z.string().max(20).nullish().transform((v) => v ?? null),
  cells: z.array(z.string().max(60)).nullish().transform((v) => v ?? null),
});
const Item = z.union([z.string().min(1), ItemObject]);

export const itemText = (it) => (typeof it === 'string' ? it : [it.title, it.text, it.tag, ...(it.cells ?? [])].filter(Boolean).join(' '));
export const slideWords = (s) => wordCount([s.body, ...s.items.map(itemText)].join(' '));

const Slide = z
  .object({
    // An unknown slide type falls back to STEP.
    type: z.string().transform((t) => (SLIDE_TYPES.includes(t) ? t : 'STEP')),
    headline: z.string().min(1).max(110),
    body: z.string().nullish().transform((v) => v ?? ''),
    items: z.array(Item).nullish().transform((v) => v ?? []),
    columns: z.array(z.string().max(24)).nullish().transform((v) => v ?? []),
    stat: z.string().nullish().transform((v) => v ?? null),
    mascot: z.enum(POSES).nullish().transform((v) => v ?? null),
    mascot_say: z.string().max(70).nullish().transform((v) => v ?? null),
  })
  .superRefine((s, ctx) => {
    const bad = (message) => ctx.addIssue({ code: 'custom', message });
    const lede = wordCount(s.body);
    if (lede > 32) bad(`body is ${lede} words (max 32)`);
    s.items.forEach((it, i) => {
      const w = wordCount(typeof it === 'string' ? it : it.text);
      if (w > 26) bad(`item ${i + 1} text is ${w} words (max 26)`);
    });
    if (s.items.length > 6) bad('max 6 items per slide');
    if (DENSE_TYPES.includes(s.type)) {
      if (s.items.length < 3) bad(`${s.type} needs at least 3 items (a one-line slide is not enough value)`);
      if (slideWords(s) < 35) bad(`${s.type} has only ${slideWords(s)} words of substance (min 35)`);
    }
    if (s.type === 'STAT') {
      if (!s.stat) bad('STAT needs stat');
      if (s.items.length < 2) bad('STAT needs at least 2 supporting items');
    }
    if (s.type === 'COMPARE' && s.items.some((i) => typeof i !== 'string' || !i.includes('|'))) bad('COMPARE items must be strings "before | after"');
    if (s.type === 'TOOLS' && s.items.some((i) => typeof i === 'string' || !i.logo)) bad('TOOLS items must be cards with a title, text and a logo domain');
    if (s.type === 'MATRIX') {
      if (s.columns.length < 2 || s.columns.length > 4) bad('MATRIX needs 2-4 columns');
      s.items.forEach((i, n) => {
        if (typeof i === 'string' || !i.logo || (i.cells?.length ?? 0) !== s.columns.length) bad(`MATRIX row ${n + 1} needs a logo and ${s.columns.length} cells`);
      });
    }
    if (s.mascot && !MASCOT_TYPES.includes(s.type)) bad(`mascot not supported on ${s.type}`);
    if (s.mascot_say && !s.mascot) bad('mascot_say needs a mascot pose');
    if (s.type === 'COVER_MASCOT' && !s.mascot) bad('COVER_MASCOT needs a mascot pose');
  });

const Variant = z.object({
  cover_type: z.enum(COVER_TYPES),
  hook_style: z.string().min(1),
  slide_count: z.number().int(),
  cta_type: z.enum(['starter', 'launch']),
  mascot_used: z.boolean(),
});

export const PostSchema = z
  .object({
    pillar: z.enum(PILLARS),
    topic_key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'topic_key must be a kebab-case slug').max(80),
    hook: z.string().min(1),
    slides: z.array(Slide).min(8).max(10),
    caption: z.string().min(1),
    hashtags: z.array(z.string()).max(8),
    source_url: z.string().url().nullish().transform((v) => v ?? null),
    extra_sources: z.array(z.string().url()).max(4).nullish().transform((v) => v ?? []),
    note_id: z.string().nullish().transform((v) => v ?? null),
    variant: Variant,
  })
  .superRefine((p, ctx) => {
    const bad = (message) => ctx.addIssue({ code: 'custom', message });
    const hookWords = wordCount(p.hook);
    if (hookWords < 3 || hookWords > 8) bad(`hook is ${hookWords} words (must be 3-8, readable in 3 seconds)`);
    if (wordCount(p.caption) > 150) bad(`caption is ${wordCount(p.caption)} words (max 150)`);
    if (!p.slides[0].type.startsWith('COVER')) bad('first slide must be a COVER type');
    if (p.slides.at(-1).type !== 'CTA') bad('last slide must be CTA');
    p.slides.slice(1).forEach((s, i) => s.type.startsWith('COVER') && bad(`slide ${i + 2} is a cover type`));
    p.slides.slice(0, -1).forEach((s, i) => s.type === 'CTA' && bad(`slide ${i + 1} is CTA but is not last`));
    const mascots = p.slides.filter((s) => s.mascot).length;
    if (mascots < 2 || mascots > 4) bad(`${mascots} mascot slides (need 2-4, never on the CTA)`);
    if (p.variant.slide_count !== p.slides.length) bad('variant.slide_count does not match slides');
    if (p.variant.cover_type !== p.slides[0].type) bad('variant.cover_type does not match first slide');
    if (p.variant.mascot_used !== mascots > 0) bad('variant.mascot_used does not match slides');
    const logos = p.slides.flatMap((s) => s.items).filter((i) => typeof i !== 'string' && i.logo).length;
    if (p.pillar === 'TOOL' && logos === 0) bad('TOOL posts must show the logo of every tool they name (use a TOOLS or MATRIX slide)');
  });

export const CriticSchema = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
});

export function formatZodError(err) {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
