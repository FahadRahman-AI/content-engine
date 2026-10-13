import nodemailer from 'nodemailer';
import { escapeHtml, need } from './util.js';
import { controlUrl, signedUrl } from './sign.js';

let transport;
const mailer = () =>
  (transport ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user: need('GMAIL_USER'), pass: need('GMAIL_APP_PASSWORD') },
  }));

const btn = (href, label, color) =>
  `<a href="${href}" style="display:inline-block;padding:14px 26px;margin:0 8px 8px 0;border-radius:999px;background:${color};color:#fff;text-decoration:none;font-weight:700;font-family:Arial,sans-serif">${label}</a>`;

export function reviewEmail({ post, plan, jpegs }) {
  const links = post.id
    ? `${btn(signedUrl('approve', post.id), 'Approve', '#141414')}${btn(signedUrl('reject', post.id), 'Reject…', '#E8350A')}`
    : '<p><em>Dry run: no links, nothing was saved or posted.</em></p>';
  const imgs = jpegs.map((_, i) => `<img src="cid:slide${i + 1}" width="320" style="margin:0 8px 8px 0;border:1px solid #ddd">`).join('');
  const caption = `${post.caption}\n\n${post.hashtags.join(' ')}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:720px">
<h2 style="margin:0 0 4px">${escapeHtml(post.hook)}</h2>
<p style="color:#666;margin:0 0 16px">${post.pillar} · for ${plan.date} · cover ${post.variant.cover_type} · ${post.variant.slide_count} slides · CTA ${post.variant.cta_type}${plan.experiment ? ` · experiment: ${plan.experiment}` : ''}${post.source_url ? ` · <a href="${escapeHtml(post.source_url)}">source</a>` : ''}</p>
<div>${links}</div>
<div style="margin:16px 0">${imgs}</div>
<pre style="white-space:pre-wrap;font-family:Arial,sans-serif;background:#f6f4ef;padding:16px;border-radius:8px">${escapeHtml(caption)}</pre>
${post.id ? controlsFooter() : ''}</div>`;
  return {
    subject: `[FTC] ${plan.date} ${post.pillar}: ${post.hook}`,
    html,
    text: `${post.hook}\n\n${caption}`,
    attachments: jpegs.map((content, i) => ({
      filename: `${String(i + 1).padStart(2, '0')}.jpg`,
      content,
      cid: `slide${i + 1}`,
      contentType: 'image/jpeg',
    })),
  };
}

export function failureEmail({ plan, issues, draft }) {
  const list = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  return {
    subject: `[FTC] ${plan.date} SKIPPED: no post will go out`,
    html: `<div style="font-family:Arial,sans-serif;max-width:720px"><h2>No post for ${plan.date}</h2>
<p>Generation or the fact-check failed, so nothing will be published. Pillar: ${plan.pillar}.</p>
<ul>${list}</ul>${draft ? `<p>Last draft hook: <em>${escapeHtml(draft.hook)}</em></p>` : ''}${controlsFooter()}</div>`,
    text: `No post for ${plan.date} (${plan.pillar}).\n${issues.map((i) => `- ${i}`).join('\n')}`,
  };
}

// Railway's Hobby plan blocks SMTP, so on Railway mail goes through Resend's HTTPS API (set RESEND_API_KEY).
// Without RESEND_API_KEY it falls back to Gmail SMTP (fine on your own computer).
export function resendPayload(mail, { from, to }) {
  return {
    from,
    to: [to],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: (mail.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString('base64'),
      content_type: a.contentType,
      ...(a.cid ? { content_id: a.cid } : {}),
    })),
  };
}

export async function send(mail, { fetchImpl = fetch } = {}) {
  const to = process.env.NOTIFY_EMAIL || need('GMAIL_USER');
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || 'Forward Thinking Co engine <onboarding@resend.dev>';
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(resendPayload(mail, { from, to })),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend email failed (${res.status}): ${body.message ?? res.statusText}`);
    return body;
  }
  return mailer().sendMail({ from: `Forward Thinking Co engine <${need('GMAIL_USER')}>`, to, ...mail });
}

export function publishFailureEmail({ post, error }) {
  return {
    subject: `[FTC] ${post.date} PUBLISH FAILED: ${post.hook}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:720px"><h2>Publishing failed</h2><p>${escapeHtml(post.hook)} (${post.date}) was <strong>not</strong> posted.</p><pre style="white-space:pre-wrap">${escapeHtml(error.message)}</pre>${controlsFooter()}</div>`,
    text: `Publishing failed for ${post.date}: ${error.message}`,
  };
}

// Footer for every email: the kill switch.
export const controlsFooter = () =>
  `<p style="font-family:Arial,sans-serif;font-size:13px;color:#666;margin-top:24px;border-top:1px solid #ddd;padding-top:12px">Emergency stop: <a href="${controlUrl('pause')}">Pause all publishing</a> · <a href="${controlUrl('resume')}">Resume</a></p>`;

export async function alertEmail(subject, text) {
  return send({ subject: `[FTC] ${subject}`, text, html: `<div style="font-family:Arial,sans-serif;max-width:720px"><h2>${escapeHtml(subject)}</h2><pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>${controlsFooter()}</div>` });
}
