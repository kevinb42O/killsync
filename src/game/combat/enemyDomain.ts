/**
 * Pure, renderer-free rules for the enemy loop shared by solo and co-op.
 *
 * Keep this file deterministic: callers provide the random number source and
 * own entity ids, positions, UI, audio, persistence, and networking.
 */

export type EnemyType = 'basic' | 'fast' | 'tank' | 'ranged' | 'elite' | 'phantom' | 'titan';
export type EnemyVisual = 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon' | 'ghost' | 'star';
export type ItemType = 'hp' | 'coin_bronze' | 'coin_silver' | 'coin_gold' | 'coin_diamond' | 'magnet' | 'bomb' | 'data_core';
export type TreasureTier = 'rare' | 'epic' | 'legendary';

export interface EnemyDefinition {
  health: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  color: string;
  name: string;
  visual: EnemyVisual;
  role: 'pressure' | 'flanker' | 'blocker' | 'support' | 'commander' | 'ambusher' | 'boss';
  threat: number;
}

export const ENEMY_TYPES: Record<EnemyType, EnemyDefinition> = {
  basic: { health: 12, speed: 1.0, damage: 10, radius: 15, xp: 5, color: '#ff4444', name: 'Drone', visual: 'circle', role: 'pressure', threat: 1 },
  fast: { health: 50, speed: 1.4, damage: 12, radius: 14, xp: 12, color: '#ffaa00', name: 'Scout', visual: 'triangle', role: 'flanker', threat: 1.25 },
  tank: { health: 180, speed: 0.9, damage: 30, radius: 25, xp: 30, color: '#8800ff', name: 'Goliath', visual: 'square', role: 'blocker', threat: 3.5 },
  ranged: { health: 60, speed: 1.3, damage: 18, radius: 18, xp: 20, color: '#00ff88', name: 'Sniper', visual: 'diamond', role: 'support', threat: 1.6 },
  elite: { health: 500, speed: 1.2, damage: 45, radius: 35, xp: 100, color: '#ff00ff', name: 'Elite Guard', visual: 'hexagon', role: 'commander', threat: 6 },
  phantom: { health: 80, speed: 2.2, damage: 15, radius: 20, xp: 50, color: '#ffffff', name: 'Phantom', visual: 'ghost', role: 'ambusher', threat: 2.4 },
  titan: { health: 1200, speed: 0.6, damage: 55, radius: 60, xp: 500, color: '#ff0000', name: 'Titan', visual: 'star', role: 'boss', threat: 15 },
};

export type EnemyAttackKind = 'artillery' | 'shockwave' | 'lunge' | 'ambush';
export interface EnemyAttackProfile {
  kind: EnemyAttackKind;
  minRange: number;
  maxRange: number;
  radius: number;
  windupMs: number;
  cooldownMs: number;
  openingDelayMs: number;
  damageMultiplier: number;
}

/** Shared readability contract for solo and co-op. Network authority and
 * damage application remain mode-specific, but timing/range tells do not. */
export const ENEMY_ATTACK_PROFILES: Partial<Record<EnemyType, EnemyAttackProfile>> = {
  ranged: { kind: 'artillery', minRange: 180, maxRange: 760, radius: 76, windupMs: 1_000, cooldownMs: 3_300, openingDelayMs: 1_200, damageMultiplier: 1 },
  tank: { kind: 'shockwave', minRange: 0, maxRange: 170, radius: 165, windupMs: 1_100, cooldownMs: 3_400, openingDelayMs: 1_400, damageMultiplier: .87 },
  phantom: { kind: 'ambush', minRange: 150, maxRange: 620, radius: 82, windupMs: 720, cooldownMs: 4_200, openingDelayMs: 1_600, damageMultiplier: 1.35 },
  elite: { kind: 'artillery', minRange: 0, maxRange: 720, radius: 105, windupMs: 1_250, cooldownMs: 4_800, openingDelayMs: 1_800, damageMultiplier: .72 },
};

export function getEnemyAttackProfile(type: EnemyType, distance: number): EnemyAttackProfile | undefined {
  const profile = ENEMY_ATTACK_PROFILES[type];
  return profile && distance >= profile.minRange && distance <= profile.maxRange ? profile : undefined;
}

export interface EventEnemyMultipliers { health: number; damage: number; }

/** Timed bounty targets must remain killable inside their 15-second window,
 * while their artillery cannot become an untelegraphed one-shot via adaptive
 * difficulty. Both curves retain meaningful late-run scaling. */
