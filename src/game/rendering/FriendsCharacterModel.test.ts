import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cloneFriendsCharacterModel, createFriendsCharacterGrip, createFriendsCharacterModel, FRIENDS_CHARACTER_COLOURS, friendsCharacterColour, type FriendsCharacterData } from './FriendsCharacterModel';
import { mountFriendsCharacter, updateFriendsCharacter, friendsCharacterHandPoint } from './FriendsCharacterVisuals';
import { createCoopOperatorRig, disposeCoopOperatorRig } from './coopOperatorVisuals';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';

vi.mock('./FriendsCharacterModel',async importOriginal=>{
  const actual=await importOriginal<typeof import('./FriendsCharacterModel')>();
  return {...actual,loadFriendsCharacterModel:vi.fn(async(color)=>actual.createFriendsCharacterModel(JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8')),new THREE.MeshStandardMaterial(),color))};
});
const data=JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8')) as FriendsCharacterData;
const create=(color:'yellow'|'red'='yellow')=>createFriendsCharacterModel(data,new THREE.MeshStandardMaterial(),color);
const player=(overrides:Partial<CoopPlayerSnapshot>={})=>({id:'p',color:'#fbbf24',x:0,y:0,z:0,angle:0,lifeState:'alive',sprinting:false,crouching:false,sliding:false,weaponStates:[],selectedSlot:0,health:100,maxHealth:100,...overrides} as CoopPlayerSnapshot);

describe('imported Big Walk characters',()=>{
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
});
