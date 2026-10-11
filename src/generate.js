import { mkdir, writeFile } from 'node:fs/promises';
import { ask, webSearchTool } from './claude.js';
import { reviewPost } from './critic.js';
import { getMedia } from './storage.js';
import { getMode, getPost, insertPost, loadContext, loadExamples, markIdeasUsed, markNoteUsed, postForDate } from './data.js';
import { failureEmail, reviewEmail, send } from './mail.js';
import { loadBrand, systemPrompt, userPrompt } from './prompt.js';
import { launchBrowser, renderCarousel } from './render.js';
import { chooseVariant, pickCta, pickPillar } from './rotation.js';
import { lintPost } from './rules.js';
import { PostSchema, formatZodError } from './schema.js';
import { saveJpegs } from './storage.js';
import { extractJson, londonDate } from './util.js';

const SEARCH_PILLARS = ['TOOL', 'SAVEABLE'];
const NO_NOTES_DAYS = 7;

export function buildPlan(ctx, { date, rng = Math.random, now = new Date() }) {
  const live = ctx.posts.filter((p) => p.status !== 'failed');
  const noNotesMode =
    ctx.unusedNotes.length === 0 && (!ctx.lastNoteAt || now - new Date(ctx.lastNoteAt) > NO_NOTES_DAYS * 86400000);
  const { pillar, fellBack, generalHabits } = pickPillar({
    recentPillars: live.map((p) => p.pillar),
    unusedNoteCount: ctx.unusedNotes.length,
    noNotesMode,
  });
  const { variant, experiment } = chooseVariant({ recentVariants: live.map((p) => p.variant ?? {}), rng });
  const cta_type = pickCta(ctx.postCount);
  return { date, pillar, fellBack, generalHabits, noNotesMode, cta_type, variant: { ...variant }, experiment };
}

// Up to 3 attempts (initial + 2 retries) to get a schema-valid, rule-clean draft.
export async function draftPost({ plan, ctx, examples, brand, feedback }) {
  let fb = feedback;
  let lastValid = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text, searchUrls } = await ask({
        system: systemPrompt(brand),
        user: userPrompt({ plan, ctx, examples, feedback: fb }),
        tools: SEARCH_PILLARS.includes(plan.pillar) ? [webSearchTool()] : undefined,
        maxTokens: 16000,
      });
      const parsed = PostSchema.safeParse(extractJson(text, 'post'));
      if (!parsed.success) throw new Error(`Schema errors:\n${formatZodError(parsed.error)}`);
      lastValid = parsed.data;
      const issues = lintPost(parsed.data, {
        ...plan,
        topicKeys: ctx.posts.filter((p) => p.status !== 'failed').map((p) => p.topic_key),
        searchUrls,
        noteIds: ctx.unusedNotes.map((n) => n.id),
      });
      if (issues.length) throw new Error(`Rule violations:\n${issues.map((i) => `- ${i}`).join('\n')}`);
      return { post: parsed.data };
    } catch (e) {
      fb = `${feedback ? `${feedback}\n\n` : ''}${e.message}`;
    }
  }
  return { post: null, draft: lastValid, error: fb };
}

