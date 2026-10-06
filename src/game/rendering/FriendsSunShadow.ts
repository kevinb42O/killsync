import * as THREE from 'three';
const offset = new THREE.Vector3(1800,2300,-1200);
const forward = offset.clone().normalize();
const right = new THREE.Vector3(0,1,0).cross(forward).normalize();
const up = forward.clone().cross(right).normalize();
/** Anchor the shadow projection to its texel grid in light space. Camera
 * bob and fractional movement must not slide the entire shadow texture. */
export function updateFrontierSunShadow(light: THREE.DirectionalLight, focus: THREE.Vector3) {
  const camera = light.shadow.camera;
  const tx = (camera.right-camera.left)/light.shadow.mapSize.x;
  const ty = (camera.top-camera.bottom)/light.shadow.mapSize.y;
  const target = light.target.position;
  target.copy(right).multiplyScalar(Math.round(focus.dot(right)/tx)*tx)
    .addScaledVector(up,Math.round(focus.dot(up)/ty)*ty)
    .addScaledVector(forward,Math.round(focus.dot(forward)/tx)*tx);
  light.position.copy(target).add(offset);
  light.target.updateMatrixWorld();light.updateMatrixWorld();
}
