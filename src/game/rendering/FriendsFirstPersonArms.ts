import * as THREE from 'three';
import type { FriendsCharacterModel } from './FriendsCharacterModel';

export const FRIENDS_FIRST_PERSON_ARM_REACH = 1.4;

/** Lengthen only the local limb between shoulder and wrist. The shoulder block
 * and palm retain their dimensions; every shared edge uses the same mapping. */
export function lengthenFirstPersonArms(model: FriendsCharacterModel) {
  for (const index of [2, 3]) {
    const part = model.parts[index], mesh = part.children[0] as THREE.SkinnedMesh;
    const geometry = mesh.geometry.clone(), positions = geometry.getAttribute('position');
    const shoulder = new THREE.Vector3().fromArray(part.userData.shoulderPivot);
    const palm = new THREE.Vector3().fromArray(part.userData.palm);
    const axis = palm.clone().sub(shoulder).normalize(), point = new THREE.Vector3();
    let shoulderEnd = -Infinity, wristStart = Infinity;
    for (let i = 0; i < 36; i++) shoulderEnd = Math.max(shoulderEnd, point.fromBufferAttribute(positions, i).sub(shoulder).dot(axis));
    for (let i = positions.count - 36; i < positions.count; i++) wristStart = Math.min(wristStart, point.fromBufferAttribute(positions, i).sub(shoulder).dot(axis));
    const extension = (wristStart - shoulderEnd) * (FRIENDS_FIRST_PERSON_ARM_REACH - 1);
    const extend = (point: THREE.Vector3) => {
      const depth = point.clone().sub(shoulder).dot(axis);
      return point.addScaledVector(axis, THREE.MathUtils.clamp(depth - shoulderEnd, 0, wristStart - shoulderEnd) * (FRIENDS_FIRST_PERSON_ARM_REACH - 1));
    };
    for (let i = 0; i < positions.count; i++) {
      extend(point.fromBufferAttribute(positions, i)); positions.setXYZ(i, point.x, point.y, point.z);
    }
    // Update the cloned skeleton's bind landmarks without changing the source.
    const bones = mesh.skeleton.bones, elbow = bones[1], wrist = bones[2];
    const wristPoint = wrist.position.clone().add(elbow.position);
    extend(elbow.position); wrist.position.copy(extend(wristPoint)).sub(elbow.position);
    model.root.updateMatrixWorld(true); mesh.bind(mesh.skeleton);
    part.userData.palm = palm.addScaledVector(axis, extension).toArray();
    geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    // This geometry belongs to this viewmodel, unlike the source avatar buffers.
    geometry.userData = { firstPersonArm: true }; mesh.geometry = geometry;
  }
}
