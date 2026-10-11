// Instagram API with Instagram Login (no Facebook Page). Docs: graph.instagram.com, v25.0.
import { getPost, getSetting, postForDate, setSetting, updatePost } from './data.js';
import { q } from './pg.js';
import { need } from './util.js';

export const GRAPH = 'https://graph.instagram.com';
export const API_VERSION = process.env.IG_API_VERSION || 'v25.0';
const DAY = 86400000;
const TOKEN_LIFETIME_DAYS = 60;
const REFRESH_AT_DAY = 50; // refresh once the token is 50 days old (10 days left)

class IgError extends Error {}

async function call(method, path, { params = {}, token, fetchImpl = fetch } = {}) {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, '')}`);
  const init = { method, headers: { Authorization: `Bearer ${token}` } };
  if (method === 'GET') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  else {
    init.body = new URLSearchParams(params);
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetchImpl(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new IgError(`Instagram ${method} ${path}: ${e.message ?? res.statusText} (code ${e.code ?? res.status}${e.error_subcode ? `/${e.error_subcode}` : ''})`);
  }
  return body;
}

// ---- Token storage and refresh ------------------------------------------------------------
// The token lives in settings (instagram_token / token_expiry). The first run seeds it from
// IG_ACCESS_TOKEN and assumes it was generated today, so expiry = now + 60 days.
export async function getToken({ now = Date.now() } = {}) {
  let token = await getSetting('instagram_token');
  if (!token) {
    token = need('IG_ACCESS_TOKEN');
    await setSetting('instagram_token', token);
    await setSetting('token_expiry', new Date(now + TOKEN_LIFETIME_DAYS * DAY).toISOString());
  }
  return token;
}

export async function refreshTokenIfDue({ now = Date.now(), fetchImpl = fetch, force = false } = {}) {
  const token = await getToken({ now });
  const expiry = new Date(await getSetting('token_expiry')).getTime();
  const ageDays = TOKEN_LIFETIME_DAYS - (expiry - now) / DAY;
  if (!force && ageDays < REFRESH_AT_DAY) return { refreshed: false, expiry: new Date(expiry) };
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', token);
  const res = await fetchImpl(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new IgError(`Token refresh failed: ${body.error?.message ?? res.statusText}`);
  const newExpiry = new Date(now + body.expires_in * 1000);
  await setSetting('instagram_token', body.access_token);
  await setSetting('token_expiry', newExpiry.toISOString());
  return { refreshed: true, expiry: newExpiry };
}

// ---- Publishing ----------------------------------------------------------------------------
export async function checkPublishingLimit({ token, userId, fetchImpl }) {
  const r = await call('GET', `${API_VERSION}/${userId}/content_publishing_limit`, { params: { fields: 'quota_usage,config' }, token, fetchImpl });
  const row = r.data?.[0];
  if (row && row.config && row.quota_usage >= row.config.quota_total) {
    throw new IgError(`Publishing limit reached (${row.quota_usage}/${row.config.quota_total} in the last ${row.config.quota_duration / 3600}h)`);
  }
  return row;
}

// Instagram fetches the images itself, so they must be public https JPEGs.
export async function preflightImages(urls, { fetchImpl = fetch } = {}) {
  if (urls.length < 2 || urls.length > 10) throw new IgError(`A carousel needs 2-10 images, got ${urls.length}`);
  for (const u of urls) {
    const { protocol, hostname } = new URL(u);
    if (protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.)/.test(hostname)) {
      throw new IgError(`Image URL is not publicly reachable (${hostname}). Instagram can't fetch from your computer: set BASE_URL to a public https address.`);
    }
    const res = await fetchImpl(u, { method: 'HEAD' });
    if (!res.ok || !/image\/jpeg/.test(res.headers.get('content-type') ?? '')) {
      throw new IgError(`Image not reachable as image/jpeg: ${u} (${res.status})`);
    }
  }
}

export async function waitUntilFinished(id, { token, fetchImpl, intervalMs = 5000, timeoutMs = 300000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const start = Date.now();
  for (;;) {
    const { status_code } = await call('GET', `${API_VERSION}/${id}`, { params: { fields: 'status_code' }, token, fetchImpl });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new IgError(`Container ${id} ended in ${status_code}`);
    if (Date.now() - start > timeoutMs) throw new IgError(`Container ${id} still ${status_code} after ${timeoutMs / 1000}s`);
    await sleep(intervalMs);
  }
}

// child containers -> carousel container -> poll -> media_publish. Returns the IG media id.
export async function publishCarousel({ imageUrls, caption, token, userId, fetchImpl = fetch, waitOpts = {} }) {
  await checkPublishingLimit({ token, userId, fetchImpl });
  await preflightImages(imageUrls, { fetchImpl });
  const children = [];
  for (const image_url of imageUrls) {
    const { id } = await call('POST', `${API_VERSION}/${userId}/media`, { params: { image_url, is_carousel_item: 'true' }, token, fetchImpl });
    children.push(id);
  }
  for (const id of children) await waitUntilFinished(id, { token, fetchImpl, ...waitOpts });
  const { id: container } = await call('POST', `${API_VERSION}/${userId}/media`, {
    params: { media_type: 'CAROUSEL', children: children.join(','), caption },
    token,
    fetchImpl,
  });
  await waitUntilFinished(container, { token, fetchImpl, ...waitOpts });
  const { id } = await call('POST', `${API_VERSION}/${userId}/media_publish`, { params: { creation_id: container }, token, fetchImpl });
  return id;
}

// Publishes one stored post. Never double-posts: the row is claimed atomically
// (approved -> scheduled) and a day that already has a published post is refused.
export async function publishPost(postId, { allowStatuses = ['approved'], fetchImpl = fetch, waitOpts, notifyFailure } = {}) {
  if ((await getSetting('paused', false)) === true) throw new IgError('Publishing is paused (settings.paused)');
  const post = await getPost(postId);
  if (!post) throw new IgError(`No post ${postId}`);
  const twin = (await q("select id from posts where date = $1 and status = 'published' limit 1", [post.date]))[0];
  if (twin) throw new IgError(`A post for ${post.date} is already published (${twin.id})`);
  const claimed = await q("update posts set status = 'scheduled' where id = $1 and status = any($2::text[]) returning id", [postId, allowStatuses]);
  if (!claimed.length) throw new IgError(`Post is ${post.status}, not one of: ${allowStatuses.join(', ')}`);
  try {
    await refreshTokenIfDue({ fetchImpl });
    const mediaId = await publishCarousel({
      imageUrls: post.image_urls,
      caption: post.caption,
      token: await getToken(),
      userId: need('IG_USER_ID'),
      fetchImpl,
      waitOpts,
    });
    await updatePost(postId, { status: 'published', ig_media_id: mediaId, published_at: new Date().toISOString() });
    return { mediaId };
  } catch (e) {
    await updatePost(postId, { status: 'failed' });
    await notifyFailure?.(post, e);
    throw e;
  }
}
