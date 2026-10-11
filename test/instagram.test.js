import test from 'node:test';
import assert from 'node:assert/strict';
import { publishCarousel, preflightImages, checkPublishingLimit } from '../src/instagram.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function fakeGraph({ limit = { quota_usage: 1, config: { quota_total: 50, quota_duration: 86400 } }, finishAfter = 1 } = {}) {
  const calls = [];
  let n = 0;
  const polls = {};
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? Object.fromEntries(init.body) : {};
    calls.push({ method, path: u.pathname, body, auth: init.headers?.Authorization });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    if (u.pathname.endsWith('/content_publishing_limit')) return json({ data: [limit] });
    if (method === 'POST' && u.pathname.endsWith('/media')) return json({ id: `c${++n}` });
    if (method === 'POST' && u.pathname.endsWith('/media_publish')) return json({ id: 'MEDIA1' });
    if (method === 'GET') {
      const id = u.pathname.split('/').pop();
      polls[id] = (polls[id] ?? 0) + 1;
      return json({ status_code: polls[id] >= finishAfter ? 'FINISHED' : 'IN_PROGRESS' });
    }
    return json({ error: { message: 'unexpected', code: 1 } }, 400);
  };
  return { fetchImpl, calls };
}
const urls = ['https://x.example/m/1.jpg', 'https://x.example/m/2.jpg', 'https://x.example/m/3.jpg'];
const fast = { intervalMs: 0, sleep: async () => {} };

test('carousel flow: children, container with caption, poll, then publish', async () => {
  const { fetchImpl, calls } = fakeGraph({ finishAfter: 2 });
  const id = await publishCarousel({ imageUrls: urls, caption: 'hello', token: 'T', userId: '99', fetchImpl, waitOpts: fast });
  assert.equal(id, 'MEDIA1');
  const posts = calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.slice(0, 3).map((c) => c.body), urls.map((u) => ({ image_url: u, is_carousel_item: 'true' })));
  assert.deepEqual(posts[3].body, { media_type: 'CAROUSEL', children: 'c1,c2,c3', caption: 'hello' });
  assert.deepEqual(posts[4].body, { creation_id: 'c4' });
  assert.ok(calls.filter((c) => c.method !== 'HEAD').every((c) => c.auth === 'Bearer T'));
  assert.ok(calls[0].path.includes('/v25.0/99/content_publishing_limit'), 'limit is checked first');
  // media_publish must come after the carousel container finished polling
  const lastPoll = calls.map((c) => c.path).lastIndexOf('/v25.0/c4');
  assert.ok(lastPoll > -1 && lastPoll < calls.findIndex((c) => c.path.endsWith('/media_publish')));
});

test('refuses to publish when the 24h quota is used up', async () => {
  const { fetchImpl, calls } = fakeGraph({ limit: { quota_usage: 50, config: { quota_total: 50, quota_duration: 86400 } } });
  await assert.rejects(publishCarousel({ imageUrls: urls, caption: 'x', token: 'T', userId: '99', fetchImpl, waitOpts: fast }), /limit reached/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('preflight rejects localhost, http and wrong counts', async () => {
  const { fetchImpl } = fakeGraph();
  await assert.rejects(preflightImages(['http://localhost:3000/m/a.jpg', 'http://localhost:3000/m/b.jpg'], { fetchImpl }), /publicly reachable/);
  await assert.rejects(preflightImages(['http://x.example/a.jpg', 'http://x.example/b.jpg'], { fetchImpl }), /publicly reachable/);
  await assert.rejects(preflightImages(['https://x.example/a.jpg'], { fetchImpl }), /2-10/);
});

test('a container that ends in ERROR aborts before publishing', async () => {
  const { fetchImpl, calls } = fakeGraph();
  const bad = async (url, init) => {
    const u = new URL(url);
    if ((init?.method ?? 'GET') === 'GET' && /\/c\d+$/.test(u.pathname)) return json({ status_code: 'ERROR' });
    return fetchImpl(url, init);
  };
  await assert.rejects(publishCarousel({ imageUrls: urls, caption: 'x', token: 'T', userId: '99', fetchImpl: bad, waitOpts: fast }), /ERROR/);
  assert.ok(!calls.some((c) => c.path.endsWith('/media_publish')));
});
