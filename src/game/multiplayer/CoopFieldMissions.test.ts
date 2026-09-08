import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import {
  COOP_FIELD_MISSION_REWARDS,
  CoopFieldMissionDirector,
  generateCoopFieldMissionSites,
  resolveCoopMissionNavigationTarget,
} from './CoopFieldMissions';

const insertion = { x: 6_000, y: 6_000 };

describe('CoopFieldMissionDirector', () => {
  it('places exactly one deterministic pickup for each mission type', () => {
    const sites = generateCoopFieldMissionSites(42, insertion);
    expect(sites).toEqual(generateCoopFieldMissionSites(42, insertion));
    expect(sites).toHaveLength(5);
    expect(new Set(sites.map(site => site.kind))).toEqual(new Set(Object.keys(COOP_FIELD_MISSION_REWARDS)));
    expect(sites.every(site => site.x > 0 && site.y > 0 && site.x < GAME_WIDTH && site.y < GAME_HEIGHT)).toBe(true);
    expect(sites.every(site => site.state === 'available')).toBe(true);
  });

  it('allows only one active pickup and pays its original eligible squad once', () => {
    const director = new CoopFieldMissionDirector(73, insertion);
    const [first, second] = director.snapshot().sites;
    const active = director.accept(first.id, ['guest', 'host', 'host'], { x: 2_000, y: 2_000 });
    expect(active?.kind).toBe(first.kind);
    expect(director.accept(second.id, ['host'], { x: 3_000, y: 3_000 })).toBeUndefined();
    expect(director.snapshot().sites.find(site => site.id === first.id)?.state).toBe('active');

    const result = director.complete();
    expect(result).toMatchObject({ reward: COOP_FIELD_MISSION_REWARDS[first.kind], eligiblePlayerIds: ['guest', 'host'] });
    expect(director.complete()).toBeUndefined();
    expect(director.snapshot()).toMatchObject({ completedCount: 1, active: undefined });
    expect(director.snapshot().sites.find(site => site.id === first.id)?.state).toBe('completed');
    expect(director.accept(second.id, ['host'], { x: 3_000, y: 3_000 })?.id).toBe(second.id);
  });

  it('removes an unaccepted pickup without converting it into a completion', () => {
    const director = new CoopFieldMissionDirector(91, insertion);
    const toxic = director.snapshot().sites.find(site => site.kind === 'toxic_hunt')!;
    expect(director.removeAvailable(toxic.id)?.kind).toBe('toxic_hunt');
    expect(director.snapshot().sites.some(site => site.id === toxic.id)).toBe(false);
    expect(director.snapshot().completedCount).toBe(0);
    expect(director.accept(toxic.id, ['host'], insertion)).toBeUndefined();
  });

  it('creates the hostage and recovery beacon as separate mission points', () => {
    const director = new CoopFieldMissionDirector(101, insertion);
    const site = director.snapshot().sites.find(candidate => candidate.kind === 'hostage_recovery')!;
    const active = director.accept(site.id, ['host'], { x: 1_000, y: 1_000 })!;
    expect(active.stage).toBe('secure');
    expect(active.hostage?.state).toBe('captive');
    expect(active.points.map(point => point.id)).toEqual(['hostage', 'recovery']);
    expect(Math.hypot(active.points[0].x - active.points[1].x, active.points[0].y - active.points[1].y)).toBeGreaterThan(500);
  });

  it('tracks the current moving or collectible objective instead of the original pickup', () => {
    const director = new CoopFieldMissionDirector(311, insertion);
    const toxicSite = director.snapshot().sites.find(candidate => candidate.kind === 'toxic_hunt')!;
    const toxic = director.accept(toxicSite.id, ['host'], { x: 1_200, y: 1_500 })!;
    toxic.targetEnemyIds = [71];
    expect(resolveCoopMissionNavigationTarget(toxic, [{ id: 71, x: 4_200, y: 5_100 }])).toEqual({ x: 4_200, y: 5_100 });
    expect(resolveCoopMissionNavigationTarget(toxic, [{ id: 71, x: 4_200, y: 5_100, dying: true }])).toEqual({ x: toxic.x, y: toxic.y });

    director.complete();
    const courierSite = director.snapshot().sites.find(candidate => candidate.kind === 'courier_intercept')!;
    const courier = director.accept(courierSite.id, ['host'], { x: 2_000, y: 2_000 })!;
    courier.courierEnemyIds = [81, 82];
    expect(resolveCoopMissionNavigationTarget(courier, [{ id: 82, x: 8_000, y: 8_100 }, { id: 81, x: 6_000, y: 6_100 }])).toEqual({ x: 6_000, y: 6_100 });
    courier.stage = 'recover';
    courier.drives = [{ id: 81, x: 6_050, y: 6_150, collected: true }, { id: 82, x: 8_050, y: 8_150, collected: false }];
    expect(resolveCoopMissionNavigationTarget(courier)).toEqual({ x: 8_050, y: 8_150 });
  });
});
