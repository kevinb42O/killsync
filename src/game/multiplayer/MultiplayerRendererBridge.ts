import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../constants';
import { Enemy, ExperienceGem, Player, Projectile, Weapon, WorldItem } from '../../types';
import { GameEngine } from '../Engine';
import { Renderer3D } from '../Renderer3D';
import { soundManager } from '../SoundManager';
import { COOP_WEAPON_DETAILS, COOP_WEAPON_SLOTS, CoopCombatEvent, CoopSnapshot } from './CoopSimulation';
import { CoopFirearmVisualRig } from '../rendering/coopFirearmVisuals';
import type { CoopFirearmId } from '../combat/coopFirearms';
import { COOP_PASSIVE_BY_ID, passiveRadius, type CoopPassiveModuleId } from './CoopPassiveModules';
import { CoopTacticalVisuals } from '../rendering/CoopTacticalVisuals';

type PresentationParticle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; z?: number };
type RemotePlayerPresentation = {
  mesh: THREE.Group;
  firearm: CoopFirearmVisualRig;
  nameplate: THREE.Sprite;
  body: THREE.Object3D;
  visor: THREE.Object3D;
  downedMarker: THREE.Group;
};

/**
 * Presents the network snapshot through the established production Renderer3D.
 * This deliberately does not own a second 3D world, weapon model, camera, or
 * VFX implementation: it adapts the authoritative co-op snapshot to the
 * rendering contract already used by the single-player game.
 */
export class MultiplayerRendererBridge {
  private readonly renderer = new Renderer3D();
  private readonly tacticalVisuals = new CoopTacticalVisuals(this.renderer.scene);
  private readonly remotePlayers = new Map<string, RemotePlayerPresentation>();
  private readonly passiveMeshes = new Map<string, THREE.Group>();
  private readonly localFirearm = new CoopFirearmVisualRig(true);
  private readonly seenCombatEventIds = new Map<number, number>();
  private readonly combatParticles: PresentationParticle[] = [];
  private readonly renderState: Record<string, unknown>;
  private readonly handleCanvasPointerDown = () => this.requestPointerLock();
  private lastHitSoundAt = -Infinity;
  private presentationShake = 0;
  private lastSnapshotTick = -1;
  private visualElapsedMs = 0;

  constructor() {
    this.renderState = {
      player: this.createLocalPlayer(),
      // Co-op is deliberately first-person only. Renderer3D still supports
      // the original game's other modes; multiplayer never selects them.
      viewMode: 'FIRST_PERSON',
      enemies: [], projectiles: [], gems: [], items: [], shops: [], treasures: [], portals: [],
      activePortalIndex: -1, exfillPortal: null, particles: [], gameTime: 0, isDashing: false, screenShake: 0,
    };
    // The existing authored sidearm is the handgun. Alternative firearms are
    // mounted beside that exact rig and swap in only when selected.
    this.renderer.fpsWeaponGroup.add(this.localFirearm.group);
  }

  mount(container: HTMLElement) {
    this.renderer.mount(container);
    // Fetch and decode before the player opens fire. `activate()` is still
    // called on the first click to resume the AudioContext in browsers that
    // gate audio behind a trusted user gesture.
    this.preloadGunfire();
    soundManager.preloadReloads();
    // Pointer Lock must be requested directly from a trusted gesture on the
    // actual WebGL canvas. A React overlay parent is not reliable in every
    // browser, especially embedded browser shells.
    this.renderer.renderer.domElement.addEventListener('pointerdown', this.handleCanvasPointerDown);
  }
  preloadGunfire() { soundManager.preloadGunfire(); }
  requestPointerLock() { this.renderer.requestPointerLock(); }
  exitPointerLock() { this.renderer.exitPointerLock(); }
  get isPointerLocked() { return this.renderer.isPointerLocked; }
  getAimAngle() { return Math.atan2(-Math.cos(this.renderer.yaw), -Math.sin(this.renderer.yaw)); }
  getAimPitch() { return this.renderer.pitch; }