export function bountyEnemyMultipliers(difficultyMultiplier: number, adaptiveMultiplier: number): EventEnemyMultipliers {
  const difficulty = Math.max(1, difficultyMultiplier);
  const adaptive = Math.max(1, adaptiveMultiplier);
  return {
    health: Math.min(3.4, (.75 + (difficulty - 1) * .25) * Math.min(adaptive, 1.35)),
    damage: Math.min(1.9, (.85 + (difficulty - 1) * .16) * Math.min(adaptive, 1.2)),
  };
}

export function supplyGuardMultipliers(difficultyMultiplier: number, adaptiveMultiplier: number): EventEnemyMultipliers {
  const difficulty = Math.max(1, difficultyMultiplier);
  const adaptive = Math.max(1, adaptiveMultiplier);
  return {
    health: Math.min(3, (1.5 + (difficulty - 1) * .30) * Math.min(adaptive, 1.35)),
    damage: Math.min(1.65, (.90 + (difficulty - 1) * .14) * Math.min(adaptive, 1.2)),
  };
}

export type SoloSpawnPackId = 'swarm' | 'raiders' | 'fireteam' | 'siege' | 'hunt' | 'command';
const SOLO_SPAWN_PACKS: readonly { id: SoloSpawnPackId; unlockMinutes: number; weight: number; members: readonly EnemyType[] }[] = [
  { id: 'swarm', unlockMinutes: 0, weight: 4, members: ['basic', 'basic'] },
  { id: 'swarm', unlockMinutes: 0, weight: 6, members: ['basic', 'basic', 'basic'] },
  { id: 'raiders', unlockMinutes: 2, weight: 3, members: ['fast', 'basic'] },
  { id: 'raiders', unlockMinutes: 2, weight: 3, members: ['fast', 'basic', 'basic'] },
  { id: 'fireteam', unlockMinutes: 8, weight: 3, members: ['basic', 'ranged'] },
  { id: 'fireteam', unlockMinutes: 8, weight: 3.5, members: ['basic', 'basic', 'ranged'] },
  { id: 'siege', unlockMinutes: 8, weight: 2, members: ['tank', 'ranged'] },
  { id: 'siege', unlockMinutes: 8, weight: 2.5, members: ['tank', 'basic', 'ranged'] },
  { id: 'hunt', unlockMinutes: 15, weight: 1.5, members: ['phantom', 'fast'] },
  { id: 'hunt', unlockMinutes: 15, weight: 2, members: ['phantom', 'fast', 'fast'] },
  { id: 'command', unlockMinutes: 15, weight: 1, members: ['elite', 'tank', 'ranged', 'basic'] },
] as const;

export interface SoloSpawnPack { id: SoloSpawnPackId | 'mixed'; members: EnemyType[]; }

/** Top-down can use the full perimeter. Perspective modes spawn inside a rear
 * arc, guaranteeing at least 99 degrees from the crosshair before obstacle
 * correction. Authored breach portals intentionally bypass this rule. */
export function chooseSoloSpawnBearing(random: () => number, perspective: boolean, forwardAngle: number): number {
  if (!perspective) return random() * Math.PI * 2;
  return forwardAngle + Math.PI + (random() - .5) * Math.PI * .9;
}

/** Select one coherent formation, then fill spare high-difficulty slots from
 * the weighted table. This preserves the caller's exact population budget. */
export function chooseSoloSpawnPack(random: () => number, elapsedMs: number, candidates: readonly EnemyType[], count: number): SoloSpawnPack {
  const capacity = Math.max(0, Math.trunc(count));
  if (capacity === 0 || candidates.length === 0) return { id: 'mixed', members: [] };
  const candidateSet = new Set(candidates);
  const available = SOLO_SPAWN_PACKS.filter(pack => elapsedMs >= pack.unlockMinutes * 60_000 && pack.members.length <= capacity && pack.members.every(type => candidateSet.has(type)));
  let selected = available[0];
  if (available.length) {
    const total = available.reduce((sum, pack) => sum + pack.weight, 0);
    let roll = random() * total;
    for (const pack of available) { roll -= pack.weight; if (roll <= 0) { selected = pack; break; } }
  }
  const members = selected ? [...selected.members] : [];
  while (members.length < capacity) members.push(chooseWeightedEnemy(random, candidates));
  return { id: selected?.id || 'mixed', members };
}