export async function runGenerate({ dry = false, date = londonDate(1), rng = Math.random, log = console.log } = {}) {
  if (!dry) {
    const existing = await postForDate(date);
    if (existing) {
      log(`Post for ${date} already exists (${existing.status}); nothing to do.`);
      return { skipped: 'exists' };
    }
  }
  const ctx = await loadContext();
  const plan = buildPlan(ctx, { date, rng });
  const [brand, approved, rejected, winners] = [await loadBrand(), await loadExamples(plan.pillar), ctx.rejected, ctx.winners];
  const examples = { approved, rejected, winners };
  log(`Plan ${date}: ${plan.pillar}${plan.fellBack ? ' (fallback)' : ''}, cover ${plan.variant.cover_type}, ${plan.variant.slide_count} slides, hook ${plan.variant.hook_style}, CTA ${plan.cta_type}${plan.experiment ? `, experiment on ${plan.experiment}` : ''}${plan.noNotesMode ? ', no-notes mode' : ''}`);

  let feedback = null;
  let final = null;
  let lastDraft = null;
  let issues = [];
  for (let round = 0; round < 2 && !final; round++) {
    const out = await draftPost({ plan, ctx, examples, brand, feedback });
    lastDraft = out.post ?? out.draft ?? lastDraft;
    if (!out.post) {
      issues = out.error.split('\n').filter(Boolean);
      feedback = out.error;
      log(`Round ${round + 1}: draft invalid`);
      continue;
    }
    const note = ctx.unusedNotes.find((n) => n.id === out.post.note_id) ?? null;
    const review = await reviewPost({ post: out.post, plan, brand, note });
    log(`Round ${round + 1}: critic ${review.pass ? 'PASS' : `FAIL (${review.issues.length} issues)`}`);
    if (review.pass) final = out.post;
    else {
      issues = review.issues;
      feedback = `A reviewer rejected the previous draft:\n${review.issues.map((i) => `- ${i}`).join('\n')}\n\nPREVIOUS DRAFT:\n${JSON.stringify(out.post)}`;
      lastDraft = out.post;
    }
  }

  if (!final) return failDay({ plan, issues, draft: lastDraft, dry, log });

  const browser = await launchBrowser();
  let slides;
  try {
    slides = await renderCarousel(final, { browser });
  } finally {
    await browser.close();
  }
  const jpegs = slides.map((s) => s.jpeg);
  const variant = { ...final.variant, ...(plan.experiment ? { experiment: plan.experiment } : {}) };
  const caption = `${final.caption}\n\n${final.hashtags.join(' ')}`.trim();

  if (dry) {
    const dir = new URL(`../out/dry/${date}/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    await Promise.all(jpegs.map((b, i) => writeFile(new URL(`${String(i + 1).padStart(2, '0')}.jpg`, dir), b)));
    await writeFile(new URL('post.json', dir), JSON.stringify({ plan, post: final, caption }, null, 2));
    const mail = reviewEmail({ post: { ...final, variant }, plan, jpegs });
    await writeFile(new URL('email.html', dir), mail.html.replace(/cid:slide(\d+)/g, (_, n) => `${String(n).padStart(2, '0')}.jpg`));
    log(`DRY RUN: nothing saved, uploaded, emailed or posted. Output in out/dry/${date}/`);
    return { dry: true, post: final, dir: dir.pathname };
  }

  const urls = await saveJpegs(jpegs);
  const row = await insertPost({
    date,
    pillar: final.pillar,
    topic_key: final.topic_key,
    hook: final.hook,
    content: final,
    image_urls: urls,
    caption,
    status: 'draft',
    source_url: final.source_url,
    variant,
  });
  if (final.note_id) await markNoteUsed(final.note_id);
  await markIdeasUsed(ctx.ideas.map((i) => i.id));
  const mode = await getMode();
  log(`Saved draft ${row.id} (mode: ${mode}).`);
  await send(reviewEmail({ post: { ...final, id: row.id, variant }, plan, jpegs }));
  log('Review email sent.');
  return { post: row };
}

async function failDay({ plan, issues, draft, dry, log }) {
  log(`Day ${plan.date} FAILED: ${issues.slice(0, 5).join(' | ')}`);
  if (dry) return { dry: true, failed: true, issues };
  if (draft) {
    try {
      await insertPost({
        date: plan.date,
        pillar: draft.pillar ?? plan.pillar,
        topic_key: `failed-${plan.date}-${draft.topic_key}`.slice(0, 120),
        hook: draft.hook,
        content: { ...draft, review_issues: issues },
        status: 'failed',
        caption: draft.caption,
        source_url: draft.source_url ?? null,
        variant: plan.variant,
      });
    } catch (e) {
      log(`Could not record failed day: ${e.message}`);
    }
  }
  await send(failureEmail({ plan, issues, draft }));
  return { failed: true, issues };
}

// Re-sends the review email for an existing draft (images come back out of the media table).
export async function resendReview(id) {
  const row = await getPost(id);
  if (!row) throw new Error(`No post ${id}`);
  const jpegs = [];
  for (const url of row.image_urls) {
    const m = /\/m\/([0-9a-f-]{36})\.jpg$/i.exec(url);
    const media = m && (await getMedia(m[1]));
    if (!media) throw new Error(`Image missing for ${url} (pruned or never saved)`);
    jpegs.push(media.data);
  }
  await send(reviewEmail({ post: { ...row.content, id: row.id, variant: row.variant }, plan: { date: row.date, experiment: row.variant?.experiment }, jpegs }));
}
