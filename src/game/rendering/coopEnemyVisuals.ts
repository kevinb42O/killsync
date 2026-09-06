import * as THREE from 'three';
import type { Enemy } from '../../types';

type EnemyRig = {
  hull: THREE.Group;
  body: THREE.Mesh;
  core: THREE.Mesh;
  limbs: THREE.Group[];
  rotor: THREE.Mesh;
  armor: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  health: THREE.Group;
  fill: THREE.Mesh;
  details: THREE.Group;
  spawnRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  deathFx: THREE.Group;
  deathShell: THREE.Mesh;
  deathRings: THREE.InstancedMesh;
  deathShards: THREE.InstancedMesh;
  deathBeam: THREE.Mesh;
  deathGlow: THREE.MeshBasicMaterial;
  deathWire: THREE.MeshBasicMaterial;
  shardCount: number;
  phase: number;
  createdAt: number;
};

const shared = <T extends THREE.BufferGeometry>(geometry: T) => { geometry.userData.coopEnemyShared = true; return geometry; };
const GEOMETRY = {
  box: shared(new THREE.BoxGeometry(1, 1, 1)),
  wedge: shared(new THREE.ConeGeometry(.5, 1, 4)),
  cone: shared(new THREE.ConeGeometry(.5, 1, 5)),
  cylinder: shared(new THREE.CylinderGeometry(.5, .5, 1, 8)),
  sphere: shared(new THREE.IcosahedronGeometry(.5, 1)),
  ring: shared(new THREE.TorusGeometry(.5, .055, 5, 18)),
  plate: shared(new THREE.OctahedronGeometry(.5, 0)),
  beam: shared(new THREE.CylinderGeometry(.5, .5, 1, 6)),
};
const sharedDark = new THREE.MeshStandardMaterial({ color: '#0b1218', metalness: .72, roughness: .48 });
sharedDark.userData.coopEnemyShared = true;
const deathTransform = new THREE.Object3D();
const BATCHED_TYPES = ['basic', 'fast', 'ranged', 'tank', 'phantom'] as const;
type BatchedEnemyType = typeof BATCHED_TYPES[number];
const BATCH_CAPACITY = 90 * 24;
type EnemyBatch = { mesh: THREE.InstancedMesh; count: number };

/**
 * Submits the complete opaque portion of ordinary co-op rigs as instanced
 * component batches. Their original transparent health/spawn/death effects stay
 * attached to the per-enemy rig, and combat-critical material states can opt out
 * for a frame without reconstructing any resources.
 */
export class CoopEnemyBatchRenderer {
  private readonly batches = new Map<string, EnemyBatch>();
  private readonly batchedIds = new Set<string>();
  private readonly color = new THREE.Color();
  private activeInstances = 0;

  constructor(private readonly scene: THREE.Scene) {}

  beginFrame() {
    this.batchedIds.clear();
    for (const batch of this.batches.values()) batch.count = 0;
  }

  /** Restore opaque rig nodes before the normal animation function runs. */
  prepareRig(root: THREE.Object3D) {
    root.traverse(node => {
      if (node instanceof THREE.Mesh && isOpaqueBatchMaterial(node.material)) node.visible = true;
    });
  }

  add(enemy: Enemy, root: THREE.Object3D) {
    if (!enemy.id.startsWith('coop-enemy-') || !isBatchedType(enemy.type)) return false;
    const type = enemy.type;
    root.updateMatrixWorld(true);
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh) || !isOpaqueBatchMaterial(node.material)) return;
      const effectivelyVisible = isVisibleThrough(node, root);
      if (effectivelyVisible) this.addMesh(type, node, node.material);
      // The corresponding instance now owns the opaque draw. Transparent
      // children remain on the authored rig for exact per-enemy feedback.
      node.visible = false;
    });
    this.batchedIds.add(enemy.id);
    return true;
  }

  endFrame(): ReadonlySet<string> {
    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.count;
      batch.mesh.visible = batch.count > 0;
      if (batch.count > 0) {
        batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      }
    }
    this.activeInstances = this.batchedIds.size;
    return this.batchedIds;
  }

  get activeEnemyCount() { return this.activeInstances; }
  get activeDrawBatchCount() {
    let count = 0;
    for (const batch of this.batches.values()) if (batch.count > 0) count++;
    return count;
  }

  dispose() {
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.mesh); (batch.mesh.material as THREE.Material).dispose();
    }
    this.batches.clear(); this.batchedIds.clear();
  }

  private addMesh(type: BatchedEnemyType, source: THREE.Mesh, material: THREE.Material & { color?: THREE.Color }) {
    const role = material.userData.coopEnemyShared ? 'shared' : material.type;
    // Keep visually distinct material variants in separate batches. The current
    // rigs use type-stable palettes, but including these authored properties
    // prevents a future skin or modifier from inheriting the first enemy's
    // emissive/metallic response merely because it shares geometry.
    const key = `${type}:${source.geometry.uuid}:${role}:${materialSignature(material)}`;
    let batch = this.batches.get(key);
    if (!batch) {
      const batchMaterial = material.clone() as THREE.Material & { color?: THREE.Color };
      batchMaterial.color?.set(0xffffff);
      const mesh = new THREE.InstancedMesh(source.geometry, batchMaterial, BATCH_CAPACITY);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.visible = false; mesh.count = 0;
      this.scene.add(mesh);
      batch = { mesh, count: 0 };
      this.batches.set(key, batch);
    }
    if (batch.count >= BATCH_CAPACITY) return;
    batch.mesh.setMatrixAt(batch.count, source.matrixWorld);
    batch.mesh.setColorAt(batch.count, this.color.copy(material.color || WHITE));
    batch.count++;
  }
}

