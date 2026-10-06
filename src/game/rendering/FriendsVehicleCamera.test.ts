import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FriendsVehicleCamera } from './FriendsVehicleCamera';
import { FriendsExpedition } from '../multiplayer/FriendsExpedition';

describe('Sunskiff pilot chase camera', () => {
  it('frames the full aircraft from behind and above, including the rotors', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, .05, 32000), rig = new FriendsVehicleCamera(), plane = new FriendsExpedition().vehicles().find(v=>v.kind==='aircraft')!;
    rig.update(camera, plane, -Math.PI / 2, 0, 16.67); camera.updateMatrixWorld();
    expect(camera.position.x).toBeLessThan(plane.x - 600); expect(camera.position.y).toBeGreaterThan(plane.z + 200);
    for (const x of [-155, 155]) for (const y of [0, 129]) for (const z of [-175, 175]) {
      const screen = new THREE.Vector3(plane.x + x, plane.z + y, plane.y + z).project(camera);
      expect(Math.abs(screen.x)).toBeLessThan(.85); expect(Math.abs(screen.y)).toBeLessThan(.85); expect(screen.z).toBeLessThan(1);
    }
  });
  it('inherits aircraft movement exactly and damps orbit changes without a delayed translation', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, .05, 32000), rig = new FriendsVehicleCamera(), plane = new FriendsExpedition().vehicles().find(v=>v.kind==='aircraft')!;
    rig.update(camera, plane, -Math.PI / 2, 0, 16.67); const previous = camera.position.clone();
    plane.x += 100; plane.y += 80; plane.z += 500;
    rig.update(camera, plane, -Math.PI / 2, 0, 16.67);
    expect(camera.position.x - previous.x).toBeCloseTo(100); expect(camera.position.z - previous.z).toBeCloseTo(80); expect(camera.position.y - previous.y).toBeCloseTo(500);
    const beforeTurn = camera.position.clone(); rig.update(camera, plane, 0, 0, 16.67);
    expect(camera.position.distanceTo(beforeTurn)).toBeLessThan(150); expect(camera.position.x).toBeLessThan(plane.x - 500);
  });
});
