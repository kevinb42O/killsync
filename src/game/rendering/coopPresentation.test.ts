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
    const zone = scene.children.find(child => child.position.x === 6000 && child.position.z === 6000)!;
    const ring = zone.getObjectByName('ring') as THREE.Mesh;
    const dispose = vi.spyOn(ring.geometry, 'dispose');
    expect(ring.scale.x).toBe(76);
    visuals.update(snapshot, 750);
    expect(scene.children).toContain(zone);
    visuals.update({ ...snapshot, hazards: [] }, 1200);
    expect(scene.children).not.toContain(zone);
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
    const artillery = scene.children.find(child => child.position.x === 100) as THREE.Group;
    const shockwave = scene.children.find(child => child.position.x === 200) as THREE.Group;
    const ambush = scene.children.find(child => child.position.x === 300) as THREE.Group;
    expect(artillery.getObjectByName('inner')!.visible).toBe(true);
    expect((shockwave.getObjectByName('inner') as THREE.Mesh).scale.x).toBeGreaterThan((artillery.getObjectByName('inner') as THREE.Mesh).scale.x);
    expect(ambush.getObjectByName('marker')!.visible).toBe(true);
    expect(artillery.getObjectByName('marker')!.visible).toBe(false);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('gives every persistent class artifact a bespoke animated silhouette', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const snapshot = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]).createSnapshot();
    snapshot.buyStations = [];
    snapshot.artifactEffects = [
      { id: 101, kind: 'stormcall', ownerId: 'host', x: 100, y: 100, radius: 260, remainingMs: 1_000 },
      { id: 102, kind: 'dawnwall', ownerId: 'host', x: 200, y: 100, radius: 260, remainingMs: 5_000 },
      { id: 103, kind: 'hellseed', ownerId: 'host', x: 300, y: 100, radius: 200, remainingMs: 1_000 },
      { id: 104, kind: 'emberling', ownerId: 'host', x: 400, y: 100, radius: 32, remainingMs: 3_000 },
    ];

    visuals.update(snapshot, 500);
    const signatures = [100, 200, 300, 400].map(x => (scene.children.find(child => child.position.x === x) as THREE.Group).getObjectByName('artifact-signature') as THREE.Group);
    expect(signatures.map(signature => signature.userData.artifactKind)).toEqual(['stormcall-crown', 'dawnwall-bastion', 'hellseed-crown', 'emberling-core']);
    expect(new Set(signatures.map(signature => signature.children.length)).size).toBeGreaterThan(2);
    expect(signatures.every(signature => signature.scale.x > 20)).toBe(true);

    const rotations = signatures.map(signature => signature.rotation.y);
    visuals.update(snapshot, 800);
    expect(signatures.every((signature, index) => signature.rotation.y !== rotations[index])).toBe(true);
    visuals.dispose();
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

  it('uses a skyline-height, occlusion-proof beacon only for the accepted mission objective', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const snapshot = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]).createSnapshot();
    const site = snapshot.fieldMissions!.sites.find(candidate => candidate.kind === 'signal_hijack')!;
    site.state = 'active';
    snapshot.fieldMissions!.active = {
      ...site,
      stage: 'activate',
      progress: 0,
      required: 3_000,
      points: [{ id: 'relay', x: 4_000, y: 4_500, state: 'available' }],
      targetEnemyIds: [], guardEnemyIds: [], courierEnemyIds: [], drives: [],
      x: 4_000, y: 4_500,
    };

    visuals.update(snapshot, 500);
    const objective = scene.getObjectByName('field-mission-objective-beacon') as THREE.Group;
    const beam = objective.getObjectByName('beam') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
    const core = objective.getObjectByName('objective-core') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
    const bands = objective.getObjectByName('objective-bands') as THREE.Group;
    expect(beam.geometry.parameters.height).toBe(9_000);
    expect(beam.material.depthTest).toBe(false);
    expect(core.geometry.parameters.height).toBe(9_300);
    expect(core.material.depthTest).toBe(false);
    expect(bands.children).toHaveLength(11);
    expect(scene.getObjectByName('field-mission-pickup-beacon')).toBeDefined();

    snapshot.fieldMissions!.active.x = 5_000;
    snapshot.fieldMissions!.active.y = 5_500;
    visuals.update(snapshot, 800);
    expect(scene.getObjectByName('field-mission-objective-beacon')).toBe(objective);
    expect(objective.position.x).toBe(5_000);
    expect(objective.position.z).toBe(5_500);
    visuals.dispose();
  });

  it('shows demolition charge hardware, arming progress, armed countdown, and a destroyed site', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const snapshot = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]).createSnapshot();
    const site = snapshot.fieldMissions!.sites.find(candidate => candidate.kind === 'demolition')!;
    site.state = 'active';
    snapshot.fieldMissions!.active = {
      ...site, stage: 'plant_a', progress: 2_000, required: 4_000,
      points: [{ id: 'a', x: 3_000, y: 3_200, state: 'arming' }, { id: 'b', x: 5_000, y: 5_200, state: 'locked' }],
      targetEnemyIds: [], guardEnemyIds: [], courierEnemyIds: [], drives: [],
      x: 3_000, y: 3_200,
    };

    visuals.update(snapshot, 500);
    const charge = scene.children.find(child => child.name === 'demolition-charge-site') as THREE.Group;
    expect(charge).toBeDefined();
    expect(charge.getObjectByName('charge-body')?.visible).toBe(true);
    const segments = charge.userData.progressSegments as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
    expect(segments.filter(segment => segment.material.opacity > .5)).toHaveLength(8);

    snapshot.fieldMissions!.active.stage = 'defend_a';
    snapshot.fieldMissions!.active.progress = 10_000;
    snapshot.fieldMissions!.active.required = 20_000;
    snapshot.fieldMissions!.active.points[0].state = 'defending';
    snapshot.fieldMissions!.active.points[1].state = 'available';
    visuals.update(snapshot, 700);
    expect(scene.children.filter(child => child.name === 'demolition-charge-site')).toHaveLength(2);
    expect((charge.getObjectByName('charge-status') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.color.getHexString()).toBe('fef2f2');

    snapshot.fieldMissions!.active.points[0].state = 'completed';
    visuals.update(snapshot, 900);
    expect(charge.getObjectByName('charge-body')?.visible).toBe(false);
    expect(charge.getObjectByName('charge-crater')?.visible).toBe(true);
    visuals.dispose();
  });

  it('renders a readable hostage NPC and a separate recovery beacon while carried', () => {
    const scene = new THREE.Scene();
    const visuals = new CoopTacticalVisuals(scene);
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const snapshot = simulation.createSnapshot();
    const site = snapshot.fieldMissions!.sites.find(candidate => candidate.kind === 'hostage_recovery')!;
    site.state = 'active';
    snapshot.fieldMissions!.active = {
      ...site, stage: 'escort', progress: 0, required: 10_000,
      points: [{ id: 'hostage', x: 3_000, y: 3_200, state: 'completed' }, { id: 'recovery', x: 5_000, y: 5_200, state: 'available' }],
      targetEnemyIds: [], guardEnemyIds: [], courierEnemyIds: [], drives: [],
      x: 5_000, y: 5_200, hostage: { x: snapshot.players[0].x, y: snapshot.players[0].y, state: 'carried', carrierId: 'host' },
    };
    visuals.update(snapshot, 600);
    const hostage = scene.getObjectByName('field-mission-hostage-beacon') as THREE.Group;
    expect(hostage.getObjectByName('hostage-torso')).toBeDefined();
    expect(hostage.getObjectByName('hostage-head')).toBeDefined();
    expect(hostage.getObjectByName('hostage-restraint')?.visible).toBe(false);
    const recovery = scene.getObjectByName('field-mission-exfil-beacon') as THREE.Group;
    expect(recovery.position.x).toBe(5_000);
    expect(recovery.position.z).toBe(5_200);
    expect((recovery.getObjectByName('ring') as THREE.Mesh).scale.x).toBeGreaterThan(100);
    visuals.dispose();
  });
});
