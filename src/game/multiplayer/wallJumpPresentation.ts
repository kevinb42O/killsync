export const WALL_JUMP_MAX_CAMERA_ROLL = .13;
export const WALL_JUMP_MAX_CAMERA_PITCH = .055;

/** Converts the authoritative world-space launch direction into camera-local
 * lean. A lateral launch banks the view in that direction; a fore/aft launch
 * produces a smaller pitch kick so head-on walls still have physical weight. */
export function wallJumpCameraLean(directionX: number, directionY: number, aimAngle: number) {
  const length = Math.hypot(directionX, directionY);
  if (length < .0001) return { roll: 0, pitch: 0 };
  const normalX = directionX / length, normalY = directionY / length;
  const forwardX = Math.cos(aimAngle), forwardY = Math.sin(aimAngle);
  const rightX = -forwardY, rightY = forwardX;
  const lateral = normalX * rightX + normalY * rightY;
  const longitudinal = normalX * forwardX + normalY * forwardY;
  return {
    roll: -lateral * WALL_JUMP_MAX_CAMERA_ROLL,
    pitch: -longitudinal * WALL_JUMP_MAX_CAMERA_PITCH,
  };
}
