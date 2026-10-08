import { describe, expect, it } from 'vitest';
import { inCastleMusicArea, campfireSound } from './FriendsLocationAudio';
import { HIGHFALL_CASTLE } from './world/FriendsCastle';
import { CASTLE_STAIRS } from './world/FriendsTerrain';
import { FRIENDS_CAMPFIRE } from './world/FriendsRegion';

describe('castle soundtrack region', () => {
  it('covers the whole court, towers and roof while excluding the land below or high flight', () => {
    const c = HIGHFALL_CASTLE;
    for (const z of [c.floor, c.floor + 1440]) expect(inCastleMusicArea({ x: c.x, y: c.y, z })).toBe(true);
    expect(inCastleMusicArea({ x: c.x - 1700, y: c.y - 1700, z: c.floor })).toBe(true);
    expect(inCastleMusicArea({ x: c.x, y: c.y, z: c.foundation - 600 })).toBe(false);
    expect(inCastleMusicArea({ x: c.x, y: c.y, z: c.floor + 3000 })).toBe(false);
    expect(inCastleMusicArea(FRIENDS_CAMPFIRE)).toBe(false);
  });
  it('starts on the actual long approach stairs and returns to main music off the route', () => {
    const stairs = CASTLE_STAIRS.treads.filter(t => t.flight === 'approach');
    for (const t of [stairs[0], stairs[Math.floor(stairs.length / 2)], stairs.at(-1)!]) {
      expect(inCastleMusicArea({ x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2, z: t.z })).toBe(true);
      expect(inCastleMusicArea({ x: t.a.x, y: t.a.y, z: t.z - 600 })).toBe(false);
    }
    const t = stairs.at(-1)!;
    expect(inCastleMusicArea({ x: t.b.x + t.nxB * 700, y: t.b.y + t.nyB * 700, z: t.z }, true)).toBe(false);
  });
  it('uses a wider exit boundary to avoid flapping near the court edge', () => {
    const c = HIGHFALL_CASTLE, p = { x: c.x + c.half + 250, y: c.y - 320, z: c.floor };
    expect(inCastleMusicArea(p)).toBe(false); expect(inCastleMusicArea(p, true)).toBe(true);
    expect(inCastleMusicArea({ ...p, x: c.x + c.half + 500 }, true)).toBe(false);
  });
});

describe('campfire proximity sound', () => {
  it('plays close to the persistent base flame, follows added fuel, and falls off in 3D', () => {
    const near = campfireSound(FRIENDS_CAMPFIRE, 0);
    expect(near.volume).toBeGreaterThan(.25);
    expect(campfireSound(FRIENDS_CAMPFIRE, 0, 180).volume).toBeGreaterThan(near.volume);
    expect(campfireSound({ ...FRIENDS_CAMPFIRE, x: FRIENDS_CAMPFIRE.x + 400 }, 0).volume).toBeLessThan(near.volume / 2);
    expect(campfireSound({ ...FRIENDS_CAMPFIRE, z: FRIENDS_CAMPFIRE.z + 800 }, 0).volume).toBe(0);
    expect(campfireSound(FRIENDS_CAMPFIRE, 0, 180, true).volume).toBe(0);
  });
  it('pans toward the fire as the listener turns', () => {
    const p = { ...FRIENDS_CAMPFIRE, y: FRIENDS_CAMPFIRE.y - 100 };
    expect(campfireSound(p, 0).pan).toBeGreaterThan(0);
    expect(campfireSound(p, Math.PI).pan).toBeLessThan(0);
  });
});
