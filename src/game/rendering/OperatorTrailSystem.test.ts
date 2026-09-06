import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { OperatorTrailSystem } from './OperatorTrailSystem';

const systems: OperatorTrailSystem[] = [];

function player(overrides: Partial<CoopPlayerSnapshot> = {}): CoopPlayerSnapshot {
  return {
    id: 'operator-1',
    x: 0,
    y: 0,
    z: 0,
    sprinting: false,
    sliding: false,
    lifeState: 'alive',
    ...overrides,
  } as CoopPlayerSnapshot;
}

function visibleRings(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.visible,
  );
}

afterEach(() => {
  for (const system of systems.splice(0)) system.dispose();
});

describe('OperatorTrailSystem', () => {
  it('does not stamp ground rings while airborne or on the landing frame', () => {
    const scene = new THREE.Scene();
    const system = new OperatorTrailSystem(scene);
    systems.push(system);

    system.update([player({ z: 18 })], 0, 16);
    system.update([player({ x: 12, z: 18 })], 100, 16);
    system.update([player({ x: 24, z: 18 })], 200, 16);
    expect(visibleRings(scene)).toHaveLength(0);

    system.update([player({ x: 24, z: 0 })], 300, 16);
    expect(visibleRings(scene)).toHaveLength(0);

    system.update([player({ x: 30, z: 0 })], 400, 16);
    const rings = visibleRings(scene);
    expect(rings).toHaveLength(1);
    expect((rings[0].material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x38bdf8);
  });

  it('preserves the orange ground trail for an actual slide', () => {
    const scene = new THREE.Scene();
    const system = new OperatorTrailSystem(scene);
    systems.push(system);

    system.update([player()], 0, 16);
    system.update([player({ x: 12, sliding: true })], 100, 16);

    const rings = visibleRings(scene);
    expect(rings).toHaveLength(1);
    expect((rings[0].material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xf97316);
  });

  it('never renders or retains a trail for the camera-owned operator', () => {
    const scene = new THREE.Scene();
    const system = new OperatorTrailSystem(scene);
    systems.push(system);

    system.update([player()], 0, 16);
    system.update([player({ x: 12, sliding: true })], 100, 16);
    expect(visibleRings(scene)).toHaveLength(1);

    system.update([player({ x: 18, sliding: true })], 116, 16, 'operator-1');
    expect(visibleRings(scene)).toHaveLength(0);

    system.update([player({ x: 30, sliding: true })], 220, 16, 'operator-1');
    expect(visibleRings(scene)).toHaveLength(0);
  });
});
