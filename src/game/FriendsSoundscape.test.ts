import { describe, expect, it } from 'vitest';
import { coastalSurfLevel, FriendsSoundscape, QUIET_SOUNDSCAPE, windExposure } from './FriendsSoundscape';
import { ISLAND_SEA_LEVEL } from './world/FriendsIsland';
import { frontierTrees, type FrontierSnapshot } from './multiplayer/FriendsFrontier';

const frontier = { harvested: [], planted: [] } as unknown as FrontierSnapshot;
describe('island field-recording mix', () => {
  it('keeps low ground, hills and small jumps quiet, but fades in on mountains and high flight', () => {
    expect(windExposure(96, 96)).toBe(0);
    expect(windExposure(900, 900)).toBe(0);
    expect(windExposure(1250, 1200)).toBe(0);
    expect(windExposure(1700, 1700)).toBe(0);
    expect(windExposure(2150, 2150)).toBeCloseTo(.5);
    expect(windExposure(2600, 2600)).toBe(1); // Standing on a summit is exposed too.
    expect(windExposure(900, 20)).toBeCloseTo(.5);
    expect(windExposure(1300, 20)).toBe(1);
    const scene = new FriendsSoundscape();
    const sample = (height: number, wind: number, underground = false) => scene.sample(frontier, 15600, 8700, height, 0, 1, wind, 0, underground, () => false, height);
    expect(sample(900, 2).wind).toBe(0);
    expect(sample(2150, 1).wind).toBeGreaterThan(0);
    expect(sample(2600, 1).wind).toBeGreaterThan(sample(2150, 1).wind);
    expect(sample(2600, 0).wind).toBe(0);
    expect(sample(2600, 1, true).wind).toBe(0);
  });
  it('fades surf with distance and elevation on both sides of the coast', () => {
    expect(coastalSurfLevel(0, ISLAND_SEA_LEVEL)).toBeCloseTo(.42);
    expect(coastalSurfLevel(800, ISLAND_SEA_LEVEL)).toBeCloseTo(.105);
    expect(coastalSurfLevel(-800, ISLAND_SEA_LEVEL)).toBeCloseTo(.105);
    expect(coastalSurfLevel(2000, ISLAND_SEA_LEVEL)).toBe(0);
    expect(coastalSurfLevel(0, ISLAND_SEA_LEVEL + 2000)).toBe(0);
  });
  it('adds crickets at night, leaves birds to actual bird positions, and silences the outdoors underground', () => {
    const scene = new FriendsSoundscape();
    const day = scene.sample(frontier, 6000, 6000, 300, 0, 1, 1, 0, false);
    const night = scene.sample(frontier, 6000, 6000, 300, 0, 0, 1, 0, false);
    expect(day.birds).toBe(0); expect(day.crickets).toBe(0);
    expect(night.birds).toBe(0); expect(night.crickets).toBeGreaterThan(0);
    expect(scene.sample(frontier, 6000, 6000, 300, 0, 1, 1, 0, true)).toEqual(QUIET_SOUNDSCAPE);
    expect(scene.sample(frontier, 6000, 6000, 300, 0, 1, 0, 0, false).wind).toBe(0);
  });
  it('positions foliage by an actual standing tree and removes rustles after it is harvested', () => {
    const tree = frontierTrees(11, 11).find(tree => tree.id === 'starter:cedar')!;
    const scene = new FriendsSoundscape();
    const beside = scene.sample(frontier, tree.x, tree.y - 100, tree.z, 0, 1, 1, 0, false, candidate => candidate.id === tree.id);
    expect(beside.foliage).toBeGreaterThan(.05); expect(beside.foliagePan).toBeCloseTo(.65);
    const cut = scene.sample({ ...frontier, harvested: [tree.id] }, tree.x, tree.y - 100, tree.z, 0, 1, 1, 0, false, candidate => candidate.id === tree.id);
    expect(cut.foliage).toBe(0);
    expect(scene.sample(frontier, tree.x, tree.y, tree.z, 0, 1, 1, 0, false, () => false).foliage).toBe(0);
  });
});
