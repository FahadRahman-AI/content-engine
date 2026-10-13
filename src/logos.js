// Tool logos: official site icons fetched once per render from Google's favicon service
// (fixed host, so a model-supplied domain can never point us at an arbitrary URL).
const cache = new Map();
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const MIN_BYTES = 500; // the service's "no icon" fallback is tiny

export async function logoDataUri(domain, { fetchImpl = fetch } = {}) {
  const d = String(domain ?? '').toLowerCase();
  if (!DOMAIN.test(d)) return null;
  if (cache.has(d)) return cache.get(d);
  let uri = null;
  try {
    const url = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${d}&size=128`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    const type = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok && /^image\//.test(type) && buf.length >= MIN_BYTES) uri = `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    uri = null;
  }
  cache.set(d, uri);
  return uri;
}

export async function resolveLogos(slides, opts) {
  const domains = new Set(slides.flatMap((s) => s.items).filter((i) => typeof i !== 'string' && i.logo).map((i) => i.logo));
  const map = {};
  await Promise.all([...domains].map(async (d) => (map[d] = await logoDataUri(d, opts))));
  return map;
}
