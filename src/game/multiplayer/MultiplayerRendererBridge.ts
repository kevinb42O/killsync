import { FriendsBirdVisuals } from '../rendering/FriendsBirdVisuals';
import { FriendsStoneVisuals } from '../rendering/FriendsStoneVisuals';
import { FriendsFishingVisuals } from '../rendering/FriendsFishingVisuals';
import { FriendsUnderwaterVisuals } from '../rendering/FriendsUnderwaterVisuals';
import { isRowboatSeat, rowboatStrokePhase } from './FriendsRowboat';
import { FriendsSwitchReach } from '../rendering/FriendsSwitchReach';
import { FriendsGestureViewmodels } from '../rendering/FriendsGestureViewmodels';
import { isQuietSeat, insideStillwater, RETREAT_SITES } from '../world/FriendsRetreatSites';
import { cargoBounds } from './FriendsCargoPose';
import { craneCameraPose, DEFAULT_CRANE_CAMERA, type CraneCameraOptions } from './FriendsCraneCamera';
import { FriendsInteractionVisuals } from '../rendering/FriendsInteractionVisuals';
import { FriendsToolActions } from './FriendsToolActions';
import { friendsTreeWithinReach, friendsInteractionTarget, FriendsBuildSpatialIndex, type MiningWorkPlane } from './FriendsInteractionTargeting';
import { frontierTrees } from './FriendsFrontier';
import { vehicleWorldPoint,vehicleLocalPoint } from './FriendsVehiclePose';
import { FriendsScenicRailwayVisuals } from '../rendering/FriendsScenicRailwayVisuals';
import { FriendsFrontierVisuals } from '../rendering/FriendsFrontierVisuals';
import { quantizeFriendsFlashlightCone } from './FriendsFlashlightState';
import { FriendsSharedFlashlights } from '../rendering/FriendsSharedFlashlights';
import type { FriendsEnvironmentChange } from '../world/FriendsEnvironmentPreview';
import { FriendsHaulingVisuals } from '../rendering/FriendsHaulingVisuals';
import type { FrontierTool } from './FriendsFrontier';
import { FriendsBuildVisuals } from '../rendering/FriendsBuildVisuals';
import { getFriendsBuildPose, raycastFriendsBuild, friendsBuildFloor, type FriendsBuildShape, type FriendsBuildFinish, type FriendsBuildPose } from './FriendsBuilding';
import { FriendsVehicleVisuals } from '../rendering/FriendsWorldVisuals';
import { carryOnVehicle, friendsVehicleFloor, type FriendsVehicle } from './FriendsExpedition';
import { isCoopSpell } from '../combat/coopSpells';
import { CoopArcanaVisuals } from '../rendering/CoopArcanaVisuals';
import { RealityBreachVisuals } from '../rendering/RealityBreachVisuals';
import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../constants';
import { Enemy, ExperienceGem, Player, Projectile, Weapon, WorldItem } from '../../types';
import { GameEngine } from '../Engine';
import { Renderer3D } from '../Renderer3D';
import { soundManager } from '../SoundManager';
import { friendsAudio, type SurfaceCue } from '../FriendsAudio';
import { FriendsSoundscape } from '../FriendsSoundscape';
import { FriendsTrainSound } from '../FriendsTrainSound';
import { FriendsFlightFoliage } from '../FriendsFlightSound';
import { campfireSound, inCastleMusicArea } from '../FriendsLocationAudio';
import { FriendsInteractionSound, friendsWorldSound, friendsSurfaceSound } from '../FriendsWorldSound';
import { normalizeGamePreferences, type LocalGamePreferences } from '../LocalGamePreferences';
import { COOP_BRIDGE_SEGMENT_LENGTH, COOP_ENEMY_DEATH_PRESENTATION_MS, COOP_WEAPON_DETAILS, CoopCombatEvent, CoopSnapshot } from './CoopSimulation';
import { CoopFirearmVisualRig } from '../rendering/coopFirearmVisuals';
import { COOP_FIREARM_BY_ID, type CoopFirearmId } from '../combat/coopFirearms';
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
import { FriendsRemoteToolVisuals } from '../rendering/FriendsRemoteToolVisuals';
import { mountFriendsCharacter, updateFriendsCharacter, friendsCharacterHandPoint } from '../rendering/FriendsCharacterVisuals';
import { FriendsMarshmallowVisuals } from '../rendering/FriendsMarshmallowVisuals';
import { isCampfireSeat } from './FriendsCampfireSeats';
import { OperatorTrailSystem } from '../rendering/OperatorTrailSystem';
import type { CoopTextKey, CoopTextParams } from './i18n';
import { CoopStructureVisuals } from '../rendering/CoopStructureVisuals';
import { snapCoopStructurePose, type CoopStructureType } from './CoopFieldEngineering';
import { ProjectileMuzzlePresentation } from './ProjectileMuzzlePresentation';
import { raycastWorldObstacles } from '../world/WorldLayout';
import { WALL_JUMP_MAX_CAMERA_ROLL, wallJumpCameraLean } from './wallJumpPresentation';
import { getCoopSkin } from './CoopSkins';
import { ProjectileImpactVisuals } from '../rendering/ProjectileImpactVisuals';
import type { WorldId } from '../world/WorldDefinitions';
import { FriendsSpawnVisuals } from '../rendering/FriendsSpawnVisuals';
import { FriendsWorldArrival } from '../rendering/FriendsWorldArrival';
import { friendsSpawnPlatformContains, FRIENDS_SPAWN_PLATFORM } from '../world/FriendsTerrain';

type PresentationParticle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; z?: number; vz?: number; gravity?: number };
type TransientArc = { group: THREE.Group; life: number; maxLife: number };
type TransientBlast = { group: THREE.Group; life: number; maxLife: number };
type GravityHazardVisual = { group: THREE.Group; resolved: boolean };
type FallingPresentation = { startedAtMs: number; x: number; y: number; angle: number };
type PassiveMeshData = {
  rank: number;
  orbit?: THREE.Group;
  orbitMaterials: THREE.Material[];
  perimeter?: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  pulse?: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  lastTriggerAtMs: number;
};
const FALL_PRESENTATION_MS = 5_000;
const FALL_PRESENTATION_GRAVITY = 145;

/** The first-person owner normally has no world rig. Once their camera is
 * spectating a teammate, their own downed body must join the world rigs so it
 * remains visible from the chase camera. */
export function shouldRenderPlayerRig(playerId: string, localPlayerId: string, spectating: boolean, falling: boolean) {
  return playerId !== localPlayerId || spectating || falling;
}

/** A launch is only a local first-person cue. Keep its sequence guard here so
 * snapshot interpolation cannot replay it every render frame. */
export function shouldPresentGroundJump(
  isSpectating: boolean,
  isFalling: boolean,
  verticalOffset: number,
  jumpSequence: number,
  lastPresentedJumpSequence: number,
) {
  return !isSpectating && !isFalling && verticalOffset > .08
    && jumpSequence >= 0 && jumpSequence !== lastPresentedJumpSequence;
}

/**
 * Presents the network snapshot through the established production Renderer3D.
 * This deliberately does not own a second 3D world, weapon model, camera, or
 * VFX implementation: it adapts the authoritative co-op snapshot to the
 * rendering contract already used by the single-player game.
 */
export class MultiplayerRendererBridge {
  private craneControlView?:{id:number;options:CraneCameraOptions};
  private readonly renderer: Renderer3D;
  private worldId: WorldId;
  private readonly tacticalVisuals: CoopTacticalVisuals;
  private readonly scenicRailVisuals?:FriendsScenicRailwayVisuals;
  private readonly underwater:FriendsUnderwaterVisuals;
  private oarTimes=[-10000,-10000];
  private readonly friendsVehicleVisuals: FriendsVehicleVisuals;
  private readonly friendsHaulingVisuals: FriendsHaulingVisuals;
  private readonly frontierVisuals?: FriendsFrontierVisuals;
  private readonly sharedFlashlights?:FriendsSharedFlashlights;
  private flashlightOcclusionIndex=new FriendsBuildSpatialIndex();
  private readonly birdVisuals?:FriendsBirdVisuals;
  private readonly stoneVisuals?:FriendsStoneVisuals;
  private readonly fishingVisuals?:FriendsFishingVisuals;
  private readonly marshmallows?:FriendsMarshmallowVisuals;
  private readonly friendsSpawnVisuals?: FriendsSpawnVisuals;
  private readonly friendsWorldArrival?: FriendsWorldArrival;
  private footstepTravel = 0;
  private localSurfaceCue: SurfaceCue = 'grass';
  private soundscape = new FriendsSoundscape();
  private retreatSwitchSerial?:number;
  private readonly switchReach?:FriendsSwitchReach;
  private trainSound = new FriendsTrainSound();
  private flightFoliage = new FriendsFlightFoliage();
  private flightAudioTimeMs = 0;
  private castleMusicArea = false;
  private nextSoundscapeMs = 0;
  private interactionSound = new FriendsInteractionSound();
  private audioFeedbackStamp?: string;
  private nativePixelRatio = 1;
  private audioBuildRevision?: number;
  private audioPieces = new Map<number, { revision: number; finish: string; x: number; y: number; z: number }>();
  private audioDeliveries?: number;
  private audioEatenMarshmallowSerial?: number;
  private friendsTool: FrontierTool = 6;
  private friendsArms=0;
  private readonly gestureViewmodels?:FriendsGestureViewmodels;
  private friendsToolFiring = false;
  private friendsShovelFill = false;
  private readonly friendsBuildVisuals: FriendsBuildVisuals;
  private readonly interactionVisuals: FriendsInteractionVisuals;
  private predictedTools = new FriendsToolActions();
  private interactionIndex = new FriendsBuildSpatialIndex();
  private nearbyCache?:{key:string;pieces:readonly import('./FriendsBuilding').FriendsBuildPiece[]};
  private harvestedArray?:readonly string[];
  private removedInteractionTrees = new Set<string>();
  private interactionTrees: import('./FriendsFrontier').FrontierTree[] = [];
  private treeRegion = '';
  private plantedArray?:readonly import('./FriendsFrontier').FrontierTree[];
  private interactionAllowed = true;
  private workPlane?: MiningWorkPlane;
  private interactionPlayerId = '';
  private lastSwingSerial = -1;

  private readonly realityBreachVisuals: RealityBreachVisuals;
  private readonly structureVisuals: CoopStructureVisuals;
  private readonly projectileImpactVisuals: ProjectileImpactVisuals;
  private readonly remoteTools = new FriendsRemoteToolVisuals();
  private readonly remotePlayers = new Map<string, CoopOperatorRig>();
  private readonly passiveMeshes = new Map<string, THREE.Group>();
  private readonly arcanaVisuals = new CoopArcanaVisuals();
  private readonly localFirearm = new CoopFirearmVisualRig(true);
  private renderedLocalPlayerId = '';
  private readonly trailSystem: OperatorTrailSystem;
  private readonly seenCombatEventIds = new Map<number, number>();
  private readonly combatParticles: PresentationParticle[] = [];
  private readonly renderEnemies: Enemy[] = [];
  private readonly renderEnemyById = new Map<number, Enemy>();
  private readonly activeRenderEnemyIds = new Set<number>();
  private readonly renderProjectiles: Projectile[] = [];
  private readonly renderProjectileById = new Map<number, Projectile>();
  private readonly activeRenderProjectileIds = new Set<number>();
  private readonly newlyObservedProjectileIds = new Set<number>();
  private readonly projectileMuzzlePresentation = new ProjectileMuzzlePresentation();
  private readonly transientArcs: TransientArc[] = [];
  private readonly transientBlasts: TransientBlast[] = [];
  private readonly gravityHazards = new Map<number, GravityHazardVisual>();
  private readonly lightningPool: THREE.Group[] = [];
  private readonly lightningPoints = Array.from({ length: 35 }, () => new THREE.Vector3());
  private readonly lightningPointViews = Array.from({ length: 36 }, (_, count) => this.lightningPoints.slice(0, count));
  private readonly lightningFrom = new THREE.Vector3();
  private readonly lightningTo = new THREE.Vector3();
  private readonly renderGems: ExperienceGem[] = [];
  private readonly renderGemById = new Map<number, ExperienceGem>();
  private readonly renderItems: WorldItem[] = [];
  private readonly renderItemById = new Map<string, WorldItem>();
  private readonly renderState: Record<string, unknown>;
  private interactionBlocked = false;
  private readonly handleCanvasPointerDown = () => this.requestPointerLock();
  private lastHitSoundAt = -Infinity;
  private presentationShake = 0;
  private lastSnapshotTick = -1;
  private visualElapsedMs = 0;
  private readonly predictedFireActions = new Set<number>();
  private lastLocalZ = 0;
  private localWasAirborne = false;
  private localAirborneTimeMs = 0;
  private lastPresentedJumpSequence = -1;
  private lastPresentedWallJumpSequence = -1;
  private lastPresentedDoubleJumpSequence = -1;
  private wallJumpRoll = 0;
  private wallJumpPitch = 0;
  private wallJumpRollTarget = 0;
  private wallJumpPitchTarget = 0;
  private lastPresentedLocalX: number | undefined;
  private lastPresentedLocalY: number | undefined;
  private lastPresentedVehicle?: FriendsVehicle;
  private readonly fallingPresentations = new Map<string, FallingPresentation>();

  constructor(worldId: WorldId = 'neon_bastion') {
    this.worldId = worldId;
    this.renderer = new Renderer3D({
      floatingPlatform: true,
      worldId,
      coopEnemyBatching: !(import.meta.env.DEV && new URLSearchParams(window.location.search).get('coopBatch') === '0'),
    });
    this.nativePixelRatio = this.renderer.renderer.getPixelRatio();
    if(worldId==='friends_frontier')this.sharedFlashlights=new FriendsSharedFlashlights(this.renderer.scene,
      this.renderer.renderer,this.renderer.usesMobilePerformanceProfile);
    this.underwater=new FriendsUnderwaterVisuals(this.renderer.scene);
    this.friendsVehicleVisuals = new FriendsVehicleVisuals(this.renderer.scene);
    if (worldId === 'friends_frontier') { this.friendsSpawnVisuals = new FriendsSpawnVisuals(); this.renderer.scene.add(this.friendsSpawnVisuals); }
    if(worldId==='friends_frontier'){
      this.friendsWorldArrival=new FriendsWorldArrival();
      this.renderer.presentationWorldRender=(renderer,scene,camera)=>this.friendsWorldArrival!.render(renderer,scene,camera);
    }
    this.friendsHaulingVisuals = new FriendsHaulingVisuals(this.renderer.scene,this.renderer.viewmodelScene);
    if (worldId === 'friends_frontier') this.frontierVisuals = new FriendsFrontierVisuals(this.renderer.scene, this.renderer.viewmodelScene, this.renderer.renderer, this.renderer.camera, {
      sun: this.renderer.dirLight, ambient: this.renderer.ambientLight,
      fill: this.renderer.scene.getObjectByName('frontier-sky-fill') as THREE.HemisphereLight,
      cameraKey: this.renderer.camKeyLight,
      rim: this.renderer.scene.getObjectByName('world-counter-rim') as THREE.DirectionalLight,
    });
    if(worldId==='friends_frontier')this.scenicRailVisuals=new FriendsScenicRailwayVisuals(this.renderer.scene);
    if(worldId==='friends_frontier')this.gestureViewmodels=new FriendsGestureViewmodels(this.renderer.viewmodelScene);
    if(worldId==='friends_frontier'){this.birdVisuals=new FriendsBirdVisuals(this.renderer.scene,this.renderer.viewmodelScene);this.stoneVisuals=new FriendsStoneVisuals(this.renderer.scene,this.renderer.viewmodelScene);this.fishingVisuals=new FriendsFishingVisuals(this.renderer.scene,this.renderer.viewmodelScene);this.marshmallows=new FriendsMarshmallowVisuals(this.renderer.scene,this.renderer.viewmodelScene);this.switchReach=new FriendsSwitchReach(this.renderer.scene);}
    this.friendsBuildVisuals = new FriendsBuildVisuals(this.renderer.scene);
    this.interactionVisuals = new FriendsInteractionVisuals(this.renderer.scene);
    this.tacticalVisuals = new CoopTacticalVisuals(this.renderer.scene);
    this.realityBreachVisuals = new RealityBreachVisuals(this.renderer.scene);
    this.structureVisuals = new CoopStructureVisuals(this.renderer.scene);
    this.projectileImpactVisuals = new ProjectileImpactVisuals(this.renderer.scene);
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
    this.renderer.scene.add(this.arcanaVisuals.group);
    this.trailSystem = new OperatorTrailSystem(this.renderer.scene);
  }

