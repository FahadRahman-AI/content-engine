// All database access goes straight to Postgres (DATABASE_URL), not through the Supabase web API.
import { q } from './pg.js';

const JSON_COLS = new Set(['content', 'variant', 'slides', 'value']);

export async function getSetting(key, fallback = null) {
  const rows = await q('select value from settings where key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}
export async function setSetting(key, value) {
  await q('insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value', [key, JSON.stringify(value)]);
}
export const getMode = async () => (await getSetting('mode', process.env.MODE || 'draft')) || 'draft';

const CONF_RANK = { rule: 0, tested: 1, hypothesis: 2 };

export async function loadContext() {
  const [posts, unusedNotes, lastNote, learnings, ideas, rejected, winners, count] = await Promise.all([
    q('select date::text as date, pillar, topic_key, variant, status from posts order by date desc, created_at desc limit 30'),
    q('select id, text, image_url, created_at from raw_notes where used = false order by created_at limit 10'),
    q('select max(created_at) as at from raw_notes'),
    q("select * from learnings where status = 'active'"),
    q('select id, source, text from idea_queue where used = false order by created_at limit 3'),
    q("select pillar, hook, slides, note from reference_posts where status = 'rejected' and note is not null order by created_at desc limit 2"),
    q("select pillar, hook, slides from reference_posts where status = 'winner' order by created_at desc limit 3"),
    q("select count(*)::int as n from posts where status <> 'failed'"),
  ]);
  return {
    posts,
    unusedNotes,
    lastNoteAt: lastNote[0]?.at ?? null,
    learnings: learnings
      .sort((a, b) => CONF_RANK[a.confidence] - CONF_RANK[b.confidence] || new Date(b.last_validated) - new Date(a.last_validated))
      .slice(0, 12),
    ideas,
    rejected,
    winners,
    postCount: count[0].n,
  };
}

export const loadExamples = (pillar) =>
  q("select pillar, hook, slides from reference_posts where pillar = $1 and status = 'approved' order by created_at desc limit 3", [pillar]);

export async function postForDate(date) {
  return (await q("select id, status from posts where date = $1 and status <> 'failed' limit 1", [date]))[0] ?? null;
}

const val = (col, v) => (JSON_COLS.has(col) && v !== null && v !== undefined ? JSON.stringify(v) : v);

export async function insertPost(row) {
  const cols = ['date', 'pillar', 'topic_key', 'hook', 'content', 'image_urls', 'caption', 'status', 'source_url', 'variant'];
  const full = { image_urls: [], caption: null, source_url: null, variant: {}, ...row };
  const params = cols.map((c) => val(c, full[c]));
  const casts = cols.map((c, i) => `$${i + 1}${JSON_COLS.has(c) ? '::jsonb' : ''}`);
  return (await q(`insert into posts (${cols.join(',')}) values (${casts.join(',')}) returning *, date::text as date`, params))[0];
}

const UPDATABLE = new Set(['status', 'ig_media_id', 'published_at', 'image_urls', 'caption', 'content', 'variant']);
export async function updatePost(id, patch) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.has(k));
  if (!keys.length) throw new Error('updatePost: nothing to update');
  const sets = keys.map((k, i) => `${k} = $${i + 2}${JSON_COLS.has(k) ? '::jsonb' : ''}`);
  const rows = await q(`update posts set ${sets.join(', ')} where id = $1 returning *, date::text as date`, [id, ...keys.map((k) => val(k, patch[k]))]);
  return rows[0];
}
export async function getPost(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await q('select *, date::text as date from posts where id = $1', [id]))[0] ?? null;
}
export const markNoteUsed = (id, used = true) => q('update raw_notes set used = $2 where id = $1', [id, used]);
export const markIdeasUsed = async (ids) => ids.length && q('update idea_queue set used = true where id = any($1::uuid[])', [ids]);
export const addNote = ({ text, image_url = null }) => q('insert into raw_notes (text, image_url) values ($1, $2)', [text, image_url]);
export const addReference = ({ post_id = null, pillar, hook, slides, status, note = null }) =>
  q('insert into reference_posts (post_id, pillar, hook, slides, status, note) values ($1,$2,$3,$4::jsonb,$5,$6)', [post_id, pillar, hook, JSON.stringify(slides), status, note]);
export const dropReference = (postId) => q('delete from reference_posts where post_id = $1', [postId]);
