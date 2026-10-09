import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import type {CoopPlayerSnapshot} from '../multiplayer/CoopSimulation';
import type {PlayerVisualRig} from './coopOperatorVisuals';
import {FriendsRemoteFlashlightVisuals} from './FriendsRemoteFlashlightVisuals';

vi.mock('./FriendsCharacterVisuals',()=>({friendsCharacterHandPoint:(rig:PlayerVisualRig,out:THREE.Vector3,_both:boolean,side:string)=>{
  expect(side).toBe('left');const hand=rig.root.userData.hand as THREE.Vector3|undefined;
  if(!hand)return false;out.copy(hand);return true;
}}));
const player=(extra:Partial<CoopPlayerSnapshot>={}):CoopPlayerSnapshot=>({id:'friend',angle:Math.PI/2,lifeState:'alive',friendsFlashlight:{pitch:0,cone:1},...extra} as CoopPlayerSnapshot);
const rig=()=>{const root=new THREE.Group();root.userData.hand=new THREE.Vector3(9,35,12);return {root} as PlayerVisualRig;};

describe('visible remote flashlights',()=>{
  it('keeps the grip on the left palm and the emitting lens aligned with world aim through body turns and movement',()=>{
    const visual=new FriendsRemoteFlashlightVisuals(),actor=rig(),out=new THREE.Vector3();
    for(const angle of [-2,0,2])for(const yaw of [-2.5,0,1.5])for(const pitch of [-1,.0,1]){
      actor.root.position.set(100,60,200);actor.root.rotation.y=Math.PI/2-angle;
      visual.update(player({angle,friendsFlashlight:{pitch,yaw,cone:1}}),actor);
      const torch=actor.root.getObjectByName('friends-remote-flashlight')!;
      expect(torch.getWorldPosition(out).distanceTo(actor.root.localToWorld(actor.root.userData.hand.clone()))).toBeLessThan(1e-8);
      const direction=new THREE.Vector3(Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch),Math.sin(yaw)*Math.cos(pitch));
      expect(new THREE.Vector3(0,0,-1).applyQuaternion(torch.getWorldQuaternion(new THREE.Quaternion())).dot(direction)).toBeCloseTo(1,8);
      const expected=torch.getWorldPosition(new THREE.Vector3()).addScaledVector(direction,5.64);
      expect(visual.emission('friend',out)).toBe(true);expect(out.distanceTo(expected)).toBeLessThan(1e-8);
    }
    visual.dispose();
  });
  it('handles loading, toggles, dead players, replacement rigs and departures without orphan props or floating light',()=>{
    const visual=new FriendsRemoteFlashlightVisuals(),actor=rig(),out=new THREE.Vector3();delete actor.root.userData.hand;
    visual.update(player(),actor);expect(visual.emission('friend',out)).toBe(false);
    actor.root.userData.hand=new THREE.Vector3();visual.update(player(),actor);expect(visual.emission('friend',out)).toBe(true);
    const torch=actor.root.getObjectByName('friends-remote-flashlight')!;
    visual.update(player({friendsFlashlight:undefined}),actor);expect(torch.visible).toBe(false);expect(visual.emission('friend',out)).toBe(false);
    visual.update(player(),actor);expect(actor.root.children).toHaveLength(1);
    visual.update(player({lifeState:'downed'}),actor);expect(visual.emission('friend',out)).toBe(false);
    const replacement=rig();visual.update(player(),replacement);expect(actor.root.children).toHaveLength(0);
    visual.prune(new Set());expect(replacement.root.children).toHaveLength(0);
    visual.dispose();visual.dispose();visual.update(player(),replacement);expect(replacement.root.children).toHaveLength(0);
  });
  it('shares three GPU meshes across teammates and releases them only on final disposal',()=>{
    const visual=new FriendsRemoteFlashlightVisuals(),a=rig(),b=rig();visual.update(player(),a);visual.update(player({id:'other'}),b);
    const meshes=(actor:PlayerVisualRig)=>actor.root.children[0].children.filter(n=>n instanceof THREE.Mesh) as THREE.Mesh[];
    const first=meshes(a),second=meshes(b);expect(first).toHaveLength(3);
    const releases=first.map(mesh=>{const fn=vi.fn();mesh.geometry.addEventListener('dispose',fn);return fn;});
    for(let i=0;i<3;i++){expect(first[i].geometry).toBe(second[i].geometry);expect(first[i].material).toBe(second[i].material);}
    visual.prune(new Set(['other']));expect(releases.every(fn=>fn.mock.calls.length===0)).toBe(true);
    visual.dispose();expect(releases.every(fn=>fn.mock.calls.length===1)).toBe(true);
  });
});
