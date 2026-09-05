import { describe, expect, it } from 'vitest';
import {
  BOSS_DEFINITIONS,
  bountyEnemyMultipliers,
  ENEMY_TYPES,
  ENEMY_ATTACK_PROFILES,
  calculateDifficultyMultiplier,
  chooseSoloSpawnPack,
  chooseSoloSpawnBearing,
  chooseWeightedEnemy,
  createBossStats,
  createEnemyStats,
  getEnemySpawnCandidates,
  getEnemyAttackProfile,
  getNextBossMilestone,
  getGuaranteedEnemyDrop,
  getPickupEffect,
  getRunXPRequired,
  getSpawnAttemptCount,
  getSpawnIntervalMs,
  rollCoinDrop,
  rollHolderItem,
  rollTreasureTier,
  shouldDropTreasure,
  supplyGuardMultipliers,
  resolveEnemyDamage,
} from './enemyDomain';

describe('enemy domain', () => {
  it('keeps the production enemy archetypes in one reusable definition table', () => {
    expect(ENEMY_TYPES).toMatchObject({
      basic: { health: 12, speed: 1, damage: 10, radius: 15, xp: 5, color: '#ff4444' },
      fast: { health: 50, speed: 1.4, damage: 12, radius: 14, xp: 12 },
      tank: { health: 180, speed: 0.9, damage: 30, radius: 25, xp: 30 },
      ranged: { health: 60, speed: 1.3, damage: 18, radius: 18, xp: 20 },
      elite: { health: 500, speed: 1.2, damage: 45, radius: 35, xp: 100 },
      phantom: { health: 80, speed: 2.2, damage: 15, radius: 20, xp: 50 },
      titan: { health: 1200, speed: 0.6, damage: 55, radius: 60, xp: 500 },
    });
  });

  it('uses the same wave and kill difficulty calculation as the production engine', () => {
    expect(calculateDifficultyMultiplier(1, 0, { timeScalePerWave: 0.15, killBonusDivisor: 2000, killBonusCap: 0.5 })).toBe(1);
    expect(calculateDifficultyMultiplier(4, 1000, { timeScalePerWave: 0.15, killBonusDivisor: 2000, killBonusCap: 0.5 })).toBeCloseTo(1.95);
    expect(calculateDifficultyMultiplier(1, 999_999, { timeScalePerWave: 0.15, killBonusDivisor: 2000, killBonusCap: 0.5 })).toBe(1.5);
  });

  it('unlocks and caps the exact enemy roster by elapsed match time', () => {
    expect(getEnemySpawnCandidates(0)).toEqual(['basic']);
    expect(getEnemySpawnCandidates(12 * 60_000)).toContain('elite');
    expect(getEnemySpawnCandidates(20 * 60_000, { titan: 8, elite: 60, phantom: 45 })).not.toContain('titan');
    expect(getEnemySpawnCandidates(20 * 60_000, { titan: 8, elite: 60, phantom: 45 })).not.toContain('elite');
    expect(getEnemySpawnCandidates(20 * 60_000, { titan: 8, elite: 60, phantom: 45 })).not.toContain('phantom');
  });

  it('selects weighted spawns and difficulty-scaled stats deterministically from supplied randomness', () => {
    expect(chooseWeightedEnemy(() => 0, ['basic', 'fast'])).toBe('basic');
    expect(chooseWeightedEnemy(() => 0.9999, ['basic', 'fast'])).toBe('fast');
    expect(getSpawnAttemptCount(2.5, 10, () => 0.49)).toBe(2);
    expect(getSpawnAttemptCount(2.5, 10, () => 0.8)).toBe(1);
    expect(getSpawnIntervalMs(4, 400, 60)).toBe(100);
    expect(getSpawnIntervalMs(10, 400, 60)).toBe(60);

    const tank = createEnemyStats('tank', 2, { enemyHealthMultiplier: 1.25, enemyDamageMultiplier: 1.1 });
    expect(tank).toMatchObject({ health: 450, maxHealth: 450, radius: 25, experienceValue: 30 });
    expect(tank.damage).toBeCloseTo(49.5);
    expect(createEnemyStats('basic', 2, { enemyHealthMultiplier: 1, enemyDamageMultiplier: 1 }, true)).toMatchObject({
      isHolder: true, health: 100, damage: 0, speed: 0.5, experienceValue: 0,
    });
  });

  it('builds authored solo formations without exceeding the spawn budget', () => {
    expect(chooseSoloSpawnPack(() => 0, 0, ['basic'], 3)).toEqual({ id: 'swarm', members: ['basic', 'basic', 'basic'] });
    const fireteam = chooseSoloSpawnPack(() => .55, 8 * 60_000, ['basic', 'fast', 'tank', 'ranged'], 3);
    expect(fireteam.members).toHaveLength(3);
    expect(fireteam.members.every(type => ['basic', 'fast', 'tank', 'ranged'].includes(type))).toBe(true);
    expect(chooseSoloSpawnPack(() => 0, 0, ['basic'], 0).members).toEqual([]);
  });

  it('keeps ordinary perspective spawns outside the forward view cone', () => {
    expect(chooseSoloSpawnBearing(() => .25, false, 1)).toBeCloseTo(Math.PI / 2);
    for (const roll of [0, .25, .5, .75, 1]) {
      const forward = -.7;
      const bearing = chooseSoloSpawnBearing(() => roll, true, forward);
      const angularDelta = Math.acos(Math.cos(bearing - forward));
      expect(angularDelta).toBeGreaterThanOrEqual(Math.PI * .55 - 0.0001);
    }
  });

  it('keeps every special attack reactable and bounded by its authored range', () => {
    for (const [type, profile] of Object.entries(ENEMY_ATTACK_PROFILES)) {
      expect(profile!.windupMs, `${type} windup`).toBeGreaterThanOrEqual(480);
      expect(profile!.cooldownMs, `${type} cooldown`).toBeGreaterThan(profile!.windupMs);
      expect(profile!.radius, `${type} radius`).toBeGreaterThan(0);
      expect(profile!.maxRange, `${type} range`).toBeGreaterThanOrEqual(profile!.minRange);
      expect(ENEMY_TYPES[type as keyof typeof ENEMY_TYPES].damage * profile!.damageMultiplier, `${type} burst`).toBeLessThanOrEqual(33);
    }
    expect(getEnemyAttackProfile('ranged', 400)?.kind).toBe('artillery');
    expect(getEnemyAttackProfile('ranged', 100)).toBeUndefined();
    expect(getEnemyAttackProfile('basic', 100)).toBeUndefined();
  });

  it('keeps timed event enemies killable and prevents adaptive one-shots', () => {
    const earlyBounty = bountyEnemyMultipliers(1.5, 1);
    expect(ENEMY_TYPES.elite.health * earlyBounty.health).toBeLessThan(450);
    expect(ENEMY_TYPES.elite.damage * earlyBounty.damage * ENEMY_ATTACK_PROFILES.elite!.damageMultiplier).toBeLessThan(35);
    const lateBounty = bountyEnemyMultipliers(8, 2);
    expect(lateBounty.health).toBeLessThanOrEqual(3.4);
    expect(lateBounty.damage).toBeLessThanOrEqual(1.9);
    const lateGuard = supplyGuardMultipliers(8, 2);
    expect(lateGuard.health).toBeLessThanOrEqual(3);
    expect(lateGuard.damage).toBeLessThanOrEqual(1.65);
  });

  it('uses the fixed boss schedule and applies only boss-specific reward multipliers', () => {
    expect(getNextBossMilestone(119_999, new Set())).toBeUndefined();
    expect(getNextBossMilestone(120_000, new Set())).toBe(2);
    expect(getNextBossMilestone(20 * 60_000, new Set([2, 5, 10]))).toBe(20);
    const boss = createBossStats(5, { bossHealthMultiplier: 1.5, bossXPRewardMultiplier: 0.8 });
    expect(boss).toMatchObject({ ...BOSS_DEFINITIONS[5], health: 18_000, maxHealth: 18_000, experienceValue: 4000 });
    expect(getRunXPRequired(1)).toBe(120);
    expect(getRunXPRequired(2)).toBe(158);
    expect(getGuaranteedEnemyDrop('elite')).toBe('data_core');
    expect(getGuaranteedEnemyDrop('titan')).toBe('data_core');
    expect(getGuaranteedEnemyDrop('boss')).toBe('data_core');
    expect(getGuaranteedEnemyDrop('basic')).toBeUndefined();
  });

  it('reproduces item-holder, coin, and treasure drop decisions with caller-owned random sources', () => {
    expect(rollHolderItem(() => 0)).toBe('hp');
    expect(rollHolderItem(() => 0.99999)).toBe('bomb');
    expect(Array.from({ length: 101 }, (_, index) => rollHolderItem(() => index / 100))).not.toContain('data_core');
    expect(rollCoinDrop('boss', 1, 0.15, () => 1)).toBe('coin_diamond');
    expect(rollCoinDrop('elite', 1, 0.15, () => 0.2)).toBe('coin_gold');
    expect(rollCoinDrop('elite', 1, 0.15, () => 0.4)).toBe('coin_silver');
    expect(rollCoinDrop('basic', 1, 0.15, () => 0.15)).toBeUndefined();
    expect(rollCoinDrop('fast', 1, 0.15, (() => { let i = 0; return () => [0.1, 0.1][i++]; })())).toBe('coin_silver');
    expect(rollTreasureTier(0, () => 0.04)).toBe('legendary');
    expect(rollTreasureTier(0, () => 0.1)).toBe('epic');
    expect(rollTreasureTier(0, () => 0.8)).toBe('rare');
    expect(shouldDropTreasure(2, 2, 100, 1, () => 0)).toBe(false);
    expect(shouldDropTreasure(0, 2, 1, 0.001, () => 0.0009)).toBe(true);
  });

  it('centralises combat modifiers and pickup effects without client state', () => {
    expect(resolveEnemyDamage({
      baseDamage: 10, enemyType: 'titan', bossDamageMultiplier: 1.5, doubleStrike: true, doubleStrikeChance: 0.2,
      executeLevel: 1, luck: 1, enemyHealth: 999, random: () => 0,
    })).toEqual({ damage: 30, critical: true, executed: false });
    expect(resolveEnemyDamage({
      baseDamage: 10, enemyType: 'basic', bossDamageMultiplier: 1, doubleStrike: false, doubleStrikeChance: 0.2,
      executeLevel: 2, luck: 1, enemyHealth: 37, random: () => 0,
    })).toEqual({ damage: 37, critical: false, executed: true });
    expect(getPickupEffect('hp')).toEqual({ kind: 'heal', amount: 30 });
    expect(getPickupEffect('coin_gold')).toEqual({ kind: 'coins', amount: 20 });
    expect(getPickupEffect('magnet')).toEqual({ kind: 'magnet' });
    expect(getPickupEffect('bomb')).toEqual({ kind: 'bomb', damage: 100 });
    expect(getPickupEffect('data_core')).toEqual({ kind: 'data_core', amount: 1 });
  });
});
