import cron from 'node-cron';
import { getMode, getSetting, postForDate } from './data.js';
import { runGenerate } from './generate.js';
import { refreshTokenIfDue, publishPost } from './instagram.js';
import { alertEmail, publishFailureEmail, send } from './mail.js';
import { pruneMedia } from './storage.js';
import { TZ } from './constants.js';
import { londonDate } from './util.js';

// draft mode: only an approved post goes out. auto mode: anything not rejected goes out.
export function publishableStatuses(mode) {
  return mode === 'auto' ? ['approved', 'draft'] : ['approved'];
}

export async function runPublishJob({ log = console.log, now = new Date() } = {}) {
  const date = londonDate(0, now);
  if ((await getSetting('paused', false)) === true) {
    log(`Publish ${date}: skipped, engine is paused`);
    return { skipped: 'paused' };
  }
  const post = await postForDate(date);
  if (!post) {
    log(`Publish ${date}: no post for today, nothing to do`);
    return { skipped: 'no-post' };
  }
  const mode = await getMode();
  if (!publishableStatuses(mode).includes(post.status)) {
    log(`Publish ${date}: post is ${post.status} in ${mode} mode, not publishing`);
    return { skipped: `status-${post.status}` };
  }
  const out = await publishPost(post.id, {
    allowStatuses: publishableStatuses(mode),
    notifyFailure: (p, error) => send(publishFailureEmail({ post: p, error })).catch(() => {}),
  });
  log(`Publish ${date}: posted, Instagram media id ${out.mediaId}`);
  return { published: out.mediaId };
}

// Wraps a job so one crash never kills the scheduler, and you always hear about it.
const guarded = (name, fn) => async () => {
  try {
    await fn();
  } catch (e) {
    console.error(`[${name}] failed:`, e);
    await alertEmail(`${name} failed`, e.message).catch(() => {});
  }
};

export function startScheduler() {
  const opts = { timezone: TZ, noOverlap: true };
  cron.schedule('0 21 * * *', guarded('Nightly generate', () => runGenerate({})), { ...opts, name: 'generate' });
  cron.schedule('0 7 * * *', guarded('Morning publish', () => runPublishJob({})), { ...opts, name: 'publish' });
  cron.schedule('30 6 * * *', guarded('Token refresh', () => refreshTokenIfDue({})), { ...opts, name: 'token' });
  cron.schedule('0 4 * * 0', guarded('Image cleanup', () => pruneMedia(60)), { ...opts, name: 'prune' });
  console.log(`Scheduler on (${TZ}): generate 21:00, token check 06:30, publish 07:00`);
}
