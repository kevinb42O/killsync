export type EvolutionMotif =
  | 'nova' | 'satellite' | 'prism' | 'singularity' | 'synapse'
  | 'reaper' | 'edge' | 'sonic' | 'nanite' | 'storm'
  | 'kaleidoscope' | 'genome' | 'eldritch' | 'parallel' | 'cryo' | 'meteor' | 'neural';

export interface EvolutionProfile {
  id: string;
  weaponId: string;
  motif: EvolutionMotif;
  color: number;
  accent: number;
  /** Small, weapon-specific final-form tuning. It layers on top of the base cast,
   * rather than replacing every weapon with the same generic glow projectile. */
  damageMultiplier: number;
  amountBonus: number;
  durationMultiplier: number;
}

export const EVOLUTION_PROFILES: Record<string, EvolutionProfile> = {
  supernova_cannon: { id: 'supernova_cannon', weaponId: 'plasma_gun', motif: 'nova', color: 0xff642e, accent: 0xffe09a, damageMultiplier: 1.28, amountBonus: 1, durationMultiplier: 1.1 },
  satellite_array: { id: 'satellite_array', weaponId: 'orbit_drones', motif: 'satellite', color: 0x71d6ff, accent: 0xffffff, damageMultiplier: 1.2, amountBonus: 2, durationMultiplier: 1.15 },
  prism_burst: { id: 'prism_burst', weaponId: 'neon_shards', motif: 'prism', color: 0xff5eea, accent: 0x7df9ff, damageMultiplier: 1.18, amountBonus: 2, durationMultiplier: 1 },
  black_hole: { id: 'black_hole', weaponId: 'void_aura', motif: 'singularity', color: 0x7c3aed, accent: 0xe9d5ff, damageMultiplier: 1.22, amountBonus: 0, durationMultiplier: 1.35 },
  synapse_burst: { id: 'synapse_burst', weaponId: 'neural_pulse', motif: 'synapse', color: 0xffdc4d, accent: 0xffffff, damageMultiplier: 1.2, amountBonus: 1, durationMultiplier: 1.16 },
  reaper_protocol: { id: 'reaper_protocol', weaponId: 'data_scythe', motif: 'reaper', color: 0x77ffba, accent: 0xd8ffe9, damageMultiplier: 1.24, amountBonus: 1, durationMultiplier: 1.12 },
  monomolecular_edge: { id: 'monomolecular_edge', weaponId: 'cyber_blade', motif: 'edge', color: 0x4ffcff, accent: 0xffffff, damageMultiplier: 1.3, amountBonus: 0, durationMultiplier: 1.18 },
  supersonic_pulse: { id: 'supersonic_pulse', weaponId: 'sonic_boom', motif: 'sonic', color: 0xffd34d, accent: 0xffffff, damageMultiplier: 1.18, amountBonus: 1, durationMultiplier: 1.25 },
  grey_goo: { id: 'grey_goo', weaponId: 'nano_swarm', motif: 'nanite', color: 0x52ff9a, accent: 0xd7ffe8, damageMultiplier: 1.18, amountBonus: 2, durationMultiplier: 1.3 },
  storm_nexus: { id: 'storm_nexus', weaponId: 'phantom_chain', motif: 'storm', color: 0x9aeeff, accent: 0xffffff, damageMultiplier: 1.25, amountBonus: 1, durationMultiplier: 1.12 },
  singularity: { id: 'singularity', weaponId: 'gravity_well', motif: 'singularity', color: 0xb16cff, accent: 0xf4d8ff, damageMultiplier: 1.25, amountBonus: 0, durationMultiplier: 1.45 },
  kaleidoscope: { id: 'kaleidoscope', weaponId: 'mirror_shards', motif: 'kaleidoscope', color: 0xff75c8, accent: 0x8df6ff, damageMultiplier: 1.16, amountBonus: 2, durationMultiplier: 1.2 },
  genome_breaker: { id: 'genome_breaker', weaponId: 'spectral_helix', motif: 'genome', color: 0xa3ff68, accent: 0xf1ffdd, damageMultiplier: 1.23, amountBonus: 1, durationMultiplier: 1.2 },
  eldritch_grasp: { id: 'eldritch_grasp', weaponId: 'void_tendrils', motif: 'eldritch', color: 0xbc76ff, accent: 0xffd7ff, damageMultiplier: 1.25, amountBonus: 1, durationMultiplier: 1.22 },
  supernova: { id: 'supernova', weaponId: 'solar_flare', motif: 'nova', color: 0xff7c28, accent: 0xffffba, damageMultiplier: 1.26, amountBonus: 1, durationMultiplier: 1.15 },
  parallel_self: { id: 'parallel_self', weaponId: 'quantum_echo', motif: 'parallel', color: 0x72dfff, accent: 0xffffff, damageMultiplier: 1.22, amountBonus: 1, durationMultiplier: 1.3 },
  absolute_zero: { id: 'absolute_zero', weaponId: 'frost_aura', motif: 'cryo', color: 0x83ecff, accent: 0xffffff, damageMultiplier: 1.2, amountBonus: 0, durationMultiplier: 1.4 },
  meteor_shower: { id: 'meteor_shower', weaponId: 'stardust', motif: 'meteor', color: 0xffb24f, accent: 0xffffc2, damageMultiplier: 1.28, amountBonus: 2, durationMultiplier: 1.1 },
  neural_net: { id: 'neural_net', weaponId: 'arc_weaver', motif: 'neural', color: 0x58d8ff, accent: 0xffffff, damageMultiplier: 1.22, amountBonus: 1, durationMultiplier: 1.22 },
};

export function getEvolutionProfile(evolutionId?: string): EvolutionProfile | undefined {
  return evolutionId ? EVOLUTION_PROFILES[evolutionId] : undefined;
}
