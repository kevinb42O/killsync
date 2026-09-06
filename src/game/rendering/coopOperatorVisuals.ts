import * as THREE from 'three';
import { CoopFirearmVisualRig } from './coopFirearmVisuals';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { getCoopSkin, type CoopSkinDefinition, type CoopSkinId } from '../multiplayer/CoopSkins';

export interface CoopOperatorRig {
  root: THREE.Group;
  /** Backward-compatible alias for root */
  mesh: THREE.Group;
  avatar: THREE.Group;
  bodyMesh: THREE.Mesh;
  browMesh: THREE.Mesh;
  visorMesh: THREE.Mesh;
  eyesGroup: THREE.Group;
  eyeLeft: THREE.Mesh;
  eyeRight: THREE.Mesh;
  pupilLeft: THREE.Mesh;
  pupilRight: THREE.Mesh;
  chestPlate: THREE.Mesh;
  biometricCore: THREE.Mesh;
  thrusterGroup: THREE.Group;
  thrusterFlames: THREE.Mesh[];
  thrusterCoreFlames?: THREE.Mesh[];
  commsLed: THREE.Mesh;
  firearm: CoopFirearmVisualRig;
  nameplate: THREE.Sprite;
  downedMarker: THREE.Group;
  armorMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  downedMarkerMaterial: THREE.MeshBasicMaterial;
  commsLedMaterial: THREE.MeshBasicMaterial;
  skin: CoopSkinDefinition;
  ownedMaterials: THREE.Material[];
  /** Fixed-budget premium signature: one aura mesh plus one 16-point draw call. */
  premiumEffect?: THREE.Group;
  premiumAuraMaterial?: THREE.MeshBasicMaterial;
  premiumParticleMaterial?: THREE.PointsMaterial;
  lastBlinkAtMs: number;
  lastDoubleJumpSequence: number;
  doubleJumpFlareRemainingMs: number;
}

const sharedGeom = <T extends THREE.BufferGeometry>(geom: T): T => {
  geom.userData.coopOperatorShared = true;
  return geom;
};

