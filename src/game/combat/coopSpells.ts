import type { CoopFirearmId } from './coopFirearms';

export const COOP_SPELL_SLOTS = ['ember_bolt', 'soul_nova', 'rift_meteor', 'cinderhex_engine', 'astral_lance'] as const;
export type CoopSpellId = typeof COOP_SPELL_SLOTS[number];
export const MANA_MAX = 100;
export const MANA_REGEN_PER_SECOND = 14;
export const COOP_SPELLS: Record<CoopSpellId, { name: string; shortName: string; cost: number; cooldownMs: number; color: string; glyph: string; description: string }> = {
  ember_bolt: { name: 'Ember Bolt', shortName: 'EMBER', cost: 6, cooldownMs: 420, color: '#ffab5b', glyph: '✦', description: 'Hurl a blazing orb. Hold fire to cast repeatedly.' },
  soul_nova: { name: 'Soul Nova', shortName: 'NOVA', cost: 26, cooldownMs: 4200, color: '#b9a3ff', glyph: '✺', description: 'Release a radial soul wave that slows nearby enemies.' },
  rift_meteor: { name: 'Rift Meteor', shortName: 'METEOR', cost: 32, cooldownMs: 6500, color: '#ff735f', glyph: '☄', description: 'Mark the ground ahead. A meteor falls after one second.' },
  cinderhex_engine: { name: 'Cinder Curse', shortName: 'CURSE', cost: 9, cooldownMs: 700, color: '#e58aff', glyph: '◇', description: 'Curse bolts stack a burning hex. Burning kills yield soul fragments.' },
  astral_lance: { name: 'Astral Lance', shortName: 'LANCE', cost: 18, cooldownMs: 1700, color: '#81f6ff', glyph: '✧', description: 'Pierce enemies with a brilliant beam of astral energy.' },
};
export function isCoopSpell(id: string): id is CoopSpellId { return Object.hasOwn(COOP_SPELLS, id); }
export function canPredictCoopCast(id: CoopFirearmId, magazine: number, mana = 0) {
  return isCoopSpell(id) ? mana >= COOP_SPELLS[id].cost : magazine > 0;
}
