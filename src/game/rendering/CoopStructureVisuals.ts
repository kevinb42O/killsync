import * as THREE from 'three';
import { COOP_STRUCTURE_DEFINITIONS, type CoopStructureSnapshot, type CoopStructureType } from '../multiplayer/CoopFieldEngineering';

const STEEL = '#07111b';

/** Pooled, deterministic presentation for the intentionally tiny deployable set. */
export class CoopStructureVisuals {
  private readonly rigs = new Map<number, THREE.Group>();
  private readonly links = new Map<string, THREE.Mesh>();
  private preview?: THREE.Group;
  private previewType?: CoopStructureType;

  constructor(private readonly scene: THREE.Scene) {}

  update(structures: readonly CoopStructureSnapshot[], elapsedMs: number) {
    const active = new Set<number>();
    for (const structure of structures) {
      active.add(structure.id);
      let rig = this.rigs.get(structure.id);
      if (!rig) {
        rig = createStructureRig(structure.type, structure.ownerColor, false);
        rig.name = `coop-structure:${structure.id}`;
        this.rigs.set(structure.id, rig);
        this.scene.add(rig);
      }
      const health = structure.maxHealth > 0 ? structure.health / structure.maxHealth : 0;
      const construction = smoothstep(Math.min(1, Math.max(0, (elapsedMs - structure.createdAtMs) / 650)));
      const collapse = structure.state === 'destroying' ? Math.min(1, 1 - (structure.destroyRemainingMs || 0) / 500) : 0;
      // Damage remains readable without modulating a real world light at a
      // flashing frequency. Only the small emissive parts breathe slowly.
      const damagedPulse = health < .5 ? .82 + Math.sin(elapsedMs * .006 + structure.id) * .08 : 1;
      const pulse = structure.pulseAtMs === undefined ? 0 : Math.max(0, 1 - (elapsedMs - structure.pulseAtMs) / 320);
      rig.position.set(structure.x, (1 - construction) * -24 - collapse * 10, structure.y);
      rig.rotation.y = -structure.angle + (structure.type === 'recovery_relay' ? Math.sin(elapsedMs * .0012 + structure.id) * .015 : 0);
      rig.rotation.z = collapse * .22;
      rig.scale.set(construction, Math.max(.035, construction * (1 - collapse)), construction);
      rig.visible = construction > .01;
      animateRig(rig, structure.type, elapsedMs, health, pulse, damagedPulse, collapse, Boolean(structure.reinforced), (structure.overchargedUntilMs || 0) > elapsedMs, Boolean(structure.repairingPlayerId));
    }
    for (const [id, rig] of this.rigs) {
      if (active.has(id)) continue;
      this.scene.remove(rig);
      disposeGroup(rig);
      this.rigs.delete(id);
    }
    const liveLinks = new Set<string>();
    const byId = new Map(structures.map(structure => [structure.id, structure]));
    for (const structure of structures) for (const linkedId of structure.linkedStructureIds || []) {
      const other = byId.get(linkedId);
      if (!other || structure.id >= other.id || structure.state === 'destroying' || other.state === 'destroying') continue;
      const key = `${structure.id}:${other.id}`;
      liveLinks.add(key);
      let link = this.links.get(key);
      if (!link) {
        link = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material('#67e8f9', '#22d3ee', 3.2, true, .54, THREE.AdditiveBlending));
        link.name = `coop-structure-link:${key}`;
        this.links.set(key, link);
        this.scene.add(link);
      }
      const linkColor = structure.type === 'arc_fence' || other.type === 'arc_fence'
        ? COOP_STRUCTURE_DEFINITIONS.arc_fence.color
        : structure.type === 'recovery_relay' || other.type === 'recovery_relay'
          ? COOP_STRUCTURE_DEFINITIONS.recovery_relay.color
          : COOP_STRUCTURE_DEFINITIONS.barricade.color;
      const linkMaterial = link.material as THREE.MeshStandardMaterial;
      linkMaterial.color.set(linkColor);
      linkMaterial.emissive.set(linkColor);
      const dx = other.x - structure.x, dy = other.y - structure.y;
      link.position.set((structure.x + other.x) * .5, structure.type === 'arc_fence' && other.type === 'arc_fence' ? 28 : 3, (structure.y + other.y) * .5);
      link.rotation.y = -Math.atan2(dy, dx);
      link.scale.set(Math.hypot(dx, dy), 1.5 + Math.sin(elapsedMs * .01) * .5, 1.5);
      linkMaterial.opacity = .36 + Math.sin(elapsedMs * .007 + structure.id) * .14;
    }
    for (const [key, link] of this.links) if (!liveLinks.has(key)) {
      this.scene.remove(link); link.geometry.dispose(); (link.material as THREE.Material).dispose(); this.links.delete(key);
    }
  }

  setPreview(type: CoopStructureType | undefined, x = 0, y = 0, angle = 0, valid = true) {
    if (!type) {
      if (this.preview) this.preview.visible = false;
      return;
    }
    if (!this.preview || this.previewType !== type) {
      if (this.preview) { this.scene.remove(this.preview); disposeGroup(this.preview); }
      this.preview = createStructureRig(type, valid ? '#67e8f9' : '#fb7185', true);
      this.preview.name = 'coop-structure-preview';
      this.previewType = type;
      this.scene.add(this.preview);
    }
    this.preview.visible = true;
    this.preview.position.set(x, .3, y);
    this.preview.rotation.y = -angle;
    this.preview.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const nodeMaterial = node.material as THREE.MeshStandardMaterial;
      if (!nodeMaterial.emissive) return;
      const energy = isEnergyRole(node.userData.visualRole) || isAccentRole(node.userData.visualRole);
      const blueprintColor = COOP_STRUCTURE_DEFINITIONS[type].color;
      const previewColor = valid ? blueprintColor : '#fb7185';
      nodeMaterial.color.set(energy ? previewColor : tintedSteel(previewColor, node.userData.visualRole === 'edge' ? .4 : .2));
      nodeMaterial.emissive.set(previewColor);
      nodeMaterial.emissiveIntensity = energy ? 3.2 : .65;
      nodeMaterial.opacity = energy ? .62 : .34;
    });
  }

  dispose() {
    for (const rig of this.rigs.values()) { this.scene.remove(rig); disposeGroup(rig); }
    this.rigs.clear();
    for (const link of this.links.values()) { this.scene.remove(link); link.geometry.dispose(); (link.material as THREE.Material).dispose(); }
    this.links.clear();
    if (this.preview) { this.scene.remove(this.preview); disposeGroup(this.preview); this.preview = undefined; }
  }
}

