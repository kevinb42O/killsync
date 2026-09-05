import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createCoopOperatorRig,
  updateCoopOperatorRig,
  disposeCoopOperatorRig,
} from './coopOperatorVisuals';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';

const createMockPlayer = (overrides: Partial<CoopPlayerSnapshot> = {}): CoopPlayerSnapshot => ({
  id: 'remote-1',
  label: 'Shadow',
  color: '#38bdf8',
  x: 500,
  y: 600,
  z: 0,
  angle: 0,
  health: 100,
  maxHealth: 100,
  selectedSlot: 0,
  selectedWeaponId: 'plasma_gun',
  weaponStates: [{
    weaponId: 'plasma_gun',
    level: 1,
    magazineAmmo: 12,
    reserveAmmo: 72,
    nextFireAtMs: 0,
    state: 'ready',
  }],
  weaponLevels: [1],
  selectedWeaponLevel: 1,
  isAiming: false,
  isReloading: false,
  isSwitching: false,
  sprinting: false,
  sliding: false,
  crouching: false,
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  coins: 0,
  pendingDataCores: 0,
  lifeState: 'alive',
  downedRemainingMs: 0,
  reviveProgressMs: 0,
  invulnerableRemainingMs: 0,
  selfRevives: 0,
  selfReviveProgressMs: 0,
  armorTier: 0,
  armorHp: 0,
  gasMaskHp: 0,
  gasMaskMaxHp: 100,
  passiveModules: [],
  ...overrides,
});

