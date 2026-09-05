import { CoopPing, CoopPingKind, MultiplayerInputFrame } from './protocol';
export type { CoopPing, CoopPingKind } from './protocol';
import { GAME_WIDTH } from '../../constants';
import { COOP_FIREARM_BY_ID, COOP_FIREARM_DEFINITIONS, COOP_WEAPON_SLOTS as FIREARM_SLOTS, createCoopWeaponRuntime, firearmDamage, firearmFireInterval, firearmSpread, type AmmoType, type CoopFirearmId, type CoopWeaponRuntime } from '../combat/coopFirearms';
import {
  ENEMY_TYPES,
  ENEMY_ATTACK_PROFILES,
  EXPERIENCE_GEM_COLOR,
  getGuaranteedEnemyDrop,
  getPickupEffect,
  getRunXPRequired,
  HIT_FLASH_MS,
  ITEM_TYPES,
  type ItemType,
  rollCoinDrop,
  rollHolderItem,
  rollCoopHeartDrop,
  ITEM_HOLDER_CHANCE,
} from '../combat/enemyDomain';
import { isWorldPositionClear, resolveWorldCollisions } from '../world/WorldLayout';
import { buildEncounterClusters, EncounterDirector, type EncounterDirectorSnapshot, type EncounterOrder, type EncounterPlayer, type EncounterRoundEvent } from './EncounterDirector';
import { SpawnTopology } from './SpawnTopology';
import { COOP_INSERTION_DURATION_MS, COOP_UPLINK_RADIUS, CoopRunDirector, coopBossHealth, coopObjectiveEliteHealth, type CoopRunSnapshot } from './CoopRunDirector';
import { COOP_BUY_STATION_STOCK, COOP_SHOP_ITEMS, type CoopBuyStationSnapshot, type CoopShopItemId } from './CoopBuyStation';
import { COOP_PASSIVE_BY_ID, passiveCooldownMs, passiveDamage, passiveRadius, passiveRankCost, type CoopPassiveModuleId, type CoopPassiveRuntime, type CoopPassiveSnapshot } from './CoopPassiveModules';
import { awardMedals, createRunStats, type CoopPlayerRunStats, type CoopRunResultsSnapshot } from './CoopResults';
import { advancePlayerMovement, COOP_PLAYER_RADIUS, type PlayerMotionState } from './playerMovement';
import { findEnemyDetour, hasClearAttackPath, moveTacticalEnemy } from './enemyTactics';
import { SpatialHash } from './SpatialHash';
import { CoopGasZone, GAS_DPS, type CoopGasZoneSnapshot } from './CoopGasZone';

/** Multiplayer shares the production city's physical 12 km square. */
export const COOP_WORLD_SIZE = GAME_WIDTH;
/** Co-op deliberately owns five firearms instead of importing survival slots. */
export const COOP_WEAPON_SLOTS = FIREARM_SLOTS;
export type CoopWeaponId = string;
export const COOP_WEAPON_DETAILS: Record<CoopWeaponId, { name: string; shortName: string; color: string; key: string }> = Object.fromEntries(
  [
    ...COOP_FIREARM_DEFINITIONS.map(d => [d.id, { name: d.name, shortName: d.shortName, color: d.visual.muzzleColor, key: String(d.slot + 1) }]),
    ...Object.values(COOP_PASSIVE_BY_ID).map(d => [d.id, { name: d.name, shortName: d.name.toUpperCase(), color: d.color, key: 'P' }]),
  ],
) as Record<CoopWeaponId, { name: string; shortName: string; color: string; key: string }>;

const PLAYER_RADIUS = COOP_PLAYER_RADIUS;
const ENEMY_RADIUS = 16;
/** Slightly inside the renderer's camera limit, for stable network aim. */
const MAX_AIM_PITCH = Math.PI * 0.44;
const ENEMY_HIT_HEIGHT = 42;
// Contract bosses exceed the base enemy-domain radius table.
const MAX_ENEMY_RADIUS = 150;
/** Dead units are already non-interactive; this is only the short visual grace
 * period used by the renderer's collapse animation. */
export const COOP_ENEMY_DEATH_PRESENTATION_MS = 480;
const COMBAT_EVENT_RETENTION_MS = 750;
/** A disconnected or backgrounded client must not keep walking or firing. */
export const COOP_STALE_INPUT_MS = 2_000;
/** Never let a forged timestamp skip a projectile across the whole arena. */
export const COOP_MAX_SHOT_COMPENSATION_MS = 150;
const GEM_MAGNET_RANGE = 200;
const ITEM_MAGNET_RANGE = 150;
const GEM_PICKUP_RADIUS = 10;
const ITEM_PICKUP_RADIUS = 15;
export const COOP_MAX_WORLD_GEMS = 160;
export const COOP_MAX_WORLD_ITEMS = 48;
export const COOP_MAX_AMMO_CACHES = 32;
/** A calm staging window before the normal encounter director starts. */
export const COOP_SAFE_INSERTION_MS = COOP_INSERTION_DURATION_MS;
export const COOP_MAX_ENEMIES = 90;
export const COOP_MAX_ENCOUNTER_ENEMIES = 84;
const WEAPON_MAX_LEVEL = 8;
const SWITCH_MS = 280;
const SNIPER_BOLT_MS = 420;
export const COOP_BLEED_OUT_MS = 20_000;
export const COOP_REVIVE_DURATION_MS = 3_000;
export const COOP_REVIVE_RANGE = 108;
export const COOP_REVIVE_HEALTH_RATIO = .35;
export const COOP_REVIVE_INVULNERABILITY_MS = 2_500;

export type CoopPlayerLifeState = 'alive' | 'downed' | 'eliminated';
export type CoopMatchState = 'active' | 'solo_defeat' | 'squad_wiped';

export interface CoopPlayerSeed { id: string; label: string; color: string; }

export interface CoopPlayerSnapshot extends CoopPlayerSeed {
  x: number;
  y: number;
  angle: number;
  health: number;
  maxHealth: number;
  selectedSlot: number;
  z: number;
  sprinting: boolean;
  sliding: boolean;
  crouching: boolean;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  coins: number;
  pendingDataCores: number;
  weaponStates: CoopWeaponRuntime[];
  /** Compatibility projection; weaponStates are authoritative. */
  weaponLevels: number[];
  selectedWeaponLevel: number;
  selectedWeaponId: CoopWeaponId;
  isAiming: boolean;
  isReloading: boolean;
  isSwitching: boolean;
  weaponActionEndsAtMs?: number;
  lifeState: CoopPlayerLifeState;
  /** Authoritative countdown; only meaningful while downed. */
  downedRemainingMs: number;
  /** Host-validated F-key progress from the current reviver. */
  reviveProgressMs: number;
  reviverId?: string;
  invulnerableRemainingMs: number;
  /** Run-only tactical economy. The host alone changes these fields. */
  selfRevives: number;
  selfReviveProgressMs: number;
  armorTier: number;
  armorHp: number;
  gasMaskHp: number;
  gasMaskMaxHp: number;
  passiveModules: CoopPassiveSnapshot[];
  lastProcessedInput?: number;
  lastProcessedFireAction?: number;
  motion?: Pick<PlayerMotionState, 'verticalVelocity' | 'lastJumpSequence' | 'slideAngle'>;
}

export interface CoopEnemySnapshot {
  id: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  type: keyof typeof ENEMY_TYPES;
  color: string;
  radius: number;
  damage: number;
  speed: number;
  experienceValue: number;
  hitFlashMs: number;
  slowMultiplier: number;
  isHolder: boolean;
  dying: boolean;
  deathRemainingMs: number;
  /** Fixed at spawn for a short lease so nearby movement cannot retarget a horde. */
  targetPlayerId?: string;
  spawnPacketId?: number;
  facingAngle?: number;
  attackWindupUntilMs?: number;
}

export interface CoopHazardSnapshot {
  id: number;
  enemyId: number;
  kind: 'artillery' | 'shockwave' | 'gravity' | 'lunge' | 'ambush';
  x: number;
  y: number;
  radius: number;
  startsAtMs: number;
  resolvesAtMs: number;
  color: string;
}

export interface CoopGemSnapshot {
  id: number;
  x: number;
  y: number;
  value: number;
  color: string;
}

export interface CoopItemSnapshot {
  id: number;
  x: number;
  y: number;
  type: ItemType;
  value: number;
  color: string;
}
export interface CoopAmmoCacheSnapshot { id: number; x: number; y: number; ammoType: AmmoType; amount: number; color: string; }

export type CoopCombatEventKind = 'enemy_hit' | 'enemy_killed' | 'damage_number' | 'drop_spawned' | 'pickup_collected' | 'level_up' | 'weapon_upgraded' | 'weapon_fired' | 'reload_started' | 'reload_shell_loaded' | 'reload_finished' | 'empty_fire' | 'ammo_collected' | 'player_damaged' | 'player_downed' | 'player_revived' | 'player_eliminated' | 'revive_started' | 'squad_wiped' | 'solo_defeat' | 'station_online' | 'station_purchase' | 'objective_started' | 'objective_completed' | 'boss_spawned' | 'boss_defeated' | 'boss_ability' | 'exfil_deployed' | 'passive_triggered' | 'self_revived' | 'round_started' | 'round_completed' | 'gas_warning' | 'gas_spread' | 'mask_broken' | 'mask_damaged' | 'gas_damaged' | 'ping';

/** A replay-safe presentation event. It is also repeated in snapshots briefly
 * so packet loss cannot suppress feedback on a guest. */
export interface CoopCombatEvent {
  id: number;
  tick: number;
  atMs: number;
  kind: CoopCombatEventKind;
  x: number;
  y: number;
  enemyId?: number;
  playerId?: string;
  amount?: number;
  color?: string;
  itemType?: ItemType;
  weaponId?: CoopWeaponId;
  killedByPlayerId?: string;
  ammoType?: AmmoType;
  actionId?: number;
}

export interface CoopProjectileSnapshot {
  id: number;
  x: number;
  y: number;
  angle: number;
  ownerId: string;
  weaponId: CoopWeaponId;
  radius: number;
  /** Authoritative horizontal velocity; used by the 3D presentation for trails. */
  velocity: number;
  /** Remaining authoritative lifetime, used to animate existing weapon VFX. */
  lifeMs: number;
  /** Authoritative elevation of the projectile above the city ground plane. */
  z: number;
  /** Vertical view angle used to orient the existing 3D projectile mesh. */
  pitch: number;
}

export interface CoopSnapshot {
  tick: number;
  elapsedMs: number;
  kills: number;
  players: CoopPlayerSnapshot[];
  enemies: CoopEnemySnapshot[];
  projectiles: CoopProjectileSnapshot[];
  gems: CoopGemSnapshot[];
  items: CoopItemSnapshot[];
  ammoCaches: CoopAmmoCacheSnapshot[];
  combatEvents: CoopCombatEvent[];
  matchState: CoopMatchState;
  run: CoopRunSnapshot;
  buyStations: CoopBuyStationSnapshot[];
  gasZone?: CoopGasZoneSnapshot;
  results?: CoopRunResultsSnapshot;
  /** Present on current authoritative snapshots; optional for backward-compatible replay frames. */
  encounter?: EncounterDirectorSnapshot;
  hazards?: CoopHazardSnapshot[];
  pings?: CoopPing[];
}

type CoopPlayer = CoopPlayerSnapshot & { verticalVelocity: number; lastJumpSequence: number; lastReloadSequence: number; lastFireActionId: number; slideAngle: number; aimPitch: number; previousFiring: boolean; shotSequence: number; lastDamageEventAtMs: number; passiveRuntime: CoopPassiveRuntime[]; lastArmorDamageAtMs: number; lastGasNoticeAtMs: number };
type CoopEnemy = CoopEnemySnapshot & { hitFlashUntilMs: number; deathUntilMs?: number; killedByPlayerId?: string; targetLeaseUntilMs: number; nextAttackAtMs?: number };
type CoopProjectile = CoopProjectileSnapshot & {
  verticalVelocity: number;
  damage: number;
  penetration: number;
  damageIntervalMs: number;
  nextDamageAt: number;
};
type EnemyNavigationState = { x: number; y: number; stuckMs: number; waypoint?: { x: number; y: number }; waypointUntilMs: number; clearAttackPath?: boolean; nextPathCheckAtMs?: number };