  render(snapshot: CoopSnapshot | null, localPlayerId: string, deltaMs: number, spectatorTargetId?: string | null, forceFirstPerson: boolean = false) {
    if (!snapshot) return;
    if (snapshot.tick < this.lastSnapshotTick) {
      this.seenCombatEventIds.clear(); this.combatParticles.length = 0; this.presentationShake = 0;
    }
    this.visualElapsedMs = snapshot.tick !== this.lastSnapshotTick ? snapshot.elapsedMs : Math.min(snapshot.elapsedMs + 100, this.visualElapsedMs + deltaMs);
    this.lastSnapshotTick = snapshot.tick;
    // A revive is an authoritative life-state change. It must win over any
    // previous spectator target in the same frame so the player cannot remain
    // stuck in third person after standing back up.
    const isSpectating = !forceFirstPerson && Boolean(spectatorTargetId && spectatorTargetId !== localPlayerId);
    const local = (isSpectating ? snapshot.players.find(player => player.id === spectatorTargetId) : undefined)
      || snapshot.players.find(player => player.id === localPlayerId) || snapshot.players[0];
    if (!local) return;
    const selectedWeaponId = COOP_WEAPON_SLOTS[local.selectedSlot] || 'plasma_gun';
    const weaponState = local.weaponStates[local.selectedSlot];
    const player = this.renderState.player as Player;
    player.position = { x: local.x, y: local.y };
    player.velocity = { x: Math.cos(local.angle) * 0.01, y: Math.sin(local.angle) * 0.01 };
    player.health = local.health; player.maxHealth = local.maxHealth;
    player.level = local.level; player.experience = local.experience; player.experienceToNextLevel = local.experienceToNextLevel;
    player.coins = local.coins; player.pendingDataCores = local.pendingDataCores;
    this.renderer.presentationVerticalOffset = local.z;
    // Crouches use the same low presentation silhouette as a slide, but do
    // not retain the sprint FOV once the slide key is held.
    this.renderer.presentationSprinting = local.sprinting && !local.sliding && !local.crouching;
    this.renderer.presentationSliding = local.sliding || local.crouching;
    // The host owns spread and reload eligibility; this only presents the
    // replicated aim state through the renderer's existing ADS camera rig.
    this.renderer.isAimingDownSights = local.isAiming;
    this.renderer.presentationScoped = local.isAiming && selectedWeaponId === 'sniper_rifle';
    this.renderer.weaponRoot.visible = selectedWeaponId === 'plasma_gun';
    this.renderer.presentationHandgunReloadProgress = selectedWeaponId === 'plasma_gun' && weaponState?.state === 'reloading'
      && weaponState.reloadStartedAtMs !== undefined && weaponState.reloadEndsAtMs !== undefined
      ? THREE.MathUtils.clamp((snapshot.elapsedMs - weaponState.reloadStartedAtMs) / Math.max(1, weaponState.reloadEndsAtMs - weaponState.reloadStartedAtMs), 0, 1)
      : 0;
    const rightForearm = this.renderer.armForearmMain.material as THREE.MeshStandardMaterial;
    const rightPalm = this.renderer.armPalm.material as THREE.MeshStandardMaterial;
    const rightChevron = this.renderer.armChevronTrim.material as THREE.MeshStandardMaterial;
    this.localFirearm.matchSuitPalette(rightForearm.color, rightPalm.color, rightChevron.color);
    if (weaponState) this.localFirearm.update(weaponState, snapshot.elapsedMs, deltaMs, local.isAiming);
    player.weapons = [this.createSelectedWeapon(selectedWeaponId, local.selectedWeaponLevel)];
    this.renderState.viewMode = isSpectating ? 'THIRD_PERSON' : 'FIRST_PERSON';
    this.renderState.gameTime = snapshot.elapsedMs;
    this.renderState.enemies = snapshot.enemies.map(enemy => this.toEnemy(enemy));
    this.renderState.projectiles = snapshot.projectiles.map(projectile => this.toProjectile(projectile));
    this.renderState.gems = snapshot.gems.map(gem => this.toGem(gem));
    this.renderState.items = [
      ...snapshot.items.map(item => this.toItem(item)),
      ...snapshot.ammoCaches.map(cache => ({ id: `coop-ammo-${cache.id}`, position: { x: cache.x, y: cache.y }, type: 'data_core' as const, value: cache.amount, color: cache.color, radius: 16 })),
    ];
    // Reuse the production city props for co-op terminals and extraction. The
    // host supplies only compact snapshot positions; presentation stays local.
    this.renderState.shops = snapshot.buyStations.filter(station => station.active).map(station => ({ id: `coop-station-${station.id}`, position: { x: station.x, y: station.y }, radius: station.radius }));
    this.renderState.exfillPortal = snapshot.run.exfil ? { position: { x: snapshot.run.exfil.x, y: snapshot.run.exfil.y }, radius: snapshot.run.exfil.radius, active: snapshot.run.phase === 'exfil' } : null;
    this.consumeCombatEvents(snapshot.combatEvents, localPlayerId, deltaMs);
    this.renderState.particles = this.combatParticles;
    this.renderState.screenShake = this.presentationShake;
    this.syncRemotePlayers(snapshot, isSpectating ? spectatorTargetId! : localPlayerId);
    this.syncPassiveModules(snapshot);
    this.tacticalVisuals.update(snapshot, this.visualElapsedMs);

    const engine = this.renderState as unknown as GameEngine;
    this.renderer.prepareFrame(engine, deltaMs);
    this.renderer.render(engine, deltaMs);
  }