export const ITEM_TYPES: Record<ItemType, { color: string; value: number; weight: number; shape: string }> = {
  hp: { color: '#ff3366', value: 30, weight: 0.4, shape: 'heart' },
  coin_bronze: { color: '#cd7f32', value: 2, weight: 0.4, shape: 'circle' },
  coin_silver: { color: '#c0c0c0', value: 10, weight: 0.2, shape: 'circle' },
  coin_gold: { color: '#ffd700', value: 20, weight: 0.05, shape: 'circle' },
  coin_diamond: { color: '#b9f2ff', value: 100, weight: 0.01, shape: 'circle' },
  magnet: { color: '#00ccff', value: 1, weight: 0.1, shape: 'magnet' },
  bomb: { color: '#ff8800', value: 100, weight: 0.1, shape: 'bomb' },
  data_core: { color: '#ffffff', value: 1, weight: 0, shape: 'star' },
};

export const ENEMY_UNLOCK_MINUTES: Record<EnemyType, number> = {
  basic: 0, fast: 2, tank: 5, ranged: 8, elite: 12, phantom: 15, titan: 20,
};

export const ENEMY_SPAWN_WEIGHTS: Record<EnemyType, number> = {
  basic: 1.2, fast: 1.1, tank: 0.9, ranged: 0.85, elite: 0.5, phantom: 0.38, titan: 0.14,
};

export const ENEMY_ACTIVE_CAPS: Partial<Record<EnemyType, number>> = {
  elite: 60, phantom: 45, titan: 8,
};

export const ITEM_HOLDER_CHANCE = 0.02;
export const ITEM_HOLDER_STATS = { health: 50, speed: 0.5, damage: 0, radius: 25, xp: 0, color: '#d4a373' } as const;
export const HIT_FLASH_MS = 100;
export const BOSS_HIT_STOP_MS = 100;
export const EXPERIENCE_GEM_COLOR = '#00ff00';
export const DEFAULT_XP_BASE_REQUIREMENT = 120;
export const DEFAULT_XP_LEVEL_SCALING = 1.32;

export interface BossDefinition {
  milestoneMinutes: 2 | 5 | 10 | 20;
  name: string;
  health: number;
  speed: number;
  damagePercent: number;
  radius: number;
  xp: number;
  color: string;
}

export const BOSS_DEFINITIONS: Record<2 | 5 | 10 | 20, BossDefinition> = {
  2: { milestoneMinutes: 2, name: 'NEURAL OVERLORD', health: 3000, speed: 0.12, damagePercent: 0.25, radius: 100, xp: 2000, color: '#ff0000' },
  5: { milestoneMinutes: 5, name: 'VOID ARCHITECT', health: 12000, speed: 0.10, damagePercent: 0.35, radius: 140, xp: 5000, color: '#ff00ff' },
  10: { milestoneMinutes: 10, name: 'CYBER SENTINEL', health: 50000, speed: 0.08, damagePercent: 0.50, radius: 180, xp: 15000, color: '#00ffff' },
  20: { milestoneMinutes: 20, name: 'THE SINGULARITY', health: 200000, speed: 0.06, damagePercent: 0.50, radius: 250, xp: 50000, color: '#ffffff' },
};

export const BOSS_MILESTONES = Object.freeze([2, 5, 10, 20] as const);

export interface EnemyBalanceRules {
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  bossHealthMultiplier: number;
  bossXPRewardMultiplier: number;
  coinDropChanceBase: number;
  treasureDropChanceBase: number;
}

export interface DifficultyRules {
  timeScalePerWave: number;
  killBonusDivisor: number;
  killBonusCap: number;
}

export function calculateDifficultyMultiplier(currentWave: number, killCount: number, rules: DifficultyRules): number {
  const killBonus = Math.min(killCount / Math.max(1, rules.killBonusDivisor), rules.killBonusCap);
  const waveBonus = Math.max(0, currentWave - 1) * rules.timeScalePerWave;
  return 1 + waveBonus + killBonus;
}

export function getEnemySpawnCandidates(elapsedMs: number, activeCounts: Partial<Record<EnemyType, number>> = {}): EnemyType[] {
  const minutes = elapsedMs / 60_000;
  return (Object.keys(ENEMY_TYPES) as EnemyType[]).filter(type =>
    minutes >= ENEMY_UNLOCK_MINUTES[type] && (ENEMY_ACTIVE_CAPS[type] === undefined || (activeCounts[type] || 0) < ENEMY_ACTIVE_CAPS[type]!),
  );
}

