// Original parametric mascot: a chunky 8-point asterisk who is always sure the
// plan is working, and is usually wrong. Returns an SVG string.
//
//   mascot({ pose: 'smug', size: 400 })
//
// Colours default to the brand tokens; pass CSS vars (e.g. 'var(--accent)')
// when embedding in a template so the dark variant applies.

export const POSES = ['flex', 'smug', 'shades', 'sweat', 'faceplant', 'victory'];
export const CONFIDENT_POSES = ['flex', 'smug', 'shades', 'victory'];
export const REALITY_POSES = ['sweat', 'faceplant'];

const VB_W = 240;
const VB_H = 260;
const C = { x: 120, y: 120 }; // body centre
const ARM_LEN = 90;           // lobe radius from centre
const ARM_W = 34;             // lobe thickness
const HUB_R = 40;             // round hub that carries the face
const OUTLINE = 3.5;          // ink outline width (half of the under-stroke)
const LIMB = 15;              // limb thickness

const SHOULDER_L = [94, 138];
const SHOULDER_R = [146, 138];
const HIP_L = [104, 152];
const HIP_R = [136, 152];

function path(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
}

// A limb drawn as an ink under-stroke with an accent stroke on top, so it gets
// the same outline weight as the body.
function limb(points, c, end) {
  const d = path(points);
  const [ex, ey] = points[points.length - 1];
  let out =
    `<path d="${d}" fill="none" stroke="${c.ink}" stroke-width="${LIMB + OUTLINE * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${c.accent}" stroke-width="${LIMB}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (end === 'fist') {
    out += `<circle cx="${ex}" cy="${ey}" r="11" fill="${c.accent}" stroke="${c.ink}" stroke-width="${OUTLINE}"/>`;
  }
  return out;
}

// Leg = hip -> ankle, then a short foot pointing outward.
function leg(hip, ankle, dir, c) {
  const foot = [ankle[0] + 14 * dir, ankle[1] + 2];
  return limb([hip, ankle, foot], c);
}

function body(c) {
  const rects = [0, 45, 90, 135]
    .map(
      (a) =>
        `<rect x="${C.x - ARM_LEN}" y="${C.y - ARM_W / 2}" width="${ARM_LEN * 2}" height="${ARM_W}" rx="${ARM_W / 2}" transform="rotate(${a} ${C.x} ${C.y})"`
    )
    .concat(`<circle cx="${C.x}" cy="${C.y}" r="${HUB_R}"`);
  // Under-strokes first, then fills on top: leaves an outline around the union only.
  return (
    rects.map((r) => `${r} fill="${c.ink}" stroke="${c.ink}" stroke-width="${OUTLINE * 2}" stroke-linejoin="round"/>`).join('') +
    rects.map((r) => `${r} fill="${c.accent}"/>`).join('')
  );
}

const EYE_L = [107, 112];
const EYE_R = [133, 112];

function dotEyes(c, r = 6) {
  return [EYE_L, EYE_R].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.ink}"/>`).join('');
}

function stroke(d, c, w = OUTLINE) {
  return `<path d="${d}" fill="none" stroke="${c.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const FACES = {
  // Determined grin, brows down at the middle.
  flex: (c) =>
    dotEyes(c) +
    stroke('M98 99 L114 103', c) +
    stroke('M142 99 L126 103', c) +
    stroke('M108 128 Q120 140 132 128', c),

  // Half-lidded eyes, one brow cocked, lopsided smirk.
  smug: (c) =>
    [EYE_L, EYE_R]
      .map(([x, y]) => `<path d="M${x - 7} ${y} A7 7 0 0 0 ${x + 7} ${y} Z" fill="${c.ink}"/>`)
      .join('') +
    stroke(`M${EYE_L[0] - 8} ${EYE_L[1] - 1} L${EYE_L[0] + 8} ${EYE_L[1] - 1}`, c) +
    stroke(`M${EYE_R[0] - 8} ${EYE_R[1] - 1} L${EYE_R[0] + 8} ${EYE_R[1] - 1}`, c) +
    stroke('M99 100 L114 101', c) +
    stroke('M126 97 Q133 91 141 95', c) +
    stroke('M110 132 Q124 136 134 125', c),

  // Shades and a wide grin.
  shades: (c) =>
    `<rect x="95" y="104" width="23" height="15" rx="5" fill="${c.ink}"/>` +
    `<rect x="122" y="104" width="23" height="15" rx="5" fill="${c.ink}"/>` +
    stroke('M118 108 L122 108', c) +
    stroke('M92 107 L95 107', c) +
    stroke('M145 107 L148 107', c) +
    `<path d="M100 108 L105 108" stroke="${c.bg}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M127 108 L132 108" stroke="${c.bg}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M106 128 Q120 142 134 128 Z" fill="${c.ink}" stroke="${c.ink}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>`,

  // Wide eyes, worried brows, wobbly mouth.
  sweat: (c) =>
    [EYE_L, EYE_R]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5" fill="${c.ink}"/><circle cx="${x + 2.5}" cy="${y - 2.5}" r="2" fill="${c.bg}"/>`)
      .join('') +
    stroke('M99 101 L113 96', c) +
    stroke('M141 101 L127 96', c) +
    stroke('M107 132 Q111 127 115 132 Q119 137 123 132 Q127 127 131 132', c),

  // Dazed X eyes and an open mouth.
  faceplant: (c) =>
    [EYE_L, EYE_R]
      .map(([x, y]) => stroke(`M${x - 6} ${y - 6} L${x + 6} ${y + 6} M${x + 6} ${y - 6} L${x - 6} ${y + 6}`, c))
      .join('') +
    `<ellipse cx="120" cy="132" rx="7" ry="5" fill="${c.ink}"/>`,

  // Eyes squeezed shut with joy, big open grin.
  victory: (c) =>
    stroke(`M${EYE_L[0] - 7} ${EYE_L[1] + 2} Q${EYE_L[0]} ${EYE_L[1] - 8} ${EYE_L[0] + 7} ${EYE_L[1] + 2}`, c) +
    stroke(`M${EYE_R[0] - 7} ${EYE_R[1] + 2} Q${EYE_R[0]} ${EYE_R[1] - 8} ${EYE_R[0] + 7} ${EYE_R[1] + 2}`, c) +
    `<path d="M104 125 L136 125 Q136 144 120 144 Q104 144 104 125 Z" fill="${c.ink}" stroke="${c.ink}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>`,
};

