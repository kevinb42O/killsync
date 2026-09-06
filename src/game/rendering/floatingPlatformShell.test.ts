import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFloatingPlatformShell } from './floatingPlatformShell';

describe('createFloatingPlatformShell', () => {
  it('has no competing horizontal surface directly beneath the deck', () => {
    const width = 12_000;
    const height = 12_000;
    const shell = createFloatingPlatformShell(width, height, 150);
    shell.updateMatrixWorld(true);

    const ray = new THREE.Raycaster(
      new THREE.Vector3(width / 2, 10, height / 2),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(shell, true)[0];

    expect(hit).toBeDefined();
    expect(hit.point.y).toBeLessThan(-140);
    expect(shell.children).toHaveLength(5);
  });
});
