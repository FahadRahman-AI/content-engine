import { z } from 'zod';
import { COVER_TYPES, PILLARS, SLIDE_TYPES } from './constants.js';
import { wordCount } from './util.js';

export const POSES = ['flex', 'smug', 'shades', 'sweat', 'faceplant', 'victory'];
export const MASCOT_TYPES = ['COVER_MASCOT', 'STEP', 'LIST']; // templates with a mascot slot

const Slide = z
  .object({
    // An unknown slide type falls back to STEP.
    type: z.string().transform((t) => (SLIDE_TYPES.includes(t) ? t : 'STEP')),
    headline: z.string().min(1).max(120),
    body: z.string().nullish().transform((v) => v ?? ''),
    items: z.array(z.string()).nullish().transform((v) => v ?? []),
    stat: z.string().nullish().transform((v) => v ?? null),
    mascot: z.enum(POSES).nullish().transform((v) => v ?? null),
  })
  .superRefine((s, ctx) => {
    const bad = (message) => ctx.addIssue({ code: 'custom', message });
    if (wordCount(s.body) > 28) bad(`body is ${wordCount(s.body)} words (max 28)`);
    if (s.type === 'LIST' && (s.items.length < 3 || s.items.length > 5)) bad('LIST needs 3-5 items');
    if (s.type === 'COMPARE' && (s.items.length < 2 || s.items.some((i) => !i.includes('|')))) {
      bad('COMPARE needs 2+ items formatted "before | after"');
    }
    if (s.type === 'STAT' && !s.stat) bad('STAT needs stat');
    if (s.mascot && !MASCOT_TYPES.includes(s.type)) bad(`mascot not supported on ${s.type}`);
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
    slides: z.array(Slide).min(6).max(8),
    caption: z.string().min(1),
    hashtags: z.array(z.string()).max(8),
    source_url: z.string().url().nullish().transform((v) => v ?? null),
    note_id: z.string().nullish().transform((v) => v ?? null),
    variant: Variant,
  })
  .superRefine((p, ctx) => {
    const bad = (message) => ctx.addIssue({ code: 'custom', message });
    if (wordCount(p.hook) > 12) bad(`hook is ${wordCount(p.hook)} words (max 12)`);
    if (wordCount(p.caption) > 150) bad(`caption is ${wordCount(p.caption)} words (max 150)`);
    if (!p.slides[0].type.startsWith('COVER')) bad('first slide must be a COVER type');
    if (p.slides.at(-1).type !== 'CTA') bad('last slide must be CTA');
    p.slides.slice(1).forEach((s, i) => s.type.startsWith('COVER') && bad(`slide ${i + 2} is a cover type`));
    p.slides.slice(0, -1).forEach((s, i) => s.type === 'CTA' && bad(`slide ${i + 1} is CTA but is not last`));
    const mascots = p.slides.filter((s) => s.mascot).length;
    if (mascots > 2) bad(`${mascots} mascot slides (max 2)`);
    if (p.variant.slide_count !== p.slides.length) bad('variant.slide_count does not match slides');
    if (p.variant.cover_type !== p.slides[0].type) bad('variant.cover_type does not match first slide');
    if (p.variant.mascot_used !== mascots > 0) bad('variant.mascot_used does not match slides');
  });

export const CriticSchema = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
});

export function formatZodError(err) {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
