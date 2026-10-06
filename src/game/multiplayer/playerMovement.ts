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
export const PLAYER_COYOTE_MS = 100;
export const PLAYER_JUMP_BUFFER_MS = 120;
const MOVEMENT_SUBSTEP_MS = 1000 / 120;

/** Persisted with authoritative snapshots so replay retains momentum and
 * pending actions instead of starting a fresh controller on every packet. */
export interface PlayerMovementMemory {
  velocityX?: number;
  velocityY?: number;
  coyoteMs?: number;
  jumpBufferMs?: number;
  bufferedJumpSequence?: number;
  lastJumpInputSequence?: number;
  slideMs?: number;
  slideHeld?: boolean;
}

export interface PlayerMovementEnvironment {
  elevationAware: boolean;
  volumetric?: boolean;
  ceiling: number;
  stepHeight?: number;
  overhead?: (position: PlayerMotionState) => number | undefined;
  /** Open passenger decks have a deliberately shallow boarding lip. */
  boardingFloor?: (position: PlayerMotionState) => number | undefined;
}

export type PlayerCollisionResolver = (position: { x: number; y: number }, radius: number) => boolean;
export interface PlayerWallContact { normalX: number; normalY: number; }
export type PlayerWallContactDetector = (position: { x: number; y: number }, radius: number) => PlayerWallContact | undefined;
/** Optional elevated hardlight surface. It is deliberately separate from
 * horizontal collision so walls can be jumped onto and walked across. */
export type PlayerFloorResolver = (position: { x: number; y: number }, radius: number) => number | undefined;

export interface PlayerMotionState extends PlayerMovementMemory {
  x: number;
  y: number;
  z: number;
  angle: number;
  sprinting: boolean;
  sliding: boolean;
  crouching: boolean;
  verticalVelocity: number;
  platformVelocityX?: number;
  platformVelocityY?: number;
  platformVelocityZ?: number;
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
  /** Last grounded elevation: a short boost also works on a high aircraft or roof. */
  jetLaunchFloor?: number;
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
  getAdditionalFloor?: PlayerFloorResolver,
  worldId: WorldId = 'neon_bastion',
  transport?: PlayerMovementEnvironment,
) {
  const duration = Math.max(0, Math.min(50, deltaMs));
  if (duration === 0) return;
  // Small shared steps prevent sprint/slide tunnelling and let genuine ramps
  // change elevation gradually without granting a whole block of auto-climb.
  const idle = !input?.movement && !input?.jumpPressed && !input?.jetHeld && !player.jetActive
    && !player.sliding && (player.jumpBufferMs ?? 0) === 0 && player.verticalVelocity === 0
    && Math.hypot(player.velocityX ?? 0, player.velocityY ?? 0) === 0;
  const restingSample = transport && idle ? { height: getAdditionalFloor?.(player, COOP_PLAYER_RADIUS) } : undefined;
  const restingFloor = restingSample?.height;
  const resting = idle && ((restingFloor !== undefined && Math.abs(player.z - restingFloor) <= .05)
    || (!transport?.volumetric && player.z === 0));
  const count = transport && !resting ? Math.ceil(duration / MOVEMENT_SUBSTEP_MS) : 1;
  for (let step = 0; step < count; step++) {
    advanceMovementStep(player, input, duration / count, resolveAdditionalCollisions,
      getAdditionalWallContact, getAdditionalFloor, worldId, transport, step === 0 ? restingSample : undefined);
  }
}