/** A small, deterministic, DOM-free authoritative combat simulation. */
export class CoopSimulation {
  private players = new Map<string, CoopPlayer>();
  private inputByPlayer = new Map<string, MultiplayerInputFrame>();
  private latestInputSequence = new Map<string, number>();
  private inputReceivedAtMs = new Map<string, number>();
  private inputAgeMs = new Map<string, number>();
  private enemyNavigation = new Map<number, EnemyNavigationState>();
  private readonly enemySpatialIndex = new SpatialHash<CoopEnemy>(256);
  private readonly nearbyEnemies: CoopEnemy[] = [];
  private readonly activeEnemyIds = new Set<number>();
  private enemies: CoopEnemy[] = [];
  private projectiles: CoopProjectile[] = [];
  private gems: CoopGemSnapshot[] = [];
  private items: CoopItemSnapshot[] = [];
  private ammoCaches: CoopAmmoCacheSnapshot[] = [];
  private combatEvents: CoopCombatEvent[] = [];
  private hazards: Array<CoopHazardSnapshot & { damage: number; resolved: boolean }> = [];
  private pings: CoopPing[] = [];
  private nextPingId = 1;
  private matchState: CoopMatchState = 'active';
  private nextEntityId = 1;
  private nextCombatEventId = 1;
  private randomState: number;
  private readonly encounterDirector: EncounterDirector;
  private readonly runDirector: CoopRunDirector;
  private readonly spawnTopology = new SpawnTopology();
  private readonly stations: CoopBuyStationSnapshot[] = [];
  private readonly gasZone: CoopGasZone;
  private readonly runStats = new Map<string, CoopPlayerRunStats>();
  private nextScenarioAtMs = 0;
  private bossEnemyId?: number;
  private nextBossAbilityAtMs = 0;
  private lastBossPhase = 0;
  private results?: CoopRunResultsSnapshot;
  private elapsedMs = 0;
  private simulationTick = 0;
  private kills = 0;
  private killsSinceLastHeartDrop = 0;

  constructor(players: CoopPlayerSeed[], seed: number = 0xdecafbad) {
    this.randomState = seed >>> 0;
    // Do not manufacture an opening ring around the squad. The normal
    // topology-aware director begins after a brief safe insertion instead.
    this.encounterDirector = new EncounterDirector(seed, COOP_SAFE_INSERTION_MS);
    this.runDirector = new CoopRunDirector(seed);
    this.gasZone = new CoopGasZone(this.squadCentre(), seed);
    players.forEach(player => this.addPlayer(player));
    // A station must exist from the first playable second. It gives friends a
    // clear rally point, lets us validate its world beacon immediately, and
    // avoids hiding the economy behind an entire contract's worth of play.
    this.spawnStation(this.squadCentre());
  }

  addPlayer(player: CoopPlayerSeed): boolean {
    if (this.matchState !== 'active' || this.players.has(player.id) || this.players.size >= 4) return false;
    const index = this.players.size;
    const angle = index * Math.PI / 2;
    const weaponStates = COOP_WEAPON_SLOTS.map(createCoopWeaponRuntime);
    this.players.set(player.id, {
      ...player, x: COOP_WORLD_SIZE / 2 + Math.cos(angle) * 100, y: COOP_WORLD_SIZE / 2 + Math.sin(angle) * 100,
      angle: 0, health: 100, maxHealth: 100, selectedSlot: 0, z: 0, sprinting: false, sliding: false, crouching: false,
      level: 1, experience: 0, experienceToNextLevel: getRunXPRequired(1), coins: 0, pendingDataCores: 0,
      weaponStates, weaponLevels: weaponStates.map(state => state.level), selectedWeaponLevel: 1, selectedWeaponId: 'plasma_gun', isAiming: false, isReloading: false, isSwitching: false,
      lifeState: 'alive', downedRemainingMs: 0, reviveProgressMs: 0, invulnerableRemainingMs: 0,
      selfRevives: 0, selfReviveProgressMs: 0, armorTier: 0, armorHp: 0, gasMaskHp: 0, gasMaskMaxHp: 150, passiveModules: [],
      verticalVelocity: 0, lastJumpSequence: -1, lastReloadSequence: -1, lastFireActionId: 0, slideAngle: 0, aimPitch: 0, previousFiring: false, shotSequence: 0, lastDamageEventAtMs: -Infinity, passiveRuntime: [], lastArmorDamageAtMs: -Infinity, lastGasNoticeAtMs: -Infinity,
    });
    this.runStats.set(player.id, createRunStats(player.id));
    return true;
  }

  getPlayerSeeds(): CoopPlayerSeed[] { return [...this.players.values()].map(({ id, label, color }) => ({ id, label, color })); }

  /** Remove a disconnected guest without ending the host's surviving run. */
  removePlayer(playerId: string): boolean {
    if (!this.players.has(playerId)) return false;
    this.players.delete(playerId);
    this.inputByPlayer.delete(playerId);
    this.latestInputSequence.delete(playerId);
    this.inputReceivedAtMs.delete(playerId);
    this.inputAgeMs.delete(playerId);
    return true;
  }

  setInput(playerId: string, frame: MultiplayerInputFrame, estimatedAgeMs = 0) {
    const previousSequence = this.latestInputSequence.get(playerId);
    if (!this.players.has(playerId) || (previousSequence !== undefined && frame.sequence < previousSequence)) return;
    this.latestInputSequence.set(playerId, frame.sequence);
    this.inputByPlayer.set(playerId, frame);
    this.inputReceivedAtMs.set(playerId, this.elapsedMs);
    this.inputAgeMs.set(playerId, clamp(estimatedAgeMs, 0, COOP_MAX_SHOT_COMPENSATION_MS));
  }