function createStructureRig(type: CoopStructureType, ownerColor: string, preview: boolean) {
  const group = new THREE.Group();
  const energyColor = COOP_STRUCTURE_DEFINITIONS[type].color;
  const steel = material(tintedSteel(energyColor, .16), energyColor, .28, preview, preview ? .32 : 1);
  const edge = material(tintedSteel(energyColor, .38), energyColor, .7, preview, preview ? .4 : 1);
  const accent = material(energyColor, energyColor, 2.5, true, preview ? .62 : 1);
  const energy = material(energyColor, energyColor, 4.4, true, preview ? .56 : .92, THREE.AdditiveBlending);
  const ownerAccent = material(ownerColor, ownerColor, 3.2, true, preview ? .62 : 1);
  if (type === 'barricade') createBarricade(group, steel, edge, accent, energy);
  else if (type === 'arc_fence') createArcFence(group, steel, edge, accent, energy);
  else if (type === 'recovery_relay') createRecoveryRelay(group, steel, edge, accent, energy);
  else if (type === 'decoy_beacon') createDecoyBeacon(group, steel, edge, accent, energy);
  else createBridgeSegment(group, steel, edge, accent, energy);
  const healthTrack = addBox(group, 68, 5, 3, 0, 105, 0, steel, 'health-track');
  const healthFill = addBox(group, 62, 3, 4, 0, 105, -.5, ownerAccent, 'health-fill');
  healthTrack.visible = !preview && type !== 'bridge_segment';
  healthFill.visible = !preview && type !== 'bridge_segment';
  const light = new THREE.PointLight(energyColor, preview ? 0 : 3.6, type === 'recovery_relay' ? 340 : type === 'bridge_segment' ? 430 : 240, 1.65);
  light.position.set(0, type === 'recovery_relay' ? 60 : type === 'arc_fence' ? 42 : 35, 0);
  light.userData.visualRole = 'structure-light';
  group.add(light);
  for (const mat of [steel, edge, accent, energy, ownerAccent]) mat.dispose();
  return group;
}

