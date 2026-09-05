import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../constants';
import { Enemy, ExperienceGem, Player, Projectile, Weapon, WorldItem } from '../../types';
import { GameEngine } from '../Engine';
import { Renderer3D } from '../Renderer3D';
import { soundManager } from '../SoundManager';
import { COOP_ENEMY_DEATH_PRESENTATION_MS, COOP_WEAPON_DETAILS, COOP_WEAPON_SLOTS, CoopCombatEvent, CoopSnapshot } from './CoopSimulation';
import { CoopFirearmVisualRig } from '../rendering/coopFirearmVisuals';
import type { CoopFirearmId } from '../combat/coopFirearms';
import { COOP_PASSIVE_BY_ID, passiveRadius, type CoopPassiveModuleId } from './CoopPassiveModules';
import { COOP_UPLINK_RADIUS } from './CoopRunDirector';
import { CoopTacticalVisuals } from '../rendering/CoopTacticalVisuals';
import type { CoopPingKind } from './protocol';
import {
  type CoopOperatorRig,
  createCoopOperatorRig,
  updateCoopOperatorRig,
  disposeCoopOperatorRig,
} from '../rendering/coopOperatorVisuals';
import { OperatorTrailSystem } from '../rendering/OperatorTrailSystem';

type PresentationParticle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; z?: number };

/**
 * Presents the network snapshot through the established production Renderer3D.
 * This deliberately does not own a second 3D world, weapon model, camera, or
 * VFX implementation: it adapts the authoritative co-op snapshot to the
 * rendering contract already used by the single-player game.
 */
export class MultiplayerRendererBridge {
  private readonly renderer = new Renderer3D();
  private readonly tacticalVisuals = new CoopTacticalVisuals(this.renderer.scene);
  private readonly remotePlayers = new Map<string, CoopOperatorRig>();
  private readonly passiveMeshes = new Map<string, THREE.Group>();
  private readonly localFirearm = new CoopFirearmVisualRig(true);
  private readonly trailSystem: OperatorTrailSystem;
  private readonly seenCombatEventIds = new Map<number, number>();
  private readonly combatParticles: PresentationParticle[] = [];
  private readonly renderEnemies: Enemy[] = [];
  private readonly renderEnemyById = new Map<number, Enemy>();
  private readonly renderProjectiles: Projectile[] = [];
  private readonly renderProjectileById = new Map<number, Projectile>();
  private readonly renderGems: ExperienceGem[] = [];
  private readonly renderGemById = new Map<number, ExperienceGem>();
  private readonly renderItems: WorldItem[] = [];
  private readonly renderItemById = new Map<string, WorldItem>();
  private readonly renderState: Record<string, unknown>;
  private readonly handleCanvasPointerDown = () => this.requestPointerLock();
  private lastHitSoundAt = -Infinity;
  private presentationShake = 0;
  private lastSnapshotTick = -1;
  private visualElapsedMs = 0;
  private readonly predictedFireActions = new Set<number>();
  private lastLocalZ = 0;
  private localWasAirborne = false;
  private localAirborneTimeMs = 0;

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
    this.trailSystem = new OperatorTrailSystem(this.renderer.scene);
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
  canLocalJump() { return this.lastLocalZ <= 0.08; }
  getAimAngle() { return Math.atan2(-Math.cos(this.renderer.yaw), -Math.sin(this.renderer.yaw)); }
  getAimPitch() { return this.renderer.pitch; }

