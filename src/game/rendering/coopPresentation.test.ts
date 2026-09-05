import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CoopSimulation } from '../multiplayer/CoopSimulation';
import { CoopTacticalVisuals } from './CoopTacticalVisuals';
import { animateCoopEnemyRig, createCoopEnemyRig } from './coopEnemyVisuals';
import type { Enemy } from '../../types';

describe('co-op presentation', () => {
  it.each(['basic', 'fast', 'tank', 'ranged', 'elite', 'phantom', 'titan'] as const)('builds and animates a finite %s rig', type => {
    const enemy: Enemy = { id: 'coop-enemy-12', type, radius: 25, color: '#fb7185', health: 50, maxHealth: 100, damage: 10, speed: 100, experienceValue: 5, position: { x: 6000, y: 6000 }, velocity: { x: 0, y: 0 }, presentationFacingAngle: Math.PI / 2 };
    const rig = createCoopEnemyRig(enemy);
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
});