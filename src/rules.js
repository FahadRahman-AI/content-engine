// Deterministic checks that run before the critic. Cheap, exact, and not up to a model.
import { BANNED_WORDS, CTA_TEXT } from './constants.js';

function allText(post) {
  return [
    post.hook,
    post.caption,
    ...post.hashtags,
    ...post.slides.flatMap((s) => [s.headline, s.body, s.stat ?? '', ...s.items]),
  ].join('\n');
}

// plan: { pillar, cta_type, variant: {cover_type, hook_style, slide_count}, topicKeys[], searchUrls[], noteIds[] }
export function lintPost(post, plan) {
  const issues = [];
  const text = allText(post).toLowerCase();

  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w.replace('-', '[- ]?')}\\w*`, 'i').test(text)) issues.push(`banned word: "${w}"`);
  }
  if (post.pillar !== plan.pillar) issues.push(`pillar must be ${plan.pillar}, got ${post.pillar}`);
  if (post.variant.cta_type !== plan.cta_type) issues.push(`variant.cta_type must be "${plan.cta_type}"`);
  if (!post.caption.includes(CTA_TEXT[plan.cta_type])) {
    issues.push(`caption must contain the exact CTA "${CTA_TEXT[plan.cta_type]}"`);
  }
  const other = plan.cta_type === 'starter' ? CTA_TEXT.launch : CTA_TEXT.starter;
  if (post.caption.includes(other)) issues.push('caption contains the wrong CTA for this rotation slot');
  for (const k of ['cover_type', 'hook_style', 'slide_count']) {
    if (post.variant[k] !== plan.variant[k]) issues.push(`variant.${k} must be ${JSON.stringify(plan.variant[k])}`);
  }
  if (plan.topicKeys.includes(post.topic_key)) issues.push(`topic_key "${post.topic_key}" was already used`);

  if (post.source_url && !plan.searchUrls.includes(post.source_url)) {
    issues.push('source_url was not returned by web search; use an exact URL from the search results');
  }
  if (post.pillar === 'TOOL' && !post.source_url) issues.push('TOOL posts require source_url');
  if (post.pillar === 'TESTED' && !post.note_id) issues.push('TESTED posts require note_id');
  if (post.note_id && !plan.noteIds.includes(post.note_id)) issues.push(`note_id "${post.note_id}" is not an available note`);
  return issues;
}
