import { getWorldWallContact, resolveWorldCollisions } from '../world/WorldLayout';
import { getWorldDefinition, isWorldSurfaceWalkable, sampleWorldSurface, type WorldId } from '../world/WorldDefinitions';
import type { MultiplayerInputFrame } from './protocol';

export const COOP_STEP_MS = 1000 / 30;
export const COOP_PLAYER_RADIUS = 19;
export const COOP_JUMP_VELOCITY = 560;
export const COOP_WALL_JUMP_VELOCITY = 520;
export const COOP_DOUBLE_JUMP_BOOST = 420;
export const COOP_DOUBLE_JUMP_MAX_VELOCITY = 520;
export const COOP_JET_FUEL_MAX = 100;
/** Two seconds of uninterrupted thrust from a full tank. */
export const COOP_JET_DRAIN_PER_SECOND = 50;
export const COOP_JET_RECHARGE_PER_SECOND = 50;
export const COOP_JET_RECHARGE_DELAY_MS = 800;
/** Kept as an exported tuning contract: ground launch and air ignition are immediate. */
export const COOP_JET_IGNITION_DELAY_MS = 0;
export const COOP_JET_SOFT_CEILING = 120;
export const COOP_JET_HARD_CEILING = 150;
export const COOP_JET_THRUST_ACCELERATION = 2_400;
/** Renderer contract used to keep jump arcs clear of visual-only overheads. */
export const COOP_FIRST_PERSON_EYE_HEIGHT = 26;
export const COOP_CAMERA_OVERHEAD_SAFETY_MARGIN = 90;

export type PlayerCollisionResolver = (position: { x: number; y: number }, radius: number) => boolean;
export interface PlayerWallContact { normalX: number; normalY: number; }
export type PlayerWallContactDetector = (position: { x: number; y: number }, radius: number) => PlayerWallContact | undefined;

export interface PlayerMotionState {
  x: number;
  y: number;
  z: number;
  angle: number;
  sprinting: boolean;
  sliding: boolean;
  crouching: boolean;
  verticalVelocity: number;
  lastJumpSequence: number;
  /** Last accepted airborne jump and the world-space direction away from its wall. */
  lastWallJumpSequence?: number;
  lastDoubleJumpSequence?: number;
  wallJumpDirectionX?: number;
  wallJumpDirectionY?: number;
  /** Shared by Burst Pack ignition and wall-jump; only a real landing restores it. */
  airActionConsumedSinceGrounded?: boolean;
  slideAngle: number;
  /** Host-derived from the player's validated Operator Imprint. */
  movementMultiplier?: number;
  carryingHostage?: boolean;
  jetFuel?: number;
  jetActive?: boolean;
  jetIgnitedThisAirTime?: boolean;
  airborneMs?: number;
  groundedMs?: number;
}

/** The co-op city is a physical floating platform, not a collision box. Once
 * an operative's centre crosses this footprint the host owns the fall death. */
export function isOnCoopPlatform(x: number, y: number, worldId: WorldId = 'neon_bastion') {
  return isWorldSurfaceWalkable(worldId, x, y, COOP_PLAYER_RADIUS * .7);
}

