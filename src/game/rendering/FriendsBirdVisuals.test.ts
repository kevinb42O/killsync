import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsBirdVisuals } from './FriendsBirdVisuals';
import type { BirdsSnapshot, FriendlyBird } from '../multiplayer/FriendsBirds';
vi.mock('./FriendsHeldEquipment',()=>({acquireEquipmentLighting:()=>({setVisible(){},dispose(){}}),frameHeldEquipment(){},loadFriendsGrip:async()=>new THREE.Mesh()}));
vi.mock('../FriendsAudio',()=>({friendsAudio:{play(){},prepareBirds(){}}}));

describe('bird companion presentation',()=>{
  it('floats fading hearts above happy hand-fed birds for the owner and peers, without ground or fleeing hearts',()=>{
    const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera();viewmodel.add(camera);
    const visuals=new FriendsBirdVisuals(scene,viewmodel),b:FriendlyBird={id:1,variant:0,phase:'feeding',atMs:0,x:0,y:0,z:0,from:{x:0,y:0,z:0},target:{x:0,y:0,z:0},ownerId:'local',angle:0};
    const state:BirdsSnapshot={birds:[b],patches:[],equipped:[{playerId:'local',holding:true,amount:.5,refillAt:0}]};
    const draw=(now:number,firstPerson=true)=>visuals.update(state,[],'local',9,camera,now,firstPerson,false,(_id,out)=>{out.set(1,20,3);return true;});
    draw(500);const hearts=visuals.held.getObjectByName('happy-bird-hearts')!;expect(hearts.visible).toBe(false);
    draw(1700);expect(hearts.visible).toBe(true);const first=hearts.children[0] as THREE.Mesh<THREE.ShapeGeometry,THREE.MeshBasicMaterial>;
    const height=first.position.y;expect(first.visible).toBe(true);expect(first.material.opacity).toBeGreaterThan(.5);expect(height).toBeGreaterThan(13);
    draw(2400);expect(first.position.y).toBeGreaterThan(height);
    b.phase='perched';b.atMs=3000;state.equipped[0].amount=0;draw(4000,false);expect(hearts.visible).toBe(true);expect(hearts.parent!.parent).toBe(visuals.group);
    draw(20000);expect(hearts.visible).toBe(true);
    delete b.ownerId;draw(21000);expect(hearts.visible).toBe(false);
    b.ownerId='local';b.phase='leaving';draw(22000);expect(hearts.visible).toBe(false);
    const dispose=vi.spyOn(first.material,'dispose');state.birds=[];draw(23000);expect(dispose).toHaveBeenCalledOnce();visuals.dispose();
  });
  it('keeps an empty-hand companion attached and takes off smoothly with shared flames',()=>{
    const scene=new THREE.Scene(),viewmodel=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,40,10);viewmodel.add(camera);
    const visuals=new FriendsBirdVisuals(scene,viewmodel);
    const b:FriendlyBird={id:1,variant:0,phase:'perched',atMs:0,x:19,y:11,z:27,from:{x:19,y:11,z:27},target:{x:19,y:11,z:27},ownerId:'local',angle:0};
    const state:BirdsSnapshot={birds:[b],patches:[],equipped:[{playerId:'local',holding:true,amount:0,refillAt:0}]};
    const project=()=>({x:5,y:40,z:6});
    const draw=(now:number)=>visuals.update(state,[],'local',9,camera,now,true,false,()=>false,project);
    draw(100000);const root=visuals.held.getObjectByName('friendly-bird-1')!;
    expect(root.parent).toBe(visuals.held);expect(root.scale.x).toBe(.028);expect(visuals.held.visible).toBe(true);
    expect(visuals.held.getObjectByName('bird-flames')?.visible).toBe(false);
    Object.assign(b,{phase:'leaving',atMs:100000,burningUntil:104000,target:{x:200,y:90,z:190}});state.equipped=[];
    draw(100000);expect(root.parent).toBe(visuals.group);expect(root.position.distanceTo(new THREE.Vector3(5,40,6))).toBeLessThan(.001);expect(root.scale.x).toBeCloseTo(.028*Math.sqrt(41));
    expect(root.getObjectByName('bird-flames')?.visible).toBe(true);
    draw(101000);expect(root.position.distanceTo(new THREE.Vector3(5,40,6))).toBeGreaterThan(40);expect(root.scale.x).toBe(1);
    state.birds=[];draw(103000);expect(root.parent).toBeNull();visuals.dispose();
  });
});
