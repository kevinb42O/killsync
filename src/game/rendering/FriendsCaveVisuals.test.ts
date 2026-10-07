import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsCaveVisuals } from './FriendsCaveVisuals';
import { CAVE_ROOMS } from '../world/FriendsCave';
import type { FriendsTerrain } from '../world/FriendsTerrain';

describe('cave entrances retain the exterior sky', () => {
  it('preserves the live background when entering authored caves and mined tunnels', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const sky = new THREE.Texture(); scene.background = sky;
    scene.fog = new THREE.FogExp2(0xaec4bd, .000009);
    const terrain = { floor: () => 640, revision: 0 } as unknown as FriendsTerrain;
    const renderer = { shadowMap: { needsUpdate: false } } as THREE.WebGLRenderer;
    const cave = new FriendsCaveVisuals(scene, camera, terrain, renderer);
    const room = CAVE_ROOMS[1]; camera.position.set(room.x, room.floor + 40, room.y);
    expect(cave.update(0)).toBe(true);
    expect(scene.background).toBe(sky);
    camera.position.set(24000, 500, 24000);
    expect(cave.update(1, true)).toBe(true);
    expect(scene.background).toBe(sky);
    // A new exterior (e.g. sunset) must never be replaced by a cached daylight sky.
    const sunset = new THREE.Color(0xcb7755); scene.background = sunset;
    expect(cave.update(2)).toBe(false);
    expect(scene.background).toBe(sunset);
    cave.dispose(); expect(scene.background).toBe(sunset);
  });
});
