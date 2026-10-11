// Fetches a source page as plain text for the critic. The text is DATA, never instructions.
import net from 'node:net';
import dns from 'node:dns/promises';

const MAX_BYTES = 1_500_000;
const MAX_CHARS = 40_000;

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

async function assertPublic(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('not http(s)');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('private address');
  return u;
}

export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns { ok, text, error }. Never throws.
export async function fetchSourceText(url) {
  try {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ForwardThinkingBot/1.0)', accept: 'text/html,text/plain' },
    });
    let final = res;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), url).toString();
      await assertPublic(next); // re-check after each redirect (one hop followed)
      final = await fetch(next, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; ForwardThinkingBot/1.0)' } });
    }
    if (!final.ok) return { ok: false, text: '', error: `HTTP ${final.status}` };
    const type = final.headers.get('content-type') || '';
    if (!/text\/|html|json|xml/.test(type)) return { ok: false, text: '', error: `unsupported content-type ${type}` };
    const buf = Buffer.from(await final.arrayBuffer()).subarray(0, MAX_BYTES).toString('utf8');
    const text = (/html/.test(type) ? htmlToText(buf) : buf).slice(0, MAX_CHARS);
    return text.length > 400 ? { ok: true, text } : { ok: false, text, error: 'page text too short (likely JS-rendered)' };
  } catch (e) {
    return { ok: false, text: '', error: e.message };
  }
}