const createPremiumOrbitGeometry = () => {
  const positions = new Float32Array(16 * 3);
  for (let index = 0; index < 16; index++) {
    const angle = index / 16 * Math.PI * 4;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * (18 + (index % 3) * 1.7);
    positions[offset + 1] = -22 + index / 15 * 44;
    positions[offset + 2] = Math.sin(angle) * (18 + (index % 3) * 1.7);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return sharedGeom(geometry);
};

// Global shared geometries — instantiated once, never duplicated per player.
const GEOMETRY = {
  // Base iconic pill silhouette: radius 13, cylinder height 28 -> total height 54
  capsuleBody: sharedGeom(new THREE.CapsuleGeometry(13, 28, 6, 16)),
  
  // Tactical helmet brow cowl & visor shield
  browCowl: sharedGeom(new THREE.BoxGeometry(20, 5, 8)),
  visorShield: sharedGeom(new THREE.CylinderGeometry(11.8, 12.6, 9.5, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84)),
  
  // High-tech cybernetic ocular optics ("EYES")
  eyeAperture: sharedGeom(new THREE.TorusGeometry(2.3, 0.45, 6, 14)),
  eyeLens: sharedGeom(new THREE.BoxGeometry(3.6, 2.0, 0.8)),
  eyePupil: sharedGeom(new THREE.BoxGeometry(1.4, 1.4, 0.9)),
  
  // Tactical rebreather / lower jaw intake grill
  rebreather: sharedGeom(new THREE.BoxGeometry(10, 4.5, 3.5)),
  rebreatherSlat: sharedGeom(new THREE.BoxGeometry(8, 0.7, 0.8)),
  
  // Over-ear comms headset
  commsEar: sharedGeom(new THREE.CylinderGeometry(3.5, 3.5, 2.2, 10)),
  commsAntenna: sharedGeom(new THREE.CylinderGeometry(0.35, 0.35, 7.5, 6)),
  commsBeacon: sharedGeom(new THREE.SphereGeometry(0.75, 8, 6)),
  
  // Ballistic chest rig & biometric reactor core
  chestPlate: sharedGeom(new THREE.BoxGeometry(19, 13, 5)),
  chestStrap: sharedGeom(new THREE.BoxGeometry(3.4, 17, 1.2)),
  biometricCore: sharedGeom(new THREE.CylinderGeometry(2.6, 2.6, 1.2, 14)),
  coreRing: sharedGeom(new THREE.TorusGeometry(3.1, 0.4, 6, 16)),
  
  // Shoulder pauldrons (deltoid armor)
  pauldron: sharedGeom(new THREE.BoxGeometry(5.5, 9, 8)),
  
  // Tactical arms framing the weapon stance
  upperArm: sharedGeom(new THREE.BoxGeometry(4.2, 10, 4.5)),
  foreArm: sharedGeom(new THREE.BoxGeometry(3.8, 11, 4.0)),
  
  // Waist utility belt & gear pouches
  beltRing: sharedGeom(new THREE.TorusGeometry(13.2, 1.1, 6, 24)),
  beltPouch: sharedGeom(new THREE.BoxGeometry(4, 5.5, 3)),
  powerCell: sharedGeom(new THREE.CylinderGeometry(1.6, 1.6, 6, 8)),
  
  // Knee armor guards
  kneePlate: sharedGeom(new THREE.BoxGeometry(5.8, 6.5, 3.2)),
  
  // Jump thruster pack & large fire red/orange exhausts
  thrusterBody: sharedGeom(new THREE.BoxGeometry(16, 12, 6.5)),
  thrusterNozzle: sharedGeom(new THREE.CylinderGeometry(2.6, 3.8, 5.0, 10)),
  thrusterFlame: sharedGeom(new THREE.ConeGeometry(3.6, 14.0, 10)),
  thrusterCoreFlame: sharedGeom(new THREE.ConeGeometry(2.0, 10.0, 8)),
  
  // Downed revive markers
  downedRing: sharedGeom(new THREE.TorusGeometry(31, 1.8, 8, 40)),
  downedCross: sharedGeom(new THREE.BoxGeometry(42, 1.4, 2)),
  premiumOrbit: createPremiumOrbitGeometry(),
};

const sharedWhiteCoreMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  toneMapped: false,
});
sharedWhiteCoreMaterial.userData.coopOperatorShared = true;

/**
 * Creates an attractive, detailed, highly performant co-op operator 3D rig.
 * Preserves the iconic pill shape and crouching compression while adding:
 * - Expressive cybernetic ocular optics ("EYES") with living blinks and aim focus
 * - Layered tactical color palette (stealth undersuit + team armor + titanium trims)
 * - Sculpted helmet brow cowl, curved visor shield, and comms headset
 * - Ballistic chest rig with reactive biometric life core
 * - Dual-exhaust jump-jet pack with dynamic ion plasma flare
 */