function advanceMovementStep(
  player: PlayerMotionState,
  input: MultiplayerInputFrame | undefined,
  deltaMs: number,
  resolveAdditionalCollisions: PlayerCollisionResolver | undefined,
  getAdditionalWallContact: PlayerWallContactDetector | undefined,
  getAdditionalFloor: PlayerFloorResolver | undefined,
  worldId: WorldId,
  transport: PlayerMovementEnvironment | undefined,
  cachedFloor?: { height: number | undefined },
) {
  const seconds = Math.max(0, Math.min(50, deltaMs)) / 1000;
  const startX = player.x, startY = player.y;
  const floorAtStart = cachedFloor ? cachedFloor.height : getAdditionalFloor?.(player, COOP_PLAYER_RADIUS);
  const boardingFloor = floorAtStart !== undefined && floorAtStart > player.z && floorAtStart - player.z <= 18
    && player.verticalVelocity <= 0 ? transport?.boardingFloor?.(player) : undefined;
  if (boardingFloor !== undefined && floorAtStart === boardingFloor && player.verticalVelocity <= 0
    && boardingFloor > player.z && boardingFloor - player.z <= 18) player.z = boardingFloor;
  const elevatedGrounded = player.verticalVelocity <= 0 && floorAtStart !== undefined && Math.abs(player.z - floorAtStart) <= .05;
  if (transport) {
    if (elevatedGrounded || (!transport?.volumetric && player.z <= .001)) player.jetLaunchFloor = floorAtStart ?? 0;
    else player.jetLaunchFloor ??= player.z;
  }
  if (input) {
    player.angle = input.aimAngle / 65535 * Math.PI * 2;
    player.sprinting = input.sprinting && !player.carryingHostage;
    const grounded = elevatedGrounded || (!transport?.volumetric && player.z <= 0.001 && player.verticalVelocity <= 0);
    if (transport) {
      player.coyoteMs = grounded ? PLAYER_COYOTE_MS : Math.max(0, (player.coyoteMs ?? 0) - deltaMs);
      player.jumpBufferMs = Math.max(0, (player.jumpBufferMs ?? 0) - deltaMs);
      if (input.jumpPressed && input.sequence !== player.lastJumpInputSequence) {
        player.lastJumpInputSequence = input.sequence;
        player.bufferedJumpSequence = input.sequence;
        player.jumpBufferMs = PLAYER_JUMP_BUFFER_MS;
      }
    }
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
    if (input.sliding && input.sprinting && !player.carryingHostage && (forward !== 0 || strafe !== 0) && grounded && !player.sliding && (!transport || !player.slideHeld)) {
      player.slideAngle = Math.atan2(requested.y, requested.x);
      player.sliding = true;
      player.slideMs = 0;
      if (transport) {
        const launchSpeed = Math.max(300 * 1.65, Math.hypot(player.velocityX ?? 0, player.velocityY ?? 0)) * 1.3;
        player.velocityX = requested.x * launchSpeed;
        player.velocityY = requested.y * launchSpeed;
      }
    }
    if (transport) {
      player.slideHeld = input.sliding;
      player.slideMs = player.sliding ? (player.slideMs ?? 0) + deltaMs : 0;
      if (player.slideMs >= 850) player.sliding = false;
    }
    if (!input.sliding || !grounded) player.sliding = false;
    player.crouching = input.sliding && !player.sliding && grounded;
    const movement = player.sliding ? { x: Math.cos(player.slideAngle), y: Math.sin(player.slideAngle) } : requested;
    const carryMultiplier = player.carryingHostage ? .82 : 1;
    const surfaceMultiplier = grounded ? groundSurface.movementMultiplier : 1;
    const slideMultiplier = groundSurface.kind === 'thin_ice' ? 2.8 : 2.35;
    const speed = 300 * Math.max(1, Math.min(1.16, player.movementMultiplier || 1)) * carryMultiplier * surfaceMultiplier * (player.sliding ? slideMultiplier : player.crouching ? 0.55 : !grounded ? 1.10 : player.sprinting ? 1.65 : 1);
    let displacementX = movement.x * speed * seconds;
    let displacementY = movement.y * speed * seconds;
    if (transport) {
      const hasInput = forward !== 0 || strafe !== 0;
      // Exact exponential integration keeps acceleration consistent between
      // host ticks and the client's fractional presentation frames.
      const response = player.sliding ? (groundSurface.kind === 'thin_ice' ? .7 : 1.8) : grounded ? (hasInput ? 24 : 32) : hasInput ? 7 : 0;
      const oldX = player.velocityX ?? 0, oldY = player.velocityY ?? 0;
      const steeringSpeed = grounded ? speed : Math.max(speed, Math.hypot(oldX, oldY));
      const targetX = player.sliding || !hasInput ? 0 : movement.x * steeringSpeed;
      const targetY = player.sliding || !hasInput ? 0 : movement.y * steeringSpeed;
      const decay = Math.exp(-response * seconds);
      const travel = response > 0 ? (1 - decay) / response : seconds;
      displacementX = targetX * seconds + (oldX - targetX) * travel;
      displacementY = targetY * seconds + (oldY - targetY) * travel;
      player.velocityX = targetX + (oldX - targetX) * decay;
      player.velocityY = targetY + (oldY - targetY) * decay;
      if (grounded && !hasInput && Math.hypot(player.velocityX, player.velocityY) < 1) player.velocityX = player.velocityY = 0;
    }
    const contactBeforeMovement = !grounded
      ? getWorldWallContact(player.x, player.y, COOP_PLAYER_RADIUS, 3, worldId, transport?.elevationAware ? player.z : undefined) || getAdditionalWallContact?.(player, COOP_PLAYER_RADIUS)
      : undefined;
    const position = {
      x: player.x + displacementX + (!grounded && transport ? player.platformVelocityX || 0 : 0) * seconds,
      y: player.y + displacementY + (!grounded && transport ? player.platformVelocityY || 0 : 0) * seconds,
    };
    const attemptedX = position.x, attemptedY = position.y;
    // Architecture remains solid, but the platform edge deliberately does
    // not: crossing it is handled as a fall by the authoritative simulation.
    const worldCollision = resolveWorldCollisions(position, COOP_PLAYER_RADIUS, false, worldId, transport?.elevationAware ? player.z : undefined);
    const touchedAdditionalSurface = resolveAdditionalCollisions?.(position, COOP_PLAYER_RADIUS) || false;
    if (transport && (worldCollision.collided || touchedAdditionalSurface)) {
      const pushX = position.x - attemptedX, pushY = position.y - attemptedY;
      const length = Math.hypot(pushX, pushY);
      if (length > .00001) {
        const nx = pushX / length, ny = pushY / length;
        const intoWall = Math.min(0, (player.velocityX ?? 0) * nx + (player.velocityY ?? 0) * ny);
        player.velocityX = (player.velocityX ?? 0) - nx * intoWall;
        player.velocityY = (player.velocityY ?? 0) - ny * intoWall;
      }
    }
    const wallContact = contactBeforeMovement || (!grounded
      ? getWorldWallContact(position.x, position.y, COOP_PLAYER_RADIUS, 3, worldId, transport?.elevationAware ? player.z : undefined) || getAdditionalWallContact?.(position, COOP_PLAYER_RADIUS)
      : undefined);
    player.x = position.x;
    player.y = position.y;
    const jumpSequence = transport ? player.bufferedJumpSequence ?? -1 : input.sequence;
    const wantsJump = transport ? (player.jumpBufferMs ?? 0) > 0 : input.jumpPressed && input.sequence !== player.lastJumpSequence;
    if (wantsJump) {
      if (grounded || (transport && (player.coyoteMs ?? 0) > 0)) {
        player.lastJumpSequence = jumpSequence;
        player.verticalVelocity = COOP_JUMP_VELOCITY + (transport ? player.platformVelocityZ || 0 : 0);
        player.coyoteMs = 0;
        player.jumpBufferMs = 0;
      }
      else if (!player.airActionConsumedSinceGrounded && (wallContact || worldCollision.collided || touchedAdditionalSurface)) {
        player.lastJumpSequence = jumpSequence;
        player.jumpBufferMs = 0;
        player.verticalVelocity = COOP_WALL_JUMP_VELOCITY;
        player.airActionConsumedSinceGrounded = true;
        player.lastWallJumpSequence = jumpSequence;
        // Resting contact supplies a stable outward normal even when the
        // player is facing or already moving away from the wall.
        player.wallJumpDirectionX = wallContact?.normalX ?? -movement.x;
        player.wallJumpDirectionY = wallContact?.normalY ?? -movement.y;
        if (transport) {
          player.velocityX = player.wallJumpDirectionX * 330;
          player.velocityY = player.wallJumpDirectionY * 330;
        }
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
      const launchFloor = transport ? player.jetLaunchFloor ?? 0 : 0;
      const hardCeiling = Math.min(transport?.ceiling ?? Infinity, launchFloor + COOP_JET_HARD_CEILING);
      const softCeiling = Math.min(hardCeiling - 30, launchFloor + COOP_JET_SOFT_CEILING);
      const taper = player.z <= softCeiling ? 1 : Math.max(0, (hardCeiling - player.z) / (hardCeiling - softCeiling));
      player.verticalVelocity += COOP_JET_THRUST_ACCELERATION * taper * seconds;
      player.jetFuel = Math.max(0, (player.jetFuel || 0) - COOP_JET_DRAIN_PER_SECOND * seconds);
      if (player.jetFuel <= 0) player.jetActive = false;
    }
  }
  if (!input && transport) {
    player.velocityX = player.velocityY = 0;
    player.jumpBufferMs = player.coyoteMs = 0;
    player.jetActive = false;
    player.sliding = player.sprinting = player.crouching = false;
    player.slideHeld = false;
  }
  if (!input && transport && (transport.volumetric || player.z > 0) && (floorAtStart === undefined || Math.abs(player.z - floorAtStart) > 1)) {
    const position = { x: player.x + (player.platformVelocityX || 0) * seconds, y: player.y + (player.platformVelocityY || 0) * seconds };
    resolveWorldCollisions(position, COOP_PLAYER_RADIUS, false, worldId, player.z); player.x = position.x; player.y = position.y;
  }
  if (!input && transport) resolveAdditionalCollisions?.(player, COOP_PLAYER_RADIUS);
  const overhead = transport?.overhead?.(player);
  const floorAfterMovement = player.x === startX && player.y === startY ? floorAtStart : getAdditionalFloor?.(player, COOP_PLAYER_RADIUS);
  // On a grounded ramp/stair route, follow a small change in surface height.
  // A jump retains its upward velocity; stepping off a balcony still falls.
  if (transport && elevatedGrounded && player.verticalVelocity <= 0 && floorAfterMovement !== undefined && Math.abs(floorAfterMovement - (floorAtStart ?? 0)) <= (transport.stepHeight ?? 0)) player.z = floorAfterMovement;
  const zBeforeGravity = player.z;
  player.verticalVelocity -= getWorldDefinition(worldId).movementGravity * seconds;
  player.z += player.verticalVelocity * seconds;
  // Keep the full operator beneath an open cabin's canopy. Outside its bounds,
  // their normal jet and jump physics resume immediately.
  if (overhead !== undefined && player.verticalVelocity > 0 && player.z + 50 > overhead) { player.z = Math.min(zBeforeGravity, overhead - 50); player.verticalVelocity = 0; }
  const landedOnHardlight = floorAfterMovement !== undefined && player.verticalVelocity <= 0
    && zBeforeGravity >= floorAfterMovement - .001 && player.z <= floorAfterMovement;
  if (landedOnHardlight || (!transport?.volumetric && player.z <= 0)) {
    player.z = landedOnHardlight ? floorAfterMovement! : 0;
    player.verticalVelocity = 0;
    if (transport) { player.platformVelocityX = 0; player.platformVelocityY = 0; player.platformVelocityZ = 0; }
    player.airActionConsumedSinceGrounded = false;
    player.jetActive = false;
    player.jetIgnitedThisAirTime = false;
    if (transport) player.jetLaunchFloor = player.z;
    player.airborneMs = 0;
    if (player.groundedMs >= COOP_JET_RECHARGE_DELAY_MS) {
      const surface = sampleWorldSurface(worldId, player.x, player.y);
      player.jetFuel = Math.min(COOP_JET_FUEL_MAX, (player.jetFuel ?? COOP_JET_FUEL_MAX) + COOP_JET_RECHARGE_PER_SECOND * surface.jetRechargeMultiplier * seconds);
    }
  } else if (transport && player.verticalVelocity > 0 && player.z > Math.min(transport.ceiling, (player.jetLaunchFloor ?? 0) + COOP_JET_HARD_CEILING)) {
    // Limit ascent only. Falling off a high vehicle must follow gravity, never
    // snap down to the ground jet ceiling or become suspended at its limit.
    player.z = Math.max(zBeforeGravity, Math.min(transport.ceiling, (player.jetLaunchFloor ?? 0) + COOP_JET_HARD_CEILING));
    player.verticalVelocity = 0;
  } else if (!transport && player.z >= Math.max(COOP_JET_HARD_CEILING, floorAtStart ?? 0)) {
    player.z = Math.max(transport?.ceiling ?? COOP_JET_HARD_CEILING, floorAtStart ?? 0);
    player.verticalVelocity = Math.min(0, player.verticalVelocity);
  }
  if (player.verticalVelocity !== 0) { player.sliding = false; player.crouching = false; }
}
