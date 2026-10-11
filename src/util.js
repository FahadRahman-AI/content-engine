import { TZ } from './constants.js';

export const wordCount = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;

// YYYY-MM-DD in Europe/London, `offsetDays` from now.
export function londonDate(offsetDays = 0, now = new Date()) {
  const d = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

// First balanced JSON object in `text`, preferring one wrapped in <tag>…</tag>.
export function extractJson(text, tag) {
  let src = text;
  if (tag) {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'));
    if (m) src = m[m.length - 1].replace(new RegExp(`</?${tag}>`, 'g'), '');
  }
  src = src.replace(/```(?:json)?/g, '');
  const start = src.indexOf('{');
  if (start < 0) throw new Error('No JSON object found in model output');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error('Unterminated JSON object in model output');
}