export function advancePlayerMovement(
  player: PlayerMotionState,
  input: MultiplayerInputFrame | undefined,
  deltaMs: number,
  resolveAdditionalCollisions?: PlayerCollisionResolver,
  getAdditionalWallContact?: PlayerWallContactDetector,
  worldId: WorldId = 'neon_bastion',
) {
  const seconds = Math.max(0, Math.min(50, deltaMs)) / 1000;
  if (input) {
    player.angle = input.aimAngle / 65535 * Math.PI * 2;
    player.sprinting = input.sprinting && !player.carryingHostage;
    const grounded = player.z <= 0.001;
    const groundSurface = sampleWorldSurface(worldId, player.x, player.y);
    player.jetFuel = Math.max(0, Math.min(COOP_JET_FUEL_MAX, player.jetFuel ?? COOP_JET_FUEL_MAX));
    player.airborneMs = grounded ? 0 : (player.airborneMs || 0) + deltaMs;
    player.groundedMs = grounded ? (player.groundedMs || 0) + deltaMs : 0;
    const forward = (input.movement & 1 ? 1 : 0) - (input.movement & 2 ? 1 : 0);
    const strafe = (input.movement & 8 ? 1 : 0) - (input.movement & 4 ? 1 : 0);
    const magnitude = Math.hypot(forward, strafe) || 1;
    const requested = {
      x: (Math.cos(player.angle) * forward - Math.sin(player.angle) * strafe) / magnitude,
      y: (Math.sin(player.angle) * forward + Math.cos(player.angle) * strafe) / magnitude,
    };
    if (input.sliding && input.sprinting && !player.carryingHostage && (forward !== 0 || strafe !== 0) && grounded && !player.sliding) {
      player.slideAngle = Math.atan2(requested.y, requested.x);
      player.sliding = true;
    }
    if (!input.sliding || !grounded) player.sliding = false;
    player.crouching = input.sliding && !player.sliding && grounded;
    const movement = player.sliding ? { x: Math.cos(player.slideAngle), y: Math.sin(player.slideAngle) } : requested;
    const carryMultiplier = player.carryingHostage ? .82 : 1;
    const surfaceMultiplier = grounded ? groundSurface.movementMultiplier : 1;
    const slideMultiplier = groundSurface.kind === 'thin_ice' ? 2.8 : 2.35;
    const speed = 300 * Math.max(1, Math.min(1.16, player.movementMultiplier || 1)) * carryMultiplier * surfaceMultiplier * (player.sliding ? slideMultiplier : player.crouching ? 0.55 : !grounded ? 1.10 : player.sprinting ? 1.65 : 1);
    const contactBeforeMovement = !grounded
      ? getWorldWallContact(player.x, player.y, COOP_PLAYER_RADIUS, 3, worldId) || getAdditionalWallContact?.(player, COOP_PLAYER_RADIUS)
      : undefined;
    const position = {
      x: player.x + movement.x * speed * seconds,
      y: player.y + movement.y * speed * seconds,
    };
    // Architecture remains solid, but the platform edge deliberately does
    // not: crossing it is handled as a fall by the authoritative simulation.
    const worldCollision = resolveWorldCollisions(position, COOP_PLAYER_RADIUS, false, worldId);
    const touchedAdditionalSurface = resolveAdditionalCollisions?.(position, COOP_PLAYER_RADIUS) || false;
    const wallContact = contactBeforeMovement || (!grounded
      ? getWorldWallContact(position.x, position.y, COOP_PLAYER_RADIUS, 3, worldId) || getAdditionalWallContact?.(position, COOP_PLAYER_RADIUS)
      : undefined);
    player.x = position.x;
    player.y = position.y;
    if (input.jumpPressed && input.sequence !== player.lastJumpSequence) {
      player.lastJumpSequence = input.sequence;
      if (grounded) player.verticalVelocity = COOP_JUMP_VELOCITY;
      else if (!player.airActionConsumedSinceGrounded && (wallContact || worldCollision.collided || touchedAdditionalSurface)) {
        player.verticalVelocity = COOP_WALL_JUMP_VELOCITY;
        player.airActionConsumedSinceGrounded = true;
        player.lastWallJumpSequence = input.sequence;
        // Resting contact supplies a stable outward normal even when the
        // player is facing or already moving away from the wall.
        player.wallJumpDirectionX = wallContact?.normalX ?? -movement.x;
        player.wallJumpDirectionY = wallContact?.normalY ?? -movement.y;
      }
    }
    // Holding jump on the floor is a direct jet-assisted launch. Releasing
    // early produces a short hop; continuing to hold keeps the engine lit.
    // The same held input may also ignite while already in the air.
    const canGroundLaunch = grounded && !player.jetIgnitedThisAirTime && (player.jetFuel || 0) > 0;
    const canAirIgnite = !grounded && !player.airActionConsumedSinceGrounded
      && !player.jetIgnitedThisAirTime && (player.airborneMs || 0) >= COOP_JET_IGNITION_DELAY_MS
      && (player.jetFuel || 0) > 0;
    if (input.jetHeld && !player.carryingHostage && (canGroundLaunch || canAirIgnite)) {
      if (canGroundLaunch) player.verticalVelocity = Math.max(player.verticalVelocity, COOP_JUMP_VELOCITY);
      player.jetIgnitedThisAirTime = true;
      player.airActionConsumedSinceGrounded = true;
      player.jetActive = true;
      player.lastDoubleJumpSequence = input.sequence;
    }
    if (!input.jetHeld || player.carryingHostage || (player.jetFuel || 0) <= 0) player.jetActive = false;
    if (player.jetActive) {
      const taper = player.z <= COOP_JET_SOFT_CEILING ? 1 : Math.max(0, (COOP_JET_HARD_CEILING - player.z) / (COOP_JET_HARD_CEILING - COOP_JET_SOFT_CEILING));
      player.verticalVelocity += COOP_JET_THRUST_ACCELERATION * taper * seconds;
      player.jetFuel = Math.max(0, (player.jetFuel || 0) - COOP_JET_DRAIN_PER_SECOND * seconds);
      if (player.jetFuel <= 0) player.jetActive = false;
    }
  }
  player.verticalVelocity -= getWorldDefinition(worldId).movementGravity * seconds;
  player.z += player.verticalVelocity * seconds;
  if (player.z <= 0) {
    player.z = 0;
    player.verticalVelocity = 0;
    player.airActionConsumedSinceGrounded = false;
    player.jetActive = false;
    player.jetIgnitedThisAirTime = false;
    player.airborneMs = 0;
    if (player.groundedMs >= COOP_JET_RECHARGE_DELAY_MS) {
      const surface = sampleWorldSurface(worldId, player.x, player.y);
      player.jetFuel = Math.min(COOP_JET_FUEL_MAX, (player.jetFuel ?? COOP_JET_FUEL_MAX) + COOP_JET_RECHARGE_PER_SECOND * surface.jetRechargeMultiplier * seconds);
    }
  } else if (player.z >= COOP_JET_HARD_CEILING) {
    player.z = COOP_JET_HARD_CEILING;
    player.verticalVelocity = Math.min(0, player.verticalVelocity);
  }
  if (player.z > 0.001) { player.sliding = false; player.crouching = false; }
}
