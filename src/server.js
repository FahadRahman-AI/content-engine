import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { getSetting, setSetting, addNote, addReference, dropReference, getPost, markNoteUsed, updatePost } from './data.js';
import { getMedia, saveMedia, mediaUrl } from './storage.js';
import { safeEqual, verify } from './sign.js';
import { escapeHtml, need } from './util.js';

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>
body{font:17px/1.45 -apple-system,Helvetica,Arial,sans-serif;background:#F2F0EB;color:#141414;margin:0;padding:24px}
main{max-width:560px;margin:0 auto}h1{font-size:26px;letter-spacing:-.02em}
input,textarea,button{font:inherit;width:100%;box-sizing:border-box;padding:14px;border:1px solid #14141466;border-radius:10px;background:#fff;margin:6px 0 14px}
button{background:#141414;color:#fff;border:0;font-weight:700;cursor:pointer}button.warn{background:#E8350A}
.msg{padding:14px;border-radius:10px;background:#fff}
</style></head><body><main>${body}</main></body></html>`;

const IMAGE_MAGIC = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'jpg'],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png'],
  ['image/webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', 'webp'],
];
const MAX_IMAGE = 8 * 1024 * 1024;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1, fields: 4 } });

  app.get('/', (_req, res) => res.type('text').send('ok'));

  // Public image hosting (Instagram fetches slide JPEGs from here).
  app.get('/m/:file', async (req, res) => {
    const m = /^([0-9a-f-]{36})\.(jpg|png|webp)$/i.exec(req.params.file);
    const media = m && (await getMedia(m[1]));
    if (!media) return res.status(404).type('text').send('not found');
    res.set({ 'content-type': media.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }).send(media.data);
  });

  // ---- Approve / reject (signed links). GET only shows a confirm page, so mail scanners can't trigger actions.
  const checkLink = (req) => verify(req.params.action, req.params.id, req.query.exp ?? req.body?.exp, req.query.sig ?? req.body?.sig);
  app.get('/a/:action/:id', async (req, res) => {
    if (!['approve', 'reject'].includes(req.params.action) || !checkLink(req)) return res.status(403).send(page('Link invalid', '<h1>Link invalid or expired</h1>'));
    const post = await getPost(req.params.id);
    if (!post) return res.status(404).send(page('Not found', '<h1>Post not found</h1>'));
    const { action } = req.params;
    const hidden = `<input type="hidden" name="exp" value="${escapeHtml(req.query.exp)}"><input type="hidden" name="sig" value="${escapeHtml(req.query.sig)}">`;
    res.send(
      page(
        action,
        `<h1>${action === 'approve' ? 'Approve' : 'Reject'} this post?</h1>
<p><strong>${escapeHtml(post.hook)}</strong><br>${post.pillar} · ${post.date} · currently ${post.status}</p>
<form method="post">${hidden}${action === 'reject' ? '<textarea name="note" rows="4" placeholder="Why? The next drafts read this." required></textarea>' : ''}
<button class="${action === 'reject' ? 'warn' : ''}">${action === 'approve' ? 'Approve' : 'Reject'}</button></form>`
      )
    );
  });

  app.post('/a/:action/:id', async (req, res) => {
    if (!['approve', 'reject'].includes(req.params.action) || !checkLink(req)) return res.status(403).send(page('Link invalid', '<h1>Link invalid or expired</h1>'));
    const post = await getPost(req.params.id);
    if (!post) return res.status(404).send(page('Not found', '<h1>Post not found</h1>'));
    if (!['draft', 'approved', 'rejected'].includes(post.status)) {
      return res.send(page('Too late', `<h1>Too late</h1><p class="msg">This post is already ${post.status}.</p>`));
    }
    const approving = req.params.action === 'approve';
    const note = approving ? null : String(req.body.note ?? '').trim().slice(0, 1000);
    if (!approving && !note) return res.status(400).send(page('Note needed', '<h1>A rejection note is required</h1>'));
    if (post.status === (approving ? 'approved' : 'rejected')) {
      return res.send(page('Done', `<h1>Already ${post.status}</h1>`));
    }
    await updatePost(post.id, { status: approving ? 'approved' : 'rejected' });
    await dropReference(post.id);
    await addReference({ post_id: post.id, pillar: post.pillar, hook: post.hook, slides: post.content, status: approving ? 'approved' : 'rejected', note });
    // A rejected post frees its raw note for another attempt.
    if (!approving && post.content?.note_id) await markNoteUsed(post.content.note_id, false);
    res.send(page('Done', `<h1>${approving ? 'Approved' : 'Rejected'}</h1><p class="msg">${escapeHtml(post.hook)}</p>`));
  });

  // ---- Kill switch: /c/pause and /c/resume (signed links, 30 days). GET confirms, POST acts.
  const controlOk = (req) => ['pause', 'resume'].includes(req.params.action) && verify(req.params.action, 'engine', req.query.exp ?? req.body?.exp, req.query.sig ?? req.body?.sig);
  const stateLine = async () => ((await getSetting('paused', false)) === true ? 'Publishing is currently <strong>PAUSED</strong>.' : 'Publishing is currently <strong>running</strong>.');
  app.get('/c/:action', async (req, res) => {
    if (!controlOk(req)) return res.status(403).send(page('Link invalid', '<h1>Link invalid or expired</h1>'));
    const pausing = req.params.action === 'pause';
    res.send(page(req.params.action, `<h1>${pausing ? 'Pause' : 'Resume'} publishing?</h1><p class="msg">${await stateLine()}</p>
<form method="post"><input type="hidden" name="exp" value="${escapeHtml(req.query.exp)}"><input type="hidden" name="sig" value="${escapeHtml(req.query.sig)}">
<button class="${pausing ? 'warn' : ''}">${pausing ? 'Pause everything' : 'Resume publishing'}</button></form>`));
  });
  app.post('/c/:action', async (req, res) => {
    if (!controlOk(req)) return res.status(403).send(page('Link invalid', '<h1>Link invalid or expired</h1>'));
    await setSetting('paused', req.params.action === 'pause');
    res.send(page('Done', `<h1>${req.params.action === 'pause' ? 'Paused' : 'Resumed'}</h1><p class="msg">${await stateLine()}</p>`));
  });

  // ---- Notes intake (password protected)
  const notesForm = (msg = '') =>
    page(
      'Notes',
      `<h1>Add a note</h1>${msg}
<form method="post" enctype="multipart/form-data">
<input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
<textarea name="text" rows="6" placeholder="What did you build, ship, learn or get wrong? Real numbers only." required></textarea>
<input type="file" name="image" accept="image/jpeg,image/png,image/webp">
<button>Save note</button></form>`
    );
  app.get('/notes', (_req, res) => res.send(notesForm()));
  app.post('/notes', (req, res) => {
    upload.single('image')(req, res, async (err) => {
      try {
        if (err) return res.status(400).send(notesForm(`<p class="msg">Upload failed: ${escapeHtml(err.code === 'LIMIT_FILE_SIZE' ? 'image over 8 MB' : err.message)}</p>`));
        if (!safeEqual(req.body.password, need('NOTES_PASSWORD'))) {
          await new Promise((r) => setTimeout(r, 800));
          return res.status(401).send(notesForm('<p class="msg">Wrong password.</p>'));
        }
        const text = String(req.body.text ?? '').trim().slice(0, 4000);
        if (!text) return res.status(400).send(notesForm('<p class="msg">Write something first.</p>'));
        let image_url = null;
        if (req.file) {
          const kind = IMAGE_MAGIC.find(([, ok]) => ok(req.file.buffer));
          if (!kind) return res.status(400).send(notesForm('<p class="msg">Image must be a JPEG, PNG or WebP.</p>'));
          image_url = mediaUrl(await saveMedia(req.file.buffer, kind[0]), kind[0]);
        }
        await addNote({ text, image_url });
        res.send(notesForm('<p class="msg">Saved ✓</p>'));
      } catch (e) {
        console.error('notes error', e);
        res.status(500).send(notesForm('<p class="msg">Server error, try again.</p>'));
      }
    });
  });

  return app;
}
