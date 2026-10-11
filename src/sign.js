import crypto from 'node:crypto';
import { need } from './util.js';

const TTL_MS = 3 * 86400000;
export const CONTROL_TTL_MS = 30 * 86400000; // pause/resume links in old emails keep working for 30 days
const mac = (payload) => crypto.createHmac('sha256', need('APPROVAL_SECRET')).update(payload).digest('hex');

export function signedUrl(action, id, { ttlMs = TTL_MS, now = Date.now() } = {}) {
  const exp = now + ttlMs;
  const sig = mac(`${action}:${id}:${exp}`);
  return `${need('BASE_URL').replace(/\/$/, '')}/a/${action}/${id}?exp=${exp}&sig=${sig}`;
}

export function verify(action, id, exp, sig, now = Date.now()) {
  if (!exp || !sig || !/^\d+$/.test(String(exp)) || Number(exp) < now) return false;
  const a = Buffer.from(mac(`${action}:${id}:${exp}`));
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Constant-time string compare for passwords/secrets.
export function safeEqual(a = '', b = '') {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const controlUrl = (action) => signedUrl(action, 'engine', { ttlMs: CONTROL_TTL_MS }).replace(`/a/${action}/engine`, `/c/${action}`);
