import { describe, expect, it } from 'vitest';
import { FriendsFlightFoliage } from './FriendsFlightSound';
import type { FrontierTree } from './multiplayer/FriendsFrontier';

const tree: FrontierTree = { id: 'test', kind: 'oak', x: 0, y: 0, z: 0, scale: 1 };
const crown = () => ({ bottom: 100, top: 300, radius: 50 });
const point = (x: number, z = 170) => ({ x, y: 0, z });

describe('dev flight through tree canopies', () => {
  it('catches a full fast crossing between frames and bounds sustained brushing', () => {
    const sound = new FriendsFlightFoliage();
    expect(sound.sample(point(-100), 0, true, [tree], () => true, crown, 0)).toBeUndefined();
    expect(sound.sample(point(100), 100, true, [tree], () => true, crown, 0)?.volume).toBeGreaterThan(.16);
    expect(sound.sample(point(0), 200, true, [tree], () => true, crown, 0)).toBeUndefined();
    sound.sample(point(0), 400, true, [tree], () => true, crown, 0);
    expect(sound.sample(point(10), 500, true, [tree], () => true, crown, 0)).toBeDefined();
    expect(sound.sample(point(10), 600, true, [tree], () => true, crown, 0)).toBeUndefined();
  });
  it('stays silent above/below foliage, for cut/unsupported/unloaded trees, teleports and normal movement', () => {
    for (const [z, enabled, standing, loaded, travel, gap] of [
      [400, true, true, true, 200, 100], [0, true, true, true, 200, 100],
      [170, false, true, true, 200, 100], [170, true, false, true, 200, 100],
      [170, true, true, false, 200, 100], [170, true, true, true, 800, 100],
      [170, true, true, true, 200, 1000],
    ] as const) {
      const sound = new FriendsFlightFoliage();
      sound.sample(point(-travel / 2, z), 0, enabled, [tree], () => standing, loaded ? crown : () => undefined, 0);
      expect(sound.sample(point(travel / 2, z), gap, enabled, [tree], () => standing, loaded ? crown : () => undefined, 0)).toBeUndefined();
    }
  });
  it('uses world tree elevation/scale and rearms after dev flight is toggled', () => {
    const sound = new FriendsFlightFoliage(), elevated = { ...tree, z: 1000, scale: 2 };
    sound.sample(point(-140, 1370), 0, true, [elevated], () => true, crown, 0);
    expect(sound.sample(point(140, 1370), 100, true, [elevated], () => true, crown, 0)).toBeDefined();
    sound.sample(point(0), 200, false, [tree], () => true, crown, 0);
    expect(sound.sample(point(-100), 300, true, [tree], () => true, crown, 0)).toBeUndefined();
    expect(sound.sample(point(100), 400, true, [tree], () => true, crown, 0)).toBeDefined();
  });
});
