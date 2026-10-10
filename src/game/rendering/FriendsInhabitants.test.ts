import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsInhabitants } from './FriendsInhabitants';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { CAMPFIRE_SEATS } from '../multiplayer/FriendsCampfireSeats';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import { RESIDENT_DIALOGUE } from './FriendsResidentDialogue';

vi.mock('./FriendsCharacterModel', async importOriginal => {
  const actual = await importOriginal<typeof import('./FriendsCharacterModel')>();
  return { ...actual, loadFriendsCharacterModel: vi.fn(async () => actual.createFriendsCharacterModel(
    JSON.parse(readFileSync('public/models/friends/big-walk/character.json', 'utf8')), new THREE.MeshStandardMaterial())) };
});
const player = (overrides:Partial<CoopPlayerSnapshot>={}) => ({ id:'human',x:6200,y:5800,z:704,
  lifeState:'alive',weaponStates:[], ...overrides } as CoopPlayerSnapshot);
const setup = async (onSpeak?:ConstructorParameters<typeof FriendsInhabitants>[1]) => {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),terrain=new FriendsTerrain();
  const npcs=new FriendsInhabitants(scene,onSpeak);await Promise.resolve();await Promise.resolve();
  camera.position.set(6200,800,5800);
  return {scene,camera,terrain,npcs};
};
describe('ambient Friends inhabitants', () => {
  it('keeps four labelled characters, reuses the player model and roasts at the campfire', async () => {
    const {scene,camera,terrain,npcs}=await setup(),local=player();
    npcs.update(0,16,[local],local,camera,terrain);
    const root=scene.getObjectByName('friends-ambient-inhabitants')!;
    expect(root.children.filter(c=>c.name.startsWith('friendly-npc-'))).toHaveLength(4);
    expect(scene.getObjectByName('friendly-npc-sunny')!.getObjectByName('friends-big-walk-character')).toBeDefined();
    expect(root.children.filter(c=>c.name==='npc-marshmallow'&&c.visible)).toHaveLength(0);
    expect(local.friendsSeat).toBeUndefined();expect(local.x).toBe(6200);
    npcs.dispose();npcs.dispose();expect(scene.children).toHaveLength(0);
  });
  it('starts residents in separate areas and gives them independent wander routes and occasional seats', async () => {
    const {scene,camera,terrain,npcs}=await setup(),local=player({x:5500,y:6000,z:704});
    npcs.update(0,16,[local],local,camera,terrain);
    const names=['pip','moss','sunny','wren'];
    const initial=names.map(name=>scene.getObjectByName(`friendly-npc-${name}`)!.position.clone());
    for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++)expect(initial[i].distanceTo(initial[j])).toBeGreaterThan(250);
    const travel=[0,0,0,0],previous=initial.map(p=>p.clone());let seatedFrames=0;
    let closest=Infinity;
    for(let t=100;t<240000;t+=100) {
      npcs.update(t,100,[local],local,camera,terrain);
      const positions=names.map(name=>scene.getObjectByName(`friendly-npc-${name}`)!.position);
      positions.forEach((p,i)=>{travel[i]+=p.distanceTo(previous[i]);previous[i].copy(p);});
      for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)closest=Math.min(closest,positions[i].distanceTo(positions[j]));
      const root=scene.getObjectByName('friends-ambient-inhabitants')!;
      const seated=root.children.filter(c=>c.name==='npc-marshmallow'&&c.visible).length;
      expect(seated).toBeLessThanOrEqual(2);seatedFrames+=Number(seated>0);
    }
    expect(travel.every(distance=>distance>300)).toBe(true);
    expect(closest).toBeGreaterThan(45);expect(seatedFrames).toBeGreaterThan(0);
    expect(local.friendsHands).toBeUndefined();npcs.dispose();
  });
  it('greets while roasting, then gives up its seat when a human approaches', async () => {
    const {scene,camera,terrain,npcs}=await setup(),local=player({x:5500,y:6000,z:704});
    let seated:THREE.Object3D|undefined,seat:typeof CAMPFIRE_SEATS[number]|undefined,time=0;
    for(;time<240000;time+=100) {
      npcs.update(time,100,[local],local,camera,terrain);
      for(const name of ['pip','moss','sunny','wren']) {
        const rig=scene.getObjectByName(`friendly-npc-${name}`)!;
        const match=CAMPFIRE_SEATS.find(s=>Math.hypot(rig.position.x-s.x,rig.position.z-s.y)<1&&Math.abs(rig.position.y-s.z)<.1);
        if(match){seated=rig;seat=match;break;}
      }
      if(seated)break;
    }
    expect(seated).toBeDefined();expect(seat).toBeDefined();
    const left=seated!.getObjectByName('big-walk-left-arm')!;
    const resting=left.rotation.x;
    Object.assign(local,{x:seat!.x+Math.cos(seat!.angle)*140,y:seat!.y+Math.sin(seat!.angle)*140,z:seat!.z});
    npcs.update(time+100,100,[local],local,camera,terrain);
    npcs.update(time+700,100,[local],local,camera,terrain);
    expect(Math.abs(left.rotation.x-resting)).toBeGreaterThan(.5);
    const root=scene.getObjectByName('friends-ambient-inhabitants')!;
    const count=root.children.filter(c=>c.name==='npc-marshmallow'&&c.visible).length;
    Object.assign(local,seat!);npcs.update(time+800,100,[local],local,camera,terrain);
    expect(root.children.filter(c=>c.name==='npc-marshmallow'&&c.visible)).toHaveLength(count-1);
    expect(local.friendsSeat).toBeUndefined();npcs.dispose();
  });
  it('stops planning and animating at long distances', async () => {
    const {scene,camera,terrain,npcs}=await setup(),local=player();
    npcs.update(0,16,[local],local,camera,terrain);
    const floor=vi.spyOn(terrain,'floor');camera.position.set(20000,800,20000);
    for(let t=100;t<10000;t+=100)npcs.update(t,100,[local],local,camera,terrain);
    expect(floor).not.toHaveBeenCalled();
    expect(scene.getObjectByName('friendly-npc-pip')!.visible).toBe(false);npcs.dispose();
  });
  it('invites limited company to the human campfire session and uses quiet contextual speech',async()=>{
    const speak=vi.fn(),{scene,camera,terrain,npcs}=await setup(speak);
    const local=player({...CAMPFIRE_SEATS[0],friendsSeat:{vehicleId:'commons-campfire',index:0}});
    let companion:THREE.Object3D|undefined;
    for(let t=0;t<100000;t+=100) {
      npcs.update(t,100,[local],local,camera,terrain);
      const root=scene.getObjectByName('friends-ambient-inhabitants')!;
      expect(root.children.filter(c=>c.name==='npc-marshmallow'&&c.visible).length).toBeLessThanOrEqual(2);
      if(t<3000)expect(speak.mock.calls.some(([m])=>RESIDENT_DIALOGUE.join.flat().includes(m.text))).toBe(false);
      if(!companion)for(const name of ['pip','moss','sunny','wren']) {
        const rig=scene.getObjectByName(`friendly-npc-${name}`)!;
        if(CAMPFIRE_SEATS.some((s,i)=>i!==0&&Math.hypot(rig.position.x-s.x,rig.position.z-s.y)<1&&Math.abs(rig.position.y-s.z)<.1))companion=rig;
      }
    }
    expect(speak.mock.calls.some(([m])=>RESIDENT_DIALOGUE.join.flat().includes(m.text))).toBe(true);
    expect(speak.mock.calls.some(([m])=>RESIDENT_DIALOGUE.fire.flat().includes(m.text))).toBe(true);
    expect(companion).toBeDefined();
    expect(speak.mock.calls.length).toBeLessThan(12);
    expect(speak.mock.calls.every(([m])=>m.playerId.startsWith('ambient-npc-')&&m.playerLabel.endsWith('NPC'))).toBe(true);
    expect(local.friendsSeat?.index).toBe(0);npcs.dispose();
  });
});
