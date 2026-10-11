import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { createSoaringWingGeometry,FriendsSoaringVisuals } from './FriendsSoaringVisuals';
import { createSoaringState } from '../multiplayer/FriendsSoaring';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
describe('visible soaring equipment',()=>{
  it('builds a bounded curved wing with separate upper and lower airfoil normals',()=>{
    const g=createSoaringWingGeometry(),positions=g.getAttribute('position'),normals=g.getAttribute('normal');
    for(let i=0;i<positions.count;i++)for(const axis of ['getX','getY','getZ'] as const)expect(Number.isFinite(positions[axis](i))).toBe(true);
    expect(g.boundingSphere.radius).toBeLessThan(100);expect(normals.getY(16*11+5)).toBeGreaterThan(.9);expect(normals.getY(33*11+16*11+5)).toBeLessThan(-.9);g.dispose();
  });
  it('shows colored crew canopies, a local harness, and removes departed equipment',()=>{
    const scene=new THREE.Scene(),v=new FriendsSoaringVisuals(scene);
    const p=(id:string,color:string)=>({id,color,x:1000,y:1000,z:1000,lifeState:'alive',friendsSoaring:{...createSoaringState(1),phase:'flying',inflation:1}} as CoopPlayerSnapshot);
    v.update([p('local','#8de6ce'),p('friend','#ff8899')],'local',0);
    expect(v.group.children.filter(c=>c.name.includes('paraglider'))).toHaveLength(2);
    expect(v.group.getObjectByName('first-person-paraglider').getObjectByName('soaring-hand')).toBeDefined();
    const other=v.group.getObjectByName('crew-paraglider');expect((other.getObjectByName('inflated-paraglider-canopy') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>).material.color.getHexString()).toBe('ff8899');
    v.update([p('local','#8de6ce')],'local',1);expect(v.group.getObjectByName('crew-paraglider')).toBeUndefined();v.dispose();expect(scene.children).toHaveLength(0);
  });
});

it('keeps brake cords attached to both hands throughout steering, braking and inflation',async()=>{
  const {createSoaringRig,updateSoaringRigPose}=await import('./FriendsSoaringVisuals');
  for(const local of [true,false]){
    const rig=createSoaringRig('#8de6ce',local);
    for(const inflation of [.6,1])for(const brake of [0,1])for(const bank of [-.6,0,.6]){
      updateSoaringRigPose(rig,{...createSoaringState(0),phase:'flying',inflation,brake,bank});
      for(const side of [-1,1]){
        const cord=rig.children.find(c=>c.name==='paraglider-brake-cord'&&c.userData.side===side&&c.userData.branch===0) as THREE.Mesh;
        const toggle=rig.children.find(c=>c.name==='brake-toggle'&&c.userData.side===side)!;
        cord.updateMatrix();const bottom=new THREE.Vector3(0,-.5,0).applyMatrix4(cord.matrix);
        expect(bottom.distanceTo(toggle.position)).toBeLessThan(.00001);expect(cord.visible).toBe(true);
        if(local){const hand=rig.children.find(c=>c.name==='soaring-hand'&&c.userData.side===side)!;expect(hand.position.distanceTo(toggle.position)).toBe(0);}
      }
      const lines=rig.getObjectByName('paraglider-suspension-lines') as THREE.LineSegments;
      expect(lines.geometry.getAttribute('position').getY(0)).toBeCloseTo(58.5);
    }
  }
});

it('attaches crew brake toggles to the replicated avatar hand sockets',async()=>{
  const {createSoaringRig,updateSoaringRigPose}=await import('./FriendsSoaringVisuals');
  const rig=createSoaringRig('#fff');rig.position.set(400,900,600);rig.rotation.y=.5;
  const sockets={left:new THREE.Vector3(410,945,580),right:new THREE.Vector3(415,951,620)};
  updateSoaringRigPose(rig,{...createSoaringState(0),phase:'flying',inflation:1},(side,out)=>{out.copy(sockets[side]);return true;});
  rig.updateMatrixWorld(true);
  for(const side of [-1,1]){
    const toggle=rig.children.find(c=>c.name==='brake-toggle'&&c.userData.side===side)!;
    expect(toggle.getWorldPosition(new THREE.Vector3()).distanceTo(sockets[side===-1?'left':'right'])).toBeLessThan(.00001);
  }
});

it('keeps first-person grips inside a narrow phone view without shrinking the canopy',async()=>{
  const {createSoaringRig,updateSoaringRigPose}=await import('./FriendsSoaringVisuals');
  const rig=createSoaringRig('#fff',true);
  updateSoaringRigPose(rig,{...createSoaringState(0),phase:'flying',inflation:1},undefined,390/844);
  for(const hand of rig.children.filter(c=>c.name==='soaring-hand'))expect(Math.abs(hand.position.z)).toBeLessThan(7);
  expect(rig.getObjectByName('inflated-paraglider-canopy')!.scale.z).toBe(1);
});