export function createCoopOperatorRig(color: string, label: string, skinId?: CoopSkinId): CoopOperatorRig {
  const root = new THREE.Group();
  root.name = `coop-operator:${label}`;

  // Dedicated avatar container centered at y = 29.
  // When standing, avatar is at (0, 29, 0).
  // When downed, avatar rolls smoothly onto its side at (0, 14, 0) with Z-rotation 90°.
  const avatar = new THREE.Group();
  avatar.name = 'avatar-chassis';
  avatar.position.set(0, 29, 0);
  root.add(avatar);

  // Per-player materials
  const playerColor = new THREE.Color(color);
  const skin = getCoopSkin(skinId);
  const { palette, material } = skin;
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: palette.armor,
    metalness: material.metalness,
    roughness: material.roughness,
    emissive: palette.glow,
    emissiveIntensity: material.emissiveIntensity,
  });

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: palette.glow,
    toneMapped: false,
  });

  const commsLedMaterial = new THREE.MeshBasicMaterial({
    color: palette.glow,
    toneMapped: false,
  });

  const downedMarkerMaterial = new THREE.MeshBasicMaterial({
    color: playerColor,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const undersuitMaterial = new THREE.MeshStandardMaterial({ color: palette.undersuit, metalness: .32, roughness: .58 });
  const carbonMaterial = new THREE.MeshStandardMaterial({ color: palette.webbing, metalness: skin.tier === 'premium' ? .82 : .65, roughness: skin.tier === 'premium' ? .16 : .28 });
  const visorGlassMaterial = new THREE.MeshStandardMaterial({ color: palette.visor, emissive: palette.glow, emissiveIntensity: skin.tier === 'premium' ? .3 : .08, metalness: .95, roughness: skin.tier === 'premium' ? .03 : .08 });
  const titaniumMaterial = new THREE.MeshStandardMaterial({ color: palette.trim, metalness: .88, roughness: skin.tier === 'premium' ? .12 : .22 });
  const webbingMaterial = new THREE.MeshStandardMaterial({ color: palette.webbing, metalness: .12, roughness: .85 });
  const fireOuterMaterial = new THREE.MeshBasicMaterial({ color: palette.thrusterOuter, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false });
  const fireCoreMaterial = new THREE.MeshBasicMaterial({ color: palette.thrusterCore, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const ownedMaterials: THREE.Material[] = [armorMaterial, glowMaterial, commsLedMaterial, downedMarkerMaterial, undersuitMaterial, carbonMaterial, visorGlassMaterial, titaniumMaterial, webbingMaterial, fireOuterMaterial, fireCoreMaterial];
  let premiumEffect: THREE.Group | undefined;
  let premiumAuraMaterial: THREE.MeshBasicMaterial | undefined;
  let premiumParticleMaterial: THREE.PointsMaterial | undefined;
  if (skin.tier === 'premium') {
    premiumEffect = new THREE.Group();
    premiumEffect.name = `premium-signature:${skin.id}`;
    premiumAuraMaterial = new THREE.MeshBasicMaterial({
      color: palette.glow,
      transparent: true,
      opacity: skin.id === 'black_ice' ? .09 : .075,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
      toneMapped: false,
    });
    const aura = new THREE.Mesh(GEOMETRY.capsuleBody, premiumAuraMaterial);
    aura.scale.set(1.2, 1.08, 1.2);
    premiumEffect.add(aura);

    premiumParticleMaterial = new THREE.PointsMaterial({
      color: skin.id === 'black_ice' ? palette.thrusterCore : palette.trim,
      size: skin.id === 'black_ice' ? 2.35 : 2.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: .88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    premiumEffect.add(new THREE.Points(GEOMETRY.premiumOrbit, premiumParticleMaterial));
    premiumEffect.rotation.x = skin.id === 'black_ice' ? .18 : -.12;
    avatar.add(premiumEffect);
    ownedMaterials.push(premiumAuraMaterial, premiumParticleMaterial);
  }

  // 1. BASE PILL BODY (Stealth nanoweave undersuit)
  const bodyMesh = new THREE.Mesh(GEOMETRY.capsuleBody, undersuitMaterial);
  avatar.add(bodyMesh);

  // Aerodynamic cyber-accent racing stripes on the flanks in team color
  for (const side of [-1, 1]) {
    const flankStripe = new THREE.Mesh(GEOMETRY.chestStrap, armorMaterial);
    flankStripe.scale.set(0.6, 1.4, 0.8);
    flankStripe.position.set(side * 12.8, 0, 0);
    flankStripe.rotation.z = side * -0.04;
    avatar.add(flankStripe);
  }

  // 2. TACTICAL HELMET & VISOR
  // Curved smoked visor shield
  const visorMesh = new THREE.Mesh(GEOMETRY.visorShield, visorGlassMaterial);
  visorMesh.position.set(0, 14, 0);
  visorMesh.rotation.y = Math.PI; // Face forward (+Z)
  avatar.add(visorMesh);

  // Sculpted brow cowl / forehead armor
  const browMesh = new THREE.Mesh(GEOMETRY.browCowl, carbonMaterial);
  browMesh.position.set(0, 19.5, 9.2);
  browMesh.rotation.x = 0.22;
  avatar.add(browMesh);

  // Brow accent plate in team color
  const browAccent = new THREE.Mesh(GEOMETRY.browCowl, armorMaterial);
  browAccent.scale.set(0.85, 0.45, 0.95);
  browAccent.position.set(0, 21.0, 8.8);
  browAccent.rotation.x = 0.22;
  avatar.add(browAccent);

  // 3. EXPRESSIVE CYBERNETIC OCULAR OPTICS ("EYES")
  const eyesGroup = new THREE.Group();
  eyesGroup.name = 'cyber-eyes';
  eyesGroup.position.set(0, 14, 12.8);
  avatar.add(eyesGroup);

  const eyeLeft = new THREE.Mesh(GEOMETRY.eyeLens, glowMaterial);
  eyeLeft.position.set(-4.2, 0, 0);
  eyesGroup.add(eyeLeft);

  const eyeRight = new THREE.Mesh(GEOMETRY.eyeLens, glowMaterial);
  eyeRight.position.set(4.2, 0, 0);
  eyesGroup.add(eyeRight);

  // Inner white-hot pupil cores for sharp high-tech ocular focus
  const pupilLeft = new THREE.Mesh(GEOMETRY.eyePupil, sharedWhiteCoreMaterial);
  pupilLeft.position.set(-4.2, 0, 0.4);
  eyesGroup.add(pupilLeft);

  const pupilRight = new THREE.Mesh(GEOMETRY.eyePupil, sharedWhiteCoreMaterial);
  pupilRight.position.set(4.2, 0, 0.4);
  eyesGroup.add(pupilRight);

  // Ocular aperture rings (titanium bezel framing each eye)
  for (const side of [-1, 1]) {
    const bezel = new THREE.Mesh(GEOMETRY.eyeAperture, titaniumMaterial);
    bezel.position.set(side * 4.2, 0, 0.2);
    eyesGroup.add(bezel);
  }

  // 4. LOWER FACE REBREATHER & COMMS HEADSET
  const rebreather = new THREE.Mesh(GEOMETRY.rebreather, carbonMaterial);
  rebreather.position.set(0, 7.8, 12.6);
  rebreather.rotation.x = -0.15;
  avatar.add(rebreather);

  // Intake slats on rebreather
  for (const yOffset of [-1.0, 0.8]) {
    const slat = new THREE.Mesh(GEOMETRY.rebreatherSlat, titaniumMaterial);
    slat.position.set(0, 7.8 + yOffset, 14.2);
    avatar.add(slat);
  }

  // Comms ear cups on sides of helmet
  for (const side of [-1, 1]) {
    const earCup = new THREE.Mesh(GEOMETRY.commsEar, carbonMaterial);
    earCup.position.set(side * 13.4, 14.2, 1.5);
    earCup.rotation.z = side * Math.PI / 2;
    avatar.add(earCup);

    const earTrim = new THREE.Mesh(GEOMETRY.commsEar, armorMaterial);
    earTrim.scale.set(0.7, 0.4, 0.7);
    earTrim.position.set(side * 14.2, 14.2, 1.5);
    earTrim.rotation.z = side * Math.PI / 2;
    avatar.add(earTrim);
  }

  // Radio antenna on left comms cup
  const antenna = new THREE.Mesh(GEOMETRY.commsAntenna, titaniumMaterial);
  antenna.position.set(-14.2, 18.5, 1.2);
  antenna.rotation.z = 0.15;
  avatar.add(antenna);

  const commsLed = new THREE.Mesh(GEOMETRY.commsBeacon, commsLedMaterial);
  commsLed.position.set(-14.8, 22.4, 1.2);
  avatar.add(commsLed);

  // 5. BALLISTIC CHEST RIG & BIOMETRIC REACTOR CORE
  const chestPlate = new THREE.Mesh(GEOMETRY.chestPlate, armorMaterial);
  chestPlate.position.set(0, 2.0, 11.6);
  avatar.add(chestPlate);

  // Tactical webbing harness straps
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(GEOMETRY.chestStrap, webbingMaterial);
    strap.position.set(side * 7.0, 5.0, 11.2);
    avatar.add(strap);
  }

  // Central Biometric Core (Health status reactor)
  const biometricCore = new THREE.Mesh(GEOMETRY.biometricCore, glowMaterial);
  biometricCore.position.set(0, 2.2, 13.8);
  biometricCore.rotation.x = Math.PI / 2;
  avatar.add(biometricCore);

  const coreBezel = new THREE.Mesh(GEOMETRY.coreRing, titaniumMaterial);
  coreBezel.position.set(0, 2.2, 14.0);
  avatar.add(coreBezel);

  // 6. TACTICAL SHOULDER PAULDRONS & ARMS
  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(GEOMETRY.pauldron, armorMaterial);
    pauldron.position.set(side * 14.8, 9.5, 0.5);
    pauldron.rotation.z = side * -0.22;
    avatar.add(pauldron);

    const pauldronBacking = new THREE.Mesh(GEOMETRY.pauldron, carbonMaterial);
    pauldronBacking.scale.set(0.9, 0.85, 1.15);
    pauldronBacking.position.set(side * 14.2, 8.8, 0.5);
    pauldronBacking.rotation.z = side * -0.22;
    avatar.add(pauldronBacking);

    // Arm segments connecting shoulder to weapon
    const upperArm = new THREE.Mesh(GEOMETRY.upperArm, undersuitMaterial);
    upperArm.position.set(side * 13.5, 3.0, 4.0);
    upperArm.rotation.x = 0.35;
    upperArm.rotation.y = side * -0.15;
    avatar.add(upperArm);

    const foreArm = new THREE.Mesh(GEOMETRY.foreArm, carbonMaterial);
    foreArm.position.set(side * 11.5, -2.5, 11.0);
    foreArm.rotation.x = 0.72;
    foreArm.rotation.y = side * -0.25;
    avatar.add(foreArm);
  }

  // 7. TACTICAL UTILITY BELT & GEAR
  const beltMesh = new THREE.Mesh(GEOMETRY.beltRing, webbingMaterial);
  beltMesh.position.set(0, -9.0, 0);
  beltMesh.rotation.x = Math.PI / 2;
  avatar.add(beltMesh);

  // Side pouches / power cells
  for (const side of [-1, 1]) {
    const pouch = new THREE.Mesh(GEOMETRY.beltPouch, carbonMaterial);
    pouch.position.set(side * 13.5, -9.0, 2.5);
    pouch.rotation.y = side * -0.4;
    avatar.add(pouch);

    const cell = new THREE.Mesh(GEOMETRY.powerCell, titaniumMaterial);
    cell.position.set(side * 12.8, -9.0, -4.5);
    cell.rotation.z = side * 0.2;
    avatar.add(cell);
  }

  // 8. KNEE ARMOR GUARDS
  for (const side of [-1, 1]) {
    const knee = new THREE.Mesh(GEOMETRY.kneePlate, armorMaterial);
    knee.position.set(side * 4.8, -18.5, 12.0);
    knee.rotation.x = -0.18;
    avatar.add(knee);
  }

  // 9. DUAL-EXHAUST JUMP-JET THRUSTER PACK
  const thrusterGroup = new THREE.Group();
  thrusterGroup.name = 'jump-thrusters';
  thrusterGroup.position.set(0, 3.5, -12.6);
  avatar.add(thrusterGroup);

  const packBody = new THREE.Mesh(GEOMETRY.thrusterBody, carbonMaterial);
  thrusterGroup.add(packBody);

  const packTrim = new THREE.Mesh(GEOMETRY.thrusterBody, armorMaterial);
  packTrim.scale.set(0.85, 0.45, 1.05);
  packTrim.position.set(0, 1.5, 0);
  thrusterGroup.add(packTrim);

  const thrusterFlames: THREE.Mesh[] = [];
  const thrusterCoreFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(GEOMETRY.thrusterNozzle, titaniumMaterial);
    nozzle.position.set(side * 4.6, -6.2, 0);
    nozzle.rotation.x = 0.25;
    thrusterGroup.add(nozzle);

    // Outer blazing fire red/orange flame
    const flame = new THREE.Mesh(GEOMETRY.thrusterFlame, fireOuterMaterial);
    flame.position.set(side * 4.6, -13.5, -1.8);
    flame.rotation.x = Math.PI - 0.25;
    flame.scale.set(1.0, 0.7, 1.0);
    thrusterGroup.add(flame);
    thrusterFlames.push(flame);

    // Inner superheated yellow-white fire core
    const coreFlame = new THREE.Mesh(GEOMETRY.thrusterCoreFlame, fireCoreMaterial);
    coreFlame.position.set(side * 4.6, -11.5, -1.3);
    coreFlame.rotation.x = Math.PI - 0.25;
    coreFlame.scale.set(0.9, 0.7, 0.9);
    thrusterGroup.add(coreFlame);
    thrusterCoreFlames.push(coreFlame);
  }

  // 10. WEAPON RIG, NAMEPLATE & REVIVE MARKER
  const firearm = new CoopFirearmVisualRig(false);
  root.add(firearm.group);

  const nameplate = createNameplate(label, color);
  nameplate.position.set(0, 62, 0);
  root.add(nameplate);

  const downedMarker = new THREE.Group();
  downedMarker.name = 'downed-marker';
  const ring = new THREE.Mesh(GEOMETRY.downedRing, downedMarkerMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.5;
  downedMarker.add(ring);

  const cross = new THREE.Mesh(GEOMETRY.downedCross, downedMarkerMaterial);
  cross.position.y = 2;
  downedMarker.add(cross);

  downedMarker.visible = false;
  root.add(downedMarker);

  return {
    root,
    mesh: root,
    avatar,
    bodyMesh,
    browMesh,
    visorMesh,
    eyesGroup,
    eyeLeft,
    eyeRight,
    pupilLeft,
    pupilRight,
    chestPlate,
    biometricCore,
    thrusterGroup,
    thrusterFlames,
    thrusterCoreFlames,
    commsLed,
    firearm,
    nameplate,
    downedMarker,
    armorMaterial,
    glowMaterial,
    downedMarkerMaterial,
    commsLedMaterial,
    skin,
    ownedMaterials,
    premiumEffect,
    premiumAuraMaterial,
    premiumParticleMaterial,
    lastBlinkAtMs: 0,
    lastDoubleJumpSequence: -1,
    doubleJumpFlareRemainingMs: 0,
  };
}

/**
 * Updates the co-op operator rig per-frame:
 * - Positions and rotates the operator along network coordinates.
 * - Handles low-profile crouch & slide squashing.
 * - Animates cybernetic eye micro-blinks, aiming focus, and downed emergency hazard strobes.
 * - Animates reactive biometric health core and revive charge-up surge.
 * - Dynamically expands jump-jet thruster flares during movement, sliding, and airborne jumps.
 */
export function updateCoopOperatorRig(
  rig: CoopOperatorRig,
  player: CoopPlayerSnapshot,
  elapsedMs: number,
  deltaMs: number,
  fallProgress?: number,
): void {
  const downed = player.lifeState === 'downed';
  const falling = fallProgress !== undefined;
  const eliminated = player.lifeState === 'eliminated' && !falling;

  rig.armorMaterial.emissiveIntensity = rig.skin.material.emissiveIntensity * (rig.skin.material.animatedEmissive ? 1 + Math.sin(elapsedMs * .004) * .28 : 1);
  if (rig.premiumEffect && rig.premiumAuraMaterial && rig.premiumParticleMaterial) {
    const pulse = .5 + .5 * Math.sin(elapsedMs * (rig.skin.id === 'black_ice' ? .0024 : .0042));
    rig.premiumEffect.visible = !downed && !falling && !eliminated;
    rig.premiumEffect.rotation.y = elapsedMs * (rig.skin.id === 'black_ice' ? .00038 : -.00062);
    rig.premiumEffect.rotation.z = Math.sin(elapsedMs * .0012) * (rig.skin.id === 'black_ice' ? .08 : .13);
    rig.premiumAuraMaterial.opacity = (rig.skin.id === 'black_ice' ? .065 : .055) + pulse * .045;
    rig.premiumParticleMaterial.opacity = .66 + pulse * .3;
    rig.premiumParticleMaterial.size = (rig.skin.id === 'black_ice' ? 2.15 : 2.5) + pulse * .45;
  }

  rig.root.visible = !eliminated;
  rig.root.position.set(player.x, player.z, player.y);

  // Compact crouching / sliding: scales the entire pill avatar cleanly
  const lowProfile = !downed && (player.sliding || player.crouching);
  rig.root.scale.set(1, lowProfile ? 0.62 : 1, lowProfile ? 1.16 : 1);
  rig.root.rotation.y = Math.PI / 2 - player.angle + (falling ? fallProgress * Math.PI * 2.6 : 0);

  // Prone posture when downed: rolls the entire articulated chassis to resting ground level
  rig.avatar.position.set(0, downed ? 14 : 29, 0);
  rig.avatar.rotation.set(
    falling ? fallProgress * Math.PI * 4.2 : 0,
    falling ? Math.sin(fallProgress * Math.PI * 3) * .55 : 0,
    downed ? Math.PI / 2 : falling ? fallProgress * Math.PI * 2.8 : 0,
  );

  // Downed revive ring & marker
  rig.downedMarker.visible = downed;
  if (downed) {
    rig.downedMarker.rotation.y = elapsedMs * 0.0025;
  }

  // Nameplate vertical height (lower when downed)
  rig.nameplate.visible = !falling;
  rig.nameplate.position.set(0, downed ? 32 : 62, 0);

  // Firearm visibility & reload/recoil update
  rig.firearm.group.visible = !downed && !falling;
  const weaponState = player.weaponStates[player.selectedSlot];
  if (weaponState && !downed) {
    rig.firearm.update(weaponState, elapsedMs, deltaMs, player.isAiming);
  }

  // 1. EXPRESSIVE EYES DYNAMICS
  if (downed) {
    // Emergency SOS distress strobe: pulses in warm hazard amber/red cadence
    const hazardStrobe = Math.sin(elapsedMs * 0.008) > 0.1 ? 1 : 0.15;
    rig.eyeLeft.scale.set(1, 0.7, 1);
    rig.eyeRight.scale.set(1, 0.7, 1);
    rig.pupilLeft.visible = hazardStrobe > 0.5;
    rig.pupilRight.visible = hazardStrobe > 0.5;
    rig.glowMaterial.color.setHex(0xf59e0b); // Hazard amber
  } else {
    rig.glowMaterial.color.set(rig.skin.palette.glow);

    // Living micro-blinks: every ~3.6 seconds, rapid eyelid aperture dip
    const blinkCycle = elapsedMs % 3600;
    const isBlinking = blinkCycle < 140;
    const blinkScaleY = isBlinking ? 0.12 : player.isAiming ? 0.75 : 1.0;

    rig.eyeLeft.scale.set(player.isAiming ? 1.15 : 1.0, blinkScaleY, 1);
    rig.eyeRight.scale.set(player.isAiming ? 1.15 : 1.0, blinkScaleY, 1);
    rig.pupilLeft.visible = !isBlinking;
    rig.pupilRight.visible = !isBlinking;

    // Aiming state: focuses pupil and sharpens ocular glow
    if (player.isAiming) {
      rig.pupilLeft.scale.set(1.4, 1.4, 1);
      rig.pupilRight.scale.set(1.4, 1.4, 1);
    } else {
      rig.pupilLeft.scale.set(1, 1, 1);
      rig.pupilRight.scale.set(1, 1, 1);
    }
  }

  // 2. BIOMETRIC REACTOR CORE
  if (downed) {
    // If receiving a revive from teammate, show energetic charge-up surge
    if (player.reviveProgressMs > 0) {
      const chargeSpeed = 0.025;
      const chargePulse = 0.5 + Math.sin(elapsedMs * chargeSpeed) * 0.5;
      rig.biometricCore.scale.setScalar(1.0 + chargePulse * 0.35);
      rig.glowMaterial.color.setHex(0x5eead4); // Revive mint/cyan
    } else {
      rig.biometricCore.scale.setScalar(0.9 + Math.sin(elapsedMs * 0.008) * 0.2);
    }
  } else {
    // Health status pulse: steady calm at full health, rapid alert when wounded
    const healthRatio = Math.max(0, Math.min(1, player.health / Math.max(1, player.maxHealth)));
    const pulseRate = healthRatio < 0.35 ? 0.016 : 0.005;
    const corePulse = 1.0 + Math.sin(elapsedMs * pulseRate) * (healthRatio < 0.35 ? 0.25 : 0.1);
    rig.biometricCore.scale.setScalar(corePulse);
  }

  // 3. COMMS TELEMETRY LED BLINK
  const commsBlink = Math.sin(elapsedMs * 0.004) > 0.75;
  rig.commsLed.visible = commsBlink;

  // 4. DYNAMIC JUMP-JET THRUSTER FLARE (FIRE RED / ORANGE & BIGGER FLAMES)
  const isMoving = player.sprinting || player.sliding || player.z > 0.5;
  const isSliding = player.sliding;
  const isAirborne = player.z > 0.5;
  const doubleJumpSequence = player.motion?.lastDoubleJumpSequence ?? -1;
  if (doubleJumpSequence >= 0 && doubleJumpSequence !== rig.lastDoubleJumpSequence) {
    rig.lastDoubleJumpSequence = doubleJumpSequence;
    if (isAirborne) rig.doubleJumpFlareRemainingMs = 180;
  }
  rig.doubleJumpFlareRemainingMs = Math.max(0, rig.doubleJumpFlareRemainingMs - deltaMs);
  const doubleJumpFlare = rig.doubleJumpFlareRemainingMs / 180;

  for (let i = 0; i < rig.thrusterFlames.length; i++) {
    const flame = rig.thrusterFlames[i];
    const coreFlame = rig.thrusterCoreFlames?.[i];

    if (downed || falling) {
      flame.visible = false;
      if (coreFlame) coreFlame.visible = false;
    } else if (isSliding || isAirborne) {
      // MASSIVE propulsion firestorm: elongated blazing red/orange inferno
      flame.visible = true;
      if (coreFlame) coreFlame.visible = true;
      const flicker = 0.85 + Math.sin(elapsedMs * 0.05 + i) * 0.25;
      const stretch = (isSliding ? 2.9 : 3.8) * flicker * (1 + doubleJumpFlare * .8);
      const girth = (isSliding ? 2.0 : 2.5) * (0.95 + Math.sin(elapsedMs * 0.03) * 0.1) * (1 + doubleJumpFlare * .35);
      flame.scale.set(girth, stretch, girth);
      if (coreFlame) coreFlame.scale.set(girth * 0.65, stretch * 0.75, girth * 0.65);
    } else if (isMoving) {
      // Running / sprinting fire assist
      flame.visible = true;
      if (coreFlame) coreFlame.visible = true;
      const flicker = 0.8 + Math.sin(elapsedMs * 0.04 + i) * 0.2;
      const stretch = 1.9 * flicker;
      const girth = 1.5;
      flame.scale.set(girth, stretch, girth);
      if (coreFlame) coreFlame.scale.set(girth * 0.65, stretch * 0.75, girth * 0.65);
    } else {
      // Idle warm fire simmer
      flame.visible = true;
      if (coreFlame) coreFlame.visible = true;
      const simmer = 0.6 + Math.sin(elapsedMs * 0.01 + i) * 0.15;
      flame.scale.set(0.9, 0.7 * simmer, 0.9);
      if (coreFlame) coreFlame.scale.set(0.6, 0.6 * simmer, 0.6);
    }
  }
}

/**
 * Disposes per-instance operator resources cleanly.
 * Deliberately preserves global shared geometries.
 */
export function disposeCoopOperatorRig(rig: CoopOperatorRig): void {
  rig.root.removeFromParent();
  rig.firearm.dispose();
  disposeNameplate(rig.nameplate);
  rig.ownedMaterials.forEach(material => material.dispose());
}

function createNameplate(label: string, color: string): THREE.Sprite {
  if (typeof document === 'undefined') {
    return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const text = label.toUpperCase().slice(0, 16);
  context.font = '900 34px system-ui, sans-serif';
  const width = Math.max(150, Math.ceil(context.measureText(text).width + 42));
  canvas.width = width;
  canvas.height = 56;
  context.font = '900 34px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(2, 8, 18, .82)';
  roundedRect(context, 2, 2, width - 4, 52, 10);
  context.fill();
  context.strokeStyle = color;
  context.globalAlpha = 0.9;
  context.lineWidth = 2;
  roundedRect(context, 2, 2, width - 4, 52, 10);
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = '#f8fafc';
  context.fillText(text, width / 2, 29);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  );
  sprite.scale.set(width * 0.36, 20, 1);
  return sprite;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function disposeNameplate(sprite: THREE.Sprite): void {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}