  tick(deltaMs: number) {
    const dt = Math.max(0, Math.min(50, deltaMs));
    const seconds = dt / 1000;
    this.elapsedMs += dt;
    this.simulationTick++;
    this.pings = this.pings.filter(ping => ping.expiresAtMs > this.elapsedMs);

    if (this.matchState !== 'active' || this.results) {
      this.combatEvents = this.combatEvents.filter(event => this.elapsedMs - event.atMs <= COMBAT_EVENT_RETENTION_MS);
      return;
    }

    // Remote-shot compensation runs during input processing, so seed the
    // broad phase before any player can fire this tick.
    this.enemySpatialIndex.rebuild(this.enemies);
    for (const player of this.players.values()) {
      const receivedAt = this.inputReceivedAtMs.get(player.id);
      const storedInput = this.inputByPlayer.get(player.id);
      const stale = storedInput && (receivedAt === undefined || this.elapsedMs - receivedAt > COOP_STALE_INPUT_MS);
      const input = stale ? { ...storedInput, movement: 0, firing: false, aiming: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, reloadPressed: false, dashPressed: false } : storedInput;
      player.invulnerableRemainingMs = Math.max(0, player.invulnerableRemainingMs - dt);
      if (player.lifeState === 'downed') {
        if (player.selfRevives > 0 && input?.reviving) {
          player.selfReviveProgressMs = Math.min(6_000, player.selfReviveProgressMs + dt);
          if (player.selfReviveProgressMs >= 6_000) this.selfRevive(player);
        } else player.selfReviveProgressMs = 0;
        if (player.lifeState !== 'downed') continue;
        player.downedRemainingMs = Math.max(0, player.downedRemainingMs - dt);
        // A co-op death stays recoverable for as long as any squadmate is
        // standing. Zero ends the urgent revive window, not the body.
        if (player.downedRemainingMs <= 0 && !this.hasLivingTeammate(player.id)) this.eliminatePlayer(player, 'bled out');
        continue;
      }
      if (player.lifeState === 'eliminated') continue;
      if (player.armorTier > 0 && this.elapsedMs - player.lastArmorDamageAtMs >= 3_000) {
        player.armorHp = Math.min(maxArmorHp(player.armorTier), player.armorHp + dt * .024);
      }
      if (player.lifeState === 'alive' && this.gasZone.isInsideGas(player.x, player.y, PLAYER_RADIUS)) {
        const gasDamage = (GAS_DPS * dt) / 1000;
        if (player.gasMaskHp > 0) {
          const prevMask = player.gasMaskHp;
          player.gasMaskHp = Math.max(0, player.gasMaskHp - gasDamage);
          if (player.gasMaskHp <= 0 && prevMask > 0) {
            this.emitCombatEvent({ kind: 'mask_broken', x: player.x, y: player.y, playerId: player.id, color: '#fb7185' });
          } else if (Math.random() < 0.03) {
            this.emitCombatEvent({ kind: 'mask_damaged', x: player.x, y: player.y, playerId: player.id, color: '#22d3ee' });
          }
        } else {
          this.applyGasDamage(player, gasDamage);
        }
      }
      if (input) {
        player.lastProcessedInput = input.sequence;
        advancePlayerMovement(player, input, dt);
        player.aimPitch = dequantizePitch(input.aimPitch);
        const requestedSlot = clamp(Math.trunc(input.selectedSlot), 0, COOP_WEAPON_SLOTS.length - 1);
        if (requestedSlot !== player.selectedSlot && !player.isSwitching) this.switchWeapon(player, requestedSlot);
        player.selectedWeaponId = COOP_WEAPON_SLOTS[player.selectedSlot];
        player.selectedWeaponLevel = this.weapon(player).level;
        player.isAiming = Boolean(input.aiming) && player.selectedWeaponId !== 'combat_shotgun' && !player.isReloading;
        if (input.reloadPressed && input.sequence !== player.lastReloadSequence) { player.lastReloadSequence = input.sequence; this.startReload(player); }
        this.advanceWeaponActions(player);
        const fireActionId = input.fireActionId || 0;
        const triggerPressed = fireActionId > player.lastFireActionId || (input.fireActionId === undefined && input.firing && !player.previousFiring);
        if (fireActionId > player.lastFireActionId) player.lastFireActionId = fireActionId;
        player.lastProcessedFireAction = player.lastFireActionId;
        if (input.firing && (COOP_FIREARM_BY_ID[this.weapon(player).weaponId].fireMode === 'auto' || triggerPressed)) this.tryCastWeapon(player, triggerPressed, fireActionId);
        player.previousFiring = input.firing;
      }
      if (!input) advancePlayerMovement(player, undefined, dt);
    }

    this.updateRun(dt);
    const gasEvent = this.gasZone.tick(dt, this.elapsedMs);
    if (gasEvent.warningTriggered) {
      this.emitCombatEvent({ kind: 'gas_warning', x: this.gasZone.x, y: this.gasZone.y, color: '#f59e0b', amount: 30 });
    }
    if (gasEvent.spreadTriggered) {
      this.emitCombatEvent({ kind: 'gas_spread', x: this.gasZone.x, y: this.gasZone.y, color: '#4ade80', amount: this.gasZone.radius });
    }
    if (this.results) return;
    this.updatePassiveModules();
    this.scheduleEncounters();
    // Scheduling may add a packet. One linear rebuild replaces the former
    // all-enemies separation scan performed by every moving enemy.
    this.enemySpatialIndex.rebuild(this.enemies);

    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const target = this.resolveEnemyTarget(enemy);
      if (!target) continue;
      const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
      enemy.facingAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      const windingUp = (enemy.attackWindupUntilMs || 0) > this.elapsedMs;
      const navigation = this.enemyNavigation.get(enemy.id) || { x: enemy.x, y: enemy.y, stuckMs: 0, waypointUntilMs: 0 };
      // A clear-path result has no tactical effect outside the ability's
      // maximum range, so never ray-march across kilometres of city.
      const needsAttackPath = (enemy.type === 'ranged' && distance <= ENEMY_ATTACK_PROFILES.ranged!.maxRange)
        || (enemy.type === 'phantom' && distance <= ENEMY_ATTACK_PROFILES.phantom!.maxRange)
        || (enemy.type === 'elite' && distance <= ENEMY_ATTACK_PROFILES.elite!.maxRange);
      if (needsAttackPath && this.elapsedMs >= (navigation.nextPathCheckAtMs || 0)) {
        navigation.clearAttackPath = hasClearAttackPath(enemy, target);
        // Stagger checks so a horde does not submit every world probe in one tick.
        navigation.nextPathCheckAtMs = this.elapsedMs + 180 + enemy.id % 5 * 17;
      }
      const clearAttackPath = !needsAttackPath || Boolean(navigation.clearAttackPath);
      const waypointReached = navigation.waypoint && Math.hypot(enemy.x - navigation.waypoint.x, enemy.y - navigation.waypoint.y) <= enemy.radius + 28;
      if (waypointReached || this.elapsedMs >= navigation.waypointUntilMs) navigation.waypoint = undefined;
      const travelTarget = navigation.waypoint || target;
      if (!windingUp && distance > PLAYER_RADIUS + enemy.radius) {
        const neighbors = this.enemySpatialIndex.query(enemy.x, enemy.y, enemy.radius + MAX_ENEMY_RADIUS + 48, this.nearbyEnemies);
        enemy.facingAngle = moveTacticalEnemy(enemy, travelTarget, neighbors, this.elapsedMs, dt, clearAttackPath);
      }
      const progress = Math.hypot(enemy.x - navigation.x, enemy.y - navigation.y);
      navigation.stuckMs = !windingUp && distance > 240 && progress < .2 ? navigation.stuckMs + dt : 0;
      navigation.x = enemy.x; navigation.y = enemy.y;
      if (navigation.stuckMs >= 700) {
        navigation.waypoint = findEnemyDetour(enemy, target);
        navigation.waypointUntilMs = this.elapsedMs + 2_200;
        navigation.stuckMs = 0;
      }
      this.enemyNavigation.set(enemy.id, navigation);
      if (enemy.type === 'ranged' && distance >= ENEMY_ATTACK_PROFILES.ranged!.minRange && distance <= ENEMY_ATTACK_PROFILES.ranged!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0) && clearAttackPath) {
        const attack = ENEMY_ATTACK_PROFILES.ranged!;
        this.queueHazard(enemy, attack.kind, target.x, target.y, attack.radius, enemy.damage * attack.damageMultiplier, attack.windupMs, '#4ade80');
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs + enemy.id % 5 * 150;
      } else if (enemy.type === 'tank' && distance >= ENEMY_ATTACK_PROFILES.tank!.minRange && distance <= ENEMY_ATTACK_PROFILES.tank!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0)) {
        const attack = ENEMY_ATTACK_PROFILES.tank!;
        this.queueHazard(enemy, attack.kind, enemy.x, enemy.y, attack.radius, enemy.damage * attack.damageMultiplier, attack.windupMs, '#fbbf24');
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs;
      } else if (enemy.type === 'phantom' && distance >= ENEMY_ATTACK_PROFILES.phantom!.minRange && distance <= ENEMY_ATTACK_PROFILES.phantom!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0) && clearAttackPath) {
        const attack = ENEMY_ATTACK_PROFILES.phantom!;
        this.queueHazard(enemy, attack.kind, target.x, target.y, attack.radius, Math.max(16, enemy.damage * attack.damageMultiplier), attack.windupMs, '#e2e8f0');
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs;
      } else if (enemy.type === 'elite' && distance >= ENEMY_ATTACK_PROFILES.elite!.minRange && distance <= ENEMY_ATTACK_PROFILES.elite!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0) && clearAttackPath) {
        const attack = ENEMY_ATTACK_PROFILES.elite!;
        this.queueHazard(enemy, attack.kind, target.x, target.y, attack.radius, Math.max(24, enemy.damage * attack.damageMultiplier), attack.windupMs, '#f472d0');
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs;
      } else if (!windingUp && enemy.type !== 'ranged' && enemy.type !== 'tank' && distance <= PLAYER_RADIUS + enemy.radius) {
        this.damagePlayer(target, enemy.damage * seconds, enemy.x, enemy.y);
      }
      if (enemy.id === this.bossEnemyId) this.runDirector.updateBoss(enemy.health, enemy.x, enemy.y);
      this.runDirector.trackEliteTarget(enemy.id, enemy.x, enemy.y);
    }
    this.activeEnemyIds.clear();
    for (const enemy of this.enemies) if (!enemy.dying) this.activeEnemyIds.add(enemy.id);
    this.updateHazards();
    // Movement changes bucket membership; projectile collision uses the new
    // authoritative positions rather than the broad phase from tick start.
    this.enemySpatialIndex.rebuild(this.enemies);

    for (const projectile of this.projectiles) {
      const owner = this.players.get(projectile.ownerId);
      if (projectile.weaponId === 'orbit_drones' || projectile.weaponId === 'data_scythe') {
        if (owner) {
          projectile.angle += (projectile.weaponId === 'orbit_drones' ? 4.4 : -6.8) * seconds;
          const orbitRadius = projectile.weaponId === 'orbit_drones' ? 78 : 62;
          projectile.x = owner.x + Math.cos(projectile.angle) * orbitRadius;
          projectile.y = owner.y + Math.sin(projectile.angle) * orbitRadius;
        }
      } else {
        if (projectile.weaponId === 'nano_swarm') {
          const target = this.closestEnemy(projectile.x, projectile.y);
          if (target) projectile.angle = turnTowards(projectile.angle, Math.atan2(target.y - projectile.y, target.x - projectile.x), 4.8 * seconds);
        }
        const horizontalVelocity = projectile.velocity * Math.cos(projectile.pitch);
        projectile.x += Math.cos(projectile.angle) * horizontalVelocity * seconds;
        projectile.y += Math.sin(projectile.angle) * horizontalVelocity * seconds;
        projectile.z += projectile.verticalVelocity * seconds;
        if (projectile.weaponId === 'mirror_shards') {
          if (projectile.x < 30 || projectile.x > COOP_WORLD_SIZE - 30) projectile.angle = Math.PI - projectile.angle;
          if (projectile.y < 30 || projectile.y > COOP_WORLD_SIZE - 30) projectile.angle = -projectile.angle;
          projectile.x = clamp(projectile.x, 30, COOP_WORLD_SIZE - 30);
          projectile.y = clamp(projectile.y, 30, COOP_WORLD_SIZE - 30);
        }
      }
      projectile.lifeMs -= dt;
      if (this.elapsedMs < projectile.nextDamageAt) continue;
      projectile.nextDamageAt = this.elapsedMs + projectile.damageIntervalMs;
      // Projectiles only hit an enemy when their 3D height crosses its body.
      // Aiming into the sky therefore flies over the horde; aiming at their
      // torso retains the usual generous FPS hit volume.
      const candidates = this.enemySpatialIndex.query(projectile.x, projectile.y, projectile.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies);
      for (const enemy of candidates) {
        if (enemy.dying) continue;
        const dx = enemy.x - projectile.x, dy = enemy.y - projectile.y;
        const hitRadius = enemy.radius + projectile.radius;
        const horizontalHit = dx * dx + dy * dy < hitRadius * hitRadius;
        const verticalHit = projectile.z >= -projectile.radius && projectile.z <= ENEMY_HIT_HEIGHT + enemy.radius + projectile.radius;
        if (!horizontalHit || !verticalHit) continue;
        this.applyDamage(enemy, projectile.damage, projectile.ownerId, projectile.weaponId);
        if (projectile.weaponId === 'sonic_boom') {
          enemy.x = clamp(enemy.x + Math.cos(projectile.angle) * 48, enemy.radius, COOP_WORLD_SIZE - enemy.radius);
          enemy.y = clamp(enemy.y + Math.sin(projectile.angle) * 48, enemy.radius, COOP_WORLD_SIZE - enemy.radius);
        }
        if (projectile.weaponId === 'gravity_well') {
          enemy.x += (projectile.x - enemy.x) * 0.16;
          enemy.y += (projectile.y - enemy.y) * 0.16;
        }
        if (projectile.weaponId === 'frost_aura') enemy.slowMultiplier = 0.5;
        if (projectile.penetration !== 999) projectile.penetration--;
        if (projectile.penetration <= 0) break;
      }
      if (projectile.penetration <= 0) projectile.lifeMs = 0;
    }
    this.updateRevives(dt);
    this.finalizeDefeatIfNeeded();
    this.updateDrops(seconds);
    this.enemies = this.enemies.filter(enemy => !enemy.dying || (enemy.deathUntilMs || 0) > this.elapsedMs);
    this.activeEnemyIds.clear();
    for (const enemy of this.enemies) this.activeEnemyIds.add(enemy.id);
    for (const id of this.enemyNavigation.keys()) if (!this.activeEnemyIds.has(id)) this.enemyNavigation.delete(id);
    this.combatEvents = this.combatEvents.filter(event => this.elapsedMs - event.atMs <= COMBAT_EVENT_RETENTION_MS);
    this.projectiles = this.projectiles.filter(projectile => projectile.lifeMs > 0
      && projectile.z > -projectile.radius && projectile.z < 1800
      && projectile.x > -100 && projectile.y > -100 && projectile.x < COOP_WORLD_SIZE + 100 && projectile.y < COOP_WORLD_SIZE + 100);
  }

  createSnapshot(): CoopSnapshot {
    return {
      tick: this.simulationTick, elapsedMs: Math.round(this.elapsedMs), kills: this.kills,
      players: [...this.players.values()].map(({ verticalVelocity, lastJumpSequence, lastReloadSequence: _lastReloadSequence, lastFireActionId: _lastFireActionId, slideAngle, aimPitch: _aimPitch, previousFiring: _previousFiring, shotSequence: _shotSequence, lastDamageEventAtMs: _lastDamageEventAtMs, passiveRuntime: _passiveRuntime, lastArmorDamageAtMs: _lastArmorDamageAtMs, ...player }) => ({ ...player, motion: { verticalVelocity, lastJumpSequence, slideAngle }, passiveModules: player.passiveModules.map(module => ({ ...module })), weaponStates: player.weaponStates.map(state => ({ ...state })), weaponLevels: player.weaponStates.map(state => state.level) })),
      enemies: this.enemies.map(({ hitFlashUntilMs, deathUntilMs, killedByPlayerId: _killedBy, targetLeaseUntilMs: _lease, nextAttackAtMs: _nextAttack, ...enemy }) => ({
        ...enemy,
        hitFlashMs: Math.max(0, hitFlashUntilMs - this.elapsedMs),
        deathRemainingMs: enemy.dying ? Math.max(0, (deathUntilMs || this.elapsedMs) - this.elapsedMs) : 0,
      })),
      projectiles: this.projectiles.map(({ damage: _damage, penetration: _penetration, damageIntervalMs: _interval, nextDamageAt: _next, ...projectile }) => ({ ...projectile })),
      gems: this.gems.map(gem => ({ ...gem })),
      items: this.items.map(item => ({ ...item })),
      ammoCaches: this.ammoCaches.map(cache => ({ ...cache })),
      combatEvents: this.combatEvents.map(event => ({ ...event })),
      matchState: this.matchState,
      run: this.runDirector.snapshot(Math.round(this.elapsedMs)),
      buyStations: this.stations.map(station => ({ ...station, stock: [...station.stock] })),
      gasZone: this.gasZone.snapshot(Math.round(this.elapsedMs)),
      results: this.results && { ...this.results, players: this.results.players.map(player => ({ ...player, passiveDamageById: { ...player.passiveDamageById } })) },
      encounter: this.encounterDirector.snapshot(buildEncounterClusters(this.encounterPlayers(), this.encounterEnemies()).length),
      hazards: this.hazards.map(({ damage: _damage, resolved: _resolved, ...hazard }) => ({ ...hazard })),
      pings: this.pings.map(ping => ({
        ...ping,
        remainingMs: Math.max(0, ping.expiresAtMs - Math.round(this.elapsedMs)),
      })),
    };
  }

  addPing(playerId: string, x: number, y: number, z: number = 0, kind: CoopPingKind = 'location', label: string = 'Waypoint'): CoopPing | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;
    // Making a ping removes any previous ping from this player
    this.pings = this.pings.filter(p => p.playerId !== playerId);
    if (this.pings.length >= 10) this.pings.shift();
    const ping: CoopPing = {
      id: this.nextPingId++,
      playerId,
      playerLabel: player.label,
      playerColor: player.color,
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
      kind,
      label,
      createdAtMs: Math.round(this.elapsedMs),
      expiresAtMs: Math.round(this.elapsedMs) + 6500,
    };
    this.pings.push(ping);
    this.emitCombatEvent({
      kind: 'ping',
      x: ping.x,
      y: ping.y,
      playerId,
      color: kind === 'enemy' || kind === 'boss' ? '#ef4444' : kind === 'revive' ? '#fbbf24' : player.color,
    });
    return ping;
  }

  /** Reliable purchase entry point. The WebRTC/UI layer supplies only intent;
   * every range, price, slot, and ownership check happens here on the host. */
  purchase(playerId: string, stationId: number, itemId: CoopShopItemId): string | undefined {
    const player = this.players.get(playerId);
    const station = this.stations.find(candidate => candidate.id === stationId && candidate.active);
    if (!player || player.lifeState !== 'alive') return 'You must be alive to use the Buy Station.';
    if (!station || Math.hypot(player.x - station.x, player.y - station.y) > station.radius + 48) return 'Move closer to an active Buy Station.';
    if (!station.stock.includes(itemId)) return 'That item is not stocked at this terminal.';
    let cost = COOP_SHOP_ITEMS[itemId].cost;
    if (isPassiveModule(itemId)) {
      const owned = player.passiveRuntime.find(module => module.id === itemId);
      if (owned) {
        if (owned.rank >= COOP_PASSIVE_BY_ID[itemId].maxRank) return 'That passive module is already at maximum rank.';
        cost = passiveRankCost(itemId, owned.rank);
      } else if (player.passiveRuntime.length >= 2) return 'Your two passive-module slots are full.';
    }
    if (player.coins < cost) return `Need ${cost - player.coins} more credits.`;

    if (itemId === 'selected_ammo') {
      const weapon = this.weapon(player), definition = COOP_FIREARM_BY_ID[weapon.weaponId];
      if (weapon.reserveAmmo >= definition.maxReserve) return 'Selected firearm already has full reserve ammo.';
      weapon.reserveAmmo = Math.min(definition.maxReserve, weapon.reserveAmmo + Math.ceil(definition.maxReserve * .50));
    } else if (itemId === 'full_ammo') {
      const missing = player.weaponStates.some(weapon => weapon.reserveAmmo < COOP_FIREARM_BY_ID[weapon.weaponId].maxReserve);
      if (!missing) return 'Your full loadout is already stocked.';
      for (const weapon of player.weaponStates) weapon.reserveAmmo = COOP_FIREARM_BY_ID[weapon.weaponId].maxReserve;
    } else if (itemId === 'trauma_patch') {
      if (player.health >= player.maxHealth) return 'Health is already full.';
      player.health = Math.min(player.maxHealth, player.health + player.maxHealth * .35);
    } else if (itemId === 'emergency_reboot') {
      if (player.selfRevives > 0) return 'Emergency Reboot already equipped.';
      player.selfRevives = 1;
    } else if (itemId === 'armor_1') {
      if (player.armorTier >= 1) return 'Armor Plating I already installed.';
      player.armorTier = 1; player.armorHp = maxArmorHp(1);
    } else if (itemId === 'armor_2') {
      if (player.armorTier < 1) return 'Armor Plating I is required first.';
      if (player.armorTier >= 2) return 'Armor Plating II already installed.';
      player.armorTier = 2; player.armorHp = maxArmorHp(2);
    } else if (itemId === 'gas_mask') {
      if (player.gasMaskHp >= player.gasMaskMaxHp && player.gasMaskHp > 0) return 'Gas Mask already at maximum filter capacity.';
      player.gasMaskHp = 150; player.gasMaskMaxHp = 150;
    } else if (isPassiveModule(itemId)) {
      const owned = player.passiveRuntime.find(module => module.id === itemId);
      if (owned) {
        owned.rank++;
        player.passiveModules = player.passiveRuntime.map(module => ({ id: module.id, rank: module.rank }));
      } else {
        player.passiveRuntime.push({ id: itemId, rank: 1, nextTriggerAtMs: this.elapsedMs });
        player.passiveModules = player.passiveRuntime.map(module => ({ id: module.id, rank: module.rank }));
      }
    }
    player.coins -= cost;
    const stats = this.runStats.get(player.id); if (stats) stats.creditsSpent += cost;
    this.emitCombatEvent({ kind: 'station_purchase', x: station.x, y: station.y, playerId: player.id, amount: cost, color: '#67e8f9', weaponId: itemId });
    return undefined;
  }

  private updateRun(deltaMs: number) {
    const centre = this.squadCentre();
    if (this.runDirector.advanceInsertion(this.elapsedMs, centre)) this.activateObjectiveIfNeeded();
    const objective = this.runDirector.currentObjective;
    if (objective?.kind === 'uplink') {
      const members = [...this.players.values()].filter(player => player.lifeState === 'alive' && Math.hypot(player.x - objective.x, player.y - objective.y) <= COOP_UPLINK_RADIUS).length;
      const contested = this.enemies.some(enemy => !enemy.dying && Math.hypot(enemy.x - objective.x, enemy.y - objective.y) <= COOP_UPLINK_RADIUS + enemy.radius);
      if (this.runDirector.updateUplink(deltaMs, members, contested)) this.onObjectiveCompleted(centre);
    }
    if (objective?.kind === 'elite_hunt' && objective.targetEnemyId === undefined) this.activateObjectiveIfNeeded();

    const boss = this.runDirector.currentBoss;
    if (boss && boss.health <= 0 && this.bossEnemyId === undefined && (this.nextScenarioAtMs === 0 || this.elapsedMs >= this.nextScenarioAtMs)) {
      this.nextScenarioAtMs = 0;
      this.spawnRunBoss();
    }
    if (this.runDirector.currentPhase === 'mini_boss' && !this.runDirector.currentBoss && this.nextScenarioAtMs > 0 && this.elapsedMs >= this.nextScenarioAtMs) {
      this.nextScenarioAtMs = 0;
      if (this.runDirector.snapshot(this.elapsedMs).contractIndex < 2) {
        this.runDirector.startContract(centre); this.activateObjectiveIfNeeded();
      } else if (this.runDirector.startFinalBoss(centre)) this.spawnRunBoss();
    }

    if (this.runDirector.currentPhase === 'exfil') {
      const exfil = this.runDirector.currentExfil!;
      const living = [...this.players.values()].filter(player => player.lifeState === 'alive');
      const inside = living.filter(player => Math.hypot(player.x - exfil.x, player.y - exfil.y) <= exfil.radius).length;
      const outcome = this.runDirector.updateExfil(deltaMs, inside, living.length);
      if (outcome === 'success') this.finishRun(true);
      if (outcome === 'failed') this.finishRun(false);
    }
    this.updateBossMechanics();
  }

  private activateObjectiveIfNeeded() {
    const objective = this.runDirector.currentObjective;
    if (!objective || objective.kind !== 'elite_hunt' || objective.targetEnemyId !== undefined) return;
    const definition = ENEMY_TYPES.elite;
    const id = this.nextEntityId++;
    const health = coopObjectiveEliteHealth(definition.health, this.players.size);
    this.enemies.push({ id, x: objective.x, y: objective.y, health, maxHealth: health, type: 'elite', color: definition.color, radius: definition.radius, damage: definition.damage * this.partyScale(.24), speed: definition.speed, experienceValue: definition.xp * 4, hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1, isHolder: true, dying: false, deathRemainingMs: 0, targetLeaseUntilMs: this.elapsedMs + 2_500, nextAttackAtMs: this.elapsedMs + enemyOpeningDelay('elite') });
    this.runDirector.setEliteTarget(id);
    this.emitCombatEvent({ kind: 'objective_started', x: objective.x, y: objective.y, enemyId: id, color: definition.color });
  }

  private onObjectiveCompleted(centre: { x: number; y: number }) {
    this.awardCredits(190);
    this.spawnStation(centre);
    // Give the squad a brief, live-shopping preparation window before the
    // contract's mini-boss materialises. The simulation keeps running.
    this.nextScenarioAtMs = this.elapsedMs + 10_000;
    this.emitCombatEvent({ kind: 'objective_completed', x: centre.x, y: centre.y, color: '#5eead4' });
  }

  private spawnRunBoss() {
    const boss = this.runDirector.currentBoss;
    if (!boss) return;
    const definition = ENEMY_TYPES.titan;
    const isFinal = boss.kind === 'singularity';
    const health = coopBossHealth(boss.kind, this.players.size);
    const id = this.nextEntityId++;
    this.enemies.push({ id, x: boss.x, y: boss.y, health, maxHealth: health, type: 'titan', color: isFinal ? '#f8fafc' : boss.kind === 'void_architect' ? '#e879f9' : '#fb7185', radius: isFinal ? 150 : 88, damage: (isFinal ? 68 : 42) * this.partyScale(.18), speed: isFinal ? .72 : .82, experienceValue: isFinal ? 3_000 : 700, hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0, targetLeaseUntilMs: this.elapsedMs + 2_500 });
    this.bossEnemyId = id;
    this.nextBossAbilityAtMs = this.elapsedMs + 5_500;
    this.lastBossPhase = 1;
    this.runDirector.activateBoss(health, boss.x, boss.y);
    this.emitCombatEvent({ kind: 'boss_spawned', x: boss.x, y: boss.y, enemyId: id, color: isFinal ? '#f8fafc' : '#fb7185' });
  }

  private spawnStation(centre: { x: number; y: number }) {
    const angle = this.random() * Math.PI * 2;
    // The opening terminal is a visible rally point, not a lamp placed in the
    // player's face. Put it a short, safe run from spawn; later stations stay
    // nearer to the squad after a contract reward.
    const distance = this.stations.length === 0 ? 1_150 : 360;
    const desired = { x: centre.x + Math.cos(angle) * distance, y: centre.y + Math.sin(angle) * distance };
    const position = this.safeFallbackPosition(desired.x, desired.y, 70);
    this.stations.push({ id: this.nextEntityId++, x: position.x, y: position.y, radius: 105, active: true, stock: [...COOP_BUY_STATION_STOCK] });
    this.emitCombatEvent({ kind: 'station_online', x: position.x, y: position.y, color: '#67e8f9' });
  }

  /** Readable boss mechanics intentionally use the same host damage and
   * collision routes as normal combat. They never rely on a client seeing a
   * telegraph in time to decide an outcome. */
  private updateBossMechanics() {
    const bossState = this.runDirector.currentBoss;
    const boss = this.bossEnemyId === undefined ? undefined : this.enemies.find(enemy => enemy.id === this.bossEnemyId && !enemy.dying);
    if (!bossState || !boss) return;
    if (bossState.phase !== this.lastBossPhase) {
      this.lastBossPhase = bossState.phase;
      this.emitCombatEvent({ kind: 'boss_ability', x: boss.x, y: boss.y, enemyId: boss.id, amount: bossState.phase, color: boss.color });
      // The final boss calls in guards as it becomes unstable, forcing the
      // squad to choose between clearing space and finishing the target.
      if (bossState.kind === 'singularity' && bossState.phase === 2) this.spawnBossGuards(boss, 3);
      if (bossState.kind === 'singularity' && bossState.phase === 3) this.spawnBossGuards(boss, 5);
    }
    if (this.elapsedMs < this.nextBossAbilityAtMs) return;
    if (bossState.kind === 'neural_overlord') {
      this.queueHazard(boss, 'shockwave', boss.x, boss.y, 310, 22, 1400, '#fb7185');
      this.nextBossAbilityAtMs = this.elapsedMs + 8_500;
      this.emitCombatEvent({ kind: 'boss_ability', x: boss.x, y: boss.y, enemyId: boss.id, color: '#fb7185' });
    } else if (bossState.kind === 'void_architect') {
      this.queueHazard(boss, 'gravity', boss.x, boss.y, 520, 0, 1600, '#e879f9');
      this.nextBossAbilityAtMs = this.elapsedMs + 9_500;
      this.emitCombatEvent({ kind: 'boss_ability', x: boss.x, y: boss.y, enemyId: boss.id, color: '#e879f9' });
    } else {
      const radius = bossState.phase === 3 ? 500 : 370;
      const damage = bossState.phase === 3 ? 30 : 20;
      this.queueHazard(boss, 'shockwave', boss.x, boss.y, radius, damage, 1400, '#f8fafc');
      this.nextBossAbilityAtMs = this.elapsedMs + (bossState.phase === 3 ? 5_500 : 8_000);
      this.emitCombatEvent({ kind: 'boss_ability', x: boss.x, y: boss.y, enemyId: boss.id, amount: bossState.phase, color: '#f8fafc' });
    }
  }

  private queueHazard(enemy: CoopEnemy, kind: CoopHazardSnapshot['kind'], x: number, y: number, radius: number, damage: number, windupMs: number, color: string) {
    enemy.attackWindupUntilMs = this.elapsedMs + windupMs;
    this.hazards.push({ id: this.nextEntityId++, enemyId: enemy.id, kind, x, y, radius, damage, startsAtMs: this.elapsedMs, resolvesAtMs: this.elapsedMs + windupMs, color, resolved: false });
  }

  private updateHazards() {
    this.hazards = this.hazards.filter(hazard => this.elapsedMs <= hazard.resolvesAtMs + 350 && this.activeEnemyIds.has(hazard.enemyId));
    for (const hazard of this.hazards) {
      if (hazard.resolved || this.elapsedMs < hazard.resolvesAtMs) continue;
      hazard.resolved = true;
      for (const player of this.players.values()) {
        if (player.lifeState !== 'alive' || Math.hypot(player.x - hazard.x, player.y - hazard.y) > hazard.radius + PLAYER_RADIUS) continue;
        if (hazard.kind === 'shockwave' && player.z > 45) continue;
        if (!hasClearAttackPath(hazard, player)) continue;
        if (hazard.kind === 'gravity') {
          const distance = Math.hypot(hazard.x - player.x, hazard.y - player.y) || 1;
          const position = { x: player.x + (hazard.x - player.x) / distance * 68, y: player.y + (hazard.y - player.y) / distance * 68 };
          resolveWorldCollisions(position, PLAYER_RADIUS); player.x = position.x; player.y = position.y;
        } else this.damagePlayer(player, hazard.damage, hazard.x, hazard.y);
      }
      if (hazard.kind === 'ambush') {
        const source = this.enemies.find(enemy => enemy.id === hazard.enemyId && !enemy.dying);
        if (source && isWorldPositionClear(hazard.x, hazard.y, source.radius)) { source.x = hazard.x; source.y = hazard.y; }
      }
    }
  }

  private spawnBossGuards(boss: CoopEnemy, count: number) {
    const definition = ENEMY_TYPES.elite;
    for (let index = 0; index < count && this.enemies.length < COOP_MAX_ENEMIES; index++) {
      const angle = index / Math.max(1, count) * Math.PI * 2 + this.random() * .35;
      const position = this.safeFallbackPosition(boss.x + Math.cos(angle) * (boss.radius + 170), boss.y + Math.sin(angle) * (boss.radius + 170), definition.radius);
      this.enemies.push({ id: this.nextEntityId++, x: position.x, y: position.y, health: definition.health * this.partyScale(.45), maxHealth: definition.health * this.partyScale(.45), type: 'elite', color: definition.color, radius: definition.radius, damage: definition.damage, speed: definition.speed, experienceValue: definition.xp, hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0, targetLeaseUntilMs: this.elapsedMs + 2_500, nextAttackAtMs: this.elapsedMs + enemyOpeningDelay('elite') });
    }
  }

  private updatePassiveModules() {
    for (const player of this.players.values()) {
      if (player.lifeState !== 'alive') continue;
      for (const module of player.passiveRuntime) {
        if (this.elapsedMs < module.nextTriggerAtMs) continue;
        module.nextTriggerAtMs = this.elapsedMs + passiveCooldownMs(module.id, module.rank);
        const radius = passiveRadius(module.id, module.rank);
        const candidates = this.enemySpatialIndex.query(player.x, player.y, radius + MAX_ENEMY_RADIUS, this.nearbyEnemies);
        let targetCount = 0;
        for (const enemy of candidates) {
          const dx = enemy.x - player.x, dy = enemy.y - player.y;
          if (enemy.dying || dx * dx + dy * dy > radius * radius) continue;
          targetCount++;
          if (module.id === 'frost_aura') enemy.slowMultiplier = Math.min(enemy.slowMultiplier, .58 - (module.rank - 1) * .07);
          this.applyDamage(enemy, passiveDamage(module.id, module.rank), player.id, module.id);
        }
        if (module.id === 'neural_pulse' || targetCount > 0) this.emitCombatEvent({ kind: 'passive_triggered', x: player.x, y: player.y, playerId: player.id, weaponId: module.id, color: COOP_PASSIVE_BY_ID[module.id].color });
      }
    }
  }

  private awardCredits(amount: number) {
    for (const player of this.players.values()) {
      if (player.lifeState === 'eliminated') continue;
      player.coins += amount;
      const stats = this.runStats.get(player.id); if (stats) stats.creditsEarned += amount;
    }
  }

  private onBossKilled(enemy: CoopEnemy) {
    this.bossEnemyId = undefined;
    this.nextBossAbilityAtMs = 0;
    const outcome = this.runDirector.completeBoss(this.squadCentre());
    if (outcome === 'station') { this.awardCredits(260); this.spawnStation(this.squadCentre()); this.nextScenarioAtMs = this.elapsedMs + 12_000; }
    if (outcome === 'exfil') { this.awardCredits(400); this.emitCombatEvent({ kind: 'exfil_deployed', x: this.runDirector.currentExfil!.x, y: this.runDirector.currentExfil!.y, color: '#fbbf24' }); }
    this.emitCombatEvent({ kind: 'boss_defeated', x: enemy.x, y: enemy.y, enemyId: enemy.id, color: enemy.color });
  }

  private finishRun(success: boolean) {
    if (this.results) return;
    const players = awardMedals([...this.players.values()].map(player => ({ ...createRunStats(player.id), ...this.runStats.get(player.id), label: player.label, color: player.color })));
    this.results = { success, durationMs: Math.round(this.elapsedMs), contractsCompleted: this.runDirector.snapshot(this.elapsedMs).contractIndex, bossesDefeated: this.runDirector.snapshot(this.elapsedMs).contractIndex + (success ? 1 : 0), players };
    this.matchState = success ? 'active' : (this.players.size === 1 ? 'solo_defeat' : 'squad_wiped');
  }

  private squadCentre() {
    const living = [...this.players.values()].filter(player => player.lifeState === 'alive');
    const members = living.length ? living : [...this.players.values()];
    return { x: members.reduce((sum, player) => sum + player.x, 0) / Math.max(1, members.length), y: members.reduce((sum, player) => sum + player.y, 0) / Math.max(1, members.length) };
  }

  private partyScale(perAdditionalPlayer: number) { return 1 + Math.max(0, [...this.players.values()].filter(player => player.lifeState !== 'eliminated').length - 1) * perAdditionalPlayer; }
  private safeFallbackPosition(x: number, y: number, radius: number) {
    const position = { x: clamp(x, radius, COOP_WORLD_SIZE - radius), y: clamp(y, radius, COOP_WORLD_SIZE - radius) };
    if (isWorldPositionClear(position.x, position.y, radius)) return position;
    return this.safeFallback('', radius);
  }

  private weapon(player: CoopPlayer) { return player.weaponStates[player.selectedSlot]; }

  /** The only route for enemy and future hazard damage. Keeping this in the
   * host simulation prevents clients from inventing hits, down states, or
   * revive opportunities. */
  private damagePlayer(player: CoopPlayer, amount: number, sourceX: number, sourceY: number) {
    if (this.matchState !== 'active' || player.lifeState !== 'alive' || player.invulnerableRemainingMs > 0 || amount <= 0) return;
    this.cancelRevivesBy(player.id);
    player.lastArmorDamageAtMs = this.elapsedMs;
    const absorbed = Math.min(player.armorHp, amount);
    player.armorHp -= absorbed;
    const healthDamage = amount - absorbed;
    player.health = Math.max(0, player.health - healthDamage);
    const stats = this.runStats.get(player.id); if (stats) stats.damageTaken += healthDamage;
    // Contact damage is applied every 50 ms. Repeat the presentation event at
    // a human-readable cadence while still applying every authoritative tick.
    if (this.elapsedMs - player.lastDamageEventAtMs >= 240 || player.health <= 0) {
      player.lastDamageEventAtMs = this.elapsedMs;
      this.emitCombatEvent({ kind: 'player_damaged', x: sourceX, y: sourceY, playerId: player.id, amount, color: '#fb7185' });
    }
    if (player.health <= 0) this.downPlayer(player);
  }

  /** Toxic inhalation directly chips vitality, bypassing kinetic armor and
   * pacing visual alerts so players are not overwhelmed by screen flashes. */
  private applyGasDamage(player: CoopPlayer, amount: number) {
    if (this.matchState !== 'active' || player.lifeState !== 'alive' || player.invulnerableRemainingMs > 0 || amount <= 0) return;
    this.cancelRevivesBy(player.id);
    player.health = Math.max(0, player.health - amount);
    const stats = this.runStats.get(player.id);
    if (stats) stats.damageTaken += amount;

    if (this.elapsedMs - player.lastGasNoticeAtMs >= 1500 || player.health <= 0) {
      player.lastGasNoticeAtMs = this.elapsedMs;
      this.emitCombatEvent({
        kind: 'gas_damaged',
        x: player.x,
        y: player.y,
        playerId: player.id,
        amount: Math.round(GAS_DPS * 1.5),
        color: '#4ade80',
      });
    }
    if (player.health <= 0) this.downPlayer(player);
  }

  private cancelRevivesBy(reviverId: string) {
    for (const target of this.players.values()) {
      if (target.reviverId !== reviverId) continue;
      target.reviverId = undefined;
      target.reviveProgressMs = 0;
    }
  }

  private downPlayer(player: CoopPlayer) {
    player.health = 0;
    player.z = 0; player.verticalVelocity = 0; player.sliding = false; player.crouching = false;
    player.isAiming = false; player.isReloading = false; player.isSwitching = false; player.previousFiring = false;
    const weapon = this.weapon(player);
    this.cancelReload(weapon); weapon.state = 'ready';
    player.weaponActionEndsAtMs = undefined;
    if (this.players.size === 1 && player.selfRevives <= 0) {
      this.eliminatePlayer(player, 'solo defeat');
      return;
    }
    player.lifeState = 'downed';
    player.downedRemainingMs = COOP_BLEED_OUT_MS;
    player.reviveProgressMs = 0; player.selfReviveProgressMs = 0;
    player.reviverId = undefined;
    this.emitCombatEvent({ kind: 'player_downed', x: player.x, y: player.y, playerId: player.id, amount: COOP_BLEED_OUT_MS, color: player.color });
    // A team with no living operative has nobody who could perform the F-key
    // revive, so resolve the wipe immediately rather than showing a futile
    // bleed-out countdown.
    this.finalizeDefeatIfNeeded();
  }

  private eliminatePlayer(player: CoopPlayer, reason: string) {
    if (player.lifeState === 'eliminated') return;
    player.health = 0; player.lifeState = 'eliminated'; player.downedRemainingMs = 0;
    player.reviveProgressMs = 0; player.selfReviveProgressMs = 0; player.reviverId = undefined; player.isAiming = false; player.isReloading = false; player.isSwitching = false;
    this.emitCombatEvent({ kind: 'player_eliminated', x: player.x, y: player.y, playerId: player.id, color: player.color });
    if (reason === 'solo defeat') this.finalizeDefeatIfNeeded();
  }

  private hasLivingTeammate(playerId: string) {
    return [...this.players.values()].some(player => player.id !== playerId && player.lifeState === 'alive');
  }

  private selfRevive(player: CoopPlayer) {
    if (player.lifeState !== 'downed' || player.selfRevives <= 0) return;
    player.selfRevives--;
    player.lifeState = 'alive';
    player.health = player.maxHealth * COOP_REVIVE_HEALTH_RATIO;
    player.downedRemainingMs = 0;
    player.selfReviveProgressMs = 0;
    player.reviveProgressMs = 0;
    player.invulnerableRemainingMs = COOP_REVIVE_INVULNERABILITY_MS;
    const stats = this.runStats.get(player.id); if (stats) stats.selfReviveUsed = true;
    this.emitCombatEvent({ kind: 'self_revived', x: player.x, y: player.y, playerId: player.id, amount: player.health, color: '#fbbf24' });
  }

  private updateRevives(deltaMs: number) {
    for (const target of this.players.values()) {
      if (target.lifeState !== 'downed') continue;
      const candidates = [...this.players.values()]
        .filter(player => player.lifeState === 'alive' && this.inputByPlayer.get(player.id)?.reviving && Math.hypot(player.x - target.x, player.y - target.y) <= COOP_REVIVE_RANGE)
        .sort((left, right) => left.id.localeCompare(right.id));
      const reviver = candidates[0];
      if (!reviver) {
        target.reviveProgressMs = 0;
        target.reviverId = undefined;
        continue;
      }
      if (target.reviverId !== reviver.id) {
        target.reviverId = reviver.id;
        target.reviveProgressMs = 0;
        this.emitCombatEvent({ kind: 'revive_started', x: target.x, y: target.y, playerId: target.id, killedByPlayerId: reviver.id, color: reviver.color });
      }
      target.reviveProgressMs = Math.min(COOP_REVIVE_DURATION_MS, target.reviveProgressMs + deltaMs);
      if (target.reviveProgressMs < COOP_REVIVE_DURATION_MS) continue;
      target.lifeState = 'alive';
      target.health = target.maxHealth * COOP_REVIVE_HEALTH_RATIO;
      const wasClutchSave = target.downedRemainingMs > 0 && target.downedRemainingMs <= 3_000;
      target.downedRemainingMs = 0;
      target.reviveProgressMs = 0;
      target.invulnerableRemainingMs = COOP_REVIVE_INVULNERABILITY_MS;
      const revivedBy = target.reviverId;
      target.reviverId = undefined;
      const reviverStats = revivedBy ? this.runStats.get(revivedBy) : undefined;
      if (reviverStats) {
        reviverStats.revives++;
        if (wasClutchSave) reviverStats.clutchSaves++;
      }
      this.emitCombatEvent({ kind: 'player_revived', x: target.x, y: target.y, playerId: target.id, killedByPlayerId: revivedBy, amount: target.health, color: target.color });
    }
  }

  private finalizeDefeatIfNeeded() {
    if (this.matchState !== 'active' || [...this.players.values()].some(player => player.lifeState === 'alive')) return;
    // A purchased Emergency Reboot creates a short, solo clutch window even
    // when no teammate is still standing to perform the normal revive.
    if ([...this.players.values()].some(player => player.lifeState === 'downed' && player.selfRevives > 0)) return;
    this.matchState = this.players.size === 1 ? 'solo_defeat' : 'squad_wiped';
    this.runDirector.fail(); this.finishRun(false);
    this.emitCombatEvent({ kind: this.matchState === 'solo_defeat' ? 'solo_defeat' : 'squad_wiped', x: COOP_WORLD_SIZE / 2, y: COOP_WORLD_SIZE / 2, color: '#fb7185' });
  }

  private switchWeapon(player: CoopPlayer, slot: number) {
    const previous = this.weapon(player); if (previous.state === 'reloading') this.cancelReload(previous);
    player.selectedSlot = slot; player.selectedWeaponId = COOP_WEAPON_SLOTS[slot]; player.selectedWeaponLevel = this.weapon(player).level;
    player.isAiming = false; player.isReloading = false; player.isSwitching = true;
    const weapon = this.weapon(player); weapon.state = 'switching'; weapon.switchEndsAtMs = this.elapsedMs + SWITCH_MS; player.weaponActionEndsAtMs = weapon.switchEndsAtMs;
  }
  private advanceWeaponActions(player: CoopPlayer) {
    const weapon = this.weapon(player);
    if (weapon.state === 'switching' && this.elapsedMs >= (weapon.switchEndsAtMs || 0)) { weapon.state = 'ready'; player.isSwitching = false; player.weaponActionEndsAtMs = undefined; }
    if (weapon.state === 'bolt_cycle' && this.elapsedMs >= (weapon.boltCycleEndsAtMs || 0)) { weapon.state = 'ready'; player.weaponActionEndsAtMs = undefined; }
    if (weapon.state !== 'reloading') return;
    const definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    if (definition.reloadStyle === 'shell_by_shell') {
      if (this.elapsedMs >= (weapon.reloadEndsAtMs || Infinity) && weapon.reserveAmmo > 0 && weapon.magazineAmmo < definition.magazineSize) { weapon.magazineAmmo++; weapon.reserveAmmo--; weapon.shellsLoaded = (weapon.shellsLoaded || 0) + 1; weapon.reloadEndsAtMs = this.elapsedMs + definition.shellInsertMs!; this.emitCombatEvent({ kind: 'reload_shell_loaded', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, amount: weapon.shellsLoaded, color: definition.visual.muzzleColor }); }
      if (weapon.magazineAmmo >= definition.magazineSize || weapon.reserveAmmo <= 0) this.finishReload(player, weapon);
    } else if (this.elapsedMs >= (weapon.reloadEndsAtMs || Infinity)) { const rounds = Math.min(definition.magazineSize - weapon.magazineAmmo, weapon.reserveAmmo); weapon.magazineAmmo += rounds; weapon.reserveAmmo -= rounds; this.finishReload(player, weapon); }
  }
  private startReload(player: CoopPlayer) {
    const weapon = this.weapon(player), definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    if (player.health <= 0 || player.isSwitching || weapon.state !== 'ready' || weapon.magazineAmmo >= definition.magazineSize || weapon.reserveAmmo <= 0) return false;
    weapon.state = 'reloading'; weapon.reloadStartedAtMs = this.elapsedMs; weapon.reloadEndsAtMs = this.elapsedMs + (definition.reloadStyle === 'shell_by_shell' ? definition.shellInsertMs! : definition.reloadDurationMs!); weapon.shellsLoaded = 0; player.isReloading = true; player.isAiming = false; player.weaponActionEndsAtMs = weapon.reloadEndsAtMs;
    this.emitCombatEvent({ kind: 'reload_started', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: definition.visual.muzzleColor }); return true;
  }
  private finishReload(player: CoopPlayer, weapon: CoopWeaponRuntime) { weapon.state = 'ready'; weapon.reloadStartedAtMs = undefined; weapon.reloadEndsAtMs = undefined; player.isReloading = false; player.weaponActionEndsAtMs = undefined; this.emitCombatEvent({ kind: 'reload_finished', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: COOP_FIREARM_BY_ID[weapon.weaponId].visual.muzzleColor }); }
  private cancelReload(weapon: CoopWeaponRuntime) { weapon.state = 'ready'; weapon.reloadStartedAtMs = undefined; weapon.reloadEndsAtMs = undefined; }

  private tryCastWeapon(player: CoopPlayer, triggerPressed: boolean, actionId = 0) {
    const weapon = this.weapon(player), definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    if (player.isSwitching || weapon.state === 'switching' || weapon.state === 'bolt_cycle') return;
    if (weapon.state === 'reloading') {
      if (definition.reloadStyle === 'shell_by_shell' && weapon.magazineAmmo > 0 && triggerPressed) { this.cancelReload(weapon); player.isReloading = false; }
      else return;
    }
    if (weapon.magazineAmmo <= 0) { if (weapon.reserveAmmo > 0) this.startReload(player); else if (triggerPressed) this.emitCombatEvent({ kind: 'empty_fire', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: '#fca5a5' }); return; }
    if (this.elapsedMs < weapon.nextFireAtMs) return;
    weapon.magazineAmmo--; weapon.nextFireAtMs = this.elapsedMs + firearmFireInterval(definition, weapon.level); player.shotSequence++;
    const stats = this.runStats.get(player.id); if (stats) stats.shotsFired += definition.pelletCount || 1;
    this.emitCombatEvent({ kind: 'weapon_fired', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: definition.visual.muzzleColor, actionId });
    const count = definition.pelletCount || 1;
    for (let pellet = 0; pellet < count; pellet++) {
      const spread = definition.pelletCount ? definition.spreadRadians! : firearmSpread(definition, player.isAiming);
      const centered = count === 1 ? deterministicSigned(player.shotSequence, pellet, weapon.weaponId) : (pellet / Math.max(1, count - 1) - .5) * 2 + deterministicSigned(player.shotSequence, pellet, weapon.weaponId) * .18;
      const angle = player.angle + centered * spread, pitch = player.aimPitch + deterministicSigned(player.shotSequence, pellet + 71, weapon.weaponId) * spread * .28;
      const projectile: CoopProjectile = { id: this.nextEntityId++, ownerId: player.id, weaponId: weapon.weaponId, x: player.x + Math.cos(angle) * 26, y: player.y + Math.sin(angle) * 26, angle, pitch, z: 24 + player.z, radius: definition.projectileRadius, lifeMs: weapon.weaponId === 'sniper_rifle' ? 1500 : 1100, velocity: definition.projectileVelocity, verticalVelocity: Math.sin(pitch) * definition.projectileVelocity, damage: firearmDamage(definition, weapon.level), penetration: definition.penetration, damageIntervalMs: 1, nextDamageAt: this.elapsedMs };
      this.fastForwardShot(projectile, this.inputAgeMs.get(player.id) || 0);
      if (projectile.lifeMs > 0 && projectile.penetration > 0) this.projectiles.push(projectile);
    }
    if (weapon.weaponId === 'sniper_rifle') { weapon.state = 'bolt_cycle'; weapon.boltCycleEndsAtMs = this.elapsedMs + SNIPER_BOLT_MS; player.weaponActionEndsAtMs = weapon.boltCycleEndsAtMs; }
    if (weapon.magazineAmmo === 0 && weapon.reserveAmmo > 0) this.startReload(player);
  }

  /** Advance a newly accepted remote shot through a short, bounded history
   * window. Small substeps prevent a compensated projectile tunnelling through
   * a target, while the host still owns all hit and damage decisions. */
  private fastForwardShot(projectile: CoopProjectile, ageMs: number) {
    let remaining = Math.min(COOP_MAX_SHOT_COMPENSATION_MS, Math.max(0, ageMs));
    while (remaining > 0 && projectile.penetration > 0) {
      const stepMs = Math.min(12, remaining), seconds = stepMs / 1000;
      const horizontalVelocity = projectile.velocity * Math.cos(projectile.pitch);
      projectile.x += Math.cos(projectile.angle) * horizontalVelocity * seconds;
      projectile.y += Math.sin(projectile.angle) * horizontalVelocity * seconds;
      projectile.z += projectile.verticalVelocity * seconds;
      projectile.lifeMs -= stepMs;
      const candidates = this.enemySpatialIndex.query(projectile.x, projectile.y, projectile.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies);
      for (const enemy of candidates) {
        const dx = enemy.x - projectile.x, dy = enemy.y - projectile.y;
        const hitRadius = enemy.radius + projectile.radius;
        if (enemy.dying || dx * dx + dy * dy >= hitRadius * hitRadius) continue;
        if (projectile.z < -projectile.radius || projectile.z > ENEMY_HIT_HEIGHT + enemy.radius + projectile.radius) continue;
        this.applyDamage(enemy, projectile.damage, projectile.ownerId, projectile.weaponId);
        if (projectile.penetration !== 999) projectile.penetration--;
        if (projectile.penetration <= 0) break;
      }
      remaining -= stepMs;
    }
  }

  /** The only co-op path allowed to damage an enemy. It creates presentation
   * state and funnels all lethal outcomes through one idempotent death flow. */
  private applyDamage(enemy: CoopEnemy, amount: number, playerId: string, weaponId?: CoopWeaponId) {
    if (enemy.dying || amount <= 0) return;
    const damage = Math.max(0, Math.min(amount, enemy.health));
    enemy.health = Math.max(0, enemy.health - damage);
    const stats = this.runStats.get(playerId);
    if (stats) {
      if (isPassiveModule(weaponId)) {
        stats.passiveDamage += damage;
        stats.passiveDamageById[weaponId] = (stats.passiveDamageById[weaponId] || 0) + damage;
      } else { stats.firearmDamage += damage; stats.shotsHit++; }
      if (enemy.id === this.bossEnemyId) stats.bossDamage += damage;
    }
    enemy.hitFlashUntilMs = this.elapsedMs + HIT_FLASH_MS;
    enemy.hitFlashMs = HIT_FLASH_MS;
    this.emitCombatEvent({ kind: 'enemy_hit', x: enemy.x, y: enemy.y, enemyId: enemy.id, playerId, amount: damage, color: enemy.color, weaponId });
    this.emitCombatEvent({ kind: 'damage_number', x: enemy.x, y: enemy.y, enemyId: enemy.id, playerId, amount: damage, color: '#ffffff', weaponId });
    if (enemy.health <= 0) this.killEnemy(enemy, playerId, weaponId);
  }

  private killEnemy(enemy: CoopEnemy, playerId: string, weaponId?: CoopWeaponId) {
    if (enemy.dying) return;
    enemy.health = 0;
    enemy.dying = true;
    enemy.killedByPlayerId = playerId;
    enemy.deathUntilMs = this.elapsedMs + COOP_ENEMY_DEATH_PRESENTATION_MS;
    enemy.deathRemainingMs = COOP_ENEMY_DEATH_PRESENTATION_MS;
    this.kills++;
    const stats = this.runStats.get(playerId); if (stats) stats.kills++;
    this.emitCombatEvent({ kind: 'enemy_killed', x: enemy.x, y: enemy.y, enemyId: enemy.id, playerId, killedByPlayerId: playerId, color: enemy.color, weaponId });
    this.spawnGem(enemy.x, enemy.y, enemy.experienceValue, playerId);
    const killer = this.players.get(playerId);
    if (killer && (enemy.type === 'elite' || enemy.type === 'titan' || this.random() < enemyAmmoDropChance(enemy.type))) this.spawnAmmoCache(enemy.x, enemy.y, killer, enemy.type === 'elite' || enemy.type === 'titan', playerId);

    const guaranteedDrop = getGuaranteedEnemyDrop(enemy.type);
    if (guaranteedDrop) this.spawnItem(enemy.x, enemy.y, guaranteedDrop, playerId);
    if (enemy.isHolder) {
      this.spawnItem(enemy.x, enemy.y, rollHolderItem(() => this.random()), playerId);
    } else {
      const coin = rollCoinDrop(enemy.type, 1, 0.22, () => this.random());
      if (coin) this.spawnItem(enemy.x, enemy.y, coin, playerId);
    }

    this.killsSinceLastHeartDrop++;
    const activeHeartsCount = this.items.filter(item => item.type === 'hp').length;
    const playerInjured = [...this.players.values()].some(p => p.health > 0 && p.health <= p.maxHealth * 0.40);
    const dropHeart = rollCoopHeartDrop(enemy.type, () => this.random(), {
      playerInjured,
      activeHeartsCount,
      killsSinceLastHeartDrop: this.killsSinceLastHeartDrop,
    });
    if (dropHeart) {
      this.spawnItem(enemy.x, enemy.y, 'hp', playerId);
      this.killsSinceLastHeartDrop = 0;
    }

    if (enemy.id === this.bossEnemyId) this.onBossKilled(enemy);
    if (this.runDirector.completeEliteTarget(enemy.id)) this.onObjectiveCompleted(this.squadCentre());
  }

  private spawnGem(x: number, y: number, value: number, killedByPlayerId?: string) {
    if (this.gems.length >= COOP_MAX_WORLD_GEMS) {
      const merge = closestDrop(this.gems, x, y);
      if (merge) { merge.value += value; this.emitCombatEvent({ kind: 'drop_spawned', x: merge.x, y: merge.y, playerId: killedByPlayerId, amount: value, color: merge.color }); }
      return;
    }
    const gem: CoopGemSnapshot = { id: this.nextEntityId++, x, y, value, color: EXPERIENCE_GEM_COLOR };
    this.gems.push(gem);
    this.emitCombatEvent({ kind: 'drop_spawned', x, y, playerId: killedByPlayerId, amount: value, color: gem.color });
  }

  private spawnItem(x: number, y: number, type: ItemType, killedByPlayerId?: string) {
    const definition = ITEM_TYPES[type];
    if (this.items.length >= COOP_MAX_WORLD_ITEMS) {
      const merge = closestDrop(this.items.filter(item => item.type === type), x, y);
      if (merge) { merge.value += definition.value; this.emitCombatEvent({ kind: 'drop_spawned', x: merge.x, y: merge.y, playerId: killedByPlayerId, itemType: type, amount: definition.value, color: merge.color }); }
      else if (type === 'data_core' && killedByPlayerId) {
        // A guaranteed elite reward must never disappear because the field is
        // saturated with unrelated pickups. Bank it to its killer immediately.
        const player = this.players.get(killedByPlayerId);
        if (player) {
          player.pendingDataCores += definition.value;
          this.emitCombatEvent({ kind: 'pickup_collected', x, y, playerId: killedByPlayerId, itemType: type, amount: definition.value, color: definition.color });
        }
      }
      return;
    }
    const item: CoopItemSnapshot = { id: this.nextEntityId++, x, y, type, value: definition.value, color: definition.color };
    this.items.push(item);
    this.emitCombatEvent({ kind: 'drop_spawned', x, y, playerId: killedByPlayerId, itemType: type, amount: item.value, color: item.color });
  }

  private spawnAmmoCache(x: number, y: number, player: CoopPlayer, elite: boolean, killedByPlayerId: string) {
    const selected = this.weapon(player);
    const weapon = player.weaponStates.reduce((lowest, candidate) => candidate.reserveAmmo / COOP_FIREARM_BY_ID[candidate.weaponId].maxReserve < lowest.reserveAmmo / COOP_FIREARM_BY_ID[lowest.weaponId].maxReserve ? candidate : lowest, selected);
    const definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    const amount = elite ? Math.ceil(definition.magazineSize * 2) : Math.max(1, Math.ceil(definition.magazineSize * .60));
    if (this.ammoCaches.length >= COOP_MAX_AMMO_CACHES) {
      const merge = closestDrop(this.ammoCaches.filter(cache => cache.ammoType === definition.ammoType), x, y);
      if (merge) { merge.amount += amount; this.emitCombatEvent({ kind: 'drop_spawned', x: merge.x, y: merge.y, playerId: killedByPlayerId, amount, color: merge.color, ammoType: merge.ammoType }); }
      return;
    }
    const cache: CoopAmmoCacheSnapshot = { id: this.nextEntityId++, x, y, ammoType: definition.ammoType, amount, color: definition.visual.muzzleColor };
    this.ammoCaches.push(cache);
    this.emitCombatEvent({ kind: 'drop_spawned', x, y, playerId: killedByPlayerId, amount: cache.amount, color: cache.color, ammoType: cache.ammoType });
  }

  private updateDrops(seconds: number) {
    const collectedGemIds = new Set<number>();
    for (const gem of this.gems) {
      const player = this.closestLivingPlayer(gem.x, gem.y);
      if (!player) continue;
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const distance = Math.hypot(dx, dy);
      if (distance < GEM_MAGNET_RANGE && distance > 0.0001) {
        const step = Math.min(distance, 480 * seconds);
        gem.x += dx / distance * step;
        gem.y += dy / distance * step;
      }
      if (distance <= PLAYER_RADIUS + GEM_PICKUP_RADIUS) {
        this.collectGem(gem, player);
        collectedGemIds.add(gem.id);
      }
    }
    if (collectedGemIds.size) this.gems = this.gems.filter(gem => !collectedGemIds.has(gem.id));

    const collectedItemIds = new Set<number>();
    for (const item of this.items) {
      const player = this.closestLivingPlayer(item.x, item.y);
      if (!player) continue;
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      const distance = Math.hypot(dx, dy);
      if (distance < ITEM_MAGNET_RANGE && distance > 0.0001) {
        const step = Math.min(distance, 360 * seconds);
        item.x += dx / distance * step;
        item.y += dy / distance * step;
      }
      if (distance <= PLAYER_RADIUS + ITEM_PICKUP_RADIUS) {
        this.collectItem(item, player);
        collectedItemIds.add(item.id);
      }
    }
    if (collectedItemIds.size) this.items = this.items.filter(item => !collectedItemIds.has(item.id));

    const collectedCacheIds = new Set<number>();
    for (const cache of this.ammoCaches) {
      const player = this.closestLivingPlayer(cache.x, cache.y);
      if (!player) continue;
      const dx = player.x - cache.x, dy = player.y - cache.y, distance = Math.hypot(dx, dy);
      if (distance < ITEM_MAGNET_RANGE && distance > .0001) { const step = Math.min(distance, 360 * seconds); cache.x += dx / distance * step; cache.y += dy / distance * step; }
      if (distance <= PLAYER_RADIUS + ITEM_PICKUP_RADIUS) {
        let weapon = player.weaponStates.find(state => COOP_FIREARM_BY_ID[state.weaponId].ammoType === cache.ammoType && state.reserveAmmo < COOP_FIREARM_BY_ID[state.weaponId].maxReserve);
        if (!weapon) weapon = player.weaponStates.reduce((lowest, candidate) => candidate.reserveAmmo / COOP_FIREARM_BY_ID[candidate.weaponId].maxReserve < lowest.reserveAmmo / COOP_FIREARM_BY_ID[lowest.weaponId].maxReserve ? candidate : lowest, this.weapon(player));
        const definition = COOP_FIREARM_BY_ID[weapon.weaponId], granted = Math.max(0, Math.min(cache.amount, definition.maxReserve - weapon.reserveAmmo));
        weapon.reserveAmmo += granted; this.emitCombatEvent({ kind: 'ammo_collected', x: cache.x, y: cache.y, playerId: player.id, weaponId: weapon.weaponId, ammoType: definition.ammoType, amount: granted, color: cache.color }); collectedCacheIds.add(cache.id);
      }
    }
    if (collectedCacheIds.size) this.ammoCaches = this.ammoCaches.filter(cache => !collectedCacheIds.has(cache.id));
  }

  private collectGem(gem: CoopGemSnapshot, player: CoopPlayer) {
    this.addExperience(player, gem.value);
    this.emitCombatEvent({ kind: 'pickup_collected', x: gem.x, y: gem.y, playerId: player.id, amount: gem.value, color: gem.color });
  }

  private collectItem(item: CoopItemSnapshot, player: CoopPlayer) {
    const effect = getPickupEffect(item.type, item.value);
    if (effect.kind === 'heal') {
      player.health = player.maxHealth;
    } else if (effect.kind === 'coins') {
      player.coins += effect.amount;
      const stats = this.runStats.get(player.id); if (stats) stats.creditsEarned += effect.amount;
    } else if (effect.kind === 'magnet') {
      const gems = this.gems;
      this.gems = [];
      for (const gem of gems) this.collectGem(gem, player);
    } else if (effect.kind === 'bomb') {
      for (const enemy of this.enemies) this.applyDamage(enemy, effect.damage, player.id, 'neural_pulse');
    } else {
      player.pendingDataCores += effect.amount;
    }
    const eventAmount = item.type === 'hp' ? player.maxHealth : item.value;
    this.emitCombatEvent({ kind: 'pickup_collected', x: item.x, y: item.y, playerId: player.id, itemType: item.type, amount: eventAmount, color: item.color });
  }

  private addExperience(player: CoopPlayer, amount: number) {
    player.experience += Math.max(0, amount);
    while (player.experience >= player.experienceToNextLevel) {
      player.experience -= player.experienceToNextLevel;
      player.level++;
      player.experienceToNextLevel = getRunXPRequired(player.level);
      this.emitCombatEvent({ kind: 'level_up', x: player.x, y: player.y, playerId: player.id, amount: player.level, color: player.color });
      const weapon = this.weapon(player);
      if (weapon.level < WEAPON_MAX_LEVEL) { weapon.level++; player.weaponLevels[player.selectedSlot] = weapon.level; player.selectedWeaponLevel = weapon.level; this.emitCombatEvent({ kind: 'weapon_upgraded', x: player.x, y: player.y, playerId: player.id, amount: weapon.level, color: COOP_FIREARM_BY_ID[weapon.weaponId].visual.muzzleColor, weaponId: weapon.weaponId }); }
    }
  }

  private emitCombatEvent(event: Omit<CoopCombatEvent, 'id' | 'tick' | 'atMs'>) {
    this.combatEvents.push({ id: this.nextCombatEventId++, tick: this.simulationTick, atMs: this.elapsedMs, ...event });
  }

  private spawnEnemy(type: keyof typeof ENEMY_TYPES, targetPlayerId: string, packetId: number, openingPosition?: { x: number; y: number }, healthMultiplier = 1, damageMultiplier = 1) {
    const definition = ENEMY_TYPES[type];
    const players = this.encounterPlayers();
    const clusters = buildEncounterClusters(players, this.enemies);
    const cluster = clusters.find(candidate => candidate.playerIds.includes(targetPlayerId)) || clusters[0];
    const position = openingPosition || (cluster && this.spawnTopology.find(cluster, players, definition.radius, this.enemies)) || this.safeFallback(targetPlayerId, definition.radius);
    this.enemies.push({
      id: this.nextEntityId++, x: position.x, y: position.y, health: definition.health * healthMultiplier, maxHealth: definition.health * healthMultiplier,
      type, color: definition.color, radius: definition.radius, damage: definition.damage * damageMultiplier, speed: definition.speed,
      experienceValue: Math.round(definition.xp * (.75 + healthMultiplier * .25)), hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1,
      isHolder: this.random() > 1 - ITEM_HOLDER_CHANCE, dying: false, deathRemainingMs: 0,
      targetPlayerId, spawnPacketId: packetId, targetLeaseUntilMs: this.elapsedMs + 2_500,
      nextAttackAtMs: this.elapsedMs + enemyOpeningDelay(type),
    });
  }

  /** Match-clock encounter pacing remains host-only; firearm input never
   * influences spawning or targeting. */
  private scheduleEncounters() {
    const encounterCount = this.encounterEnemies().length;
    const capacity = Math.max(0, Math.min(
      COOP_MAX_ENEMIES - this.enemies.length,
      COOP_MAX_ENCOUNTER_ENEMIES - encounterCount,
    ));
    // Contract elites and bosses consume global capacity, but their separate
    // scenario budget must not stall or inflate finite round accounting.
    const orders = this.encounterDirector.schedule(this.elapsedMs, this.encounterEnemies(), this.encounterPlayers(), capacity);
    for (const packet of groupEncounterOrders(orders)) this.spawnEncounterPacket(packet);
    for (const event of this.encounterDirector.drainRoundEvents()) this.handleRoundEvent(event);
  }

  private spawnEncounterPacket(orders: EncounterOrder[]) {
    const players = this.encounterPlayers();
    const clusters = buildEncounterClusters(players, this.enemies);
    const cluster = clusters.find(candidate => candidate.id === orders[0]?.clusterId) || clusters[0];
    const largestRadius = Math.max(...orders.map(order => ENEMY_TYPES[order.type].radius));
    const centre = cluster && this.spawnTopology.find(cluster, players, largestRadius + 55, this.enemies);
    const placed: Array<{ x: number; y: number; radius: number }> = [];
    for (const order of orders) {
      const radius = ENEMY_TYPES[order.type].radius;
      const position = centre && cluster ? this.packetMemberPosition(centre, cluster, order, radius, placed) : undefined;
      if (position) placed.push({ ...position, radius });
      this.spawnEnemy(order.type, order.targetPlayerId, order.packetId, position, order.healthMultiplier, order.damageMultiplier);
    }
  }

  /** Tanks and melee screen the near edge; ranged support enters behind them.
   * Rotated fallbacks keep the pack collision-clear in narrow city corridors. */
  private packetMemberPosition(centre: { x: number; y: number }, cluster: { x: number; y: number }, order: EncounterOrder, radius: number, placed: readonly { x: number; y: number; radius: number }[]) {
    const toward = Math.atan2(cluster.y - centre.y, cluster.x - centre.x);
    const depth = order.type === 'ranged' ? -105 : order.type === 'tank' || order.type === 'elite' ? 52 : 24;
    const lateral = (order.formationIndex - (order.formationSize - 1) / 2) * 72;
    for (const rotation of [0, .45, -.45, .9, -.9, Math.PI]) {
      const x = centre.x + Math.cos(toward + rotation) * depth + Math.cos(toward + Math.PI / 2 + rotation) * lateral;
      const y = centre.y + Math.sin(toward + rotation) * depth + Math.sin(toward + Math.PI / 2 + rotation) * lateral;
      if (!isWorldPositionClear(x, y, radius + 6)) continue;
      if (placed.some(other => Math.hypot(other.x - x, other.y - y) < other.radius + radius + 12)) continue;
      return { x, y };
    }
    return undefined;
  }

  private handleRoundEvent(event: EncounterRoundEvent) {
    const centre = this.squadCentre();
    if (event.kind === 'round_started') {
      this.emitCombatEvent({ kind: 'round_started', x: centre.x, y: centre.y, amount: event.round, color: '#fbbf24' });
      return;
    }
    // Clearing a finite wave should feel like a payoff, not merely a pause.
    // Credits are personal and every living operator gets a full reserve cache
    // at their feet before the next round begins.
    const bonus = 70 + event.round * 30;
    this.awardCredits(bonus);
    for (const player of this.players.values()) {
      if (player.lifeState !== 'alive') continue;
      this.spawnAmmoCache(player.x, player.y, player, true, player.id);
    }
    this.emitCombatEvent({ kind: 'round_completed', x: centre.x, y: centre.y, amount: event.round, color: '#5eead4' });
  }

  private encounterPlayers(): EncounterPlayer[] { return [...this.players.values()].map(({ id, x, y, angle, health }) => ({ id, x, y, angle, health })); }
  private encounterEnemies() { return this.enemies.filter(enemy => enemy.spawnPacketId !== undefined); }

  private safeFallback(targetPlayerId: string, radius: number) {
    const target = this.players.get(targetPlayerId) || this.closestLivingPlayer(COOP_WORLD_SIZE / 2, COOP_WORLD_SIZE / 2);
    const base = target || { x: COOP_WORLD_SIZE / 2, y: COOP_WORLD_SIZE / 2 };
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = (attempt / 16) * Math.PI * 2 + this.random() * 0.08;
      const position = { x: clamp(base.x + Math.cos(angle) * 980, radius, COOP_WORLD_SIZE - radius), y: clamp(base.y + Math.sin(angle) * 980, radius, COOP_WORLD_SIZE - radius) };
      if (isWorldPositionClear(position.x, position.y, radius)) return position;
    }
    return { x: clamp(base.x + 900, radius, COOP_WORLD_SIZE - radius), y: base.y };
  }

  private closestLivingPlayer(x: number, y: number): CoopPlayer | undefined {
    let target: CoopPlayer | undefined;
    let distance = Infinity;
    for (const player of this.players.values()) {
      if (player.health <= 0) continue;
      const candidateDistance = (player.x - x) ** 2 + (player.y - y) ** 2;
      if (candidateDistance < distance || (candidateDistance === distance && target !== undefined && player.id < target.id)) {
        target = player;
        distance = candidateDistance;
      }
    }
    return target;
  }

  private resolveEnemyTarget(enemy: CoopEnemy) {
    const leased = enemy.targetPlayerId ? this.players.get(enemy.targetPlayerId) : undefined;
    if (leased && leased.health > 0 && this.elapsedMs < enemy.targetLeaseUntilMs) return leased;
    const target = this.closestLivingPlayer(enemy.x, enemy.y);
    if (target) { enemy.targetPlayerId = target.id; enemy.targetLeaseUntilMs = this.elapsedMs + 1_250; }
    return target;
  }

  private closestEnemy(x: number, y: number): CoopEnemy | undefined {
    let target: CoopEnemy | undefined;
    let distance = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const candidateDistance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (candidateDistance < distance) { target = enemy; distance = candidateDistance; }
    }
    return target;
  }

  private random(): number {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }
}