  /** Calculates the world coordinates and target context for a tactical ping. */
  calculatePingTarget(snapshot: CoopSnapshot | null, localPlayerId: string): { x: number; y: number; z: number; kind: CoopPingKind; label: string } {
    const local = snapshot?.players.find(p => p.id === localPlayerId) || snapshot?.players[0];
    if (!local) return { x: 0, y: 0, z: 0, kind: 'location', label: 'Waypoint' };

    const yaw = this.renderer.yaw;
    const pitch = this.renderer.pitch;
    const forwardX = -Math.sin(yaw);
    const forwardY = -Math.cos(yaw);
    const aimAngle = this.getAimAngle();

    if (snapshot) {
      // 1. Boss
      const boss = snapshot.run.boss;
      if (boss) {
        const dx = boss.x - local.x;
        const dy = boss.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.16 && dist < 2600) {
          return { x: boss.x, y: boss.y, z: 20, kind: 'boss', label: boss.name.toUpperCase() };
        }
      }

      // 2. Downed Teammates (Revive Ping)
      const downed = snapshot.players.filter(p => p.id !== localPlayerId && p.lifeState === 'downed');
      for (const teammate of downed) {
        const dx = teammate.x - local.x;
        const dy = teammate.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.18 && dist < 2400) {
          return { x: teammate.x, y: teammate.y, z: 5, kind: 'revive', label: `REVIVE ${teammate.label.toUpperCase()}` };
        }
      }