  destroy() {
    this.exitPointerLock();
    this.renderer.renderer.domElement.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.localFirearm.dispose();
    this.tacticalVisuals.dispose();
    for (const remote of this.remotePlayers.values()) { remote.firearm.dispose(); disposeNameplate(remote.nameplate); this.renderer.scene.remove(remote.mesh); }
    this.remotePlayers.clear();
    for (const mesh of this.passiveMeshes.values()) { this.renderer.scene.remove(mesh); disposeGroup(mesh); }
    this.passiveMeshes.clear();
    this.renderer.destroy();
  }

  private createLocalPlayer(): Player {
    return {
      id: 'local', position: { x: 1600, y: 1600 }, velocity: { x: 0, y: 0 }, radius: 20,
      health: 100, maxHealth: 100, color: '#22d3ee', level: 1, experience: 0, experienceToNextLevel: 100,
      speed: 300, weapons: [this.createSelectedWeapon('plasma_gun', 1)], upgrades: [], coins: 0, rerolls: 0,
      rerollsThisWave: 0, banishes: 0, skips: 0, bannedUpgrades: new Set(), permanentUpgrades: {}, operatorId: 'phantom',
      pendingDataCores: 0, currentWave: 1, inventory: { armorTier: 0, hasRevive: false, nukeCount: 0 }, armorHp: 0,
      lastHitTime: 0,
      stats: { might: 1, area: 1, speed: 1, cooldown: 1, amount: 0, luck: 1, growth: 1, greed: 1, regen: 0, magnet_range: 1, dash_cooldown: 1, boss_damage: 1, extra_weapon: 0, overdrive_duration: 0, vampirism: 0, armor: 0, timeWarp: 0 },
    };
  }

  private createSelectedWeapon(id: string, level: number): Weapon {
    const definition = WEAPON_DEFINITIONS.find(weapon => weapon.id === id) || WEAPON_DEFINITIONS[0];
    return { id: definition.id, name: definition.name, level, maxLevel: 8, description: definition.description, cooldown: (definition.baseCooldown || 600) * Math.pow(0.9, Math.max(0, level - 1)), lastFired: 0, type: definition.type as Weapon['type'], burstCount: definition.burstCount, burstDelay: definition.burstDelay };
  }

  private toEnemy(enemy: CoopSnapshot['enemies'][number]): Enemy {
    return {
      id: `coop-enemy-${enemy.id}`, position: { x: enemy.x, y: enemy.y }, velocity: { x: 0, y: 0 },
      radius: enemy.radius, health: enemy.health, maxHealth: enemy.maxHealth, color: enemy.color,
      damage: enemy.damage, speed: enemy.speed * 88, experienceValue: enemy.experienceValue, type: enemy.type as Enemy['type'],
      hitFlash: enemy.hitFlashMs, slowMultiplier: enemy.slowMultiplier,
      presentationFacingAngle: enemy.facingAngle,
      presentationDeathProgress: enemy.dying ? 1 - enemy.deathRemainingMs / 220 : 0,
      presentationAttackCharge: enemy.attackWindupUntilMs && enemy.attackWindupUntilMs > this.visualElapsedMs ? 1 - Math.min(1, (enemy.attackWindupUntilMs - this.visualElapsedMs) / 1600) : 0,
    };
  }

