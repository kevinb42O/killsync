import { describe, expect, it } from 'vitest';
import { buildEncounterClusters, COOP_INTERMISSION_MS, encounterDamageMultiplier, encounterHealthMultiplier, EncounterDirector, enemyThreat, type EncounterPlayer } from './EncounterDirector';
import { SpawnTopology } from './SpawnTopology';
import { isWorldPositionClear } from '../world/WorldLayout';
import { COOP_MAX_PLAYERS } from './protocol';

const players = (x: number, y: number): EncounterPlayer[] => [{ id: 'host', x, y, angle: 0, health: 100 }];

describe('EncounterDirector', () => {
  it('contains each round, grants an intermission, then introduces the next enemy tier', () => {
    const director = new EncounterDirector(0x1234, 100);
    expect(director.schedule(99, [], players(6000, 6000), 90)).toEqual([]);
    const roundOneOrders = [...director.schedule(100, [], players(6000, 6000), 90)];
    while (director.snapshot(1).spawnedThisRound < director.snapshot(1).roundTotal) {
      roundOneOrders.push(...director.schedule(director.snapshot(1).nextSpawnAtMs, [], players(6000, 6000), 90));
    }
    expect(roundOneOrders).not.toHaveLength(0);
    expect(roundOneOrders.every(order => order.type === 'basic')).toBe(true);
    const completionAtMs = director.snapshot(1).nextSpawnAtMs;
    director.schedule(completionAtMs, [], players(6000, 6000), 90);
    const breakSnapshot = director.snapshot(1);
    expect(breakSnapshot).toMatchObject({ phase: 'intermission', round: 1, tier: 1, intermissionRemainingMs: COOP_INTERMISSION_MS });
    const roundTwo = director.schedule(completionAtMs + COOP_INTERMISSION_MS, [], players(6000, 6000), 90);
    expect(director.snapshot(1)).toMatchObject({ phase: 'combat', round: 2, tier: 2 });
    expect(roundTwo[0]?.type).toBe('fast');
    expect(roundTwo.every(order => order.type === 'basic' || order.type === 'fast')).toBe(true);
  });

  it('schedules the same encounter timeline regardless of player movement', () => {
    const stationary = new EncounterDirector(0x1234);
    const moving = new EncounterDirector(0x1234);
    const stationaryOrders = [
      ...stationary.schedule(0, [], players(6000, 6000), 90),
      ...stationary.schedule(720, [], players(6000, 6000), 90),
      ...stationary.schedule(1440, [], players(6000, 6000), 90),
    ];
    const movingOrders = [
      ...moving.schedule(0, [], players(6000, 6000), 90),
      ...moving.schedule(720, [], players(8100, 3300), 90),
      ...moving.schedule(1440, [], players(2400, 9000), 90),
    ];
    expect(movingOrders).toEqual(stationaryOrders);
    expect(moving.snapshot(1).nextSpawnAtMs).toBe(stationary.snapshot(1).nextSpawnAtMs);
  });

  it('introduces new tiers in authored, formation-ready combat packs', () => {
    const director = new EncounterDirector(0x42);
    let time = 0;
    for (let round = 1; round <= 3; round++) {
      const first = director.schedule(time, [], players(6000, 6000), 90);
      expect(new Set(first.map(order => order.packetId)).size).toBe(1);
      expect(first.map(order => order.formationIndex)).toEqual(first.map((_, index) => index));
      expect(first.every(order => order.formationSize === first.length)).toBe(true);
      if (round === 3) {
        expect(first[0].type).toBe('ranged');
        expect(first.slice(1).every(order => order.type === 'basic')).toBe(true);
        expect(first[0].packId).toBe('fireteam');
        break;
      }
      while (director.snapshot(1).spawnedThisRound < director.snapshot(1).roundTotal) {
        time = director.snapshot(1).nextSpawnAtMs;
        director.schedule(time, [], players(6000, 6000), 90);
      }
      time = director.snapshot(1).nextSpawnAtMs;
      director.schedule(time, [], players(6000, 6000), 90);
      time += COOP_INTERMISSION_MS;
    }
  });

  it('uses threat as a concurrency gate and scales durability more gently than population', () => {
    const director = new EncounterDirector(0x1234);
    director.schedule(0, [], players(6000, 6000), 90);
    const nextAt = director.snapshot(1).nextSpawnAtMs;
    const saturated = Array.from({ length: 9 }, () => ({ type: 'basic' as const }));
    expect(director.schedule(nextAt, saturated, players(6000, 6000), 90)).toEqual([]);
    expect(director.snapshot(1).activeThreat).toBe(9 * enemyThreat('basic'));
    expect(encounterHealthMultiplier(6, 4)).toBeLessThan(1.7);
    expect(encounterDamageMultiplier(20)).toBeLessThanOrEqual(1.45);
  });

  it('raises the finite round budget for a full eight-operative squad', () => {
    const director = new EncounterDirector(0x1234);
    const roster = Array.from({ length: COOP_MAX_PLAYERS }, (_, index) => ({ id: `player-${index}`, x: 6000 + index * 20, y: 6000, angle: 0, health: 100 }));

    director.schedule(0, [], roster, 114);
    expect(director.snapshot(0).roundTotal).toBe(10 + 5 + (COOP_MAX_PLAYERS - 1) * 6);
  });

  it('sustains ten finite rounds without roster overflow or premature archetypes', () => {
    const director = new EncounterDirector(0xc0ffee);
    let time = 0;
    const totals: number[] = [];
    for (let expectedRound = 1; expectedRound <= 10; expectedRound++) {
      const orders = [...director.schedule(time, [], players(6000, 6000), 90)];
      let guard = 0;
      while (director.snapshot(1).spawnedThisRound < director.snapshot(1).roundTotal && guard++ < 200) {
        time = director.snapshot(1).nextSpawnAtMs;
        const packet = director.schedule(time, [], players(6000, 6000), 90);
        expect(packet.length).toBeLessThanOrEqual(5);
        orders.push(...packet);
      }
      const snapshot = director.snapshot(1);
      expect(snapshot.round).toBe(expectedRound);
      expect(snapshot.spawnedThisRound).toBe(snapshot.roundTotal);
      expect(orders).toHaveLength(snapshot.roundTotal);
      expect(snapshot.spawnedThreat).toBeLessThanOrEqual(snapshot.roundThreatBudget!);
      expect(orders.every(order => order.healthMultiplier === encounterHealthMultiplier(expectedRound, 1))).toBe(true);
      expect(orders.every(order => order.damageMultiplier === encounterDamageMultiplier(expectedRound))).toBe(true);
      const unlocked = new Set(['basic', 'fast', 'ranged', 'tank', 'phantom', 'elite'].slice(0, Math.min(6, expectedRound)));
      expect(orders.every(order => unlocked.has(order.type))).toBe(true);
      totals.push(snapshot.roundTotal);

      time = snapshot.nextSpawnAtMs;
      director.schedule(time, [], players(6000, 6000), 90);
      expect(director.snapshot(1).phase).toBe('intermission');
      time += COOP_INTERMISSION_MS;
    }
    expect(totals).toEqual([...totals].sort((left, right) => left - right));
    expect(totals.at(-1)).toBeLessThanOrEqual(114);
  });

  it('builds stable shared and split encounter clusters', () => {
    const grouped = buildEncounterClusters([
      { id: 'alpha', x: 6000, y: 6000, angle: 0, health: 100 },
      { id: 'bravo', x: 6500, y: 6000, angle: 0, health: 100 },
    ], []);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].playerIds).toEqual(['alpha', 'bravo']);

    const split = buildEncounterClusters([
      { id: 'alpha', x: 2000, y: 2000, angle: 0, health: 100 },
      { id: 'bravo', x: 10000, y: 10000, angle: 0, health: 100 },
    ], []);
    expect(split).toHaveLength(2);
    expect(split.map(cluster => cluster.playerIds)).toEqual([['alpha'], ['bravo']]);
  });

  it('chooses a clear, off-view, reaction-safe world node', () => {
    const topology = new SpawnTopology();
    const player = players(6000, 6000)[0];
    const cluster = buildEncounterClusters([player], [])[0];
    const node = topology.find(cluster, [player], 16, []);
    expect(node).toBeDefined();
    const distance = Math.hypot(node!.x - player.x, node!.y - player.y);
    expect(distance).toBeGreaterThanOrEqual(720);
    expect(distance).toBeLessThanOrEqual(1300);
    expect(isWorldPositionClear(node!.x, node!.y, 26)).toBe(true);
    // The player faces east. Eligible near-range nodes must not appear in that cone.
    expect((node!.x - player.x) / distance).toBeLessThanOrEqual(Math.cos(1.02));
  });
});
