import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { getWorldWallContact, resolveWorldCollisions } from '../world/WorldLayout';
import type { MultiplayerInputFrame } from './protocol';

export const COOP_STEP_MS = 1000 / 30;
export const COOP_PLAYER_RADIUS = 19;
export const COOP_JUMP_VELOCITY = 560;
export const COOP_WALL_JUMP_VELOCITY = 520;
export const COOP_DOUBLE_JUMP_BOOST = 420;
export const COOP_DOUBLE_JUMP_MAX_VELOCITY = 520;
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
  /** Shared by the double jump and wall-jump; only a real landing restores it. */
  airActionConsumedSinceGrounded?: boolean;
  slideAngle: number;
  /** Host-derived from the player's validated Operator Imprint. */
  movementMultiplier?: number;
}

/** The co-op city is a physical floating platform, not a collision box. Once
 * an operative's centre crosses this footprint the host owns the fall death. */
export function isOnCoopPlatform(x: number, y: number) {
  return x >= 0 && x <= GAME_WIDTH && y >= 0 && y <= GAME_HEIGHT;
}

export function advancePlayerMovement(
  player: PlayerMotionState,
  input: MultiplayerInputFrame | undefined,
  deltaMs: number,
  resolveAdditionalCollisions?: PlayerCollisionResolver,
  getAdditionalWallContact?: PlayerWallContactDetector,
) {
  const seconds = Math.max(0, Math.min(50, deltaMs)) / 1000;
  if (input) {
    player.angle = input.aimAngle / 65535 * Math.PI * 2;
    player.sprinting = input.sprinting;
    const grounded = player.z <= 0.001;
    const forward = (input.movement & 1 ? 1 : 0) - (input.movement & 2 ? 1 : 0);
    const strafe = (input.movement & 8 ? 1 : 0) - (input.movement & 4 ? 1 : 0);
    const magnitude = Math.hypot(forward, strafe) || 1;
    const requested = {
      x: (Math.cos(player.angle) * forward - Math.sin(player.angle) * strafe) / magnitude,
      y: (Math.sin(player.angle) * forward + Math.cos(player.angle) * strafe) / magnitude,
    };
    if (input.sliding && input.sprinting && (forward !== 0 || strafe !== 0) && grounded && !player.sliding) {
      player.slideAngle = Math.atan2(requested.y, requested.x);
      player.sliding = true;
    }
    if (!input.sliding || !grounded) player.sliding = false;
    player.crouching = input.sliding && !player.sliding && grounded;
    const movement = player.sliding ? { x: Math.cos(player.slideAngle), y: Math.sin(player.slideAngle) } : requested;
    const speed = 300 * Math.max(1, Math.min(1.16, player.movementMultiplier || 1)) * (player.sliding ? 2.35 : player.crouching ? 0.55 : player.sprinting ? 1.65 : 1);
    const contactBeforeMovement = !grounded
      ? getWorldWallContact(player.x, player.y, COOP_PLAYER_RADIUS) || getAdditionalWallContact?.(player, COOP_PLAYER_RADIUS)
      : undefined;
    const position = {
      x: player.x + movement.x * speed * seconds,
      y: player.y + movement.y * speed * seconds,
    };
    // Architecture remains solid, but the platform edge deliberately does
    // not: crossing it is handled as a fall by the authoritative simulation.
    const worldCollision = resolveWorldCollisions(position, COOP_PLAYER_RADIUS, false);
    const touchedAdditionalSurface = resolveAdditionalCollisions?.(position, COOP_PLAYER_RADIUS) || false;
    const wallContact = contactBeforeMovement || (!grounded
      ? getWorldWallContact(position.x, position.y, COOP_PLAYER_RADIUS) || getAdditionalWallContact?.(position, COOP_PLAYER_RADIUS)
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
      } else if (!player.airActionConsumedSinceGrounded) {
        // A bounded jet impulse avoids punishing an early second press while
        // preventing two full jump arcs from stacking into excessive height.
        player.verticalVelocity = Math.min(
          COOP_DOUBLE_JUMP_MAX_VELOCITY,
          Math.max(0, player.verticalVelocity) + COOP_DOUBLE_JUMP_BOOST,
        );
        player.airActionConsumedSinceGrounded = true;
        player.lastDoubleJumpSequence = input.sequence;
      }
    }
  }
  player.verticalVelocity -= 1550 * seconds;
  player.z += player.verticalVelocity * seconds;
  if (player.z <= 0) {
    player.z = 0;
    player.verticalVelocity = 0;
    player.airActionConsumedSinceGrounded = false;
  }
  if (player.z > 0.001) { player.sliding = false; player.crouching = false; }
}