  private toGem(gem: CoopSnapshot['gems'][number]): ExperienceGem {
    return { id: `coop-gem-${gem.id}`, position: { x: gem.x, y: gem.y }, value: gem.value, color: gem.color };
  }

  private toItem(item: CoopSnapshot['items'][number]): WorldItem {
    return { id: `coop-item-${item.id}`, position: { x: item.x, y: item.y }, type: item.type, value: item.value, color: item.color };
  }

  private toProjectile(projectile: CoopSnapshot['projectiles'][number]): Projectile {
    return {
      id: `coop-projectile-${projectile.id}`, position: { x: projectile.x, y: projectile.y }, velocity: { x: Math.cos(projectile.angle) * Math.cos(projectile.pitch) * projectile.velocity, y: Math.sin(projectile.angle) * Math.cos(projectile.pitch) * projectile.velocity },
      radius: projectile.radius, health: 1, maxHealth: 1, color: COOP_WEAPON_DETAILS[projectile.weaponId].color,
      damage: 1, duration: projectile.lifeMs, ownerId: projectile.ownerId, penetration: 1, sourceWeaponId: projectile.weaponId,
      // Renderer3D uses rotation—not just position—to orient its authored
      // projectile meshes along their flight vector.
      rotation: projectile.angle, z: projectile.z, presentationPitch: projectile.pitch,
    };
  }

  /** Events are presentation-only and deduplicated locally. The host repeats
   * them in snapshots for a short time, so this remains robust to packet loss. */
  private consumeCombatEvents(events: CoopCombatEvent[], localPlayerId: string, deltaMs: number) {
    this.presentationShake = Math.max(0, this.presentationShake - deltaMs * 0.022);
    for (const particle of this.combatParticles) {
      particle.x += particle.vx * (deltaMs / 16.666);
      particle.y += particle.vy * (deltaMs / 16.666);
      particle.life -= deltaMs;
    }
    for (let index = this.combatParticles.length - 1; index >= 0; index--) {
      if (this.combatParticles[index].life <= 0) this.combatParticles.splice(index, 1);
    }

    const now = performance.now();
    for (const [id, seenAt] of this.seenCombatEventIds) {
      if (now - seenAt > 5_000) this.seenCombatEventIds.delete(id);
    }
    for (const event of events) {
      if (this.seenCombatEventIds.has(event.id)) continue;
      this.seenCombatEventIds.set(event.id, now);
      this.presentCombatEvent(event, localPlayerId, now);
    }
  }

  private presentCombatEvent(event: CoopCombatEvent, localPlayerId: string, now: number) {
    if (event.kind === 'player_damaged' && event.playerId === localPlayerId) {
      this.presentationShake = Math.max(this.presentationShake, 3.4);
      if (now - this.lastHitSoundAt > 180) {
        soundManager.playDamage();
        this.lastHitSoundAt = now;
      }
    } else if (event.kind === 'player_downed') {
      this.spawnBurst(event.x, event.y, '#fb7185', 14, 800, 5);
      if (event.playerId === localPlayerId) this.presentationShake = Math.max(this.presentationShake, 9);
    } else if (event.kind === 'player_revived') {
      this.spawnBurst(event.x, event.y, '#5eead4', 18, 900, 5.5);
      if (event.playerId === localPlayerId) { this.presentationShake = Math.max(this.presentationShake, 5); soundManager.playLevelUp(); }
    } else if (event.kind === 'enemy_hit') {
      this.spawnBurst(event.x, event.y, event.color || '#ffffff', 3, 310, 2.5);
      this.presentationShake = Math.max(this.presentationShake, 1.5);
      if (now - this.lastHitSoundAt > 45) {
        soundManager.playHit();
        this.lastHitSoundAt = now;
      }
    } else if (event.kind === 'enemy_killed') {
      this.spawnBurst(event.x, event.y, event.color || '#ff4466', 12, 760, 5.5);
      this.presentationShake = Math.max(this.presentationShake, 5);
      soundManager.playExplosion();
    } else if (event.kind === 'drop_spawned') {
      this.spawnBurst(event.x, event.y, event.color || '#00ffcc', 4, 520, 3.5);
    } else if (event.kind === 'pickup_collected' && event.playerId === localPlayerId) {
      this.spawnBurst(event.x, event.y, event.color || '#00ffcc', 5, 420, 3);
      soundManager.playCollect();
    } else if (event.kind === 'level_up' && event.playerId === localPlayerId) {
      this.spawnBurst(event.x, event.y, event.color || '#67e8f9', 16, 900, 5.5);
      soundManager.playLevelUp();
    } else if (event.kind === 'weapon_upgraded' && event.playerId === localPlayerId) {
      this.spawnBurst(event.x, event.y, event.color || '#67e8f9', 10, 680, 4.5);
      soundManager.playUIHover();
    } else if ((event.kind === 'reload_started' || event.kind === 'reload_shell_loaded') && event.playerId === localPlayerId) {
      // Reload state is host-authoritative just like firing, so a denied or
      // interrupted reload never emits a misleading magazine sound. The
      // shotgun additionally emits an authoritative seat sound per shell.
      soundManager.playReload(event.weaponId);
    } else if (event.kind === 'weapon_fired') {
      if (event.weaponId) {
        if (event.playerId === localPlayerId) {
          // Only the locally controlled weapon is heard as a direct shot.
          // The authoritative fire event means this covers every firearm and
          // cannot play for a rejected client-side trigger pull.
          soundManager.playGunfire(event.weaponId);
          if (event.weaponId === 'plasma_gun') this.renderer.triggerMuzzleFlash(event.color || '#67e8f9');
          else this.localFirearm.fire(event.weaponId as CoopFirearmId);
        }
        else this.remotePlayers.get(event.playerId || '')?.firearm.fire(event.weaponId as CoopFirearmId);
      }
      this.presentationShake = Math.max(this.presentationShake, event.weaponId === 'sniper_rifle' ? 3.6 : event.weaponId === 'combat_shotgun' ? 2.5 : .8);
    }
  }

