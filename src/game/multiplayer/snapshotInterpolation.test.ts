import { describe, expect, it } from 'vitest';
import { CoopSnapshot } from './CoopSimulation';
import { CoopSnapshotInterpolator, interpolateCoopSnapshot } from './snapshotInterpolation';

const snapshot = (x: number, angle: number): CoopSnapshot => ({
  tick: 1, elapsedMs: 0, kills: 0,
  players: [{ id: 'host', label: 'Host', color: '#0ff', x, y: 40, angle, health: 100, maxHealth: 100, selectedSlot: 0, selectedWeaponId: 'plasma_gun', z: x, sprinting: false, sliding: false, crouching: false, level: 1, experience: 0, experienceToNextLevel: 120, coins: 0, pendingDataCores: 0, weaponStates: [{ weaponId: 'plasma_gun', level: 1, magazineAmmo: 12, reserveAmmo: 72, nextFireAtMs: 0, state: 'ready' }], weaponLevels: [1], selectedWeaponLevel: 1, isAiming: false, isReloading: false, isSwitching: false, lifeState: 'alive', downedRemainingMs: 0, reviveProgressMs: 0, invulnerableRemainingMs: 0, selfRevives: 0, selfReviveProgressMs: 0, armorTier: 0, armorHp: 0, gasMaskHp: 0, gasMaskMaxHp: 100, passiveModules: [] }],
  enemies: [{ id: 1, x, y: 80, health: 50, maxHealth: 50, type: 'basic', color: '#ff4444', radius: 15, damage: 10, speed: 1, experienceValue: 5, hitFlashMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0 }],
  projectiles: [{ id: 2, x, y: 120, z: x, angle, pitch: angle * 0.1, ownerId: 'host', weaponId: 'plasma_gun', radius: 8, velocity: 900, lifeMs: 500 }],
  gems: [], items: [], ammoCaches: [], combatEvents: [], matchState: 'active', run: { phase: 'insertion', elapsedMs: 0, contractIndex: 0, bossesDefeated: 0, noticeKey: 'objective.dropIn' }, buyStations: [], encounter: { seed: 1, tick: 0, nextSpawnAtMs: 0, phase: 'insertion', round: 1, tier: 1, roundTotal: 0, spawnedThisRound: 0, enemiesRemaining: 0, intermissionRemainingMs: 0, desiredThreat: 0, activeThreat: 0, clusterCount: 1, packetsIssued: 0 },
});

describe('interpolateCoopSnapshot', () => {
  it('smooths positions and takes the shortest route around angle wraparound', () => {
    const result = interpolateCoopSnapshot(snapshot(0, Math.PI * 1.9), snapshot(100, Math.PI * 0.1), 0.5);
    expect(result.players[0].x).toBe(50);
    expect(result.enemies[0].x).toBe(50);
    expect(result.projectiles[0].x).toBe(50);
    expect(result.projectiles[0].z).toBe(50);
    expect(result.players[0].z).toBe(50);
    expect(Math.abs(result.players[0].angle)).toBeGreaterThan(2.9);
  });

  it('returns the authoritative snapshot unchanged after interpolation catches up', () => {
    const current = snapshot(100, 1);
    expect(interpolateCoopSnapshot(snapshot(0, 0), current, 1)).toBe(current);
    expect(interpolateCoopSnapshot(snapshot(0, 0), current, 2)).toBe(current);
  });

  it('reuses presentation objects without mutating authoritative snapshots', () => {
    const interpolator = new CoopSnapshotInterpolator();
    const previous = snapshot(0, 0);
    const current = snapshot(100, 1);
    const first = interpolator.interpolate(previous, current, .25);
    const player = first.players[0];
    expect(player.x).toBe(25);
    const second = interpolator.interpolate(previous, current, .5);
    expect(second).toBe(first);
    expect(second.players[0]).toBe(player);
    expect(second.players[0].x).toBe(50);
    expect(previous.players[0].x).toBe(0);
    expect(current.players[0].x).toBe(100);
  });

  it('clears optional fields that disappear from a later network snapshot', () => {
    const interpolator = new CoopSnapshotInterpolator();
    const previous = snapshot(0, 0);
    const withAction = snapshot(100, 1);
    withAction.players[0].weaponActionEndsAtMs = 500;
    interpolator.interpolate(previous, withAction, .5);
    const withoutAction = snapshot(200, 2);
    const frame = interpolator.interpolate(withAction, withoutAction, .5);
    expect(frame.players[0].weaponActionEndsAtMs).toBeUndefined();
  });
});
