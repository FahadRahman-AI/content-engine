// Slide bodies. Each function returns the HTML placed inside .slide (the frame is added by base.html).
import { mascot } from './mascot.js';

const INK = '#141414';
const CREAM = '#F2F0EB';
const DARK_BG = '#141412';
export const DARK_TYPES = new Set(['COVER_GRADIENT', 'STAT']);

export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// *word* = the one emphasised (serif italic) word. Only the first marker, first word.
export function headlineHtml(text = '') {
  let used = false;
  return esc(text).replace(/\*([^*]+)\*/g, (_, span) => {
    if (used) return span;
    used = true;
    const [first, ...rest] = span.split(' ');
    return `<em>${first}</em>${rest.length ? ' ' + rest.join(' ') : ''}`;
  });
}

const norm = (it) => (typeof it === 'string' ? { title: '', text: it } : { title: it.title, text: it.text ?? '', logo: it.logo, tag: it.tag, cells: it.cells });

const ico = (it, logos) => {
  const uri = it.logo ? logos[it.logo] : null;
  if (uri) return `<span class="ico"><img src="${uri}" alt=""></span>`;
  return `<span class="ico tile">${esc((it.title || it.text || '?').trim()[0].toUpperCase())}</span>`;
};

const lede = (body) => (body ? `<p class="lede">${esc(body)}</p>` : '');
const head = (s, max = 84, min = 54) => `<div class="fit-box"><h2 class="headline" data-fit data-max="${max}" data-min="${min}">${headlineHtml(s.headline)}</h2></div>`;

function band(s, ctx) {
  if (!s.mascot || s.type === 'COVER_MASCOT') return '';
  const dark = DARK_TYPES.has(s.type);
  const svg = mascot({ pose: s.mascot, size: 190, ink: dark ? CREAM : INK, bg: dark ? DARK_BG : CREAM });
  return `<div class="mband"><div class="mpic">${svg}</div>${s.mascot_say ? `<div class="bubble">${esc(s.mascot_say)}</div>` : ''}</div>`;
}

const rows = (items, { numbered = false, logos } = {}) =>
  `<ul class="rows fitlist">${items
    .map(norm)
    .map(
      (it, i) =>
        `<li>${numbered ? `<span class="mono idx">${String(i + 1).padStart(2, '0')}</span>` : it.logo ? ico(it, logos) : '<span class="sq"></span>'}<div class="rt">${it.title ? `<b>${esc(it.title)}</b>${it.text ? `<span>${esc(it.text)}</span>` : ''}` : esc(it.text)}</div></li>`
    )
    .join('')}</ul>`;