  private spawnBurst(x: number, y: number, color: string, count: number, life: number, size: number) {
    const available = Math.max(0, 120 - this.combatParticles.length);
    for (let index = 0; index < Math.min(count, available); index++) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 0.12 + Math.random() * 0.2;
      this.combatParticles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size });
    }
  }

  private syncRemotePlayers(snapshot: CoopSnapshot, localPlayerId: string) {
    const active = new Set<string>();
    for (const player of snapshot.players) {
      if (player.id === localPlayerId) continue;
      active.add(player.id);
      let remote = this.remotePlayers.get(player.id);
      if (!remote) {
        remote = this.createRemotePlayer(player.color, player.label);
        this.remotePlayers.set(player.id, remote); this.renderer.scene.add(remote.mesh);
      }
      const mesh = remote.mesh;
      const downed = player.lifeState === 'downed';
      mesh.visible = player.lifeState !== 'eliminated';
      mesh.position.set(player.x, player.z, player.y);
      const lowProfile = player.sliding || player.crouching;
      mesh.scale.set(1, lowProfile ? 0.62 : 1, lowProfile ? 1.16 : 1);
      mesh.rotation.y = Math.PI / 2 - player.angle;
      // Rotate only the body. Tipping the whole avatar group drove its origin
      // into the city floor, making a still-revivable teammate disappear.
      mesh.rotation.z = 0;
      remote.body.position.set(0, downed ? 14 : 29, 0);
      remote.body.rotation.set(0, 0, downed ? Math.PI / 2 : 0);
      remote.visor.position.set(downed ? 24 : 0, downed ? 14 : 43, downed ? 0 : 12);
      remote.visor.rotation.set(0, 0, downed ? Math.PI / 2 : 0);
      remote.firearm.group.visible = !downed;
      remote.nameplate.position.set(0, downed ? 32 : 62, 0);
      remote.downedMarker.visible = downed;
      if (downed) remote.downedMarker.rotation.y = snapshot.elapsedMs * .0025;
      const state = player.weaponStates[player.selectedSlot];
      if (state && !downed) remote.firearm.update(state, snapshot.elapsedMs, 16.666, player.isAiming);
    }
    for (const [id, remote] of this.remotePlayers) {
      if (active.has(id)) continue;
      remote.firearm.dispose(); disposeNameplate(remote.nameplate); this.renderer.scene.remove(remote.mesh); this.remotePlayers.delete(id);
    }
  }

  /** Render the small, capped passive roster as world-space effects for every
   * squad member. Gameplay still happens entirely in CoopSimulation. */
  private syncPassiveModules(snapshot: CoopSnapshot) {
    const active = new Set<string>();
    for (const player of snapshot.players) {
      if (player.lifeState === 'eliminated') continue;
      for (const module of player.passiveModules) {
        const key = `${player.id}:${module.id}`;
        active.add(key);
        let mesh = this.passiveMeshes.get(key);
        const existingRank = mesh?.userData.rank as number | undefined;
        if (!mesh || existingRank !== module.rank) {
          if (mesh) { this.renderer.scene.remove(mesh); disposeGroup(mesh); }
          mesh = createPassiveMesh(module.id, module.rank);
          this.passiveMeshes.set(key, mesh); this.renderer.scene.add(mesh);
        }
        mesh.position.set(player.x, 2, player.y);
        const data = mesh.userData as { orbit?: THREE.Group; pulse?: THREE.Mesh };
        if (data.orbit) data.orbit.rotation.y = snapshot.elapsedMs * (module.id === 'data_scythe' ? -.0068 : .0044);
        if (data.pulse) data.pulse.scale.setScalar(1 + Math.sin(snapshot.elapsedMs * .004) * .11);
      }
    }
    for (const [key, mesh] of this.passiveMeshes) {
      if (active.has(key)) continue;
      this.renderer.scene.remove(mesh); disposeGroup(mesh); this.passiveMeshes.delete(key);
    }
  }

  private createRemotePlayer(color: string, label: string) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.55, roughness: 0.34 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(13, 28, 5, 10), material); body.position.y = 29; group.add(body);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 4), new THREE.MeshBasicMaterial({ color: 0x67e8f9 })); visor.position.set(0, 43, 12); group.add(visor);
    const firearm = new CoopFirearmVisualRig(false); group.add(firearm.group);
    const nameplate = createNameplate(label, color); nameplate.position.set(0, 62, 0); group.add(nameplate);
    const downedMarker = new THREE.Group();
    const markerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: .82, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(31, 1.8, 8, 40), markerMaterial);
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.5; downedMarker.add(ring);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(42, 1.4, 2), markerMaterial); cross.position.y = 2; downedMarker.add(cross);
    downedMarker.visible = false; group.add(downedMarker);
    return { mesh: group, firearm, nameplate, body, visor, downedMarker };
  }
}

