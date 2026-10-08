import * as THREE from 'three';

export const FRIENDS_NIGHT_VISION_RANGE = 4800;

/** Keep useful spill outside the camera's corners, including zoom/sprint. */
export function friendsVisionAngle(camera: THREE.PerspectiveCamera) {
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV() / 2));
  return Math.min(THREE.MathUtils.degToRad(85), Math.atan(halfHeight * Math.hypot(1, camera.aspect)) + THREE.MathUtils.degToRad(8));
}

/** Preserve aspect ratio and bound HDR memory on high-DPI/large displays. */
export function friendsVisionBufferSize(width: number, height: number, maxPixels: number, target=new THREE.Vector2()) {
  const scale = Math.min(1, Math.sqrt(Math.max(1,maxPixels) / Math.max(1, width * height)));
  return target.set(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
}
