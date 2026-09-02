import { describe, expect, it } from 'vitest';
import { buildEncounterClusters, EncounterDirector, type EncounterPlayer } from './EncounterDirector';
import { SpawnTopology } from './SpawnTopology';
import { isWorldPositionClear } from '../world/WorldLayout';

const players = (x: number, y: number): EncounterPlayer[] => [{ id: 'host', x, y, angle: 0, health: 100 }];

describe('EncounterDirector', () => {
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
