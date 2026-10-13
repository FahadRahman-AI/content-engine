export const PILLARS = ['TOOL', 'SAVEABLE', 'TEARDOWN', 'HABITS', 'TESTED'];
export const COVER_TYPES = ['COVER_TYPE', 'COVER_GRADIENT', 'COVER_MASCOT'];
export const INNER_TYPES = ['STEP', 'STAT', 'LIST', 'COMPARE', 'QUOTE', 'TOOLS', 'MATRIX'];
// Inner slide types that must carry real substance (3+ items, 35+ words).
export const DENSE_TYPES = ['STEP', 'LIST', 'COMPARE', 'TOOLS', 'MATRIX'];
export const SLIDE_TYPES = [...COVER_TYPES, ...INNER_TYPES, 'CTA'];

export const CTA_TEXT = {
  starter: 'Free starter pack, link in bio →',
  launch: 'DM LAUNCH',
};

export const BANNED_WORDS = ['amazing', 'revolutionary', 'game-changer', 'leverage', 'synergy', 'unlock', 'elevate'];

export const TZ = 'Europe/London';