describe('CoopOperatorVisuals', () => {
  it('creates an articulated cybernetic operator rig preserving pill shape with rich details', () => {
    const rig = createCoopOperatorRig('#22d3ee', 'Ghost');

    expect(rig.root).toBeInstanceOf(THREE.Group);
    expect(rig.avatar).toBeInstanceOf(THREE.Group);
    expect(rig.bodyMesh).toBeInstanceOf(THREE.Mesh);
    expect(rig.browMesh).toBeInstanceOf(THREE.Mesh);
    expect(rig.visorMesh).toBeInstanceOf(THREE.Mesh);
    expect(rig.eyesGroup).toBeInstanceOf(THREE.Group);
    expect(rig.eyeLeft).toBeInstanceOf(THREE.Mesh);
    expect(rig.eyeRight).toBeInstanceOf(THREE.Mesh);
    expect(rig.pupilLeft).toBeInstanceOf(THREE.Mesh);
    expect(rig.pupilRight).toBeInstanceOf(THREE.Mesh);
    expect(rig.chestPlate).toBeInstanceOf(THREE.Mesh);
    expect(rig.biometricCore).toBeInstanceOf(THREE.Mesh);
    expect(rig.thrusterGroup).toBeInstanceOf(THREE.Group);
    expect(rig.thrusterFlames.length).toBe(2);
    expect(rig.nameplate).toBeInstanceOf(THREE.Sprite);
    expect(rig.firearm).toBeDefined();

    // Verify root is located at standing height
    expect(rig.avatar.position.y).toBe(29);
    expect(rig.nameplate.position.y).toBe(62);

    // Verify bounding box is finite and realistic
    const bounds = new THREE.Box3().setFromObject(rig.root);
    expect(bounds.isEmpty()).toBe(false);
    expect(Number.isFinite(bounds.max.y)).toBe(true);
    expect(bounds.max.y).toBeGreaterThan(50);
  });

  it('shares geometries across multiple operators without duplicate allocations', () => {
    const rigA = createCoopOperatorRig('#f472b6', 'Alpha');
    const rigB = createCoopOperatorRig('#fbbf24', 'Beta');

    // Body capsule and details must share geometry instances
    expect(rigA.bodyMesh.geometry).toBe(rigB.bodyMesh.geometry);
    expect(rigA.eyeLeft.geometry).toBe(rigB.eyeLeft.geometry);
    expect(rigA.pupilLeft.geometry).toBe(rigB.pupilLeft.geometry);
    expect(rigA.chestPlate.geometry).toBe(rigB.chestPlate.geometry);
    expect(rigA.biometricCore.geometry).toBe(rigB.biometricCore.geometry);
    expect(rigA.thrusterFlames[0].geometry).toBe(rigB.thrusterFlames[0].geometry);

    // Each rig has distinct player team color materials
    expect(rigA.armorMaterial).not.toBe(rigB.armorMaterial);
    expect(rigA.glowMaterial).not.toBe(rigB.glowMaterial);

    // Disposing rigA must NOT dispose the shared geometries
    const sharedDispose = vi.spyOn(rigA.bodyMesh.geometry, 'dispose');
    disposeCoopOperatorRig(rigA);
    expect(sharedDispose).not.toHaveBeenCalled();

    disposeCoopOperatorRig(rigB);
  });

  it('preserves pill shape compression when crouching or sliding', () => {
    const rig = createCoopOperatorRig('#34d399', 'Rogue');
    const player = createMockPlayer({ crouching: true });

    updateCoopOperatorRig(rig, player, 1000, 16.666);
    expect(rig.root.scale.y).toBeCloseTo(0.62);
    expect(rig.root.scale.z).toBeCloseTo(1.16);

    // Standing restores 1.0 scale
    updateCoopOperatorRig(rig, { ...player, crouching: false, sliding: false }, 1050, 16.666);
    expect(rig.root.scale.y).toBe(1.0);
    expect(rig.root.scale.z).toBe(1.0);

    // Sliding also applies low-profile squash
    updateCoopOperatorRig(rig, { ...player, crouching: false, sliding: true }, 1100, 16.666);
    expect(rig.root.scale.y).toBeCloseTo(0.62);

    disposeCoopOperatorRig(rig);
  });

  it('rolls into prone position and activates emergency hazard strobe when downed', () => {
    const rig = createCoopOperatorRig('#a78bfa', 'Viper');
    const player = createMockPlayer({ lifeState: 'downed', downedRemainingMs: 30000 });

    updateCoopOperatorRig(rig, player, 1200, 16.666);

    // Avatar rolls to ground resting level
    expect(rig.avatar.position.y).toBe(14);
    expect(rig.avatar.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(rig.downedMarker.visible).toBe(true);
    expect(rig.firearm.group.visible).toBe(false);
    expect(rig.nameplate.position.y).toBe(32);

    // Thruster flames shut off when downed
    expect(rig.thrusterFlames[0].visible).toBe(false);

    // Eyes switch to hazard amber color
    expect(rig.glowMaterial.color.getHexString()).toBe('f59e0b');

    disposeCoopOperatorRig(rig);
  });

  it('focuses cybernetic ocular eyes when aiming', () => {
    const rig = createCoopOperatorRig('#38bdf8', 'Sniper');
    const normalPlayer = createMockPlayer({ isAiming: false });
    updateCoopOperatorRig(rig, normalPlayer, 1000, 16.666);

    const normalPupilScale = rig.pupilLeft.scale.x;

    const aimingPlayer = createMockPlayer({ isAiming: true });
    updateCoopOperatorRig(rig, aimingPlayer, 1050, 16.666);

    // Eye aperture narrows vertically into focused squint and pupil expands
    expect(rig.eyeLeft.scale.y).toBeLessThan(1.0);
    expect(rig.pupilLeft.scale.x).toBeGreaterThan(normalPupilScale);

    disposeCoopOperatorRig(rig);
  });

  it('flares jump thrusters during sprints, slides, and airborne jumps', () => {
    const rig = createCoopOperatorRig('#f59e0b', 'Jet');
    const idlePlayer = createMockPlayer();
    updateCoopOperatorRig(rig, idlePlayer, 1000, 16.666);
    const idleLength = rig.thrusterFlames[0].scale.y;

    // Airborne jump
    const jumpPlayer = createMockPlayer({ z: 12 });
    updateCoopOperatorRig(rig, jumpPlayer, 1050, 16.666);
    expect(rig.thrusterFlames[0].scale.y).toBeGreaterThan(idleLength * 2);

    // Sliding
    const slidePlayer = createMockPlayer({ sliding: true });
    updateCoopOperatorRig(rig, slidePlayer, 1100, 16.666);
    expect(rig.thrusterFlames[0].scale.y).toBeGreaterThan(idleLength * 1.5);

    // Verify fire red/orange material and core flames
    const flameMat = rig.thrusterFlames[0].material as THREE.MeshBasicMaterial;
    expect(flameMat.color.getHexString()).toBe('ff3b00');
    expect(rig.thrusterCoreFlames).toBeDefined();
    expect(rig.thrusterCoreFlames!.length).toBe(2);

    disposeCoopOperatorRig(rig);
  });

  it('charges biometric reactor core with mint/cyan surge during teammate revive', () => {
    const rig = createCoopOperatorRig('#22d3ee', 'Ally');
    const revivingPlayer = createMockPlayer({
      lifeState: 'downed',
      reviveProgressMs: 1500,
      reviverId: 'local',
    });

    updateCoopOperatorRig(rig, revivingPlayer, 2000, 16.666);
    expect(rig.glowMaterial.color.getHexString()).toBe('5eead4');
    expect(rig.biometricCore.scale.x).toBeGreaterThan(1.0);

    disposeCoopOperatorRig(rig);
  });
});
