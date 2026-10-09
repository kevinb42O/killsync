import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsCastleTorches } from './FriendsCastleTorches';

vi.mock('../world/FriendsCastle', () => ({
  CASTLE_TOWERS: [], HIGHFALL_CASTLE: { x: 0, y: 0, floor: 0 },
  createHighfallCastle: () => ({
    torches: Array.from({ length: 8 }, (_, i) => ({ x: i * 100, y: 0, z: 0, large: false })),
  }),
}));
vi.mock('../world/FriendsTerrain', () => ({ baseTerrainHeight: () => 0 }));

describe('castle torch light layout', () => {
  it('keeps eight shader light slots through every activation threshold, retaining the original lighting', () => {
    const torches = new FriendsCastleTorches();
    const lights = torches.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
    expect(lights).toHaveLength(8);
    expect(lights.every(light => light.visible && light.intensity === 0)).toBe(true);
    const counts = new Set<number>();
    // Approach along the fixture's torch row: cross each of the eight range
    // boundaries independently, then retrace them to check leaving as well.
    const path = Array.from({ length: 36 }, (_, i) => -3500 + i * 100);
    for (const x of [...path, ...path.slice().reverse()]) {
      const camera = new THREE.Vector3(x, 92, 0), seconds = 5;
      torches.update(seconds, camera);
      expect(lights.every(light => light.visible)).toBe(true);
      const nearest = Array.from({ length: 8 }, (_, i) => ({
        i, p: new THREE.Vector3(i * 100, 92, 0),
      })).sort((a, b) => a.p.distanceToSquared(camera) - b.p.distanceToSquared(camera));
      lights.forEach((light, slot) => {
        const t = nearest[slot], inRange = t.p.distanceToSquared(camera) < 2800 * 2800;
        const intensity = inRange ? 65000 * (1 + .055 * Math.sin(seconds * 8.3 + t.i) + .035 * Math.sin(seconds * 19 + t.i * 2)) : 0;
        expect(light.position.equals(t.p)).toBe(true);
        expect(light.intensity).toBe(intensity);
      });
      counts.add(lights.filter(light => light.intensity > 0).length);
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    torches.dispose();
  });
});
