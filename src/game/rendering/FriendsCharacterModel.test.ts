import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cloneFriendsCharacterModel, createFriendsCharacterGrip, createFriendsCharacterModel, FRIENDS_CHARACTER_COLOURS, friendsCharacterColour, type FriendsCharacterData } from './FriendsCharacterModel';
import { createFriendsCharacterRig, disposeFriendsCharacterRig, placeFriendsCharacter, mountFriendsCharacter, updateFriendsCharacter, friendsCharacterHandPoint } from './FriendsCharacterVisuals';
import { createCoopOperatorRig, disposeCoopOperatorRig } from './coopOperatorVisuals';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { createCoopWeaponRuntime } from '../combat/coopFirearms';
import { lengthenFirstPersonArms } from './FriendsFirstPersonArms';

vi.mock('./FriendsCharacterModel',async importOriginal=>{
  const actual=await importOriginal<typeof import('./FriendsCharacterModel')>();
  return {...actual,loadFriendsCharacterModel:vi.fn(async(color)=>actual.createFriendsCharacterModel(JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8')),new THREE.MeshStandardMaterial(),color))};
});
const data=JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8')) as FriendsCharacterData;
const create=(color:'yellow'|'red'='yellow')=>createFriendsCharacterModel(data,new THREE.MeshStandardMaterial(),color);
const player=(overrides:Partial<CoopPlayerSnapshot>={})=>({id:'p',color:'#fbbf24',x:0,y:0,z:0,angle:0,lifeState:'alive',sprinting:false,crouching:false,sliding:false,weaponStates:[],selectedSlot:0,health:100,maxHealth:100,...overrides} as CoopPlayerSnapshot);

describe('imported Big Walk characters',()=>{
  it('keeps remote arm vertices intact when first-person arms are rebound',()=>{
    const source=create(),remote=cloneFriendsCharacterModel(source),local=cloneFriendsCharacterModel(source);
    const vertices=(model:ReturnType<typeof create>)=>{
      model.root.updateMatrixWorld(true);
      return [2,3].map(index=>{
        const mesh=model.parts[index].children[0] as THREE.SkinnedMesh;
        mesh.skeleton.update();
        return Array.from({length:mesh.geometry.getAttribute('position').count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).toArray());
      });
    };
    const original=vertices(source),before=vertices(remote);
    lengthenFirstPersonArms(local);
    expect(vertices(source)).toEqual(original);
    expect(vertices(remote)).toEqual(before);
    expect(vertices(cloneFriendsCharacterModel(source))).toEqual(before);
    for(const index of [2,3]){
      const sourceMesh=source.parts[index].children[0] as THREE.SkinnedMesh;
      const remoteMesh=remote.parts[index].children[0] as THREE.SkinnedMesh;
      expect(remoteMesh.skeleton.boneInverses).not.toBe(sourceMesh.skeleton.boneInverses);
      expect(remoteMesh.skeleton.boneInverses[0]).not.toBe(sourceMesh.skeleton.boneInverses[0]);
      expect(remoteMesh.geometry).toBe(sourceMesh.geometry);
    }
  });
  it('gives both outward-facing pupils the opaque pupil atlas patch for every head colour',()=>{
    for(const colour of FRIENDS_CHARACTER_COLOURS){
      const model=createFriendsCharacterModel(data,new THREE.MeshStandardMaterial(),colour);
      const geometry=(model.parts[0].children[0] as THREE.Mesh).geometry,uv=geometry.getAttribute('uv');
      // The final two authored meshes are the two flat pupil quads, 12
      // vertices each. Both faces must sample the painted 227–230 × 8–11 patch.
      for(let i=uv.count-24;i<uv.count;i++){
        expect(uv.getX(i)*data.textureSize[0]).toBeGreaterThanOrEqual(227);
        expect(uv.getX(i)*data.textureSize[0]).toBeLessThanOrEqual(230);
        expect((1-uv.getY(i))*data.textureSize[1]).toBeGreaterThanOrEqual(8);
        expect((1-uv.getY(i))*data.textureSize[1]).toBeLessThanOrEqual(11);
      }
    }
  });
  it('resolves all 13 authored head layers, batches six limbs, and stands on the ground at the existing height',()=>{
    for(const color of FRIENDS_CHARACTER_COLOURS){
      const m=createFriendsCharacterModel(data,new THREE.MeshStandardMaterial(),color),bounds=new THREE.Box3().setFromObject(m.root);
      expect(m.parts).toHaveLength(6);expect(m.parts.every(p=>p.children.length===1)).toBe(true);
      expect(bounds.min.y).toBeCloseTo(0,5);expect(bounds.max.y).toBeCloseTo(54,5);
      expect(m.parts[0].children[0]).toBeInstanceOf(THREE.Mesh);
      expect((m.parts[0].children[0] as THREE.Mesh).geometry.getAttribute('position').count).toBeGreaterThan(100);
    }
  });
  it('keeps the actual atlas UVs and character hands, with independent joints and shared buffers',()=>{
    const source=create(),a=cloneFriendsCharacterModel(source),b=cloneFriendsCharacterModel(source);
    a.parts[2].rotation.x=1;expect(b.parts[2].rotation.x).toBeCloseTo(0,10);
    expect((a.parts[2].children[0] as THREE.Mesh).geometry).toBe((b.parts[2].children[0] as THREE.Mesh).geometry);
    for(const side of ['left','right'] as const)for(const hold of ['tool','inward','flashlight'] as const){
      const hand=createFriendsCharacterGrip(source,side,hold),bounds=new THREE.Box3().setFromObject(hand),uv=hand.geometry.getAttribute('uv');
      expect(hand.userData.friendsCharacter).toBe('Big Walk');expect(hand.geometry.getAttribute('position').count).toBe(144);
      expect([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(uv.count).toBe(144);expect(bounds.getSize(new THREE.Vector3()).length()).toBeGreaterThan(1);
      const points=hand.geometry.getAttribute('position');let palmDiameter=0;
      for(let i=108;i<144;i++)for(let j=i+1;j<144;j++)palmDiameter=Math.max(palmDiameter,new THREE.Vector3().fromBufferAttribute(points,i).distanceTo(new THREE.Vector3().fromBufferAttribute(points,j)));
      expect(palmDiameter).toBeCloseTo(3*.065*Math.sqrt(3),5);
    }
  });
  it('maps crew colour deterministically to a supplied colour variant',()=>{
    expect(friendsCharacterColour('#ff0000')).toBe('red');expect(friendsCharacterColour('#5283bb')).toBe('blue');
    expect(friendsCharacterColour('#fbbf24')).toBe('yellow');
  });
  it('animates walking and the authored sitting pose, and provides a real moving hand socket',async()=>{
    const rig=createCoopOperatorRig('#fbbf24','Player');mountFriendsCharacter(rig,'#fbbf24');await Promise.resolve();await Promise.resolve();
    const model=rig.avatar.getObjectByName('friends-big-walk-character')!,leg=model.getObjectByName('big-walk-left-leg')!;
    const initial=leg.rotation.x;
    updateFriendsCharacter(rig,player({motion:{velocityX:160,velocityY:0} as any}),1000);
    updateFriendsCharacter(rig,player({motion:{velocityX:160,velocityY:0} as any}),1100);
    expect(leg.rotation.x).not.toBe(initial);expect(rig.avatar.position.y).toBe(0);expect(rig.bodyMesh.visible).toBe(false);
    const hand=new THREE.Vector3();expect(friendsCharacterHandPoint(rig,hand)).toBe(true);expect(hand.length()).toBeGreaterThan(1);
    rig.seatedLegs.visible=true;
    updateFriendsCharacter(rig,player({friendsSeat:{vehicleId:'campfire',index:0},crouching:true}),1200);
    expect(rig.seatedLegs.visible).toBe(false);
    expect(leg.rotation.x).toBeCloseTo(-.611013);expect(rig.root.scale.y).toBe(1);expect(rig.nameplate.position.y).toBe(47);
    disposeCoopOperatorRig(rig);
  });
  it('does not attach characters to an operator disposed during loading',async()=>{
    const rig=createCoopOperatorRig('#ff0000','Player');mountFriendsCharacter(rig,'#ff0000');disposeCoopOperatorRig(rig);await Promise.resolve();await Promise.resolve();
    expect(rig.avatar.getObjectByName('friends-big-walk-character')).toBeUndefined();
  });
  it('uses a Friends-only rig with no survival chassis or idle firearm', async()=>{
    const rig=createFriendsCharacterRig('#fbbf24','Friend');
    await Promise.resolve(); await Promise.resolve();
    for(const state of [{}, {friendsHands:{mask:0,yaw:0,pitch:0}}, {friendsSeat:{vehicleId:'campfire',index:0}}, {motion:{swimming:true}}]){
      const p=player(state as Partial<CoopPlayerSnapshot>);
      placeFriendsCharacter(rig,p); updateFriendsCharacter(rig,p,1000);
      expect(rig.firearm).toBeUndefined();
      expect(rig.root.children).toHaveLength(2);
      expect(rig.avatar.children).toHaveLength(1);
      expect(rig.avatar.children[0].name).toBe('friends-big-walk-character');
    }
    disposeFriendsCharacterRig(rig);
  });
  it('does not mount a Friends model after its rig is disposed',async()=>{
    const rig=createFriendsCharacterRig('#fbbf24','Friend');disposeFriendsCharacterRig(rig);
    await Promise.resolve();await Promise.resolve();
    expect(rig.avatar.children).toHaveLength(0);
  });

  it('mounts an explicitly equipped weapon at the moving hand and hides it on tool change',async()=>{
    const rig=createFriendsCharacterRig('#fbbf24','Friend');await Promise.resolve();await Promise.resolve();
    const p=player({friendsWeaponEquipped:true,weaponStates:[createCoopWeaponRuntime('plasma_gun')]});
    placeFriendsCharacter(rig,p);updateFriendsCharacter(rig,p,1000);
    const hand=new THREE.Vector3();expect(friendsCharacterHandPoint(rig,hand)).toBe(true);
    expect(rig.firearm!.group.visible).toBe(true);
    expect(rig.firearm!.group.position.distanceTo(hand)).toBeLessThan(.001);
    updateFriendsCharacter(rig,{...p,friendsWeaponEquipped:false,weaponStates:[]},1100);
    expect(rig.firearm!.group.visible).toBe(false);
    disposeFriendsCharacterRig(rig);
  });

});
