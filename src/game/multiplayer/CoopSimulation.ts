import { CoopPing, CoopPingKind, MultiplayerInputFrame } from './protocol';
export type { CoopPing, CoopPingKind } from './protocol';
import { GAME_WIDTH } from '../../constants';
import { COOP_FIREARM_BY_ID, COOP_FIREARM_DEFINITIONS, COOP_FIREARM_IDS, COOP_WEAPON_SLOTS as FIREARM_SLOTS, coopWeaponSlotsForSignature, createCoopWeaponRuntime, firearmDamage, firearmFireInterval, firearmSpread, type AmmoType, type CoopFirearmDefinition, type CoopFirearmId, type CoopWeaponRuntime } from '../combat/coopFirearms';
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
  type EnemyAttackProfile,
} from '../combat/enemyDomain';
import { isWorldPositionClear, raycastWorldObstacles, resolveWorldCollisions } from '../world/WorldLayout';
import { getWorldDefinition, nextWorldId, normalizeWorldId, sampleWorldSurface, type WorldId } from '../world/WorldDefinitions';
import { buildEncounterClusters, EncounterDirector, type EncounterDirectorSnapshot, type EncounterOrder, type EncounterPlayer, type EncounterRoundEvent } from './EncounterDirector';
import { SpawnTopology } from './SpawnTopology';
import { COOP_INSERTION_DURATION_MS, COOP_UPLINK_RADIUS, CoopRunDirector, coopBossHealth, coopObjectiveEliteHealth, type CoopBossKind, type CoopRunSnapshot } from './CoopRunDirector';
import { COOP_OPERATOR_REDEPLOY_COST, COOP_SHOP_ITEMS, type CoopBuyStationSnapshot, type CoopPurchaseError, type CoopRedeployErrorCode, type CoopShopItemId } from './CoopBuyStation';
import { COOP_STATION_COUNT, CoopStationDirector } from './CoopStationDirector';
import { CoopWeaponFoundry, coopFoundryUpgradeCost, generateCoopWeaponFoundrySite, isCoopFirearmId, type CoopFoundryResult, type CoopWeaponFoundrySnapshot } from './CoopWeaponFoundry';
import { COOP_PASSIVE_BY_ID, passiveCooldownMs, passiveDamage, passiveRadius, passiveRankCost, type CoopPassiveModuleId, type CoopPassiveRuntime, type CoopPassiveSnapshot } from './CoopPassiveModules';
import { awardMedals, createRunStats, type CoopPlayerRunStats, type CoopRunResultsSnapshot } from './CoopResults';
import { advancePlayerMovement, COOP_PLAYER_RADIUS, isOnCoopPlatform, type PlayerMotionState } from './playerMovement';
import { findEnemyDetour, hasClearAttackPath, moveTacticalEnemy } from './enemyTactics';
import { SpatialHash } from './SpatialHash';
import { CoopGasZone, GAS_DPS, type CoopGasZoneSnapshot } from './CoopGasZone';
import { COOP_FIELD_MISSION_LABELS, COOP_HOSTAGE_FREE_DURATION_MS, COOP_HOSTAGE_RECOVERY_DURATION_MS, CoopFieldMissionDirector, resolveCoopMissionNavigationTarget, type CoopFieldMissionsSnapshot, type CoopFieldMissionKind } from './CoopFieldMissions';
import type { CoopTextKey } from './i18n';
import { coopImprintModifiers, normalizeCoopImprintLoadout, type CoopImprintLoadout } from './CoopImprint';
import { normalizeCoopSkinId, type CoopSkinId } from './CoopSkins';
import { getCoopOperator, normalizeCoopOperatorId, type CoopOperatorId } from './CoopOperators';
import {
  COOP_BUILD_RANGE,
  COOP_BUILD_ZONE_RADIUS,
  COOP_ABANDONED_STRUCTURE_GRACE_MS,
  COOP_ARC_FENCE_PULSE_COOLDOWN_MS,
  COOP_ARC_FENCE_OVERCHARGE_MS,
  COOP_ARC_FENCE_SLOW_MULTIPLIER,
  COOP_DECOY_ATTRACT_RANGE,
  COOP_ELITE_SCRAP_ACCELERATION_MS,
  COOP_FABRICATOR_RECHARGE_MS,
  COOP_MAX_FABRICATOR_CHARGES,
  COOP_MAX_SQUAD_STRUCTURES,
  COOP_MAX_STRUCTURES_PER_PLAYER,
  COOP_RECOVERY_RELAY_REVIVE_MULTIPLIER,
  COOP_RECOVERY_RELAY_HEAL_PER_SECOND,
  COOP_RECOVERY_RELAY_SURGE_COOLDOWN_MS,
  COOP_RECOVERY_RELAY_SURGE_HEAL,
  COOP_STARTING_FABRICATOR_CHARGES,
  COOP_STRUCTURE_DEFINITIONS,
  COOP_STRUCTURE_DESTROY_MS,
  COOP_STRUCTURE_LIFETIME_MS,
  COOP_STRUCTURE_ACTION_RANGE,
  COOP_STRUCTURE_REPAIR_PER_SECOND,
  COOP_STRUCTURE_SQUAD_RANGE,
  COOP_TACTICAL_STRUCTURE_BONUS_MS,
  arcFenceShock,
  isCoopStructureType,
  isCoopStructureAction,
  isStructurePlacementClear,
  getBarricadeWallContact,
  normalizeStructureAngle,
  resolveBarricadeCollision,
  structureContainsCircle,
  structureDamagePerSecond,
  type CoopBuildAnchor,
  type CoopBuildError,
  type CoopDismantleError,
  type CoopStructureSnapshot,
  type CoopStructureAction,
  type CoopStructureActionError,
  type CoopStructureType,
} from './CoopFieldEngineering';

/** Multiplayer shares the production city's physical 12 km square. */
export const COOP_WORLD_SIZE = GAME_WIDTH;
export const COOP_BRIDGE_REQUIRED_SEGMENTS = 4;
export const COOP_BRIDGE_SEGMENT_LENGTH = 260;
export const COOP_BRIDGE_WIDTH = 170;
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
export const COOP_MANUAL_PICKUP_RANGE = 92;
export const COOP_MAX_WORLD_GEMS = 160;
export const COOP_MAX_WORLD_ITEMS = 48;
export const COOP_MAX_AMMO_CACHES = 32;
/** A calm staging window before the normal encounter director starts. */
export const COOP_SAFE_INSERTION_MS = COOP_INSERTION_DURATION_MS;
export const COOP_MAX_ENEMIES = 90;
export const COOP_MAX_ENCOUNTER_ENEMIES = 84;
const WEAPON_MAX_LEVEL = 8;
const SWITCH_MS = 280;
const ARC_CHAIN_RADIUS = 360;
const ARC_CHAIN_TARGETS = 3;
const ARC_CHAIN_DAMAGE_RATIO = .60;
const ARC_UNUSED_BOSS_DAMAGE_RATIO = .08;
const ARC_BEAM_RANGE = 1_900;
/** Damage traces begin at the authoritative player centre. Presentation may
 * still hide the first few centimetres inside the first-person viewmodel. */
const FIREARM_PROJECTILE_START_OFFSET = 0;
export const COOP_BLEED_OUT_MS = 20_000;
export const COOP_REVIVE_DURATION_MS = 3_000;
export const COOP_REVIVE_RANGE = 108;
export const COOP_REVIVE_HEALTH_RATIO = .35;
export const COOP_REVIVE_INVULNERABILITY_MS = 2_500;
export const COOP_GROUNDED_INTERACTION_MAX_Z = 20;
export const COOP_CONTACT_ATTACK_MAX_Z = 55;
const ARTIFACT_ZONE_CAP = 12;

export type CoopPlayerLifeState = 'alive' | 'downed' | 'eliminated' | 'extracted';
export type CoopMatchState = 'active' | 'mission_failed' | 'solo_defeat' | 'squad_wiped';

export interface CoopPlayerSeed { id: string; label: string; color: string; skinId?: CoopSkinId; operatorId?: CoopOperatorId; imprint?: CoopImprintLoadout; }

export interface CoopPlayerSnapshot extends CoopPlayerSeed {
  x: number;
  y: number;
  angle: number;
  health: number;
  maxHealth: number;
  movementMultiplier?: number;
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
  /** A hostage carrier is slowed and cannot operate a firearm. */
  carryingHostage?: boolean;
  privateExfilAvailable?: boolean;
  privateExfilCalled?: boolean;
  /** Personal, host-owned deployable resource. Teammates cannot spend it. */
  fabricatorCharges?: number;
  fabricatorRechargeRemainingMs?: number;
  artifactResource?: number;
  artifactResourceMax?: number;
  artifactResourceKind?: string;
  artifactProc?: string;
  artifactBarrier?: number;
  jetFuel?: number;
  jetActive?: boolean;
  lastProcessedInput?: number;
  lastProcessedFireAction?: number;
  motion?: Pick<PlayerMotionState, 'verticalVelocity' | 'lastJumpSequence' | 'lastWallJumpSequence' | 'lastDoubleJumpSequence' | 'wallJumpDirectionX' | 'wallJumpDirectionY' | 'airActionConsumedSinceGrounded' | 'jetIgnitedThisAirTime' | 'airborneMs' | 'groundedMs' | 'jetFuel' | 'jetActive' | 'slideAngle'>;
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
  chillStacks?: number;
  chillRemainingMs?: number;
  cinderhexStacks?: number;
  cinderhexRemainingMs?: number;
  missionId?: number;
  missionRole?: 'target' | 'guard' | 'courier';
  worldId?: WorldId;
  archetypeName?: string;
}

export interface CoopPrivateExfilSnapshot {
  x: number;
  y: number;
  radius: number;
  state: 'inbound' | 'active';
  arrivalRemainingMs: number;
  windowRemainingMs: number;
  holdProgressMs: number;
  holdRequiredMs: number;
}

export interface CoopArtifactEffectSnapshot {
  id: number;
  kind: 'stormcall' | 'dawnwall' | 'hellseed' | 'emberling';
  ownerId: string;
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
  targetEnemyId?: number;
  empowered?: boolean;
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
  /** Player-owned backpack loot never magnetizes or auto-collects. */
  manualDropKind?: CoopInventoryDropKind;
  droppedByPlayerId?: string;
}
export type CoopInventoryDropKind = 'cash' | 'self_revive';
export type CoopInventoryDropErrorCode = 'alive_required' | 'empty';
export interface CoopInventoryDropError { code: CoopInventoryDropErrorCode; }
export interface CoopAmmoCacheSnapshot { id: number; x: number; y: number; ammoType: AmmoType; amount: number; color: string; }

export type CoopCombatEventKind = 'enemy_hit' | 'enemy_killed' | 'damage_number' | 'drop_spawned' | 'pickup_collected' | 'level_up' | 'weapon_upgraded' | 'weapon_fired' | 'projectile_impact' | 'artifact_cast' | 'reload_started' | 'reload_shell_loaded' | 'reload_finished' | 'empty_fire' | 'ammo_collected' | 'player_damaged' | 'player_downed' | 'player_falling' | 'player_revived' | 'player_redeployed' | 'player_eliminated' | 'player_extracted' | 'revive_started' | 'squad_wiped' | 'solo_defeat' | 'station_online' | 'station_purchase' | 'foundry_online' | 'foundry_upgrade' | 'arc_beam' | 'arc_chain' | 'objective_started' | 'objective_completed' | 'mission_started' | 'mission_stage' | 'demolition_charge_planted' | 'demolition_charge_detonated' | 'mission_completed' | 'mission_expired' | 'boss_spawned' | 'boss_defeated' | 'boss_ability' | 'exfil_deployed' | 'private_exfil_inbound' | 'passive_triggered' | 'self_revived' | 'round_started' | 'round_completed' | 'gas_warning' | 'gas_spread' | 'gas_settled' | 'mask_broken' | 'mask_damaged' | 'gas_damaged' | 'structure_built' | 'structure_damaged' | 'structure_destroyed' | 'structure_dismantled' | 'structure_activated' | 'structure_healed' | 'fabricator_charged' | 'fabricator_scrap' | 'fence_triggered' | 'bridge_online' | 'bridge_segment_built' | 'bridge_completed' | 'world_transition' | 'ping';

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
  targetX?: number;
  targetY?: number;
  /** Surface contact data for cheap client-side bullet impact presentation. */
  z?: number;
  normalX?: number;
  normalY?: number;
  normalZ?: number;
  chainIndex?: number;
  structureId?: number;
  structureType?: CoopStructureType;
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
  /** Cosmetic cone particles replicate through the normal projectile renderer,
   * but never participate in host-authoritative damage or penetration. */
  presentationOnly?: boolean;
}

export interface CoopSnapshot {
  tick: number;
  elapsedMs: number;
  kills: number;
  /** Current authoritative frames include this; optional for older replays. */
  world?: CoopWorldSnapshot;
  bridge?: CoopWorldBridgeSnapshot;
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
  weaponFoundry?: CoopWeaponFoundrySnapshot;
  gasZone?: CoopGasZoneSnapshot;
  fieldMissions?: CoopFieldMissionsSnapshot;
  privateExfil?: CoopPrivateExfilSnapshot;
  results?: CoopRunResultsSnapshot;
  /** Present on current authoritative snapshots; optional for backward-compatible replay frames. */
  encounter?: EncounterDirectorSnapshot;
  hazards?: CoopHazardSnapshot[];
  pings?: CoopPing[];
  /** Optional only for replay compatibility; current authoritative frames always include it. */
  structures?: CoopStructureSnapshot[];
  artifactEffects?: CoopArtifactEffectSnapshot[];
  /** Owner commands that affect gameplay make career settlement ineligible. */
  administration?: { modified: boolean; lastAction?: string; paused?: boolean };
}

export interface CoopWorldSnapshot {
  id: WorldId;
  tier: number;
  name: string;
  elapsedMs: number;
}

export interface CoopWorldBridgeSnapshot {
  sourceWorldId: WorldId;
  destinationWorldId?: WorldId;
  state: 'locked' | 'building' | 'complete' | 'crossing' | 'terminal';
  builtSegments: number;
  requiredSegments: number;
  buildX: number;
  buildY: number;
  startX: number;
  endX: number;
  width: number;
}

