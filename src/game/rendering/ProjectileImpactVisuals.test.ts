import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectileImpactVisuals } from './ProjectileImpactVisuals';

describe('ProjectileImpactVisuals', () => {
  it('reuses a fixed instanced pool and expires marks in place', () => {
    const scene = new THREE.Scene();
    const impacts = new ProjectileImpactVisuals(scene);
    const mesh = scene.getObjectByName('projectile-impact-marks') as THREE.InstancedMesh;

    for (let index = 0; index < 60; index++) impacts.spawn(index, 20, 0, 0, 0, 1, '#67e8f9');

    expect(scene.children).toEqual([mesh]);
    expect(mesh.count).toBe(48);
    expect((impacts as any).nextSlot).toBe(12);
    expect(Array.from((impacts as any).remainingMs as Float32Array).every(value => value > 0)).toBe(true);

    impacts.update(1_800);
    expect(Array.from((impacts as any).remainingMs as Float32Array)).toEqual(Array(48).fill(0));
    impacts.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
