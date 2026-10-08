import { describe, expect, it } from 'vitest';
import { FriendsFlightFoliage, FriendsHelicopterSound } from './FriendsFlightSound';
import type { FriendsSnapshot, FriendsVehicle } from './multiplayer/FriendsExpedition';
import type { FrontierTree } from './multiplayer/FriendsFrontier';

const craft: FriendsVehicle = { id: 'heli', kind: 'aircraft', x: 0, y: 0, z: 50, angle: 0, width: 200, length: 300 };
const snapshot = (v: FriendsVehicle = craft) => ({ vehicles: [v] }) as FriendsSnapshot;
const tree: FrontierTree = { id: 'test', kind: 'oak', x: 0, y: 0, z: 0, scale: 1 };
const crown = () => ({ bottom: 100, top: 300, radius: 50 });
const point = (x: number, z = 170) => ({ x, y: 0, z });

describe('helicopter motion sound', () => {
  it('idles quietly, increases rotor power with pilot/motion, and pans with distance', () => {
    const sound = new FriendsHelicopterSound();
    const idle = sound.sample(snapshot(), craft, 0, 0);
    const hover = sound.sample(snapshot({ ...craft, pilotId: 'p' }), craft, 500, 0);
    const flying = sound.sample(snapshot({ ...craft, x: 200, pilotId: 'p' }), { ...craft, x: 200 }, 1000, 0);
    expect(idle.volume).toBe(.1); expect(hover.volume).toBeGreaterThan(idle.volume);
    expect(flying.volume).toBeGreaterThan(hover.volume); expect(flying.rate).toBeGreaterThan(hover.rate);
    const left = sound.sample(snapshot(), { x: 0, y: -300, z: 50 }, 1500, 0);
    const right = sound.sample(snapshot(), { x: 0, y: 300, z: 50 }, 2000, 0);
    expect(left.pan).toBeGreaterThan(0); expect(right.pan).toBeLessThan(0);
    expect(left.volume).toBeLessThan(idle.volume);
    expect(sound.sample(snapshot(), point(2000), 2500, 0).volume).toBe(0);
  });
  it('dampens distant engines underground and handles disappearance/time reset', () => {
    const sound = new FriendsHelicopterSound(), listener = point(500);
    const exterior = sound.sample(snapshot(), listener, 1000, 0);
    expect(sound.sample(snapshot(), listener, 1500, 0, true).volume).toBeCloseTo(exterior.volume * .12);
    expect(sound.sample(snapshot({ ...craft, pilotId: 'p', x: 600 }), listener, 0, 0).rate).toBe(1);
    expect(sound.sample({ vehicles: [] } as unknown as FriendsSnapshot, listener, 500, 0).volume).toBe(0);
  });
});

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