export function chooseWeightedEnemy(random: () => number, candidates: readonly EnemyType[]): EnemyType {
  if (candidates.length === 0) return 'basic';
  const total = candidates.reduce((sum, type) => sum + ENEMY_SPAWN_WEIGHTS[type], 0);
  let roll = random() * total;
  for (const type of candidates) {
    roll -= ENEMY_SPAWN_WEIGHTS[type];
    if (roll <= 0) return type;
  }
  return candidates[candidates.length - 1];
}

export function getSpawnAttemptCount(difficultyMultiplier: number, capacity: number, random: () => number): number {
  const spawnMultiplier = 1 + (difficultyMultiplier - 1) * 0.5;
  const guaranteed = Math.floor(spawnMultiplier);
  return Math.max(0, Math.min(capacity, guaranteed + (random() < spawnMultiplier - guaranteed ? 1 : 0)));
}

export function getSpawnIntervalMs(difficultyMultiplier: number, baseIntervalMs: number, minIntervalMs: number): number {
  return Math.max(minIntervalMs, baseIntervalMs / Math.max(1, difficultyMultiplier));
}

export function getNextBossMilestone(elapsedMs: number, spawnedMilestones: ReadonlySet<number>): (2 | 5 | 10 | 20) | undefined {
  const minutes = elapsedMs / 60_000;
  return BOSS_MILESTONES.find(milestone => minutes >= milestone && !spawnedMilestones.has(milestone));
}

export interface SpawnedEnemyStats {
  type: EnemyType;
  isHolder: boolean;
  radius: number;
  health: number;
  maxHealth: number;
  color: string;
  damage: number;
  speed: number;
  experienceValue: number;
}

export function createEnemyStats(type: EnemyType, difficultyMultiplier: number, balance: Pick<EnemyBalanceRules, 'enemyHealthMultiplier' | 'enemyDamageMultiplier'>, isHolder: boolean = false): SpawnedEnemyStats {
  if (isHolder) {
    const health = ITEM_HOLDER_STATS.health * difficultyMultiplier * balance.enemyHealthMultiplier;
    return { type, isHolder: true, radius: ITEM_HOLDER_STATS.radius, health, maxHealth: health, color: ITEM_HOLDER_STATS.color, damage: 0, speed: ITEM_HOLDER_STATS.speed, experienceValue: 0 };
  }
  const definition = ENEMY_TYPES[type];
  const health = definition.health * difficultyMultiplier * balance.enemyHealthMultiplier;
  return {
    type, isHolder: false, radius: definition.radius, health, maxHealth: health, color: definition.color,
    damage: definition.damage * (1 + (difficultyMultiplier - 1) * 0.5) * balance.enemyDamageMultiplier,
    speed: definition.speed, experienceValue: definition.xp,
  };
}

export function createBossStats(milestone: 2 | 5 | 10 | 20, balance: Pick<EnemyBalanceRules, 'bossHealthMultiplier' | 'bossXPRewardMultiplier'>) {
  const definition = BOSS_DEFINITIONS[milestone];
  const health = definition.health * balance.bossHealthMultiplier;
  return { ...definition, health, maxHealth: health, experienceValue: definition.xp * balance.bossXPRewardMultiplier };
}

/** The production run-level formula. Account XP is intentionally separate. */
export function getRunXPRequired(level: number, baseRequirement: number = DEFAULT_XP_BASE_REQUIREMENT, levelScaling: number = DEFAULT_XP_LEVEL_SCALING): number {
  return Math.floor(baseRequirement * Math.pow(levelScaling, Math.max(0, level - 1)));
}

/** Guaranteed death rewards, independent of luck and random-drop tables. */
export function getGuaranteedEnemyDrop(type: EnemyType | 'boss'): ItemType | undefined {
  return type === 'elite' || type === 'titan' || type === 'boss' ? 'data_core' : undefined;
}

export type CoinDropType = Extract<ItemType, `coin_${string}`>;

export function rollCoinDrop(type: EnemyType | 'boss', luck: number, coinDropChanceBase: number, random: () => number): CoinDropType | undefined {
  if (type === 'boss') return 'coin_diamond';
  if (type === 'titan') return 'coin_gold';
  if (type === 'elite') return random() < 0.3 ? 'coin_gold' : 'coin_silver';
  if (random() >= coinDropChanceBase * luck) return undefined;
  if (type === 'tank') return 'coin_silver';
  if (type === 'fast' || type === 'ranged' || type === 'phantom') return random() < 0.2 ? 'coin_silver' : 'coin_bronze';
  return 'coin_bronze';
}

