import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsScenicRailwayVisuals } from './FriendsScenicRailwayVisuals';

// Test presentation distance with a small valid route, independent of ongoing
// engineering changes to the island's authored railway.
vi.mock('../world/FriendsScenicRailway', () => ({
  SCENIC_CHAPTERS: [], scenicStationPoses: () => [],
  scenicRailway: () => ({
    length: 4096, stations: [], tiles: new Map(), hash: 'test-route',
    points: [
      { x: 24000, y: 24000, z: 3000, distance: 0, horizontal: 0, chapter: 1, angle: 0, pitch: 0, curvature: 0, grade: 0, speed: 160 },
      { x: 25024, y: 24000, z: 3000, distance: 1024, horizontal: 1024, chapter: 1, angle: Math.PI / 2, pitch: 0, curvature: 0, grade: 0, speed: 160 },
      { x: 25024, y: 25024, z: 3000, distance: 2048, horizontal: 2048, chapter: 1, angle: Math.PI, pitch: 0, curvature: 0, grade: 0, speed: 160 },
      { x: 24000, y: 25024, z: 3000, distance: 3072, horizontal: 3072, chapter: 1, angle: -Math.PI / 2, pitch: 0, curvature: 0, grade: 0, speed: 160 },
    ],
  }),
}));
vi.mock('../world/FriendsTerrain', () => ({ baseTerrainHeight: () => 0 }));

describe('railway visibility in the aerial menu', () => {
  it('shows distant infrastructure for overview cameras while preserving the gameplay range', () => {
    const scene = new THREE.Scene(), railway = new FriendsScenicRailwayVisuals(scene);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(60000, 12000, 24000);
    const sectors = railway.group.children.filter(child => child.name.startsWith('rail-sector-'));
    expect(sectors.length).toBeGreaterThan(0);
    railway.update(camera, true);
    expect(sectors.every(sector => !sector.visible)).toBe(true);
    railway.update(camera, true, 85000);
    expect(sectors.every(sector => sector.visible)).toBe(true);
    railway.update(camera, false, 85000);
    expect(railway.group.visible).toBe(false);
    const instances: ReturnType<typeof vi.spyOn>[] = [];
    railway.group.traverse(object => { if (object instanceof THREE.InstancedMesh) instances.push(vi.spyOn(object, 'dispose')); });
    railway.dispose(); expect(scene.getObjectByName('sunline-grand-traverse')).toBeUndefined();
    expect(instances.length).toBeGreaterThan(0);
    instances.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  });
});
