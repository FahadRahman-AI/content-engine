import 'dotenv/config';
import { resendReview, runGenerate } from './generate.js';
import { publishFailureEmail, send } from './mail.js';
import { publishPost, refreshTokenIfDue } from './instagram.js';
import { createApp } from './server.js';
import { runPublishJob, startScheduler } from './scheduler.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];

try {
  if (cmd === 'generate') {
    const out = await runGenerate({ dry: flag('dry'), ...(opt('date') ? { date: opt('date') } : {}) });
    if (out.failed) process.exitCode = 2;
  } else if (cmd === 'email') {
    await resendReview(args[0]);
    console.log('review email sent');
  } else if (cmd === 'publish-today') {
    console.log(await runPublishJob({}));
  } else if (cmd === 'publish') {
    const out = await publishPost(args[0], { notifyFailure: (post, error) => send(publishFailureEmail({ post, error })).catch(() => {}) });
    console.log('published, Instagram media id', out.mediaId);
  } else if (cmd === 'refresh-token') {
    const r = await refreshTokenIfDue({ force: flag('force') });
    console.log(r.refreshed ? 'token refreshed' : 'token still fresh', '- expires', r.expiry.toISOString());
  } else if (cmd === 'serve') {
    const port = process.env.PORT || 3000;
    createApp().listen(port, () => console.log(`listening on ${port}`));
    // The schedule runs on Railway automatically; locally, set ENABLE_CRON=true to turn it on.
    if (process.env.RAILWAY_ENVIRONMENT || process.env.ENABLE_CRON === 'true') startScheduler();
    else console.log('Scheduler off (local). Set ENABLE_CRON=true to run it.');
  } else {
    console.error('usage: node src/cli.js generate [--dry] [--date=YYYY-MM-DD] | email <post-id> | publish <post-id> | refresh-token | serve');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
