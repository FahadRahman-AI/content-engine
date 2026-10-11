import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PostSchema } from '../src/schema.js';
import { lintPost } from '../src/rules.js';
import { chooseVariant, pickCta, pickPillar } from '../src/rotation.js';
import { extractJson, londonDate } from '../src/util.js';
import { headlineHtml, slideData } from '../src/render.js';
import { signedUrl, verify } from '../src/sign.js';
import { buildPlan } from '../src/generate.js';
import { htmlToText } from '../src/sources.js';

const seeds = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));
const clone = (o) => structuredClone(o);

test('every seed post passes the schema', () => {
  for (const s of seeds) {
    const r = PostSchema.safeParse(s);
    assert.ok(r.success, `${s.topic_key}: ${r.error?.issues.map((i) => i.message)}`);
  }
});

test('schema: unknown slide type falls back to STEP', () => {
  const p = clone(seeds[0]);
  p.slides[2].type = 'WHATEVER';
  assert.equal(PostSchema.parse(p).slides[2].type, 'STEP');
});

test('schema rejects structural violations', () => {
  const bad = (mut, re) => {
    const p = clone(seeds[1]);
    mut(p);
    const r = PostSchema.safeParse(p);
    assert.ok(!r.success && r.error.issues.some((i) => re.test(i.message)), `expected ${re}`);
  };
  bad((p) => (p.slides.at(-1).type = 'STEP'), /last slide/);
  bad((p) => (p.slides[0].type = 'STEP'), /first slide/);
  bad((p) => (p.hook = 'one two three four five six seven eight nine ten eleven twelve thirteen'), /hook/);
  bad((p) => (p.slides[1].body = Array(30).fill('w').join(' ')), /28/);
  bad((p) => (p.variant.slide_count = 8), /slide_count/);
  bad((p) => (p.slides[1].mascot = 'smug'), /mascot_used/);
  bad((p) => p.slides.pop(), /(?:too_small|>=6|slide)/i);
});

test('lint catches banned words, wrong CTA, unseen source', () => {
  const p = PostSchema.parse(seeds[1]);
  const plan = { pillar: 'SAVEABLE', cta_type: 'starter', variant: { cover_type: p.variant.cover_type, hook_style: p.variant.hook_style, slide_count: p.variant.slide_count }, topicKeys: [], searchUrls: [], noteIds: [] };
  assert.deepEqual(lintPost(p, plan), []);
  const dirty = clone(p);
  dirty.caption += ' Unlock your potential. This is a game-changer.';
  const issues = lintPost(dirty, plan).join('|');
  assert.match(issues, /unlock/);
  assert.match(issues, /game-changer/);
  assert.match(lintPost(p, { ...plan, cta_type: 'launch' }).join('|'), /CTA/);
  assert.match(lintPost({ ...p, source_url: 'https://x.test/a' }, plan).join('|'), /web search/);
  assert.match(lintPost(p, { ...plan, topicKeys: [p.topic_key] }).join('|'), /already used/);
});

test('rotation follows TOOL, SAVEABLE, TEARDOWN, HABITS, TESTED', () => {
  const seq = [];
  let recent = [];
  for (let i = 0; i < 6; i++) {
    const { pillar } = pickPillar({ recentPillars: recent, unusedNoteCount: 5, noNotesMode: false });
    seq.push(pillar);
    recent = [pillar, ...recent];
  }
  assert.deepEqual(seq, ['TOOL', 'SAVEABLE', 'TEARDOWN', 'HABITS', 'TESTED', 'TOOL']);
});

test('rotation falls back when no unused note, and in no-notes mode', () => {
  const r = pickPillar({ recentPillars: ['SAVEABLE', 'TOOL'], unusedNoteCount: 0, noNotesMode: false });
  assert.equal(r.fellBack, true);
  assert.ok(['TOOL', 'SAVEABLE'].includes(r.pillar));
  assert.equal(r.pillar, 'TOOL'); // TOOL ran least recently
  const h = pickPillar({ recentPillars: ['TEARDOWN'], unusedNoteCount: 0, noNotesMode: true });
  assert.equal(h.pillar, 'HABITS');
  assert.equal(h.generalHabits, true);
});

test('CTA is DM LAUNCH exactly once in four', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(pickCta), ['starter', 'starter', 'starter', 'launch', 'starter', 'starter', 'starter', 'launch']);
});

