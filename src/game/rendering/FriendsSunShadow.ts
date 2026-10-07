import * as THREE from 'three';
const offset = new THREE.Vector3(1800,2300,-1200);
const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
const worldUp = new THREE.Vector3(0,1,0), worldZ = new THREE.Vector3(0,0,1), defaultDirection = offset.clone().normalize();
const lightDistance = offset.length();
/** Anchor the shadow projection to its texel grid in light space. Camera
 * bob and fractional movement must not slide the entire shadow texture. */
export function updateFrontierSunShadow(light: THREE.DirectionalLight, focus: THREE.Vector3, direction = defaultDirection) {
  forward.copy(direction).normalize();
  const camera = light.shadow.camera;
  camera.up.copy(Math.abs(forward.y) > .999 ? worldZ : worldUp);
  right.crossVectors(camera.up,forward).normalize();
  up.crossVectors(forward,right).normalize();
  const tx = (camera.right-camera.left)/light.shadow.mapSize.x;
  const ty = (camera.top-camera.bottom)/light.shadow.mapSize.y;
  const target = light.target.position;
  target.copy(right).multiplyScalar(Math.round(focus.dot(right)/tx)*tx)
    .addScaledVector(up,Math.round(focus.dot(up)/ty)*ty)
    .addScaledVector(forward,Math.round(focus.dot(forward)/tx)*tx);
  light.position.copy(target).addScaledVector(forward,lightDistance);
  light.target.updateMatrixWorld();light.updateMatrixWorld();
}