export function quantizeAngle(angle: number): number {
  const normalized = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(normalized / (Math.PI * 2) * 65535);
}
export function quantizePitch(pitch: number): number {
  const clamped = clamp(pitch, -MAX_AIM_PITCH, MAX_AIM_PITCH);
  return Math.round((clamped + MAX_AIM_PITCH) / (MAX_AIM_PITCH * 2) * 65535);
}

function deterministicSigned(shot: number, salt: number, id: string) { let hash = 2166136261 ^ shot ^ salt; for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619); return ((hash >>> 0) / 0xffffffff) * 2 - 1; }
function dequantizePitch(value: number) { return value / 65535 * MAX_AIM_PITCH * 2 - MAX_AIM_PITCH; }
function turnTowards(current: number, target: number, maxTurn: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(delta, -maxTurn, maxTurn);
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function isPassiveModule(value: unknown): value is CoopPassiveModuleId { return typeof value === 'string' && value in COOP_PASSIVE_BY_ID; }
function maxArmorHp(tier: number) { return tier >= 2 ? 100 : tier >= 1 ? 50 : 0; }
function groupEncounterOrders(orders: readonly EncounterOrder[]) {
  const packets = new Map<number, EncounterOrder[]>();
  for (const order of orders) {
    const packet = packets.get(order.packetId) || [];
    packet.push(order);
    packets.set(order.packetId, packet);
  }
  return [...packets.values()];
}
function enemyOpeningDelay(type: keyof typeof ENEMY_TYPES) {
  return ENEMY_ATTACK_PROFILES[type]?.openingDelayMs || 0;
}
function enemyAmmoDropChance(type: keyof typeof ENEMY_TYPES) {
  if (type === 'tank') return .32;
  if (type === 'fast' || type === 'ranged' || type === 'phantom') return .22;
  return .14;
}
function closestDrop<T extends { x: number; y: number }>(drops: readonly T[], x: number, y: number): T | undefined {
  let closest: T | undefined;
  let closestDistance = Infinity;
  for (const drop of drops) {
    const distance = (drop.x - x) ** 2 + (drop.y - y) ** 2;
    if (distance < closestDistance) { closest = drop; closestDistance = distance; }
  }
  return closest;
}
