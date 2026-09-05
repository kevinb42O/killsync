import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CoopSimulation } from '../multiplayer/CoopSimulation';
import { CoopTacticalVisuals } from './CoopTacticalVisuals';
import { animateCoopEnemyRig, createCoopEnemyRig, disposeCoopEnemyRig } from './coopEnemyVisuals';
import type { Enemy } from '../../types';

describe('co-op presentation', () => {
  it.each(['basic', 'fast', 'tank', 'ranged', 'elite', 'phantom', 'titan'] as const)('builds and animates a finite %s rig', type => {
    const enemy: Enemy = { id: 'coop-enemy-12', type, radius: 25, color: '#fb7185', health: 50, maxHealth: 100, damage: 10, speed: 100, experienceValue: 5, position: { x: 6000, y: 6000 }, velocity: { x: 0, y: 0 }, presentationFacingAngle: Math.PI / 2 };
    const rig = createCoopEnemyRig(enemy);
    rig.userData.coopRig.createdAt = 900;
    const camera = new THREE.PerspectiveCamera();
    animateCoopEnemyRig(rig, enemy, camera, 1000);
    expect(rig.rotation.y).toBeCloseTo(0);
    const bounds = new THREE.Box3().setFromObject(rig);
    expect(bounds.isEmpty()).toBe(false);
    expect(Number.isFinite(bounds.max.y)).toBe(true);
    const initialLimbAngle = rig.userData.coopRig.limbs[0].rotation.x;
    animateCoopEnemyRig(rig, enemy, camera, 1100);
    expect(rig.userData.coopRig.limbs[0].rotation.x).not.toBe(initialLimbAngle);
    animateCoopEnemyRig(rig, { ...enemy, presentationDeathProgress: .8 }, camera, 1200);
    expect(rig.scale.x).toBeLessThan(.5);
    expect(rig.userData.coopRig.deathFx.visible).toBe(true);
    expect(rig.userData.coopRig.deathRings.instanceMatrix.version).toBeGreaterThan(0);
    expect(rig.userData.coopRig.deathBeam.visible).toBe(true);
  });

  it('shares horde geometry while retaining per-rig mutable materials', () => {
    const enemy: Enemy = { id: 'coop-enemy-a', type: 'basic', radius: 15, color: '#f44', health: 12, maxHealth: 12, damage: 10, speed: 1, experienceValue: 5, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
    const first = createCoopEnemyRig(enemy), second = createCoopEnemyRig({ ...enemy, id: 'coop-enemy-b' });
    const firstBody = first.userData.coopRig.body as THREE.Mesh;
    const secondBody = second.userData.coopRig.body as THREE.Mesh;
    expect(firstBody.geometry).toBe(secondBody.geometry);
    expect(firstBody.material).not.toBe(secondBody.material);
    const sharedDispose = vi.spyOn(firstBody.geometry, 'dispose');
    disposeCoopEnemyRig(first);
    expect(sharedDispose).not.toHaveBeenCalled();
  });

  it('reuses telegraph meshes, scales danger accurately, and disposes removed zones', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const snapshot = simulation.createSnapshot();
    snapshot.hazards = [{ id: 10, enemyId: 20, kind: 'artillery', x: 6000, y: 6000, radius: 76, startsAtMs: 0, resolvesAtMs: 1000, color: '#4ade80' }];
    visuals.update(snapshot, 500);
    const zone = scene.children[0];
    const ring = zone.getObjectByName('ring') as THREE.Mesh;
    const dispose = vi.spyOn(ring.geometry, 'dispose');
    expect(ring.scale.x).toBe(76);
    visuals.update(snapshot, 750);
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).toBe(zone);
    visuals.update({ ...snapshot, hazards: [] }, 1200);
    expect(scene.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('gives artillery, shockwaves, and relocation attacks distinct warning motion', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const snapshot = simulation.createSnapshot();
    snapshot.hazards = [
      { id: 1, enemyId: 11, kind: 'artillery', x: 100, y: 100, radius: 76, startsAtMs: 0, resolvesAtMs: 1000, color: '#4ade80' },
      { id: 2, enemyId: 12, kind: 'shockwave', x: 200, y: 100, radius: 165, startsAtMs: 0, resolvesAtMs: 1000, color: '#fbbf24' },
      { id: 3, enemyId: 13, kind: 'ambush', x: 300, y: 100, radius: 82, startsAtMs: 0, resolvesAtMs: 1000, color: '#e2e8f0' },
    ];
    visuals.update(snapshot, 500);
    const artillery = scene.children[0] as THREE.Group;
    const shockwave = scene.children[1] as THREE.Group;
    const ambush = scene.children[2] as THREE.Group;
    expect(artillery.getObjectByName('inner')!.visible).toBe(true);
    expect((shockwave.getObjectByName('inner') as THREE.Mesh).scale.x).toBeGreaterThan((artillery.getObjectByName('inner') as THREE.Mesh).scale.x);
    expect(ambush.getObjectByName('marker')!.visible).toBe(true);
    expect(artillery.getObjectByName('marker')!.visible).toBe(false);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
