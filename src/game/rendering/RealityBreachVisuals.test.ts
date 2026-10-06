import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RealityBreachVisuals, createBreachCathedral } from './RealityBreachVisuals';
import type { CoopRealityBreachSnapshot } from '../multiplayer/CoopRealityBreach';

const breach = (): CoopRealityBreachSnapshot => ({ cycle: 1, phase: 'linking', x: 6000, y: 6000, requiredAnchors: 3, linkedAnchors: 3,
  progressMs: 4000, remainingMs: 40_000, reward: 160,
  anchors: [{ id: 1, x: 5600, y: 6000, occupantId: 'a' }, { id: 2, x: 6200, y: 5600, occupantId: 'b' }, { id: 3, x: 6200, y: 6400, occupantId: 'c' }] });

describe('Reality Breach presentation', () => {
  it('keeps the suspended cathedral above player jump clearance', () => {
    const cathedral = createBreachCathedral();
    const bounds = new THREE.Box3().setFromObject(cathedral);
    expect(bounds.min.y).toBeGreaterThan(320);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(1700);
    expect(cathedral.getObjectByName('cathedral-debris')).toBeDefined();
  });

  it('builds bounded anchor/circuit visuals, transitions the pulse, and cleans the scene', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const visuals = new RealityBreachVisuals(scene);
    const state = breach();
    visuals.update(state, 22_000, camera);
    expect(visuals.root.visible).toBe(true);
    const fields = visuals.root.children.filter(child => (child as THREE.Mesh).geometry instanceof THREE.BoxGeometry);
    expect(fields).toHaveLength(3);
    expect(fields.every(field => field.visible)).toBe(true);
    expect(fields.every(field => field.scale.x > 0 && field.scale.z === 52)).toBe(true);
    visuals.update({ ...state, phase: 'overdrive', remainingMs: 11_400 }, 26_600, camera);
    expect(fields.every(field => !field.visible)).toBe(true);
    visuals.root.traverse(child => {
      expect([child.position.x, child.position.y, child.position.z, child.scale.x, child.scale.y, child.scale.z].every(Number.isFinite)).toBe(true);
    });
    visuals.update(undefined, 27_000, camera);
    expect(visuals.root.visible).toBe(false);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
