import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFriendsCharacterModel, cloneFriendsCharacterModel, type FriendsCharacterData } from './FriendsCharacterModel';
import { lengthenFirstPersonArms } from './FriendsFirstPersonArms';
import { FriendsGestureViewmodels } from './FriendsGestureViewmodels';
import { applyFriendsArmPose } from './FriendsGesturePose';
const data = JSON.parse(readFileSync('public/models/friends/big-walk/character.json', 'utf8')) as FriendsCharacterData;
function fixture(aspect = 16 / 9) {
  const source = createFriendsCharacterModel(data, new THREE.MeshStandardMaterial());
  const model = cloneFriendsCharacterModel(source); lengthenFirstPersonArms(model);
  model.basis.position.set(0, 0, 0); model.basis.scale.setScalar(.075); model.root.rotation.y = Math.PI;
  model.parts[2].position.set(5.2, 0, 0); model.parts[3].position.set(-5.2, 0, 0);
  model.basePositions = model.parts.map(part => part.position.clone());
  const root = new THREE.Group(), camera = new THREE.PerspectiveCamera(98, aspect, .025, 1000);
  root.add(model.root); camera.add(root); camera.updateMatrixWorld(true);
  const view = Object.assign(Object.create(FriendsGestureViewmodels.prototype), {
    root, model, camera, blend: [0, 0, 0, 0], lighting: { setVisible() {} },
  }) as FriendsGestureViewmodels;
  return { source, model, view, camera };
}

describe('first-person arm reach and framing', () => {
  it('lengthens the local limb while preserving shoulder and hand blocks and source avatars', () => {
    const { source, model } = fixture();
    for (const index of [2, 3]) {
      const original = (source.parts[index].children[0] as THREE.Mesh).geometry;
      const mesh = model.parts[index].children[0] as THREE.SkinnedMesh;
      const before = original.getAttribute('position'), after = mesh.geometry.getAttribute('position');
      expect(mesh.geometry).not.toBe(original);
      for (let i = 0; i < 36; i++) expect(new THREE.Vector3().fromBufferAttribute(after, i).distanceTo(new THREE.Vector3().fromBufferAttribute(before, i))).toBeLessThan(1e-5);
      const handStart = after.count - 36;
      for (let i = handStart; i < after.count; i++) {
        const beforeDistance = new THREE.Vector3().fromBufferAttribute(before, i).distanceTo(new THREE.Vector3().fromBufferAttribute(before, handStart));
        const afterDistance = new THREE.Vector3().fromBufferAttribute(after, i).distanceTo(new THREE.Vector3().fromBufferAttribute(after, handStart));
        expect(afterDistance).toBeCloseTo(beforeDistance, 5);
      }
      expect(new THREE.Vector3().fromArray(model.parts[index].userData.palm).distanceTo(new THREE.Vector3().fromArray(source.parts[index].userData.palm))).toBeGreaterThan(1);
      mesh.updateMatrixWorld(true); mesh.skeleton.update();
      for (let i = 0; i < after.count; i++) expect(mesh.getVertexPosition(i, new THREE.Vector3()).distanceTo(new THREE.Vector3().fromBufferAttribute(after, i))).toBeLessThan(1e-5);
    }
  });

  it('keeps both shoulders fixed behind the camera through all gestures and blends', () => {
    const { model, view, camera } = fixture();
    const shoulder = (index: number) => model.parts[index].localToWorld(new THREE.Vector3().fromArray(model.parts[index].userData.shoulderPivot));
    view.update(0, 0, 10000, true); camera.updateMatrixWorld(true);
    const attached = [shoulder(2), shoulder(3)];
    for (let mask = 0; mask < 16; mask++) for (let frame = 0; frame < 20; frame++) {
      view.update(mask, 0, 16, true); camera.updateMatrixWorld(true);
      for (const index of [2, 3]) {
        expect(shoulder(index).distanceTo(attached[index - 2])).toBeLessThan(1e-8);
        expect(shoulder(index).z).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the exact third-person sideways rotation instead of turning the arm forward', () => {
    for (const mask of [5, 10, 15]) {
      const { source, model, view, camera } = fixture();
      applyFriendsArmPose(source, mask, 0, 10000, [0, 0, 0, 0]);
      view.update(mask, 0, 10000, true); camera.updateMatrixWorld(true);
      for (let side = 0; side < 2; side++) {
        if (!(mask & (1 << side))) continue;
        const part = model.parts[side + 2];
        expect(part.quaternion.angleTo(source.parts[side + 2].quaternion)).toBeLessThan(1e-7);
        const shoulder = part.localToWorld(new THREE.Vector3().fromArray(part.userData.shoulderPivot));
        const hand = part.localToWorld(new THREE.Vector3().fromArray(part.userData.palm));
        const direction = hand.sub(shoulder).normalize();
        expect(side === 0 ? -direction.x : direction.x).toBeGreaterThan(.9);
        expect(Math.abs(direction.z)).toBeLessThan(.1);
      }
    }
  });

  it('raises first-person hands higher while leaving the shared avatar pose untouched', () => {
    const { source, model, view, camera } = fixture();
    const rotations = source.parts.map(part => part.rotation.toArray());
    view.update(3, 0, 10000, true); camera.updateMatrixWorld(true);
    for (const index of [2, 3]) {
      const part = model.parts[index];
      const shoulder = part.localToWorld(new THREE.Vector3().fromArray(part.userData.shoulderPivot));
      const hand = part.localToWorld(new THREE.Vector3().fromArray(part.userData.palm));
      expect(hand.sub(shoulder).normalize().y).toBeGreaterThan(.45);
    }
    expect(source.parts.map(part => part.rotation.toArray())).toEqual(rotations);
  });

  it('shows forward and raised hands at wide and narrow aspects', () => {
    for (const aspect of [16 / 9, 2.4, 9 / 16]) {
      const { model, view, camera } = fixture(aspect);
      for (let mask = 1; mask < 16; mask++) {
        view.update(mask, 0, 10000, true); camera.updateMatrixWorld(true);
        for (let side = 0; side < 2; side++) {
          const raised = Boolean(mask & (1 << side)), point = Boolean(mask & (1 << (side + 2)));
          // A truly sideways arm extends beyond the first-person camera, as
          // on the shared avatar; do not turn it forward just to show its hand.
          if ((!raised && !point) || (raised && point)) continue;
          const mesh = model.parts[side + 2].children[0] as THREE.SkinnedMesh;
          const positions = mesh.geometry.getAttribute('position'), bounds = new THREE.Box3();
          mesh.skeleton.update();
          for (let i = positions.count - 36; i < positions.count; i++) bounds.expandByPoint(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).project(camera));
          expect(bounds.min.x, `aspect ${aspect}, mask ${mask}, side ${side}`).toBeLessThan(1);
          expect(bounds.max.x).toBeGreaterThan(-1);
          expect(bounds.min.y).toBeLessThan(1); expect(bounds.max.y).toBeGreaterThan(-1);
        }
      }
    }
  });
});
