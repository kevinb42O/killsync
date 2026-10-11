import {describe,it,expect} from 'vitest';
import {CAVE_PROPS,collideCaveProps,cavePropFloor,cavePropCeiling,raycastCaveProps} from './FriendsCaveProps';
import {FriendsTerrain} from './FriendsTerrain';
import {friendsPlacementError} from '../multiplayer/FriendsBuilding';
import {friendsInteractionTarget} from '../multiplayer/FriendsInteractionTargeting';
import {LocalPlayerPrediction} from '../multiplayer/LocalPlayerPrediction';
import {FriendsSimulation} from '../multiplayer/FriendsSimulation';
import {MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame} from '../multiplayer/protocol';
const command=(sequence:number):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:sequence*50,movement:1,aimAngle:0,aimPitch:0,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
describe('shared solid dungeon fixtures',()=>{
 it('blocks each standing fixture at its real height, without blocking rooms on another floor',()=>{
  for(const prop of CAVE_PROPS){
   const point={x:prop.x,y:prop.y};expect(collideCaveProps(point,prop.z,19,50,0),`${prop.material} at ${prop.x},${prop.y}`).toBe(true);
   expect(Math.hypot(point.x-prop.x,point.y-prop.y)).toBeGreaterThan(19);
  }
  const p=CAVE_PROPS.find(p=>p.material==='wood'&&p.z<0)!;
  expect(collideCaveProps({x:p.x,y:p.y},p.z-200,19)).toBe(false);
 });
 it('grounds every floor-standing mine post without putting one over the entrance shaft',()=>{
  const terrain=new FriendsTerrain();for(const p of CAVE_PROPS.filter(p=>p.material==='wood'&&p.w===12))expect(terrain.supports(p.x,p.y,p.z),`${p.x},${p.y},${p.z}`).toBe(true);
 });
 it('uses the crystal taper for body collision and ray hits',()=>{
  const p=CAVE_PROPS.find(p=>p.shape==='crystal')!;
  const low={x:p.x+p.w*.45,y:p.y},high={...low};
  expect(collideCaveProps(low,p.z,3,8,0)).toBe(true);
  expect(collideCaveProps(high,p.z+p.h*.9,3,8,0)).toBe(false);
  const ray={x:p.x-80,y:p.y,z:p.z+p.h*.9,dx:1,dy:0,dz:0};
  const hit=raycastCaveProps(ray,160)!;expect(hit.distance).toBeGreaterThan(70);expect(hit.nz).toBeGreaterThan(0);
 });
 it('provides grounded tops, overhead beams, protected tool hits and rejects overlapping builds',()=>{
  const p=CAVE_PROPS.find(p=>p.material==='wood'&&p.z<0&&p.w===12)!;
  expect(cavePropFloor(p.x,p.y,p.z+p.h,0)).toBe(p.z+p.h);
  const beam=CAVE_PROPS.find(p=>p.material==='wood'&&p.z<0&&p.w===28)!;
  expect(cavePropCeiling(beam.x,beam.y,beam.z-50)).toBe(beam.z);
  const terrain=new FriendsTerrain(),ray={x:p.x-64,y:p.y,z:p.z+64,dx:1,dy:0,dz:0};
  expect(terrain.raycast(ray)?.caveProp).toBe(true);
  const target=friendsInteractionTarget(terrain,ray,2,[],[]);expect(target?.valid).toBe(false);expect(target?.reason).toContain('fixtures');
  expect(friendsPlacementError([],'pillar',{x:p.x,y:p.y,z:p.z,rotation:0},undefined,[],undefined,false,terrain)).toContain('fixtures');
 });
 it('keeps host movement and guest prediction against a mine post consistent',()=>{
  const p=CAVE_PROPS.find(p=>p.material==='wood'&&p.z<0&&p.w===12)!,sim=new FriendsSimulation([{id:'guest',label:'Guest',color:'#fff'}]);
  Object.assign(sim['players'].get('guest')!,{x:p.x-48,y:p.y,z:p.z});
  const prediction=new LocalPlayerPrediction('guest');prediction.reconcile(sim.createSnapshot());
  for(let i=1;i<=20;i++){prediction.step(command(i));sim.setInput('guest',command(i));sim.tick(50);}
  const snapshot=sim.createSnapshot(),host=snapshot.players[0],guest=prediction.present(snapshot,{...command(21),movement:0},0,0).players[0];
  expect(host.x).toBeLessThanOrEqual(p.x-p.w/2-19+.001);expect(guest.x).toBeCloseTo(host.x,3);expect(guest.z).toBeCloseTo(host.z,3);
 });
});
