import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCastingHand, prepareCastingHand } from './SpellcastingHand';
import { CoopFirearmVisualRig } from './coopFirearmVisuals';
import { createCoopWeaponRuntime } from '../combat/coopFirearms';
import { Renderer3D } from '../Renderer3D';
import { CoopArcanaVisuals } from './CoopArcanaVisuals';
import { CoopSimulation } from '../multiplayer/CoopSimulation';

let asset: THREE.Group;
beforeAll(async () => {
  const bytes = readFileSync(new URL('../../../public/models/hellbinder/right-hand.glb', import.meta.url));
  asset = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
});

describe('authored casting hand', () => {
  it('renders spell births on the actual hand pixel despite different camera FOVs, aim pitch and recoil', () => {
    const rig = new CoopFirearmVisualRig(true), state = createCoopWeaponRuntime('ember_bolt');
    const camera = new THREE.PerspectiveCamera(108,16/9,.05,32000), viewmodelCamera = new THREE.PerspectiveCamera(98,16/9,.025,1000);
    camera.position.set(80,30,100); viewmodelCamera.position.copy(camera.position);
    const mount = new THREE.Group(); mount.position.set(1.85,-2.08,-6.05); mount.add(rig.group); viewmodelCamera.add(mount);
    const projector = {camera,viewmodelCamera,tempMuzzlePos:new THREE.Vector3(),tempMuzzleNdc:new THREE.Vector3(),tempMuzzleNdc2:new THREE.Vector2(),tempRaycaster:new THREE.Raycaster()} as unknown as Renderer3D;
    for (const pitch of [-.4,0,.4]) {
      camera.rotation.set(pitch,.6,.05); viewmodelCamera.rotation.copy(camera.rotation);
      rig.update(state,0,1000,false); rig.fire('ember_bolt'); rig.update(state,16,16,false);
      camera.updateMatrixWorld(true); viewmodelCamera.updateMatrixWorld(true);
      const handPixel = rig.getMuzzlePoint().getWorldPosition(new THREE.Vector3()).project(viewmodelCamera);
      const origin = Renderer3D.prototype.projectViewmodelPointToWorld.call(projector,rig.getMuzzlePoint());
      const visuals = new CoopArcanaVisuals(), snapshot = new CoopSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot();
      snapshot.projectiles = [{id:1,ownerId:'host',weaponId:'ember_bolt',x:80,y:40,z:28,angle:0,pitch,velocity:1050,radius:9,lifeMs:1000}];
      visuals.update(snapshot,16,() => ({position:origin,initialScale:.06}));
      const birthPixel = visuals.group.children[0].position.clone().project(camera);
      expect(birthPixel.x).toBeCloseTo(handPixel.x,6); expect(birthPixel.y).toBeCloseTo(handPixel.y,6);
      expect(Math.abs(birthPixel.x)).toBeGreaterThan(.1); // hand is visibly away from the camera center
      visuals.dispose();
    }
    rig.dispose();
  });
  it('places a substantial spell core entirely on the palm side, following the wrist through a cast', () => {
    const rig = buildCastingHand('#ff9933', true); rig.loadHand(asset);
    const hand = rig.root.getObjectByName('Articulated Casting Hand')!, orb = rig.root.getObjectByName('Spell Orb')!;
    for (const kick of [0, .5, 1]) {
      rig.updateCasting(0,kick,0); rig.root.updateMatrixWorld(true);
      const orbInHand = hand.worldToLocal(orb.getWorldPosition(new THREE.Vector3()));
      // +Z is dorsal; even the nearest edge of the core lies beyond the palm.
      expect(orbInHand.z + orb.scale.x).toBeLessThan(-.25);
      expect(orbInHand.y).toBeGreaterThan(1.5);
      expect(orb.scale.x).toBeGreaterThanOrEqual(.36);
      expect(rig.muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(orb.getWorldPosition(new THREE.Vector3()))).toBeLessThan(.00001);
    }
    rig.disposeCasting();
  });
  it('kicks the wrist on a real fire event, moves the sleeve continuously, and settles without moving its shoulder', () => {
    const rig = new CoopFirearmVisualRig(true), state = createCoopWeaponRuntime('ember_bolt');
    rig.update(state,0,16,false); rig.group.updateMatrixWorld(true);
    const wrist = rig.group.getObjectByName('Casting Recoil Wrist')!, shoulder = rig.group.getObjectByName('Camera Shoulder Anchor')!;
    const sleeve = rig.group.getObjectByName('Continuous Shoulder Sleeve') as THREE.Mesh;
    const positions = sleeve.geometry.getAttribute('position');
    const restWrist = wrist.getWorldPosition(new THREE.Vector3()), restShoulder = shoulder.getWorldPosition(new THREE.Vector3());
    const restSeam = new THREE.Vector3().fromBufferAttribute(positions,0), restEnd = new THREE.Vector3().fromBufferAttribute(positions,positions.count-1);
    rig.fire('ember_bolt'); rig.update(state,16,16,false); rig.group.updateMatrixWorld(true);
    expect(wrist.getWorldPosition(new THREE.Vector3()).z - restWrist.z).toBeGreaterThan(.5);
    expect(shoulder.getWorldPosition(new THREE.Vector3()).distanceTo(restShoulder)).toBeLessThan(.00001);
    expect(new THREE.Vector3().fromBufferAttribute(positions,0).distanceTo(restSeam)).toBeGreaterThan(.3);
    expect(new THREE.Vector3().fromBufferAttribute(positions,positions.count-1).distanceTo(restEnd)).toBeLessThan(.00001);
    rig.update(state,316,300,false); rig.group.updateMatrixWorld(true);
    expect(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(restWrist)).toBeLessThan(.00001);
    expect(new THREE.Vector3().fromBufferAttribute(positions,0).distanceTo(restSeam)).toBeLessThan(.00001);
    rig.dispose();
  });
  it('retains the actual skin bind pose while creating independent anatomical finger chains', () => {
    const material = new THREE.MeshStandardMaterial();
    const first = prepareCastingHand(asset, material), second = prepareCastingHand(asset, material);
    const sourceMesh = asset.getObjectByName('r_handMeshNode') as THREE.SkinnedMesh;
    const mesh = first.model.getObjectByName('Authored Anatomical Hand') as THREE.SkinnedMesh;
    expect(mesh.geometry).toBe(sourceMesh.geometry);
    expect(mesh.skeleton).not.toBe((second.model.getObjectByName('Authored Anatomical Hand') as THREE.SkinnedMesh).skeleton);
    first.model.updateMatrixWorld(true); mesh.skeleton.update(); sourceMesh.skeleton.update();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i += 17) {
      expect(mesh.getVertexPosition(i, new THREE.Vector3()).distanceTo(sourceMesh.getVertexPosition(i, new THREE.Vector3()))).toBeLessThan(.00001);
    }
    for (const finger of ['index-finger','middle-finger','ring-finger','pinky-finger']) {
      expect(first.model.getObjectByName(`${finger}-phalanx-proximal`)?.parent?.name).toBe(`${finger}-metacarpal`);
      expect(first.model.getObjectByName(`${finger}-tip`)?.parent?.name).toBe(`${finger}-phalanx-distal`);
    }
  });
  it('deforms authored vertices when casting without detaching the shoulder or wrist', () => {
    const rig = buildCastingHand('#ff9933', true); rig.loadHand(asset);
    const mesh = rig.root.getObjectByName('Authored Anatomical Hand') as THREE.SkinnedMesh;
    rig.root.updateMatrixWorld(true); mesh.skeleton.update();
    const before = Array.from({length: mesh.geometry.attributes.position.count}, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()));
    rig.updateCasting(1000,1,0); mesh.skeleton.update();
    expect(before.some((vertex,i) => vertex.distanceTo(mesh.getVertexPosition(i,new THREE.Vector3())) > .001)).toBe(true);
    const shoulder = rig.root.getObjectByName('Camera Shoulder Anchor')!;
    for (const aspect of [16/9,4/3,9/16]) {
      const camera = new THREE.PerspectiveCamera(98,aspect,.025,1000), parent = new THREE.Group();
      parent.position.set(1.85,-2.08,-6.05); parent.scale.setScalar(1.3); rig.root.position.x=.75; parent.add(rig.root); camera.add(parent); camera.updateMatrixWorld(true);
      expect(shoulder.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0);
    }
    rig.disposeCasting();
  });
  it('cleans owned resources and ignores model completions after disposal', () => {
    const rig = buildCastingHand('#81f6ff',true);
    const sleeve = rig.root.getObjectByName('Continuous Shoulder Sleeve') as THREE.Mesh;
    const disposeGeometry = vi.spyOn(sleeve.geometry,'dispose');
    rig.disposeCasting(); rig.loadHand(asset);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(rig.root.getObjectByName('Authored Anatomical Hand')).toBeUndefined();
  });
});