test('variant: ~30% explore, exactly one dimension, cover never repeats', () => {
  let explored = 0;
  let n = 0;
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3000; i++) {
    const best = { cover_type: 'COVER_TYPE', hook_style: 'how-to', slide_count: 7 };
    const { variant, experiment } = chooseVariant({ recentVariants: [{ cover_type: 'COVER_GRADIENT' }], best, rng });
    n++;
    assert.notEqual(variant.cover_type, 'COVER_GRADIENT');
    const changed = Object.keys(best).filter((k) => best[k] !== variant[k]);
    assert.ok(changed.length <= 1, `changed ${changed}`);
    if (experiment) {
      explored++;
      assert.deepEqual(changed, [experiment]);
    }
  }
  assert.ok(explored / n > 0.22 && explored / n < 0.38, `explore rate ${explored / n}`);
});

test('buildPlan: no-notes mode needs 7 quiet days', () => {
  const base = { posts: [], unusedNotes: [], lastNoteAt: null, postCount: 0 };
  assert.equal(buildPlan(base, { date: '2026-10-10' }).noNotesMode, true);
  const recent = { ...base, lastNoteAt: new Date(Date.now() - 2 * 86400000).toISOString() };
  assert.equal(buildPlan(recent, { date: '2026-10-10' }).noNotesMode, false);
});

test('signed links verify, expire, and resist tampering', () => {
  process.env.APPROVAL_SECRET = 'test-secret';
  process.env.BASE_URL = 'https://x.example';
  const u = new URL(signedUrl('approve', 'abc'));
  const [exp, sig] = [u.searchParams.get('exp'), u.searchParams.get('sig')];
  assert.ok(verify('approve', 'abc', exp, sig));
  assert.ok(!verify('reject', 'abc', exp, sig));
  assert.ok(!verify('approve', 'abd', exp, sig));
  assert.ok(!verify('approve', 'abc', exp, sig.replace(/.$/, '0')) || sig.endsWith('0'));
  assert.ok(!verify('approve', 'abc', exp, sig, Number(exp) + 1));
});

test('extractJson handles tags, fences and braces in strings', () => {
  assert.deepEqual(extractJson('noise <post>```json\n{"a":"}{","b":[1]}\n```</post> tail', 'post'), { a: '}{', b: [1] });
  assert.throws(() => extractJson('nothing here'));
});

test('londonDate rolls over on London time', () => {
  assert.equal(londonDate(0, new Date('2026-10-09T23:30:00Z')), '2026-10-10'); // BST = UTC+1
  assert.equal(londonDate(1, new Date('2026-01-09T23:30:00Z')), '2026-01-10'); // GMT
});

test('render helpers: single emphasised word, mascot only where allowed', () => {
  assert.equal(headlineHtml('A *big plan* here'), 'A <em>big</em> plan here');
  assert.equal(headlineHtml('*a* and *b*'), '<em>a</em> and b');
  assert.equal(headlineHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  const d = slideData({ type: 'CTA', headline: 'x', mascot: 'smug' }, { index: 7, last: true, pillar: 'HABITS', ctaType: 'launch', handle: 'h' });
  assert.equal(d.mascot, '');
  assert.equal(d.arrow, '');
  assert.equal(d.cta, 'DM LAUNCH →');
});

test('htmlToText drops scripts and tags', () => {
  assert.equal(htmlToText('<p>Hi <b>there</b></p><script>evil()</script>'), 'Hi there');
});

test('DATABASE_URL parser tolerates / and @ in the password', async () => {
  const { parseDatabaseUrl } = await import('../src/pg.js');
  const c = parseDatabaseUrl('postgresql://postgres.abc:pa/ss@w#rd@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
  assert.equal(c.user, 'postgres.abc');
  assert.equal(c.password, 'pa/ss@w#rd');
  assert.equal(c.host, 'aws-0-eu-west-1.pooler.supabase.com');
  assert.equal(c.port, 5432);
  assert.equal(c.database, 'postgres');
});

test('publishable statuses: draft mode needs approval, auto mode only excludes rejected', async () => {
  const { publishableStatuses } = await import('../src/scheduler.js');
  assert.deepEqual(publishableStatuses('draft'), ['approved']);
  assert.deepEqual(publishableStatuses('auto'), ['approved', 'draft']);
});

test('pause/resume links are signed and last 30 days', async () => {
  process.env.APPROVAL_SECRET = 'test-secret';
  process.env.BASE_URL = 'https://x.example';
  const { controlUrl } = await import('../src/sign.js');
  const u = new URL(controlUrl('pause'));
  assert.equal(u.pathname, '/c/pause');
  assert.ok(verify('pause', 'engine', u.searchParams.get('exp'), u.searchParams.get('sig')));
  assert.ok(!verify('resume', 'engine', u.searchParams.get('exp'), u.searchParams.get('sig')));
  assert.ok(Number(u.searchParams.get('exp')) - Date.now() > 29 * 86400000);
});
