import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFriendsCharacterModel, type FriendsCharacterData, type FriendsCharacterModel } from './FriendsCharacterModel';
import { lengthenFirstPersonArms } from './FriendsFirstPersonArms';
import { FriendsGestureViewmodels } from './FriendsGestureViewmodels';

const data = JSON.parse(readFileSync('public/models/friends/big-walk/character.json', 'utf8')) as FriendsCharacterData;
function fixture(aspect: number, fov: number) {
  const model = createFriendsCharacterModel(data, new THREE.MeshStandardMaterial());
  lengthenFirstPersonArms(model);
  model.basis.position.set(0, 0, 0); model.basis.scale.setScalar(.075); model.root.rotation.y = Math.PI;
  model.parts[2].position.set(5.2, 0, 0); model.parts[3].position.set(-5.2, 0, 0);
  model.basePositions = model.parts.map(part => part.position.clone());
  const root = new THREE.Group(), camera = new THREE.PerspectiveCamera(fov, aspect, .025, 1000);
  root.add(model.root); camera.add(root);
  const view = Object.assign(Object.create(FriendsGestureViewmodels.prototype), {
    root, model, camera, blend: [0, 0, 0, 0], lighting: { setVisible() {} },
  }) as FriendsGestureViewmodels;
  (view as unknown as { createConfettiPile(model: FriendsCharacterModel): void }).createConfettiPile(model);
  const pile = root.getObjectByName('friends-held-confetti') as THREE.InstancedMesh;
  return { view, model, camera, pile };
}

describe('held confetti', () => {
  it('keeps every piece on top of the palm and inside the first-person view', () => {
    for (const aspect of [16 / 9, 2.4, 9 / 16]) for (const fov of [70, 98, 110]) {
      const { view, model, camera, pile } = fixture(aspect, fov);
      view.update(0, 0, 10000, true, true); camera.updateMatrixWorld(true);
      expect(pile.visible).toBe(true);
      const palm = model.parts[3].localToWorld(new THREE.Vector3().fromArray(model.parts[3].userData.palm));
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < pile.count; i++) {
        pile.getMatrixAt(i, matrix);
        const center = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(pile.matrixWorld);
        expect(center.y).toBeGreaterThan(palm.y);
        const vertices = pile.geometry.getAttribute('position');
        for (let j = 0; j < vertices.count; j++) {
          const screen = new THREE.Vector3().fromBufferAttribute(vertices, j).applyMatrix4(matrix).applyMatrix4(pile.matrixWorld).project(camera);
          expect(Math.abs(screen.x)).toBeLessThan(1);
          expect(Math.abs(screen.y)).toBeLessThan(1);
          expect(screen.z).toBeGreaterThan(-1); expect(screen.z).toBeLessThan(1);
        }
      }
    }
  });

  it('hides the pile after release and refills it when the throw finishes', () => {
    const { view, pile } = fixture(16 / 9, 98);
    for (const [age, visible] of [[0, true], [169, true], [170, false], [559, false], [560, true]] as const) {
      view.update(0, 0, 10000, true, true, 1000, 1000 + age);
      expect(pile.visible).toBe(visible);
    }
    view.update(0, 0, 10000, true, false);
    expect(pile.visible).toBe(false);
  });
});
