import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../types';
import { animateCoopEnemyRig, CoopEnemyBatchRenderer, createCoopEnemyRig, disposeCoopEnemyRig } from './coopEnemyVisuals';

function enemy(id: string, x: number, type: Enemy['type'] = 'basic'): Enemy {
  return {
    id, position: { x, y: 0 }, velocity: { x: 0, y: 0 }, radius: 16,
    health: 50, maxHealth: 50, color: '#fb7185', damage: 10, speed: 100,
    experienceValue: 5, type, hitFlash: 0, slowMultiplier: 1,
    presentationFacingAngle: 0, presentationDeathProgress: 0, presentationAttackCharge: 0,
  };
}

describe('CoopEnemyBatchRenderer', () => {
  it('batches complete opaque ordinary-enemy geometry while retaining transparent effects', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 30, 0);
    const renderer = new CoopEnemyBatchRenderer(scene);
    const unit = enemy('coop-enemy-1', 300);
    const rig = createCoopEnemyRig(unit);
    scene.add(rig);

    renderer.beginFrame();
    renderer.prepareRig(rig);
    animateCoopEnemyRig(rig, unit, camera, Date.now() + 500);
    expect(renderer.add(unit, rig)).toBe(true);
    expect(renderer.endFrame().has(unit.id)).toBe(true);
    expect(renderer.activeEnemyCount).toBe(1);
    const originalOpaqueMeshes: THREE.Mesh[] = [];
    const originalTransparentMeshes: THREE.Mesh[] = [];
    rig.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      (material.transparent ? originalTransparentMeshes : originalOpaqueMeshes).push(node);
    });
    expect(originalOpaqueMeshes.every(mesh => !mesh.visible)).toBe(true);
    expect(originalTransparentMeshes.length).toBeGreaterThan(0);
    expect(scene.children.some(child => child instanceof THREE.InstancedMesh && child.visible)).toBe(true);

    renderer.prepareRig(rig);
    expect(originalOpaqueMeshes.some(mesh => mesh.visible)).toBe(true);
    const elite = enemy('coop-enemy-2', 300, 'elite');
    const eliteRig = createCoopEnemyRig(elite);
    expect(renderer.add(elite, eliteRig)).toBe(false);
    disposeCoopEnemyRig(eliteRig);

    renderer.dispose();
    scene.remove(rig); disposeCoopEnemyRig(rig);
    expect(scene.children).toHaveLength(0);
  });
});