function createBridgeSegment(group: THREE.Group, steel: THREE.Material, edge: THREE.Material, accent: THREE.Material, energy: THREE.Material) {
  addBox(group, 258, 16, 168, 0, 8, 0, steel, 'base');
  addBox(group, 244, 5, 142, 0, 18, 0, edge, 'armor');
  for (const z of [-69, 69]) {
    addBox(group, 258, 5, 7, 0, 23, z, accent, 'accent');
    for (const x of [-108, -54, 0, 54, 108]) addBox(group, 20, 2.5, 10, x, 26, z, energy, 'energy');
  }
  for (const x of [-112, 0, 112]) {
    addBox(group, 8, 26, 156, x, -3, 0, steel, 'brace', 0, 0, x === 0 ? 0 : x > 0 ? .07 : -.07);
    addBox(group, 30, 3, 42, x, 21, 0, energy, 'scan');
  }
}

function createBarricade(group: THREE.Group, steel: THREE.Material, edge: THREE.Material, accent: THREE.Material, energy: THREE.Material) {
  addBox(group, 208, 8, 54, 0, 4, 0, steel, 'base');
  for (const side of [-1, 1]) {
    addBox(group, 94, 42, 25, side * 52, 26, 0, steel, 'armor', 0, 0, side * -.07);
    addBox(group, 84, 3, 28, side * 52, 49, 0, edge, 'edge');
    addBox(group, 7, 50, 33, side * 101, 26, 0, accent, 'accent', 0, 0, side * -.14);
  }
  for (const x of [-82, -27, 27, 82]) {
    addBox(group, 8, 45, 38, x, 25, 0, edge, 'brace', 0, 0, x * -.0007);
    addBox(group, 28, 5, 68, x, 3, 0, steel, 'foot');
  }
  addBox(group, 196, 25, 2.5, 0, 31, -15, energy, 'energy');
  addBox(group, 170, 2, 4, 0, 42, -17, accent, 'scan');
  for (const x of [-66, 0, 66]) addBox(group, 34, 1.2, 4, x, 1.1, -39, accent, 'accent', 0, -.42, 0);
}

function createArcFence(group: THREE.Group, steel: THREE.Material, edge: THREE.Material, accent: THREE.Material, energy: THREE.Material) {
  const width = COOP_STRUCTURE_DEFINITIONS.arc_fence.width;
  for (const side of [-1, 1]) {
    const x = side * width * .5;
    addCylinder(group, 22, 29, 10, x, 5, 0, steel, 'base', 8);
    addCylinder(group, 10, 14, 55, x, 35, 0, edge, 'pylon', 8);
    for (const y of [19, 32, 45]) addCylinder(group, 15, 15, 5, x, y, 0, accent, 'coil', 10);
    addMesh(group, new THREE.OctahedronGeometry(15, 0), energy, x, 67, 0, 'emitter');
    addBox(group, 40, 3, 58, x - side * 9, 2, 0, steel, 'foot', 0, side * .08, 0);
  }
  for (const [index, y] of [21, 40, 59].entries()) {
    addBox(group, width - 22, 2.4, 2.4, 0, y, (index - 1) * 3.5, energy, 'arc-strand');
    for (const x of [-86, -43, 0, 43, 86]) {
      const node = addBox(group, 30, 1.5, 1.5, x, y + (x / 43 % 2 ? 4 : -4), (index - 1) * 3.5, energy, 'spark');
      node.rotation.z = x / 43 % 2 ? .22 : -.22;
    }
  }
  addBox(group, width - 4, 1.1, 18, 0, 1, 0, energy, 'ground-field');
  for (const x of [-86, -43, 0, 43, 86]) addBox(group, 22, 1.4, 4, x, 1.8, -19, accent, 'accent', 0, -.45, 0);
}