type CoopPlayer = CoopPlayerSnapshot & { verticalVelocity: number; lastJumpSequence: number; lastWallJumpSequence: number; lastDoubleJumpSequence: number; wallJumpDirectionX: number; wallJumpDirectionY: number; airActionConsumedSinceGrounded: boolean; jetIgnitedThisAirTime: boolean; airborneMs: number; groundedMs: number; lastReloadSequence: number; lastFireActionId: number; lastAltFireActionId: number; lastInteractActionId: number; slideAngle: number; aimPitch: number; previousFiring: boolean; shotSequence: number; lastDamageEventAtMs: number; passiveRuntime: CoopPassiveRuntime[]; lastArmorDamageAtMs: number; lastGasNoticeAtMs: number; fabricatorRechargeAtMs: number; artifactTargetId?: number; artifactHitCount: number; artifactLastActionAtMs: number; artifactBarrierExpiresAtMs: number; artifactProcExpiresAtMs: number; lastArtifactX: number; lastArtifactY: number; slipstreamReadyAtMs: number; echoPositions: Array<{ x: number; y: number }> };
type CoopEnemy = CoopEnemySnapshot & { hitFlashUntilMs: number; deathUntilMs?: number; killedByPlayerId?: string; targetLeaseUntilMs: number; nextAttackAtMs?: number; structureStunUntilMs?: number; targetStructureId?: number; chillExpiresAtMs?: number; rimeGrantedAtMs?: number; missionAnchorX?: number; missionAnchorY?: number; cinderhexByOwner?: Map<string, { stacks: number; expiresAtMs: number; nextTickAtMs: number; damageSinceFragment: number }> };
type CoopProjectile = CoopProjectileSnapshot & {
  verticalVelocity: number;
  damage: number;
  penetration: number;
  damageIntervalMs: number;
  nextDamageAt: number;
};
type CoopStructure = CoopStructureSnapshot & {
  destroyAtMs?: number;
  contextKey: string;
  abandonedAtMs?: number;
  nextSupportPulseAtMs?: number;
  healingSincePulseByPlayer?: Record<string, number>;
};
type CoopArtifactEffect = CoopArtifactEffectSnapshot & { resolvesAtMs: number; nextTickAtMs: number; pulsesRemaining?: number };
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
  private readonly sweptEnemies: CoopEnemy[] = [];
  private readonly activeEnemyIds = new Set<number>();
  private enemies: CoopEnemy[] = [];
  private projectiles: CoopProjectile[] = [];
  private gems: CoopGemSnapshot[] = [];
  private items: CoopItemSnapshot[] = [];
  private ammoCaches: CoopAmmoCacheSnapshot[] = [];
  private combatEvents: CoopCombatEvent[] = [];
  private hazards: Array<CoopHazardSnapshot & { damage: number; resolved: boolean }> = [];
  private pings: CoopPing[] = [];
  private structures: CoopStructure[] = [];
  private artifactEffects: CoopArtifactEffect[] = [];
  private readonly fenceTriggerAt = new Map<string, number>();
  private readonly latestBuildRequestByPlayer = new Map<string, number>();
  private readonly latestDismantleRequestByPlayer = new Map<string, number>();
  private readonly latestStructureActionRequestByPlayer = new Map<string, number>();
  private nextPingId = 1;
  private matchState: CoopMatchState = 'active';
  private nextEntityId = 1;
  private nextCombatEventId = 1;
  private randomState: number;
  private encounterDirector!: EncounterDirector;
  private runDirector!: CoopRunDirector;
  private spawnTopology = new SpawnTopology();
  private stationDirector!: CoopStationDirector;
  private weaponFoundry!: CoopWeaponFoundry;
  private gasZone!: CoopGasZone;
  private fieldMissionDirector!: CoopFieldMissionDirector;
  private gasEnclave?: { missionSiteId: number; commanderId: number; guardIds: number[]; lastGasX: number; lastGasY: number };
  private privateExfil?: CoopPrivateExfilSnapshot;
  private privateExfilCalled = false;
  private readonly runStats = new Map<string, CoopPlayerRunStats>();
  private nextScenarioAtMs = 0;
  private bossEnemyId?: number;
  private nextBossAbilityAtMs = 0;
  private lastBossPhase = 0;
  private results?: CoopRunResultsSnapshot;
  private readonly runId: string;
  private elapsedMs = 0;
  private simulationTick = 0;
  private kills = 0;
  private killsSinceLastHeartDrop = 0;
  private adminModified = false;
  private lastAdminAction?: string;
  private currentWorldId: WorldId;
  private worldStartedAtMs = 0;
  private nextWorldHazardAtMs = 0;
  private worldHazardSequence = 0;
  private bridgeState: CoopWorldBridgeSnapshot;

  constructor(players: CoopPlayerSeed[], seed: number = 0xdecafbad, runId = `coop-${Date.now().toString(36)}-${(seed >>> 0).toString(36)}`, worldId: WorldId = 'neon_bastion') {
    this.randomState = seed >>> 0;
    this.runId = runId;
    this.currentWorldId = normalizeWorldId(worldId);
    players.forEach(player => this.addPlayer(player));
    this.bridgeState = this.createBridgeState('building');
    this.initializeWorldSystems(seed, true);
  }

  private initializeWorldSystems(seed: number, resetEntityIds = false) {
    // Only the active world's directors exist. A bridge crossing replaces
    // these compact systems and their entities instead of accumulating maps.
    // Station and Foundry ids occupy the first four deterministic entity slots.
    // Reset before creating the enclave because it now exists from world load.
    if (resetEntityIds) this.nextEntityId = COOP_STATION_COUNT + 2;
    this.gasEnclave = undefined;
    this.encounterDirector = new EncounterDirector(seed, COOP_SAFE_INSERTION_MS, getWorldDefinition(this.currentWorldId).difficulty.threatMultiplier);
    this.spawnTopology = new SpawnTopology(this.currentWorldId);
    const insertion = this.squadCentre();
    this.gasZone = new CoopGasZone(insertion, seed, this.currentWorldId);
    this.stationDirector = new CoopStationDirector(seed, insertion, { x: this.gasZone.x, y: this.gasZone.y }, this.currentWorldId);
    const foundrySite = generateCoopWeaponFoundrySite(seed, insertion, { x: this.gasZone.x, y: this.gasZone.y }, this.stationDirector.positions, this.currentWorldId);
    this.weaponFoundry = new CoopWeaponFoundry(COOP_STATION_COUNT + 1, foundrySite.x, foundrySite.y);
    this.fieldMissionDirector = new CoopFieldMissionDirector(seed, insertion, [...this.stationDirector.positions, foundrySite, { x: this.gasZone.x, y: this.gasZone.y }], this.currentWorldId);
    this.spawnGasEnclave();
    this.runDirector = new CoopRunDirector(seed, [...this.stationDirector.positions.map(site => ({ ...site, radius: 105 })), { ...foundrySite, radius: 180 }], this.currentWorldId);
    this.worldHazardSequence = 0;
    this.nextWorldHazardAtMs = this.elapsedMs + worldHazardIntervalMs(this.currentWorldId, true);
  }

  private createBridgeState(state: CoopWorldBridgeSnapshot['state']): CoopWorldBridgeSnapshot {
    const definition = getWorldDefinition(this.currentWorldId);
    const destinationWorldId = nextWorldId(this.currentWorldId);
    // The Worldlink begins at its authored dock, not at the global map edge.
    // Later worlds have irregular shorelines, so using a fixed x near the
    // arena edge left a genuine void between the terminal and the first span.
    // Keeping one player radius of overlap at the dock lets every completed
    // segment become traversable the instant its build event is accepted.
    const startX = definition.bridgehead.x;
    return {
      sourceWorldId: this.currentWorldId,
      destinationWorldId,
      state: destinationWorldId ? state : 'terminal',
      builtSegments: 0,
      requiredSegments: destinationWorldId ? COOP_BRIDGE_REQUIRED_SEGMENTS : 0,
      buildX: definition.bridgehead.x - 110,
      buildY: definition.bridgehead.y,
      startX,
      endX: startX + COOP_BRIDGE_REQUIRED_SEGMENTS * COOP_BRIDGE_SEGMENT_LENGTH,
      width: COOP_BRIDGE_WIDTH,
    };
  }

  private bridgeContains(x: number, y: number, radius = 0) {
    if (this.bridgeState.builtSegments <= 0) return false;
    const builtEnd = this.bridgeState.startX + this.bridgeState.builtSegments * COOP_BRIDGE_SEGMENT_LENGTH;
    return x >= this.bridgeState.startX - radius && x <= builtEnd + radius
      && Math.abs(y - this.bridgeState.buildY) <= this.bridgeState.width * .5 - radius;
  }

  private buildBridgeSegment(player: CoopPlayer, definition: typeof COOP_STRUCTURE_DEFINITIONS.bridge_segment): CoopBuildError | undefined {
    if (this.bridgeState.state === 'locked' || this.bridgeState.state === 'terminal') return { code: 'bridge_locked' };
    if (this.bridgeState.state === 'complete' || this.bridgeState.state === 'crossing') return { code: 'bridge_complete' };
    if (Math.hypot(player.x - this.bridgeState.buildX, player.y - this.bridgeState.buildY) > COOP_BUILD_RANGE + 180) return { code: 'bridge_range' };
    const charges = player.fabricatorCharges || 0;
    if (charges < definition.chargeCost) return { code: 'charges', amount: definition.chargeCost - charges };
    const index = this.bridgeState.builtSegments;
    const structure: CoopStructure = {
      id: this.nextEntityId++, type: 'bridge_segment', ownerId: player.id, ownerColor: player.color,
      x: Math.round(this.bridgeState.startX + COOP_BRIDGE_SEGMENT_LENGTH * (index + .5)), y: Math.round(this.bridgeState.buildY), angle: 0,
      health: definition.maxHealth, maxHealth: definition.maxHealth, state: 'active', createdAtMs: Math.round(this.elapsedMs),
      expiresAtMs: Math.round(this.elapsedMs + 86_400_000), contextKey: `worldlink:${this.currentWorldId}:${index}`,
    };
    this.structures.push(structure);
    this.bridgeState.builtSegments++;
    player.fabricatorCharges = charges - definition.chargeCost;
    if (charges >= COOP_MAX_FABRICATOR_CHARGES || player.fabricatorRechargeAtMs <= this.elapsedMs) player.fabricatorRechargeAtMs = this.elapsedMs + COOP_FABRICATOR_RECHARGE_MS;
    const stats = this.runStats.get(player.id); if (stats) stats.structuresBuilt++;
    this.emitCombatEvent({ kind: 'bridge_segment_built', x: structure.x, y: structure.y, playerId: player.id, structureId: structure.id, structureType: structure.type, amount: this.bridgeState.builtSegments, color: definition.color });
    if (this.bridgeState.builtSegments >= this.bridgeState.requiredSegments) {
      this.bridgeState.state = 'complete';
      this.emitCombatEvent({ kind: 'bridge_completed', x: this.bridgeState.endX, y: this.bridgeState.buildY, playerId: player.id, color: definition.color });
    }
    return undefined;
  }

  private transitionToNextWorld() {
    const destination = this.bridgeState.destinationWorldId;
    if (!destination || this.bridgeState.state !== 'complete') return;
    this.bridgeState.state = 'crossing';
    this.transitionToWorld(destination);
  }

  private transitionToWorld(destination: WorldId) {
    this.currentWorldId = destination;
    this.worldStartedAtMs = this.elapsedMs;
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.items = [];
    this.ammoCaches = [];
    this.hazards = [];
    this.pings = [];
    this.combatEvents = [];
    this.structures = [];
    this.artifactEffects = [];
    this.enemyNavigation.clear();
    this.enemySpatialIndex.rebuild([]);
    this.fenceTriggerAt.clear();
    this.privateExfil = undefined;
    this.privateExfilCalled = false;
    this.bossEnemyId = undefined;
    this.nextBossAbilityAtMs = 0;
    this.nextScenarioAtMs = 0;
    this.results = undefined;
    this.matchState = 'active';
    const insertion = { x: GAME_WIDTH / 2, y: GAME_WIDTH / 2 };
    const members = [...this.players.values()].filter(player => player.lifeState !== 'extracted');
    const insertionPackage = getWorldDefinition(destination).insertion;
    members.forEach((player, index) => {
      const angle = index / Math.max(1, members.length) * Math.PI * 2;
      const spawn = this.safeFallbackPosition(insertion.x + Math.cos(angle) * 65, insertion.y + Math.sin(angle) * 65, PLAYER_RADIUS);
      player.x = spawn.x; player.y = spawn.y; player.z = 0; player.verticalVelocity = 0;
      player.invulnerableRemainingMs = Math.max(player.invulnerableRemainingMs, 4_000);
      player.carryingHostage = false;
      for (const weapon of player.weaponStates) weapon.level = Math.max(weapon.level, insertionPackage.minimumWeaponLevel);
      player.weaponLevels = player.weaponStates.map(weapon => weapon.level);
      player.selectedWeaponLevel = player.weaponStates[player.selectedSlot]?.level || insertionPackage.minimumWeaponLevel;
      if (player.armorTier < insertionPackage.armorTier) {
        player.armorTier = insertionPackage.armorTier;
        player.armorHp = Math.max(player.armorHp, maxArmorHp(player.armorTier));
      }
      if (player.lifeState === 'downed') {
        player.lifeState = 'alive'; player.health = Math.max(1, player.maxHealth * .4); player.downedRemainingMs = 0;
      }
    });
    const tierSeed = (this.randomState ^ getWorldDefinition(destination).tier * 0x9e3779b9) >>> 0;
    this.initializeWorldSystems(tierSeed, false);
    this.bridgeState = this.createBridgeState('building');
    this.emitCombatEvent({ kind: 'world_transition', x: insertion.x, y: insertion.y, amount: getWorldDefinition(destination).tier, color: `#${getWorldDefinition(destination).theme.accentColor.toString(16).padStart(6, '0')}` });
  }

  private worldElapsedMs() { return Math.max(0, this.elapsedMs - this.worldStartedAtMs); }

  addPlayer(player: CoopPlayerSeed): boolean {
    if (this.matchState !== 'active' || this.players.has(player.id) || this.players.size >= 4) return false;
    const index = this.players.size;
    const angle = index * Math.PI / 2;
    const skinId = normalizeCoopSkinId(player.skinId);
    const operatorId = normalizeCoopOperatorId(player.operatorId, skinId);
    const operator = getCoopOperator(operatorId);
    const weaponStates = coopWeaponSlotsForSignature(operator.signatureWeaponId).map(createCoopWeaponRuntime);
    const insertion = getWorldDefinition(this.currentWorldId).insertion;
    for (const weapon of weaponStates) weapon.level = Math.max(weapon.level, insertion.minimumWeaponLevel);
    const imprint = normalizeCoopImprintLoadout(player.imprint);
    const modifiers = coopImprintModifiers(imprint.ranks);
    this.players.set(player.id, {
      ...player, skinId, operatorId, imprint, x: COOP_WORLD_SIZE / 2 + Math.cos(angle) * 100, y: COOP_WORLD_SIZE / 2 + Math.sin(angle) * 100,
      angle: 0, health: modifiers.maxHealth, maxHealth: modifiers.maxHealth, movementMultiplier: modifiers.movementMultiplier, selectedSlot: 0, z: 0, sprinting: false, sliding: false, crouching: false,
      level: 1, experience: 0, experienceToNextLevel: getRunXPRequired(1), coins: insertion.credits, pendingDataCores: 0,
      weaponStates, weaponLevels: weaponStates.map(state => state.level), selectedWeaponLevel: weaponStates[0]?.level || 1, selectedWeaponId: weaponStates[0]?.weaponId || 'plasma_gun', isAiming: false, isReloading: false, isSwitching: false,
      lifeState: 'alive', downedRemainingMs: 0, reviveProgressMs: 0, invulnerableRemainingMs: 0,
      selfRevives: 0, selfReviveProgressMs: 0, armorTier: insertion.armorTier, armorHp: maxArmorHp(insertion.armorTier), gasMaskHp: 0, gasMaskMaxHp: 150, passiveModules: [], fabricatorCharges: COOP_STARTING_FABRICATOR_CHARGES,
      artifactResource: 0, artifactResourceMax: operator.resourceMax, artifactResourceKind: operator.resource, artifactBarrier: 0, jetFuel: 100, jetActive: false,
      verticalVelocity: 0, lastJumpSequence: -1, lastWallJumpSequence: -1, lastDoubleJumpSequence: -1, wallJumpDirectionX: 0, wallJumpDirectionY: 0, airActionConsumedSinceGrounded: false, jetIgnitedThisAirTime: false, airborneMs: 0, groundedMs: 0, lastReloadSequence: -1, lastFireActionId: 0, lastAltFireActionId: 0, lastInteractActionId: 0, slideAngle: 0, aimPitch: 0, previousFiring: false, shotSequence: 0, lastDamageEventAtMs: -Infinity, passiveRuntime: [], lastArmorDamageAtMs: -Infinity, lastGasNoticeAtMs: -Infinity, fabricatorRechargeAtMs: COOP_FABRICATOR_RECHARGE_MS, artifactHitCount: 0, artifactLastActionAtMs: -Infinity, artifactBarrierExpiresAtMs: 0, artifactProcExpiresAtMs: 0, lastArtifactX: COOP_WORLD_SIZE / 2, lastArtifactY: COOP_WORLD_SIZE / 2, slipstreamReadyAtMs: 0, echoPositions: [],
    });
    this.runStats.set(player.id, createRunStats(player.id));
    return true;
  }

  getPlayerSeeds(): CoopPlayerSeed[] { return [...this.players.values()].map(({ id, label, color, skinId, operatorId, imprint }) => ({ id, label, color, skinId: normalizeCoopSkinId(skinId), operatorId: normalizeCoopOperatorId(operatorId, skinId), imprint: normalizeCoopImprintLoadout(imprint) })); }

  getWorldId() { return this.currentWorldId; }

  /** Owner testing shortcut. A world is session-global, so this deliberately
   * moves the entire squad and rebuilds every active-world authority system. */
  adminSetWorld(destination: WorldId) {
    if (destination === this.currentWorldId) return false;
    this.transitionToWorld(destination);
    this.markAdminModified(`teleported squad to ${getWorldDefinition(destination).name}`);
    return true;
  }

  /** Explicit, bounded owner mutations. Network commands never receive direct
   * access to simulation collections or private encounter directors. */
  adminHeal(playerIds: readonly string[], amount?: number) {
    let changed = 0;
    for (const id of playerIds) {
      const player = this.players.get(id);
      if (!player || player.lifeState !== 'alive') continue;
      const next = amount === undefined ? player.maxHealth : Math.min(player.maxHealth, player.health + Math.max(0, amount));
      if (next <= player.health) continue;
      player.health = next; changed++;
    }
    if (changed) this.markAdminModified(`healed ${changed} operator${changed === 1 ? '' : 's'}`);
    return changed;
  }

  adminRevive(playerIds: readonly string[]) {
    let changed = 0;
    for (const id of playerIds) {
      const player = this.players.get(id);
      if (!player || (player.lifeState !== 'downed' && player.lifeState !== 'eliminated')) continue;
      const spawn = this.safeFallbackPosition(player.x, player.y, PLAYER_RADIUS);
      player.x = spawn.x; player.y = spawn.y; player.z = 0; player.verticalVelocity = 0;
      player.lifeState = 'alive'; player.health = player.maxHealth * COOP_REVIVE_HEALTH_RATIO;
      player.downedRemainingMs = 0; player.reviveProgressMs = 0; player.selfReviveProgressMs = 0; player.reviverId = undefined;
      player.invulnerableRemainingMs = COOP_REVIVE_INVULNERABILITY_MS;
      this.emitCombatEvent({ kind: 'player_redeployed', x: player.x, y: player.y, playerId: player.id, color: player.color });
      changed++;
    }
    if (changed) {
      this.results = undefined;
      this.matchState = 'active';
      this.markAdminModified(`revived ${changed} operator${changed === 1 ? '' : 's'}`);
    }
    return changed;
  }

  adminGive(playerIds: readonly string[], resource: 'credits' | 'cores' | 'ammo' | 'fabricator' | 'selfrevive', amount?: number) {
    let changed = 0;
    for (const id of playerIds) {
      const player = this.players.get(id);
      if (!player) continue;
      if (resource === 'credits') player.coins = amount === undefined ? 9_999_999 : Math.min(9_999_999, player.coins + Math.max(0, Math.trunc(amount)));
      else if (resource === 'cores') player.pendingDataCores = amount === undefined ? 99_999 : Math.min(99_999, player.pendingDataCores + Math.max(0, Math.trunc(amount)));
      else if (resource === 'fabricator') player.fabricatorCharges = amount === undefined ? COOP_MAX_FABRICATOR_CHARGES : Math.min(COOP_MAX_FABRICATOR_CHARGES, (player.fabricatorCharges || 0) + Math.max(0, Math.trunc(amount)));
      else if (resource === 'selfrevive') player.selfRevives = amount === undefined ? 9 : Math.min(9, player.selfRevives + Math.max(0, Math.trunc(amount)));
      else for (const weapon of player.weaponStates) weapon.reserveAmmo = COOP_FIREARM_BY_ID[weapon.weaponId].maxReserve;
      changed++;
    }
    if (changed) this.markAdminModified(`granted ${resource} to ${changed} operator${changed === 1 ? '' : 's'}`);
    return changed;
  }

  adminTeleport(playerIds: readonly string[], x: number, y: number) {
    let changed = 0;
    for (let index = 0; index < playerIds.length; index++) {
      const player = this.players.get(playerIds[index]);
      if (!player || player.lifeState === 'extracted') continue;
      const angle = index * Math.PI * 2 / Math.max(1, playerIds.length);
      const position = this.safeFallbackPosition(x + Math.cos(angle) * Math.min(55, playerIds.length * 14), y + Math.sin(angle) * Math.min(55, playerIds.length * 14), PLAYER_RADIUS);
      player.x = position.x; player.y = position.y; player.z = 0; player.verticalVelocity = 0;
      changed++;
    }
    if (changed) this.markAdminModified(`teleported ${changed} operator${changed === 1 ? '' : 's'}`);
    return changed;
  }

  adminSpawn(type: keyof typeof ENEMY_TYPES, count: number, nearPlayerId?: string) {
    const target = this.players.get(nearPlayerId || '') || [...this.players.values()].find(player => player.lifeState === 'alive');
    if (!target) return 0;
    const allowed = Math.max(0, Math.min(40, COOP_MAX_ENEMIES - this.enemies.length, Math.trunc(count)));
    for (let index = 0; index < allowed; index++) {
      const angle = index / Math.max(1, allowed) * Math.PI * 2;
      const distance = ENEMY_TYPES[type].radius + 260 + (index % 4) * 45;
      const position = this.safeFallbackPosition(target.x + Math.cos(angle) * distance, target.y + Math.sin(angle) * distance, ENEMY_TYPES[type].radius);
      this.spawnEnemy(type, target.id, -1, position);
    }
    if (allowed) this.markAdminModified(`spawned ${allowed} ${type}`);
    return allowed;
  }

  adminKillAll() {
    const targets = this.enemies.filter(enemy => !enemy.dying);
    const count = targets.length;
    const ownerId = [...this.players.keys()][0] || 'owner';
    for (const enemy of targets) this.killEnemy(enemy, ownerId);
    const clearedIds = new Set(targets.map(enemy => enemy.id));
    this.enemies = this.enemies.filter(enemy => !clearedIds.has(enemy.id));
    this.projectiles = [];
    this.hazards = [];
    if (count) this.markAdminModified(`cleared ${count} hostiles`);
    return count;
  }

  private markAdminModified(action: string) {
    this.adminModified = true;
    this.lastAdminAction = action;
  }

  updatePlayerImprint(playerId: string, value: unknown) {
    // Imprints are immutable during combat. They may only change after an
    // authoritative terminal result or during the next safe insertion.
    if (!this.results && (this.runDirector.currentPhase !== 'insertion' || this.elapsedMs > COOP_INSERTION_DURATION_MS)) return false;
    const player = this.players.get(playerId);
    if (!player) return false;
    const imprint = normalizeCoopImprintLoadout(value, player.imprint?.operatorId);
    player.imprint = imprint;
    const modifiers = coopImprintModifiers(imprint.ranks);
    const healthRatio = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
    player.maxHealth = modifiers.maxHealth;
    player.health = player.lifeState === 'alive' ? Math.max(1, player.maxHealth * healthRatio) : 0;
    player.movementMultiplier = modifiers.movementMultiplier;
    return true;
  }

  /** Remove a disconnected guest without ending the host's surviving run. */
  removePlayer(playerId: string): boolean {
    if (!this.players.has(playerId)) return false;
    const leaving = this.players.get(playerId);
    const hostage = this.fieldMissionDirector.current?.hostage;
    if (leaving?.carryingHostage && hostage?.carrierId === playerId) {
      hostage.x = leaving.x; hostage.y = leaving.y; hostage.carrierId = undefined; hostage.state = 'waiting';
      const mission = this.fieldMissionDirector.current!;
      mission.x = hostage.x; mission.y = hostage.y; mission.progress = 0; mission.required = COOP_HOSTAGE_FREE_DURATION_MS;
      mission.points[0].state = 'arming'; mission.points[1].state = 'locked';
      this.emitCombatEvent({ kind: 'mission_stage', x: hostage.x, y: hostage.y, playerId, amount: -2, color: '#fbbf24' });
    }
    this.players.delete(playerId);
    this.inputByPlayer.delete(playerId);
    this.latestInputSequence.delete(playerId);
    this.inputReceivedAtMs.delete(playerId);
    this.inputAgeMs.delete(playerId);
    this.latestBuildRequestByPlayer.delete(playerId);
    this.latestDismantleRequestByPlayer.delete(playerId);
    this.latestStructureActionRequestByPlayer.delete(playerId);
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
    retainInPlace(this.pings, ping => ping.expiresAtMs > this.elapsedMs);

    if (this.matchState !== 'active' || this.results) {
      retainInPlace(this.combatEvents, event => this.elapsedMs - event.atMs <= COMBAT_EVENT_RETENTION_MS);
      return;
    }

    // Remote-shot compensation runs during input processing, so seed the
    // broad phase before any player can fire this tick.
    this.enemySpatialIndex.rebuild(this.enemies);
    let bridgeCrossed = false;
    for (const player of this.players.values()) {
      const receivedAt = this.inputReceivedAtMs.get(player.id);
      const storedInput = this.inputByPlayer.get(player.id);
      const stale = storedInput && (receivedAt === undefined || this.elapsedMs - receivedAt > COOP_STALE_INPUT_MS);
      const rawInput = stale ? { ...storedInput, movement: 0, firing: false, aiming: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, jetHeld: false, reloadPressed: false, dashPressed: false } : storedInput;
      const input = rawInput && player.carryingHostage
        ? { ...rawInput, firing: false, aiming: false, sprinting: false, sliding: false, jetHeld: false, dashPressed: false, reloadPressed: false, altFireActionId: player.lastAltFireActionId }
        : rawInput;
      player.invulnerableRemainingMs = Math.max(0, player.invulnerableRemainingMs - dt);
      if (player.artifactBarrier > 0 && this.elapsedMs >= player.artifactBarrierExpiresAtMs) player.artifactBarrier = Math.max(0, player.artifactBarrier - 8 * seconds);
      if (player.artifactProc && this.elapsedMs >= player.artifactProcExpiresAtMs) player.artifactProc = undefined;
      if (player.operatorId === 'crimson_strike' && this.elapsedMs - player.artifactLastActionAtMs > 6_000) player.artifactResource = Math.max(0, player.artifactResource - 12 * seconds);
      if (player.operatorId === 'void_runner' && this.elapsedMs - player.artifactLastActionAtMs > 5_000) { player.artifactResource = 0; player.artifactTargetId = undefined; }
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
      if (player.lifeState === 'eliminated' || player.lifeState === 'extracted') continue;
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
        advancePlayerMovement(
          player,
          input,
          dt,
          (position, radius) => this.resolvePlayerStructureCollisions(position, player.z, radius),
          (position, radius) => this.getPlayerStructureWallContact(position, player.z, radius),
          this.currentWorldId,
        );
        if (Math.hypot(player.x - player.lastArtifactX, player.y - player.lastArtifactY) >= 60) {
          player.echoPositions.push({ x: player.x, y: player.y });
          if (player.echoPositions.length > 5) player.echoPositions.shift();
          player.lastArtifactX = player.x; player.lastArtifactY = player.y;
        }
        if (this.bridgeState.state === 'complete' && this.bridgeContains(player.x, player.y, PLAYER_RADIUS) && player.x >= this.bridgeState.endX - 70) bridgeCrossed = true;
        if (!isOnCoopPlatform(player.x, player.y, this.currentWorldId) && !this.bridgeContains(player.x, player.y, PLAYER_RADIUS)) {
          this.emitCombatEvent({ kind: 'player_falling', x: player.x, y: player.y, playerId: player.id, color: player.color });
          this.eliminatePlayer(player, 'fell from platform');
          continue;
        }
        const surface = sampleWorldSurface(this.currentWorldId, player.x, player.y);
        if (surface.damagePerSecond > 0) this.damagePlayer(player, surface.damagePerSecond * seconds, player.x, player.y);
        player.aimPitch = dequantizePitch(input.aimPitch);
        const requestedSlot = clamp(Math.trunc(input.selectedSlot), 0, player.weaponStates.length - 1);
        if (requestedSlot !== player.selectedSlot && !player.isSwitching) this.switchWeapon(player, requestedSlot);
        player.selectedWeaponId = this.weapon(player).weaponId;
        player.selectedWeaponLevel = this.weapon(player).level;
        player.isAiming = Boolean(input.aiming) && player.selectedSlot !== 3 && player.selectedWeaponId !== 'combat_shotgun' && !player.isReloading;
        if (input.reloadPressed && input.sequence !== player.lastReloadSequence) { player.lastReloadSequence = input.sequence; this.startReload(player); }
        this.advanceWeaponActions(player);
        const fireActionId = input.fireActionId || 0;
        const triggerPressed = fireActionId > player.lastFireActionId || (input.fireActionId === undefined && input.firing && !player.previousFiring);
        if (fireActionId > player.lastFireActionId) player.lastFireActionId = fireActionId;
        player.lastProcessedFireAction = player.lastFireActionId;
        const altFireActionId = input.altFireActionId || 0;
        if (altFireActionId > player.lastAltFireActionId) {
          player.lastAltFireActionId = altFireActionId;
          if (player.selectedSlot === 3) this.tryArtifactSpender(player);
        }
        const interactActionId = input.interactActionId || 0;
        if (interactActionId > player.lastInteractActionId) {
          player.lastInteractActionId = interactActionId;
          this.handleFieldInteraction(player);
        }
        if (input.firing && (COOP_FIREARM_BY_ID[this.weapon(player).weaponId].fireMode === 'auto' || triggerPressed)) this.tryCastWeapon(player, triggerPressed, fireActionId);
        player.previousFiring = input.firing;
      }
      if (!input) advancePlayerMovement(player, undefined, dt, undefined, undefined, this.currentWorldId);
    }

    if (bridgeCrossed) {
      this.transitionToNextWorld();
      return;
    }

    this.updateRun(dt);
    const gasEvent = this.gasZone.tick(dt, this.elapsedMs);
    if (gasEvent.warningTriggered) {
      this.emitCombatEvent({ kind: 'gas_warning', x: this.gasZone.x, y: this.gasZone.y, color: '#f59e0b', amount: 12 });
    }
    if (gasEvent.spreadTriggered) {
      this.emitCombatEvent({ kind: 'gas_spread', x: this.gasZone.x, y: this.gasZone.y, color: '#4ade80', amount: this.gasZone.radius });
    }
    if (gasEvent.settledTriggered) this.emitCombatEvent({ kind: 'gas_settled', x: this.gasZone.x, y: this.gasZone.y, color: '#86efac' });
    this.updateGasEnclave();
    this.updateWorldHazards();
    this.updateFieldMission(dt);
    this.updateMissionPings();
    this.updatePrivateExfil(dt);
    if (this.results) return;
    this.updateArtifactEffects(dt);
    this.updateArtifactStatuses();
    this.updatePassiveModules();
    this.scheduleEncounters();
    this.updateStructures(dt);
    // Scheduling may add a packet. One linear rebuild replaces the former
    // all-enemies separation scan performed by every moving enemy.
    this.enemySpatialIndex.rebuild(this.enemies);

    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const hasMissionAnchor = (enemy.missionRole === 'guard' || enemy.missionRole === 'courier')
        && Number.isFinite(enemy.missionAnchorX) && Number.isFinite(enemy.missionAnchorY);
      const missionAnchor = hasMissionAnchor ? { x: enemy.missionAnchorX!, y: enemy.missionAnchorY! } : undefined;
      const nearestIntruder = missionAnchor ? this.closestLivingPlayer(missionAnchor.x, missionAnchor.y) : undefined;
      const holdingMissionPosition = Boolean(missionAnchor && (!nearestIntruder || Math.hypot(nearestIntruder.x - missionAnchor.x, nearestIntruder.y - missionAnchor.y) > 700));
      const target = holdingMissionPosition ? missionAnchor : this.resolveEnemyTarget(enemy);
      if (!target) continue;
      const targetStructure = 'type' in target && isCoopStructureType(target.type) ? target as CoopStructure : undefined;
      const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
      enemy.facingAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      const windingUp = (enemy.attackWindupUntilMs || 0) > this.elapsedMs;
      let structureStunned = (enemy.structureStunUntilMs || 0) > this.elapsedMs;
      const navigation = this.enemyNavigation.get(enemy.id) || { x: enemy.x, y: enemy.y, stuckMs: 0, waypointUntilMs: 0 };
      // A clear-path result has no tactical effect outside the ability's
      // maximum range, so never ray-march across kilometres of city.
      const needsAttackPath = (enemy.type === 'ranged' && distance <= ENEMY_ATTACK_PROFILES.ranged!.maxRange)
        || (enemy.type === 'phantom' && distance <= ENEMY_ATTACK_PROFILES.phantom!.maxRange)
        || (enemy.type === 'elite' && distance <= ENEMY_ATTACK_PROFILES.elite!.maxRange);
      if (needsAttackPath && this.elapsedMs >= (navigation.nextPathCheckAtMs || 0)) {
        navigation.clearAttackPath = hasClearAttackPath(enemy, target, this.currentWorldId);
        // Stagger checks so a horde does not submit every world probe in one tick.
        navigation.nextPathCheckAtMs = this.elapsedMs + 180 + enemy.id % 5 * 17;
      }
      const clearAttackPath = !needsAttackPath || Boolean(navigation.clearAttackPath);
      const waypointReached = navigation.waypoint && Math.hypot(enemy.x - navigation.waypoint.x, enemy.y - navigation.waypoint.y) <= enemy.radius + 28;
      if (waypointReached || this.elapsedMs >= navigation.waypointUntilMs) navigation.waypoint = undefined;
      const travelTarget = navigation.waypoint || target;
      if (!windingUp && !structureStunned && distance > PLAYER_RADIUS + enemy.radius) {
        const neighbors = this.enemySpatialIndex.query(enemy.x, enemy.y, enemy.radius + MAX_ENEMY_RADIUS + 48, this.nearbyEnemies);
        const fenceSlowed = this.structures.some(structure => structure.type === 'arc_fence' && structure.state !== 'destroying'
          && structureContainsCircle(structure, enemy.x, enemy.y, enemy.radius));
        enemy.facingAngle = moveTacticalEnemy(enemy, travelTarget, neighbors, this.elapsedMs, fenceSlowed ? dt * COOP_ARC_FENCE_SLOW_MULTIPLIER : dt, clearAttackPath, this.currentWorldId);
      }
      this.updateEnemyStructureInteractions(enemy, dt);
      structureStunned = (enemy.structureStunUntilMs || 0) > this.elapsedMs;
      const progress = Math.hypot(enemy.x - navigation.x, enemy.y - navigation.y);
      navigation.stuckMs = !windingUp && distance > 240 && progress < .2 ? navigation.stuckMs + dt : 0;
      navigation.x = enemy.x; navigation.y = enemy.y;
      if (navigation.stuckMs >= 700) {
        navigation.waypoint = findEnemyDetour(enemy, target, this.currentWorldId);
        navigation.waypointUntilMs = this.elapsedMs + 2_200;
        navigation.stuckMs = 0;
      }
      this.enemyNavigation.set(enemy.id, navigation);
      if (!holdingMissionPosition && !structureStunned && enemy.type === 'ranged' && distance >= ENEMY_ATTACK_PROFILES.ranged!.minRange && distance <= ENEMY_ATTACK_PROFILES.ranged!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0) && clearAttackPath) {
        const attack = worldEnemyAttack(this.currentWorldId, 'ranged', ENEMY_ATTACK_PROFILES.ranged!);
        this.queueHazard(enemy, attack.kind, target.x, target.y, attack.radius, enemy.damage * attack.damageMultiplier, attack.windupMs, attack.color);
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs + enemy.id % 5 * 150;
      } else if (!holdingMissionPosition && !structureStunned && enemy.type === 'tank' && distance >= ENEMY_ATTACK_PROFILES.tank!.minRange && distance <= ENEMY_ATTACK_PROFILES.tank!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0)) {
        const attack = worldEnemyAttack(this.currentWorldId, 'tank', ENEMY_ATTACK_PROFILES.tank!);
        this.queueHazard(enemy, attack.kind, enemy.x, enemy.y, attack.radius, enemy.damage * attack.damageMultiplier, attack.windupMs, attack.color);
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs;
      } else if (!holdingMissionPosition && !structureStunned && enemy.type === 'phantom' && distance >= ENEMY_ATTACK_PROFILES.phantom!.minRange && distance <= ENEMY_ATTACK_PROFILES.phantom!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0) && clearAttackPath) {
        const attack = worldEnemyAttack(this.currentWorldId, 'phantom', ENEMY_ATTACK_PROFILES.phantom!);
        this.queueHazard(enemy, attack.kind, target.x, target.y, attack.radius, Math.max(16, enemy.damage * attack.damageMultiplier), attack.windupMs, attack.color);
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs;
      } else if (!holdingMissionPosition && !structureStunned && enemy.type === 'elite' && distance >= ENEMY_ATTACK_PROFILES.elite!.minRange && distance <= ENEMY_ATTACK_PROFILES.elite!.maxRange && !windingUp && this.elapsedMs >= (enemy.nextAttackAtMs || 0) && clearAttackPath) {
        const attack = worldEnemyAttack(this.currentWorldId, 'elite', ENEMY_ATTACK_PROFILES.elite!);
        this.queueHazard(enemy, attack.kind, target.x, target.y, attack.radius, Math.max(24, enemy.damage * attack.damageMultiplier), attack.windupMs, attack.color);
        enemy.nextAttackAtMs = this.elapsedMs + attack.cooldownMs;
      } else if (!holdingMissionPosition && !structureStunned && !windingUp && enemy.type !== 'ranged' && enemy.type !== 'tank' && distance <= PLAYER_RADIUS + enemy.radius) {
        if (targetStructure) this.damageStructure(targetStructure, enemy.damage * seconds);
        else if ((target as CoopPlayer).z <= COOP_CONTACT_ATTACK_MAX_Z) this.damagePlayer(target as CoopPlayer, enemy.damage * seconds, enemy.x, enemy.y);
      }
      if (enemy.id === this.bossEnemyId) this.runDirector.updateBoss(enemy.health, enemy.x, enemy.y);
      this.runDirector.trackEliteTarget(enemy.id, enemy.x, enemy.y);
    }
    // Combat AI can pursue intruders, but the whole enclave remains physically
    // inside the moving gas instead of being left behind by its next patrol.
    this.constrainGasEnclave();
    this.activeEnemyIds.clear();
    for (const enemy of this.enemies) if (!enemy.dying) this.activeEnemyIds.add(enemy.id);
    this.updateHazards();
    // Movement changes bucket membership; projectile collision uses the new
    // authoritative positions rather than the broad phase from tick start.
    this.enemySpatialIndex.rebuild(this.enemies);

    for (const projectile of this.projectiles) {
      const owner = this.players.get(projectile.ownerId);
      const previousX = projectile.x, previousY = projectile.y, previousZ = projectile.z;
      const firearmProjectile = isCoopFirearmId(projectile.weaponId, COOP_FIREARM_IDS);
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
      const blockedByWorld = firearmProjectile && this.clipFirearmSegmentToWorld(projectile, previousX, previousY, previousZ);
      projectile.lifeMs -= dt;
      if (projectile.presentationOnly) {
        if (blockedByWorld) projectile.lifeMs = 0;
        continue;
      }
      if (this.elapsedMs < projectile.nextDamageAt) continue;
      projectile.nextDamageAt = this.elapsedMs + projectile.damageIntervalMs;
      // Projectiles only hit an enemy when their 3D height crosses its body.
      // Aiming into the sky therefore flies over the horde; aiming at their
      // torso retains the usual generous FPS hit volume.
      const candidates = firearmProjectile
        ? this.sweptFirearmHits(projectile, previousX, previousY, previousZ)
        : this.enemySpatialIndex.query(projectile.x, projectile.y, projectile.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies);
      for (const enemy of candidates) {
        if (enemy.dying) continue;
        if (!firearmProjectile) {
          const dx = enemy.x - projectile.x, dy = enemy.y - projectile.y;
          const hitRadius = enemy.radius + projectile.radius;
          const horizontalHit = dx * dx + dy * dy < hitRadius * hitRadius;
          const verticalHit = projectile.z >= -projectile.radius && projectile.z <= ENEMY_HIT_HEIGHT + enemy.radius + projectile.radius;
          if (!horizontalHit || !verticalHit) continue;
        }
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
      if (projectile.penetration <= 0 || blockedByWorld) projectile.lifeMs = 0;
    }
    // Knockback and gravity weapons resolve after enemy movement; re-apply the
    // enclave leash so those effects cannot leave its gas shelter between
    // authoritative ticks.
    this.constrainGasEnclave();
    this.updateRevives(dt);
    this.finalizeDefeatIfNeeded();
    this.updateDrops(seconds);
    retainInPlace(this.enemies, enemy => !enemy.dying || (enemy.deathUntilMs || 0) > this.elapsedMs);
    this.activeEnemyIds.clear();
    for (const enemy of this.enemies) this.activeEnemyIds.add(enemy.id);
    for (const id of this.enemyNavigation.keys()) if (!this.activeEnemyIds.has(id)) this.enemyNavigation.delete(id);
    retainInPlace(this.combatEvents, event => this.elapsedMs - event.atMs <= COMBAT_EVENT_RETENTION_MS);
    retainInPlace(this.projectiles, projectile => projectile.lifeMs > 0
      && projectile.z > -projectile.radius && projectile.z < 1800
      && projectile.x > -100 && projectile.y > -100 && projectile.x < COOP_WORLD_SIZE + 100 && projectile.y < COOP_WORLD_SIZE + 100);
  }

  createSnapshot(): CoopSnapshot {
    const world = getWorldDefinition(this.currentWorldId);
    return {
      tick: this.simulationTick, elapsedMs: Math.round(this.elapsedMs), kills: this.kills,
      world: { id: world.id, tier: world.tier, name: world.name, elapsedMs: Math.round(this.elapsedMs - this.worldStartedAtMs) },
      bridge: { ...this.bridgeState },
      players: [...this.players.values()].map(({ verticalVelocity, lastJumpSequence, lastWallJumpSequence, lastDoubleJumpSequence, wallJumpDirectionX, wallJumpDirectionY, airActionConsumedSinceGrounded, jetIgnitedThisAirTime, airborneMs, groundedMs, lastReloadSequence: _lastReloadSequence, lastFireActionId: _lastFireActionId, lastAltFireActionId: _lastAltFireActionId, lastInteractActionId: _lastInteractActionId, slideAngle, aimPitch: _aimPitch, previousFiring: _previousFiring, shotSequence: _shotSequence, lastDamageEventAtMs: _lastDamageEventAtMs, passiveRuntime: _passiveRuntime, lastArmorDamageAtMs: _lastArmorDamageAtMs, fabricatorRechargeAtMs, artifactTargetId: _artifactTargetId, artifactHitCount: _artifactHitCount, artifactLastActionAtMs: _artifactLastActionAtMs, artifactBarrierExpiresAtMs: _artifactBarrierExpiresAtMs, artifactProcExpiresAtMs: _artifactProcExpiresAtMs, lastArtifactX: _lastArtifactX, lastArtifactY: _lastArtifactY, slipstreamReadyAtMs: _slipstreamReadyAtMs, echoPositions: _echoPositions, ...player }) => ({ ...player, privateExfilAvailable: this.fieldMissionDirector.completions > 0 || this.runDirector.snapshot(this.elapsedMs).contractIndex > 0, privateExfilCalled: this.privateExfilCalled, fabricatorRechargeRemainingMs: this.results || player.fabricatorCharges === COOP_MAX_FABRICATOR_CHARGES ? 0 : Math.max(0, fabricatorRechargeAtMs - this.elapsedMs), motion: { verticalVelocity, lastJumpSequence, lastWallJumpSequence, lastDoubleJumpSequence, wallJumpDirectionX, wallJumpDirectionY, airActionConsumedSinceGrounded, jetIgnitedThisAirTime, airborneMs, groundedMs, jetFuel: player.jetFuel, jetActive: player.jetActive, slideAngle }, passiveModules: player.passiveModules.map(module => ({ ...module })), weaponStates: player.weaponStates.map(state => ({ ...state })), weaponLevels: player.weaponStates.map(state => state.level) })),
      enemies: this.enemies.map(({ hitFlashUntilMs, deathUntilMs, killedByPlayerId: _killedBy, targetLeaseUntilMs: _lease, nextAttackAtMs: _nextAttack, targetStructureId: _targetStructureId, structureStunUntilMs: _structureStunUntilMs, chillExpiresAtMs: _chillExpiresAtMs, rimeGrantedAtMs: _rimeGrantedAtMs, missionAnchorX: _missionAnchorX, missionAnchorY: _missionAnchorY, cinderhexByOwner: _cinderhexByOwner, ...enemy }) => ({
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
      run: this.runDirector.snapshot(Math.round(this.worldElapsedMs())),
      buyStations: this.stationDirector.snapshot(),
      weaponFoundry: this.weaponFoundry.snapshot(),
      gasZone: this.gasZone.snapshot(Math.round(this.elapsedMs)),
      fieldMissions: this.fieldMissionDirector.snapshot(),
      privateExfil: this.privateExfil && { ...this.privateExfil },
      results: this.results && { ...this.results, players: this.results.players.map(player => ({ ...player, passiveDamageById: { ...player.passiveDamageById } })) },
      encounter: this.encounterDirector.snapshot(buildEncounterClusters(this.encounterPlayers(), this.encounterEnemies()).length),
      hazards: this.hazards.map(({ damage: _damage, resolved: _resolved, ...hazard }) => ({ ...hazard })),
      pings: this.pings.map(ping => ({
        ...ping,
        remainingMs: Math.max(0, ping.expiresAtMs - Math.round(this.elapsedMs)),
      })),
      structures: this.structures.map(({ destroyAtMs, contextKey: _contextKey, abandonedAtMs: _abandonedAtMs, nextSupportPulseAtMs: _nextSupportPulseAtMs, healingSincePulseByPlayer: _healingSincePulseByPlayer, ...structure }) => ({
        ...structure,
        destroyRemainingMs: structure.state === 'destroying' ? Math.max(0, (destroyAtMs || this.elapsedMs) - this.elapsedMs) : undefined,
      })),
      artifactEffects: this.artifactEffects.map(effect => ({ id: effect.id, kind: effect.kind, ownerId: effect.ownerId, x: effect.x, y: effect.y, radius: effect.radius, remainingMs: effect.remainingMs, targetEnemyId: effect.targetEnemyId, empowered: effect.empowered })),
      administration: { modified: this.adminModified, lastAction: this.lastAdminAction },
    };
  }

  /** Host-authoritative field fabrication. A client supplies intent and a
   * hologram pose; the simulation repeats every spatial and economy check. */
  buildStructure(playerId: string, requestedType: unknown, requestedX: number, requestedY: number, requestedAngle: number, requestId?: number): CoopBuildError | undefined {
    const player = this.players.get(playerId);
    if (!player || player.lifeState !== 'alive' || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    if (!this.acceptEngineeringRequest(this.latestBuildRequestByPlayer, playerId, requestId)) return { code: 'stale_request' };
    if (!isCoopStructureType(requestedType)) return { code: 'invalid_blueprint' };
    const definition = COOP_STRUCTURE_DEFINITIONS[requestedType];
    if (requestedType === 'bridge_segment') return this.buildBridgeSegment(player, definition);
    const charges = player.fabricatorCharges || 0;
    if (charges < definition.chargeCost) return { code: 'charges', amount: definition.chargeCost - charges };
    const activeStructures = this.structures.filter(structure => structure.state !== 'destroying' && structure.type !== 'bridge_segment');
    if (activeStructures.filter(structure => structure.ownerId === playerId).length >= COOP_MAX_STRUCTURES_PER_PLAYER) return { code: 'player_limit' };
    if (activeStructures.length >= COOP_MAX_SQUAD_STRUCTURES) return { code: 'squad_limit' };
    const x = Number(requestedX), y = Number(requestedY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - player.x, y - player.y) > COOP_BUILD_RANGE) return { code: 'range' };
    if (!isOnCoopPlatform(x, y, this.currentWorldId)) return { code: 'obstructed' };
    const anchor = this.closestBuildAnchor(x, y);
    const tacticalBonus = Boolean(anchor && Math.hypot(x - anchor.x, y - anchor.y) <= (anchor.radius || COOP_BUILD_ZONE_RADIUS));
    const angle = normalizeStructureAngle(requestedAngle);
    const protectedBodies = [
      ...[...this.players.values()].filter(member => member.lifeState !== 'eliminated' && member.lifeState !== 'extracted').map(member => ({ x: member.x, y: member.y, radius: PLAYER_RADIUS })),
      ...this.enemies.filter(enemy => !enemy.dying).map(enemy => ({ x: enemy.x, y: enemy.y, radius: enemy.radius })),
      ...this.protectedBuildBodies(),
    ];
    if (!isStructurePlacementClear(requestedType, x, y, angle, protectedBodies, activeStructures, this.currentWorldId)) return { code: 'obstructed' };
    const structure: CoopStructure = {
      id: this.nextEntityId++, type: requestedType, ownerId: player.id, ownerColor: player.color,
      x: Math.round(x), y: Math.round(y), angle, health: definition.maxHealth, maxHealth: definition.maxHealth,
      state: 'active', createdAtMs: Math.round(this.elapsedMs), expiresAtMs: Math.round(this.elapsedMs + COOP_STRUCTURE_LIFETIME_MS + (tacticalBonus ? COOP_TACTICAL_STRUCTURE_BONUS_MS : 0)),
      contextKey: anchor && tacticalBonus ? this.anchorKey(anchor) : `field:${this.nextEntityId}`, tacticalBonus,
      nextSupportPulseAtMs: requestedType === 'recovery_relay' ? this.elapsedMs + 900 : undefined,
    };
    this.structures.push(structure);
    player.fabricatorCharges = charges - definition.chargeCost;
    if (charges >= COOP_MAX_FABRICATOR_CHARGES || player.fabricatorRechargeAtMs <= this.elapsedMs) player.fabricatorRechargeAtMs = this.elapsedMs + COOP_FABRICATOR_RECHARGE_MS;
    const stats = this.runStats.get(playerId); if (stats) stats.structuresBuilt++;
    this.emitCombatEvent({ kind: 'structure_built', x: structure.x, y: structure.y, playerId, structureId: structure.id, structureType: structure.type, color: definition.color });
    return undefined;
  }

  dismantleStructure(playerId: string, structureId: number, requestId?: number): CoopDismantleError | { code: 'stale_request' } | undefined {
    const player = this.players.get(playerId);
    if (!player || player.lifeState !== 'alive' || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    if (!this.acceptEngineeringRequest(this.latestDismantleRequestByPlayer, playerId, requestId)) return { code: 'stale_request' };
    const structure = this.structures.find(candidate => candidate.id === structureId && candidate.state !== 'destroying');
    if (!structure) return { code: 'unknown_structure' };
    if (structure.type === 'bridge_segment') return { code: 'not_owner' };
    if (structure.ownerId !== playerId && this.players.has(structure.ownerId)) return { code: 'not_owner' };
    if (Math.hypot(player.x - structure.x, player.y - structure.y) > 280) return { code: 'dismantle_range' };
    const pristine = structure.health >= structure.maxHealth && this.elapsedMs - structure.createdAtMs <= 15_000;
    const safe = !this.enemies.some(enemy => !enemy.dying && Math.hypot(enemy.x - structure.x, enemy.y - structure.y) <= 260 + enemy.radius);
    const refund = pristine && safe ? COOP_STRUCTURE_DEFINITIONS[structure.type].chargeCost : 0;
    if (refund > 0) {
      player.fabricatorCharges = Math.min(COOP_MAX_FABRICATOR_CHARGES, (player.fabricatorCharges || 0) + refund);
      const stats = this.runStats.get(playerId); if (stats) stats.chargesRefunded += refund;
    }
    this.destroyStructure(structure, 'structure_dismantled');
    return undefined;
  }

  structureAction(playerId: string, structureId: number, requestedAction: unknown, requestId?: number, requestedX?: number, requestedY?: number, requestedAngle?: number): CoopStructureActionError | undefined {
    const player = this.players.get(playerId);
    if (!player || player.lifeState !== 'alive' || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    if (!this.acceptEngineeringRequest(this.latestStructureActionRequestByPlayer, playerId, requestId)) return { code: 'stale_request' };
    if (!isCoopStructureAction(requestedAction)) return { code: 'unknown_structure' };
    const structure = this.structures.find(candidate => candidate.id === structureId && candidate.state !== 'destroying');
    if (!structure) return { code: 'unknown_structure' };
    if (structure.type === 'bridge_segment') return { code: 'not_owner' };
    if (Math.hypot(player.x - structure.x, player.y - structure.y) > COOP_STRUCTURE_ACTION_RANGE) return { code: 'action_range' };
    if (requestedAction === 'relocate') {
      if (structure.ownerId !== playerId && this.players.has(structure.ownerId)) return { code: 'not_owner' };
      if (structure.health < structure.maxHealth) return { code: 'already_upgraded' };
      const x = Number(requestedX), y = Number(requestedY), angle = normalizeStructureAngle(Number(requestedAngle));
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - player.x, y - player.y) > COOP_BUILD_RANGE) return { code: 'action_range' };
      if (!isOnCoopPlatform(x, y, this.currentWorldId)) return { code: 'obstructed' };
      const bodies = [
        ...[...this.players.values()].filter(member => member.lifeState !== 'eliminated' && member.lifeState !== 'extracted').map(member => ({ x: member.x, y: member.y, radius: PLAYER_RADIUS })),
        ...this.enemies.filter(enemy => !enemy.dying).map(enemy => ({ x: enemy.x, y: enemy.y, radius: enemy.radius })),
        ...this.protectedBuildBodies(),
      ];
      if (!isStructurePlacementClear(structure.type, x, y, angle, bodies, this.structures.filter(candidate => candidate.id !== structure.id), this.currentWorldId)) return { code: 'obstructed' };
      structure.x = Math.round(x); structure.y = Math.round(y); structure.angle = angle;
      const anchor = this.closestBuildAnchor(x, y);
      structure.tacticalBonus = Boolean(anchor && Math.hypot(x - anchor.x, y - anchor.y) <= (anchor.radius || COOP_BUILD_ZONE_RADIUS));
      structure.contextKey = anchor && structure.tacticalBonus ? this.anchorKey(anchor) : `field:${structure.id}`;
      structure.abandonedAtMs = undefined;
      this.emitCombatEvent({ kind: 'structure_activated', x: structure.x, y: structure.y, playerId, structureId, structureType: structure.type, color: structure.ownerColor });
      return undefined;
    }
    if (requestedAction === 'rotate_left' || requestedAction === 'rotate_right') {
      if (structure.health < structure.maxHealth || (structure.type !== 'barricade' && structure.type !== 'arc_fence')) return { code: 'already_upgraded' };
      structure.angle = normalizeStructureAngle(structure.angle + (requestedAction === 'rotate_left' ? -Math.PI / 12 : Math.PI / 12));
      this.emitCombatEvent({ kind: 'structure_activated', x: structure.x, y: structure.y, playerId, structureId, structureType: structure.type, color: structure.ownerColor });
      return undefined;
    }
    if ((player.fabricatorCharges || 0) < 1) return { code: 'charges', amount: 1 };
    if (structure.type === 'barricade') {
      if (structure.reinforced) return { code: 'already_upgraded' };
      structure.reinforced = true;
      structure.maxHealth += 320;
      structure.health += 320;
    } else if (structure.type === 'arc_fence') {
      if ((structure.overchargedUntilMs || 0) > this.elapsedMs) return { code: 'cooldown', amount: Math.ceil(((structure.overchargedUntilMs || 0) - this.elapsedMs) / 1000) };
      structure.overchargedUntilMs = this.elapsedMs + COOP_ARC_FENCE_OVERCHARGE_MS;
      structure.pulseAtMs = this.elapsedMs;
    } else if (structure.type === 'recovery_relay') {
      if ((structure.abilityReadyAtMs || 0) > this.elapsedMs) return { code: 'cooldown', amount: Math.ceil(((structure.abilityReadyAtMs || 0) - this.elapsedMs) / 1000) };
      for (const member of this.players.values()) {
        if (member.lifeState !== 'alive' || !structureContainsCircle(structure, member.x, member.y, PLAYER_RADIUS)) continue;
        const healing = Math.min(member.maxHealth - member.health, COOP_RECOVERY_RELAY_SURGE_HEAL);
        member.health += healing;
        const stats = this.runStats.get(structure.ownerId); if (stats) stats.engineeringHealing = (stats.engineeringHealing || 0) + healing;
        if (healing > 0) this.emitCombatEvent({ kind: 'structure_healed', x: structure.x, y: structure.y, targetX: member.x, targetY: member.y, playerId: member.id, structureId: structure.id, structureType: structure.type, amount: healing, color: COOP_STRUCTURE_DEFINITIONS.recovery_relay.color });
      }
      structure.abilityReadyAtMs = this.elapsedMs + COOP_RECOVERY_RELAY_SURGE_COOLDOWN_MS;
      structure.pulseAtMs = this.elapsedMs;
    } else {
      if ((structure.overchargedUntilMs || 0) > this.elapsedMs) return { code: 'cooldown', amount: Math.ceil(((structure.overchargedUntilMs || 0) - this.elapsedMs) / 1000) };
      structure.overchargedUntilMs = this.elapsedMs + 8_000;
      structure.pulseAtMs = this.elapsedMs;
      for (const enemy of this.enemies) if (enemy.type !== 'phantom' && enemy.type !== 'titan') enemy.targetLeaseUntilMs = 0;
    }
    const charges = player.fabricatorCharges || 0;
    player.fabricatorCharges = charges - 1;
    if (charges >= COOP_MAX_FABRICATOR_CHARGES || player.fabricatorRechargeAtMs <= this.elapsedMs) player.fabricatorRechargeAtMs = this.elapsedMs + COOP_FABRICATOR_RECHARGE_MS;
    this.emitCombatEvent({ kind: 'structure_activated', x: structure.x, y: structure.y, playerId, structureId, structureType: structure.type, color: COOP_STRUCTURE_DEFINITIONS[structure.type].color });
    return undefined;
  }

  addPing(playerId: string, x: number, y: number, z: number = 0, kind: CoopPingKind = 'location', labelKey: CoopTextKey = 'ping.waypoint', labelParams?: Record<string, string | number>): CoopPing | undefined {
    const player = this.players.get(playerId);
    if (!player || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
    let targetX = x, targetY = y, targetZ = z;
    let targetKind = kind, targetLabelKey = labelKey, targetLabelParams = labelParams;
    const distance = Math.hypot(x - player.x, y - player.y);
    if (distance > .001) {
      const originZ = 36 + (player.z || 0);
      const obstruction = raycastWorldObstacles(
        player.x,
        player.y,
        originZ,
        (x - player.x) / distance,
        (y - player.y) / distance,
        (z - originZ) / distance,
        distance,
        this.currentWorldId,
      );
      if (obstruction && obstruction.distance < distance - 1) {
        targetX = obstruction.x;
        targetY = obstruction.y;
        targetZ = obstruction.z;
        targetKind = 'location';
        targetLabelKey = 'ping.waypoint';
        targetLabelParams = undefined;
      }
    }
    return this.storePing(player, targetX, targetY, targetZ, targetKind, targetLabelKey, targetLabelParams);
  }

  /** A map ping names a contract instead of trusting arbitrary client world
   * coordinates. The host resolves the id to the current pickup or, after
   * acceptance, the live objective so buildings cannot intercept the marker. */
  addMissionPing(playerId: string, missionSiteId: number): CoopPing | undefined {
    const player = this.players.get(playerId);
    const site = this.fieldMissionDirector.snapshot().sites.find(candidate => candidate.id === Math.trunc(missionSiteId) && candidate.state !== 'completed');
    if (!player || player.lifeState === 'eliminated' || player.lifeState === 'extracted' || !site) return undefined;
    const active = this.fieldMissionDirector.current;
    const target = site.state === 'active' && active?.id === site.id ? resolveCoopMissionNavigationTarget(active, this.enemies) || active : site;
    return this.storePing(player, target.x, target.y, 0, 'objective', 'ping.mission', { name: COOP_FIELD_MISSION_LABELS[site.kind] }, 45_000, site.id);
  }

  private storePing(player: CoopPlayer, x: number, y: number, z: number, kind: CoopPingKind, labelKey: CoopTextKey, labelParams?: Record<string, string | number>, durationMs = 6_500, missionSiteId?: number) {
    // Making a ping removes any previous ping from this player.
    this.pings = this.pings.filter(p => p.playerId !== player.id);
    if (this.pings.length >= 10) this.pings.shift();
    const ping: CoopPing = {
      id: this.nextPingId++,
      playerId: player.id,
      playerLabel: player.label,
      playerColor: player.color,
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
      kind,
      labelKey,
      labelParams,
      missionSiteId,
      createdAtMs: Math.round(this.elapsedMs),
      expiresAtMs: Math.round(this.elapsedMs) + durationMs,
    };
    this.pings.push(ping);
    this.emitCombatEvent({
      kind: 'ping',
      x: ping.x,
      y: ping.y,
      playerId: player.id,
      color: kind === 'enemy' || kind === 'boss' ? '#ef4444' : kind === 'revive' ? '#fbbf24' : player.color,
    });
    return ping;
  }

  private updateMissionPings() {
    const active = this.fieldMissionDirector.current;
    if (!active) return;
    const target = resolveCoopMissionNavigationTarget(active, this.enemies) || active;
    for (const ping of this.pings) {
      if (ping.missionSiteId !== active.id) continue;
      ping.x = Math.round(target.x); ping.y = Math.round(target.y); ping.z = 0;
    }
  }

  /** Reliable purchase entry point. The WebRTC/UI layer supplies only intent;
   * every range, price, slot, and ownership check happens here on the host. */
  purchase(playerId: string, stationId: number, itemId: CoopShopItemId): CoopPurchaseError | undefined {
    const player = this.players.get(playerId);
    const station = this.stationDirector.snapshot().find(candidate => candidate.id === stationId && candidate.state === 'active');
    if (!player || player.lifeState !== 'alive' || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    if (!station || Math.hypot(player.x - station.x, player.y - station.y) > station.radius + 48) return { code: 'station_range' };
    if (!station.stock.includes(itemId)) return { code: 'not_stocked' };
    if (itemId === 'private_exfil' && this.fieldMissionDirector.completions <= 0 && this.runDirector.snapshot(this.elapsedMs).contractIndex <= 0) return { code: 'exfil_locked' };
    if (itemId === 'private_exfil' && this.privateExfilCalled) return { code: 'exfil_called' };
    let cost = COOP_SHOP_ITEMS[itemId].cost;
    if (isPassiveModule(itemId)) {
      const owned = player.passiveRuntime.find(module => module.id === itemId);
      if (owned) {
        if (owned.rank >= COOP_PASSIVE_BY_ID[itemId].maxRank) return { code: 'passive_max' };
        cost = passiveRankCost(itemId, owned.rank);
      } else if (player.passiveRuntime.length >= 2) return { code: 'passive_slots' };
    }
    if (player.coins < cost) return { code: 'credits', amount: cost - player.coins };

    if (itemId === 'selected_ammo') {
      const weapon = this.weapon(player), definition = COOP_FIREARM_BY_ID[weapon.weaponId];
      if (weapon.reserveAmmo >= definition.maxReserve) return { code: 'selected_ammo_full' };
      weapon.reserveAmmo = Math.min(definition.maxReserve, weapon.reserveAmmo + Math.ceil(definition.maxReserve * .50));
    } else if (itemId === 'full_ammo') {
      const missing = player.weaponStates.some(weapon => weapon.reserveAmmo < COOP_FIREARM_BY_ID[weapon.weaponId].maxReserve);
      if (!missing) return { code: 'loadout_ammo_full' };
      for (const weapon of player.weaponStates) weapon.reserveAmmo = COOP_FIREARM_BY_ID[weapon.weaponId].maxReserve;
    } else if (itemId === 'trauma_patch') {
      if (player.health >= player.maxHealth) return { code: 'health_full' };
      player.health = Math.min(player.maxHealth, player.health + player.maxHealth * .35);
    } else if (itemId === 'emergency_reboot') {
      if (player.selfRevives > 0) return { code: 'reboot_owned' };
      player.selfRevives = 1;
    } else if (itemId === 'armor_1') {
      if (player.armorTier >= 1) return { code: 'armor_1_owned' };
      player.armorTier = 1; player.armorHp = maxArmorHp(1);
    } else if (itemId === 'armor_2') {
      if (player.armorTier < 1) return { code: 'armor_1_required' };
      if (player.armorTier >= 2) return { code: 'armor_2_owned' };
      player.armorTier = 2; player.armorHp = maxArmorHp(2);
    } else if (itemId === 'gas_mask') {
      if (player.gasMaskHp >= player.gasMaskMaxHp && player.gasMaskHp > 0) return { code: 'mask_full' };
      player.gasMaskHp = 150; player.gasMaskMaxHp = 150;
    } else if (itemId === 'private_exfil') {
      this.deployPrivateExfil(station);
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

  /** Accepts a map-visible contract only while an alive operator is standing
   * at its physical transmitter. The resulting contract belongs to the squad. */
  acceptFieldMission(playerId: string, siteId: number): boolean {
    const player = this.players.get(playerId);
    const site = this.fieldMissionDirector.snapshot().sites.find(candidate => candidate.id === siteId && candidate.state === 'available');
    if (!player || player.lifeState !== 'alive' || !site || Math.hypot(player.x - site.x, player.y - site.y) > 125) return false;
    const eligible = [...this.players.values()].filter(member => member.lifeState !== 'extracted').map(member => member.id);
    const active = this.fieldMissionDirector.accept(siteId, eligible, { x: this.gasZone.x, y: this.gasZone.y });
    if (!active) return false;
    if (!this.activateFieldMission(active.kind)) {
      const failedMissionId = this.fieldMissionDirector.cancelActivation();
      if (failedMissionId !== undefined) {
        const removedIds = this.enemies.filter(enemy => enemy.missionId === failedMissionId).map(enemy => enemy.id);
        retainInPlace(this.enemies, enemy => enemy.missionId !== failedMissionId);
        for (const id of removedIds) this.enemyNavigation.delete(id);
        this.enemySpatialIndex.rebuild(this.enemies);
      }
      return false;
    }
    this.emitCombatEvent({ kind: 'mission_started', x: active.x, y: active.y, amount: active.reward, color: '#2dd4bf' });
    return true;
  }

  private activateFieldMission(kind: CoopFieldMissionKind): boolean {
    const mission = this.fieldMissionDirector.current;
    if (!mission) return false;
    const livingCount = Math.max(1, [...this.players.values()].filter(player => player.lifeState === 'alive').length);
    const desiredEnemyCount = kind === 'hostage_recovery' ? 5 + livingCount * 2
        : kind === 'courier_intercept' ? 3 * (3 + livingCount)
          : 0;
    this.reserveMissionEnemyCapacity(desiredEnemyCount);
    if (kind === 'toxic_hunt') {
      const enclave = this.gasEnclave;
      const commander = enclave && this.enemies.find(enemy => enemy.id === enclave.commanderId && !enemy.dying);
      if (!enclave || enclave.missionSiteId !== mission.id || !commander) return false;
      mission.targetEnemyIds = [commander.id];
      mission.guardEnemyIds = enclave.guardIds.filter(id => this.enemies.some(enemy => enemy.id === id && !enemy.dying));
      mission.x = commander.x; mission.y = commander.y;
      mission.progress = Math.max(0, commander.maxHealth - commander.health); mission.required = commander.maxHealth;
    } else if (kind === 'hostage_recovery') {
      const guards = 5 + livingCount * 2;
      const roster: Array<keyof typeof ENEMY_TYPES> = ['basic', 'fast', 'ranged', 'tank'];
      for (let index = 0; index < guards; index++) {
        const id = this.spawnMissionEnemy(roster[index % roster.length], mission.x, mission.y, 'guard', 1 + (livingCount - 1) * .16, '#dc2626', index);
        if (id !== undefined) {
          mission.guardEnemyIds.push(id);
          const captor = this.enemies.find(enemy => enemy.id === id);
          if (captor) captor.archetypeName = 'HOSTAGE CAPTOR';
        }
      }
      mission.progress = 0; mission.required = mission.guardEnemyIds.length;
    } else if (kind === 'courier_intercept') {
      for (let index = 0; index < 3; index++) {
        const point = mission.points[index];
        const courierId = this.spawnMissionEnemy('fast', point.x, point.y, 'courier', 4 + (livingCount - 1) * .75, '#f59e0b', index);
        if (courierId !== undefined) mission.courierEnemyIds.push(courierId);
        for (let guard = 0; guard < 2 + livingCount; guard++) {
          const id = this.spawnMissionEnemy(guard % 2 ? 'basic' : 'ranged', point.x, point.y, 'guard', 1 + (livingCount - 1) * .12, '#dc2626', guard);
          if (id !== undefined) mission.guardEnemyIds.push(id);
        }
      }
      if (mission.courierEnemyIds.length !== 3) return false;
    }
    return true;
  }

  /** The Chem Commander is a real world encounter, not a contract-spawned
   * prop. Every world begins with this enclave already occupying its gas. */
  private spawnGasEnclave() {
    const site = this.fieldMissionDirector.snapshot().sites.find(candidate => candidate.kind === 'toxic_hunt');
    if (!site) return;
    const livingCount = Math.max(1, [...this.players.values()].filter(player => player.lifeState === 'alive').length);
    const guardCount = 6 + (livingCount - 1) * 2;
    this.reserveMissionEnemyCapacity(1 + guardCount);
    const commanderId = this.spawnMissionEnemy(
      'elite', this.gasZone.x, this.gasZone.y, 'target',
      1_600 / ENEMY_TYPES.elite.health * (1 + (livingCount - 1) * .65), '#ef4444', 0, site.id,
    );
    if (commanderId === undefined) {
      this.fieldMissionDirector.removeAvailable(site.id);
      return;
    }
    const guardIds: number[] = [];
    const roster: Array<keyof typeof ENEMY_TYPES> = ['basic', 'fast', 'ranged', 'basic', 'tank'];
    for (let index = 0; index < guardCount; index++) {
      const id = this.spawnMissionEnemy(
        roster[index % roster.length], this.gasZone.x, this.gasZone.y, 'guard',
        1 + (livingCount - 1) * .18, '#dc2626', index, site.id,
      );
      if (id !== undefined) guardIds.push(id);
    }
    this.gasEnclave = {
      missionSiteId: site.id, commanderId, guardIds,
      lastGasX: this.gasZone.x, lastGasY: this.gasZone.y,
    };
    this.constrainGasEnclave();
  }

  /** Optional contracts must remain completable even when the ambient
   * director has filled its budget. Retire the farthest ordinary combatants
   * first, never a boss, then keep all subsequent mission spawns under the
   * same global cap as the rest of the simulation. */
  private reserveMissionEnemyCapacity(count: number) {
    const removeCount = Math.max(0, this.enemies.length + count - COOP_MAX_ENEMIES);
    if (removeCount <= 0) return;
    const centre = this.squadCentre();
    const removable = this.enemies.filter(enemy => enemy.id !== this.bossEnemyId && enemy.missionId === undefined)
      .sort((a, b) => Number(b.dying) - Number(a.dying)
        || Math.hypot(b.x - centre.x, b.y - centre.y) - Math.hypot(a.x - centre.x, a.y - centre.y)
        || a.id - b.id)
      .slice(0, removeCount);
    const ids = new Set(removable.map(enemy => enemy.id));
    if (!ids.size) return;
    retainInPlace(this.enemies, enemy => !ids.has(enemy.id));
    for (const id of ids) this.enemyNavigation.delete(id);
  }

  private spawnMissionEnemy(type: keyof typeof ENEMY_TYPES, x: number, y: number, role: 'target' | 'guard' | 'courier', healthMultiplier: number, color: string, index = 0, missionId = this.fieldMissionDirector.current?.id) {
    if (this.enemies.length >= COOP_MAX_ENEMIES) return undefined;
    const definition = ENEMY_TYPES[type];
    const angle = index / 12 * Math.PI * 2 + this.random() * .35;
    const distance = role === 'target' ? 0 : 115 + (index % 4) * 42;
    const position = this.safeMissionSpawnPosition(x, y, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, definition.radius, index);
    const health = Math.round(definition.health * healthMultiplier);
    const id = this.nextEntityId++;
    this.enemies.push({
      id, x: position.x, y: position.y, health, maxHealth: health, type, color, radius: definition.radius,
      damage: definition.damage * (1 + Math.max(0, this.players.size - 1) * .12), speed: role === 'courier' ? definition.speed * 1.08 : definition.speed,
      experienceValue: definition.xp, hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1, isHolder: false,
      dying: false, deathRemainingMs: 0, targetLeaseUntilMs: this.elapsedMs + 2_500, nextAttackAtMs: this.elapsedMs + enemyOpeningDelay(type),
      missionId, missionRole: role,
      missionAnchorX: x, missionAnchorY: y,
      worldId: this.currentWorldId,
      archetypeName: role === 'target' ? 'CHEM COMMANDER' : role === 'courier' ? 'DATA COURIER' : 'CONTRACT GUARD',
    });
    return id;
  }

  private handleFieldInteraction(player: CoopPlayer) {
    if (this.collectManualDrop(player)) return;
    const mission = this.fieldMissionDirector.current;
    if (!mission) {
      const site = this.fieldMissionDirector.snapshot().sites
        .filter(candidate => candidate.state === 'available')
        .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
      if (site && Math.hypot(site.x - player.x, site.y - player.y) <= 125) this.acceptFieldMission(player.id, site.id);
      return;
    }
    if (mission.kind === 'courier_intercept') {
      const drive = mission.drives.find(candidate => !candidate.collected && Math.hypot(candidate.x - player.x, candidate.y - player.y) <= 105);
      if (drive) {
        drive.collected = true;
        const recovered = mission.drives.filter(candidate => candidate.collected).length;
        if (recovered >= 3) {
          mission.stage = 'deliver'; mission.points[3].state = 'available'; mission.x = mission.points[3].x; mission.y = mission.points[3].y; mission.progress = 0; mission.required = 3_000;
        } else if (!mission.courierEnemyIds.length) {
          mission.stage = 'recover'; mission.progress = recovered; mission.required = 3;
        } else { mission.progress = 3 - mission.courierEnemyIds.length; mission.required = 3; }
        this.emitCombatEvent({ kind: 'mission_stage', x: drive.x, y: drive.y, playerId: player.id, amount: recovered, color: '#f59e0b' });
      }
    }
  }

  private cancelPlayerWeaponActions(player: CoopPlayer) {
    const weapon = this.weapon(player);
    this.cancelReload(weapon); weapon.state = 'ready';
    player.isAiming = false; player.isReloading = false; player.isSwitching = false; player.previousFiring = false; player.weaponActionEndsAtMs = undefined;
  }

  private beginHostageCarry(player: CoopPlayer, mission: NonNullable<ReturnType<CoopFieldMissionDirector['accept']>>) {
    const hostage = mission.hostage;
    if (!hostage || hostage.state !== 'waiting' || player.lifeState !== 'alive') return;
    hostage.state = 'carried'; hostage.carrierId = player.id; player.carryingHostage = true;
    mission.progress = 0; mission.required = COOP_HOSTAGE_RECOVERY_DURATION_MS;
    mission.points[0].state = 'completed';
    const recovery = mission.points[1]; recovery.state = 'available'; mission.x = recovery.x; mission.y = recovery.y;
    this.cancelPlayerWeaponActions(player);
    this.emitCombatEvent({ kind: 'mission_stage', x: player.x, y: player.y, playerId: player.id, amount: 1, color: '#fbbf24' });
  }

  private deployPrivateExfil(station: CoopBuyStationSnapshot) {
    const point = this.findPrivateExfilPosition(station);
    this.privateExfilCalled = true;
    this.privateExfil = { ...point, radius: 115, state: 'inbound', arrivalRemainingMs: 20_000, windowRemainingMs: 60_000, holdProgressMs: 0, holdRequiredMs: 10_000 };
    this.emitCombatEvent({ kind: 'private_exfil_inbound', x: point.x, y: point.y, amount: 20, color: '#fbbf24' });
  }

  private findPrivateExfilPosition(station: CoopBuyStationSnapshot) {
    for (let attempt = 0; attempt < 96; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance = 900 + this.random() * 500;
      const point = { x: station.x + Math.cos(angle) * distance, y: station.y + Math.sin(angle) * distance };
      if (point.x < 180 || point.y < 180 || point.x > COOP_WORLD_SIZE - 180 || point.y > COOP_WORLD_SIZE - 180) continue;
      if (!isWorldPositionClear(point.x, point.y, 125, this.currentWorldId)) continue;
      if (Math.hypot(point.x - this.gasZone.x, point.y - this.gasZone.y) < this.gasZone.radius + 350) continue;
      if (this.stationDirector.positions.some(other => Math.hypot(point.x - other.x, point.y - other.y) < 420)) continue;
      return { x: Math.round(point.x), y: Math.round(point.y) };
    }
    return this.safeFallbackPosition(station.x + 1_000, station.y, 125);
  }

  /** Applies the gas zone's authoritative displacement to its enclave. The
   * commander and every surviving minion therefore move during each gas
   * relocation even when Toxic Hunt has not been accepted. */
  private updateGasEnclave() {
    const enclave = this.gasEnclave;
    if (!enclave) return;
    const dx = this.gasZone.x - enclave.lastGasX;
    const dy = this.gasZone.y - enclave.lastGasY;
    if (dx || dy) {
      const ids = new Set([enclave.commanderId, ...enclave.guardIds]);
      for (const enemy of this.enemies) {
        if (!ids.has(enemy.id) || enemy.dying) continue;
        enemy.x += dx; enemy.y += dy;
      }
    }
    enclave.lastGasX = this.gasZone.x;
    enclave.lastGasY = this.gasZone.y;
    this.constrainGasEnclave();
  }

  private constrainGasEnclave() {
    const enclave = this.gasEnclave;
    if (!enclave) return;
    const guards = new Set(enclave.guardIds);
    for (const enemy of this.enemies) {
      if (enemy.dying || (enemy.id !== enclave.commanderId && !guards.has(enemy.id))) continue;
      const maxDistance = this.gasZone.radius * (enemy.id === enclave.commanderId ? .62 : .78);
      const dx = enemy.x - this.gasZone.x, dy = enemy.y - this.gasZone.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDistance) {
        enemy.x = this.gasZone.x + dx / distance * maxDistance;
        enemy.y = this.gasZone.y + dy / distance * maxDistance;
      }
      enemy.missionAnchorX = this.gasZone.x;
      enemy.missionAnchorY = this.gasZone.y;
    }
  }

  private updateFieldMission(deltaMs: number) {
    const mission = this.fieldMissionDirector.current;
    if (!mission) return;
    const alive = [...this.players.values()].filter(player => player.lifeState === 'alive');
    const heldAt = (x: number, y: number, radius = 125) => alive.filter(player => this.inputByPlayer.get(player.id)?.reviving
      && player.z <= COOP_GROUNDED_INTERACTION_MAX_Z && Math.hypot(player.x - x, player.y - y) <= radius);

    if (mission.kind === 'toxic_hunt') {
      const target = this.enemies.find(enemy => mission.targetEnemyIds.includes(enemy.id) && !enemy.dying);
      if (target) {
        mission.x = target.x; mission.y = target.y;
        mission.progress = Math.max(0, target.maxHealth - target.health); mission.required = target.maxHealth;
      } else { mission.x = this.gasZone.x; mission.y = this.gasZone.y; }
      return;
    }

    if (mission.kind === 'demolition') {
      const isA = mission.stage === 'plant_a' || mission.stage === 'defend_a';
      const point = mission.points[isA ? 0 : 1];
      mission.x = point.x; mission.y = point.y;
      if (mission.stage === 'plant_b') {
        mission.timerRemainingMs = Math.max(0, (mission.timerRemainingMs ?? 90_000) - deltaMs);
        if (mission.timerRemainingMs <= 0) {
          mission.stage = 'plant_a'; mission.progress = 0; mission.required = 4_000; mission.timerRemainingMs = undefined;
          mission.points[0].state = 'available'; mission.points[1].state = 'locked';
          this.emitCombatEvent({ kind: 'mission_stage', x: mission.points[0].x, y: mission.points[0].y, amount: -1, color: '#fb7185' });
          return;
        }
      }
      if (mission.stage === 'plant_a' || mission.stage === 'plant_b') {
        mission.required = 4_000;
        const planters = heldAt(point.x, point.y);
        if (planters.length) mission.progress = Math.min(mission.required, mission.progress + deltaMs);
        else mission.progress = Math.max(0, mission.progress - deltaMs * .4);
        // Replicate partial planting as a first-class world state. This lets
        // every client show that the charge is being handled, even when a
        // squadmate (rather than the local player) is holding the key.
        point.state = mission.progress > 0 ? 'arming' : 'available';
        if (mission.progress >= mission.required) {
          point.state = 'defending'; mission.stage = isA ? 'defend_a' : 'defend_b'; mission.progress = 0; mission.required = 20_000; mission.timerRemainingMs = 20_000;
          this.spawnMissionDefenseWave(point.x, point.y, isA ? 5 : 8);
          this.emitCombatEvent({ kind: 'demolition_charge_planted', x: point.x, y: point.y, amount: isA ? 1 : 2, color: '#fb7185' });
          this.emitCombatEvent({ kind: 'mission_stage', x: point.x, y: point.y, color: '#fb7185' });
        }
      } else {
        mission.timerRemainingMs = Math.max(0, (mission.timerRemainingMs ?? 20_000) - deltaMs);
        mission.progress = mission.required - mission.timerRemainingMs;
        if (mission.timerRemainingMs <= 0) {
          point.state = 'completed';
          this.emitCombatEvent({ kind: 'demolition_charge_detonated', x: point.x, y: point.y, amount: isA ? 1 : 2, color: '#fb923c' });
          if (isA) {
            mission.points[1].state = 'available'; mission.stage = 'plant_b'; mission.x = mission.points[1].x; mission.y = mission.points[1].y;
            mission.progress = 0; mission.required = 4_000; mission.timerRemainingMs = 90_000;
            this.emitCombatEvent({ kind: 'mission_stage', x: mission.x, y: mission.y, color: '#fb7185' });
          } else this.completeFieldMission();
        }
      }
      return;
    }

    if (mission.kind === 'signal_hijack') {
      const relay = mission.points[0]; mission.x = relay.x; mission.y = relay.y;
      if (mission.stage === 'activate') {
        mission.required = 3_000;
        if (heldAt(relay.x, relay.y).length) mission.progress = Math.min(3_000, mission.progress + deltaMs);
        else mission.progress = Math.max(0, mission.progress - deltaMs * .4);
        if (mission.progress >= 3_000) {
          mission.stage = 'upload'; mission.progress = 0; mission.required = 45_000; relay.state = 'defending';
          this.spawnMissionDefenseWave(relay.x, relay.y, 7);
          this.emitCombatEvent({ kind: 'mission_stage', x: relay.x, y: relay.y, color: '#22d3ee' });
        }
      } else {
        const occupants = alive.filter(player => Math.hypot(player.x - relay.x, player.y - relay.y) <= 155).length;
        const contested = this.enemies.some(enemy => !enemy.dying && Math.hypot(enemy.x - relay.x, enemy.y - relay.y) <= 155 + enemy.radius);
        if (occupants > 0 && !contested) mission.progress = Math.min(mission.required, mission.progress + deltaMs * (1 + Math.min(1.5, (occupants - 1) * .5)));
        else if (occupants === 0) mission.progress = Math.max(0, mission.progress - deltaMs * .2);
        if (mission.progress >= mission.required) { relay.state = 'completed'; this.completeFieldMission(); }
      }
      return;
    }

    if (mission.kind === 'hostage_recovery') {
      const hostage = mission.hostage!;
      if (mission.stage === 'secure') {
        // Reconcile against authoritative entities every tick. This also
        // handles a captor removed by world cleanup rather than a damage kill.
        const livingGuardIds = new Set(this.enemies.filter(enemy => !enemy.dying && enemy.missionId === mission.id && enemy.missionRole === 'guard').map(enemy => enemy.id));
        mission.guardEnemyIds = mission.guardEnemyIds.filter(id => livingGuardIds.has(id));
        mission.progress = Math.max(0, mission.required - mission.guardEnemyIds.length);
        if (!mission.guardEnemyIds.length) {
          mission.stage = 'escort'; hostage.state = 'waiting'; mission.points[0].state = 'arming'; mission.points[1].state = 'locked'; mission.x = hostage.x; mission.y = hostage.y;
          mission.progress = 0; mission.required = COOP_HOSTAGE_FREE_DURATION_MS;
          this.emitCombatEvent({ kind: 'mission_stage', x: hostage.x, y: hostage.y, color: '#fbbf24' });
        }
        return;
      }
      if (hostage.state === 'waiting') {
        mission.x = hostage.x; mission.y = hostage.y; mission.required = COOP_HOSTAGE_FREE_DURATION_MS;
        const rescuers = heldAt(hostage.x, hostage.y, 120);
        if (rescuers.length) mission.progress = Math.min(mission.required, mission.progress + deltaMs);
        else mission.progress = Math.max(0, mission.progress - deltaMs * .5);
        if (mission.progress >= mission.required) this.beginHostageCarry(rescuers[0], mission);
        return;
      }
      const carrier = hostage.carrierId ? this.players.get(hostage.carrierId) : undefined;
      if (carrier && carrier.lifeState === 'alive') {
        hostage.x = carrier.x; hostage.y = carrier.y; carrier.carryingHostage = true;
        const recovery = mission.points[1]; mission.x = recovery.x; mission.y = recovery.y; mission.required = COOP_HOSTAGE_RECOVERY_DURATION_MS;
        const recovering = Math.hypot(carrier.x - recovery.x, carrier.y - recovery.y) <= 125;
        recovery.state = recovering ? 'defending' : 'available';
        if (recovering) mission.progress = Math.min(mission.required, mission.progress + deltaMs);
        else mission.progress = Math.max(0, mission.progress - deltaMs * .25);
        if (mission.progress >= mission.required) { hostage.state = 'secured'; carrier.carryingHostage = false; this.completeFieldMission(); }
      } else if (carrier) {
        carrier.carryingHostage = false; hostage.carrierId = undefined; hostage.state = 'waiting'; mission.progress = 0; mission.required = COOP_HOSTAGE_FREE_DURATION_MS; mission.x = hostage.x; mission.y = hostage.y;
        mission.points[0].state = 'arming'; mission.points[1].state = 'locked';
      }
      return;
    }

    if (mission.kind === 'courier_intercept') {
      const navigationTarget = resolveCoopMissionNavigationTarget(mission, this.enemies);
      if (navigationTarget) { mission.x = navigationTarget.x; mission.y = navigationTarget.y; }
      if (mission.stage === 'deliver') {
        const drop = mission.points[3]; mission.x = drop.x; mission.y = drop.y;
        mission.required = 3_000;
        if (heldAt(drop.x, drop.y).length) mission.progress = Math.min(mission.required, mission.progress + deltaMs);
        else mission.progress = Math.max(0, mission.progress - deltaMs * .4);
        if (mission.progress >= mission.required) { drop.state = 'completed'; this.completeFieldMission(); }
      }
    }
  }

  private spawnMissionDefenseWave(x: number, y: number, count: number) {
    const mission = this.fieldMissionDirector.current;
    if (!mission) return;
    const roster: Array<keyof typeof ENEMY_TYPES> = ['basic', 'fast', 'ranged', 'tank'];
    for (let index = 0; index < count; index++) {
      const id = this.spawnMissionEnemy(roster[index % roster.length], x, y, 'guard', 1 + Math.max(0, this.players.size - 1) * .15, '#dc2626', index);
      if (id !== undefined) mission.guardEnemyIds.push(id);
    }
  }

  private completeFieldMission() {
    const completion = this.fieldMissionDirector.complete();
    if (!completion) return;
    this.pings = this.pings.filter(ping => ping.missionSiteId !== completion.id);
    for (const enemy of this.enemies) {
      if (enemy.missionId !== completion.id) continue;
      enemy.missionId = undefined;
      enemy.missionRole = undefined;
    }
    for (const playerId of completion.eligiblePlayerIds) {
      const player = this.players.get(playerId);
      if (!player || player.lifeState === 'extracted') continue;
      player.coins += completion.reward;
      const stats = this.runStats.get(player.id); if (stats) stats.creditsEarned += completion.reward;
    }
    this.emitCombatEvent({ kind: 'mission_completed', x: completion.x, y: completion.y, amount: completion.reward, color: '#5eead4' });
  }

  private updatePrivateExfil(deltaMs: number) {
    const exfil = this.privateExfil;
    if (!exfil) return;
    if (exfil.state === 'inbound') {
      exfil.arrivalRemainingMs = Math.max(0, exfil.arrivalRemainingMs - deltaMs);
      if (exfil.arrivalRemainingMs <= 0) { exfil.state = 'active'; this.emitCombatEvent({ kind: 'exfil_deployed', x: exfil.x, y: exfil.y, color: '#fbbf24' }); }
      return;
    }
    exfil.windowRemainingMs = Math.max(0, exfil.windowRemainingMs - deltaMs);
    const inside = [...this.players.values()].filter(player => player.lifeState === 'alive' && player.z <= COOP_GROUNDED_INTERACTION_MAX_Z && Math.hypot(player.x - exfil.x, player.y - exfil.y) <= exfil.radius);
    if (inside.length) exfil.holdProgressMs = Math.min(exfil.holdRequiredMs, exfil.holdProgressMs + deltaMs);
    else exfil.holdProgressMs = Math.max(0, exfil.holdProgressMs - deltaMs * .25);
    if (exfil.holdProgressMs >= exfil.holdRequiredMs) {
      for (const player of inside) {
        player.lifeState = 'extracted'; player.health = 0; player.carryingHostage = false;
        this.cancelPlayerWeaponActions(player);
        this.emitCombatEvent({ kind: 'player_extracted', x: exfil.x, y: exfil.y, playerId: player.id, color: player.color });
      }
      this.privateExfil = undefined;
      if (![...this.players.values()].some(player => player.lifeState === 'alive' || player.lifeState === 'downed')) this.finishRun(true);
    } else if (exfil.windowRemainingMs <= 0) this.privateExfil = undefined;
  }

  /** Moves a personal run resource into the shared world. The host derives
   * position and amount from authoritative state; clients only choose a kind. */
  dropInventory(playerId: string, kind: CoopInventoryDropKind): CoopInventoryDropError | undefined {
    const player = this.players.get(playerId);
    if (!player || player.lifeState !== 'alive' || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    const value = kind === 'cash' ? Math.max(0, Math.trunc(player.coins)) : player.selfRevives > 0 ? 1 : 0;
    if (value <= 0) return { code: 'empty' };
    if (kind === 'cash') player.coins -= value;
    else player.selfRevives--;
    const distance = 54;
    const drop: CoopItemSnapshot = {
      id: this.nextEntityId++,
      x: clamp(player.x + Math.cos(player.angle) * distance, 24, COOP_WORLD_SIZE - 24),
      y: clamp(player.y + Math.sin(player.angle) * distance, 24, COOP_WORLD_SIZE - 24),
      type: kind === 'cash' ? 'coin_gold' : 'self_revive',
      value,
      color: kind === 'cash' ? '#facc15' : '#fb7185',
      manualDropKind: kind,
      droppedByPlayerId: player.id,
    };
    this.items.push(drop);
    this.emitCombatEvent({ kind: 'drop_spawned', x: drop.x, y: drop.y, playerId, itemType: drop.type, amount: value, color: drop.color });
    return undefined;
  }

  /** Bring back a fully eliminated teammate at an active station. Downed
   * operators intentionally fail this route and must use the revive system. */
  redeployPlayer(buyerId: string, stationId: number, targetPlayerId: string): { code: CoopRedeployErrorCode; amount?: number } | undefined {
    const buyer = this.players.get(buyerId);
    const target = this.players.get(targetPlayerId);
    const station = this.stationDirector.snapshot().find(candidate => candidate.id === stationId && candidate.state === 'active');
    if (!buyer || buyer.lifeState !== 'alive' || buyer.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    if (!station || Math.hypot(buyer.x - station.x, buyer.y - station.y) > station.radius + 48) return { code: 'station_range' };
    if (buyerId === targetPlayerId) return { code: 'redeploy_self' };
    if (!target || target.lifeState !== 'eliminated') return { code: 'target_not_eliminated' };
    if (buyer.coins < COOP_OPERATOR_REDEPLOY_COST) return { code: 'credits', amount: COOP_OPERATOR_REDEPLOY_COST - buyer.coins };

    const angle = ((targetPlayerId.length * 1.618 + station.id) % 8) / 8 * Math.PI * 2;
    const spawn = this.safeFallbackPosition(station.x + Math.cos(angle) * 105, station.y + Math.sin(angle) * 105, PLAYER_RADIUS);
    target.x = spawn.x; target.y = spawn.y; target.z = 0;
    target.health = target.maxHealth * .5;
    target.lifeState = 'alive';
    target.downedRemainingMs = 0; target.reviveProgressMs = 0; target.reviverId = undefined;
    target.selfReviveProgressMs = 0; target.invulnerableRemainingMs = COOP_REVIVE_INVULNERABILITY_MS;
    target.verticalVelocity = 0; target.airActionConsumedSinceGrounded = false; target.sprinting = false; target.sliding = false; target.crouching = false;
    target.isAiming = false; target.isReloading = false; target.isSwitching = false; target.previousFiring = false;
    target.weaponActionEndsAtMs = undefined;
    for (const weapon of target.weaponStates) { this.cancelReload(weapon); weapon.state = 'ready'; }
    this.inputByPlayer.delete(target.id);
    this.inputReceivedAtMs.delete(target.id);

    buyer.coins -= COOP_OPERATOR_REDEPLOY_COST;
    const stats = this.runStats.get(buyer.id); if (stats) stats.creditsSpent += COOP_OPERATOR_REDEPLOY_COST;
    this.emitCombatEvent({ kind: 'player_redeployed', x: spawn.x, y: spawn.y, playerId: target.id, killedByPlayerId: buyer.id, amount: COOP_OPERATOR_REDEPLOY_COST, color: target.color });
    return undefined;
  }

  /** Host-only Foundry transaction. The requested firearm need not be
   * equipped, but it must belong to the requesting player's own loadout. */
  forgeWeapon(playerId: string, foundryId: number, requestedWeapon: unknown): CoopFoundryResult | undefined {
    const player = this.players.get(playerId);
    const foundry = this.weaponFoundry.snapshot();
    if (!player || player.lifeState !== 'alive' || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return { code: 'alive_required' };
    if (foundry.id !== foundryId || foundry.state !== 'active') return { code: 'foundry_inactive' };
    if (Math.hypot(player.x - foundry.x, player.y - foundry.y) > foundry.radius + 48) return { code: 'foundry_range' };
    const weapon = player.weaponStates.find(candidate => candidate.weaponId === requestedWeapon);
    if (!weapon) return { code: 'invalid_weapon' };
    if (weapon.level >= WEAPON_MAX_LEVEL) return { code: 'weapon_max' };
    const cost = coopFoundryUpgradeCost(weapon.level);
    if (player.coins < cost) return { code: 'credits', amount: cost - player.coins };
    player.coins -= cost;
    weapon.level++;
    player.weaponLevels = player.weaponStates.map(state => state.level);
    if (player.selectedWeaponId === weapon.weaponId) player.selectedWeaponLevel = weapon.level;
    const stats = this.runStats.get(player.id); if (stats) stats.creditsSpent += cost;
    this.emitCombatEvent({ kind: 'foundry_upgrade', x: foundry.x, y: foundry.y, playerId: player.id, weaponId: weapon.weaponId, amount: cost, color: '#f59e0b' });
    return undefined;
  }

  private updateRun(deltaMs: number) {
    const centre = this.squadCentre();
    const capturePlayers = [...this.players.values()].map(player => ({ ...player, lifeState: player.z <= COOP_GROUNDED_INTERACTION_MAX_Z ? player.lifeState : 'airborne', radius: PLAYER_RADIUS }));
    for (const station of this.stationDirector.update(deltaMs, capturePlayers, this.enemies.filter(enemy => !enemy.dying))) {
      this.emitCombatEvent({ kind: 'station_online', x: station.x, y: station.y, color: '#67e8f9' });
    }
    if (this.weaponFoundry.update(deltaMs, capturePlayers, this.enemies.filter(enemy => !enemy.dying))) {
      const foundry = this.weaponFoundry.snapshot();
      this.emitCombatEvent({ kind: 'foundry_online', x: foundry.x, y: foundry.y, color: '#f59e0b' });
    }
    if (this.runDirector.advanceInsertion(this.worldElapsedMs(), centre)) this.activateObjectiveIfNeeded();
    const objective = this.runDirector.currentObjective;
    if (objective?.kind === 'uplink') {
      const members = [...this.players.values()].filter(player => player.lifeState === 'alive' && player.z <= COOP_GROUNDED_INTERACTION_MAX_Z && Math.hypot(player.x - objective.x, player.y - objective.y) <= COOP_UPLINK_RADIUS).length;
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

    if (this.runDirector.currentPhase === 'checkpoint') {
      const exfil = this.runDirector.currentExfil!;
      const living = [...this.players.values()].filter(player => player.lifeState === 'alive');
      const inside = living.filter(player => player.z <= COOP_GROUNDED_INTERACTION_MAX_Z && Math.hypot(player.x - exfil.x, player.y - exfil.y) <= exfil.radius).length;
      const outcome = this.runDirector.updateCheckpoint(deltaMs, inside, living.length);
      if (outcome === 'success') this.finishRun(true);
      if (outcome === 'failed') this.finishRun(false);
      if (outcome === 'continue') this.nextScenarioAtMs = this.elapsedMs + 1_000;
    }

    if (this.runDirector.currentPhase === 'exfil') {
      const exfil = this.runDirector.currentExfil!;
      const living = [...this.players.values()].filter(player => player.lifeState === 'alive');
      const inside = living.filter(player => player.z <= COOP_GROUNDED_INTERACTION_MAX_Z && Math.hypot(player.x - exfil.x, player.y - exfil.y) <= exfil.radius).length;
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
    const identity = worldEnemyIdentity(this.currentWorldId, 'elite');
    const id = this.nextEntityId++;
    const health = coopObjectiveEliteHealth(definition.health, this.players.size);
    this.enemies.push({ id, x: objective.x, y: objective.y, health, maxHealth: health, type: 'elite', color: identity.color, worldId: this.currentWorldId, archetypeName: identity.name, radius: definition.radius, damage: definition.damage * this.partyScale(.24), speed: definition.speed, experienceValue: definition.xp * 4, hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1, isHolder: true, dying: false, deathRemainingMs: 0, targetLeaseUntilMs: this.elapsedMs + 2_500, nextAttackAtMs: this.elapsedMs + enemyOpeningDelay('elite') });
    this.runDirector.setEliteTarget(id);
    this.emitCombatEvent({ kind: 'objective_started', x: objective.x, y: objective.y, enemyId: id, color: definition.color });
  }

  private onObjectiveCompleted(centre: { x: number; y: number }) {
    this.awardCredits(190);
    // Give the squad a brief preparation window before the contract's
    // mini-boss materialises. Stations are unlocked only by boss milestones.
    this.nextScenarioAtMs = this.elapsedMs + 10_000;
    this.emitCombatEvent({ kind: 'objective_completed', x: centre.x, y: centre.y, color: '#5eead4' });
  }

  private spawnRunBoss() {
    const boss = this.runDirector.currentBoss;
    if (!boss) return;
    const definition = ENEMY_TYPES.titan;
    const isFinal = boss.kind === 'singularity';
    const difficulty = getWorldDefinition(this.currentWorldId).difficulty;
    const identity = worldBossIdentity(this.currentWorldId, boss.kind);
    boss.displayName = identity.name;
    const health = Math.round(coopBossHealth(boss.kind, this.players.size) * difficulty.healthMultiplier);
    const id = this.nextEntityId++;
    this.enemies.push({ id, x: boss.x, y: boss.y, health, maxHealth: health, type: 'titan', color: identity.color, worldId: this.currentWorldId, archetypeName: identity.name, radius: isFinal ? 150 : 88, damage: (isFinal ? 68 : 42) * this.partyScale(.18) * difficulty.damageMultiplier, speed: isFinal ? .72 : .82, experienceValue: Math.round((isFinal ? 3_000 : 700) * difficulty.rewardMultiplier), hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1, isHolder: false, dying: false, deathRemainingMs: 0, targetLeaseUntilMs: this.elapsedMs + 2_500 });
    this.bossEnemyId = id;
    this.nextBossAbilityAtMs = this.elapsedMs + 5_500;
    this.lastBossPhase = 1;
    this.runDirector.activateBoss(health, boss.x, boss.y);
    this.emitCombatEvent({ kind: 'boss_spawned', x: boss.x, y: boss.y, enemyId: id, color: identity.color });
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
    if (this.currentWorldId !== 'neon_bastion') {
      const target = this.closestLivingPlayer(boss.x, boss.y) || boss;
      if (this.currentWorldId === 'cinderworks') {
        if (bossState.kind === 'neural_overlord') {
          // Kiln Marshal brackets the nearest operator with alternating vents.
          for (const offset of [-1, 1]) this.queueHazard(boss, 'artillery', target.x + offset * 145, target.y, 112, 24, 1_250, '#ff8a24');
          this.nextBossAbilityAtMs = this.elapsedMs + 6_700;
        } else if (bossState.kind === 'void_architect') {
          // Crucible Engine clears its immediate deck, then seals the obvious
          // retreat line with a delayed slag impact.
          this.queueHazard(boss, 'shockwave', boss.x, boss.y, 390, 27, 1_500, '#ffb020');
          this.queueHazard(boss, 'artillery', target.x, target.y, 135, 31, 1_950, '#ff5a0a');
          this.nextBossAbilityAtMs = this.elapsedMs + 7_200;
        } else {
          // Furnace Sovereign: a readable eruption fan forces movement between
          // the safe foundry plates instead of merely inflating contact damage.
          for (const offset of [-1, 0, 1]) this.queueHazard(boss, 'artillery', target.x + offset * 190, target.y + Math.abs(offset) * 80, 145, 27 + bossState.phase * 3, 1_650, '#ff5a0a');
          this.nextBossAbilityAtMs = this.elapsedMs + (bossState.phase === 3 ? 5_200 : 7_400);
        }
      } else if (this.currentWorldId === 'white_silence') {
        if (bossState.kind === 'neural_overlord') {
          // Rime Matriarch paints a slow, readable lance corridor across the
          // ice instead of using the city boss's radial pulse.
          for (const offset of [-1, 0, 1]) this.queueHazard(boss, 'artillery', target.x, target.y + offset * 130, 88, 22, 1_550, '#67e8f9');
          this.nextBossAbilityAtMs = this.elapsedMs + 7_300;
        } else if (bossState.kind === 'void_architect') {
          // Cryostorm Colossus chains two jumpable fractures; surviving one
          // ring does not let the squad immediately settle back into position.
          this.queueHazard(boss, 'shockwave', boss.x, boss.y, 420, 25, 1_650, '#a5f3fc');
          this.queueHazard(boss, 'shockwave', target.x, target.y, 260, 22, 2_250, '#60a5fa');
          this.nextBossAbilityAtMs = this.elapsedMs + 7_800;
        } else {
          // Pale Leviathan: the expanding ice-breaker can be jumped; its centre
          // lance cannot, giving the encounter its own movement cadence.
          this.queueHazard(boss, 'shockwave', boss.x, boss.y, bossState.phase === 3 ? 620 : 480, 24 + bossState.phase * 4, 1_850, '#b9f5ff');
          this.queueHazard(boss, 'artillery', target.x, target.y, 120, 30, 1_250, '#67e8f9');
          this.nextBossAbilityAtMs = this.elapsedMs + (bossState.phase === 3 ? 6_000 : 8_200);
        }
      } else {
        if (bossState.kind === 'neural_overlord') {
          // Bloom Tyrant tears open at the operator's predicted escape point.
          const echo = this.safeFallbackPosition(target.x + (target.x - boss.x) * .18, target.y + (target.y - boss.y) * .18, 100);
          this.queueHazard(boss, 'ambush', echo.x, echo.y, 118, 30, 1_250, '#ff4fd8');
          this.nextBossAbilityAtMs = this.elapsedMs + 5_900;
        } else if (bossState.kind === 'void_architect') {
          // Graviton Gardener uproots the squad and blooms beneath the pull.
          this.queueHazard(boss, 'gravity', boss.x, boss.y, 560, 8, 1_500, '#d8b4fe');
          this.queueHazard(boss, 'artillery', target.x, target.y, 140, 30, 2_050, '#a3ff6f');
          this.nextBossAbilityAtMs = this.elapsedMs + 6_800;
        } else {
          // Eclipse Heart: pulls the squad inward while a phase echo attacks the
          // predicted retreat point. Both use the existing authoritative hazard
          // budget, so the richer boss costs no per-frame world simulation.
          this.queueHazard(boss, 'gravity', boss.x, boss.y, bossState.phase === 3 ? 760 : 620, 0, 1_700, '#d8b4fe');
          const distance = Math.hypot(target.x - boss.x, target.y - boss.y) || 1;
          const echoX = target.x + (target.x - boss.x) / distance * 150;
          const echoY = target.y + (target.y - boss.y) / distance * 150;
          const echo = this.safeFallbackPosition(echoX, echoY, 90);
          this.queueHazard(boss, 'ambush', echo.x, echo.y, 125, 34, 1_450, '#ff4fd8');
          this.nextBossAbilityAtMs = this.elapsedMs + (bossState.phase === 3 ? 5_400 : 7_800);
        }
      }
      this.emitCombatEvent({ kind: 'boss_ability', x: boss.x, y: boss.y, enemyId: boss.id, amount: bossState.phase, color: boss.color });
      return;
    }
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

  /** Sparse host-authored weather makes each expedition mechanically distinct
   * without adding a second physics world or hundreds of persistent actors. */
  private updateWorldHazards() {
    if (this.currentWorldId === 'neon_bastion' || this.elapsedMs < this.nextWorldHazardAtMs) return;
    const living = [...this.players.values()].filter(player => player.lifeState === 'alive').sort((left, right) => left.id.localeCompare(right.id));
    if (living.length === 0) return;
    const target = living[this.worldHazardSequence % living.length];
    const phase = this.worldHazardSequence * 2.399963;
    if (this.currentWorldId === 'cinderworks') {
      // A travelling furnace rupture creates three readable vents. The line is
      // rotated every cycle so memorising one safe axis never solves the world.
      for (const offset of [-1, 0, 1]) {
        const x = target.x + Math.cos(phase) * offset * 205;
        const y = target.y + Math.sin(phase) * offset * 205;
        const point = this.safeFallbackPosition(x, y, 95);
        this.queueWorldHazard('artillery', point.x, point.y, 112, 24, 1_550, '#ff5a0a');
      }
    } else if (this.currentWorldId === 'white_silence') {
      // The shelf releases a broad cryoseismic ring. It is deliberately
      // jumpable, rewarding mastery of the game's vertical movement.
      const point = this.safeFallbackPosition(target.x + Math.cos(phase) * 120, target.y + Math.sin(phase) * 120, 180);
      this.queueWorldHazard('shockwave', point.x, point.y, 430, 26, 1_850, '#b9f5ff');
    } else {
      // Null Garden tears first pull an operator off a causeway, then bloom at
      // the same location. Both phases are separately telegraphed.
      const point = this.safeFallbackPosition(target.x + Math.cos(phase) * 145, target.y + Math.sin(phase) * 145, 150);
      this.queueWorldHazard('gravity', point.x, point.y, 360, 10, 1_350, '#d8b4fe');
      this.queueWorldHazard('artillery', point.x, point.y, 145, 30, 2_150, '#ff4fd8');
    }
    this.worldHazardSequence++;
    this.nextWorldHazardAtMs = this.elapsedMs + worldHazardIntervalMs(this.currentWorldId, false);
  }

  private queueWorldHazard(kind: CoopHazardSnapshot['kind'], x: number, y: number, radius: number, damage: number, windupMs: number, color: string) {
    if (this.hazards.length >= 24) return;
    this.hazards.push({ id: this.nextEntityId++, enemyId: 0, kind, x, y, radius, damage, startsAtMs: this.elapsedMs, resolvesAtMs: this.elapsedMs + windupMs, color, resolved: false });
  }

  private queueHazard(enemy: CoopEnemy, kind: CoopHazardSnapshot['kind'], x: number, y: number, radius: number, damage: number, windupMs: number, color: string) {
    enemy.attackWindupUntilMs = this.elapsedMs + windupMs;
    this.hazards.push({ id: this.nextEntityId++, enemyId: enemy.id, kind, x, y, radius, damage, startsAtMs: this.elapsedMs, resolvesAtMs: this.elapsedMs + windupMs, color, resolved: false });
  }

  private updateHazards() {
    this.hazards = this.hazards.filter(hazard => this.elapsedMs <= hazard.resolvesAtMs + 350 && (hazard.enemyId === 0 || this.activeEnemyIds.has(hazard.enemyId)));
    for (const hazard of this.hazards) {
      if (hazard.resolved || this.elapsedMs < hazard.resolvesAtMs) continue;
      hazard.resolved = true;
      for (const player of this.players.values()) {
        if (player.lifeState !== 'alive' || Math.hypot(player.x - hazard.x, player.y - hazard.y) > hazard.radius + PLAYER_RADIUS) continue;
        if (hazard.kind === 'shockwave' && player.z > 45) continue;
        if (!hasClearAttackPath(hazard, player, this.currentWorldId)) continue;
        if (hazard.kind === 'gravity') {
          const distance = Math.hypot(hazard.x - player.x, hazard.y - player.y) || 1;
          const position = { x: player.x + (hazard.x - player.x) / distance * 68, y: player.y + (hazard.y - player.y) / distance * 68 };
          resolveWorldCollisions(position, PLAYER_RADIUS, true, this.currentWorldId); player.x = position.x; player.y = position.y;
          if (hazard.damage > 0) this.damagePlayer(player, hazard.damage, hazard.x, hazard.y);
        } else this.damagePlayer(player, hazard.damage, hazard.x, hazard.y);
      }
      for (const structure of this.structures) {
        if (structure.state === 'destroying' || Math.hypot(structure.x - hazard.x, structure.y - hazard.y) > hazard.radius + 90) continue;
        const multiplier = hazard.kind === 'shockwave' ? 7 : hazard.kind === 'gravity' ? 2 : 3;
        this.damageStructure(structure, Math.max(30, hazard.damage * multiplier));
      }
      if (hazard.kind === 'ambush') {
        const source = this.enemies.find(enemy => enemy.id === hazard.enemyId && !enemy.dying);
        if (source && isWorldPositionClear(hazard.x, hazard.y, source.radius, this.currentWorldId)) { source.x = hazard.x; source.y = hazard.y; }
      }
    }
  }

  private updateStructures(deltaMs: number) {
    for (const player of this.players.values()) {
      if (player.fabricatorCharges === COOP_MAX_FABRICATOR_CHARGES) {
        player.fabricatorRechargeAtMs = this.elapsedMs + COOP_FABRICATOR_RECHARGE_MS;
      } else if (player.lifeState === 'alive' && this.elapsedMs >= player.fabricatorRechargeAtMs) {
        player.fabricatorCharges = Math.min(COOP_MAX_FABRICATOR_CHARGES, (player.fabricatorCharges || 0) + 1);
        player.fabricatorRechargeAtMs = this.elapsedMs + COOP_FABRICATOR_RECHARGE_MS;
        this.emitCombatEvent({ kind: 'fabricator_charged', x: player.x, y: player.y, playerId: player.id, amount: player.fabricatorCharges, color: '#67e8f9' });
      }
    }
    const living = [...this.players.values()].filter(player => player.lifeState === 'alive');
    for (const structure of this.structures) {
      if (structure.type === 'bridge_segment') { structure.linkedStructureIds = []; continue; }
      structure.repairingPlayerId = undefined;
      const squadNearby = living.some(player => Math.hypot(player.x - structure.x, player.y - structure.y) <= COOP_STRUCTURE_SQUAD_RANGE);
      if (structure.state !== 'destroying' && !squadNearby) {
        structure.abandonedAtMs ||= this.elapsedMs;
        if (this.elapsedMs - structure.abandonedAtMs >= COOP_ABANDONED_STRUCTURE_GRACE_MS) this.destroyStructure(structure);
      } else if (squadNearby) structure.abandonedAtMs = undefined;
      if (structure.state !== 'destroying' && this.elapsedMs >= structure.expiresAtMs) this.destroyStructure(structure);
      structure.linkedStructureIds = [];
    }
    // Structure combinations are derived from authoritative positions. With an
    // eight-structure squad cap, this tiny pair scan is both simpler and safer
    // than maintaining a mutable connection graph.
    for (let leftIndex = 0; leftIndex < this.structures.length; leftIndex++) {
      const left = this.structures[leftIndex];
      if (left.state === 'destroying' || left.type === 'bridge_segment') continue;
      for (let rightIndex = leftIndex + 1; rightIndex < this.structures.length; rightIndex++) {
        const right = this.structures[rightIndex];
        if (right.state === 'destroying' || right.type === 'bridge_segment') continue;
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        const fenceBarricade = (left.type === 'arc_fence' && right.type === 'barricade') || (right.type === 'arc_fence' && left.type === 'barricade');
        const relayBarricade = (left.type === 'recovery_relay' && right.type === 'barricade') || (right.type === 'recovery_relay' && left.type === 'barricade');
        const fenceNetwork = left.type === 'arc_fence' && right.type === 'arc_fence';
        if (!(fenceBarricade && distance <= 255) && !(relayBarricade && distance <= COOP_STRUCTURE_DEFINITIONS.recovery_relay.radius + 125) && !(fenceNetwork && distance <= 430)) continue;
        left.linkedStructureIds!.push(right.id);
        right.linkedStructureIds!.push(left.id);
        if (relayBarricade) {
          const barricade = left.type === 'barricade' ? left : right;
          this.repairStructureHealth(barricade, 9 * deltaMs / 1000);
        }
      }
    }
    // Holding the normal interaction key repairs the nearest damaged friendly
    // structure whenever no downed teammate has interaction priority.
    for (const player of living) {
      if (!this.inputByPlayer.get(player.id)?.reviving) continue;
      if ([...this.players.values()].some(target => target.lifeState === 'downed' && Math.hypot(player.x - target.x, player.y - target.y) <= COOP_REVIVE_RANGE)) continue;
      const target = this.structures
        .filter(structure => structure.state !== 'destroying' && structure.health < structure.maxHealth && Math.hypot(player.x - structure.x, player.y - structure.y) <= COOP_STRUCTURE_ACTION_RANGE)
        .sort((a, b) => Math.hypot(player.x - a.x, player.y - a.y) - Math.hypot(player.x - b.x, player.y - b.y))[0];
      if (target) {
        target.repairingPlayerId = player.id;
        this.repairStructureHealth(target, COOP_STRUCTURE_REPAIR_PER_SECOND * deltaMs / 1000);
      }
    }
    // Recovery fields never stack. Each living operator is healed once by the
    // oldest containing relay, keeping overlapping support builds honest.
    const relays = this.structures.filter(structure => structure.type === 'recovery_relay' && structure.state !== 'destroying');
    for (const player of this.players.values()) {
      if (player.lifeState !== 'alive' || player.health >= player.maxHealth) continue;
      const relay = relays.find(candidate => structureContainsCircle(candidate, player.x, player.y, PLAYER_RADIUS));
      if (!relay) continue;
      const healing = Math.min(player.maxHealth - player.health, COOP_RECOVERY_RELAY_HEAL_PER_SECOND * deltaMs / 1000);
      player.health += healing;
      const stats = this.runStats.get(relay.ownerId);
      if (stats) stats.engineeringHealing = (stats.engineeringHealing || 0) + healing;
      relay.healingSincePulseByPlayer ||= {};
      relay.healingSincePulseByPlayer[player.id] = (relay.healingSincePulseByPlayer[player.id] || 0) + healing;
    }
    for (const relay of relays) {
      if (this.elapsedMs < (relay.nextSupportPulseAtMs || 0)) continue;
      for (const [playerId, amount] of Object.entries(relay.healingSincePulseByPlayer || {})) {
        if (amount <= 0) continue;
        const player = this.players.get(playerId);
        if (!player) continue;
        this.emitCombatEvent({ kind: 'structure_healed', x: relay.x, y: relay.y, targetX: player.x, targetY: player.y, playerId, structureId: relay.id, structureType: relay.type, amount, color: COOP_STRUCTURE_DEFINITIONS.recovery_relay.color });
      }
      relay.healingSincePulseByPlayer = {};
      relay.pulseAtMs = this.elapsedMs;
      relay.nextSupportPulseAtMs = this.elapsedMs + 900;
    }
    this.structures = this.structures.filter(structure => structure.state !== 'destroying' || (structure.destroyAtMs || 0) > this.elapsedMs);
    for (const key of this.fenceTriggerAt.keys()) {
      if ((this.fenceTriggerAt.get(key) || 0) + 3_000 < this.elapsedMs) this.fenceTriggerAt.delete(key);
    }
  }

  private resolvePlayerStructureCollisions(position: { x: number; y: number }, z: number, radius: number) {
    if (z > 34) return false;
    let collided = false;
    for (const structure of this.structures) {
      if (structure.state === 'destroying') continue;
      collided = resolveBarricadeCollision(position, radius, structure) || collided;
    }
    return collided;
  }

  private getPlayerStructureWallContact(position: { x: number; y: number }, z: number, radius: number) {
    if (z > 34) return undefined;
    for (const structure of this.structures) {
      if (structure.state === 'destroying') continue;
      const contact = getBarricadeWallContact(position, radius, structure);
      if (contact) return contact;
    }
    return undefined;
  }

  private updateEnemyStructureInteractions(enemy: CoopEnemy, deltaMs: number) {
    if (enemy.dying) return;
    for (const fence of this.structures) {
      if (fence.type !== 'arc_fence' || fence.state === 'destroying') continue;
      const linkedFence = this.structures.find(candidate => candidate.id > fence.id && candidate.type === 'arc_fence' && fence.linkedStructureIds?.includes(candidate.id) && candidate.state !== 'destroying');
      if (linkedFence && distanceToSegment(enemy.x, enemy.y, fence.x, fence.y, linkedFence.x, linkedFence.y) <= enemy.radius + 15) this.shockEnemyFromStructure(fence, enemy, .8);
    }
    for (const structure of this.structures) {
      if (structure.state === 'destroying') continue;
      if (structure.type === 'arc_fence' && structureContainsCircle(structure, enemy.x, enemy.y, enemy.radius)) {
        this.shockEnemyFromStructure(structure, enemy);
        continue;
      }
      if (structure.type === 'barricade' && enemy.type !== 'phantom' && resolveBarricadeCollision(enemy, enemy.radius, structure)) {
        this.damageStructure(structure, structureDamagePerSecond(enemy.type) * deltaMs / 1000);
        const linkedFence = this.structures.find(candidate => candidate.type === 'arc_fence' && candidate.state !== 'destroying' && structure.linkedStructureIds?.includes(candidate.id));
        if (linkedFence) this.shockEnemyFromStructure(linkedFence, enemy, .7);
      } else if (structure.type === 'recovery_relay' && structureContainsCircle(structure, enemy.x, enemy.y, enemy.radius, -70)) {
        this.damageStructure(structure, structureDamagePerSecond(enemy.type) * deltaMs / 1000);
      }
    }
  }

  private shockEnemyFromStructure(structure: CoopStructure, enemy: CoopEnemy, multiplier = 1) {
    if (enemy.type === 'phantom' || structure.state === 'destroying') return;
    const key = `${structure.id}:${enemy.id}`;
    if (this.elapsedMs < (this.fenceTriggerAt.get(key) || 0)) return;
    const overcharged = (structure.overchargedUntilMs || 0) > this.elapsedMs;
    const shock = arcFenceShock(enemy.type, enemy.maxHealth);
    this.fenceTriggerAt.set(key, this.elapsedMs + (overcharged ? 450 : COOP_ARC_FENCE_PULSE_COOLDOWN_MS));
    enemy.structureStunUntilMs = Math.max(enemy.structureStunUntilMs || 0, this.elapsedMs + shock.stunMs * (overcharged ? 1.3 : 1));
    structure.pulseAtMs = this.elapsedMs;
    this.applyDamage(enemy, shock.damage * multiplier * (overcharged ? 1.6 : 1), structure.ownerId, 'field_arc_fence');
    this.damageStructure(structure, (enemy.type === 'titan' ? 16 : enemy.type === 'tank' ? 10 : 6) * (overcharged ? 1.55 : 1), false);
    this.emitCombatEvent({ kind: 'fence_triggered', x: structure.x, y: structure.y, targetX: enemy.x, targetY: enemy.y, enemyId: enemy.id, playerId: structure.ownerId, structureId: structure.id, structureType: structure.type, amount: shock.damage, color: COOP_STRUCTURE_DEFINITIONS.arc_fence.color });
  }

  private damageStructure(structure: CoopStructure, amount: number, creditOwner = true) {
    if (structure.type === 'bridge_segment' || structure.state === 'destroying' || amount <= 0) return;
    const wasActive = structure.state === 'active';
    const absorbed = Math.min(structure.health, amount);
    structure.health = Math.max(0, structure.health - absorbed);
    const stats = this.runStats.get(structure.ownerId); if (stats && creditOwner) stats.structureDamageAbsorbed += absorbed;
    if (structure.health <= structure.maxHealth * .5) structure.state = 'damaged';
    if (wasActive && structure.state === 'damaged') {
      this.emitCombatEvent({ kind: 'structure_damaged', x: structure.x, y: structure.y, playerId: structure.ownerId, structureId: structure.id, structureType: structure.type, amount: structure.health, color: '#fbbf24' });
    }
    if (structure.health <= 0) this.destroyStructure(structure);
  }

  private repairStructureHealth(structure: CoopStructure, amount: number) {
    if (structure.state === 'destroying' || amount <= 0 || structure.health >= structure.maxHealth) return;
    structure.health = Math.min(structure.maxHealth, structure.health + amount);
    if (structure.health > structure.maxHealth * .5) structure.state = 'active';
  }

  private destroyStructure(structure: CoopStructure, eventKind: 'structure_destroyed' | 'structure_dismantled' = 'structure_destroyed') {
    if (structure.state === 'destroying') return;
    structure.health = 0;
    structure.state = 'destroying';
    structure.destroyAtMs = this.elapsedMs + COOP_STRUCTURE_DESTROY_MS;
    if (eventKind === 'structure_destroyed') { const stats = this.runStats.get(structure.ownerId); if (stats) stats.structuresLost++; }
    this.emitCombatEvent({ kind: eventKind, x: structure.x, y: structure.y, playerId: structure.ownerId, structureId: structure.id, structureType: structure.type, color: COOP_STRUCTURE_DEFINITIONS[structure.type].color });
  }

  private buildAnchors(): Array<CoopBuildAnchor & { key: string }> {
    const run = this.runDirector.snapshot(this.elapsedMs);
    const anchors: Array<CoopBuildAnchor & { key: string }> = [];
    if (run.objective) anchors.push({ key: `objective:${run.contractIndex}`, x: run.objective.x, y: run.objective.y });
    if (run.boss) anchors.push({ key: `boss:${run.boss.kind}`, x: run.boss.x, y: run.boss.y });
    if (run.exfil) anchors.push({ key: `exfil:${run.contractIndex}`, x: run.exfil.x, y: run.exfil.y });
    for (const station of this.stationDirector.snapshot()) if (station.state !== 'locked') anchors.push({ key: `station:${station.id}`, x: station.x, y: station.y });
    const foundry = this.weaponFoundry.snapshot();
    if (foundry.state !== 'locked') anchors.push({ key: `foundry:${foundry.id}`, x: foundry.x, y: foundry.y });
    const encounter = this.encounterDirector.snapshot(0);
    if (run.phase === 'insertion' || encounter.phase === 'intermission') anchors.push({ key: `rally:${encounter.round}`, ...this.squadCentre(), radius: COOP_BUILD_ZONE_RADIUS });
    return anchors;
  }

  private closestBuildAnchor(x: number, y: number) {
    return this.buildAnchors().sort((left, right) => Math.hypot(left.x - x, left.y - y) - Math.hypot(right.x - x, right.y - y))[0];
  }

  private anchorKey(anchor: CoopBuildAnchor & { key?: string }) { return anchor.key || `${Math.round(anchor.x / 50)}:${Math.round(anchor.y / 50)}`; }

  private acceptEngineeringRequest(cache: Map<string, number>, playerId: string, requestId?: number) {
    if (requestId === undefined) return true;
    if (!Number.isSafeInteger(requestId) || requestId < 1 || requestId <= (cache.get(playerId) || 0)) return false;
    cache.set(playerId, requestId);
    return true;
  }

  private protectedBuildBodies() {
    const run = this.runDirector.snapshot(this.elapsedMs);
    const bodies: Array<{ x: number; y: number; radius: number }> = [];
    if (run.objective) bodies.push({ x: run.objective.x, y: run.objective.y, radius: 82 });
    if (run.exfil) bodies.push({ x: run.exfil.x, y: run.exfil.y, radius: 96 });
    for (const station of this.stationDirector.snapshot()) if (station.state !== 'locked') bodies.push({ x: station.x, y: station.y, radius: 82 });
    const foundry = this.weaponFoundry.snapshot();
    if (foundry.state !== 'locked') bodies.push({ x: foundry.x, y: foundry.y, radius: 110 });
    return bodies;
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
          this.applyDamage(enemy, passiveDamage(module.id, module.rank) * this.imprintModifiers(player).damageMultiplier, player.id, module.id);
        }
        if (module.id === 'neural_pulse' || targetCount > 0) this.emitCombatEvent({ kind: 'passive_triggered', x: player.x, y: player.y, playerId: player.id, weaponId: module.id, color: COOP_PASSIVE_BY_ID[module.id].color });
      }
    }
  }

  private awardCredits(amount: number) {
    const scaledAmount = Math.round(amount * getWorldDefinition(this.currentWorldId).difficulty.rewardMultiplier);
    for (const player of this.players.values()) {
      if (player.lifeState === 'eliminated' || player.lifeState === 'extracted') continue;
      player.coins += scaledAmount;
      const stats = this.runStats.get(player.id); if (stats) stats.creditsEarned += scaledAmount;
    }
  }

  private onBossKilled(enemy: CoopEnemy) {
    this.bossEnemyId = undefined;
    this.nextBossAbilityAtMs = 0;
    const outcome = this.runDirector.completeBoss(this.squadCentre());
    if (outcome === 'checkpoint') {
      this.awardCredits(260);
      const contractIndex = this.runDirector.snapshot(this.elapsedMs).contractIndex;
      this.stationDirector.unlock(contractIndex);
      if (contractIndex === 1) this.weaponFoundry.unlock();
      this.nextScenarioAtMs = 0;
      this.emitCombatEvent({ kind: 'exfil_deployed', x: this.runDirector.currentExfil!.x, y: this.runDirector.currentExfil!.y, color: '#fbbf24' });
    }
    if (outcome === 'exfil') {
      this.awardCredits(400);
      this.emitCombatEvent({ kind: 'exfil_deployed', x: this.runDirector.currentExfil!.x, y: this.runDirector.currentExfil!.y, color: '#fbbf24' });
    }
    this.emitCombatEvent({ kind: 'boss_defeated', x: enemy.x, y: enemy.y, enemyId: enemy.id, color: enemy.color });
  }

  private finishRun(success: boolean) {
    if (this.results) return;
    const run = this.runDirector.snapshot(this.elapsedMs);
    const anyoneExtracted = [...this.players.values()].some(player => player.lifeState === 'extracted');
    const squadWiped = !success && !anyoneExtracted && ![...this.players.values()].some(player =>
      player.lifeState === 'alive' || (player.lifeState === 'downed' && player.selfRevives > 0)
    );
    const players = awardMedals([...this.players.values()].map(player => ({ ...createRunStats(player.id), ...this.runStats.get(player.id), dataCoresExtracted: success || player.lifeState === 'extracted' ? player.pendingDataCores : 0, label: player.label, color: player.color })));
    this.results = { runId: this.runId, success: success || anyoneExtracted, squadWiped, durationMs: Math.round(this.elapsedMs), contractsCompleted: run.contractIndex + this.fieldMissionDirector.completions, bossesDefeated: run.bossesDefeated, players };
    this.matchState = success || anyoneExtracted ? 'active' : squadWiped ? (this.players.size === 1 ? 'solo_defeat' : 'squad_wiped') : 'mission_failed';
  }

  private squadCentre() {
    const living = [...this.players.values()].filter(player => player.lifeState === 'alive');
    const members = living.length ? living : [...this.players.values()].filter(player => player.lifeState !== 'extracted');
    return { x: members.reduce((sum, player) => sum + player.x, 0) / Math.max(1, members.length), y: members.reduce((sum, player) => sum + player.y, 0) / Math.max(1, members.length) };
  }

  private partyScale(perAdditionalPlayer: number) { return 1 + Math.max(0, [...this.players.values()].filter(player => player.lifeState === 'alive' || player.lifeState === 'downed').length - 1) * perAdditionalPlayer; }
  private safeMissionSpawnPosition(anchorX: number, anchorY: number, desiredX: number, desiredY: number, radius: number, index: number) {
    const desired = { x: clamp(desiredX, radius, COOP_WORLD_SIZE - radius), y: clamp(desiredY, radius, COOP_WORLD_SIZE - radius) };
    if (isWorldPositionClear(desired.x, desired.y, radius, this.currentWorldId)) return desired;
    // Search locally around the authored objective. Falling back around the
    // squad could strand one invisible captor a kilometre away and soft-lock
    // Hostage Recovery after the visible group was cleared.
    for (let attempt = 0; attempt < 32; attempt++) {
      const ring = Math.floor(attempt / 8);
      const angle = (attempt % 8) / 8 * Math.PI * 2 + index * .47;
      const distance = 85 + ring * 58;
      const candidate = {
        x: clamp(anchorX + Math.cos(angle) * distance, radius, COOP_WORLD_SIZE - radius),
        y: clamp(anchorY + Math.sin(angle) * distance, radius, COOP_WORLD_SIZE - radius),
      };
      if (isWorldPositionClear(candidate.x, candidate.y, radius, this.currentWorldId)) return candidate;
    }
    const anchor = { x: clamp(anchorX, radius, COOP_WORLD_SIZE - radius), y: clamp(anchorY, radius, COOP_WORLD_SIZE - radius) };
    return isWorldPositionClear(anchor.x, anchor.y, radius, this.currentWorldId) ? anchor : this.safeFallbackPosition(anchorX, anchorY, radius);
  }
  private safeFallbackPosition(x: number, y: number, radius: number) {
    const position = { x: clamp(x, radius, COOP_WORLD_SIZE - radius), y: clamp(y, radius, COOP_WORLD_SIZE - radius) };
    if (isWorldPositionClear(position.x, position.y, radius, this.currentWorldId)) return position;
    return this.safeFallback('', radius);
  }

  private weapon(player: CoopPlayer) { return player.weaponStates[player.selectedSlot]; }
  private imprintModifiers(player: CoopPlayer) { return coopImprintModifiers(normalizeCoopImprintLoadout(player.imprint).ranks); }

  /** The only route for enemy and future hazard damage. Keeping this in the
   * host simulation prevents clients from inventing hits, down states, or
   * revive opportunities. */
  private damagePlayer(player: CoopPlayer, amount: number, sourceX: number, sourceY: number) {
    if (this.matchState !== 'active' || player.lifeState !== 'alive' || player.invulnerableRemainingMs > 0 || amount <= 0) return;
    this.cancelRevivesBy(player.id);
    player.lastArmorDamageAtMs = this.elapsedMs;
    const artifactAbsorbed = Math.min(player.artifactBarrier, amount);
    player.artifactBarrier -= artifactAbsorbed;
    amount -= artifactAbsorbed;
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
    if (player.carryingHostage) {
      const hostage = this.fieldMissionDirector.current?.hostage;
      if (hostage?.carrierId === player.id) {
        hostage.x = player.x; hostage.y = player.y; hostage.carrierId = undefined; hostage.state = 'waiting';
        const mission = this.fieldMissionDirector.current!;
        mission.x = hostage.x; mission.y = hostage.y; mission.progress = 0; mission.required = COOP_HOSTAGE_FREE_DURATION_MS;
        mission.points[0].state = 'arming'; mission.points[1].state = 'locked';
        this.emitCombatEvent({ kind: 'mission_stage', x: hostage.x, y: hostage.y, playerId: player.id, amount: -2, color: '#fbbf24' });
      }
      player.carryingHostage = false;
    }
    player.health = 0;
    player.z = 0; player.verticalVelocity = 0; player.airActionConsumedSinceGrounded = false; player.jetActive = false; player.jetIgnitedThisAirTime = false; player.sliding = false; player.crouching = false; player.artifactBarrier = 0;
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
    if (player.lifeState === 'eliminated' || player.lifeState === 'extracted') return;
    player.health = 0; player.lifeState = 'eliminated'; player.downedRemainingMs = 0;
    player.reviveProgressMs = 0; player.selfReviveProgressMs = 0; player.reviverId = undefined; player.isAiming = false; player.isReloading = false; player.isSwitching = false;
    this.emitCombatEvent({ kind: 'player_eliminated', x: player.x, y: player.y, playerId: player.id, color: player.color });
    if (reason === 'solo defeat' || reason === 'fell from platform') this.finalizeDefeatIfNeeded();
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
    const targets = [...this.players.values()].filter(player => player.lifeState === 'downed');
    const availableRevivers = [...this.players.values()]
      .filter(player => player.lifeState === 'alive' && player.z <= COOP_GROUNDED_INTERACTION_MAX_Z && this.inputByPlayer.get(player.id)?.reviving)
      .sort((left, right) => left.id.localeCompare(right.id));
    const assignments = new Map<string, CoopPlayer>();
    const claimedRevivers = new Set<string>();

    // Keep an in-progress revive attached to the same body while it remains
    // valid. This prevents overlapping bodies from making the interaction
    // jump between targets as their relative positions change slightly.
    for (const target of targets) {
      const reviver = availableRevivers.find(candidate => candidate.id === target.reviverId);
      if (!reviver || claimedRevivers.has(reviver.id) || Math.hypot(reviver.x - target.x, reviver.y - target.y) > COOP_REVIVE_RANGE) continue;
      assignments.set(target.id, reviver);
      claimedRevivers.add(reviver.id);
    }

    // A held interaction belongs to exactly one downed operator. Assign each
    // otherwise-free reviver to their nearest unclaimed body, with player id
    // as the deterministic tie-breaker shared by every host simulation.
    for (const reviver of availableRevivers) {
      if (claimedRevivers.has(reviver.id)) continue;
      const target = targets
        .filter(candidate => !assignments.has(candidate.id) && Math.hypot(reviver.x - candidate.x, reviver.y - candidate.y) <= COOP_REVIVE_RANGE)
        .sort((left, right) => Math.hypot(reviver.x - left.x, reviver.y - left.y) - Math.hypot(reviver.x - right.x, reviver.y - right.y)
          || left.id.localeCompare(right.id))[0];
      if (!target) continue;
      assignments.set(target.id, reviver);
      claimedRevivers.add(reviver.id);
    }

    for (const target of targets) {
      const reviver = assignments.get(target.id);
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
      const relayActive = this.structures.some(structure => structure.type === 'recovery_relay' && structure.state !== 'destroying'
        && (Math.hypot(target.x - structure.x, target.y - structure.y) <= COOP_STRUCTURE_DEFINITIONS.recovery_relay.radius
          || Math.hypot(reviver.x - structure.x, reviver.y - structure.y) <= COOP_STRUCTURE_DEFINITIONS.recovery_relay.radius));
      const reviveDelta = deltaMs * (relayActive ? COOP_RECOVERY_RELAY_REVIVE_MULTIPLIER : 1);
      target.reviveProgressMs = Math.min(COOP_REVIVE_DURATION_MS, target.reviveProgressMs + reviveDelta);
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
    if ([...this.players.values()].some(player => player.lifeState === 'extracted')) { this.finishRun(true); return; }
    this.matchState = this.players.size === 1 ? 'solo_defeat' : 'squad_wiped';
    this.runDirector.fail(); this.finishRun(false);
    this.emitCombatEvent({ kind: this.matchState === 'solo_defeat' ? 'solo_defeat' : 'squad_wiped', x: COOP_WORLD_SIZE / 2, y: COOP_WORLD_SIZE / 2, color: '#fb7185' });
  }

  private switchWeapon(player: CoopPlayer, slot: number) {
    const previous = this.weapon(player); if (previous.state === 'reloading') this.cancelReload(previous);
    player.selectedSlot = slot; player.selectedWeaponId = player.weaponStates[slot].weaponId; player.selectedWeaponLevel = this.weapon(player).level;
    player.isAiming = false; player.isReloading = false; player.isSwitching = true;
    const weapon = this.weapon(player); weapon.state = 'switching'; weapon.switchEndsAtMs = this.elapsedMs + SWITCH_MS * this.imprintModifiers(player).handlingDurationMultiplier; player.weaponActionEndsAtMs = weapon.switchEndsAtMs;
  }
  private advanceWeaponActions(player: CoopPlayer) {
    const weapon = this.weapon(player);
    if (weapon.state === 'switching' && this.elapsedMs >= (weapon.switchEndsAtMs || 0)) { weapon.state = 'ready'; player.isSwitching = false; player.weaponActionEndsAtMs = undefined; }
    if (weapon.state !== 'reloading') return;
    const definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    if (definition.reloadStyle === 'shell_by_shell') {
      if (this.elapsedMs >= (weapon.reloadEndsAtMs || Infinity) && weapon.reserveAmmo > 0 && weapon.magazineAmmo < definition.magazineSize) { weapon.magazineAmmo++; weapon.reserveAmmo--; weapon.shellsLoaded = (weapon.shellsLoaded || 0) + 1; weapon.reloadEndsAtMs = this.elapsedMs + definition.shellInsertMs! * this.imprintModifiers(player).handlingDurationMultiplier; this.emitCombatEvent({ kind: 'reload_shell_loaded', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, amount: weapon.shellsLoaded, color: definition.visual.muzzleColor }); }
      if (weapon.magazineAmmo >= definition.magazineSize || weapon.reserveAmmo <= 0) this.finishReload(player, weapon);
    } else if (this.elapsedMs >= (weapon.reloadEndsAtMs || Infinity)) { const rounds = Math.min(definition.magazineSize - weapon.magazineAmmo, weapon.reserveAmmo); weapon.magazineAmmo += rounds; weapon.reserveAmmo -= rounds; this.finishReload(player, weapon); }
  }
  private startReload(player: CoopPlayer) {
    const weapon = this.weapon(player), definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    if (player.carryingHostage || player.health <= 0 || player.isSwitching || weapon.state !== 'ready' || weapon.magazineAmmo >= definition.magazineSize || weapon.reserveAmmo <= 0) return false;
    const nearSquadmate = player.operatorId === 'solar_guard' && [...this.players.values()].some(ally => ally.id !== player.id && ally.lifeState === 'alive' && Math.hypot(ally.x - player.x, ally.y - player.y) <= 260);
    const handling = this.imprintModifiers(player).handlingDurationMultiplier * (nearSquadmate ? .8 : 1);
    if (nearSquadmate) { player.artifactProc = 'stand_together'; player.artifactProcExpiresAtMs = this.elapsedMs + 1_000; }
    weapon.state = 'reloading'; weapon.reloadStartedAtMs = this.elapsedMs; weapon.reloadEndsAtMs = this.elapsedMs + (definition.reloadStyle === 'shell_by_shell' ? definition.shellInsertMs! : definition.reloadDurationMs!) * handling; weapon.shellsLoaded = 0; player.isReloading = true; player.isAiming = false; player.weaponActionEndsAtMs = weapon.reloadEndsAtMs;
    this.emitCombatEvent({ kind: 'reload_started', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: definition.visual.muzzleColor }); return true;
  }
  private finishReload(player: CoopPlayer, weapon: CoopWeaponRuntime) { weapon.state = 'ready'; weapon.reloadStartedAtMs = undefined; weapon.reloadEndsAtMs = undefined; player.isReloading = false; player.weaponActionEndsAtMs = undefined; this.emitCombatEvent({ kind: 'reload_finished', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: COOP_FIREARM_BY_ID[weapon.weaponId].visual.muzzleColor }); }
  private cancelReload(weapon: CoopWeaponRuntime) { weapon.state = 'ready'; weapon.reloadStartedAtMs = undefined; weapon.reloadEndsAtMs = undefined; }

  private tryCastWeapon(player: CoopPlayer, triggerPressed: boolean, actionId = 0) {
    if (player.carryingHostage) return;
    const weapon = this.weapon(player), definition = COOP_FIREARM_BY_ID[weapon.weaponId];
    if (player.isSwitching || weapon.state === 'switching') return;
    if (weapon.state === 'reloading') {
      if (definition.reloadStyle === 'shell_by_shell' && weapon.magazineAmmo > 0 && triggerPressed) { this.cancelReload(weapon); player.isReloading = false; }
      else return;
    }
    if (weapon.magazineAmmo <= 0) { if (weapon.reserveAmmo > 0) this.startReload(player); else if (triggerPressed) this.emitCombatEvent({ kind: 'empty_fire', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: '#fca5a5' }); return; }
    if (this.elapsedMs < weapon.nextFireAtMs) return;
    const redline = player.operatorId === 'crimson_strike' && weapon.weaponId === 'goreline_repeater' && player.health / Math.max(1, player.maxHealth) <= .45;
    weapon.magazineAmmo--; weapon.nextFireAtMs = this.elapsedMs + firearmFireInterval(definition, weapon.level) * (redline ? .8 : 1); player.shotSequence++;
    if (redline) { player.artifactProc = 'redline'; player.artifactProcExpiresAtMs = this.elapsedMs + 400; }
    const stats = this.runStats.get(player.id); if (stats) stats.shotsFired += definition.pelletCount || 1;
    this.emitCombatEvent({ kind: 'weapon_fired', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: definition.visual.muzzleColor, actionId });
    if (weapon.weaponId === 'arc_launcher') {
      const overloaded = player.artifactProc === 'overload';
      if (overloaded) { player.artifactProc = undefined; player.artifactHitCount = 0; this.emitCombatEvent({ kind: 'passive_triggered', x: player.x, y: player.y, playerId: player.id, weaponId: weapon.weaponId, color: '#bfdbfe' }); }
      const thrustSpread = player.jetActive ? deterministicSigned(player.shotSequence, 0, weapon.weaponId) * definition.hipSpreadRadians * 1.6 : 0;
      this.fireArcBeam(player, firearmDamage(definition, weapon.level) * this.imprintModifiers(player).damageMultiplier * (overloaded ? 1.35 : 1), player.angle + thrustSpread);
      if (weapon.magazineAmmo === 0 && weapon.reserveAmmo > 0) this.startReload(player);
      return;
    }
    if (weapon.weaponId === 'winterglass_projector') {
      const thrustSpread = player.jetActive ? deterministicSigned(player.shotSequence, 0, weapon.weaponId) * definition.hipSpreadRadians * 1.6 : 0;
      const aimAngle = player.angle + thrustSpread;
      this.fireWinterBreath(player, firearmDamage(definition, weapon.level) * this.imprintModifiers(player).damageMultiplier, aimAngle);
      this.spawnWinterglassProjectiles(player, definition, aimAngle);
      if (weapon.magazineAmmo === 0 && weapon.reserveAmmo > 0) this.startReload(player);
      return;
    }
    const count = definition.pelletCount || 1;
    for (let pellet = 0; pellet < count; pellet++) {
      const spread = (definition.pelletCount ? definition.spreadRadians! : firearmSpread(definition, player.isAiming)) * (player.jetActive ? 1.6 : 1);
      const centered = count === 1 ? deterministicSigned(player.shotSequence, pellet, weapon.weaponId) : (pellet / Math.max(1, count - 1) - .5) * 2 + deterministicSigned(player.shotSequence, pellet, weapon.weaponId) * .18;
      const angle = player.angle + centered * spread, pitch = player.aimPitch + deterministicSigned(player.shotSequence, pellet + 71, weapon.weaponId) * spread * .28;
      const projectile: CoopProjectile = { id: this.nextEntityId++, ownerId: player.id, weaponId: weapon.weaponId, x: player.x + Math.cos(angle) * FIREARM_PROJECTILE_START_OFFSET, y: player.y + Math.sin(angle) * FIREARM_PROJECTILE_START_OFFSET, angle, pitch, z: 24 + player.z, radius: definition.projectileRadius, lifeMs: 1100, velocity: definition.projectileVelocity, verticalVelocity: Math.sin(pitch) * definition.projectileVelocity, damage: firearmDamage(definition, weapon.level) * this.imprintModifiers(player).damageMultiplier, penetration: definition.penetration, damageIntervalMs: 1, nextDamageAt: this.elapsedMs };
      this.fastForwardShot(projectile, this.inputAgeMs.get(player.id) || 0);
      if (projectile.lifeMs > 0 && projectile.penetration > 0) this.projectiles.push(projectile);
    }
    if (weapon.magazineAmmo === 0 && weapon.reserveAmmo > 0) this.startReload(player);
  }

  /** Advance a newly accepted remote shot through a short, bounded history
   * window. Small substeps prevent a compensated projectile tunnelling through
   * a target, while the host still owns all hit and damage decisions. */
  private fastForwardShot(projectile: CoopProjectile, ageMs: number) {
    let remaining = Math.min(COOP_MAX_SHOT_COMPENSATION_MS, Math.max(0, ageMs));
    while (remaining > 0 && projectile.penetration > 0) {
      const stepMs = Math.min(12, remaining), seconds = stepMs / 1000;
      const previousX = projectile.x, previousY = projectile.y, previousZ = projectile.z;
      const horizontalVelocity = projectile.velocity * Math.cos(projectile.pitch);
      projectile.x += Math.cos(projectile.angle) * horizontalVelocity * seconds;
      projectile.y += Math.sin(projectile.angle) * horizontalVelocity * seconds;
      projectile.z += projectile.verticalVelocity * seconds;
      projectile.lifeMs -= stepMs;
      const blockedByWorld = this.clipFirearmSegmentToWorld(projectile, previousX, previousY, previousZ);
      const candidates = this.sweptFirearmHits(projectile, previousX, previousY, previousZ);
      for (const enemy of candidates) {
        if (enemy.dying) continue;
        this.applyDamage(enemy, projectile.damage, projectile.ownerId, projectile.weaponId);
        if (projectile.penetration !== 999) projectile.penetration--;
        if (projectile.penetration <= 0) break;
      }
      if (blockedByWorld) {
        projectile.lifeMs = 0;
        break;
      }
      remaining -= stepMs;
    }
  }

  /** Clip a firearm's swept segment to the first solid city surface or the
   * ground. The one terminal event feeds the renderer's capped GPU particle
   * buffer; no impact meshes or simulation entities are created. */
  private clipFirearmSegmentToWorld(projectile: CoopProjectile, fromX: number, fromY: number, fromZ: number): boolean {
    const dx = projectile.x - fromX, dy = projectile.y - fromY;
    const distance = Math.hypot(dx, dy);
    if (distance < .0001) return false;
    const verticalDelta = projectile.z - fromZ;
    const hit = raycastWorldObstacles(fromX, fromY, fromZ, dx, dy, verticalDelta / distance, distance, this.currentWorldId);
    const groundT = verticalDelta < 0 && fromZ >= 0 && projectile.z <= 0 ? fromZ / -verticalDelta : Infinity;
    const groundDistance = groundT <= 1 ? distance * groundT : Infinity;
    if (!hit && !Number.isFinite(groundDistance)) return false;

    let normalX = 0, normalY = 0, normalZ = 1;
    if (hit && hit.distance <= groundDistance) {
      projectile.x = hit.x;
      projectile.y = hit.y;
      projectile.z = hit.z;
      if (Math.abs(hit.z - hit.obstacle.elevation) > .01) {
        const sides = [
          { distance: Math.abs(hit.x - hit.obstacle.x), x: -1, y: 0 },
          { distance: Math.abs(hit.x - hit.obstacle.x - hit.obstacle.width), x: 1, y: 0 },
          { distance: Math.abs(hit.y - hit.obstacle.y), x: 0, y: -1 },
          { distance: Math.abs(hit.y - hit.obstacle.y - hit.obstacle.height), x: 0, y: 1 },
        ];
        const side = sides.reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest);
        normalX = side.x; normalY = side.y; normalZ = 0;
      }
    } else {
      projectile.x = fromX + dx * groundT;
      projectile.y = fromY + dy * groundT;
      projectile.z = 0;
    }
    this.emitCombatEvent({
      kind: 'projectile_impact', x: projectile.x, y: projectile.y, z: projectile.z,
      normalX, normalY, normalZ, playerId: projectile.ownerId, weaponId: projectile.weaponId,
      color: COOP_WEAPON_DETAILS[projectile.weaponId].color,
    });
    return true;
  }

  /** Continuous collision for fast firearm rounds. Testing the complete host
   * tick segment removes the close-range and low-frame-rate tunnelling gap. */
  private sweptFirearmHits(projectile: CoopProjectile, fromX: number, fromY: number, fromZ: number): CoopEnemy[] {
    const dx = projectile.x - fromX, dy = projectile.y - fromY;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    const middleX = (fromX + projectile.x) * .5, middleY = (fromY + projectile.y) * .5;
    const candidates = this.enemySpatialIndex.query(middleX, middleY, length * .5 + projectile.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies);
    this.sweptEnemies.length = 0;
    for (const enemy of candidates) {
        if (enemy.dying) continue;
        const t = lengthSquared > .0001 ? clamp(((enemy.x - fromX) * dx + (enemy.y - fromY) * dy) / lengthSquared, 0, 1) : 0;
        const closestX = fromX + dx * t, closestY = fromY + dy * t;
        const hitRadius = enemy.radius + projectile.radius;
        const horizontalHit = (enemy.x - closestX) ** 2 + (enemy.y - closestY) ** 2 < hitRadius * hitRadius;
        const beamZ = fromZ + (projectile.z - fromZ) * t;
        const verticalHit = beamZ >= -projectile.radius && beamZ <= ENEMY_HIT_HEIGHT + enemy.radius + projectile.radius;
        if (horizontalHit && verticalHit) this.sweptEnemies.push(enemy);
    }
    if (this.sweptEnemies.length > 1) this.sweptEnemies.sort((a, b) => {
      const ta = lengthSquared > .0001 ? clamp(((a.x - fromX) * dx + (a.y - fromY) * dy) / lengthSquared, 0, 1) : 0;
      const tb = lengthSquared > .0001 ? clamp(((b.x - fromX) * dx + (b.y - fromY) * dy) / lengthSquared, 0, 1) : 0;
      return ta - tb || a.id - b.id;
    });
    return this.sweptEnemies;
  }

  /** The only co-op path allowed to damage an enemy. It creates presentation
   * state and funnels all lethal outcomes through one idempotent death flow. */
  private applyDamage(enemy: CoopEnemy, amount: number, playerId: string, weaponId?: CoopWeaponId) {
    if (enemy.dying || amount <= 0) return;
    const damage = Math.max(0, Math.min(amount, enemy.health));
    enemy.health = Math.max(0, enemy.health - damage);
    const stats = this.runStats.get(playerId);
    if (stats) {
      if (weaponId === 'field_arc_fence') {
        stats.engineeringDamage += damage;
      } else if (isPassiveModule(weaponId)) {
        stats.passiveDamage += damage;
        stats.passiveDamageById[weaponId] = (stats.passiveDamageById[weaponId] || 0) + damage;
      } else { stats.firearmDamage += damage; stats.shotsHit++; }
      if (enemy.id === this.bossEnemyId) stats.bossDamage += damage;
    }
    enemy.hitFlashUntilMs = this.elapsedMs + HIT_FLASH_MS;
    enemy.hitFlashMs = HIT_FLASH_MS;
    this.emitCombatEvent({ kind: 'enemy_hit', x: enemy.x, y: enemy.y, enemyId: enemy.id, playerId, amount: damage, color: enemy.color, weaponId });
    this.emitCombatEvent({ kind: 'damage_number', x: enemy.x, y: enemy.y, enemyId: enemy.id, playerId, amount: damage, color: '#ffffff', weaponId });
    if (isArtifactPrimary(weaponId)) this.applyArtifactPrimaryHit(enemy, playerId, weaponId);
    if (enemy.health <= 0) this.killEnemy(enemy, playerId, weaponId);
    return damage;
  }

  /** Instant host-owned lightning cast. The first intersected body becomes
   * the beam endpoint; a miss terminates at the aimed maximum range. */
  private fireArcBeam(player: CoopPlayer, damage: number, aimAngle = player.angle) {
    const horizontalRange = ARC_BEAM_RANGE * Math.cos(player.aimPitch);
    const directionX = Math.cos(aimAngle), directionY = Math.sin(aimAngle);
    const traceStartX = player.x, traceStartY = player.y;
    const visualStartX = player.x + directionX * 26, visualStartY = player.y + directionY * 26;
    const startZ = 24 + player.z;
    const worldHit = raycastWorldObstacles(traceStartX, traceStartY, startZ, directionX, directionY, Math.tan(player.aimPitch), horizontalRange, this.currentWorldId);
    const unobstructedRange = worldHit?.distance ?? horizontalRange;
    const candidates = this.enemySpatialIndex.query(traceStartX + directionX * horizontalRange * .5, traceStartY + directionY * horizontalRange * .5, horizontalRange * .5 + MAX_ENEMY_RADIUS, this.nearbyEnemies)
      .filter(enemy => !enemy.dying)
      .map(enemy => {
        const relativeX = enemy.x - traceStartX, relativeY = enemy.y - traceStartY;
        const along = relativeX * directionX + relativeY * directionY;
        const perpendicular = Math.abs(relativeX * directionY - relativeY * directionX);
        const beamZ = startZ + Math.tan(player.aimPitch) * along;
        const verticalHit = beamZ >= -5 && beamZ <= ENEMY_HIT_HEIGHT + enemy.radius + 5;
        return { enemy, along, hit: along >= 0 && along <= unobstructedRange && perpendicular <= enemy.radius + 7 && verticalHit };
      })
      .filter(candidate => candidate.hit)
      .sort((a, b) => a.along - b.along || a.enemy.id - b.enemy.id);
    const primary = candidates[0]?.enemy;
    const targetX = primary?.x ?? worldHit?.x ?? traceStartX + directionX * horizontalRange;
    const targetY = primary?.y ?? worldHit?.y ?? traceStartY + directionY * horizontalRange;
    this.emitCombatEvent({ kind: 'arc_beam', x: visualStartX, y: visualStartY, targetX, targetY, enemyId: primary?.id, playerId: player.id, weaponId: 'arc_launcher', color: '#60a5fa' });
    if (primary) {
      const chainCount = this.applyArcImpact(player.id, damage, primary);
      this.addArtifactResource(player, chainCount === ARC_CHAIN_TARGETS ? 2 : 1);
      if (chainCount === ARC_CHAIN_TARGETS) {
        player.artifactHitCount++;
        if (player.artifactHitCount >= 3) { player.artifactHitCount = 0; player.artifactProc = 'overload'; player.artifactProcExpiresAtMs = this.elapsedMs + 10_000; }
      }
    }
  }

  /** Chain selection is sorted independently of spatial-hash bucket order, so
   * every peer presents the exact same enemy-to-enemy sequence. */
  private applyArcImpact(ownerId: string, damage: number, primary: CoopEnemy) {
    this.applyDamage(primary, damage, ownerId, 'arc_launcher');
    const eligible = this.enemySpatialIndex.query(primary.x, primary.y, ARC_CHAIN_RADIUS + MAX_ENEMY_RADIUS, this.nearbyEnemies)
      .filter(enemy => enemy.id !== primary.id && !enemy.dying && (enemy.x - primary.x) ** 2 + (enemy.y - primary.y) ** 2 <= ARC_CHAIN_RADIUS ** 2)
      .filter(enemy => {
        const distance = Math.hypot(enemy.x - primary.x, enemy.y - primary.y);
        return !raycastWorldObstacles(primary.x, primary.y, ENEMY_HIT_HEIGHT * .5, enemy.x - primary.x, enemy.y - primary.y, 0, distance, this.currentWorldId);
      })
      .map(enemy => ({ enemy, distance: (enemy.x - primary.x) ** 2 + (enemy.y - primary.y) ** 2 }))
      .sort((a, b) => a.distance - b.distance || a.enemy.id - b.enemy.id)
      .slice(0, ARC_CHAIN_TARGETS);
    let source = primary;
    eligible.forEach(({ enemy }, index) => {
      this.emitCombatEvent({ kind: 'arc_chain', x: source.x, y: source.y, targetX: enemy.x, targetY: enemy.y, enemyId: enemy.id, playerId: ownerId, weaponId: 'arc_launcher', chainIndex: index, color: '#93c5fd' });
      this.applyDamage(enemy, damage * ARC_CHAIN_DAMAGE_RATIO, ownerId, 'arc_launcher');
      source = enemy;
    });
    if (primary.type === 'titan' && eligible.length < ARC_CHAIN_TARGETS && !primary.dying) {
      this.applyDamage(primary, damage * ARC_UNUSED_BOSS_DAMAGE_RATIO * (ARC_CHAIN_TARGETS - eligible.length), ownerId, 'arc_launcher');
    }
    return eligible.length;
  }

  private addArtifactResource(player: CoopPlayer | undefined, amount: number) {
    if (!player || amount <= 0) return;
    player.artifactResource = Math.min(player.artifactResourceMax, player.artifactResource + amount);
    player.artifactLastActionAtMs = this.elapsedMs;
  }

  private applyArtifactPrimaryHit(enemy: CoopEnemy, ownerId: string, weaponId: CoopWeaponId) {
    const player = this.players.get(ownerId);
    if (!player) return;
    player.artifactLastActionAtMs = this.elapsedMs;
    if (weaponId === 'goreline_repeater') {
      this.addArtifactResource(player, 3 + (enemy.health / Math.max(1, enemy.maxHealth) <= .35 ? 2 : 0));
      return;
    }
    if (weaponId === 'riftspike_array') {
      if (player.artifactTargetId !== enemy.id) { player.artifactTargetId = enemy.id; player.artifactResource = 0; }
      const origin = player.echoPositions[0];
      const slipstream = origin && Math.hypot(player.x - origin.x, player.y - origin.y) >= 120 && this.elapsedMs >= player.slipstreamReadyAtMs;
      this.addArtifactResource(player, slipstream ? 2 : 1);
      if (slipstream) { player.slipstreamReadyAtMs = this.elapsedMs + 750; player.artifactProc = 'slipstream'; player.artifactProcExpiresAtMs = this.elapsedMs + 800; player.echoPositions.length = 0; }
      return;
    }
    if (weaponId === 'dawnwall_cannon') {
      player.artifactHitCount++;
      if (player.artifactHitCount >= 3) {
        player.artifactHitCount = 0;
        this.addArtifactResource(player, 1 + (enemy.targetPlayerId && enemy.targetPlayerId !== ownerId ? 1 : 0));
      }
      return;
    }
    if (weaponId === 'cinderhex_engine') {
      enemy.cinderhexByOwner ||= new Map();
      const existing = enemy.cinderhexByOwner.get(ownerId);
      enemy.cinderhexByOwner.set(ownerId, { stacks: Math.min(3, (existing?.stacks || 0) + 1), expiresAtMs: this.elapsedMs + 6_000, nextTickAtMs: existing?.nextTickAtMs || this.elapsedMs + 1_000, damageSinceFragment: existing?.damageSinceFragment || 0 });
    }
  }

  private fireWinterBreath(player: CoopPlayer, damage: number, aimAngle = player.angle) {
    const range = 500;
    const horizontalRange = range * Math.cos(player.aimPitch);
    const directionX = Math.cos(aimAngle), directionY = Math.sin(aimAngle);
    const startZ = 24 + player.z;
    const worldHit = raycastWorldObstacles(player.x, player.y, startZ, directionX, directionY, Math.tan(player.aimPitch), horizontalRange, this.currentWorldId);
    const unobstructedRange = worldHit?.distance ?? horizontalRange;
    const candidates = this.enemySpatialIndex.query(player.x + directionX * unobstructedRange * .5, player.y + directionY * unobstructedRange * .5, unobstructedRange * .5 + MAX_ENEMY_RADIUS, this.nearbyEnemies)
      .filter(enemy => !enemy.dying)
      .map(enemy => {
        const relativeX = enemy.x - player.x, relativeY = enemy.y - player.y;
        const along = relativeX * directionX + relativeY * directionY;
        const perpendicular = Math.abs(relativeX * directionY - relativeY * directionX);
        return { enemy, along, perpendicular };
      })
      .filter(({ enemy, along, perpendicular }) => {
        if (along < 0 || along > unobstructedRange + enemy.radius) return false;
        const coneRadius = Math.tan(.18) * along;
        if (perpendicular > coneRadius + enemy.radius) return false;
        const beamZ = startZ + Math.tan(player.aimPitch) * along;
        const verticalConeRadius = Math.tan(.12) * along + enemy.radius;
        if (beamZ + verticalConeRadius < 0 || beamZ - verticalConeRadius > ENEMY_HIT_HEIGHT + enemy.radius) return false;
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        return !raycastWorldObstacles(player.x, player.y, startZ, enemy.x - player.x, enemy.y - player.y, Math.tan(player.aimPitch), distance, this.currentWorldId);
      })
      .sort((a, b) => a.along - b.along || a.enemy.id - b.enemy.id)
      .slice(0, 12);
    for (const { enemy } of candidates) {
      this.applyDamage(enemy, damage, player.id, 'winterglass_projector');
      if (enemy.dying) continue;
      const previous = enemy.chillStacks || 0;
      enemy.chillStacks = Math.min(5, previous + 1);
      enemy.chillExpiresAtMs = this.elapsedMs + 4_000;
      if (previous < 5 && enemy.chillStacks === 5 && this.elapsedMs >= (enemy.rimeGrantedAtMs || 0)) {
        enemy.rimeGrantedAtMs = this.elapsedMs + 5_000;
        this.addArtifactResource(player, 1);
        if (enemy.type !== 'titan') enemy.structureStunUntilMs = Math.max(enemy.structureStunUntilMs || 0, this.elapsedMs + (enemy.type === 'elite' ? 150 : 400));
      }
    }
  }

  /** Winterglass deals one authoritative cone sample per round. These three
   * zero-damage shards make that otherwise-instant cast readable to every
   * peer while retaining the cone's existing balance and bounded entity cost. */
  private spawnWinterglassProjectiles(player: CoopPlayer, definition: CoopFirearmDefinition, aimAngle: number) {
    for (let shard = -1; shard <= 1; shard++) {
      const angleJitter = deterministicSigned(player.shotSequence, shard + 31, definition.id) * .022;
      const pitchJitter = deterministicSigned(player.shotSequence, shard + 47, definition.id) * .025;
      const angle = aimAngle + shard * .105 + angleJitter;
      const pitch = player.aimPitch + shard * .035 + pitchJitter;
      this.projectiles.push({
        id: this.nextEntityId++, ownerId: player.id, weaponId: definition.id,
        x: player.x, y: player.y, z: 24 + player.z, angle, pitch,
        radius: definition.projectileRadius * (shard === 0 ? 1 : .72),
        lifeMs: 600, velocity: definition.projectileVelocity,
        verticalVelocity: Math.sin(pitch) * definition.projectileVelocity,
        damage: 0, penetration: 999, damageIntervalMs: Infinity,
        nextDamageAt: Infinity, presentationOnly: true,
      });
    }
  }

  private tryArtifactSpender(player: CoopPlayer) {
    if (player.lifeState !== 'alive' || player.isReloading || player.isSwitching || player.jetActive) return;
    switch (player.operatorId) {
      case 'neon_vanguard': return this.castStormcall(player);
      case 'crimson_strike': return this.castReckoning(player);
      case 'void_runner': return this.castEchoCollapse(player);
      case 'solar_guard': return this.castDawnwall(player);
      case 'black_ice': return this.castShatter(player);
      case 'royal_inferno': return this.castHellseed(player);
    }
  }

  private castStormcall(player: CoopPlayer) {
    if (player.artifactResource < getCoopOperator(player.operatorId).spenderCost) return;
    player.artifactResource = 0; player.artifactLastActionAtMs = this.elapsedMs;
    const range = 650, directionX = Math.cos(player.angle), directionY = Math.sin(player.angle);
    const obstruction = raycastWorldObstacles(player.x, player.y, 24 + player.z, directionX, directionY, 0, range, this.currentWorldId);
    const placementRange = obstruction ? Math.max(24, obstruction.distance - 36) : range;
    const x = player.x + directionX * placementRange, y = player.y + directionY * placementRange;
    this.artifactEffects.push({ id: this.nextEntityId++, kind: 'stormcall', ownerId: player.id, x, y, radius: 260, remainingMs: 1_900, resolvesAtMs: this.elapsedMs + 1_900, nextTickAtMs: this.elapsedMs + 700, pulsesRemaining: 3 });
    this.emitCombatEvent({ kind: 'artifact_cast', x: player.x, y: player.y, targetX: x, targetY: y, playerId: player.id, weaponId: 'stormcall', color: '#60a5fa' });
    this.trimArtifactEffects();
  }

  private castReckoning(player: CoopPlayer) {
    const cost = getCoopOperator(player.operatorId).spenderCost;
    if (player.artifactResource < cost) return;
    const target = this.aimedEnemy(player, 1_450);
    if (!target) return;
    player.artifactResource -= cost; player.artifactLastActionAtMs = this.elapsedMs;
    let killed = false;
    for (let round = 0; round < 5 && !target.dying; round++) {
      const missing = 1 - target.health / Math.max(1, target.maxHealth);
      this.applyDamage(target, 22 * (1 + missing * .5) * this.imprintModifiers(player).damageMultiplier, player.id, 'reckoning');
      killed ||= target.dying;
    }
    this.emitCombatEvent({ kind: 'artifact_cast', x: player.x, y: player.y, targetX: target.x, targetY: target.y, enemyId: target.id, playerId: player.id, weaponId: 'reckoning', amount: 5, color: '#fb7185' });
    if (killed) { this.addArtifactResource(player, 20); this.grantArtifactBarrier(player, 10, 20, 6_000); const weapon = this.weapon(player); weapon.magazineAmmo = Math.min(COOP_FIREARM_BY_ID[weapon.weaponId].magazineSize, weapon.magazineAmmo + 5); }
  }

  private castEchoCollapse(player: CoopPlayer) {
    const target = this.enemies.find(enemy => enemy.id === player.artifactTargetId && !enemy.dying);
    const seals = Math.floor(player.artifactResource);
    if (!target || seals <= 0) return;
    player.artifactResource = 0; player.artifactTargetId = undefined; player.artifactLastActionAtMs = this.elapsedMs;
    const positions = [...player.echoPositions.slice(-seals), ...Array.from({ length: seals }, () => ({ x: player.x, y: player.y }))].slice(0, seals);
    for (let index = 0; index < positions.length; index++) {
      const origin = positions[index];
      if (target.dying) break;
      const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
      if (!raycastWorldObstacles(origin.x, origin.y, 24, target.x - origin.x, target.y - origin.y, 0, distance, this.currentWorldId)) {
        this.emitCombatEvent({ kind: 'artifact_cast', x: origin.x, y: origin.y, targetX: target.x, targetY: target.y, enemyId: target.id, playerId: player.id, weaponId: 'echo_collapse', chainIndex: index, amount: positions.length, color: '#c084fc' });
        this.applyDamage(target, 30 * this.imprintModifiers(player).damageMultiplier, player.id, 'echo_collapse');
      }
    }
    player.echoPositions.length = 0;
  }

  private castDawnwall(player: CoopPlayer) {
    if (player.artifactResource < getCoopOperator(player.operatorId).spenderCost || this.artifactEffects.some(effect => effect.kind === 'dawnwall' && effect.ownerId === player.id)) return;
    player.artifactResource = 0; player.artifactLastActionAtMs = this.elapsedMs;
    const x = player.x + Math.cos(player.angle) * 180, y = player.y + Math.sin(player.angle) * 180;
    this.grantArtifactBarrier(player, 30, 30, 6_000);
    for (const ally of this.players.values()) if (ally.id !== player.id && ally.lifeState === 'alive' && Math.hypot(ally.x - x, ally.y - y) <= 260) this.grantArtifactBarrier(ally, 12, 12, 6_000);
    this.artifactEffects.push({ id: this.nextEntityId++, kind: 'dawnwall', ownerId: player.id, x, y, radius: 260, remainingMs: 6_000, resolvesAtMs: this.elapsedMs + 6_000, nextTickAtMs: this.elapsedMs, pulsesRemaining: 6 });
    this.emitCombatEvent({ kind: 'artifact_cast', x: player.x, y: player.y, targetX: x, targetY: y, playerId: player.id, weaponId: 'dawnwall', color: '#fbbf24' });
    this.trimArtifactEffects();
  }

  private castShatter(player: CoopPlayer) {
    const cost = getCoopOperator(player.operatorId).spenderCost;
    if (player.artifactResource < cost) return;
    const target = this.aimedEnemy(player, 1_700);
    if (!target) return;
    player.artifactResource -= cost; player.artifactLastActionAtMs = this.elapsedMs;
    const stacks = target.chillStacks || 0;
    this.emitCombatEvent({ kind: 'artifact_cast', x: player.x, y: player.y, targetX: target.x, targetY: target.y, enemyId: target.id, playerId: player.id, weaponId: 'shatter_lance', amount: stacks, color: '#7dd3fc' });
    this.applyDamage(target, (70 + stacks * 12) * this.imprintModifiers(player).damageMultiplier, player.id, 'shatter_lance');
    if (stacks >= 5) {
      let fullTargets = 1;
      const nearby = this.enemySpatialIndex.query(target.x, target.y, 110 + MAX_ENEMY_RADIUS, this.nearbyEnemies).filter(enemy => enemy.id !== target.id && !enemy.dying && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 110 + enemy.radius).slice(0, 8);
      for (const enemy of nearby) { if ((enemy.chillStacks || 0) >= 5) fullTargets++; this.applyDamage(enemy, (35 + (enemy.chillStacks || 0) * 6) * this.imprintModifiers(player).damageMultiplier, player.id, 'shatter_burst'); enemy.chillStacks = 0; }
      if (fullTargets >= 3) { this.addArtifactResource(player, 1); player.artifactProc = 'deep_freeze'; player.artifactProcExpiresAtMs = this.elapsedMs + 1_200; }
    }
    target.chillStacks = 0;
  }

  private castHellseed(player: CoopPlayer) {
    const cost = getCoopOperator(player.operatorId).spenderCost;
    if (player.artifactResource < cost || this.artifactEffects.some(effect => effect.kind === 'hellseed' && effect.ownerId === player.id)) return;
    const target = this.aimedEnemy(player, 1_500);
    if (!target) return;
    const empowered = player.artifactResource >= 5;
    player.artifactResource -= empowered ? 5 : cost; player.artifactLastActionAtMs = this.elapsedMs;
    player.artifactProc = empowered ? 'soulburn' : undefined; player.artifactProcExpiresAtMs = this.elapsedMs + 2_000;
    this.artifactEffects.push({ id: this.nextEntityId++, kind: 'hellseed', ownerId: player.id, x: target.x, y: target.y, radius: empowered ? 250 : 200, remainingMs: 2_000, resolvesAtMs: this.elapsedMs + 2_000, nextTickAtMs: this.elapsedMs + 2_000, targetEnemyId: target.id, empowered });
    this.emitCombatEvent({ kind: 'artifact_cast', x: player.x, y: player.y, targetX: target.x, targetY: target.y, enemyId: target.id, playerId: player.id, weaponId: 'hellseed', amount: empowered ? 5 : 3, color: empowered ? '#fde68a' : '#fb923c' });
    this.trimArtifactEffects();
  }

  private aimedEnemy(player: CoopPlayer, range: number) {
    const directionX = Math.cos(player.angle), directionY = Math.sin(player.angle);
    const horizontalRange = range * Math.cos(player.aimPitch);
    const worldHit = raycastWorldObstacles(player.x, player.y, 24 + player.z, directionX, directionY, Math.tan(player.aimPitch), horizontalRange, this.currentWorldId);
    const maximum = worldHit?.distance ?? horizontalRange;
    return this.enemySpatialIndex.query(player.x + directionX * maximum * .5, player.y + directionY * maximum * .5, maximum * .5 + MAX_ENEMY_RADIUS, this.nearbyEnemies)
      .filter(enemy => !enemy.dying)
      .map(enemy => {
        const dx = enemy.x - player.x, dy = enemy.y - player.y;
        const along = dx * directionX + dy * directionY;
        const aimZ = 24 + player.z + Math.tan(player.aimPitch) * along;
        return { enemy, along, perpendicular: Math.abs(dx * directionY - dy * directionX), aimZ };
      })
      .filter(hit => hit.along >= 0 && hit.along <= maximum && hit.perpendicular <= hit.enemy.radius + 12
        && hit.aimZ >= -5 && hit.aimZ <= ENEMY_HIT_HEIGHT + hit.enemy.radius + 5)
      .sort((a, b) => a.along - b.along || a.enemy.id - b.enemy.id)[0]?.enemy;
  }

  private grantArtifactBarrier(player: CoopPlayer, amount: number, cap: number, durationMs: number) {
    player.artifactBarrier = Math.min(cap, player.artifactBarrier + amount);
    player.artifactBarrierExpiresAtMs = Math.max(player.artifactBarrierExpiresAtMs, this.elapsedMs + durationMs);
  }

  private trimArtifactEffects() {
    while (this.artifactEffects.length > ARTIFACT_ZONE_CAP) this.artifactEffects.shift();
  }

  private updateArtifactEffects(deltaMs: number) {
    for (const effect of this.artifactEffects) {
      effect.remainingMs = Math.max(0, effect.resolvesAtMs - this.elapsedMs);
      const owner = this.players.get(effect.ownerId);
      if (!owner) { effect.remainingMs = 0; continue; }
      if (effect.kind === 'stormcall' && this.elapsedMs >= effect.nextTickAtMs && (effect.pulsesRemaining || 0) > 0) {
        const targets = this.enemySpatialIndex.query(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies).filter(enemy => !enemy.dying && Math.hypot(enemy.x - effect.x, enemy.y - effect.y) <= effect.radius + enemy.radius).sort((a, b) => Math.hypot(a.x - effect.x, a.y - effect.y) - Math.hypot(b.x - effect.x, b.y - effect.y) || a.id - b.id).slice(0, 6);
        for (const enemy of targets) this.applyDamage(enemy, 24 * this.imprintModifiers(owner).damageMultiplier, owner.id, 'stormcall');
        effect.pulsesRemaining!--; effect.nextTickAtMs += 400;
      } else if (effect.kind === 'dawnwall' && this.elapsedMs >= effect.nextTickAtMs) {
        const targets = this.enemySpatialIndex.query(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies).filter(enemy => !enemy.dying && Math.hypot(enemy.x - effect.x, enemy.y - effect.y) <= effect.radius + enemy.radius).slice(0, 12);
        for (const enemy of targets) {
          this.applyDamage(enemy, 12 * this.imprintModifiers(owner).damageMultiplier, owner.id, 'dawnwall');
          if (enemy.type !== 'titan' && enemy.type !== 'ranged') { enemy.targetPlayerId = owner.id; enemy.targetLeaseUntilMs = Math.max(enemy.targetLeaseUntilMs, this.elapsedMs + 1_100); }
        }
        effect.nextTickAtMs += 1_000;
      } else if (effect.kind === 'hellseed') {
        const target = this.enemies.find(enemy => enemy.id === effect.targetEnemyId);
        if (target && !target.dying) { effect.x = target.x; effect.y = target.y; }
        if (this.elapsedMs >= effect.resolvesAtMs || !target || target.dying) {
          const targets = this.enemySpatialIndex.query(effect.x, effect.y, effect.radius + MAX_ENEMY_RADIUS, this.nearbyEnemies).filter(enemy => !enemy.dying && Math.hypot(enemy.x - effect.x, enemy.y - effect.y) <= effect.radius + enemy.radius).slice(0, 8);
          for (const enemy of targets) {
            this.applyDamage(enemy, 90 * this.imprintModifiers(owner).damageMultiplier, owner.id, 'hellseed');
            if (!enemy.dying) {
              enemy.cinderhexByOwner ||= new Map();
              const existing = enemy.cinderhexByOwner.get(owner.id);
              enemy.cinderhexByOwner.set(owner.id, { stacks: Math.min(3, Math.max(2, existing?.stacks || 0)), expiresAtMs: this.elapsedMs + 6_000, nextTickAtMs: existing?.nextTickAtMs || this.elapsedMs + 1_000, damageSinceFragment: existing?.damageSinceFragment || 0 });
            }
          }
          if (effect.empowered) {
            this.artifactEffects.push({ id: this.nextEntityId++, kind: 'emberling', ownerId: owner.id, x: effect.x, y: effect.y, radius: 32, remainingMs: 4_500, resolvesAtMs: this.elapsedMs + 4_500, nextTickAtMs: this.elapsedMs + 250, pulsesRemaining: 9, empowered: true });
            this.trimArtifactEffects();
          }
          effect.remainingMs = 0;
        }
      } else if (effect.kind === 'emberling') {
        const target = this.enemySpatialIndex.query(effect.x, effect.y, 520 + MAX_ENEMY_RADIUS, this.nearbyEnemies)
          .filter(enemy => !enemy.dying)
          .sort((a, b) => Math.hypot(a.x - effect.x, a.y - effect.y) - Math.hypot(b.x - effect.x, b.y - effect.y) || a.id - b.id)[0];
        if (target) {
          const distance = Math.hypot(target.x - effect.x, target.y - effect.y);
          const travel = Math.min(distance, 230 * deltaMs / 1000);
          if (distance > .001) { effect.x += (target.x - effect.x) / distance * travel; effect.y += (target.y - effect.y) / distance * travel; }
          if (this.elapsedMs >= effect.nextTickAtMs && distance <= 330 + target.radius && (effect.pulsesRemaining || 0) > 0) {
            this.applyDamage(target, 24 * this.imprintModifiers(owner).damageMultiplier, owner.id, 'hellseed');
            if (!target.dying) {
              target.cinderhexByOwner ||= new Map();
              const hex = target.cinderhexByOwner.get(owner.id);
              target.cinderhexByOwner.set(owner.id, { stacks: Math.min(3, Math.max(1, hex?.stacks || 0)), expiresAtMs: this.elapsedMs + 6_000, nextTickAtMs: hex?.nextTickAtMs || this.elapsedMs + 1_000, damageSinceFragment: hex?.damageSinceFragment || 0 });
            }
            effect.pulsesRemaining!--; effect.nextTickAtMs += 500;
          }
        }
      }
    }
    retainInPlace(this.artifactEffects, effect => effect.remainingMs > 0 && ((effect.kind !== 'stormcall' && effect.kind !== 'emberling') || (effect.pulsesRemaining || 0) > 0));
  }

  private updateArtifactStatuses() {
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      if ((enemy.chillStacks || 0) > 0 && this.elapsedMs < (enemy.chillExpiresAtMs || 0)) {
        const cap = enemy.type === 'titan' ? .10 : enemy.type === 'elite' ? .20 : .35;
        enemy.slowMultiplier = Math.min(enemy.slowMultiplier, 1 - cap * (enemy.chillStacks || 0) / 5);
        enemy.chillRemainingMs = Math.max(0, (enemy.chillExpiresAtMs || 0) - this.elapsedMs);
      } else if (enemy.chillStacks) { enemy.chillStacks = 0; enemy.chillRemainingMs = 0; enemy.slowMultiplier = 1; }
      let totalCinder = 0, longest = 0;
      for (const [ownerId, hex] of enemy.cinderhexByOwner || []) {
        if (this.elapsedMs >= hex.expiresAtMs) { enemy.cinderhexByOwner!.delete(ownerId); continue; }
        totalCinder += hex.stacks; longest = Math.max(longest, hex.expiresAtMs - this.elapsedMs);
        if (this.elapsedMs >= hex.nextTickAtMs) {
          const owner = this.players.get(ownerId);
          if (owner) {
            const dealt = this.applyDamage(enemy, 4 * hex.stacks * this.imprintModifiers(owner).damageMultiplier, ownerId, 'cinderhex_dot') || 0;
            if (enemy.type === 'elite' || enemy.type === 'titan') {
              hex.damageSinceFragment += dealt;
              const threshold = enemy.type === 'titan' ? 300 : 200;
              if (hex.damageSinceFragment >= threshold) { hex.damageSinceFragment -= threshold; this.addArtifactResource(owner, 1); }
            }
          }
          hex.nextTickAtMs += 1_000;
        }
      }
      enemy.cinderhexStacks = totalCinder; enemy.cinderhexRemainingMs = longest;
    }
  }

  private killEnemy(enemy: CoopEnemy, playerId: string, weaponId?: CoopWeaponId) {
    if (enemy.dying) return;
    enemy.health = 0;
    enemy.dying = true;
    enemy.killedByPlayerId = playerId;
    enemy.deathUntilMs = this.elapsedMs + COOP_ENEMY_DEATH_PRESENTATION_MS;
    enemy.deathRemainingMs = COOP_ENEMY_DEATH_PRESENTATION_MS;
    this.kills++;
    for (const ownerId of enemy.cinderhexByOwner?.keys() || []) this.addArtifactResource(this.players.get(ownerId), 1);
    const stats = this.runStats.get(playerId); if (stats) stats.kills++;
    this.emitCombatEvent({ kind: 'enemy_killed', x: enemy.x, y: enemy.y, enemyId: enemy.id, playerId, killedByPlayerId: playerId, color: enemy.color, weaponId });
    this.spawnGem(enemy.x, enemy.y, enemy.experienceValue, playerId);
    const killer = this.players.get(playerId);
    if (killer && (killer.fabricatorCharges || 0) < COOP_MAX_FABRICATOR_CHARGES && (enemy.type === 'elite' || enemy.type === 'titan')) {
      killer.fabricatorRechargeAtMs = Math.max(this.elapsedMs, killer.fabricatorRechargeAtMs - COOP_ELITE_SCRAP_ACCELERATION_MS);
      this.emitCombatEvent({ kind: 'fabricator_scrap', x: enemy.x, y: enemy.y, playerId, amount: COOP_ELITE_SCRAP_ACCELERATION_MS / 1000, color: '#67e8f9' });
    }
    if (killer && (enemy.type === 'elite' || enemy.type === 'titan' || this.random() < enemyAmmoDropChance(enemy.type))) this.spawnAmmoCache(enemy.x, enemy.y, killer, enemy.type === 'elite' || enemy.type === 'titan', playerId);

    const guaranteedDrop = getGuaranteedEnemyDrop(enemy.type);
    if (guaranteedDrop) this.spawnItem(enemy.x, enemy.y, guaranteedDrop, playerId);
    if (enemy.isHolder) {
      this.spawnItem(enemy.x, enemy.y, rollHolderItem(() => this.random()), playerId);
    } else {
      const lootMultiplier = getWorldDefinition(this.currentWorldId).difficulty.rewardMultiplier;
      const coin = rollCoinDrop(enemy.type, 1, Math.min(.58, .22 * lootMultiplier), () => this.random());
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
    this.onFieldMissionEnemyKilled(enemy);
  }

  private onFieldMissionEnemyKilled(enemy: CoopEnemy) {
    const mission = this.fieldMissionDirector.current;
    const enclave = this.gasEnclave;
    if (enclave && enclave.guardIds.includes(enemy.id)) {
      enclave.guardIds = enclave.guardIds.filter(id => id !== enemy.id);
      if (!mission || mission.id !== enclave.missionSiteId) return;
    }
    if (enclave && enemy.id === enclave.commanderId) {
      this.gasEnclave = undefined;
      if (mission?.id === enclave.missionSiteId && mission.kind === 'toxic_hunt') {
        mission.targetEnemyIds = mission.targetEnemyIds.filter(id => id !== enemy.id);
        this.completeFieldMission();
      } else {
        const removed = this.fieldMissionDirector.removeAvailable(enclave.missionSiteId);
        this.pings = this.pings.filter(ping => ping.missionSiteId !== enclave.missionSiteId);
        for (const guard of this.enemies) {
          if (!enclave.guardIds.includes(guard.id)) continue;
          guard.missionId = undefined; guard.missionRole = undefined;
          guard.missionAnchorX = undefined; guard.missionAnchorY = undefined;
        }
        if (removed) this.emitCombatEvent({ kind: 'mission_expired', x: enemy.x, y: enemy.y, enemyId: enemy.id, color: '#4ade80' });
      }
      return;
    }
    if (!mission || enemy.missionId !== mission.id) return;
    mission.guardEnemyIds = mission.guardEnemyIds.filter(id => id !== enemy.id);
    if (enemy.missionRole === 'courier' && mission.kind === 'courier_intercept') {
      mission.courierEnemyIds = mission.courierEnemyIds.filter(id => id !== enemy.id);
      mission.drives.push({ id: enemy.id, x: enemy.x, y: enemy.y, collected: false });
      const couriersEliminated = 3 - mission.courierEnemyIds.length;
      if (!mission.courierEnemyIds.length) {
        mission.stage = 'recover'; mission.progress = mission.drives.filter(drive => drive.collected).length;
      } else {
        mission.stage = 'intercept'; mission.progress = couriersEliminated;
      }
      mission.required = 3;
      const nextTarget = resolveCoopMissionNavigationTarget(mission, this.enemies);
      mission.x = nextTarget?.x ?? enemy.x; mission.y = nextTarget?.y ?? enemy.y;
      this.emitCombatEvent({ kind: 'mission_stage', x: enemy.x, y: enemy.y, enemyId: enemy.id, amount: couriersEliminated, color: '#f59e0b' });
    }
  }

  private spawnGem(x: number, y: number, value: number, killedByPlayerId?: string) {
    if (this.gems.length >= COOP_MAX_WORLD_GEMS) {
      const merge = closestDrop(this.gems, x, y);
      if (merge) { merge.value += value; this.emitCombatEvent({ kind: 'drop_spawned', x: merge.x, y: merge.y, playerId: killedByPlayerId, amount: value, color: merge.color }); }
      return;
    }
    const gem: CoopGemSnapshot = { id: this.nextEntityId++, x, y, value, color: WORLD_GEM_COLORS[this.currentWorldId] || EXPERIENCE_GEM_COLOR };
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
          for (const member of this.players.values()) if (member.lifeState !== 'eliminated' && member.lifeState !== 'extracted') member.pendingDataCores += definition.value;
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
      const player = this.closestAttractedPlayer(gem.x, gem.y, GEM_MAGNET_RANGE);
      if (!player) continue;
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const distance = Math.hypot(dx, dy);
      if (distance < GEM_MAGNET_RANGE * this.imprintModifiers(player).pickupRadiusMultiplier && distance > 0.0001) {
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
      if (item.manualDropKind) continue;
      const player = this.closestAttractedPlayer(item.x, item.y, ITEM_MAGNET_RANGE);
      if (!player) continue;
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      const distance = Math.hypot(dx, dy);
      if (distance < ITEM_MAGNET_RANGE * this.imprintModifiers(player).pickupRadiusMultiplier && distance > 0.0001) {
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
      const player = this.closestAttractedPlayer(cache.x, cache.y, ITEM_MAGNET_RANGE);
      if (!player) continue;
      const dx = player.x - cache.x, dy = player.y - cache.y, distance = Math.hypot(dx, dy);
      if (distance < ITEM_MAGNET_RANGE * this.imprintModifiers(player).pickupRadiusMultiplier && distance > .0001) { const step = Math.min(distance, 360 * seconds); cache.x += dx / distance * step; cache.y += dy / distance * step; }
      if (distance <= PLAYER_RADIUS + ITEM_PICKUP_RADIUS) {
        let weapon = player.weaponStates.find(state => COOP_FIREARM_BY_ID[state.weaponId].ammoType === cache.ammoType && state.reserveAmmo < COOP_FIREARM_BY_ID[state.weaponId].maxReserve);
        if (!weapon) weapon = player.weaponStates.reduce((lowest, candidate) => candidate.reserveAmmo / COOP_FIREARM_BY_ID[candidate.weaponId].maxReserve < lowest.reserveAmmo / COOP_FIREARM_BY_ID[lowest.weaponId].maxReserve ? candidate : lowest, this.weapon(player));
        const definition = COOP_FIREARM_BY_ID[weapon.weaponId], granted = Math.max(0, Math.min(cache.amount, definition.maxReserve - weapon.reserveAmmo));
        weapon.reserveAmmo += granted; this.emitCombatEvent({ kind: 'ammo_collected', x: cache.x, y: cache.y, playerId: player.id, weaponId: weapon.weaponId, ammoType: definition.ammoType, amount: granted, color: cache.color }); collectedCacheIds.add(cache.id);
      }
    }
    if (collectedCacheIds.size) this.ammoCaches = this.ammoCaches.filter(cache => !collectedCacheIds.has(cache.id));
  }

  private collectManualDrop(player: CoopPlayer) {
    if (player.z > COOP_GROUNDED_INTERACTION_MAX_Z) return false;
    let closest: CoopItemSnapshot | undefined;
    let closestDistance = COOP_MANUAL_PICKUP_RANGE;
    for (const item of this.items) {
      if (!item.manualDropKind) continue;
      if (item.manualDropKind === 'self_revive' && player.selfRevives > 0) continue;
      const distance = Math.hypot(item.x - player.x, item.y - player.y);
      if (distance > closestDistance) continue;
      closest = item;
      closestDistance = distance;
    }
    if (!closest) return false;
    if (closest.manualDropKind === 'cash') {
      player.coins += closest.value;
    } else player.selfRevives++;
    this.items = this.items.filter(item => item.id !== closest!.id);
    this.emitCombatEvent({ kind: 'pickup_collected', x: closest.x, y: closest.y, playerId: player.id, itemType: closest.type, amount: closest.value, color: closest.color });
    return true;
  }

  private collectGem(gem: CoopGemSnapshot, player: CoopPlayer) {
    // XP is a squad resource. Reach helps recover it without stealing levels
    // from the teammate who happened to stand nearest to the drop.
    for (const member of this.players.values()) if (member.lifeState !== 'eliminated' && member.lifeState !== 'extracted') this.addExperience(member, gem.value);
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
      // Data Cores fund every deployed Imprint; they are never a last-hit or
      // pickup-radius contest between co-op partners.
      for (const member of this.players.values()) if (member.lifeState !== 'eliminated' && member.lifeState !== 'extracted') member.pendingDataCores += effect.amount;
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
    const identity = worldEnemyIdentity(this.currentWorldId, type);
    const difficulty = getWorldDefinition(this.currentWorldId).difficulty;
    const players = this.encounterPlayers();
    const clusters = buildEncounterClusters(players, this.enemies);
    const cluster = clusters.find(candidate => candidate.playerIds.includes(targetPlayerId)) || clusters[0];
    const position = openingPosition || (cluster && this.spawnTopology.find(cluster, players, definition.radius, this.enemies)) || this.safeFallback(targetPlayerId, definition.radius);
    this.enemies.push({
      id: this.nextEntityId++, x: position.x, y: position.y, health: definition.health * healthMultiplier * difficulty.healthMultiplier, maxHealth: definition.health * healthMultiplier * difficulty.healthMultiplier,
      type, color: identity.color, worldId: this.currentWorldId, archetypeName: identity.name, radius: definition.radius, damage: definition.damage * damageMultiplier * difficulty.damageMultiplier, speed: definition.speed,
      experienceValue: Math.round(definition.xp * (.75 + healthMultiplier * .25) * difficulty.rewardMultiplier), hitFlashMs: 0, hitFlashUntilMs: 0, slowMultiplier: 1,
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
    const orders = this.encounterDirector.schedule(this.worldElapsedMs(), this.encounterEnemies(), this.encounterPlayers(), capacity);
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
      if (!isWorldPositionClear(x, y, radius + 6, this.currentWorldId)) continue;
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
      player.fabricatorCharges = Math.min(COOP_MAX_FABRICATOR_CHARGES, (player.fabricatorCharges || 0) + 1);
      this.spawnAmmoCache(player.x, player.y, player, true, player.id);
    }
    for (const structure of this.structures) {
      if (structure.state === 'destroying') continue;
      this.repairStructureHealth(structure, structure.maxHealth * .25);
    }
    this.emitCombatEvent({ kind: 'round_completed', x: centre.x, y: centre.y, amount: event.round, color: '#5eead4' });
  }

  private encounterPlayers(): EncounterPlayer[] { return [...this.players.values()].filter(player => player.lifeState === 'alive').map(({ id, x, y, angle, health }) => ({ id, x, y, angle, health })); }
  private encounterEnemies() { return this.enemies.filter(enemy => enemy.spawnPacketId !== undefined); }

  private safeFallback(targetPlayerId: string, radius: number) {
    const target = this.players.get(targetPlayerId) || this.closestLivingPlayer(COOP_WORLD_SIZE / 2, COOP_WORLD_SIZE / 2);
    const base = target || { x: COOP_WORLD_SIZE / 2, y: COOP_WORLD_SIZE / 2 };
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = (attempt / 16) * Math.PI * 2 + this.random() * 0.08;
      const position = { x: clamp(base.x + Math.cos(angle) * 980, radius, COOP_WORLD_SIZE - radius), y: clamp(base.y + Math.sin(angle) * 980, radius, COOP_WORLD_SIZE - radius) };
      if (isWorldPositionClear(position.x, position.y, radius, this.currentWorldId)) return position;
    }
    return { x: clamp(base.x + 900, radius, COOP_WORLD_SIZE - radius), y: base.y };
  }

  private closestLivingPlayer(x: number, y: number): CoopPlayer | undefined {
    let target: CoopPlayer | undefined;
    let distance = Infinity;
    for (const player of this.players.values()) {
      if (player.health <= 0 || player.z > COOP_GROUNDED_INTERACTION_MAX_Z) continue;
      const candidateDistance = (player.x - x) ** 2 + (player.y - y) ** 2;
      if (candidateDistance < distance || (candidateDistance === distance && target !== undefined && player.id < target.id)) {
        target = player;
        distance = candidateDistance;
      }
    }
    return target;
  }

  private closestAttractedPlayer(x: number, y: number, baseRange: number): CoopPlayer | undefined {
    let target: CoopPlayer | undefined;
    let score = Infinity;
    for (const player of this.players.values()) {
      if (player.health <= 0) continue;
      const distance = Math.hypot(player.x - x, player.y - y);
      const range = baseRange * this.imprintModifiers(player).pickupRadiusMultiplier;
      if (distance > range) continue;
      const candidateScore = distance / range;
      if (candidateScore < score || (candidateScore === score && target !== undefined && player.id < target.id)) {
        target = player;
        score = candidateScore;
      }
    }
    return target;
  }

  private resolveEnemyTarget(enemy: CoopEnemy) {
    if (enemy.type !== 'phantom' && enemy.type !== 'titan') {
      const leasedDecoy = enemy.targetStructureId === undefined ? undefined : this.structures.find(structure => structure.id === enemy.targetStructureId && structure.type === 'decoy_beacon' && structure.state !== 'destroying');
      if (leasedDecoy && this.elapsedMs < enemy.targetLeaseUntilMs) return leasedDecoy;
      const decoy = this.structures
        .filter(structure => structure.type === 'decoy_beacon' && structure.state !== 'destroying')
        .map(structure => ({ structure, distance: Math.hypot(structure.x - enemy.x, structure.y - enemy.y), range: COOP_DECOY_ATTRACT_RANGE * ((structure.overchargedUntilMs || 0) > this.elapsedMs ? 1.5 : 1) }))
        .filter(candidate => candidate.distance <= candidate.range)
        .sort((left, right) => left.distance - right.distance || left.structure.id - right.structure.id)[0]?.structure;
      if (decoy) {
        enemy.targetStructureId = decoy.id;
        enemy.targetPlayerId = undefined;
        enemy.targetLeaseUntilMs = this.elapsedMs + 1_250;
        return decoy;
      }
    }
    enemy.targetStructureId = undefined;
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

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared > .0001 ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * amount), py - (ay + dy * amount));
}

const WORLD_ENEMY_NAMES: Readonly<Record<WorldId, Readonly<Record<keyof typeof ENEMY_TYPES, string>>>> = Object.freeze({
  neon_bastion: { basic: 'Signal Drone', fast: 'Neon Ripper', ranged: 'Rail Seer', tank: 'Bastion Bulwark', phantom: 'Static Phantom', elite: 'Grid Commander', titan: 'Singularity' },
  cinderworks: { basic: 'Slag Drone', fast: 'Ash Hound', ranged: 'Magma Artillerist', tank: 'Crucible Guard', phantom: 'Smoke Stalker', elite: 'Forge Warden', titan: 'Furnace Sovereign' },
  white_silence: { basic: 'Frostling', fast: 'Shard Runner', ranged: 'Cryo Seer', tank: 'Glacial Bulwark', phantom: 'White Wraith', elite: 'Rime Commander', titan: 'Pale Leviathan' },
  null_garden: { basic: 'Sporeling', fast: 'Blinkling', ranged: 'Void Bloom', tank: 'Root Guardian', phantom: 'Phase Stalker', elite: 'Garden Mind', titan: 'Eclipse Heart' },
});

const WORLD_BOSS_NAMES: Readonly<Record<WorldId, Readonly<Record<CoopBossKind, string>>>> = Object.freeze({
  neon_bastion: { neural_overlord: 'Neural Overlord', void_architect: 'Void Architect', singularity: 'Singularity' },
  cinderworks: { neural_overlord: 'Kiln Marshal', void_architect: 'Crucible Engine', singularity: 'Furnace Sovereign' },
  white_silence: { neural_overlord: 'Rime Matriarch', void_architect: 'Cryostorm Colossus', singularity: 'Pale Leviathan' },
  null_garden: { neural_overlord: 'Bloom Tyrant', void_architect: 'Graviton Gardener', singularity: 'Eclipse Heart' },
});

const WORLD_ENEMY_COLORS: Readonly<Record<WorldId, readonly string[]>> = Object.freeze({
  neon_bastion: ['#00f0ff', '#ffb020', '#34d399', '#ff4f64', '#d8b4fe', '#e879f9', '#f8fafc'],
  cinderworks: ['#ff6a1a', '#ffb020', '#ff3b0a', '#b91c1c', '#9a3412', '#ffd166', '#fff0c2'],
  white_silence: ['#d9f7ff', '#67e8f9', '#a5f3fc', '#60a5fa', '#e0e7ff', '#c4b5fd', '#ffffff'],
  null_garden: ['#a3ff6f', '#ff4fd8', '#d8b4fe', '#7c3aed', '#67e8f9', '#f0abfc', '#ffe7a3'],
});

const WORLD_GEM_COLORS: Readonly<Record<WorldId, string>> = Object.freeze({
  neon_bastion: EXPERIENCE_GEM_COLOR,
  cinderworks: '#ffb020',
  white_silence: '#a5f3fc',
  null_garden: '#e879f9',
});

function worldEnemyIdentity(worldId: WorldId, type: keyof typeof ENEMY_TYPES) {
  const index = ['basic', 'fast', 'ranged', 'tank', 'phantom', 'elite', 'titan'].indexOf(type);
  return { name: WORLD_ENEMY_NAMES[worldId][type], color: WORLD_ENEMY_COLORS[worldId][Math.max(0, index)] || ENEMY_TYPES[type].color };
}

function worldBossIdentity(worldId: WorldId, kind: CoopBossKind) {
  return { name: WORLD_BOSS_NAMES[worldId][kind], color: WORLD_ENEMY_COLORS[worldId][6] || ENEMY_TYPES.titan.color };
}

type WorldEnemyAttackProfile = Omit<EnemyAttackProfile, 'kind'> & { kind: CoopHazardSnapshot['kind']; color: string };

/** Same role, different faction grammar. These remain compact data transforms
 * so later worlds gain tactics without multiplying update loops. */
function worldEnemyAttack(worldId: WorldId, type: keyof typeof ENEMY_TYPES, base: EnemyAttackProfile): WorldEnemyAttackProfile {
  const attack: WorldEnemyAttackProfile = { ...base, color: type === 'ranged' ? '#4ade80' : type === 'tank' ? '#fbbf24' : type === 'phantom' ? '#e2e8f0' : '#f472d0' };
  if (worldId === 'cinderworks') {
    if (type === 'ranged') return { ...attack, radius: 108, windupMs: 950, cooldownMs: 2_850, damageMultiplier: 1.12, color: '#ff6a1a' };
    if (type === 'tank') return { ...attack, radius: 205, windupMs: 1_250, damageMultiplier: 1.02, color: '#ffb020' };
    if (type === 'phantom') return { ...attack, kind: 'lunge', radius: 98, windupMs: 650, cooldownMs: 3_650, damageMultiplier: 1.5, color: '#9a3412' };
    return { ...attack, radius: 142, windupMs: 1_100, cooldownMs: 4_050, damageMultiplier: .86, color: '#ffd166' };
  }
  if (worldId === 'white_silence') {
    if (type === 'ranged') return { ...attack, radius: 94, windupMs: 1_450, cooldownMs: 3_450, damageMultiplier: .95, color: '#67e8f9' };
    if (type === 'tank') return { ...attack, radius: 235, windupMs: 1_450, cooldownMs: 3_850, damageMultiplier: .82, color: '#d9f7ff' };
    if (type === 'phantom') return { ...attack, radius: 112, windupMs: 920, cooldownMs: 3_800, damageMultiplier: 1.38, color: '#e0e7ff' };
    return { ...attack, kind: 'shockwave', radius: 285, windupMs: 1_650, cooldownMs: 4_700, damageMultiplier: .62, color: '#c4b5fd' };
  }
  if (worldId === 'null_garden') {
    if (type === 'ranged') return { ...attack, kind: 'gravity', radius: 175, windupMs: 1_150, cooldownMs: 3_050, damageMultiplier: .58, color: '#d8b4fe' };
    if (type === 'tank') return { ...attack, radius: 220, windupMs: 1_050, cooldownMs: 3_100, damageMultiplier: 1.05, color: '#7c3aed' };
    if (type === 'phantom') return { ...attack, radius: 125, windupMs: 620, cooldownMs: 3_200, damageMultiplier: 1.52, color: '#ff4fd8' };
    return { ...attack, kind: 'gravity', radius: 310, windupMs: 1_400, cooldownMs: 4_100, damageMultiplier: .72, color: '#f0abfc' };
  }
  return attack;
}

function worldHazardIntervalMs(worldId: WorldId, insertion: boolean) {
  if (worldId === 'cinderworks') return insertion ? 13_000 : 10_500;
  if (worldId === 'white_silence') return insertion ? 15_000 : 12_000;
  if (worldId === 'null_garden') return insertion ? 12_000 : 9_500;
  return Number.POSITIVE_INFINITY;
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function retainInPlace<T>(items: T[], retain: (item: T) => boolean) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < items.length; readIndex++) {
    const item = items[readIndex];
    if (retain(item)) items[writeIndex++] = item;
  }
  items.length = writeIndex;
}
function isPassiveModule(value: unknown): value is CoopPassiveModuleId { return typeof value === 'string' && value in COOP_PASSIVE_BY_ID; }
function isArtifactPrimary(value: unknown): value is CoopFirearmId {
  return value === 'goreline_repeater' || value === 'riftspike_array' || value === 'dawnwall_cannon' || value === 'cinderhex_engine';
}
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
