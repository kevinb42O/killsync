/** Safe, readable support powers selected for the first co-op release.  They
 * are intentionally separate from manual firearms: every active shot remains
 * under player control while these modules give each squad member a role. */
export type CoopPassiveModuleId = 'orbit_drones' | 'data_scythe' | 'void_aura' | 'frost_aura' | 'neural_pulse';

export interface CoopPassiveDefinition {
  id: CoopPassiveModuleId;
  name: string;
  description: string;
  color: string;
  purchaseCost: number;
  maxRank: 3;
  kind: 'orbit' | 'aura' | 'pulse';
}

export interface CoopPassiveRuntime { id: CoopPassiveModuleId; rank: number; nextTriggerAtMs: number; }
export interface CoopPassiveSnapshot { id: CoopPassiveModuleId; rank: number; }

export const COOP_PASSIVE_MODULES: readonly CoopPassiveDefinition[] = Object.freeze([
  { id: 'orbit_drones', name: 'Orbit Drones', description: 'Two drones shred enemies that get too close.', color: '#fb923c', purchaseCost: 520, maxRank: 3, kind: 'orbit' },
  { id: 'data_scythe', name: 'Data Scythe', description: 'A rotating blade clears a path through the swarm.', color: '#f97316', purchaseCost: 500, maxRank: 3, kind: 'orbit' },
  { id: 'void_aura', name: 'Void Aura', description: 'A damaging field protects your personal space.', color: '#a855f7', purchaseCost: 480, maxRank: 3, kind: 'aura' },
  { id: 'frost_aura', name: 'Frost Aura', description: 'Slow nearby enemies so the squad can pick them apart.', color: '#67e8f9', purchaseCost: 560, maxRank: 3, kind: 'aura' },
  { id: 'neural_pulse', name: 'Neural Pulse', description: 'Periodic shockwaves rescue a collapsing holdout.', color: '#facc15', purchaseCost: 540, maxRank: 3, kind: 'pulse' },
]);

export const COOP_PASSIVE_BY_ID: Readonly<Record<CoopPassiveModuleId, CoopPassiveDefinition>> = Object.freeze(
  Object.fromEntries(COOP_PASSIVE_MODULES.map(module => [module.id, module])) as Record<CoopPassiveModuleId, CoopPassiveDefinition>,
);

export function passiveRankCost(id: CoopPassiveModuleId, currentRank: number) {
  return Math.round(COOP_PASSIVE_BY_ID[id].purchaseCost * (currentRank === 1 ? .62 : 1.05));
}

export function passiveRadius(id: CoopPassiveModuleId, rank: number) {
  const r = Math.max(1, rank);
  if (id === 'orbit_drones') return 78 + (r - 1) * 14;
  if (id === 'data_scythe') return 64 + (r - 1) * 16;
  if (id === 'neural_pulse') return 150 + (r - 1) * 45;
  return (id === 'void_aura' ? 130 : 165) + (r - 1) * 28;
}

export function passiveDamage(id: CoopPassiveModuleId, rank: number) {
  const r = Math.max(1, rank);
  const base = id === 'orbit_drones' ? 11 : id === 'data_scythe' ? 16 : id === 'void_aura' ? 12 : id === 'frost_aura' ? 9 : 38;
  return base * (1 + .42 * (r - 1));
}

export function passiveCooldownMs(id: CoopPassiveModuleId, rank: number) {
  const r = Math.max(1, rank);
  if (id === 'neural_pulse') return Math.max(1_850, 4_300 - (r - 1) * 700);
  return id === 'orbit_drones' || id === 'data_scythe' ? 180 : 480;
}
