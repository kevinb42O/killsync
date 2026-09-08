import type { CoopFirearmId } from '../combat/coopFirearms';
import { COOP_SKIN_IDS, DEFAULT_COOP_SKIN_ID, normalizeCoopSkinId, type CoopSkinId } from './CoopSkins';

export const COOP_OPERATOR_IDS = COOP_SKIN_IDS;
export type CoopOperatorId = typeof COOP_OPERATOR_IDS[number];

export type CoopArtifactResource = 'static' | 'fury' | 'echo_seals' | 'conviction' | 'rime' | 'soul_fragments';

export interface CoopOperatorDefinition {
  id: CoopOperatorId;
  name: string;
  className: string;
  role: string;
  defaultSkinId: CoopSkinId;
  signatureWeaponId: CoopFirearmId;
  resource: CoopArtifactResource;
  resourceLabel: string;
  resourceMax: number;
  primaryDescription: string;
  spenderName: string;
  spenderDescription: string;
  /** Minimum class resource required before the RMB spender can activate. */
  spenderCost: number;
  passiveName: string;
  passiveDescription: string;
  color: string;
}

export const COOP_OPERATOR_DEFINITIONS: readonly CoopOperatorDefinition[] = Object.freeze([
  { id: 'neon_vanguard', name: 'Neon Vanguard', className: 'Stormcaller', role: 'Immediate area damage', defaultSkinId: 'neon_vanguard', signatureWeaponId: 'arc_launcher', resource: 'static', resourceLabel: 'Static', resourceMax: 5, primaryDescription: 'Lightning chains through clustered enemies.', spenderName: 'Stormcall', spenderDescription: 'Spend 5 Static to mark a storm zone that strikes three times.', spenderCost: 5, passiveName: 'Overload', passiveDescription: 'Three maximum chains prime a stronger next bolt.', color: '#60a5fa' },
  { id: 'crimson_strike', name: 'Crimson Strike', className: 'Bloodreaver', role: 'Execute and bruiser damage', defaultSkinId: 'crimson_strike', signatureWeaponId: 'goreline_repeater', resource: 'fury', resourceLabel: 'Fury', resourceMax: 100, primaryDescription: 'A brutal repeater that builds extra Fury against wounded prey.', spenderName: 'Reckoning', spenderDescription: 'Spend 50 Fury on a five-round execute volley.', spenderCost: 50, passiveName: 'Redline', passiveDescription: 'Goreline fires 20% faster below 45% health.', color: '#fb7185' },
  { id: 'void_runner', name: 'Void Runner', className: 'Riftstrider', role: 'Mobile combo damage', defaultSkinId: 'void_runner', signatureWeaponId: 'riftspike_array', resource: 'echo_seals', resourceLabel: 'Echo Seals', resourceMax: 5, primaryDescription: 'Pin one target with seals; movement can double seal gain.', spenderName: 'Echo Collapse', spenderDescription: 'Consume every seal to fire echoes from your recent path.', spenderCost: 1, passiveName: 'Slipstream', passiveDescription: 'Crossing 120 units before a hit grants an extra seal.', color: '#c084fc' },
  { id: 'solar_guard', name: 'Solar Guard', className: 'Sunwarden', role: 'Protection and threat control', defaultSkinId: 'solar_guard', signatureWeaponId: 'dawnwall_cannon', resource: 'conviction', resourceLabel: 'Conviction', resourceMax: 5, primaryDescription: 'Sustained hits build Conviction, faster while protecting an ally.', spenderName: 'Dawnwall', spenderDescription: 'Spend 5 Conviction on a barrier field that taunts and burns.', spenderCost: 5, passiveName: 'Stand Together', passiveDescription: 'Reload 20% faster near a living squadmate.', color: '#fbbf24' },
  { id: 'black_ice', name: 'Black Ice', className: 'Cryowarden', role: 'Control and shatter damage', defaultSkinId: 'black_ice', signatureWeaponId: 'winterglass_projector', resource: 'rime', resourceLabel: 'Rime', resourceMax: 5, primaryDescription: 'A close frost cone stacks Chill and briefly roots ordinary enemies.', spenderName: 'Shatter Lance', spenderDescription: 'Spend 3 Rime to shatter a target and burst fully chilled packs.', spenderCost: 3, passiveName: 'Deep Freeze', passiveDescription: 'Shattering three frozen targets refunds 1 Rime.', color: '#7dd3fc' },
  { id: 'royal_inferno', name: 'Royal Inferno', className: 'Hellbinder', role: 'Damage over time and chain reactions', defaultSkinId: 'royal_inferno', signatureWeaponId: 'cinderhex_engine', resource: 'soul_fragments', resourceLabel: 'Soul Fragments', resourceMax: 5, primaryDescription: 'Rounds stack a burning hex; burning kills yield fragments.', spenderName: 'Hellseed', spenderDescription: 'Spend 3 fragments on a delayed blast, or 5 to summon an Emberling.', spenderCost: 3, passiveName: 'Soulburn', passiveDescription: 'Elite and titan burn damage can forge extra fragments.', color: '#fb923c' },
]);

export const COOP_OPERATOR_BY_ID = Object.freeze(Object.fromEntries(
  COOP_OPERATOR_DEFINITIONS.map(operator => [operator.id, operator]),
) as Record<CoopOperatorId, CoopOperatorDefinition>);

export function normalizeCoopOperatorId(value: unknown, legacySkinId?: unknown): CoopOperatorId {
  if (typeof value === 'string' && value in COOP_OPERATOR_BY_ID) return value as CoopOperatorId;
  const migrated = normalizeCoopSkinId(legacySkinId);
  return COOP_OPERATOR_BY_ID[migrated] ? migrated : DEFAULT_COOP_SKIN_ID;
}

export function getCoopOperator(value: unknown, legacySkinId?: unknown) {
  return COOP_OPERATOR_BY_ID[normalizeCoopOperatorId(value, legacySkinId)];
}

export function isCoopArtifactSpenderCharged(operatorId: unknown, resource: number | undefined) {
  return Math.max(0, resource || 0) >= getCoopOperator(operatorId).spenderCost;
}