const WHITE = new THREE.Color(0xffffff);

function materialSignature(material: THREE.Material & { color?: THREE.Color }) {
  const standard = material as THREE.Material & {
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
  };
  return [
    material.color?.getHexString() ?? '-',
    standard.emissive?.getHexString() ?? '-',
    standard.emissiveIntensity ?? '-',
    standard.metalness ?? '-',
    standard.roughness ?? '-',
  ].join(':');
}

function isOpaqueBatchMaterial(material: THREE.Material | THREE.Material[]): material is THREE.Material & { color?: THREE.Color } {
  return !Array.isArray(material) && !material.transparent;
}

function isVisibleThrough(node: THREE.Object3D, root: THREE.Object3D) {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function isBatchedType(type: Enemy['type']): type is BatchedEnemyType {
  return (BATCHED_TYPES as readonly Enemy['type'][]).includes(type);
}

export function createCoopEnemyRig(enemy: Enemy): THREE.Group {
  const root = new THREE.Group(), hull = new THREE.Group(), details = new THREE.Group();
  root.add(hull); hull.add(details);
  const radius = enemy.radius;
  const armor = new THREE.MeshStandardMaterial({ color: armorColor(enemy.type), metalness: .78, roughness: .31, emissive: enemy.color, emissiveIntensity: .11 });
  const glow = new THREE.MeshBasicMaterial({ color: enemy.color, toneMapped: false });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, scale: [number, number, number], position: [number, number, number], parent: THREE.Object3D = hull) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.scale.set(...scale); mesh.position.set(...position); parent.add(mesh); return mesh;
  };
  const heavy = enemy.type === 'tank' || enemy.type === 'titan';
  const flying = enemy.type === 'phantom';
  const bodyGeometry = enemy.type === 'fast' ? GEOMETRY.wedge : enemy.type === 'ranged' ? GEOMETRY.plate : flying ? GEOMETRY.sphere : GEOMETRY.box;
  const body = add(bodyGeometry, armor, [radius * (heavy ? 1.65 : 1.3), radius * (heavy ? 1.15 : .78), radius * (heavy ? 1.45 : 1.25)], [0, 0, 0]);
  if (enemy.type === 'fast') body.rotation.x = Math.PI / 2;
  add(GEOMETRY.box, glow, [radius * .82, radius * .13, radius * .06], [0, radius * .10, radius * .69]);
  const core = add(GEOMETRY.sphere, glow, [radius * .22, radius * .22, radius * .18], [0, radius * .08, radius * .78], details);

  const limbs: THREE.Group[] = [];
  // Phantoms use the same articulated slots as four suspended energy talons;
  // they never touch the ground, but retain readable motion at combat range.
  const legs = enemy.type === 'fast' || flying ? 4 : heavy ? 6 : 2;
  for (let index = 0; index < legs; index++) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2) - (legs / 2 - 1) / 2;
    const limb = new THREE.Group(); limb.position.set(side * radius * .62, -radius * .04, row * radius * .64); details.add(limb); limbs.push(limb);
    add(GEOMETRY.box, armor, [radius * .34, radius * .65, radius * .30], [side * radius * .18, -radius * .25, 0], limb);
    add(GEOMETRY.box, sharedDark, [radius * .38, radius * .16, radius * .62], [side * radius * .27, -radius * .61, radius * .10], limb);
    add(GEOMETRY.box, glow, [radius * .035, radius * .34, radius * .13], [side * radius * .39, -radius * .18, 0], limb);
  }

  if (enemy.type === 'ranged') {
    const mast = add(GEOMETRY.cylinder, sharedDark, [radius * .22, radius * 1.55, radius * .22], [0, radius * .68, 0], details);
    mast.rotation.x = Math.PI / 2;
    add(GEOMETRY.cone, glow, [radius * .35, radius * .85, radius * .35], [0, radius * .65, radius * .68], details).rotation.x = -Math.PI / 2;
  }
  if (enemy.type === 'ranged' || enemy.type === 'elite' || enemy.type === 'titan') {
    for (const side of [-1, 1]) {
      const cannon = add(GEOMETRY.cylinder, sharedDark, [radius * .18, radius * 1.3, radius * .18], [side * radius * .62, radius * .48, radius * .24], details);
      cannon.rotation.x = Math.PI / 2;
      add(GEOMETRY.ring, glow, [radius * .42, radius * .42, radius * .42], [side * radius * .62, radius * .48, radius * .91], details).rotation.x = Math.PI / 2;
    }
  }
  if (enemy.type === 'tank' || enemy.type === 'titan') {
    for (const side of [-1, 1]) add(GEOMETRY.plate, armor, [radius * .72, radius * .9, radius * .34], [side * radius * .92, radius * .12, radius * .02], details);
  }
  if (enemy.type === 'fast') {
    for (const side of [-1, 1]) { const fin = add(GEOMETRY.cone, armor, [radius * .55, radius * 1.5, radius * .28], [side * radius * .87, radius * .20, -radius * .24], details); fin.rotation.x = -.55; }
  }
  if (enemy.type === 'basic') {
    for (const side of [-1, 1]) {
      const horn = add(GEOMETRY.wedge, sharedDark, [radius * .18, radius * .72, radius * .18], [side * radius * .42, radius * .62, -radius * .18], details);
      horn.rotation.z = side * -.28;
    }
  }
  if (enemy.type === 'elite' || enemy.type === 'titan') {
    const crownCount = enemy.type === 'titan' ? 8 : 5;
    for (let index = 0; index < crownCount; index++) {
      const angle = index / crownCount * Math.PI * 2;
      const crown = add(GEOMETRY.cone, glow, [radius * .16, radius * .75, radius * .16], [Math.cos(angle) * radius * .62, radius * .78, Math.sin(angle) * radius * .62], details);
      crown.rotation.z = -Math.cos(angle) * .5; crown.rotation.x = Math.sin(angle) * .5;
    }
  }

  const rotor = add(GEOMETRY.ring, glow, [radius * 1.3, radius * 1.3, radius * 1.3], [0, radius * .62, 0], details);
  rotor.rotation.x = Math.PI / 2; rotor.visible = flying || enemy.type === 'elite' || enemy.type === 'titan';

  const health = new THREE.Group();
  const background = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.45, 5), new THREE.MeshBasicMaterial({ color: '#071015', transparent: true, opacity: .88, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.35, 2.6), new THREE.MeshBasicMaterial({ color: enemy.color, transparent: true, opacity: .95, depthWrite: false, toneMapped: false }));
  fill.position.z = .3; health.add(background, fill); health.position.y = radius * 1.58; root.add(health);

  const spawnRing = new THREE.Mesh(new THREE.RingGeometry(radius * .82, radius, 24), new THREE.MeshBasicMaterial({ color: enemy.color, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  spawnRing.rotation.x = -Math.PI / 2; spawnRing.position.y = -radius * .66; root.add(spawnRing);

  // A compact, GPU-friendly death rig. Rings and fragments are instanced so
  // even a whole pack dying together adds only two draw calls per corpse.
  // It stays completely hidden (and therefore unrendered) while the unit lives.
  const deathFx = new THREE.Group(); deathFx.visible = false; root.add(deathFx);
  const deathGlow = new THREE.MeshBasicMaterial({ color: enemy.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const deathWire = new THREE.MeshBasicMaterial({ color: enemy.color, transparent: true, opacity: 0, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const deathShell = new THREE.Mesh(bodyGeometry, deathWire); deathShell.scale.copy(body.scale); deathFx.add(deathShell);
  const deathRings = new THREE.InstancedMesh(GEOMETRY.ring, deathGlow, 3); deathRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); deathFx.add(deathRings);
  const shardCount = heavy ? 8 : enemy.type === 'elite' ? 7 : 5;
  const deathShards = new THREE.InstancedMesh(GEOMETRY.plate, deathGlow, shardCount); deathShards.instanceMatrix.setUsage(THREE.DynamicDrawUsage); deathFx.add(deathShards);
  const deathBeam = new THREE.Mesh(GEOMETRY.beam, deathGlow); deathBeam.visible = false; deathFx.add(deathBeam);

  root.userData.coopRig = { hull, body, core, limbs, rotor, armor, glow, health, fill, details, spawnRing, deathFx, deathShell, deathRings, deathShards, deathBeam, deathGlow, deathWire, shardCount, phase: numericId(enemy.id) * 1.73, createdAt: Date.now() } satisfies EnemyRig;
  return root;
}

export function animateCoopEnemyRig(root: THREE.Group, enemy: Enemy, camera: THREE.Camera, now: number) {
  const rig = root.userData.coopRig as EnemyRig;
  const phase = now * .006 + rig.phase;
  const death = THREE.MathUtils.clamp(enemy.presentationDeathProgress || 0, 0, 1);
  const charging = THREE.MathUtils.clamp(enemy.presentationAttackCharge || 0, 0, 1);
  const spawn = THREE.MathUtils.smoothstep(now - rig.createdAt, 0, 420);
  const hover = enemy.type === 'phantom' ? enemy.radius * .55 + Math.sin(phase) * 7 : 0;
  root.position.set(enemy.position.x, enemy.radius * .72 + hover, enemy.position.y);
  const velocityFacing = Math.hypot(enemy.velocity.x, enemy.velocity.y) > .001 ? Math.atan2(enemy.velocity.y, enemy.velocity.x) : 0;
  root.rotation.y = Math.PI / 2 - (enemy.presentationFacingAngle ?? velocityFacing);

  // A three-beat collapse preserves the enemy silhouette for hit confirmation,
  // crushes it into the core, then leaves a razor-thin light filament. Keeping
  // this in transforms/material uniforms avoids spawning short-lived objects.
  const crush = THREE.MathUtils.smoothstep(death, .08, .76);
  const vanish = THREE.MathUtils.smoothstep(death, .72, 1);
  const scaleXZ = Math.max(.012, spawn * (1 - crush * .62) * (1 - vanish * .94));
  const scaleY = Math.max(.012, spawn * (1 + Math.sin(Math.min(1, death * 2) * Math.PI) * .32) * (1 - crush * .78) * (1 - vanish * .9));
  root.scale.set(scaleXZ, scaleY, scaleXZ);
  rig.hull.rotation.z = death * 1.65;
  rig.hull.rotation.y = Math.sin(death * Math.PI) * .28;
  rig.hull.rotation.x = charging * (enemy.type === 'fast' || enemy.type === 'phantom' ? -.30 : .08);
  rig.hull.position.y = (charging > 0 ? -charging * enemy.radius * .16 : Math.sin(phase * 2) * (enemy.type === 'tank' ? .45 : 1.3)) - crush * enemy.radius * .16;
  rig.limbs.forEach((limb, index) => {
    const gait = enemy.type === 'phantom' ? Math.sin(phase * 1.6 + index * 1.57) * .42 : Math.sin(phase + index * Math.PI) * (enemy.type === 'fast' ? .52 : .30);
    limb.rotation.x = charging > 0 ? -.24 : gait + crush * (index % 2 ? .7 : -.7);
    limb.rotation.z = crush * (index % 2 ? .42 : -.42);
  });
  rig.rotor.rotation.z = phase * (enemy.type === 'phantom' ? 1.2 : .55);
  rig.rotor.scale.setScalar(1 + charging * .38);
  const hit = Boolean(enemy.hitFlash && enemy.hitFlash > 0);
  const bossHit = hit && enemy.type === 'titan';
  // Large bosses retain their dark silhouette on impact. Their existing crown,
  // rotor, trim, and core carry the confirmation pulse instead of bleaching the
  // entire armor material white behind the player's reticle.
  rig.armor.emissive.set(hit && !bossHit ? '#ffffff' : enemy.color);
  rig.armor.emissiveIntensity = hit && !bossHit ? 2.2 : bossHit ? .72 : .11 + charging * .8 + (death > 0 ? (1 - death) * 1.7 : 0);
  rig.glow.color.set(death > 0 ? '#ffffff' : bossHit ? '#ffe7a3' : hit ? '#ffffff' : charging > 0 ? '#fff7d6' : enemy.color);
  rig.core.scale.setScalar(1 + Math.sin(phase * 2.4) * .09 + charging * .42 + (bossHit ? .42 : 0) + (death > 0 ? Math.sin(death * Math.PI) * 1.15 : 0));
  const distanceToCamera = camera.position.distanceTo(root.position);
  rig.details.visible = death < .78 && (distanceToCamera < 1_200 || enemy.type === 'elite' || enemy.type === 'titan');
  rig.health.visible = death <= 0 && enemy.health > 0 && enemy.health < enemy.maxHealth && (distanceToCamera < 1_100 || enemy.type === 'elite' || enemy.type === 'titan');
  rig.health.quaternion.copy(root.quaternion).invert().multiply(camera.quaternion);
  const ratio = Math.max(0, Math.min(1, enemy.health / Math.max(1, enemy.maxHealth)));
  rig.fill.scale.x = ratio; rig.fill.position.x = -(1 - ratio) * enemy.radius * 1.175;
  rig.spawnRing.visible = death <= 0 && (spawn < 1 || (charging > .12 && (enemy.type === 'elite' || enemy.type === 'titan')));
  rig.spawnRing.material.opacity = spawn < 1 ? Math.max(0, 1 - spawn) * .8 : charging * .28;
  rig.spawnRing.scale.setScalar(spawn < 1 ? .7 + spawn * .65 : 1.05 + charging * .28 + Math.sin(phase * 3) * .035);

  rig.deathFx.visible = death > 0;
  if (death > 0) animateDeathFx(rig, enemy.radius, death, phase, scaleXZ, scaleY);
}

function animateDeathFx(rig: EnemyRig, radius: number, death: number, phase: number, rootScaleXZ: number, rootScaleY: number) {
  // Cancel the collapsing root scale so the energy residue stays world-sized.
  rig.deathFx.scale.set(1 / rootScaleXZ, 1 / rootScaleY, 1 / rootScaleXZ);
  const flare = Math.sin(Math.min(1, death * 1.35) * Math.PI);
  const fade = 1 - THREE.MathUtils.smoothstep(death, .66, 1);
  rig.deathGlow.opacity = Math.min(.92, flare * .72 + fade * .24);
  rig.deathWire.opacity = fade * .68;
  if (death < .18) rig.deathWire.color.set('#ffffff');
  else rig.deathWire.color.copy(rig.deathGlow.color);
  rig.deathShell.rotation.set(death * 1.8, phase * .35 + death * 2.2, death * -1.35);
  rig.deathShell.scale.copy(rig.body.scale).multiplyScalar(1 + death * .4);

  for (let index = 0; index < 3; index++) {
    const ringPhase = THREE.MathUtils.clamp(death * 1.35 - index * .13, 0, 1);
    const ringScale = radius * (2.15 - ringPhase * 1.72) * (1 - THREE.MathUtils.smoothstep(ringPhase, .82, 1));
    deathTransform.position.set(0, (index - 1) * radius * .38 * (1 - ringPhase), 0);
    deathTransform.rotation.set(Math.PI / 2 + (index - 1) * .12, phase * .15 + index * 1.1, 0);
    deathTransform.scale.setScalar(Math.max(.01, ringScale));
    deathTransform.updateMatrix(); rig.deathRings.setMatrixAt(index, deathTransform.matrix);
  }
  rig.deathRings.instanceMatrix.needsUpdate = true;

  for (let index = 0; index < rig.shardCount; index++) {
    const angle = index / rig.shardCount * Math.PI * 2 + rig.phase;
    const burst = Math.sin(Math.min(1, death * 1.45) * Math.PI);
    const orbit = radius * (.28 + burst * (1.08 + (index % 3) * .16));
    deathTransform.position.set(Math.cos(angle) * orbit, Math.sin(angle * 1.7) * radius * .64 * burst, Math.sin(angle) * orbit);
    deathTransform.rotation.set(phase + index, death * 5 + angle, angle * .5);
    deathTransform.scale.setScalar(radius * (.13 + (index % 2) * .055) * fade);
    deathTransform.updateMatrix(); rig.deathShards.setMatrixAt(index, deathTransform.matrix);
  }
  rig.deathShards.instanceMatrix.needsUpdate = true;

  const filament = THREE.MathUtils.smoothstep(death, .58, .88) * (1 - THREE.MathUtils.smoothstep(death, .91, 1));
  rig.deathBeam.visible = filament > .001;
  rig.deathBeam.position.y = radius * .18;
  rig.deathBeam.scale.set(radius * .045, radius * (3.4 - death * 1.4) * filament, radius * .045);
}

export function disposeCoopEnemyRig(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.geometry.userData.coopEnemyShared) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) if (!material.userData.coopEnemyShared) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function armorColor(type: Enemy['type']) {
  if (type === 'phantom') return '#b9cbd4';
  if (type === 'tank' || type === 'titan' || type === 'boss') return '#26333d';
  if (type === 'fast') return '#3f3428';
  if (type === 'ranged') return '#233d35';
  if (type === 'elite') return '#452d49';
  return '#34454a';
}
function numericId(id: string) { let hash = 2166136261; for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619); return hash >>> 0; }
