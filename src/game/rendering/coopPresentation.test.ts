import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CoopSimulation } from '../multiplayer/CoopSimulation';
import { CoopTacticalVisuals } from './CoopTacticalVisuals';
import { animateCoopEnemyRig, createCoopEnemyRig, disposeCoopEnemyRig } from './coopEnemyVisuals';
import { createCoopOperatorRig, disposeCoopOperatorRig, updateCoopOperatorRig } from './coopOperatorVisuals';
import type { Enemy } from '../../types';

describe('co-op presentation', () => {
  it('renders an eliminated operator only while the client-side fall presentation is active', () => {
    const player = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]).createSnapshot().players[0];
    player.lifeState = 'eliminated'; player.health = 0; player.z = -450;
    const rig = createCoopOperatorRig(player.color, player.label);

    updateCoopOperatorRig(rig, player, 1000, 16.666, .5);
    expect(rig.root.visible).toBe(true);
    expect(rig.root.position.y).toBe(-450);
    expect(rig.avatar.rotation.x).not.toBe(0);
    expect(rig.firearm.group.visible).toBe(false);
    expect(rig.nameplate.visible).toBe(false);

    updateCoopOperatorRig(rig, player, 1100, 16.666);
    expect(rig.root.visible).toBe(false);
    disposeCoopOperatorRig(rig);
  });

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

  it('keeps a titan silhouette while pulsing only its luminous rim and core on hit', () => {
    const enemy: Enemy = { id: 'coop-boss', type: 'titan', radius: 88, color: '#fb7185', health: 900, maxHealth: 1000, damage: 42, speed: 70, experienceValue: 700, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, hitFlash: 80 };
    const rig = createCoopEnemyRig(enemy);
    rig.userData.coopRig.createdAt = 0;
    animateCoopEnemyRig(rig, enemy, new THREE.PerspectiveCamera(), 1000);

    const armor = rig.userData.coopRig.armor as THREE.MeshStandardMaterial;
    const glow = rig.userData.coopRig.glow as THREE.MeshBasicMaterial;
    const core = rig.userData.coopRig.core as THREE.Mesh;
    expect(armor.emissive.getHexString()).toBe('fb7185');
    expect(armor.emissiveIntensity).toBeLessThan(1);
    expect(glow.color.getHexString()).toBe('ffe7a3');
    expect(core.scale.x).toBeGreaterThan(1.3);
    disposeCoopEnemyRig(rig);
  });

  it('reuses telegraph meshes, scales danger accurately, and disposes removed zones', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const snapshot = simulation.createSnapshot();
    snapshot.buyStations = [];
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
    snapshot.buyStations = [];
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

  it('renders every revealed capture site identically with compact segmented progress', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const snapshot = simulation.createSnapshot();
    visuals.update(snapshot, 0);
    const first = scene.children.find(child => child.position.x === snapshot.buyStations[0].x) as THREE.Group;
    const firstBase = first.getObjectByName('capture-base') as THREE.Mesh;
    expect(firstBase.position.y).toBe(3.5);
    expect(first.getObjectByName('capture-progress-0')).toBeDefined();
    expect(first.getObjectByName('capture-progress-11')).toBeDefined();
    expect(first.getObjectByName('progress')).toBeUndefined();
    const locator = first.getObjectByName('capture-locator') as THREE.Mesh;
    expect((locator.geometry as THREE.CylinderGeometry).parameters.height).toBe(6_500);
    expect((locator.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    expect((locator.material as THREE.MeshBasicMaterial).depthWrite).toBe(false);
    const firstPartNames = first.children.flatMap(child => child.name || child.children.map(nested => nested.name)).filter(Boolean);

    snapshot.buyStations[1] = { ...snapshot.buyStations[1], state: 'available' };
    visuals.update(snapshot, 50);
    const second = scene.children.find(child => child.position.x === snapshot.buyStations[1].x) as THREE.Group;
    const secondPartNames = second.children.flatMap(child => child.name || child.children.map(nested => nested.name)).filter(Boolean);
    expect(secondPartNames).toEqual(firstPartNames);
    expect(second.getObjectByName('capture-signal')!.visible).toBe(true);
    expect((second.getObjectByName('ring') as THREE.Mesh).scale.x).toBe(snapshot.buyStations[1].captureRadius);
    visuals.dispose();
  });
});
