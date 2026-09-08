import { describe, expect, it } from 'vitest';
import { isWorldPositionClear } from '../world/WorldLayout';
import { CoopRunDirector, COOP_INSERTION_DURATION_MS } from './CoopRunDirector';
import { RUN_STATION_CLEARANCE } from './runPlacement';
import {
  COOP_FIRST_STATION_MAX_DISTANCE,
  COOP_FIRST_STATION_MIN_DISTANCE,
  COOP_SECOND_STATION_MIN_INSERTION_DISTANCE,
  COOP_THIRD_STATION_MIN_INSERTION_DISTANCE,
  COOP_STATION_CAPTURE_MS,
  COOP_STATION_CAPTURE_RADIUS,
  COOP_STATION_BOUNDARY_TOLERANCE,
  COOP_STATION_EMPTY_GRACE_MS,
  COOP_STATION_COUNT,
  COOP_STATION_SEPARATION,
  CoopStationDirector,
  generateCoopStationSites,
} from './CoopStationDirector';

const insertion = { x: 6000, y: 6000 };
const gasCentreForSeed = (seed: number) => {
  const angle = ((seed ^ 0x5a17e0) >>> 0) / 0x1_0000_0000 * Math.PI * 2;
  return { x: Math.round(insertion.x + Math.cos(angle) * 1850), y: Math.round(insertion.y + Math.sin(angle) * 1850) };
};

