import { COVER_TYPES } from './constants.js';

export const ORDER = ['TOOL', 'SAVEABLE', 'TEARDOWN', 'HABITS', 'TESTED'];
export const HOOK_STYLES = ['self-roast', 'how-to', 'curiosity', 'checklist', 'contrarian', 'number'];
export const SLIDE_COUNTS = [6, 7, 8];
export const EXPLORE_RATE = 0.3;

// recentPillars: most recent first. Returns { pillar, fellBack, generalHabits }.
export function pickPillar({ recentPillars, unusedNoteCount, noNotesMode }) {
  const last = recentPillars[0];
  let pillar = ORDER[(ORDER.indexOf(last) + 1) % ORDER.length]; // indexOf -1 -> TOOL
  let fellBack = false;
  const needsNote = pillar === 'TESTED' || pillar === 'TEARDOWN';
  if (needsNote && (noNotesMode || unusedNoteCount === 0)) {
    // Fall back to whichever of TOOL / SAVEABLE ran least recently.
    const age = (p) => {
      const i = recentPillars.indexOf(p);
      return i === -1 ? Infinity : i;
    };
    pillar = age('TOOL') >= age('SAVEABLE') ? 'TOOL' : 'SAVEABLE';
    fellBack = true;
  }
  return { pillar, fellBack, generalHabits: noNotesMode && pillar === 'HABITS' };
}

// 3 of every 4 posts push the starter pack; every 4th is DM LAUNCH.
export function pickCta(priorPostCount) {
  return priorPostCount % 4 === 3 ? 'launch' : 'starter';
}

function leastRecent(options, recent) {
  const age = (o) => {
    const i = recent.indexOf(o);
    return i === -1 ? Infinity : i;
  };
  return [...options].sort((a, b) => age(b) - age(a))[0];
}

// recentVariants: most recent first. best: optional { cover_type, hook_style, slide_count }
// from the learning system. 70% exploit the base; 30% vary exactly one dimension.
export function chooseVariant({ recentVariants = [], best = null, rng = Math.random }) {
  const yesterdayCover = recentVariants[0]?.cover_type;
  const base = {
    cover_type: best?.cover_type ?? leastRecent(COVER_TYPES, recentVariants.map((v) => v.cover_type)),
    hook_style: best?.hook_style ?? leastRecent(HOOK_STYLES, recentVariants.map((v) => v.hook_style)),
    slide_count: best?.slide_count ?? 7,
  };
  const variant = { ...base };
  let experiment = null;

  // The cover type changes day to day, so yesterday's cover is never an option.
  const covers = COVER_TYPES.filter((c) => c !== yesterdayCover);
  const coverChangedByRule = variant.cover_type === yesterdayCover;
  if (coverChangedByRule) variant.cover_type = covers[Math.floor(rng() * covers.length)];

  if (rng() < EXPLORE_RATE) {
    const options = { cover_type: covers, hook_style: HOOK_STYLES, slide_count: SLIDE_COUNTS };
    const dims = Object.keys(options);
    const dim = dims[Math.floor(rng() * dims.length)];
    const alts = options[dim].filter((o) => o !== variant[dim]);
    // If the cover was already moved by the day-to-day rule, a second moved dimension isn't a clean test.
    if (alts.length && !(coverChangedByRule && dim !== 'cover_type')) {
      variant[dim] = alts[Math.floor(rng() * alts.length)];
      experiment = dim;
    }
  }
  return { variant, experiment };
}