function createRecoveryRelay(group: THREE.Group, steel: THREE.Material, edge: THREE.Material, accent: THREE.Material, energy: THREE.Material) {
  addCylinder(group, 34, 43, 11, 0, 6, 0, steel, 'base', 8);
  addCylinder(group, 26, 32, 8, 0, 15, 0, edge, 'base', 8);
  for (const angle of [0, Math.PI * .5, Math.PI, Math.PI * 1.5]) {
    addBox(group, 10, 6, 38, Math.cos(angle) * 31, 4, Math.sin(angle) * 31, steel, 'foot', 0, -angle, 0);
  }
  addCylinder(group, 6, 9, 48, 0, 40, 0, edge, 'mast', 8);
  addMesh(group, new THREE.IcosahedronGeometry(16, 1), energy, 0, 69, 0, 'core');
  for (const [radius, y] of [[25, 53], [31, 69], [23, 84]] as const) {
    const ring = addMesh(group, new THREE.TorusGeometry(radius, 1.8, 6, 32), accent, 0, y, 0, 'orbit-ring');
    ring.rotation.x = Math.PI * .5;
  }
  addBox(group, 8, 31, 3, 0, 69, -20, energy, 'energy');
  addBox(group, 25, 9, 3, 0, 69, -20, energy, 'energy');
  const dome = addMesh(group, new THREE.SphereGeometry(COOP_STRUCTURE_DEFINITIONS.recovery_relay.radius, 32, 12, 0, Math.PI * 2, 0, Math.PI * .5), energy, 0, 0, 0, 'dome-shell');
  const domeMaterial = dome.material as THREE.MeshStandardMaterial;
  domeMaterial.wireframe = true;
  domeMaterial.opacity = .13;
  for (const radius of [67, 94, 119]) {
    const ring = addMesh(group, new THREE.RingGeometry(radius - 1.4, radius, 56), energy, 0, 1.2, 0, 'ground-ring');
    ring.rotation.x = -Math.PI * .5;
  }
}

function createDecoyBeacon(group: THREE.Group, steel: THREE.Material, edge: THREE.Material, accent: THREE.Material, energy: THREE.Material) {
  addCylinder(group, 25, 33, 10, 0, 5, 0, steel, 'base', 8);
  addCylinder(group, 9, 14, 38, 0, 27, 0, edge, 'mast', 8);
  const torso = addMesh(group, new THREE.CapsuleGeometry(12, 29, 4, 8), energy, 0, 67, 0, 'decoy-ghost');
  torso.scale.set(.82, 1.05, .55);
  addMesh(group, new THREE.SphereGeometry(10, 10, 8), energy, 0, 96, 0, 'decoy-ghost');
  for (const side of [-1, 1]) {
    addBox(group, 7, 34, 7, side * 9, 42, 0, energy, 'decoy-ghost', 0, 0, side * -.12);
    addBox(group, 6, 32, 6, side * 6, 18, 0, accent, 'accent', 0, 0, side * .08);
  }
  for (const radius of [34, 50, 68]) {
    const ring = addMesh(group, new THREE.RingGeometry(radius - 1.5, radius, 36), accent, 0, 2, 0, 'broadcast-ring');
    ring.rotation.x = -Math.PI * .5;
  }
}