  mount(container: HTMLElement) {
    this.renderer.mount(container);
    this.friendsWorldArrival?.mount(container);
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
  requestPointerLock() {
    if (this.interactionBlocked) return;
    const canvas = this.renderer.renderer.domElement;
    canvas.tabIndex = -1;
    canvas.focus({ preventScroll: true });
    this.renderer.requestPointerLock();
  }
  exitPointerLock() { this.renderer.exitPointerLock(); }
  focusCanvas() {
    const canvas = this.renderer.renderer.domElement;
    canvas.tabIndex = -1;
    canvas.focus({ preventScroll: true });
  }
  setInteractionBlocked(blocked: boolean) {
    this.interactionBlocked = blocked;
    if (blocked) this.exitPointerLock();
  }
  setLocalPreferences(preferences: LocalGamePreferences) {
    const settings = normalizeGamePreferences(preferences);
    const renderer = this.renderer.renderer;
    renderer.setPixelRatio(this.nativePixelRatio * settings.renderScale);
    if (this.worldId === 'friends_frontier') {
      // The sun preference must not disable the depth atlas used by remote
      // flashlights (or the local beam's occlusion).
      renderer.shadowMap.enabled = true;
      this.renderer.dirLight.castShadow = settings.shadows;
      this.renderer.dirLight.shadow.needsUpdate = settings.shadows;
      renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.lookSensitivityScale = settings.lookSensitivity;
  }
  get isPointerLocked() { return this.renderer.isPointerLocked; }
  canLocalJump() { return this.lastLocalZ <= 0.08; }
  getAimAngle() { return Math.atan2(-Math.cos(this.renderer.yaw), -Math.sin(this.renderer.yaw)); }
  getAimPitch() { return this.renderer.pitch; }
  /** Apply right-stick look without relying on Pointer Lock mouse movement. */
  adjustAim(yawDelta: number, pitchDelta: number) {
    this.renderer.yaw -= yawDelta;
    this.renderer.pitch = Math.max(-1.45, Math.min(1.45, this.renderer.pitch - pitchDelta));
  }
  getViewportSize() {
    const canvas = this.renderer.renderer.domElement;
    return { width: canvas.clientWidth || canvas.width, height: canvas.clientHeight || canvas.height };
  }
  /** Projects the current co-op enemy roster in one camera update. A small NDC
   * guard band prevents edge cues flickering over bodies crossing the bezel. */
  getOffscreenEnemyIds(enemies: ReadonlyArray<{ id: number; x: number; y: number; radius: number }>) {
    const camera = this.renderer.camera;
    camera.updateMatrixWorld(true);
    const projected = new THREE.Vector3();
    const offscreen = new Set<number>();
    for (const enemy of enemies) {
      projected.set(enemy.x, Math.max(12, enemy.radius * .72), enemy.y).project(camera);
      const guard = Math.min(.13, .035 + enemy.radius / 700);
      const visible = projected.z >= -1 && projected.z <= 1
        && Math.abs(projected.x) <= 1 + guard
        && Math.abs(projected.y) <= 1 + guard;
      if (!visible) offscreen.add(enemy.id);
    }
    return offscreen;
  }
  getPerformanceStats() { return { ...this.renderer.getPerformanceStats(), interaction: {...this.interactionVisuals.stats,terrain:this.frontierVisuals?.terrainStats} }; }
  setFriendsWorkPlane(plane: MiningWorkPlane | undefined) { this.workPlane=plane; }
  setFriendsEffects(profile: 'full' | 'subtle' | 'off') { this.interactionVisuals.setEffects(profile);this.frontierVisuals?.setEffects(profile); }
  private playerInteractionRay(snapshot: CoopSnapshot | null) {
    const actor = snapshot?.players.find(p => p.id === this.interactionPlayerId) || snapshot?.players[0];
    if (!actor) return this.creativeRay();
    const angle = this.getAimAngle(), pitch = this.getAimPitch();
    return { x: actor.x, y: actor.y, z: actor.z + 26, dx: Math.cos(angle) * Math.cos(pitch), dy: Math.sin(angle) * Math.cos(pitch), dz: Math.sin(pitch) };
  }
  private nearbyBuilds(snapshot: CoopSnapshot | null, reach = 600) {
    const ray = this.playerInteractionRay(snapshot);
    this.interactionIndex.update(snapshot?.friends?.building?.pieces || [], snapshot?.friends?.building?.revision ?? -1);
    const key=[Math.floor(ray.x/256),Math.floor(ray.y/256),reach,snapshot?.friends?.building?.revision].join(':');
    if(!this.interactionIndex.hasAttachments&&this.nearbyCache?.key===key)return this.nearbyCache.pieces;
    const pieces=this.interactionIndex.near(Math.floor(ray.x/256)*256+128,Math.floor(ray.y/256)*256+128,reach+128);
    this.nearbyCache={key,pieces};return pieces;
  }
  private creativeRay() {
    this.renderer.camera.updateMatrixWorld(true);
    const direction = this.renderer.camera.getWorldDirection(new THREE.Vector3());
    const origin = this.renderer.camera.getWorldPosition(new THREE.Vector3());
    return { x: origin.x, y: origin.z, z: origin.y, dx: direction.x, dy: direction.z, dz: direction.y };
  }
  getFriendsBuildPose(snapshot: CoopSnapshot | null, shape: FriendsBuildShape, rotationOffset = 0) {
    return getFriendsBuildPose(this.nearbyBuilds(snapshot), this.playerInteractionRay(snapshot), shape, rotationOffset / (Math.PI / 2), snapshot?.friends?.frontier ? this.frontierVisuals?.terrain : undefined,snapshot?.friends?.vehicles);
  }
  getFriendsNearbyPieces(snapshot:CoopSnapshot|null){return this.nearbyBuilds(snapshot);}
  getFriendsConstructionRay(snapshot: CoopSnapshot | null) { return this.playerInteractionRay(snapshot); }
  getFriendsMiningPlane(snapshot: CoopSnapshot | null):MiningWorkPlane|undefined {
    const g=this.frontierVisuals?.terrain.raycast(this.playerInteractionRay(snapshot),240);if(!g)return;
    const normal=[g.nx,g.ny,g.nz],axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))) as 0|1|2;
    return {axis,value:([g.vx,g.vy,g.vz][axis]+(normal[axis]>0?1:0))*32};
  }
  getFriendsConstructionSurface(snapshot: CoopSnapshot | null) {
    const ray=this.playerInteractionRay(snapshot),build=raycastFriendsBuild(this.nearbyBuilds(snapshot),ray),ground=this.frontierVisuals?.terrain.raycast(ray,520);
    return build&&(!ground||build.distance<ground.distance)?build:ground;
  }
  setFriendsRemovalProgress(piece: import('./FriendsBuilding').FriendsBuildPiece | undefined, progress=0) { this.friendsBuildVisuals.removalProgress(piece,progress); }
  setFriendsBuildGroupPreview(shape: FriendsBuildShape | undefined, poses: readonly FriendsBuildPose[], valid: readonly boolean[], finish: FriendsBuildFinish, pending=false) {
    this.friendsBuildVisuals.setPending(pending);this.friendsBuildVisuals.previewGroup(shape,poses,valid,finish);this.friendsBuildVisuals.setPending(false);
  }
  setFriendsContactFace(surface: ReturnType<MultiplayerRendererBridge['getFriendsConstructionSurface']>,valid=true){this.friendsBuildVisuals.contactFace(surface,valid);}
  getFriendsTerrain() { return this.frontierVisuals?.terrain; }
  getFriendsEnvironment() { return this.frontierVisuals?.environmentState; }
  setFriendsEnvironment(change:FriendsEnvironmentChange) { this.frontierVisuals?.setEnvironment(change); }
  toggleFriendsFlashlight(forceOn=false) {
    if (!this.frontierVisuals) return;
    if(!forceOn||!this.frontierVisuals.flashlightEquipped)this.frontierVisuals.toggleFlashlight();
    friendsAudio.equipment('flashlight', this.frontierVisuals.flashlightEquipped);
  }
  getFriendsFlashlightInput() {
    const world=this.frontierVisuals, shining=this.friendsTool!==6 && world?.flashlightShining && !this.renderer.presentationSpectating;
    return {friendsFlashlight:shining ? true : undefined,
      friendsFlashlightCone:shining ? quantizeFriendsFlashlightCone(world!.flashlightAngle) : undefined};
  }
  toggleFriendsNightVision() {
    const enabled = this.renderer.toggleFriendsNightVision();
    if (this.frontierVisuals) friendsAudio.equipment('nightVision', enabled);
    return enabled;
  }
  setCraneControlView(id:number|null,options:CraneCameraOptions=DEFAULT_CRANE_CAMERA) {
    this.craneControlView=id===null?undefined:{id,options};
    if(id===null)this.renderer.camera.clearViewOffset();
    this.frontierVisuals?.setCraneCameraLight(id!==null&&options.light!==false);
  }
  setFriendsArms(mask:number){this.friendsArms=mask;}
  setFriendsTool(tool: FrontierTool, firing: boolean, allowed=true, fill=false) { this.friendsTool = tool; this.friendsToolFiring = firing; this.friendsShovelFill = tool === 3 && fill; this.interactionAllowed=allowed; }
  getFriendsBuildTarget(snapshot: CoopSnapshot | null) {
    const ray = this.playerInteractionRay(snapshot), hit = raycastFriendsBuild(this.nearbyBuilds(snapshot), ray);
    const ground = this.frontierVisuals?.terrain.raycast(ray, 520);
    return hit && (!ground || hit.distance < ground.distance) ? hit : undefined;
  }
  setFriendsBuildPreview(shape?: FriendsBuildShape, pose?: FriendsBuildPose, valid = true, finish: FriendsBuildFinish = 'stone') { this.friendsBuildVisuals.preview(shape, pose, valid, finish); if(!shape)this.friendsBuildVisuals.contactFace(undefined); }

  getBuildPose(snapshot: CoopSnapshot | null, localPlayerId: string, type: CoopStructureType, rotationOffset = 0, snapping = true) {
    const local = snapshot?.players.find(player => player.id === localPlayerId);
    if (!local) return undefined;
    if (type === 'bridge_segment' && snapshot?.bridge) {
      return {
        x: snapshot.bridge.startX + (snapshot.bridge.builtSegments + .5) * COOP_BRIDGE_SEGMENT_LENGTH,
        y: snapshot.bridge.buildY,
        angle: 0,
      };
    }
    const aim = this.getAimAngle();
    const distance = type === 'recovery_relay' || type === 'decoy_beacon' ? 165 : 220;
    const pose = {
      x: Math.round(local.x + Math.cos(aim) * distance),
      y: Math.round(local.y + Math.sin(aim) * distance),
      angle: type === 'recovery_relay' || type === 'decoy_beacon' ? 0 : aim + Math.PI / 2 + rotationOffset,
    };
    return snapCoopStructurePose(type, pose.x, pose.y, pose.angle, snapshot?.structures || [], snapping);
  }
  setBuildPreview(type: CoopStructureType | undefined, pose?: { x: number; y: number; angle: number }, valid = true) {
    this.structureVisuals.setPreview(type, pose?.x, pose?.y, pose?.angle, valid);
  }

  /** Calculates the world coordinates and target context for a tactical ping. */
  calculatePingTarget(snapshot: CoopSnapshot | null, localPlayerId: string): { x: number; y: number; z: number; kind: CoopPingKind; labelKey: CoopTextKey; labelParams?: CoopTextParams } {
    const local = snapshot?.players.find(p => p.id === localPlayerId) || snapshot?.players[0];
    if (!local) return { x: 0, y: 0, z: 0, kind: 'location', labelKey: 'ping.waypoint' };

    const yaw = this.renderer.yaw;
    const pitch = this.renderer.pitch;
    const forwardX = -Math.sin(yaw);
    const forwardY = -Math.cos(yaw);
    const aimAngle = this.getAimAngle();
    const camHeight = 36 + (local.z || 0);
    const verticalSlope = Math.tan(pitch);
    const groundDistance = verticalSlope < 0 ? camHeight / -verticalSlope : Infinity;
    const sightDistance = Math.min(2600, groundDistance);
    const worldHit = raycastWorldObstacles(local.x, local.y, camHeight, forwardX, forwardY, verticalSlope, sightDistance, this.worldId);
    const isBeforeWorldHit = (distance: number) => distance <= (worldHit?.distance ?? Infinity) + 1;

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
        if (diff < 0.16 && dist < 2600 && isBeforeWorldHit(dist)) {
          return { x: boss.x, y: boss.y, z: 20, kind: 'boss', labelKey: boss.nameKey };
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
        if (diff < 0.18 && dist < 2400 && isBeforeWorldHit(dist)) {
          return { x: teammate.x, y: teammate.y, z: 5, kind: 'revive', labelKey: 'ping.revive', labelParams: { name: teammate.label.toUpperCase() } };
        }
      }

      // 3. Nearest Hostile within aim cone
      let bestEnemy: { x: number; y: number; kind: CoopPingKind; labelKey: CoopTextKey; labelParams: CoopTextParams; score: number } | null = null;
      for (const enemy of snapshot.enemies) {
        if (enemy.dying) continue;
        const dx = enemy.x - local.x;
        const dy = enemy.y - local.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1800 || !isBeforeWorldHit(dist)) continue;
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
              labelKey: 'ping.hostile',
              labelParams: {},
              score,
            };
          }
        }
      }
      if (bestEnemy) {
        return { x: bestEnemy.x, y: bestEnemy.y, z: 12, kind: bestEnemy.kind, labelKey: bestEnemy.labelKey, labelParams: bestEnemy.labelParams };
      }

      // 4. Squad engineering. A normal ping on a structure communicates the
      // defensive position without introducing a second ping vocabulary.
      for (const structure of snapshot.structures || []) {
        if (structure.state === 'destroying') continue;
        const dx = structure.x - local.x, dy = structure.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < .16 && dist < 1_600 && isBeforeWorldHit(dist)) return { x: structure.x, y: structure.y, z: 18, kind: 'location', labelKey: `build.${structure.type}.name` as CoopTextKey };
      }

      // 5. Buy Station
      for (const station of snapshot.buyStations) {
        if (station.state !== 'active') continue;
        const dx = station.x - local.x;
        const dy = station.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.16 && dist < 2200 && isBeforeWorldHit(dist)) {
          return { x: station.x, y: station.y, z: 10, kind: 'station', labelKey: 'ping.station' };
        }
      }

      // 6. Objective / Uplink
      const objective = snapshot.run.objective;
      if (objective) {
        const dx = objective.x - local.x;
        const dy = objective.y - local.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let diff = Math.abs(angle - aimAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < 0.18 && dist < 2500 && isBeforeWorldHit(dist)) {
          return { x: objective.x, y: objective.y, z: 15, kind: 'objective', labelKey: objective.titleKey };
        }
      }
    }

    // 7. The first solid surface under the crosshair. This is deliberately
    // resolved after contextual targets so a visible enemy or objective keeps
    // its richer ping, but no target can be selected through the obstacle.
    if (worldHit) {
      return {
        x: Math.round(worldHit.x),
        y: Math.round(worldHit.y),
        z: Math.round(worldHit.z),
        kind: 'location',
        labelKey: 'ping.waypoint',
      };
    }

    // 8. Ground plane projection or forward look position
    let targetDist = 650;
    if (pitch < -0.06) {
      targetDist = Math.max(50, Math.min(1200, camHeight / Math.tan(-pitch)));
    }
    const pingX = Math.round(local.x + forwardX * targetDist);
    const pingY = Math.round(local.y + forwardY * targetDist);
    return { x: pingX, y: pingY, z: 0, kind: 'location', labelKey: 'ping.waypoint' };
  }

  private launchLocalSpell(weaponId: import('../combat/coopSpells').CoopSpellId, actionId: number) {
    if (!this.renderedLocalPlayerId) return;
    const position = this.renderer.projectViewmodelPointToWorld(this.localFirearm.getMuzzlePoint());
    const aimPoint = this.renderer.getFireSolution(this.renderEnemies).aimPoint3D;
    this.arcanaVisuals.predictSpell(this.renderedLocalPlayerId, weaponId, actionId, { position, initialScale: .06 }, aimPoint, weaponId === 'astral_lance' ? 3600 : COOP_FIREARM_BY_ID[weaponId].projectileVelocity);
  }

  /** Predicted presentation is deduplicated later; damage stays on the host. */
  predictLocalFire(weaponId: CoopFirearmId, actionId: number) {
    if (this.worldId === 'friends_frontier' && this.friendsTool) return;
    this.predictedFireActions.add(actionId);
    if (this.predictedFireActions.size > 32) this.predictedFireActions.delete(this.predictedFireActions.values().next().value!);
    if (isCoopSpell(weaponId)) { this.launchLocalSpell(weaponId, actionId); this.localFirearm.fire(weaponId); soundManager.playSpell(weaponId); return; }
    this.renderer.notifyFired();
    soundManager.playGunfire(weaponId);
    if (weaponId === 'plasma_gun') this.renderer.triggerMuzzleFlash(COOP_WEAPON_DETAILS[weaponId].color);
    else this.localFirearm.fire(weaponId);
  }

  render(snapshot: CoopSnapshot | null, localPlayerId: string, deltaMs: number, spectatorTargetId?: string | null, forceFirstPerson: boolean = false, creativeBuilding: boolean = false) {
    this.underwater.beginFrame();
    if (!snapshot) return;
    this.renderedLocalPlayerId = localPlayerId;
    if (snapshot.world?.id && snapshot.world.id !== this.worldId) {
      this.worldId = snapshot.world.id;
      this.renderer.setCoopWorld(this.worldId);
      this.structureVisuals.update([], snapshot.elapsedMs);
      this.projectileImpactVisuals.clear();
      this.arcanaVisuals.clear();
    }
    const snapshotChanged = snapshot.tick !== this.lastSnapshotTick;
    if (snapshot.tick < this.lastSnapshotTick) {
      this.seenCombatEventIds.clear(); this.combatParticles.length = 0; this.presentationShake = 0;
      for (const blast of this.transientBlasts) this.disposeTransientGroup(blast.group);
      this.transientBlasts.length = 0;
      this.clearGravityHazards();
      this.projectileImpactVisuals.clear();
      this.arcanaVisuals.clear();
      this.fallingPresentations.clear();
      this.projectileMuzzlePresentation.clear();
      this.lastPresentedJumpSequence = -1;
      this.lastPresentedWallJumpSequence = -1;
      this.lastPresentedDoubleJumpSequence = -1;
      this.wallJumpRoll = this.wallJumpPitch = this.wallJumpRollTarget = this.wallJumpPitchTarget = 0;
      this.lastPresentedLocalX = undefined;
      this.lastPresentedLocalY = undefined;
      this.friendsSpawnVisuals?.clear();
    }
    this.visualElapsedMs = snapshot.tick !== this.lastSnapshotTick ? snapshot.elapsedMs : Math.min(snapshot.elapsedMs + 100, this.visualElapsedMs + deltaMs);
    this.lastSnapshotTick = snapshot.tick;
    this.registerFallingPresentation(snapshot, localPlayerId);
    // A revive is an authoritative life-state change. It must win over any
    // previous spectator target in the same frame so the player cannot remain
    // stuck in third person after standing back up.
    const localFall = this.activeFall(localPlayerId);
    const isFallingLocal = Boolean(localFall);
    const isSpectating = !isFallingLocal && !forceFirstPerson && Boolean(spectatorTargetId && spectatorTargetId !== localPlayerId);
    const local = (isSpectating ? snapshot.players.find(player => player.id === spectatorTargetId) : undefined)
      || snapshot.players.find(player => player.id === localPlayerId) || snapshot.players[0];
    if (!local) return;
    const arrivals = this.friendsSpawnVisuals?.update(snapshot.players, snapshot.combatEvents, deltaMs);
    if(arrivals?.has(localPlayerId)&&!isSpectating)this.friendsWorldArrival?.start(local.x,local.y,local.z);
    const resetCamera = this.lastPresentedLocalX === undefined || Boolean(arrivals?.has(local.id));
    if (resetCamera) {
      this.renderer.resetFirstPersonPresentation();
      this.presentationShake = 0;
      this.localWasAirborne = false; this.localAirborneTimeMs = 0;
      this.wallJumpRoll = this.wallJumpPitch = this.wallJumpRollTarget = this.wallJumpPitchTarget = 0;
      this.lastPresentedJumpSequence = local.motion?.lastJumpSequence ?? -1;
      this.lastPresentedWallJumpSequence = local.motion?.lastWallJumpSequence ?? -1;
      this.lastPresentedDoubleJumpSequence = local.motion?.lastDoubleJumpSequence ?? -1;
      this.lastPresentedLocalX = undefined; this.lastPresentedLocalY = undefined; this.lastPresentedVehicle = undefined;
    }
    const localSkin = getCoopSkin(local.skinId);
    this.renderer.setCoopSuitPalette({
      primary: localSkin.palette.glow,
      secondary: localSkin.palette.armor,
      dark: localSkin.palette.undersuit,
      glow: localSkin.palette.glow,
      visor: localSkin.palette.visor,
      metalness: localSkin.material.metalness,
      roughness: localSkin.material.roughness,
      emissiveIntensity: localSkin.material.emissiveIntensity * (localSkin.material.animatedEmissive ? 1 + Math.sin(snapshot.elapsedMs * .004) * .28 : 1),
      premium: localSkin.tier === 'premium',
      signature: localSkin.tier === 'premium' ? localSkin.id as 'black_ice' | 'royal_inferno' : undefined,
    });
    const weaponState = local.weaponStates[local.selectedSlot];
    const selectedWeaponId = weaponState?.weaponId || 'plasma_gun';
    const player = this.renderState.player as Player;
    const targetX = localFall?.x ?? local.x;
    const targetY = localFall?.y ?? local.y;
    const presentedAngle = localFall?.angle ?? local.angle;
    const dtSeconds = Math.max(0.001, deltaMs / 1000);
    const standingLoad=snapshot.friends?.building?.pieces.find(p=>p.attachment&&Math.abs((friendsBuildFloor([p],targetX,targetY,local.z,0)??Infinity)-local.z)<2);
    const standingVehicle = !local.friendsDevFlight ? snapshot.friends?.vehicles.find(v => { if(local.friendsSeat?.vehicleId===v.id||standingLoad?.attachment?.vehicleId===v.id)return true; const floor = friendsVehicleFloor([v], targetX, targetY, local.z); return floor !== undefined && Math.abs(local.z - floor) < 2; }) : undefined;
    const onSpawnDeck = friendsSpawnPlatformContains(local.x, local.y) && Math.abs(local.z-FRIENDS_SPAWN_PLATFORM.top) < .1 && (local.motion?.verticalVelocity ?? 0) <= 0;
    this.renderer.presentationGrounded = Boolean(snapshot.friends && !local.friendsDevFlight && !local.motion?.swimming && (standingVehicle || onSpawnDeck || local.motion?.verticalVelocity === 0));
    if (this.lastPresentedLocalX !== undefined && this.lastPresentedLocalY !== undefined) {
      const reference = { x: this.lastPresentedLocalX, y: this.lastPresentedLocalY, z: this.lastLocalZ };
      if (standingVehicle && this.lastPresentedVehicle?.id === standingVehicle.id) Object.assign(reference,vehicleWorldPoint(standingVehicle,vehicleLocalPoint(this.lastPresentedVehicle,reference)));
      const vx = (targetX - reference.x) / dtSeconds;
      const vy = (targetY - reference.y) / dtSeconds;
      const speed = Math.hypot(vx, vy);
      if (speed < 1200) {
        player.velocity.x = vx;
        player.velocity.y = vy;
      } else {
        player.velocity.x = 0;
        player.velocity.y = 0;
      }
    } else {
      player.velocity.x = Math.cos(presentedAngle) * 0.01;
      player.velocity.y = Math.sin(presentedAngle) * 0.01;
    }
    // Reconciliation offsets are visual corrections, not footsteps or body
    // inertia. Drive the local rig from the shared controller's real velocity.
    if (snapshot.friends && !isSpectating && !isFallingLocal && local.motion?.velocityX !== undefined && local.motion.velocityY !== undefined) {
      player.velocity.x = local.motion.velocityX;
      player.velocity.y = local.motion.velocityY;
    }
    this.lastPresentedLocalX = targetX;
    this.lastPresentedLocalY = targetY;
    this.lastPresentedVehicle = standingVehicle;
    player.position.x = targetX;
    player.position.y = targetY;
    if (snapshot.friends && !isSpectating && !isFallingLocal && !this.interactionBlocked && this.renderer.presentationGrounded && !local.friendsSeat && local.lifeState === 'alive') {
      if (standingVehicle) this.localSurfaceCue = 'woodStep'; else if (onSpawnDeck) this.localSurfaceCue = 'stoneStep';
      const speed = Math.hypot(player.velocity.x, player.velocity.y);
      if (speed > 15 && speed < 1200) {
        this.footstepTravel += speed * Math.min(.1, dtSeconds);
        if (this.footstepTravel >= 90) {
          this.footstepTravel %= 90;
          const piece = snapshot.friends.building?.pieces.find(p => Math.abs((friendsBuildFloor([p], targetX, targetY, local.z, 0) ?? Infinity) - local.z) < 2);
          const material = this.getFriendsTerrain()?.material(Math.floor(targetX / 32), Math.floor(targetY / 32), Math.floor((local.z - 2) / 32));
          const wooden = piece?.finish === 'timber' || Boolean(standingVehicle);
          const hard = Boolean(piece && piece.finish !== 'grass' && piece.finish !== 'soil');
          const cue = friendsSurfaceSound({x:targetX,y:targetY,z:local.z}, wooden ? 'wood' : piece ? (hard ? 'hard' : 'soil') : onSpawnDeck ? 'hard' : undefined,
            this.frontierVisuals?.soundscapeEnvironment.underground, material);
          this.localSurfaceCue = cue;
          friendsAudio.play(cue, local.crouching ? .08 : local.sprinting ? .25 : .18, 230);
        }
      } else this.footstepTravel = 0;
    } else this.footstepTravel = 0;
    player.health = local.health; player.maxHealth = local.maxHealth;
    player.level = local.level; player.experience = local.experience; player.experienceToNextLevel = local.experienceToNextLevel;
    player.coins = local.coins; player.pendingDataCores = local.pendingDataCores;
    const fallingZ = localFall ? this.fallHeight(localFall) : undefined;
    this.renderer.presentationVerticalOffset = fallingZ ?? local.z;
    const currentZ = fallingZ ?? local.z;
    const jumpSequence = local.motion?.lastJumpSequence ?? -1;
    const wallJumpSequence = local.motion?.lastWallJumpSequence ?? -1;
    const doubleJumpSequence = local.motion?.lastDoubleJumpSequence ?? -1;
    // Ground launches use their own replicated sequence. Previously the
    // presentation bridge consumed only wall- and double-jump sequences, so
    // a normal Space jump had no explicit take-off cue (audio or camera/weapon
    // impulse) while the landing path still fired correctly.
    const isSpecialJump = jumpSequence === wallJumpSequence || jumpSequence === doubleJumpSequence;
    if (!isSpecialJump && shouldPresentGroundJump(
      isSpectating,
      isFallingLocal,
      currentZ,
      jumpSequence,
      this.lastPresentedJumpSequence,
    )) {
      if (snapshot.friends) friendsAudio.takeoff(); else soundManager.playJump();
      this.presentationShake = Math.max(this.presentationShake, local.friendsDevSuperjump ? .95 : .65);
      this.renderer.notifyJump(local.friendsDevSuperjump ? 1.5 : 1.0);
    }
    if (!isSpectating) this.lastPresentedJumpSequence = jumpSequence;
    if (!isSpectating && !isFallingLocal && currentZ > .08 && wallJumpSequence >= 0 && wallJumpSequence !== this.lastPresentedWallJumpSequence) {
      const lean = wallJumpCameraLean(
        local.motion?.wallJumpDirectionX || 0,
        local.motion?.wallJumpDirectionY || 0,
        this.getAimAngle(),
      );
      this.wallJumpRollTarget = lean.roll;
      this.wallJumpPitchTarget = lean.pitch;
      this.presentationShake = Math.max(this.presentationShake, 1.2);
      soundManager.playWallJump(lean.roll / WALL_JUMP_MAX_CAMERA_ROLL);
      this.renderer.notifyJump(1.2);
    }
    // A spectated teammate's sequence must not replace the controlled
    // player's sequence or replay an old lean when first person resumes.
    if (!isSpectating) this.lastPresentedWallJumpSequence = wallJumpSequence;
    if (!isSpectating && !isFallingLocal && currentZ > .08 && doubleJumpSequence >= 0 && doubleJumpSequence !== this.lastPresentedDoubleJumpSequence) {
      // Visible third-person operator rigs intensify their existing dual
      // flames. Keep the local cue in audio and camera feedback: a world-space
      // orange burst at the player's XY used the generic particle elevation,
      // which put it near the floor beneath the first-person camera.
      soundManager.playDoubleJump();
      this.presentationShake = Math.max(this.presentationShake, .9);
      this.renderer.notifyJump(1.1);
    }
    if (!isSpectating) this.lastPresentedDoubleJumpSequence = doubleJumpSequence;
    const leanBlend = 1 - Math.exp(-32 * Math.max(0, deltaMs) / 1000);
    this.wallJumpRoll += (this.wallJumpRollTarget - this.wallJumpRoll) * leanBlend;
    this.wallJumpPitch += (this.wallJumpPitchTarget - this.wallJumpPitch) * leanBlend;
    const leanRecovery = Math.exp(-Math.max(0, deltaMs) / 155);
    this.wallJumpRollTarget *= leanRecovery;
    this.wallJumpPitchTarget *= leanRecovery;
    if (isSpectating || isFallingLocal) this.wallJumpRoll = this.wallJumpPitch = 0;
    this.renderer.presentationCameraRoll = this.wallJumpRoll;
    this.renderer.presentationCameraPitchOffset = this.wallJumpPitch;
    const groundedInValley = snapshot.friends && (this.renderer.presentationGrounded||local.motion?.swimming);
    if (currentZ > 0.08 && !groundedInValley) {
      this.localAirborneTimeMs += deltaMs;
      this.localWasAirborne = true;
    } else {
      if (this.localWasAirborne && this.localAirborneTimeMs >= 60) {
        const fallRate = Math.max(0, (this.lastLocalZ - currentZ) / Math.max(0.001, deltaMs / 1000));
        const impactScale = Math.min(1.8, Math.max(0.7, fallRate > 20 ? fallRate / 240 : 1.0));
        if (snapshot.friends) {
          const piece = snapshot.friends.building?.pieces.find(p => Math.abs((friendsBuildFloor([p], targetX, targetY, local.z, 0) ?? Infinity) - local.z) < 2);
          const material = this.getFriendsTerrain()?.material(Math.floor(targetX / 32), Math.floor(targetY / 32), Math.floor((local.z - 2) / 32));
          this.localSurfaceCue = friendsSurfaceSound({x:targetX,y:targetY,z:local.z}, piece?.finish === 'timber' || standingVehicle ? 'wood' : piece ? (piece.finish === 'grass' || piece.finish === 'soil' ? 'soil' : 'hard') : onSpawnDeck ? 'hard' : undefined,
            this.frontierVisuals?.soundscapeEnvironment.underground, material);
          friendsAudio.land(this.localSurfaceCue, impactScale);
        } else soundManager.playLanding();
        this.renderer.notifyLand(impactScale);
      }
      this.localWasAirborne = false;
      this.localAirborneTimeMs = 0;
    }
    this.lastLocalZ = currentZ;
    // Crouches use the same low presentation silhouette as a slide, but do
    // not retain the sprint FOV once the slide key is held.
    this.renderer.presentationSprinting = local.sprinting && !local.sliding && !local.crouching;
    this.renderer.presentationSuperjumpSpeed = local.friendsDevSuperjump && !local.friendsDevFlight
      && !this.renderer.presentationGrounded && !local.motion?.swimming && !isFallingLocal
      ? Math.min(1, Math.max(0, (Math.hypot(local.motion?.velocityX ?? 0, local.motion?.velocityY ?? 0) - 300) / 1900)) : 0;
    this.renderer.presentationSliding = local.sliding || local.crouching;
    // The host owns spread and reload eligibility; this only presents the
    // replicated aim state through the renderer's existing ADS camera rig.
    this.renderer.isAimingDownSights = local.isAiming && this.friendsTool !== 5 && this.friendsTool !== 3;
    this.renderer.presentationScoped = false;
    this.renderer.rightArmRoot.visible = !creativeBuilding && !isCoopSpell(selectedWeaponId);
    this.renderer.weaponRoot.visible = selectedWeaponId === 'plasma_gun' && !local.carryingHostage && !creativeBuilding;
    this.localFirearm.group.visible = !local.carryingHostage && !creativeBuilding;
    this.renderer.presentationReloading = weaponState?.state === 'reloading';
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
    // When spectating we want the third-person chase camera (to orbit around
    // the spectated player) but NOT the old low-poly thirdPersonPlayerGroup.
    // presentationSpectating hides that box model while the spectated player's
    // rich CoopOperatorRig (rendered by syncRemotePlayers) takes its place.
    // We also drive renderer.yaw from the network angle so the camera faces
    // the direction the spectated player is actually moving/looking.
    const pilotedVehicle = snapshot.friends?.vehicles.find(v => v.kind === 'aircraft' && v.pilotId === localPlayerId);
    this.renderer.presentationVehicle = !isSpectating && !isFallingLocal ? pilotedVehicle : undefined;
    const craneView=this.craneControlView,snapshotCrane=craneView&&snapshot.friends?.hauling?.cranes?.find(c=>c.pieceId===craneView.id);
    const loadView=snapshotCrane&&craneCameraPose(snapshotCrane,snapshot.friends?.hauling?.cargo.find(c=>c.id===snapshotCrane.cargoId),craneView!.options,(target,eye)=>{
      const length=Math.hypot(eye.x-target.x,eye.y-target.y,eye.z-target.z),ray={...target,dx:(eye.x-target.x)/length,dy:(eye.y-target.y)/length,dz:(eye.z-target.z)/length};
      const terrainHit=this.frontierVisuals?.terrain.raycast(ray,length),buildHit=raycastFriendsBuild(snapshot.friends?.building?.pieces??[],ray,length);
      const distance=Math.min(terrainHit?.distance??Infinity,buildHit?.distance??Infinity);return Number.isFinite(distance)?distance:undefined;
    });
    const useThirdPerson = isSpectating || isFallingLocal || Boolean(pilotedVehicle) || Boolean(loadView);
    this.renderer.presentationSpectating = useThirdPerson;
    if (useThirdPerson && !pilotedVehicle) {
      this.renderer.yaw = Math.atan2(-Math.cos(presentedAngle), -Math.sin(presentedAngle));
    }
    this.renderState.viewMode = useThirdPerson ? 'THIRD_PERSON' : 'FIRST_PERSON';
    this.renderState.gameTime = snapshot.elapsedMs;
    this.syncRenderEnemies(snapshot);
    this.syncRenderProjectiles(snapshot, localPlayerId);
    if (snapshotChanged) this.syncStaticRenderEntities(snapshot);
    this.renderState.enemies = this.renderEnemies;
    this.renderState.projectiles = this.renderProjectiles;
    this.renderState.gems = this.renderGems;
    this.renderState.items = this.renderItems;
    // Reuse the production city props for co-op terminals and extraction. The
    // host supplies only compact snapshot positions; presentation stays local.
    if (snapshotChanged) {
      // The production Buy Station model does not exist until authoritative
      // capture completes. In that snapshot the capture prop is removed and
      // this shop appears at the exact same coordinates.
      this.renderState.shops = snapshot.friends ? [] : snapshot.buyStations.filter(station => station.state === 'active').map(station => ({ id: `coop-station-${station.id}`, position: { x: station.x, y: station.y }, radius: station.radius }));
      const privateExfil = snapshot.privateExfil?.state === 'active' ? snapshot.privateExfil : undefined;
      const visibleExfil = privateExfil || snapshot.run.exfil;
      this.renderState.exfillPortal = visibleExfil ? {
        position: { x: visibleExfil.x, y: visibleExfil.y },
        radius: visibleExfil.radius,
        active: Boolean(privateExfil) || snapshot.run.phase === 'exfil' || snapshot.run.phase === 'checkpoint',
      } : null;
    }
    this.renderState.gasZone = snapshot.gasZone;
    this.syncGravityHazards(snapshot, local);

    // Ambient floating toxic chemical spores when local player is within the gas
    if (snapshot.gasZone && Math.hypot(local.x - snapshot.gasZone.x, local.y - snapshot.gasZone.y) <= snapshot.gasZone.radius) {
      if (Math.random() < 0.35 && this.combatParticles.length < 320) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 180;
        const maxLife = 600 + Math.random() * 400;
        this.combatParticles.push({
          x: local.x + Math.cos(angle) * dist,
          y: local.y + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: maxLife,
          maxLife,
          color: Math.random() < 0.65 ? '#4ade80' : '#a3e635',
          size: 2.5 + Math.random() * 3,
          z: 6 + Math.random() * 34,
        });
      }
    }

    // Build/update passive meshes before consuming their trigger events so a
    // module bought and triggered in the same snapshot can animate at once.
    this.syncPassiveModules(snapshot, local.id, !useThirdPerson);
    this.consumeCombatEvents(snapshot.combatEvents, localPlayerId, deltaMs);
    if (resetCamera) this.presentationShake = 0;
    this.projectileImpactVisuals.update(deltaMs);
    this.renderState.particles = this.combatParticles;
    this.renderState.screenShake = this.presentationShake;
    // Always pass the true localPlayerId so every teammate (including the
    // spectated player) gets their rich CoopOperatorRig rendered. The caller
    // no longer uses the old thirdPersonPlayerGroup for spectating.
    this.syncRemotePlayers(snapshot, localPlayerId, isSpectating || Boolean(pilotedVehicle) || Boolean(loadView));
    this.structureVisuals.update(snapshot.structures || [], snapshot.elapsedMs);
    this.friendsVehicleVisuals.update(snapshot.friends, snapshot.elapsedMs);
    const skiff=snapshot.friends?.vehicles.find(v=>v.kind==='rowboat');
    if(skiff?.rowing){const volume=.17*Math.max(0,1-Math.hypot(local.x-skiff.x,local.y-skiff.y,local.z-skiff.z)/500);
      [skiff.rowing.left,skiff.rowing.right].forEach((stroke,i)=>{if(stroke.atMs!==this.oarTimes[i]&&stroke.atMs>=0&&snapshot.elapsedMs-stroke.atMs<1200&&volume>0)friendsAudio.play('waterStep',volume,60);this.oarTimes[i]=stroke.atMs;});
    }
    this.scenicRailVisuals?.update(this.renderer.camera,Boolean(snapshot.friends?.scenicRailway));
    this.friendsBuildVisuals.update(snapshot.friends?.building);
    this.friendsBuildVisuals.animate(this.visualElapsedMs);
    if(snapshot.friends?.environment)this.frontierVisuals?.synchronizeEnvironment(snapshot.friends.environment);
    this.frontierVisuals?.setCampfireState(snapshot.friends?.campfire);
    this.frontierVisuals?.setRetreatState(snapshot.friends?.retreats);
    const retreat=snapshot.friends?.retreats;
    if(retreat&&this.retreatSwitchSerial!==undefined&&retreat.switchSerial!==this.retreatSwitchSerial)this.switchReach?.trigger(retreat.switchBy);
    this.retreatSwitchSerial=retreat?.switchSerial;
    const roast=snapshot.friends?.campfire?.roasts[localPlayerId];
    if(!roast)this.audioEatenMarshmallowSerial=undefined;
    if(!isSpectating&&roast?.eatingMs&&roast.eatingMs<=500&&roast.serial!==this.audioEatenMarshmallowSerial){
      this.audioEatenMarshmallowSerial=roast.serial;
      friendsAudio.play('eat',.22,1000);
    }
    this.frontierVisuals?.update(snapshot.friends?.frontier, loadView?.target.x??local.x, loadView?.target.y??local.y, this.visualElapsedMs, pilotedVehicle || isSpectating || this.friendsTool===5 ? 0 : this.friendsTool, this.friendsToolFiring, snapshot.friends?.progress.openedTreasures,
      Math.max(0, this.visualElapsedMs - (snapshot.elapsedMs - snapshot.world.elapsedMs)),
      this.friendsTool!==6 && !snapshot.friends?.fishing?.fish.some(f=>f.ownerId===localPlayerId) && !isQuietSeat(local.friendsSeat) && local.lifeState==='alive' && (!useThirdPerson || Boolean(loadView)));
    if(this.frontierVisuals)this.frontierVisuals.retreats.update(this.visualElapsedMs/1000,this.renderer.camera,this.frontierVisuals.soundscapeEnvironment.daylight,this.frontierVisuals.environmentState.sunDirection??[0,1,0],snapshot.players);
    const frontier = snapshot.friends?.frontier;
    if (frontier && this.frontierVisuals && this.visualElapsedMs >= this.nextSoundscapeMs) {
      const environment = this.frontierVisuals.soundscapeEnvironment;
      this.nextSoundscapeMs = this.visualElapsedMs + 500;
      const bird = this.frontierVisuals.birdCallSource(this.getAimAngle());
      const mix = this.soundscape.sample(frontier, local.x, local.y, local.z, this.getAimAngle(), environment.daylight,
        environment.windSpeed, environment.windSeconds, environment.underground, tree => Boolean(this.getFriendsTerrain()?.supports(tree.x, tree.y, tree.z)),
        this.frontierVisuals.terrain.surfaceHeight(local.x, local.y));
      const indoors=insideStillwater(local,snapshot.friends?.retreats?.active??[]),roomGain=indoors?.3:1;
      friendsAudio.setSoundscape({ ...mix, wind:mix.wind*roomGain, birds: bird.volume*roomGain, birdPan: bird.pan });
      this.castleMusicArea = inCastleMusicArea(local, this.castleMusicArea);
      friendsAudio.setCastleMusic(this.castleMusicArea);
      const fireMix=campfireSound(local,this.getAimAngle(),snapshot.friends?.campfire?.fuelSeconds,environment.underground);
      const salt=RETREAT_SITES.find(s=>s.id==='saltwind-camp')!;
      const saltMix=snapshot.friends?.retreats?.active.includes(salt.id)?campfireSound(local,this.getAimAngle(),0,environment.underground,salt):{volume:0,pan:0};
      friendsAudio.setCampfireSound(saltMix.volume>fireMix.volume?saltMix:fireMix);
      const terrain = this.getFriendsTerrain();
      const worldMix=friendsWorldSound(local, this.getAimAngle(), environment.underground, (a,b) => {
        const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,distance=Math.hypot(dx,dy,dz);
        return distance < 48 || !terrain?.raycast({x:a.x,y:a.y,z:a.z,dx:dx/distance,dy:dy/distance,dz:dz/distance},distance-40);
      });
      if(indoors)worldMix.waterfall={...worldMix.waterfall,volume:worldMix.waterfall.volume*.35};
      friendsAudio.setWorldSound(worldMix);
      if (snapshot.friends) {
        const train = this.trainSound.sample(snapshot.friends, local, snapshot.elapsedMs, this.getAimAngle(), environment.underground);
        friendsAudio.setTrainSound({...train.mix,engine:train.mix.engine*roomGain,rail:train.mix.rail*roomGain});
        for (const event of train.events) friendsAudio.play(event.cue, event.volume, event.cue === 'trainHorn' ? 7000 : 2500, 1, undefined, { pan: event.pan });
      }
    }
    if (snapshot.friends && this.frontierVisuals) {
      const interaction = this.interactionSound.sample(snapshot.friends, {...local,id:localPlayerId}, snapshot.elapsedMs, this.getAimAngle(), cargo => {
        const bottom = cargoBounds(cargo).minZ;
        const pieces = snapshot.friends!.building?.pieces || [];
        const build = pieces.find(p => Math.abs((friendsBuildFloor([p],cargo.x,cargo.y,bottom,16)??Infinity)-bottom)<12);
        const floor = build ? friendsBuildFloor([build],cargo.x,cargo.y,bottom,16) : this.getFriendsTerrain()?.floor(cargo.x,cargo.y,bottom,16);
        const deck = friendsVehicleFloor(snapshot.friends!.vehicles,cargo.x,cargo.y,bottom);
        return deck !== undefined && Math.abs(deck-bottom)<12 ? {floor:deck,wood:true} : floor===undefined ? undefined : {floor,wood:build?.finish==='timber'};
      }, resetCamera);
      const audible = !isSpectating && !isFallingLocal && local.lifeState==='alive';
      friendsAudio.setReelSound(audible ? interaction.motor : {volume:0,pan:0});
      if (audible) for (const event of interaction.events) {
        if (event.cue==='treasure') friendsAudio.treasure(event.volume,event.pan);
        else friendsAudio.play(event.cue,event.volume,150,event.rate??1,undefined,{pan:event.pan});
      }
    }
    this.interactionPlayerId = localPlayerId;
    if (frontier && this.frontierVisuals) {
      const ray = this.playerInteractionRay(snapshot), cx = Math.floor(local.x / 512), cy = Math.floor(local.y / 512);
      if(this.harvestedArray!==frontier.harvested){this.harvestedArray=frontier.harvested;this.removedInteractionTrees=new Set(frontier.harvested);}
      const region=cx+','+cy;
      if(region!==this.treeRegion||this.plantedArray!==frontier.planted){
        this.treeRegion=region;this.plantedArray=frontier.planted;this.interactionTrees=[...frontier.planted];
        for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)this.interactionTrees.push(...frontierTrees(x,y));
      }
      const removed=this.removedInteractionTrees,trees=this.interactionTrees;
      // Snapshot presentation time may step backwards on reconciliation;
      // brushing cadence uses a monotonic local render clock instead.
      this.flightAudioTimeMs += Math.max(0, deltaMs);
      const flying = Boolean(local.friendsDevFlight && !resetCamera && !isSpectating && !isFallingLocal && !this.interactionBlocked && local.lifeState === 'alive');
      if (flying) friendsAudio.prepareFlightFoliage();
      const brush = this.flightFoliage.sample(local, this.flightAudioTimeMs, flying, trees,
        tree => !removed.has(tree.id) && this.frontierVisuals!.terrain.supports(tree.x, tree.y, tree.z),
        tree => this.frontierVisuals!.treeCanopy(tree), this.getAimAngle());
      if (brush) friendsAudio.play('flightFoliage', brush.volume, 330, brush.rate, .65, { pan: brush.pan });
      const active = !isSpectating && !this.interactionBlocked && !pilotedVehicle && !isQuietSeat(local.friendsSeat) && local.lifeState === 'alive' && this.friendsTool >= 1 && this.friendsTool <= 3;
      const target = active ? friendsInteractionTarget(this.frontierVisuals.terrain, ray, this.friendsTool, this.nearbyBuilds(snapshot, 300),
        trees.filter(t => !removed.has(t.id) && friendsTreeWithinReach(t,ray.x,ray.y) && this.frontierVisuals!.terrain.supports(t.x,t.y,t.z)), this.interactionAllowed,this.workPlane,this.friendsShovelFill,snapshot.friends?.retreats?.active) : undefined;
      this.predictedTools.update(local.id, this.friendsTool, target, active && this.friendsToolFiring, this.visualElapsedMs, Boolean(frontier.upgrades), this.friendsShovelFill);
      const predicted = this.predictedTools.snapshot()[local.id], accepted = frontier.interaction?.actions[local.id];
      const action = accepted?.targetId === target?.id && accepted?.tool === this.friendsTool && Boolean(accepted?.fill) === this.friendsShovelFill && this.friendsToolFiring ? accepted : predicted;
      this.frontierVisuals.setToolAction(action, this.visualElapsedMs);
      if (predicted && predicted.serial !== this.lastSwingSerial) {
        this.lastSwingSerial = predicted.serial;
        friendsAudio.play('swing', this.friendsTool === 3 ? .003 : .008, 120, this.friendsTool === 1 ? .85 : 1.1);
      }
      const contacts = this.interactionVisuals.update(target, frontier.interaction, this.frontierVisuals.terrain, localPlayerId, this.visualElapsedMs,local);
      for (const contact of contacts) {
        const distance = Math.hypot(contact.x-local.x,contact.y-local.y,contact.z-local.z);
        if (distance > 650) continue;
        const volume = contact.by === localPlayerId ? 1 : Math.max(.08, .5 * (1-distance/650));
        friendsAudio.material(contact.kind, (contact.broken ? .4 : .24) * volume, contact.broken ? .76 : 1);
        if (contact.broken) {
          if (contact.kind === 'wood') friendsAudio.play('treeBreak', .34 * volume, 80, .85);
          else if(contact.kind==='ore'||contact.kind==='stone')friendsAudio.play('miningBreak', .18*volume,100,1,undefined,
            {pan:Math.sin(Math.atan2(contact.y-local.y,contact.x-local.x)-this.getAimAngle())*.8});
          if (contact.by === localPlayerId) friendsAudio.play('collect', .085, 140);
        }
      }
      const feedback = frontier.feedback[localPlayerId], stamp = feedback && feedback.until + ':' + feedback.message;
      if (this.audioFeedbackStamp !== undefined && stamp && stamp !== this.audioFeedbackStamp && feedback.until > snapshot.elapsedMs) {
        if (feedback.message.startsWith('A new cedar planted.')) { friendsAudio.play('soil', .26); friendsAudio.play('leaves', .16); }
        else if (feedback.message.startsWith('Field pack deposited') || feedback.message.startsWith('Cargo collected') || feedback.message.startsWith('Materials loaded') || feedback.message.startsWith('Collected ')) friendsAudio.play('pack', .2, 170);
      }
      this.audioFeedbackStamp = stamp || '';
    }
    this.friendsWorldArrival?.update(deltaMs,this.frontierVisuals?.arrivalReadiness(local.x,local.y)??{ready:true,progress:1},Boolean(snapshot.friends)&&!isSpectating&&!isFallingLocal);
    this.renderer.presentationPreparingWorld=this.friendsWorldArrival?.preparingShaders??false;
    this.renderer.presentationViewmodelVisible=!this.friendsWorldArrival?.sequence.active || this.friendsWorldArrival.sequence.reveal>.92;
    // Compare accepted world revisions. Failed edits and replayed network
    // snapshots must never produce a false placement or removal sound.
    const building = snapshot.friends?.building;
    if (building && building.revision !== this.audioBuildRevision) {
      const next = new Map(building.pieces.map(p => [p.id, { revision: p.revision, finish: p.finish, x: p.x, y: p.y, z: p.z }]));
      if (this.audioBuildRevision !== undefined) {
        const nearby = (p: { x: number; y: number; z: number }) => Math.hypot(p.x - local.x, p.y - local.y, p.z - local.z) < 650;
        for (const [id, p] of next) if ((!this.audioPieces.has(id) || this.audioPieces.get(id)!.revision !== p.revision) && nearby(p)) { friendsAudio.material(p.finish, .26);const piece=building.pieces.find(piece=>piece.id===id);if(piece)this.friendsBuildVisuals.confirm(piece,this.visualElapsedMs); }
        for (const [id, p] of this.audioPieces) if (!next.has(id) && nearby(p)) friendsAudio.material(p.finish, .34);
      }
      this.audioPieces = next; this.audioBuildRevision = building.revision;
    }
    const deliveries = snapshot.friends?.hauling?.completedCargoIds?.length;
    if (deliveries !== undefined) {
      if (this.audioDeliveries !== undefined && deliveries > this.audioDeliveries) friendsAudio.play('success', .22, 500);
      this.audioDeliveries = deliveries;
    }
    // Quiet seating puts held equipment away even if input selects a firearm.
    // Renderer3D reapplies weapon visibility during render, after prepareFrame.
    this.renderer.frontierToolActive = Boolean(this.switchReach?.forPlayer(localPlayerId)) || isQuietSeat(local.friendsSeat) || Boolean(snapshot.friends?.frontier && (this.friendsTool || this.frontierVisuals?.flashlightEquipped));
    this.gestureViewmodels?.update(this.friendsArms,this.getAimPitch(),deltaMs,
      this.friendsTool===6 && !creativeBuilding && !this.interactionBlocked && !isSpectating && !useThirdPerson && !pilotedVehicle
      && local.lifeState==='alive' && !isQuietSeat(local.friendsSeat) && !local.motion?.swimming);
    this.tacticalVisuals.update(snapshot, this.visualElapsedMs);
    this.realityBreachVisuals.update(snapshot.realityBreach, snapshot.elapsedMs, this.renderer.camera);
    this.renderer.setRealityBreach(snapshot.realityBreach, snapshot.elapsedMs);
    // Never render a ground trail for the operator whose camera we currently
    // own. Those rings are useful for teammates, but become a translucent
    // near-camera floor layer during jumps and spectator transitions.
    this.trailSystem.update(snapshot.players, snapshot.elapsedMs, deltaMs, local.id);

    // Continuous Tower Mission (Uplink) charging sound
    const objective = snapshot.run?.objective;
    const captureStation = snapshot.buyStations.find(station => station.state === 'capturing'
      && local.lifeState === 'alive' && Math.hypot(local.x - station.x, local.y - station.y) <= station.captureRadius + 31);
    const captureFoundry = snapshot.weaponFoundry?.state === 'capturing' && local.lifeState === 'alive'
      && Math.hypot(local.x - snapshot.weaponFoundry.x, local.y - snapshot.weaponFoundry.y) <= snapshot.weaponFoundry.captureRadius + 31
      ? snapshot.weaponFoundry : undefined;
    const isUplink = objective?.kind === 'uplink' && !objective.completed;
    const inUplinkCircle = Boolean(isUplink && local.lifeState === 'alive'
      && Math.hypot(local.x - objective.x, local.y - objective.y) <= COOP_UPLINK_RADIUS);
    const activeCapture = captureStation || captureFoundry;
    const captureProgressRatio = activeCapture
      ? activeCapture.captureProgressMs / Math.max(1, activeCapture.captureRequiredMs)
      : 0;
    const uplinkProgressRatio = isUplink && objective.required > 0 ? objective.progress / objective.required : 0;
    // Station capture uses a restrained pulse; never layer it with the uplink
    // drone when both zones happen to be relevant in the same snapshot.
    soundManager.updateStationCapture(Boolean(activeCapture && !activeCapture.contested), captureProgressRatio);
    soundManager.updateTowerCharge(!activeCapture && inUplinkCircle, uplinkProgressRatio);

    const engine = this.renderState as unknown as GameEngine;
    this.renderer.prepareFrame(engine, deltaMs);
    if(isQuietSeat(local.friendsSeat)||local.motion?.swimming){
      this.frontierVisuals?.hideHeldTool();this.localFirearm.group.visible=false;this.renderer.fpsWeaponGroup.visible=false;
    }
    if(this.switchReach?.update(deltaMs,this.renderer.camera,localPlayerId,snapshot.players,!useThirdPerson)){friendsAudio.play('flashlight',.1,1000);}
    if(this.switchReach?.forPlayer(localPlayerId)){this.gestureViewmodels!.root.visible=false;this.frontierVisuals?.hideHeldTool();this.localFirearm.group.visible=false;this.renderer.fpsWeaponGroup.visible=false;}
    this.marshmallows?.update(snapshot.players,snapshot.friends?.campfire,localPlayerId,this.renderer.camera,this.visualElapsedMs/1000,deltaMs,!useThirdPerson,(id,out)=>{const rig=this.remotePlayers.get(id);if(!rig||!friendsCharacterHandPoint(rig,out))return false;rig.root.localToWorld(out);return true;});
    if(snapshot.friends?.campfire?.equipped?.includes(localPlayerId)){this.frontierVisuals?.hideHeldTool();this.localFirearm.group.visible=false;this.renderer.fpsWeaponGroup.visible=false;if(this.gestureViewmodels)this.gestureViewmodels.root.visible=false;}
    this.birdVisuals?.update(snapshot.friends?.birds,snapshot.players,localPlayerId,this.friendsTool,this.renderer.camera,snapshot.elapsedMs,!useThirdPerson,this.interactionBlocked||creativeBuilding||isSpectating,(id,out)=>{const rig=this.remotePlayers.get(id);if(!rig||!friendsCharacterHandPoint(rig,out))return false;rig.root.localToWorld(out);return true;},point=>this.renderer.projectViewmodelPointToWorld(point));
    if(this.birdVisuals?.held.visible){this.frontierVisuals?.hideHeldTool();this.localFirearm.group.visible=false;this.renderer.fpsWeaponGroup.visible=false;if(this.gestureViewmodels)this.gestureViewmodels.root.visible=false;}
    this.stoneVisuals?.update(snapshot.friends?.stones,snapshot.players,localPlayerId,this.friendsTool,this.renderer.camera,snapshot.elapsedMs,!useThirdPerson,this.interactionBlocked||creativeBuilding||isSpectating,(id,out)=>{const rig=this.remotePlayers.get(id);if(!rig||!friendsCharacterHandPoint(rig,out))return false;rig.root.localToWorld(out);return true;});
    if(this.stoneVisuals?.held.visible){this.frontierVisuals?.hideHeldTool();this.localFirearm.group.visible=false;this.renderer.fpsWeaponGroup.visible=false;if(this.gestureViewmodels)this.gestureViewmodels.root.visible=false;}
    this.fishingVisuals?.update(snapshot.friends?.fishing,snapshot.players,localPlayerId,this.friendsTool,this.renderer.camera,snapshot.elapsedMs,deltaMs,!useThirdPerson,point=>this.renderer.projectViewmodelPointToWorld(point),(id,out,bothHands)=>{const rig=this.remotePlayers.get(id);if(!rig||!friendsCharacterHandPoint(rig,out,bothHands))return false;rig.root.localToWorld(out);return true;});
    if(snapshot.friends?.fishing?.equipped.includes(localPlayerId)||snapshot.friends?.fishing?.fish.some(f=>f.ownerId===localPlayerId)){
      this.frontierVisuals?.hideHeldTool();this.localFirearm.group.visible=false;this.renderer.fpsWeaponGroup.visible=false;if(this.gestureViewmodels)this.gestureViewmodels.root.visible=false;
    }
    // Arcana has its own meshes, so it must sample the posed hand after camera
    // preparation instead of bypassing muzzle alignment via raw snapshots.
    this.arcanaVisuals.update(snapshot, deltaMs, projectile => {
      if (projectile.ownerId === localPlayerId && !useThirdPerson) {
        return { position: this.renderer.projectViewmodelPointToWorld(this.localFirearm.getMuzzlePoint()), initialScale: .06 };
      }
      const remote = this.remotePlayers.get(projectile.ownerId);
      return remote ? { position: remote.firearm.getMuzzlePoint().getWorldPosition(new THREE.Vector3()), initialScale: .4 } : undefined;
    });
    if (!useThirdPerson && this.newlyObservedProjectileIds.size > 0) {
      const muzzle = selectedWeaponId === 'plasma_gun'
        ? this.renderer.projectViewmodelPointToWorld(this.renderer.weaponMuzzlePoint)
        : this.renderer.projectViewmodelPointToWorld(this.localFirearm.getMuzzlePoint());
      for (const id of this.newlyObservedProjectileIds) {
        const projectile = this.renderProjectileById.get(id);
        if (!projectile || projectile.ownerId !== localPlayerId) continue;
        const pitch = projectile.presentationPitch || 0;
        this.projectileMuzzlePresentation.anchor(id, projectile, muzzle, {
          x: Math.cos(projectile.rotation) * Math.cos(pitch),
          y: Math.sin(pitch),
          z: Math.sin(projectile.rotation) * Math.cos(pitch),
        });
      }
    }
    for (const id of this.projectileMuzzlePresentation.activeIds()) {
      const projectile = this.renderProjectileById.get(id);
      if (projectile) this.projectileMuzzlePresentation.present(id, projectile, deltaMs);
      else this.projectileMuzzlePresentation.forget(id);
    }
    this.renderer.render(engine, deltaMs, () => {
      if(loadView){
        const camera=this.renderer.camera,{eye,target}=loadView;
        camera.position.set(eye.x,eye.z,eye.y);camera.lookAt(target.x,target.z,target.y);camera.fov=50;
        // The live image occupies the remaining space beside the controls.
        // Off-axis framing keeps its subject centered there without another render.
        const canvas=this.renderer.renderer.domElement,w=canvas.clientWidth,h=canvas.clientHeight;
        if(w>=800)camera.setViewOffset(w,h,Math.min(460,w*.4)/2,0,w,h);else camera.setViewOffset(w,h,0,h*.32,w,h);
        camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
      }
      this.underwater.update(this.renderer.camera,this.visualElapsedMs,Boolean(snapshot.friends),this.frontierVisuals?.soundscapeEnvironment.daylight??1);
      this.frontierVisuals?.syncFlashlightWithCamera();
      if(this.sharedFlashlights && this.frontierVisuals){
        const building=snapshot.friends?.building,terrain=this.frontierVisuals.terrain;
        const effect=this.sharedFlashlights.update(snapshot.players,localPlayerId,this.renderer.camera,this.visualElapsedMs,deltaMs,(source,eye)=>{
          const length=source.distanceTo(eye),margin=4,distance=Math.max(0,length-margin*2);
          const dx=(eye.x-source.x)/length,dy=(eye.z-source.z)/length,dz=(eye.y-source.y)/length;
          const ray={x:source.x+dx*margin,y:source.z+dy*margin,z:source.y+dz*margin,dx,dy,dz};
          if(terrain.raycast(ray,distance))return true;
          if(building){
            this.flashlightOcclusionIndex.update(building.pieces,building.revision);
            const nearby=this.flashlightOcclusionIndex.near((source.x+eye.x)/2,(source.z+eye.z)/2,length/2+32);
            if(raycastFriendsBuild(nearby,ray,distance))return true;
          }
          return false;
        },`${terrain.revision}:${building?.revision??0}`,!useThirdPerson && local.lifeState==='alive');
        this.renderer.setFriendsFlashlightGlare(effect);
      }
      this.friendsHaulingVisuals.update(snapshot, localPlayerId, this.friendsTool, snapshot.elapsedMs,
        point => this.renderer.projectViewmodelPointToWorld(point), !useThirdPerson);
    });
  }

  destroy() {
    friendsAudio.clearSoundscape();
    soundManager.stopStationCapture();
    soundManager.stopTowerCharge();
    this.exitPointerLock();
    this.renderer.renderer.domElement.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.localFirearm.dispose();
    this.arcanaVisuals.dispose();
    this.underwater.dispose();
    this.friendsVehicleVisuals.dispose();
    this.scenicRailVisuals?.dispose();
    this.friendsHaulingVisuals.dispose();
    this.friendsBuildVisuals.dispose();
    this.interactionVisuals.dispose();this.remoteTools.dispose();
    this.birdVisuals?.dispose();this.stoneVisuals?.dispose();this.fishingVisuals?.dispose();this.marshmallows?.dispose();this.gestureViewmodels?.dispose();this.switchReach?.dispose();
    this.frontierVisuals?.dispose();
    this.sharedFlashlights?.dispose();
    this.friendsSpawnVisuals?.dispose();
    this.friendsWorldArrival?.dispose();
    this.tacticalVisuals.dispose();
    this.realityBreachVisuals.dispose();
    this.structureVisuals.dispose();
    this.projectileImpactVisuals.dispose();
    this.trailSystem.dispose();
    for (const remote of this.remotePlayers.values()) {
      disposeCoopOperatorRig(remote);
      this.renderer.scene.remove(remote.root);
    }
    this.remotePlayers.clear();
    for (const mesh of this.passiveMeshes.values()) { this.renderer.scene.remove(mesh); disposeGroup(mesh); }
    this.passiveMeshes.clear();
    for (const arc of this.transientArcs) this.disposeLightning(arc.group);
    this.transientArcs.length = 0;
    for (const blast of this.transientBlasts) this.disposeTransientGroup(blast.group);
    this.transientBlasts.length = 0;
    this.clearGravityHazards();
    for (const lightning of this.lightningPool) this.disposeLightning(lightning);
    this.lightningPool.length = 0;
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
    const active = this.activeRenderEnemyIds; active.clear();
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
        enemy.presentationWorldId = source.worldId;
        enemy.presentationArchetypeName = source.archetypeName;
      }
      this.renderEnemies.push(enemy);
    }
    for (const id of this.renderEnemyById.keys()) if (!active.has(id)) this.renderEnemyById.delete(id);
  }

  private syncRenderProjectiles(snapshot: CoopSnapshot, localPlayerId: string) {
    const active = this.activeRenderProjectileIds; active.clear();
    this.newlyObservedProjectileIds.clear();
    this.renderProjectiles.length = 0;
    for (const source of snapshot.projectiles) {
      if (source.weaponId === 'arc_launcher' || isCoopSpell(source.weaponId)) continue;
      active.add(source.id);
      let projectile = this.renderProjectileById.get(source.id);
      if (!projectile) {
        projectile = this.toProjectile(source);
        this.renderProjectileById.set(source.id, projectile);
        if (source.ownerId === localPlayerId) this.newlyObservedProjectileIds.add(source.id);
      }
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

  private createLightning(color: string) {
    const pooled = this.lightningPool.pop();
    if (pooled) {
      pooled.visible = true;
      const halo = pooled.getObjectByName('arc-halo') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      halo.material.color.set(color);
      return pooled;
    }
    const group = new THREE.Group(); group.name = 'coop-arc-lightning';
    const halo = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .46, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false }));
    halo.name = 'arc-halo'; group.add(halo);
    const core = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#f0f9ff', transparent: true, opacity: .98, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false }));
    core.name = 'arc-core'; group.add(core);
    this.renderer.scene.add(group);
    return group;
  }

  private updateLightning(group: THREE.Group, from: THREE.Vector3Like, to: THREE.Vector3Like, seed: number, phase: number) {
    const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz);
    const segments = Math.max(8, Math.min(34, Math.ceil(distance / 45)));
    const nx = distance > .001 ? -dz / distance : 0, nz = distance > .001 ? dx / distance : 0;
    const points = this.lightningPoints;
    for (let index = 0; index <= segments; index++) {
      const t = index / segments, envelope = Math.sin(t * Math.PI);
      const wave = Math.sin(seed * 1.731 + index * 12.989 + phase * .031) + Math.cos(seed * .317 + index * 5.133 - phase * .023) * .55;
      const lateral = wave * Math.min(18, 5 + distance * .012) * envelope;
      const vertical = Math.sin(seed * .719 + index * 8.77 + phase * .027) * Math.min(12, 3 + distance * .008) * envelope;
      points[index].set(from.x + dx * t + nx * lateral, from.y + (to.y - from.y) * t + vertical, from.z + dz * t + nz * lateral);
    }
    const curve = new THREE.CatmullRomCurve3(this.lightningPointViews[segments + 1]);
    for (const strand of group.children as THREE.Mesh[]) {
      strand.geometry.dispose();
      strand.geometry = new THREE.TubeGeometry(curve, segments * 2, strand.name === 'arc-core' ? 2.0 : 7.5, strand.name === 'arc-core' ? 6 : 8, false);
      (strand.material as THREE.MeshBasicMaterial).opacity = strand.name === 'arc-core' ? .98 : .46;
    }
  }

  private disposeLightning(group: THREE.Group) {
    this.renderer.scene.remove(group);
    group.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
  }

  private releaseLightning(group: THREE.Group) {
    group.visible = false;
    if (this.lightningPool.length < 16) this.lightningPool.push(group);
    else this.disposeLightning(group);
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
      presentationWorldId: enemy.worldId,
      presentationArchetypeName: enemy.archetypeName,
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
      const frameScale = deltaMs / 16.666;
      particle.x += particle.vx * frameScale;
      particle.y += particle.vy * frameScale;
      if (particle.z !== undefined) {
        particle.z = Math.max(.5, particle.z + (particle.vz || 0) * frameScale);
        if (particle.vz !== undefined) particle.vz -= (particle.gravity || 0) * frameScale;
      }
      particle.life -= deltaMs;
    }
    for (let index = this.combatParticles.length - 1; index >= 0; index--) {
      if (this.combatParticles[index].life <= 0) this.combatParticles.splice(index, 1);
    }
    for (let index = this.transientArcs.length - 1; index >= 0; index--) {
      const arc = this.transientArcs[index]; arc.life -= deltaMs;
      const fade = Math.max(0, arc.life / arc.maxLife);
      const core = arc.group.getObjectByName('arc-core') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      const halo = arc.group.getObjectByName('arc-halo') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      core.material.opacity = fade; halo.material.opacity = fade * .34;
      if (arc.life <= 0) { this.releaseLightning(arc.group); this.transientArcs.splice(index, 1); }
    }
    for (let index = this.transientBlasts.length - 1; index >= 0; index--) {
      const blast = this.transientBlasts[index];
      blast.life -= deltaMs;
      const progress = Math.min(1, 1 - blast.life / blast.maxLife);
      const fade = Math.max(0, 1 - progress);
      const flash = blast.group.getObjectByName('demolition-flash') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
      const shockwave = blast.group.getObjectByName('demolition-shockwave') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const heatwave = blast.group.getObjectByName('demolition-heatwave') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const light = blast.group.getObjectByName('demolition-light') as THREE.PointLight;
      flash.scale.setScalar(5 + Math.sin(Math.min(1, progress * 3) * Math.PI / 2) * 68);
      flash.material.opacity = Math.max(0, 1 - progress * 2.4) * .92;
      shockwave.scale.setScalar(18 + progress * 150); shockwave.material.opacity = fade * .82;
      heatwave.scale.setScalar(9 + progress * 92); heatwave.material.opacity = fade * .48;
      light.intensity = Math.max(0, 18 * (1 - progress * 2));
      if (blast.life <= 0) { this.disposeTransientGroup(blast.group); this.transientBlasts.splice(index, 1); }
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
    } else if (event.kind === 'player_falling') {
      this.presentationShake = Math.max(this.presentationShake, event.playerId === localPlayerId ? 11 : 4);
    } else if (event.kind === 'player_redeployed') {
      this.spawnBurst(event.x, event.y, '#5eead4', 28, 1100, 6);
      if (event.playerId === localPlayerId) soundManager.playLevelUp();
    } else if (event.kind === 'objective_completed') {
      this.spawnBurst(event.x, event.y, '#5eead4', 24, 1000, 6);
      this.presentationShake = Math.max(this.presentationShake, 6);
      soundManager.playObjectiveComplete();
    } else if (event.kind === 'mission_started') {
      this.spawnBurst(event.x, event.y, event.color || '#2dd4bf', 20, 1_100, 6);
      this.presentationShake = Math.max(this.presentationShake, 3);
    } else if (event.kind === 'mission_stage') {
      this.spawnBurst(event.x, event.y, event.amount === -1 ? '#fb7185' : event.color || '#fbbf24', event.amount === -1 ? 22 : 15, 900, 5);
      this.presentationShake = Math.max(this.presentationShake, event.amount === -1 ? 5 : 2.5);
    } else if (event.kind === 'demolition_charge_planted') {
      this.spawnBurst(event.x, event.y, '#fb7185', 24, 900, 5.5);
      this.presentationShake = Math.max(this.presentationShake, 3.5);
      soundManager.playTacticalPing(true);
    } else if (event.kind === 'demolition_charge_detonated') {
      this.spawnDemolitionExplosion(event.x, event.y);
      this.presentationShake = Math.max(this.presentationShake, 14);
      soundManager.playExplosion();
    } else if (event.kind === 'mission_completed') {
      this.spawnBurst(event.x, event.y, '#5eead4', 34, 1_350, 7);
      this.presentationShake = Math.max(this.presentationShake, 7);
      soundManager.playObjectiveComplete();
    } else if (event.kind === 'mission_expired') {
      this.spawnBurst(event.x, event.y, '#4ade80', 26, 1_100, 6);
      this.presentationShake = Math.max(this.presentationShake, 5);
      soundManager.playObjectiveComplete();
    } else if (event.kind === 'station_online') {
      this.spawnBurst(event.x, event.y, '#67e8f9', 20, 900, 5);
      this.presentationShake = Math.max(this.presentationShake, 3);
      soundManager.playStationCaptured();
    } else if (event.kind === 'foundry_online') {
      this.spawnBurst(event.x, event.y, '#f59e0b', 26, 1100, 5.5);
      this.presentationShake = Math.max(this.presentationShake, 3.5);
      soundManager.playStationCaptured();
    } else if (event.kind === 'foundry_upgrade') {
      this.spawnBurst(event.x, event.y, '#f59e0b', 18, 800, 4.5);
      if (event.playerId === localPlayerId) soundManager.playLevelUp();
    } else if (event.kind === 'round_started') {
      soundManager.playNewRound();
    } else if (event.kind === 'player_revived') {
      this.spawnBurst(event.x, event.y, '#5eead4', 18, 900, 5.5);
      if (event.playerId === localPlayerId) { this.presentationShake = Math.max(this.presentationShake, 5); soundManager.playLevelUp(); }
    } else if (event.kind === 'damage_number' && event.playerId === localPlayerId && event.enemyId !== undefined && event.amount) {
      this.renderer.showEnemyDamageNumber(`coop-enemy-${event.enemyId}`, event.amount, event.color || '#ffffff');
    } else if (event.kind === 'enemy_hit') {
      if (event.weaponId && isCoopSpell(event.weaponId)) this.arcanaVisuals.impact({ ...event, amount: event.weaponId === 'astral_lance' ? 65 : 45, color: COOP_WEAPON_DETAILS[event.weaponId].color, z: 24 });
      const signatureHit = event.weaponId === 'arc_launcher' ? '#93c5fd'
        : event.weaponId === 'goreline_repeater' ? '#fb7185'
          : event.weaponId === 'riftspike_array' ? '#c084fc'
            : event.weaponId === 'dawnwall_cannon' ? '#fbbf24'
              : event.weaponId === 'winterglass_projector' ? '#bff5ff'
                : event.weaponId === 'cinderhex_engine' ? '#fb923c'
                  : undefined;
      this.spawnBurst(event.x, event.y, signatureHit || event.color || '#ffffff', signatureHit ? 7 : 3, signatureHit ? 440 : 310, signatureHit ? 4.2 : 2.5);
      this.presentationShake = Math.max(this.presentationShake, 1.5);
      if (now - this.lastHitSoundAt > 45) {
        soundManager.playHit();
        this.lastHitSoundAt = now;
      }
    } else if (event.kind === 'projectile_impact') {
      if (event.weaponId && isCoopSpell(event.weaponId)) this.arcanaVisuals.impact(event);
      this.projectileImpactVisuals.spawn(
        event.x, event.y, event.z ?? 0,
        event.normalX || 0, event.normalY || 0, event.normalZ ?? 1,
        event.color || '#fbbf24', event.weaponId === 'combat_shotgun' ? 13 : 18,
      );
      this.spawnProjectileImpact(event);
      if (event.playerId === localPlayerId) this.presentationShake = Math.max(this.presentationShake, .35);
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
    } else if (event.kind === 'passive_triggered' && event.playerId && event.weaponId) {
      // Persistent passives stay deliberately quiet. Their authoritative
      // trigger is the one moment allowed to bloom, so power is communicated
      // without laying an animated billboard over combat at all times.
      const mesh = this.passiveMeshes.get(`${event.playerId}:${event.weaponId}`);
      if (mesh) (mesh.userData as PassiveMeshData).lastTriggerAtMs = event.atMs;
    } else if ((event.kind === 'reload_started' || event.kind === 'reload_shell_loaded') && event.playerId === localPlayerId) {
      // Reload state is host-authoritative just like firing, so a denied or
      // interrupted reload never emits a misleading magazine sound. The
      // shotgun additionally emits an authoritative seat sound per shell.
      soundManager.playReload(event.weaponId);
    } else if ((event.kind === 'arc_beam' || event.kind === 'arc_chain') && event.targetX !== undefined && event.targetY !== undefined) {
      this.spawnArc(event.x, event.y, event.targetX, event.targetY, event.kind === 'arc_beam' ? -1 : (event.chainIndex || 0), event.kind === 'arc_beam' ? 300 : 220);
    } else if (event.kind === 'artifact_cast' && event.targetX !== undefined && event.targetY !== undefined) {
      this.presentArtifactCast(event, localPlayerId);
    } else if (event.kind === 'fence_triggered' && event.targetX !== undefined && event.targetY !== undefined) {
      this.spawnArc(event.x, event.y, event.targetX, event.targetY, event.structureId || 0, 260);
      this.spawnBurst(event.targetX, event.targetY, event.color || '#a78bfa', 9, 430, 4);
      this.presentationShake = Math.max(this.presentationShake, 1.8);
      if (now - this.lastHitSoundAt > 90) { soundManager.playHit(); this.lastHitSoundAt = now; }
    } else if (event.kind === 'structure_built') {
      this.spawnBurst(event.x, event.y, event.color || '#67e8f9', 18, 700, 4.5);
      if (event.playerId === localPlayerId) soundManager.playUIHover();
    } else if (event.kind === 'structure_damaged') {
      this.spawnBurst(event.x, event.y, '#fbbf24', 7, 420, 3.5);
    } else if (event.kind === 'structure_destroyed') {
      this.spawnBurst(event.x, event.y, '#fb7185', 22, 780, 5.5);
      this.presentationShake = Math.max(this.presentationShake, 4.5);
      soundManager.playExplosion();
    } else if (event.kind === 'structure_dismantled') {
      this.spawnBurst(event.x, event.y, '#67e8f9', 10, 480, 3.5);
    } else if (event.kind === 'structure_activated') {
      this.spawnBurst(event.x, event.y, event.color || '#67e8f9', 24, 760, 5);
      this.presentationShake = Math.max(this.presentationShake, 2.2);
      if (event.playerId === localPlayerId) soundManager.playLevelUp();
    } else if (event.kind === 'structure_healed' && event.targetX !== undefined && event.targetY !== undefined) {
      this.spawnArc(event.x, event.y, event.targetX, event.targetY, event.structureId || 0, 180, event.color || '#22f59a');
      this.spawnBurst(event.targetX, event.targetY, event.color || '#22f59a', 7, 420, 3.5);
    } else if (event.kind === 'fabricator_charged' && event.playerId === localPlayerId) {
      soundManager.playCollect();
    } else if (event.kind === 'grenade_detonated' || event.kind === 'spell_impact') {
      this.arcanaVisuals.impact(event);
      this.presentationShake = Math.max(this.presentationShake, event.kind === 'grenade_detonated' || event.weaponId === 'rift_meteor' ? 5 : 2);
      if (event.kind === 'grenade_detonated') soundManager.playExplosion(); else soundManager.playSpell(event.weaponId || 'soul_nova', true);
    } else if (event.kind === 'grenade_thrown' && event.playerId === localPlayerId) {
      this.localFirearm.throwGrenade();
      soundManager.playGrenadeThrow();
    } else if (event.kind === 'spell_cast' && event.weaponId && isCoopSpell(event.weaponId)) {
      if (event.playerId === localPlayerId) {
        const predicted = event.actionId !== undefined && this.predictedFireActions.delete(event.actionId);
        if (!predicted) { this.launchLocalSpell(event.weaponId, event.id); this.localFirearm.fire(event.weaponId); soundManager.playSpell(event.weaponId); }
      } else this.remotePlayers.get(event.playerId || '')?.firearm.fire(event.weaponId);
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
      this.presentationShake = Math.max(this.presentationShake, event.weaponId === 'combat_shotgun' ? 2.5 : event.weaponId === 'arc_launcher' ? 1.25 : .8);
    }
  }

  private spawnArc(x: number, y: number, targetX: number, targetY: number, chainIndex: number, durationMs: number, color = '#60a5fa') {
    const lightning = this.createLightning(color);
    this.lightningFrom.set(x, chainIndex < 0 ? 25 : 38, y);
    this.lightningTo.set(targetX, 38, targetY);
    this.updateLightning(lightning, this.lightningFrom, this.lightningTo, 10_000 + chainIndex * 97 + Math.round(x + y), this.visualElapsedMs);
    this.transientArcs.push({ group: lightning, life: durationMs, maxLife: durationMs });
  }

  private presentArtifactCast(event: CoopCombatEvent, localPlayerId: string) {
    const targetX = event.targetX!, targetY = event.targetY!;
    switch (event.weaponId) {
      case 'reckoning':
        for (let round = 0; round < 5; round++) this.spawnArc(event.x + (round - 2) * 3, event.y, targetX, targetY, 120 + round, 230 + round * 18, round % 2 ? '#fecdd3' : '#fb7185');
        this.spawnBurst(targetX, targetY, '#fb7185', 22, 620, 6.5);
        this.presentationShake = Math.max(this.presentationShake, 6);
        break;
      case 'echo_collapse':
        this.spawnArc(event.x, event.y, targetX, targetY, 240 + (event.chainIndex || 0), 390, '#c084fc');
        this.spawnBurst(targetX, targetY, '#d8b4fe', 10, 520, 5.5);
        this.presentationShake = Math.max(this.presentationShake, 3.5);
        break;
      case 'shatter_lance':
        this.spawnArc(event.x, event.y, targetX, targetY, 330, 420, '#7dd3fc');
        this.spawnArc(event.x, event.y, targetX, targetY, 331, 300, '#f0f9ff');
        this.spawnBurst(targetX, targetY, '#bff5ff', 28, 760, 7.5);
        this.presentationShake = Math.max(this.presentationShake, 7);
        break;
      case 'stormcall':
        this.spawnArc(event.x, event.y, targetX, targetY, 410, 480, '#60a5fa');
        this.spawnBurst(targetX, targetY, '#93c5fd', 18, 680, 6);
        this.presentationShake = Math.max(this.presentationShake, 4.5);
        break;
      case 'dawnwall':
        this.spawnArc(event.x, event.y, targetX, targetY, 510, 360, '#fbbf24');
        this.spawnBurst(targetX, targetY, '#fde68a', 26, 820, 7);
        this.presentationShake = Math.max(this.presentationShake, 5);
        break;
      case 'hellseed':
        this.spawnArc(event.x, event.y, targetX, targetY, 610, 420, event.color || '#fb923c');
        this.spawnBurst(targetX, targetY, event.color || '#fb923c', event.amount === 5 ? 30 : 20, 850, event.amount === 5 ? 8 : 6.5);
        this.presentationShake = Math.max(this.presentationShake, event.amount === 5 ? 7 : 5);
        break;
    }
    if (event.playerId === localPlayerId && (event.chainIndex === undefined || event.chainIndex === 0)) soundManager.playArtifactCast(event.weaponId || '');
  }

  /** Turns a gravity hazard from an unexplained position correction into a
   * readable, diegetic pull: a full-size danger field, inbound vectors, a
   * tightening event horizon, then a bright collapse at the exact pull tick. */
  private syncGravityHazards(snapshot: CoopSnapshot, local: CoopSnapshot['players'][number]) {
    const activeIds = new Set<number>();
    for (const hazard of snapshot.hazards || []) {
      if (hazard.kind !== 'gravity') continue;
      activeIds.add(hazard.id);
      let visual = this.gravityHazards.get(hazard.id);
      if (!visual) {
        visual = { group: this.createGravityHazardVisual(hazard.color), resolved: false };
        this.gravityHazards.set(hazard.id, visual);
        this.renderer.scene.add(visual.group);
      }
      const group = visual.group;
      group.position.set(hazard.x, 2, hazard.y);
      const progress = THREE.MathUtils.clamp((snapshot.elapsedMs - hazard.startsAtMs) / Math.max(1, hazard.resolvesAtMs - hazard.startsAtMs), 0, 1);
      const pulse = 1 + Math.sin(snapshot.elapsedMs * .018) * .055;
      const outer = group.getObjectByName('gravity-outer') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const field = group.getObjectByName('gravity-field') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      const inner = group.getObjectByName('gravity-inner') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      const core = group.getObjectByName('gravity-core') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
      const halo = group.getObjectByName('gravity-halo') as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
      const light = group.getObjectByName('gravity-light') as THREE.PointLight;
      outer.scale.setScalar(hazard.radius * pulse);
      field.scale.setScalar(hazard.radius);
      const innerRadius = Math.max(24, hazard.radius * (.92 - progress * .76));
      inner.scale.setScalar(innerRadius);
      halo.scale.setScalar(Math.max(10, innerRadius * .22));
      halo.rotation.y = snapshot.elapsedMs * .008;
      core.scale.setScalar(Math.max(7, innerRadius * .13) * (1 + Math.sin(snapshot.elapsedMs * .03) * .16));
      const intensity = .42 + progress * .52;
      outer.material.opacity = intensity;
      field.material.opacity = .035 + progress * .09;
      inner.material.opacity = .42 + progress * .42;
      core.material.opacity = .52 + progress * .38;
      halo.material.opacity = .20 + progress * .56;
      light.intensity = 2 + progress * 9;
      for (let index = 0; index < 10; index++) {
        const arrow = group.getObjectByName(`gravity-vector-${index}`) as THREE.ArrowHelper;
        const angle = index / 10 * Math.PI * 2 + snapshot.elapsedMs * .00075;
        const vectorRadius = Math.max(32, hazard.radius * (.90 - progress * .65));
        arrow.position.set(Math.cos(angle) * vectorRadius, 7 + Math.sin(snapshot.elapsedMs * .012 + index) * 2, Math.sin(angle) * vectorRadius);
        arrow.setDirection(new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle)));
        arrow.setLength(Math.max(20, hazard.radius * .13), 13, 7);
      }
      const localInside = local.lifeState === 'alive' && Math.hypot(local.x - hazard.x, local.y - hazard.y) <= hazard.radius + 20;
      if (localInside && progress < 1) this.presentationShake = Math.max(this.presentationShake, .35 + progress * 1.35);
      if (progress >= 1 && !visual.resolved) {
        visual.resolved = true;
        outer.material.opacity = 1;
        inner.material.opacity = 1;
        core.scale.multiplyScalar(2.6);
        light.intensity = 22;
        if (localInside) {
          this.presentationShake = Math.max(this.presentationShake, 8);
          soundManager.playGravityPull();
        }
        this.spawnBurst(hazard.x, hazard.y, hazard.color, 34, 720, 7.5);
      }
    }
    for (const [id, visual] of this.gravityHazards) {
      if (activeIds.has(id)) continue;
      this.renderer.scene.remove(visual.group);
      disposeGroup(visual.group);
      this.gravityHazards.delete(id);
    }
  }

  private createGravityHazardVisual(color: string) {
    const group = new THREE.Group();
    const material = (opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const field = new THREE.Mesh(new THREE.CircleGeometry(1, 64), material(.035));
    field.name = 'gravity-field'; field.rotation.x = -Math.PI / 2; field.renderOrder = 28; group.add(field);
    const outer = new THREE.Mesh(new THREE.RingGeometry(.965, 1, 72), material(.42));
    outer.name = 'gravity-outer'; outer.rotation.x = -Math.PI / 2; outer.renderOrder = 31; group.add(outer);
    const inner = new THREE.Mesh(new THREE.RingGeometry(.72, 1, 56), material(.48));
    inner.name = 'gravity-inner'; inner.rotation.x = -Math.PI / 2; inner.position.y = 1.2; inner.renderOrder = 32; group.add(inner);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material(.62));
    core.name = 'gravity-core'; core.position.y = 8; core.renderOrder = 34; group.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.6, .16, 8, 28), material(.32));
    halo.name = 'gravity-halo'; halo.rotation.x = Math.PI / 2; halo.position.y = 11; halo.renderOrder = 35; group.add(halo);
    for (let index = 0; index < 10; index++) {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 28, color, 13, 7);
      arrow.name = `gravity-vector-${index}`;
      group.add(arrow);
    }
    const light = new THREE.PointLight(color, 3, 440, 2);
    light.name = 'gravity-light'; light.position.y = 34; group.add(light);
    return group;
  }

  private clearGravityHazards() {
    for (const visual of this.gravityHazards.values()) {
      this.renderer.scene.remove(visual.group);
      disposeGroup(visual.group);
    }
    this.gravityHazards.clear();
  }

  private spawnBurst(x: number, y: number, color: string, count: number, life: number, size: number) {
    const available = Math.max(0, 120 - this.combatParticles.length);
    for (let index = 0; index < Math.min(count, available); index++) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 0.12 + Math.random() * 0.2;
      this.combatParticles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color, size });
    }
  }

  /** A real 3D blast, not just the generic mission-complete confetti. The
   * additive flash and two expanding ground shockwaves remain readable from
   * close range and across a city block, while debris uses the shared capped
   * particle renderer. */
  private spawnDemolitionExplosion(x: number, y: number) {
    const group = new THREE.Group();
    group.position.set(x, 4, y);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({ color: '#fff7ed', transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    flash.name = 'demolition-flash'; flash.renderOrder = 36; group.add(flash);
    const shockwave = new THREE.Mesh(
      new THREE.RingGeometry(.72, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#fb923c', transparent: true, opacity: .82, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    shockwave.name = 'demolition-shockwave'; shockwave.rotation.x = -Math.PI / 2; shockwave.renderOrder = 35; group.add(shockwave);
    const heatwave = new THREE.Mesh(
      new THREE.RingGeometry(.35, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: .48, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    heatwave.name = 'demolition-heatwave'; heatwave.rotation.x = -Math.PI / 2; heatwave.position.y = 2; heatwave.renderOrder = 34; group.add(heatwave);
    const light = new THREE.PointLight('#fb923c', 18, 420, 2);
    light.name = 'demolition-light'; light.position.y = 38; group.add(light);
    this.renderer.scene.add(group);
    this.transientBlasts.push({ group, life: 1_150, maxLife: 1_150 });

    const available = Math.max(0, 120 - this.combatParticles.length);
    const count = Math.min(64, available);
    for (let index = 0; index < count; index++) {
      const angle = index / Math.max(1, count) * Math.PI * 2 + (Math.random() - .5) * .32;
      const speed = .28 + Math.random() * .72;
      const life = 650 + Math.random() * 850;
      this.combatParticles.push({
        x, y, z: 4 + Math.random() * 20,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        vz: .25 + Math.random() * .78, gravity: .025 + Math.random() * .016,
        life, maxLife: life,
        color: index % 7 === 0 ? '#ffffff' : index % 3 === 0 ? '#fbbf24' : '#fb923c',
        size: 4 + Math.random() * 8,
      });
    }
  }

  private disposeTransientGroup(group: THREE.Group) {
    this.renderer.scene.remove(group);
    group.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(material => material.dispose());
    });
  }

  /** A tiny directional spark/dust fan using the existing Points draw call.
   * The strict shared cap makes sustained automatic fire constant-cost. */
  private spawnProjectileImpact(event: CoopCombatEvent) {
    const available = Math.max(0, 120 - this.combatParticles.length);
    const signatureCount: Partial<Record<string, number>> = {
      goreline_repeater: 8,
      riftspike_array: 9,
      dawnwall_cannon: 12,
      winterglass_projector: 11,
      cinderhex_engine: 10,
    };
    const count = Math.min(signatureCount[event.weaponId || ''] || (event.weaponId === 'combat_shotgun' ? 3 : 5), available);
    const nx = event.normalX || 0, ny = event.normalY || 0, nz = event.normalZ ?? 1;
    const tangentX = -ny, tangentY = nx;
    const baseZ = Math.max(.8, event.z ?? 0);
    const accent = event.weaponId === 'goreline_repeater' ? '#fecdd3'
      : event.weaponId === 'riftspike_array' ? '#e9d5ff'
        : event.weaponId === 'dawnwall_cannon' ? '#fff7d6'
          : event.weaponId === 'winterglass_projector' ? '#effcff'
            : event.weaponId === 'cinderhex_engine' ? '#ffedd5'
              : '#f8fafc';
    for (let index = 0; index < count; index++) {
      const spread = count <= 1 ? 0 : index / (count - 1) - .5;
      const jitter = (Math.random() - .5) * .22;
      const speed = .24 + Math.random() * .3;
      const life = 220 + Math.random() * 190;
      this.combatParticles.push({
        x: event.x + nx * 1.5,
        y: event.y + ny * 1.5,
        z: baseZ,
        vx: nx * speed + tangentX * (spread + jitter) * .5,
        vy: ny * speed + tangentY * (spread + jitter) * .5,
        vz: nz * speed + (nz > .5 ? .06 + Math.random() * .1 : spread * .18),
        gravity: nz > .5 ? .022 : .011,
        life,
        maxLife: life,
        color: index % 4 === 0 ? accent : event.color || '#fbbf24',
        size: index === 0 ? (signatureCount[event.weaponId || ''] ? 5.2 : 3.2) : 1.6 + Math.random() * (signatureCount[event.weaponId || ''] ? 2.4 : 1.2),
      });
    }
  }

  private syncRemotePlayers(snapshot: CoopSnapshot, localPlayerId: string, isSpectating: boolean) {
    const active = new Set<string>();
    for (const player of snapshot.players) {
      const fall = this.activeFall(player.id);
      if (!shouldRenderPlayerRig(player.id, localPlayerId, isSpectating, Boolean(fall))) continue;
      active.add(player.id);
      let remote = this.remotePlayers.get(player.id);
      if (remote && (remote.skin.id !== getCoopSkin(player.skinId).id || Boolean(remote.root.userData.friendsCharacter) !== (this.worldId === 'friends_frontier'))) {
        disposeCoopOperatorRig(remote);
        this.renderer.scene.remove(remote.root);
        this.remotePlayers.delete(player.id);
        remote = undefined;
      }
      if (!remote) {
        remote = createCoopOperatorRig(player.color, player.label, player.skinId, this.worldId === 'friends_frontier' ? 'friends' : 'operator');
        if (this.worldId === 'friends_frontier') mountFriendsCharacter(remote, player.color);
        this.remotePlayers.set(player.id, remote);
        this.renderer.scene.add(remote.root);
      }
      if (fall) {
        const progress = Math.min(1, (performance.now() - fall.startedAtMs) / FALL_PRESENTATION_MS);
        updateCoopOperatorRig(remote, { ...player, x: fall.x, y: fall.y, z: this.fallHeight(fall), angle: fall.angle }, snapshot.elapsedMs, 16.666, progress);
      } else {
        const floor = snapshot.friends && friendsVehicleFloor(snapshot.friends.vehicles, player.x, player.y, player.z);
        updateCoopOperatorRig(remote, player, snapshot.elapsedMs, 16.666, undefined, floor !== undefined && Math.abs(player.z - floor) < 2);
      }
      if(this.worldId==='friends_frontier'){
        const rowing=isRowboatSeat(player.friendsSeat)?snapshot.friends?.vehicles.find(v=>v.kind==='rowboat')?.rowing:undefined;
        const stroke=player.friendsSeat?.index===0?rowing?.left:rowing?.right;
        updateFriendsCharacter(remote,player,this.visualElapsedMs,snapshot.friends?.frontier?.interaction?.actions[player.id],Boolean(fall),stroke?rowboatStrokePhase(stroke,snapshot.elapsedMs):undefined,snapshot.friends?.fishing?.fish.some(f=>f.ownerId===player.id)?'fish':snapshot.friends?.fishing?.equipped.includes(player.id)?'rod':snapshot.friends?.stones?.equipped.some(h=>h.playerId===player.id)?'stone':snapshot.friends?.birds?.equipped.some(h=>h.playerId===player.id)?'seeds':snapshot.friends?.campfire?.equipped?.includes(player.id)?'marshmallow':undefined,snapshot.friends?.stones?.equipped.find(h=>h.playerId===player.id),snapshot.friends?.birds?.equipped.find(h=>h.playerId===player.id));
        this.switchReach?.poseRemote(remote,player);
      }
    }
    for(const id of active){
      const rig=this.remotePlayers.get(id);if(!rig)continue;
      const camping=isQuietSeat(snapshot.players.find(p=>p.id===id)?.friendsSeat)||this.switchReach?.forPlayer(id);
      this.remoteTools.update(id,rig,camping?undefined:snapshot.friends?.frontier?.interaction?.actions[id],this.visualElapsedMs);
      if(camping||snapshot.friends?.campfire?.equipped?.includes(id)||snapshot.friends?.birds?.equipped.some(h=>h.playerId===id)||snapshot.friends?.stones?.equipped.some(h=>h.playerId===id)||snapshot.friends?.fishing?.equipped.includes(id)||snapshot.friends?.fishing?.fish.some(f=>f.ownerId===id)||snapshot.players.find(p=>p.id===id)?.friendsHands)rig.firearm.group.visible=false;
    }
    this.remoteTools.prune(active);
    for (const [id, remote] of this.remotePlayers) {
      if (active.has(id)) continue;
      disposeCoopOperatorRig(remote);
      this.renderer.scene.remove(remote.root);
      this.remotePlayers.delete(id);
    }
  }

  /** Only the client that owns the fallen operator renders the cinematic.
   * Teammates consume the same event as UI copy and remove the eliminated rig. */
  private registerFallingPresentation(snapshot: CoopSnapshot, localPlayerId: string) {
    const now = performance.now();
    for (const event of snapshot.combatEvents) {
      if (event.kind !== 'player_falling' || event.playerId !== localPlayerId || this.fallingPresentations.has(localPlayerId)) continue;
      const player = snapshot.players.find(candidate => candidate.id === event.playerId);
      const networkAgeMs = Math.max(0, snapshot.elapsedMs - event.atMs);
      this.fallingPresentations.set(localPlayerId, {
        startedAtMs: now - Math.min(FALL_PRESENTATION_MS, networkAgeMs),
        x: event.x,
        y: event.y,
        angle: player?.angle || 0,
      });
    }
    for (const player of snapshot.players) {
      if (player.lifeState === 'alive') this.fallingPresentations.delete(player.id);
    }
  }

  private activeFall(playerId: string) {
    const fall = this.fallingPresentations.get(playerId);
    if (!fall) return undefined;
    if (performance.now() - fall.startedAtMs < FALL_PRESENTATION_MS) return fall;
    this.fallingPresentations.delete(playerId);
    return undefined;
  }

  private fallHeight(fall: FallingPresentation) {
    const seconds = Math.max(0, performance.now() - fall.startedAtMs) / 1000;
    return -.5 * FALL_PRESENTATION_GRAVITY * seconds * seconds;
  }

  /** Render passive state as low-noise tactical information. The first-person
   * owner does not need their orbiting geometry repeatedly crossing the
   * reticle, while teammates only need a restrained identity/readiness cue. */
  private syncPassiveModules(snapshot: CoopSnapshot, focusPlayerId: string, firstPerson: boolean) {
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
        mesh.position.set(player.x, .7, player.y);
        const data = mesh.userData as PassiveMeshData;
        const isFirstPersonOwner = firstPerson && player.id === focusPlayerId;
        const focus = snapshot.players.find(candidate => candidate.id === focusPlayerId);
        const focusDistance = focus ? Math.hypot(player.x - focus.x, player.y - focus.y) : 999;
        // Effects around a nearby teammate are the most likely to fill the
        // screen. Fade them harder than distant silhouettes.
        const teammateClarity = THREE.MathUtils.lerp(.22, .55, THREE.MathUtils.smoothstep(focusDistance, 90, 420));
        const triggerAge = Math.max(0, snapshot.elapsedMs - data.lastTriggerAtMs);
        if (data.orbit) data.orbit.rotation.y = snapshot.elapsedMs * (module.id === 'data_scythe' ? -.0068 : .0044);
        if (data.orbit) data.orbit.visible = !isFirstPersonOwner;
        for (const material of data.orbitMaterials) {
          material.opacity = isFirstPersonOwner ? 0 : teammateClarity;
          material.transparent = true;
        }
        if (data.perimeter) {
          // A hairline boundary gives the owner useful range information but
          // never paints over enemies or terrain.
          const recentlyActive = triggerAge < 190;
          data.perimeter.material.opacity = (isFirstPersonOwner ? .13 : .055 * teammateClarity)
            + (recentlyActive ? (1 - triggerAge / 190) * (isFirstPersonOwner ? .17 : .08) : 0);
        }
        if (data.pulse) {
          const duration = 520;
          const progress = triggerAge / duration;
          data.pulse.visible = progress >= 0 && progress < 1;
          if (data.pulse.visible) {
            data.pulse.scale.setScalar(.16 + progress * .84);
            data.pulse.material.opacity = (1 - progress) ** 1.7 * (isFirstPersonOwner ? .48 : .28 * teammateClarity);
          }
        }
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
  let orbit: THREE.Group | undefined;
  let perimeter: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined;
  let pulse: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined;
  const orbitMaterials: THREE.Material[] = [];
  if (id === 'orbit_drones' || id === 'data_scythe') {
    orbit = new THREE.Group();
    const count = id === 'orbit_drones' ? 1 + rank : rank;
    const radius = passiveRadius(id, rank);
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2;
      const shell = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(.46), emissive: color, emissiveIntensity: .8,
        metalness: .72, roughness: .34, transparent: true, opacity: .5, depthWrite: false,
      });
      orbitMaterials.push(shell);
      const part = id === 'orbit_drones'
        ? new THREE.Mesh(new THREE.OctahedronGeometry(4.5 + rank * .45, 0), shell)
        : new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.5, 17 + rank * 2), shell);
      part.position.set(Math.cos(angle) * radius, id === 'orbit_drones' ? 10 : 6, Math.sin(angle) * radius);
      part.rotation.y = -angle;
      orbit.add(part);
    }
    group.add(orbit);
  } else {
    const radius = passiveRadius(id, rank);
    const points = Array.from({ length: 65 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    if (id === 'neural_pulse') {
      pulse = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false, depthTest: true, toneMapped: false,
      }));
      pulse.visible = false;
      group.add(pulse);
    } else {
      // Broken arcs read as a tactical boundary, not a solid magic carpet.
      const dashPoints: THREE.Vector3[] = [];
      const dashCount = 20;
      for (let index = 0; index < dashCount; index++) {
        const start = index / dashCount * Math.PI * 2;
        const end = (index + .62) / dashCount * Math.PI * 2;
        dashPoints.push(
          new THREE.Vector3(Math.cos(start) * radius, 0, Math.sin(start) * radius),
          new THREE.Vector3(Math.cos(end) * radius, 0, Math.sin(end) * radius),
        );
      }
      perimeter = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dashPoints), new THREE.LineBasicMaterial({
        color, transparent: true, opacity: .1, depthWrite: false, depthTest: true, toneMapped: false,
      }));
      group.add(perimeter);
    }
  }
  group.userData = { rank, orbit, orbitMaterials, perimeter, pulse, lastTriggerAtMs: -Infinity } satisfies PassiveMeshData;
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