function createPassiveMesh(id: CoopPassiveModuleId, rank: number) {
  const definition = COOP_PASSIVE_BY_ID[id];
  const color = new THREE.Color(definition.color);
  const group = new THREE.Group(); group.name = `coop-passive:${id}`;
  const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false });
  let orbit: THREE.Group | undefined;
  let pulse: THREE.Mesh | undefined;
  if (id === 'orbit_drones' || id === 'data_scythe') {
    orbit = new THREE.Group();
    const count = id === 'orbit_drones' ? 1 + rank : rank;
    const radius = passiveRadius(id, rank);
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2;
      const part = id === 'orbit_drones'
        ? new THREE.Mesh(new THREE.OctahedronGeometry(7 + rank, 0), glow)
        : new THREE.Mesh(new THREE.BoxGeometry(7, 4, 28 + rank * 6), glow);
      part.position.set(Math.cos(angle) * radius, 15, Math.sin(angle) * radius);
      part.rotation.y = -angle;
      orbit.add(part);
    }
    group.add(orbit);
  } else {
    const radius = passiveRadius(id, rank);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .92, radius, 48), glow);
    ring.rotation.x = -Math.PI / 2; ring.position.y = .35; group.add(ring);
    if (id === 'neural_pulse') pulse = ring;
  }
  group.userData = { rank, orbit, pulse };
  return group;
}

function disposeGroup(group: THREE.Group) {
  group.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach(item => item.dispose()); else material?.dispose();
  });
}

function createNameplate(label: string, color: string) {
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
  roundedRect(context, 2, 2, width - 4, 52, 10); context.fill();
  context.strokeStyle = color; context.globalAlpha = .9; context.lineWidth = 2; roundedRect(context, 2, 2, width - 4, 52, 10); context.stroke();
  context.globalAlpha = 1; context.fillStyle = '#f8fafc'; context.fillText(text, width / 2, 29);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(width * .36, 20, 1);
  return sprite;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath(); context.roundRect(x, y, width, height, radius); context.closePath();
}

function disposeNameplate(sprite: THREE.Sprite) {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose(); material.dispose();
}