export const COOP_HEART_DROP_RATES: Record<EnemyType | 'boss', number> = {
  boss: 1.0,
  titan: 1.0,
  elite: 0.25,
  tank: 0.045,
  phantom: 0.04,
  basic: 0.018,
  fast: 0.018,
  ranged: 0.018,
};

export interface CoopHeartDropOptions {
  playerInjured?: boolean;
  activeHeartsCount?: number;
  killsSinceLastHeartDrop?: number;
}

export function rollCoopHeartDrop(
  type: EnemyType | 'boss',
  random: () => number,
  options: CoopHeartDropOptions = {}
): boolean {
  if (type === 'boss' || type === 'titan') return true;
  const { playerInjured = false, activeHeartsCount = 0, killsSinceLastHeartDrop = 0 } = options;
  if (activeHeartsCount >= 4) return false;
  if (playerInjured && killsSinceLastHeartDrop >= 85) return true;

  let baseRate = COOP_HEART_DROP_RATES[type] ?? 0.018;
  if (playerInjured) baseRate *= 1.4;
  if (activeHeartsCount >= 2) baseRate *= 0.25;

  return random() < baseRate;
}

export function rollHolderItem(random: () => number): ItemType {
  const weighted = (Object.keys(ITEM_TYPES) as ItemType[]).filter(type => ITEM_TYPES[type].weight > 0);
  const total = weighted.reduce((sum, type) => sum + ITEM_TYPES[type].weight, 0);
  let roll = Math.max(0, Math.min(.999999999, random())) * total;
  for (const type of weighted) {
    roll -= ITEM_TYPES[type].weight;
    if (roll <= 0) return type;
  }
  return weighted[weighted.length - 1] || 'hp';
}

export function rollTreasureTier(elapsedMs: number, random: () => number): TreasureTier {
  const legendaryChance = 0.05 + (elapsedMs / 600_000) * 0.15;
  const epicChance = 0.20 + (elapsedMs / 600_000) * 0.20;
  const roll = random();
  return roll < legendaryChance ? 'legendary' : roll < legendaryChance + epicChance ? 'epic' : 'rare';
}

export function getTreasureColor(tier: TreasureTier): string {
  return { rare: '#ffd700', epic: '#a855f7', legendary: '#ff6600' }[tier];
}

export function shouldDropTreasure(activeTreasureCount: number, maxActiveTreasures: number, luck: number, treasureDropChanceBase: number, random: () => number): boolean {
  return activeTreasureCount < maxActiveTreasures && random() < treasureDropChanceBase * luck;
}

export interface DamageRuleInput {
  baseDamage: number;
  enemyType: EnemyType | 'boss';
  bossDamageMultiplier: number;
  doubleStrike: boolean;
  doubleStrikeChance: number;
  executeLevel: number;
  luck: number;
  enemyHealth: number;
  random: () => number;
}

export interface DamageRuleResult { damage: number; critical: boolean; executed: boolean; }

export function resolveEnemyDamage(input: DamageRuleInput): DamageRuleResult {
  let damage = (input.enemyType === 'boss' || input.enemyType === 'titan') ? input.baseDamage * input.bossDamageMultiplier : input.baseDamage;
  let critical = false;
  let executed = false;
  if (input.doubleStrike && input.random() < input.doubleStrikeChance) { damage *= 2; critical = true; }
  if (input.executeLevel > 0 && input.enemyType !== 'boss' && input.enemyType !== 'titan' && input.random() < 0.015 * input.executeLevel * input.luck) {
    damage = input.enemyHealth;
    executed = true;
  }
  return { damage, critical, executed };
}

export type PickupEffect =
  | { kind: 'heal'; amount: number }
  | { kind: 'coins'; amount: number }
  | { kind: 'magnet' }
  | { kind: 'bomb'; damage: number }
  | { kind: 'data_core'; amount: number };

export function getPickupEffect(type: ItemType, value: number = ITEM_TYPES[type].value): PickupEffect {
  if (type === 'hp') return { kind: 'heal', amount: value };
  if (type.startsWith('coin_')) return { kind: 'coins', amount: value };
  if (type === 'magnet') return { kind: 'magnet' };
  if (type === 'bomb') return { kind: 'bomb', damage: value };
  return { kind: 'data_core', amount: value };
}