      // 3. Nearest Hostile within aim cone
      let bestEnemy: { x: number; y: number; kind: CoopPingKind; label: string; score: number } | null = null;
      for (const enemy of snapshot.enemies) {
        if (enemy.dying) continue;
        const dx = enemy.x - local.x;
        const dy = enemy.y - local.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1800) continue;
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.14) {
          const score = diff * dist;
          if (!bestEnemy || score < bestEnemy.score) {
            bestEnemy = {
              x: enemy.x,
              y: enemy.y,
              kind: 'enemy',
              label: `HOSTILE (${enemy.type.toUpperCase()})`,
              score,
            };
          }
        }
      }
      if (bestEnemy) {
        return { x: bestEnemy.x, y: bestEnemy.y, z: 12, kind: bestEnemy.kind, label: bestEnemy.label };
      }

      // 4. Buy Station
      for (const station of snapshot.buyStations) {
        if (!station.active) continue;
        const dx = station.x - local.x;
        const dy = station.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.16 && dist < 2200) {
          return { x: station.x, y: station.y, z: 10, kind: 'station', label: 'BUY STATION' };
        }
      }

      // 5. Objective / Uplink
      const objective = snapshot.run.objective;
      if (objective) {
        const dx = objective.x - local.x;
        const dy = objective.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.18 && dist < 2500) {
          return { x: objective.x, y: objective.y, z: 15, kind: 'objective', label: objective.title.toUpperCase() };
        }
      }
    }

    // 6. Ground plane projection or forward look position
    let targetDist = 650;
    if (pitch < -0.06) {
      const camHeight = 36 + (local.z || 0);
      targetDist = Math.max(50, Math.min(1200, camHeight / Math.tan(-pitch)));
    }
    const pingX = Math.round(local.x + forwardX * targetDist);
    const pingY = Math.round(local.y + forwardY * targetDist);
    return { x: pingX, y: pingY, z: 0, kind: 'location', label: 'WAYPOINT' };
  }

  /**
   * deduplicated later; damage and ammo never leave the host simulation. */
  predictLocalFire(weaponId: CoopFirearmId, actionId: number) {
    this.predictedFireActions.add(actionId);
    if (this.predictedFireActions.size > 32) this.predictedFireActions.delete(this.predictedFireActions.values().next().value!);
    soundManager.playGunfire(weaponId);
    if (weaponId === 'plasma_gun') this.renderer.triggerMuzzleFlash(COOP_WEAPON_DETAILS[weaponId].color);
    else this.localFirearm.fire(weaponId);
  }

  render(snapshot: CoopSnapshot | null, localPlayerId: string, deltaMs: number, spectatorTargetId?: string | null, forceFirstPerson: boolean = false) {
    if (!snapshot) return;
    const snapshotChanged = snapshot.tick !== this.lastSnapshotTick;
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
    player.position.x = local.x; player.position.y = local.y;
    player.velocity.x = Math.cos(local.angle) * 0.01; player.velocity.y = Math.sin(local.angle) * 0.01;
    player.health = local.health; player.maxHealth = local.maxHealth;
    player.level = local.level; player.experience = local.experience; player.experienceToNextLevel = local.experienceToNextLevel;
    player.coins = local.coins; player.pendingDataCores = local.pendingDataCores;
    this.renderer.presentationVerticalOffset = local.z;
    const currentZ = local.z;
    if (currentZ > 0.08) {
      this.localAirborneTimeMs += deltaMs;
      this.localWasAirborne = true;
    } else {
      if (this.localWasAirborne && this.localAirborneTimeMs >= 60) {
        soundManager.playLanding();
      }
      this.localWasAirborne = false;
      this.localAirborneTimeMs = 0;
    }
    this.lastLocalZ = currentZ;
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
    if (player.weapons[0]?.id !== selectedWeaponId || player.weapons[0]?.level !== local.selectedWeaponLevel) {
      player.weapons[0] = this.createSelectedWeapon(selectedWeaponId, local.selectedWeaponLevel);
      player.weapons.length = 1;
    }
    // When spectating we keep viewMode FIRST_PERSON so that Renderer3D
    // renders the camera without the old low-detail thirdPersonPlayerGroup.
    // The spectated player is instead rendered by their CoopOperatorRig
    // (see syncRemotePlayers below). We drive renderer.yaw from the network
    // angle so the chase-behind rig faces the correct direction.
    if (isSpectating) {
      // Convert game angle (atan2 XY) → Three.js yaw so camera & rig align.
      this.renderer.yaw = Math.atan2(-Math.cos(local.angle), -Math.sin(local.angle));
    }
    this.renderState.viewMode = 'FIRST_PERSON';
    this.renderState.gameTime = snapshot.elapsedMs;
    this.syncRenderEnemies(snapshot);
    this.syncRenderProjectiles(snapshot);
    if (snapshotChanged) this.syncStaticRenderEntities(snapshot);
    this.renderState.enemies = this.renderEnemies;
    this.renderState.projectiles = this.renderProjectiles;
    this.renderState.gems = this.renderGems;
    this.renderState.items = this.renderItems;
    // Reuse the production city props for co-op terminals and extraction. The
    // host supplies only compact snapshot positions; presentation stays local.
    if (snapshotChanged) {
      this.renderState.shops = snapshot.buyStations.filter(station => station.active).map(station => ({ id: `coop-station-${station.id}`, position: { x: station.x, y: station.y }, radius: station.radius }));
      this.renderState.exfillPortal = snapshot.run.exfil ? { position: { x: snapshot.run.exfil.x, y: snapshot.run.exfil.y }, radius: snapshot.run.exfil.radius, active: snapshot.run.phase === 'exfil' } : null;
    }
    this.renderState.gasZone = snapshot.gasZone;

    // Ambient floating toxic chemical spores when local player is within the gas
    if (snapshot.gasZone && Math.hypot(local.x - snapshot.gasZone.x, local.y - snapshot.gasZone.y) <= snapshot.gasZone.radius) {
      if (Math.random() < 0.35 && this.combatParticles.length < 320) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 180;
        this.combatParticles.push({
          x: local.x + Math.cos(angle) * dist,
          y: local.y + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: 0,
          maxLife: 600 + Math.random() * 400,
          color: Math.random() < 0.65 ? '#4ade80' : '#a3e635',
          size: 2.5 + Math.random() * 3,
          z: 6 + Math.random() * 34,
        });
      }
    }

    this.consumeCombatEvents(snapshot.combatEvents, localPlayerId, deltaMs);
    this.renderState.particles = this.combatParticles;
    this.renderState.screenShake = this.presentationShake;
    // Always pass the true localPlayerId so every teammate (including the
    // spectated player) gets their rich CoopOperatorRig rendered. The caller
    // no longer uses the old thirdPersonPlayerGroup for spectating.
    this.syncRemotePlayers(snapshot, localPlayerId);
    this.syncPassiveModules(snapshot);
    this.tacticalVisuals.update(snapshot, this.visualElapsedMs);
    this.trailSystem.update(snapshot.players, snapshot.elapsedMs, deltaMs);

    // Continuous Tower Mission (Uplink) charging sound
    const objective = snapshot.run?.objective;
    const isUplink = objective?.kind === 'uplink' && !objective.completed;
    const inUplinkCircle = Boolean(isUplink && local.lifeState === 'alive'
      && Math.hypot(local.x - objective.x, local.y - objective.y) <= COOP_UPLINK_RADIUS);
    const progressRatio = isUplink && objective.required > 0 ? objective.progress / objective.required : 0;
    soundManager.updateTowerCharge(inUplinkCircle, progressRatio);

    const engine = this.renderState as unknown as GameEngine;
    this.renderer.prepareFrame(engine, deltaMs);
    this.renderer.render(engine, deltaMs);
  }

  destroy() {
    soundManager.stopTowerCharge();
    this.exitPointerLock();
    this.renderer.renderer.domElement.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.localFirearm.dispose();
    this.tacticalVisuals.dispose();
    this.trailSystem.dispose();
    for (const remote of this.remotePlayers.values()) {
      disposeCoopOperatorRig(remote);
      this.renderer.scene.remove(remote.root);
    }
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

  /** Keep renderer-contract objects stable across display frames. */
  private syncRenderEnemies(snapshot: CoopSnapshot) {
    const active = new Set<number>();
    this.renderEnemies.length = 0;
    for (const source of snapshot.enemies) {
      active.add(source.id);
      let enemy = this.renderEnemyById.get(source.id);
      if (!enemy) { enemy = this.toEnemy(source); this.renderEnemyById.set(source.id, enemy); }
      else {
        enemy.position.x = source.x; enemy.position.y = source.y;
        enemy.radius = source.radius; enemy.health = source.health; enemy.maxHealth = source.maxHealth;
        enemy.color = source.color; enemy.damage = source.damage; enemy.speed = source.speed * 88;
        enemy.experienceValue = source.experienceValue; enemy.type = source.type;
        enemy.hitFlash = source.hitFlashMs; enemy.slowMultiplier = source.slowMultiplier;
        enemy.presentationFacingAngle = source.facingAngle;
        enemy.presentationDeathProgress = source.dying ? 1 - source.deathRemainingMs / COOP_ENEMY_DEATH_PRESENTATION_MS : 0;
        enemy.presentationAttackCharge = source.attackWindupUntilMs && source.attackWindupUntilMs > this.visualElapsedMs
          ? 1 - Math.min(1, (source.attackWindupUntilMs - this.visualElapsedMs) / 1600) : 0;
      }
      this.renderEnemies.push(enemy);
    }
    for (const id of this.renderEnemyById.keys()) if (!active.has(id)) this.renderEnemyById.delete(id);
  }

  private syncRenderProjectiles(snapshot: CoopSnapshot) {
    const active = new Set<number>();
    this.renderProjectiles.length = 0;
    for (const source of snapshot.projectiles) {
      active.add(source.id);
      let projectile = this.renderProjectileById.get(source.id);
      if (!projectile) { projectile = this.toProjectile(source); this.renderProjectileById.set(source.id, projectile); }
      else {
        const horizontalVelocity = Math.cos(source.pitch) * source.velocity;
        projectile.position.x = source.x; projectile.position.y = source.y;
        projectile.velocity.x = Math.cos(source.angle) * horizontalVelocity;
        projectile.velocity.y = Math.sin(source.angle) * horizontalVelocity;
        projectile.radius = source.radius; projectile.duration = source.lifeMs;
        projectile.rotation = source.angle; projectile.z = source.z; projectile.presentationPitch = source.pitch;
      }
      this.renderProjectiles.push(projectile);
    }
    for (const id of this.renderProjectileById.keys()) if (!active.has(id)) this.renderProjectileById.delete(id);
  }

  /** Drops only change on simulation snapshots, not during interpolation. */
  private syncStaticRenderEntities(snapshot: CoopSnapshot) {
    const activeGems = new Set<number>();
    this.renderGems.length = 0;
    for (const source of snapshot.gems) {
      activeGems.add(source.id);
      let gem = this.renderGemById.get(source.id);
      if (!gem) { gem = this.toGem(source); this.renderGemById.set(source.id, gem); }
      else { gem.position.x = source.x; gem.position.y = source.y; gem.value = source.value; gem.color = source.color; }
      this.renderGems.push(gem);
    }
    for (const id of this.renderGemById.keys()) if (!activeGems.has(id)) this.renderGemById.delete(id);

    const activeItems = new Set<string>();
    this.renderItems.length = 0;
    for (const source of snapshot.items) {
      const key = `item:${source.id}`;
      activeItems.add(key);
      let item = this.renderItemById.get(key);
      if (!item) { item = this.toItem(source); this.renderItemById.set(key, item); }
      else { item.position.x = source.x; item.position.y = source.y; item.type = source.type; item.value = source.value; item.color = source.color; }
      this.renderItems.push(item);
    }
    for (const source of snapshot.ammoCaches) {
      const key = `ammo:${source.id}`;
      activeItems.add(key);
      let item = this.renderItemById.get(key);
      if (!item) {
        item = { id: `coop-ammo-${source.id}`, position: { x: source.x, y: source.y }, type: 'data_core', value: source.amount, color: source.color, radius: 16 };
        this.renderItemById.set(key, item);
      } else { item.position.x = source.x; item.position.y = source.y; item.value = source.amount; item.color = source.color; }
      this.renderItems.push(item);
    }
    for (const id of this.renderItemById.keys()) if (!activeItems.has(id)) this.renderItemById.delete(id);
  }

  private toEnemy(enemy: CoopSnapshot['enemies'][number]): Enemy {
    return {
      id: `coop-enemy-${enemy.id}`, position: { x: enemy.x, y: enemy.y }, velocity: { x: 0, y: 0 },
      radius: enemy.radius, health: enemy.health, maxHealth: enemy.maxHealth, color: enemy.color,
      damage: enemy.damage, speed: enemy.speed * 88, experienceValue: enemy.experienceValue, type: enemy.type as Enemy['type'],
      hitFlash: enemy.hitFlashMs, slowMultiplier: enemy.slowMultiplier,
      presentationFacingAngle: enemy.facingAngle,
      presentationDeathProgress: enemy.dying ? 1 - enemy.deathRemainingMs / COOP_ENEMY_DEATH_PRESENTATION_MS : 0,
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
    } else if (event.kind === 'objective_completed') {
      this.spawnBurst(event.x, event.y, '#5eead4', 24, 1000, 6);
      this.presentationShake = Math.max(this.presentationShake, 6);
      soundManager.playObjectiveComplete();
    } else if (event.kind === 'round_started') {
      soundManager.playNewRound();
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
      if (event.itemType === 'hp') {
        this.spawnBurst(event.x, event.y, '#ff3366', 14, 600, 4.5);
        soundManager.playHeal();
      } else {
        this.spawnBurst(event.x, event.y, event.color || '#00ffcc', 5, 420, 3);
        soundManager.playCollect();
      }
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
          const predicted = event.actionId !== undefined && this.predictedFireActions.delete(event.actionId);
          // Only the locally controlled weapon is heard as a direct shot.
          // The authoritative fire event means this covers every firearm and
          // cannot play for a rejected client-side trigger pull.
          if (!predicted) {
            soundManager.playGunfire(event.weaponId);
            if (event.weaponId === 'plasma_gun') this.renderer.triggerMuzzleFlash(event.color || '#67e8f9');
            else this.localFirearm.fire(event.weaponId as CoopFirearmId);
          }
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
        remote = createCoopOperatorRig(player.color, player.label);
        this.remotePlayers.set(player.id, remote);
        this.renderer.scene.add(remote.root);
      }
      updateCoopOperatorRig(remote, player, snapshot.elapsedMs, 16.666);
    }
    for (const [id, remote] of this.remotePlayers) {
      if (active.has(id)) continue;
      disposeCoopOperatorRig(remote);
      this.renderer.scene.remove(remote.root);
      this.remotePlayers.delete(id);
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
