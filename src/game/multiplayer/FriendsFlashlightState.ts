export type FriendsFlashlightState = { pitch: number; cone: number; yaw?: number };

export function quantizeFriendsFlashlightCone(angle: number) {
  return Math.round(Math.max(.35, Math.min(Math.PI * 85 / 180, angle)) * 255 / (Math.PI / 2));
}

export function dequantizeFriendsFlashlightCone(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(.35, Math.min(Math.PI * 85 / 180, value! / 255 * Math.PI / 2)) : 1.35;
}