describe('CoopStationDirector', () => {
  it('produces the same valid, separated three-site layout across hundreds of seeds', () => {
    for (let seed = 0; seed < 400; seed++) {
      const gas = gasCentreForSeed(seed);
      const first = generateCoopStationSites(seed, insertion, gas);
      const repeated = generateCoopStationSites(seed, insertion, gas);
      expect(first).toEqual(repeated);
      expect(first).toHaveLength(COOP_STATION_COUNT);
      expect(new Set(first.map(site => `${site.x}:${site.y}`)).size).toBe(COOP_STATION_COUNT);
      const openingDistance = Math.hypot(first[0].x - insertion.x, first[0].y - insertion.y);
      expect(openingDistance).toBeGreaterThanOrEqual(COOP_FIRST_STATION_MIN_DISTANCE);
      expect(openingDistance).toBeLessThanOrEqual(COOP_FIRST_STATION_MAX_DISTANCE);
      expect(Math.hypot(first[1].x - insertion.x, first[1].y - insertion.y)).toBeGreaterThanOrEqual(COOP_SECOND_STATION_MIN_INSERTION_DISTANCE);
      expect(Math.hypot(first[2].x - insertion.x, first[2].y - insertion.y)).toBeGreaterThanOrEqual(COOP_THIRD_STATION_MIN_INSERTION_DISTANCE);
      expect(Math.hypot(first[1].x - gas.x, first[1].y - gas.y)).toBeGreaterThanOrEqual(1_110);
      expect(Math.hypot(first[2].x - gas.x, first[2].y - gas.y)).toBeGreaterThanOrEqual(1_110);
      for (const site of first) expect(isWorldPositionClear(site.x, site.y, COOP_STATION_CAPTURE_RADIUS)).toBe(true);
      for (let left = 0; left < first.length; left++) {
        for (let right = left + 1; right < first.length; right++) {
          expect(Math.hypot(first[left].x - first[right].x, first[left].y - first[right].y)).toBeGreaterThanOrEqual(COOP_STATION_SEPARATION);
        }
      }
    }
  }, 60_000);

  it('is host-authoritative, contested, accelerated with a cap, and decays when abandoned', () => {
    const director = new CoopStationDirector(123, insertion, gasCentreForSeed(123));
    const site = director.snapshot()[0];
    const players = [
      { x: site.x, y: site.y, lifeState: 'alive' },
      { x: site.x + 10, y: site.y, lifeState: 'alive' },
      { x: site.x, y: site.y + 10, lifeState: 'alive' },
      { x: site.x - 10, y: site.y, lifeState: 'alive' },
    ];
    director.update(1_000, players, [{ x: site.x, y: site.y, radius: 16 }]);
    expect(director.snapshot()[0]).toMatchObject({ state: 'capturing', contested: true, captureProgressMs: 0, occupants: 4 });
    director.update(1_000, players, []);
    expect(director.snapshot()[0].captureProgressMs).toBe(2_500);
    director.update(1_000, [], []);
    expect(director.snapshot()[0]).toMatchObject({ state: 'available', captureProgressMs: 2_300 });
    const activated = director.update((COOP_STATION_CAPTURE_MS - 2_300) / 2.5, players, []);
    expect(activated).toHaveLength(1);
    expect(director.snapshot()[0]).toMatchObject({ state: 'active', captureProgressMs: COOP_STATION_CAPTURE_MS });
  });

  it('unlocks only one later opportunity at each boss milestone and never exceeds the cap', () => {
    const director = new CoopStationDirector(456, insertion, gasCentreForSeed(456));
    expect(director.snapshot().map(site => site.state)).toEqual(['available', 'locked', 'locked']);
    director.unlock(1);
    expect(director.snapshot().map(site => site.state)).toEqual(['available', 'available', 'locked']);
    director.unlock(2);
    director.unlock(3);
    director.unlock(99);
    expect(director.snapshot()).toHaveLength(COOP_STATION_COUNT);
    expect(director.snapshot().map(site => site.state)).toEqual(['available', 'available', 'available']);
  });

  it('captures continuously while an operator moves anywhere inside the ring', () => {
    const director = new CoopStationDirector(789, insertion, gasCentreForSeed(789));
    const site = director.snapshot()[0];
    const playerRadius = 19;
    const positions = [
      [0, 0],
      [site.captureRadius - 1, 0],
      [0, -(site.captureRadius - 1)],
      [-site.captureRadius + 1, 0],
      [0, site.captureRadius - 1],
      // Body-overlap tolerance prevents numerical boundary flicker.
      [site.captureRadius + playerRadius + COOP_STATION_BOUNDARY_TOLERANCE - 1, 0],
    ];
    for (const [dx, dy] of positions) {
      director.update(500, [{ id: 'moving', x: site.x + dx, y: site.y + dy, radius: playerRadius, lifeState: 'alive' }], []);
    }
    expect(director.snapshot()[0]).toMatchObject({ state: 'capturing', captureProgressMs: positions.length * 500, occupants: 1 });
  });

  it('ignores a brief boundary correction instead of flickering or decaying', () => {
    const director = new CoopStationDirector(790, insertion, gasCentreForSeed(790));
    const site = director.snapshot()[0];
    director.update(1_000, [{ id: 'host', x: site.x, y: site.y, radius: 19, lifeState: 'alive' }], []);
    director.update(COOP_STATION_EMPTY_GRACE_MS, [{ id: 'host', x: site.x + 500, y: site.y, radius: 19, lifeState: 'alive' }], []);
    expect(director.snapshot()[0]).toMatchObject({ state: 'capturing', captureProgressMs: 1_000, occupants: 1 });
    director.update(50, [{ id: 'host', x: site.x, y: site.y, radius: 19, lifeState: 'alive' }], []);
    expect(director.snapshot()[0].captureProgressMs).toBe(1_050);
  });

  it('keeps objectives, bosses, and exfil safely clear of all pre-generated stations', () => {
    const assertClear = (point: { x: number; y: number }, radius: number, stations: Array<{ x: number; y: number }>) => {
      for (const station of stations) {
        expect(Math.hypot(point.x - station.x, point.y - station.y)).toBeGreaterThanOrEqual(radius + 105 + RUN_STATION_CLEARANCE);
      }
    };
    for (let seed = 0; seed < 40; seed++) {
      const stations = generateCoopStationSites(seed, insertion, gasCentreForSeed(seed));
      const director = new CoopRunDirector(seed, stations.map(station => ({ ...station, radius: 105 })));
      director.advanceInsertion(COOP_INSERTION_DURATION_MS, insertion);
      assertClear(director.currentObjective!, 155, stations);
      director.addUplinkProgress(100);
      assertClear(director.currentBoss!, 170, stations);
      director.activateBoss(100, director.currentBoss!.x, director.currentBoss!.y);
      director.completeBoss(insertion);
      assertClear(director.currentExfil!, 120, stations);
      director.updateCheckpoint(20_000, 0, 1);
      director.startContract(insertion);
      assertClear(director.currentObjective!, 155, stations);
      director.setEliteTarget(88); director.completeEliteTarget(88);
      assertClear(director.currentBoss!, 170, stations);
      director.activateBoss(100, director.currentBoss!.x, director.currentBoss!.y);
      director.completeBoss(insertion);
      assertClear(director.currentExfil!, 120, stations);
      director.updateCheckpoint(20_000, 0, 1);
      director.startFinalBoss(insertion);
      assertClear(director.currentBoss!, 170, stations);
      director.activateBoss(100, director.currentBoss!.x, director.currentBoss!.y);
      director.completeBoss(insertion);
      assertClear(director.currentExfil!, 120, stations);
    }
  });
});