function animateRig(rig: THREE.Group, type: CoopStructureType, elapsedMs: number, health: number, pulse: number, damagedPulse: number, collapse: number, reinforced: boolean, overcharged: boolean, repairing: boolean) {
  let orbitIndex = 0;
  rig.traverse(node => {
    if (node instanceof THREE.PointLight) {
      node.intensity = (2.6 + health * 2.2 + pulse * 4.2) * (overcharged ? 1.7 : 1) * (1 - collapse);
      return;
    }
    if (!(node instanceof THREE.Mesh)) return;
    const role = node.userData.visualRole as string;
    const nodeMaterial = node.material as THREE.MeshStandardMaterial;
    if (!nodeMaterial.emissive) return;
    const isEnergy = isEnergyRole(role);
    nodeMaterial.emissiveIntensity = (isEnergy ? 2.8 + health * 2.1 : isAccentRole(role) ? 1.35 + health * 1.25 : .28 + health * .42) * damagedPulse * (overcharged ? 1.65 : 1);
    if (nodeMaterial.transparent) nodeMaterial.opacity = Math.max(0, (isEnergy ? .62 + health * .32 : .94) * damagedPulse * (1 - collapse));
    if (role === 'health-track' || role === 'health-fill') {
      node.visible = health < .995 && collapse < .9;
      if (role === 'health-fill') { node.scale.x = Math.max(.02, health); node.position.x = -(1 - health) * 31; }
    }
    if (reinforced && (role === 'armor' || role === 'brace')) node.scale.y = 1.18;
    if (repairing && role === 'health-fill') nodeMaterial.emissiveIntensity = 2.4 + Math.sin(elapsedMs * .02) * .5;
    if (type === 'barricade' && role === 'scan') {
      node.position.y = 21 + (elapsedMs * .035 % 25);
      nodeMaterial.opacity = (.35 + Math.sin(elapsedMs * .009) * .16) * damagedPulse;
    }
    if (type === 'arc_fence') {
      if (role === 'arc-strand' || role === 'spark') {
        node.position.z = Number(node.userData.baseZ) + Math.sin(elapsedMs * .034 + node.position.x * .08 + node.position.y) * 1.6;
        nodeMaterial.opacity = Math.min(1, (.5 + Math.sin(elapsedMs * .012 + node.position.x) * .14 + pulse * .5) * damagedPulse);
        node.scale.y = 1 + pulse * 2.2;
        node.scale.z = 1 + pulse * 2.2;
      } else if (role === 'emitter') {
        node.rotation.y = elapsedMs * .004;
        node.scale.setScalar(1 + pulse * .38 + Math.sin(elapsedMs * .01) * .06);
      } else if (role === 'ground-field') nodeMaterial.opacity = (.17 + pulse * .44) * damagedPulse;
    }
    if (type === 'recovery_relay') {
      if (role === 'orbit-ring') {
        const direction = orbitIndex++ % 2 ? -1 : 1;
        node.rotation.z = direction * elapsedMs * (.0008 + orbitIndex * .00012);
        node.rotation.x = Math.PI * .5 + Math.sin(elapsedMs * .0015 + orbitIndex) * .22;
      } else if (role === 'core') {
        const beat = .9 + Math.pow(Math.max(0, Math.sin(elapsedMs * .0045)), 5) * .25 + pulse * .12;
        node.scale.setScalar(beat);
      } else if (role === 'dome-shell') {
        node.rotation.y = elapsedMs * .00035;
        nodeMaterial.opacity = (.09 + health * .07 + pulse * .12) * damagedPulse;
        node.scale.setScalar(1 + pulse * .018);
      } else if (role === 'ground-ring') {
        nodeMaterial.opacity = (.1 + Math.sin(elapsedMs * .002 + node.position.x + node.position.z) * .08 + health * .12) * damagedPulse;
      }
    }
    if (type === 'decoy_beacon') {
      if (role === 'decoy-ghost') {
        node.position.x = Math.sin(elapsedMs * .006 + node.position.y) * 2.2;
        nodeMaterial.opacity = (.3 + Math.sin(elapsedMs * .009 + node.position.y) * .12 + pulse * .3) * damagedPulse;
      } else if (role === 'broadcast-ring') {
        const wave = (elapsedMs * .00055 + node.geometry.uuid.charCodeAt(0) * .02) % 1;
        node.scale.setScalar(.75 + wave * .45);
        nodeMaterial.opacity = (1 - wave) * .42 * damagedPulse;
      }
    }
  });
}

function material(color: string, emissive: string, emissiveIntensity: number, transparent: boolean, opacity: number, blending: THREE.Blending = THREE.NormalBlending) {
  const result = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, transparent, opacity, roughness: .24, metalness: .64, depthWrite: !transparent, blending });
  // Structure energy participates in the scene's ACES exposure. Bypassing
  // tone mapping allowed additive surfaces to clip to a screen-space flash.
  result.toneMapped = true;
  return result;
}

function tintedSteel(color: string, amount: number) {
  return `#${new THREE.Color(STEEL).lerp(new THREE.Color(color), amount).getHexString()}`;
}

function isEnergyRole(role: unknown) {
  return role === 'energy' || role === 'arc-strand' || role === 'spark' || role === 'emitter'
    || role === 'ground-field' || role === 'ground-ring' || role === 'core' || role === 'dome-shell'
    || role === 'decoy-ghost' || role === 'broadcast-ring' || role === 'scan' || role === 'orbit-ring';
}

function isAccentRole(role: unknown) {
  return role === 'accent' || role === 'coil' || role === 'health-fill';
}

function addBox(group: THREE.Group, width: number, height: number, depth: number, x: number, y: number, z: number, mat: THREE.Material, role: string, rx = 0, ry = 0, rz = 0) {
  const mesh = addMesh(group, new THREE.BoxGeometry(width, height, depth), mat, x, y, z, role);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

function addCylinder(group: THREE.Group, top: number, bottom: number, height: number, x: number, y: number, z: number, mat: THREE.Material, role: string, sides: number) {
  return addMesh(group, new THREE.CylinderGeometry(top, bottom, height, sides), mat, x, y, z, role);
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, role: string) {
  const mesh = new THREE.Mesh(geometry, mat.clone());
  mesh.position.set(x, y, z);
  mesh.userData.visualRole = role;
  mesh.userData.baseZ = z;
  group.add(mesh);
  return mesh;
}

function smoothstep(value: number) { return value * value * (3 - 2 * value); }

function disposeGroup(group: THREE.Group) {
  group.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(nodeMaterial => nodeMaterial.dispose());
  });
}
