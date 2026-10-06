import { arcanaGlow } from './arcanaGlow';
import * as THREE from 'three';
import { COOP_SPELLS, isCoopSpell, type CoopSpellId } from '../combat/coopSpells';
import type { CoopCombatEvent, CoopSnapshot, CoopProjectileSnapshot } from '../multiplayer/CoopSimulation';

export type SpellLaunchOrigin = { position: THREE.Vector3Like; initialScale: number };
type Launch = { origin: THREE.Vector3; offset: THREE.Vector3; ageMs: number; initialScale: number };
type PredictedSpell = { key: string; ownerId: string; weaponId: CoopSpellId; group: THREE.Group; origin: THREE.Vector3; aimPoint: THREE.Vector3; direction: THREE.Vector3; ageMs: number; speed: number; initialScale: number };
const isBolt = (id: CoopSpellId) => id === 'ember_bolt' || id === 'cinderhex_engine' || id === 'astral_lance';

const orbGeometry = new THREE.IcosahedronGeometry(1, 2);
const ringGeometry = new THREE.TorusGeometry(1, .012, 4, 64);
const sparkGeometry = new THREE.OctahedronGeometry(1, 0);
const bodyGeometry = new THREE.CapsuleGeometry(5, 7, 3, 8);
type Effect = { group: THREE.Group; born: number; duration: number; radius: number; material: THREE.MeshBasicMaterial; sparks: THREE.InstancedMesh; flare: THREE.Sprite };
/** Persistent replicated ordnance and spell objects, plus bounded pooled-looking bursts. */
export class CoopArcanaVisuals {
  readonly group = new THREE.Group();
  private entities = new Map<string, THREE.Group>();
  private effects: Effect[] = [];
  private readonly sparkPose = new THREE.Object3D();
  private materials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly launches = new Map<string, Launch>();
  private readonly predictedSpells = new Map<string, PredictedSpell>();
  constructor() { this.group.name = 'Hellbinder Arcana and Grenade Effects'; }
  private material(color: string) {
    let material = this.materials.get(color);
    if (!material) { material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); this.materials.set(color, material); }
    return material;
  }
  private entity(key: string, make: () => THREE.Group) { let group = this.entities.get(key); if (!group) { group = make(); this.entities.set(key, group); this.group.add(group); } return group; }
  private magicOrb(color: string) {
    const group = new THREE.Group(), material = this.material(color);
    const core = new THREE.Mesh(orbGeometry, this.material('#fff0d9')); core.scale.setScalar(5); group.add(core);
    const corona = new THREE.Mesh(orbGeometry, material); corona.scale.setScalar(11); corona.name = 'corona'; group.add(corona);
    for (let index = 0; index < 2; index++) { const ring = new THREE.Mesh(ringGeometry, material); ring.scale.setScalar(16 + index * 5); ring.rotation.set(index * 1.2, index * .7, 0); group.add(ring); }
    for (let index = 0; index < 5; index++) { const mote = new THREE.Mesh(sparkGeometry, material); mote.scale.setScalar(4 - index * .5); mote.position.z = 18 + index * 14; group.add(mote); }
    group.add(arcanaGlow(color, 90, .4));
    return group;
  }
  /** Immediate cosmetic launch; damage and hit positions remain host-owned. */
  predictSpell(ownerId: string, weaponId: CoopSpellId, actionId: number, launch: SpellLaunchOrigin, aimPoint: THREE.Vector3Like, speed: number) {
    if (!isBolt(weaponId)) return;
    const key = `prediction:${ownerId}:${actionId}`;
    if (this.predictedSpells.has(key)) return;
    const group = this.entity(key, () => this.magicOrb(COOP_SPELLS[weaponId].color));
    const origin = new THREE.Vector3().copy(launch.position), direction = new THREE.Vector3().copy(aimPoint).sub(origin).normalize();
    group.position.copy(origin);
    this.poseSpell(group, weaponId, 0, direction, launch.initialScale);
    this.predictedSpells.set(key, { key, ownerId, weaponId, group, origin, aimPoint: new THREE.Vector3().copy(aimPoint), direction, ageMs: 0, speed, initialScale: launch.initialScale });
  }
  private poseSpell(group: THREE.Group, weaponId: CoopSpellId, time: number, direction: THREE.Vector3Like, scale: number) {
    const angle = Math.atan2(direction.z, direction.x), pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
    group.rotation.set(0, -angle - Math.PI / 2, 0); group.rotateX(pitch);
    group.children[1].rotation.set(time * .01, time * .007, time * .008);
    group.children[2].rotation.z = time * .008; group.children[3].rotation.z = -time * .012;
    group.scale.setScalar((weaponId === 'astral_lance' ? 1.5 : 1) * scale);
    // Trails grow behind the outgoing core, never across the near camera.
    for (let i = 4; i < 9; i++) {
      group.children[i].visible = scale > .2;
      if (weaponId === 'astral_lance') group.children[i].scale.set(2, 2, 16);
    }
  }
  update(snapshot: CoopSnapshot, deltaMs: number, getSpellOrigin?: (projectile: Pick<CoopProjectileSnapshot, 'ownerId' | 'weaponId'>) => SpellLaunchOrigin | undefined) {
    const alive = new Set<string>(), time = snapshot.elapsedMs;
    for (const prediction of this.predictedSpells.values()) {
      if (prediction.ageMs !== 0) continue;
      const hand = getSpellOrigin?.(prediction);
      if (!hand) continue;
      // Input may precede camera preparation/recoil by one frame. Sample the
      // final visible release pose before displaying or adopting the bolt.
      prediction.origin.copy(hand.position); prediction.group.position.copy(hand.position);
      prediction.direction.copy(prediction.aimPoint).sub(prediction.origin).normalize();
    }
    for (const grenade of snapshot.grenades || []) {
      const key = `g${grenade.id}`; alive.add(key);
      const group = this.entity(key, () => {
        const root = new THREE.Group();
        root.add(new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: 0x324c4a, metalness: .8, roughness: .35 })));
        const band = new THREE.Mesh(ringGeometry, this.material('#ffc777')); band.scale.setScalar(7); band.rotation.x = Math.PI / 2; root.add(band);
        const fuse = new THREE.Mesh(orbGeometry, this.material('#ffb24b')); fuse.position.y = 10; fuse.scale.setScalar(3); root.add(fuse);
        return root;
      });
      group.position.set(grenade.x, grenade.z, grenade.y); group.rotation.set(time * .009, time * .006, time * .007);
      group.children[2].scale.setScalar(2 + Math.sin(time * (.02 + .02 * (1 - grenade.fuseMs / 1600))) * 1.2);
    }
    for (const projectile of snapshot.projectiles) {
      if (!isCoopSpell(projectile.weaponId)) continue;
      const key = `p${projectile.id}`; alive.add(key);
      if (!this.entities.has(key)) {
        // Adopt the already-visible predicted bolt instead of drawing a second
        // projectile or restarting a delayed shot at the crosshair.
        const prediction = [...this.predictedSpells.values()].find(p => p.ownerId === projectile.ownerId && p.weaponId === projectile.weaponId);
        const hand = getSpellOrigin?.(projectile);
        if (prediction || hand) {
          const origin = prediction?.origin.clone() || new THREE.Vector3().copy(hand!.position);
          const start = prediction?.group.position.clone() || origin.clone();
          this.launches.set(key, { origin, offset: start.sub(new THREE.Vector3(projectile.x, projectile.z, projectile.y)), ageMs: 0, initialScale: prediction?.initialScale ?? hand!.initialScale });
          if (prediction) { this.entities.delete(prediction.key); this.entities.set(key, prediction.group); this.predictedSpells.delete(prediction.key); }
        }
      }
      const group = this.entity(key, () => this.magicOrb(COOP_SPELLS[projectile.weaponId as keyof typeof COOP_SPELLS].color));
      group.position.set(projectile.x, projectile.z, projectile.y);
      const launch = this.launches.get(key), direction = new THREE.Vector3(Math.cos(projectile.angle) * Math.cos(projectile.pitch), Math.sin(projectile.pitch), Math.sin(projectile.angle) * Math.cos(projectile.pitch));
      let scale = 1;
      if (launch) {
        const t = Math.min(1, launch.ageMs / 120), remaining = 1 - t * t * (3 - 2 * t);
        group.position.addScaledVector(launch.offset, remaining);
        // Follow the visible hand-to-target segment, including the correction's
        // velocity, so lance tails point along their actual displayed flight.
        direction.multiplyScalar(projectile.velocity).addScaledVector(launch.offset, -6 * t * (1 - t) / .12).normalize();
        scale = Math.min(1, launch.initialScale + group.position.distanceTo(launch.origin) / 180);
        launch.ageMs += Math.max(0, deltaMs);
      }
      this.poseSpell(group, projectile.weaponId, time, direction, scale);
    }
    for (const [key, prediction] of this.predictedSpells) {
      if (prediction.ageMs >= 200) { this.predictedSpells.delete(key); continue; }
      alive.add(key);
      prediction.group.position.copy(prediction.origin).addScaledVector(prediction.direction, prediction.speed * prediction.ageMs / 1000);
      const scale = Math.min(1, prediction.initialScale + prediction.group.position.distanceTo(prediction.origin) / 180);
      this.poseSpell(prediction.group, prediction.weaponId, time, prediction.direction, scale);
      prediction.ageMs += Math.max(0, deltaMs);
    }
    for (const zone of snapshot.spellZones || []) {
      const key = `z${zone.id}`; alive.add(key);
      const group = this.entity(key, () => {
        const root = new THREE.Group(), material = this.material(COOP_SPELLS[zone.weaponId].color);
        for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(ringGeometry, material); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(zone.radius * (1 - i * .21)); root.add(ring); }
        for (let i = 0; i < 12; i++) { const shard = new THREE.Mesh(sparkGeometry, material); shard.position.set(Math.cos(i / 12 * Math.PI * 2) * zone.radius * .8, 8, Math.sin(i / 12 * Math.PI * 2) * zone.radius * .8); shard.scale.set(5, 13, 5); root.add(shard); }
        const meteor = this.magicOrb('#ff735f'); meteor.name = 'Falling Meteor'; root.add(meteor); return root;
      });
      group.position.set(zone.x, 5, zone.y); group.rotation.y = time * .00065;
      const remaining = Math.max(0, zone.resolvesAtMs - time);
      const meteor = group.children[group.children.length - 1]; meteor.position.set(0, 25 + remaining * 1.3, 0); meteor.scale.setScalar(4.5);
    }
    for (const [key, group] of this.entities) if (!alive.has(key)) { group.removeFromParent(); group.traverse(object => { if (object instanceof THREE.Sprite) object.material.dispose(); }); if (key[0] === 'g') (group.children[0] as THREE.Mesh).material instanceof THREE.Material && ((group.children[0] as THREE.Mesh).material as THREE.Material).dispose(); this.entities.delete(key); this.launches.delete(key); }
    for (const effect of this.effects) {
      effect.born += deltaMs;
      const t = Math.min(1, effect.born / effect.duration);
      effect.material.opacity = Math.pow(1 - t, 1.5);
      for (let index = 0; index < 3; index++) { const ring = effect.group.children[index]; ring.scale.setScalar(effect.radius * Math.min(1.35, .06 + t * (1.8 - index * .25))); ring.position.y = 4 + index * 4; }
      const core = effect.group.children[3]; core.scale.setScalar(effect.radius * .20 * Math.sin(t * Math.PI)); core.position.y = 10 + t * 30;
      effect.flare.material.opacity = (1 - t) * .55; effect.flare.scale.setScalar(effect.radius * (1 + t));
      for (let index = 0; index < effect.sparks.count; index++) {
        const theta = index * 2.39996, spread = effect.radius * t * (index % 3 === 0 ? 1.2 : .7);
        this.sparkPose.position.set(Math.cos(theta) * spread, 10 + Math.sin(t * Math.PI) * (35 + index % 7 * 14), Math.sin(theta) * spread);
        this.sparkPose.scale.setScalar((1 - t) * (4 + index % 4)); this.sparkPose.rotation.set(t * 4 + index, index, t * 5);
        this.sparkPose.updateMatrix(); effect.sparks.setMatrixAt(index, this.sparkPose.matrix);
      }
      effect.sparks.instanceMatrix.needsUpdate = true;
    }
    this.effects = this.effects.filter(effect => { if (effect.born < effect.duration) return true; this.releaseEffect(effect); return false; });
  }
  impact(event: CoopCombatEvent) {
    if (this.effects.length >= 24) { const oldest = this.effects.shift()!; this.releaseEffect(oldest); }
    const group = new THREE.Group(), material = this.material(event.color || '#ffc777').clone(); material.opacity = 1;
    group.position.set(event.x, event.z || 0, event.y);
    const radius = event.amount || (event.weaponId === 'astral_lance' ? 65 : 55);
    for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(ringGeometry, material); ring.rotation.x = Math.PI / 2; group.add(ring); }
    group.add(new THREE.Mesh(orbGeometry, material));
    const sparks = new THREE.InstancedMesh(sparkGeometry, material, event.kind === 'grenade_detonated' || event.weaponId === 'rift_meteor' ? 40 : 22); sparks.frustumCulled = false; group.add(sparks);
    const flare = arcanaGlow(event.color || '#ffc777', radius * 1.5, .55); group.add(flare);
    this.group.add(group); this.effects.push({ group, material, radius, sparks, flare, born: 0, duration: event.weaponId === 'rift_meteor' ? 1100 : 750 });
  }
  private releaseEffect(effect: Effect) { effect.group.removeFromParent(); effect.material.dispose(); effect.flare.material.dispose(); effect.sparks.dispose(); }
  clear() {
    for (const [key, group] of this.entities) { group.traverse(object => { if (object instanceof THREE.Sprite) object.material.dispose(); }); if (key[0] === 'g') ((group.children[0] as THREE.Mesh).material as THREE.Material).dispose(); group.removeFromParent(); }
    this.entities.clear(); for (const effect of this.effects) { this.releaseEffect(effect); } this.effects = [];
    this.launches.clear(); this.predictedSpells.clear();
  }
  dispose() { this.clear(); for (const material of this.materials.values()) material.dispose(); this.materials.clear(); this.group.removeFromParent(); }
}