const LIMBS = {
  flex: (c) =>
    limb([SHOULDER_L, [50, 156], [72, 178]], c) + // hand on hip
    limb([SHOULDER_R, [212, 160], [220, 102]], c, 'fist') + // flexed arm
    leg(HIP_L, [88, 228], -1, c) +
    leg(HIP_R, [152, 228], 1, c),

  smug: (c) =>
    limb([SHOULDER_L, [46, 158], [70, 180]], c) +
    limb([SHOULDER_R, [194, 158], [170, 180]], c) +
    leg(HIP_L, [92, 228], -1, c) +
    leg(HIP_R, [148, 228], 1, c),

  shades: (c) =>
    limb([SHOULDER_L, [50, 156], [72, 178]], c) +
    limb([SHOULDER_R, [204, 150], [226, 128]], c, 'fist') + // point at you
    leg(HIP_L, [90, 228], -1, c) +
    leg(HIP_R, [150, 228], 1, c),

  sweat: (c) =>
    limb([SHOULDER_L, [66, 176], [58, 200]], c) +
    limb([SHOULDER_R, [174, 176], [182, 200]], c) +
    limb([HIP_L, [114, 204], [98, 232], [84, 234]], c) + // knock-kneed
    limb([HIP_R, [126, 204], [142, 232], [156, 234]], c),

  faceplant: (c) =>
    limb([SHOULDER_L, [46, 150], [30, 128]], c) +
    limb([SHOULDER_R, [194, 150], [210, 128]], c) +
    leg(HIP_L, [94, 226], -1, c) +
    leg(HIP_R, [146, 226], 1, c),

  victory: (c) =>
    limb([SHOULDER_L, [26, 34]], c, 'fist') +
    limb([SHOULDER_R, [214, 34]], c, 'fist') +
    leg(HIP_L, [88, 228], -1, c) +
    leg(HIP_R, [152, 228], 1, c),
};

const EXTRAS = {
  sweat: (c) =>
    [[176, 62, 1.5], [196, 92, 1.1], [56, 72, 1.2]]
      .map(
        ([x, y, s]) =>
          `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 Q9 2 0 8 Q-9 2 0 -12 Z" fill="${c.bg}" stroke="${c.ink}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>`
      )
      .join(''),
  victory: (c) =>
    stroke('M8 20 L0 14 M12 6 L8 -2 M30 6 L32 -2', c, 3) +
    stroke('M232 20 L240 14 M228 6 L232 -2 M210 6 L208 -2', c, 3),
};

// In faceplant the whole figure is tipped forward into the ground.
const FIGURE_TRANSFORM = {
  faceplant: `translate(0 42) rotate(162 ${C.x} ${C.y})`,
};
const GROUND = {
  faceplant: (c) =>
    `<path d="M10 ${VB_H - 4} L${VB_W - 10} ${VB_H - 4}" stroke="${c.ink}" stroke-width="1"/>` +
    stroke(`M36 ${VB_H - 18} L24 ${VB_H - 24} M40 ${VB_H - 30} L32 ${VB_H - 40}`, c, 3) +
    stroke(`M204 ${VB_H - 18} L216 ${VB_H - 24} M200 ${VB_H - 30} L208 ${VB_H - 40}`, c, 3),
};

export function mascot({
  pose = 'smug',
  size = 400,
  accent = '#E8350A',
  ink = '#141414',
  bg = '#F2F0EB',
} = {}) {
  if (!POSES.includes(pose)) throw new Error(`Unknown mascot pose: ${pose}`);
  const c = { accent, ink, bg };
  const figure = LIMBS[pose](c) + body(c) + FACES[pose](c);
  const transform = FIGURE_TRANSFORM[pose];
  const height = Math.round((size * VB_H) / VB_W);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 ${VB_W + 24} ${VB_H + 24}" width="${size}" height="${height}" role="img" aria-label="mascot ${pose}" style="overflow:visible">` +
    (GROUND[pose] ? GROUND[pose](c) : '') +
    (transform ? `<g transform="${transform}">${figure}</g>` : figure) +
    (EXTRAS[pose] ? EXTRAS[pose](c) : '') +
    `</svg>`
  );
}

// Suggested confident -> reality pairing for consecutive slides.
export function posePair(seed = 0) {
  return [CONFIDENT_POSES[seed % CONFIDENT_POSES.length], REALITY_POSES[seed % REALITY_POSES.length]];
}