export const BUILDERS = {
  COVER_TYPE: (s, ctx) => `<div class="area"><div class="fit-box end">
    <div class="kicker mono">${esc(s.stat || ctx.pillar)}</div>
    <h1 class="headline em-accent" data-fit data-max="140" data-min="96">${headlineHtml(s.headline)}</h1></div>
    ${s.body ? `<div class="rule" style="margin-top:44px"></div><p class="lede sub">${esc(s.body)}</p>` : ''}
    <div class="swipe mono">SWIPE →</div></div>`,

  COVER_GRADIENT: (s, ctx) => `<div class="glow"></div><div class="area"><div class="fit-box end">
    <div class="pill mono">${esc(s.stat || `${ctx.pillar} / SAVE THIS`)}</div>
    <h1 class="headline" data-fit data-max="140" data-min="96">${headlineHtml(s.headline)}</h1></div>
    ${s.body ? `<p class="lede sub" style="color:var(--ink)">${esc(s.body)}</p>` : ''}</div>`,

  COVER_MASCOT: (s, ctx) => {
    const svg = mascot({ pose: s.mascot, size: 520, ink: INK, bg: CREAM });
    return `<div class="area"><div class="fit-box"><h1 class="headline" data-fit data-max="128" data-min="92">${headlineHtml(s.headline)}</h1>
      ${s.body ? `<p class="lede sub">${esc(s.body)}</p>` : ''}</div></div>
      <div class="cover-mascot">${s.mascot_say ? `<div class="bubble big">${esc(s.mascot_say)}</div>` : ''}<div class="mpic">${svg}</div></div>`;
  },

  STEP: (s, ctx) => `<div class="area ${s.mascot ? 'has-band' : ''}">
    <div class="stephead"><div class="stepnum">${String(ctx.stepIndex).padStart(2, '0')}</div>${head(s, 72, 48)}</div>
    ${lede(s.body)}${rows(s.items, { logos: ctx.logos })}</div>${band(s, ctx)}`,

  LIST: (s, ctx) => `<div class="area ${s.mascot ? 'has-band' : ''}">${head(s)}${lede(s.body)}<div class="rule"></div>
    ${rows(s.items, { numbered: true, logos: ctx.logos })}</div>${band(s, ctx)}`,

  TOOLS: (s, ctx) => `<div class="area ${s.mascot ? 'has-band' : ''}">${head(s, 80, 50)}${lede(s.body)}
    <div class="cards fitlist">${s.items
      .map(norm)
      .map((it) => `<div class="card">${ico(it, ctx.logos)}<div class="ct"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div>${it.tag ? `<span class="tag mono">${esc(it.tag)}</span>` : ''}</div>`)
      .join('')}</div></div>${band(s, ctx)}`,

  MATRIX: (s, ctx) => `<div class="area ${s.mascot ? 'has-band' : ''}">${head(s, 78, 50)}${lede(s.body)}
    <div class="fitlist matrix"><table><thead><tr><th></th>${s.columns.map((c) => `<th class="mono">${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.items
      .map(norm)
      .map((it) => `<tr><td class="who">${ico(it, ctx.logos)}<b>${esc(it.title)}</b></td>${(it.cells ?? []).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div></div>${band(s, ctx)}`,

  COMPARE: (s, ctx) => {
    const [l, r] = (s.stat ?? 'BEFORE | AFTER').split('|').map((x) => x.trim());
    return `<div class="area ${s.mascot ? 'has-band' : ''}">${head(s, 76, 50)}${lede(s.body)}
      <div class="cmp-h"><span class="mono">${esc(l || 'BEFORE')}</span><span class="mono acc">${esc(r || 'AFTER')}</span></div>
      <div class="cmp fitlist">${s.items.map((i) => i.split('|').map((x) => x.trim())).map(([a, b]) => `<div class="cmp-row"><div class="a">${esc(a)}</div><div class="b">${esc(b)}</div></div>`).join('')}</div></div>${band(s, ctx)}`;
  },

  STAT: (s, ctx) => `<div class="area ${s.mascot ? 'has-band' : ''}">
    <div class="stat-box"><div class="stat" data-fit data-max="300" data-min="150">${esc(s.stat)}</div></div>
    <div class="rule"></div>${head(s, 62, 44)}${lede(s.body)}${rows(s.items, { logos: ctx.logos })}</div>${band(s, ctx)}`,

  QUOTE: (s) => `<div class="area" style="justify-content:center"><div class="mark">&ldquo;</div>
    <div class="fit-box" style="flex:none;max-height:760px"><blockquote class="quote" data-fit data-max="96" data-min="72">${headlineHtml(s.headline)}</blockquote></div>
    ${s.body ? `<div class="attr mono">${esc(s.body)}</div>` : ''}</div>`,

  CTA: (s, ctx) => `<div class="area">
    <div class="fit-box" style="flex:none;max-height:430px"><h2 class="headline" data-fit data-max="104" data-min="64">${headlineHtml(s.headline)}</h2></div>
    ${lede(s.body)}
    ${s.items.length ? `<div class="product"><div class="mono ph">FREE STARTER PACK / WHAT'S INSIDE</div>${rows(s.items, { numbered: true, logos: ctx.logos })}</div>` : ''}
    <div class="pill-cta">${esc(ctx.cta)}</div><div class="handle mono">@${esc(ctx.handle)}</div></div>`,
};
