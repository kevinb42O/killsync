import { GAME_WIDTH } from '../../constants';
import { resolveWorldCollisions } from '../world/WorldLayout';
import type { MultiplayerInputFrame } from './protocol';

export const COOP_STEP_MS = 1000 / 30;
export const COOP_PLAYER_RADIUS = 19;

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
  slideAngle: number;
}

export function advancePlayerMovement(player: PlayerMotionState, input: MultiplayerInputFrame | undefined, deltaMs: number) {
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
    const speed = 300 * (player.sliding ? 2.35 : player.crouching ? 0.55 : player.sprinting ? 1.65 : 1);
    const position = {
      x: Math.max(COOP_PLAYER_RADIUS, Math.min(GAME_WIDTH - COOP_PLAYER_RADIUS, player.x + movement.x * speed * seconds)),
      y: Math.max(COOP_PLAYER_RADIUS, Math.min(GAME_WIDTH - COOP_PLAYER_RADIUS, player.y + movement.y * speed * seconds)),
    };
    resolveWorldCollisions(position, COOP_PLAYER_RADIUS);
    player.x = position.x;
    player.y = position.y;
    if (input.jumpPressed && input.sequence !== player.lastJumpSequence) {
      player.lastJumpSequence = input.sequence;
      if (grounded) player.verticalVelocity = 560;
    }
  }
  player.verticalVelocity -= 1550 * seconds;
  player.z += player.verticalVelocity * seconds;
  if (player.z <= 0) { player.z = 0; player.verticalVelocity = 0; }
  if (player.z > 0.001) { player.sliding = false; player.crouching = false; }
}