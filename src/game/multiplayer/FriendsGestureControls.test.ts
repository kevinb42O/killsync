import {compactSnapshotWirePayload,expandSnapshotWirePayload} from './snapshotReplication';
import {FRIENDS_CAMPFIRE} from '../world/FriendsRegion';
import {describe,it,expect} from 'vitest';
import {FriendsGestureControls,friendsArmPose,friendsGestureKey,friendsNumberSlot,sanitizeFriendsArms} from './FriendsGestureControls';
import {clampInputFrame,MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame} from './protocol';
import {FriendsSimulation} from './FriendsSimulation';
import {quantizeAngle,quantizePitch} from './CoopSimulation';
import {interpolateCoopSnapshot,CoopSnapshotInterpolator} from './snapshotInterpolation';
import {neutralizeMenuInput} from '../LocalGamePreferences';
const input=(sequence=1,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:quantizeAngle(0),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,friendsTool:6,...extra});
const simulation=()=>new FriendsSimulation([{id:'host',label:'Host',color:'#22d3ee'},{id:'guest',label:'Guest',color:'#f472b6'}]);
describe('Friends held arm gestures',()=>{
 it('resolves all sixteen independent combinations and either press order',()=>{
  const seen=new Set();for(let mask=0;mask<16;mask++){
   seen.add(`${friendsArmPose(mask,'left')}:${friendsArmPose(mask,'right')}`);
   const a=new FriendsGestureControls(),b=new FriendsGestureControls();
   for(const bit of [1,2,4,8])if(mask&bit)a.set(bit,true);
   for(const bit of [8,4,2,1])if(mask&bit)b.set(bit,true);
   expect(a.mask).toBe(mask);expect(b.mask).toBe(mask);
   a.clear();expect(a.mask).toBe(0);
  }expect(seen.size).toBe(16);
  expect(friendsArmPose(5,'left')).toBe('sideways');expect(friendsArmPose(2,'right')).toBe('up');
 });
 it('uses AZERTY A/E and QWERTY Q/E without consuming movement keys, and physical number slots',()=>{
  expect(friendsGestureKey('A','AZERTY')).toBe(1);expect(friendsGestureKey('q','AZERTY')).toBe(0);
  expect(friendsGestureKey('q','QWERTY')).toBe(1);expect(friendsGestureKey('a','QWERTY')).toBe(0);
  expect(friendsGestureKey('E','QWERTY')).toBe(2);
  expect(friendsNumberSlot('Digit1')).toBe(0);expect(friendsNumberSlot('Numpad6')).toBe(5);
  expect(friendsNumberSlot('KeyE')).toBeUndefined();
 });
 it('rejects malformed masks and clears menu-held inputs',()=>{
  for(const value of [-1,16,1.5,NaN,Infinity,'15',null,{}])expect(sanitizeFriendsArms(value)).toBe(0);
  expect(clampInputFrame(input(1,{friendsArms:15})).friendsArms).toBe(15);
  expect(clampInputFrame(input(1,{friendsArms:99})).friendsArms).toBe(0);
  expect(neutralizeMenuInput(input(1,{friendsArms:15,firing:true,aiming:true}))).toMatchObject({friendsArms:0,firing:false,aiming:false});
 });
 it('accepts both players, snapshots late join poses, and blocks all equipment actions even in a malicious empty-hand frame',()=>{
  const s=simulation(),before={grenades:s['players'].get('host')!.grenades,ammo:s['players'].get('host')!.weaponStates[0].magazineAmmo};
  s.setInput('host',input(1,{friendsArms:15,firing:true,aiming:true,fireActionId:1,altFireActionId:1,grenadeActionId:1,friendsFlashlight:true}));
  s.setInput('guest',input(1,{friendsArms:9,aimAngle:quantizeAngle(1),aimPitch:quantizePitch(.4)}));s.tick(50);
  const frame=s.createSnapshot();expect(frame.players[0].friendsHands?.mask).toBe(15);expect(frame.players[1].friendsHands?.mask).toBe(9);
  expect(frame.players[1].friendsHands?.pitch).toBeCloseTo(.4,2);
  expect(frame.players[0].friendsFlashlight).toBeUndefined();expect(frame.players[0].isAiming).toBe(false);
  expect(s['players'].get('host')!.grenades).toBe(before.grenades);
  expect(s['players'].get('host')!.weaponStates[0].magazineAmmo).toBe(before.ammo);
  expect(frame.players[0].weaponStates).toHaveLength(0);
  expect(frame.projectiles).toHaveLength(0);expect(frame.friends?.frontier?.interaction?.actions.host).toBeUndefined();
  expect(JSON.parse(JSON.stringify(frame)).players[1].friendsHands.mask).toBe(9);
  const wire={format:'coop_snapshot_full' as const,snapshot:frame};expect(expandSnapshotWirePayload(compactSnapshotWirePayload(wire))).toEqual(wire);
 });
 it('clears gestures on tool change, stale input, death, cooking and piloting, but allows passenger seats',()=>{
  const s=simulation();let sequence=0;
  const gesture=()=>{s.setInput('host',input(++sequence,{friendsArms:3}));s.tick(50);};
  gesture();expect(s.createSnapshot().players[0].friendsHands).toBeDefined();
  s.setInput('host',input(++sequence,{friendsTool:1,friendsArms:15}));s.tick(50);expect(s.createSnapshot().players[0].friendsHands).toBeUndefined();
  gesture();for(let i=0;i<42;i++)s.tick(50);expect(s.createSnapshot().players[0].friendsHands).toBeUndefined();
  const p=s['players'].get('host')!;p.lifeState='downed';gesture();expect(p.friendsHands).toBeUndefined();
  p.lifeState='alive';p.friendsSeat={vehicleId:FRIENDS_CAMPFIRE.id,index:0};gesture();expect(p.friendsHands).toBeUndefined();
  p.friendsSeat=undefined;const plane=s['friends']!.vehicles().find(v=>v.kind==='aircraft')!;Object.assign(p,{x:plane.x+100,y:plane.y,z:plane.z});expect(s['friends']!.interact(p,s.createSnapshot().elapsedMs)).toBe('pilot');gesture();expect(p.friendsHands).toBeUndefined();
 });
 it('interpolates wrapped look angles in both render paths and removes released state',()=>{
  const s=simulation();s.setInput('host',input(1,{friendsArms:1,aimAngle:quantizeAngle(Math.PI*1.95)}));s.tick(50);const a=s.createSnapshot();
  s.setInput('host',input(2,{friendsArms:5,aimAngle:quantizeAngle(Math.PI*.05),aimPitch:quantizePitch(.8)}));s.tick(50);const b=s.createSnapshot(),reuse=new CoopSnapshotInterpolator();
  for(const frame of [interpolateCoopSnapshot(a,b,.5),reuse.interpolate(a,b,.5)]){
   expect(frame.players[0].friendsHands?.mask).toBe(5);expect(Math.abs(frame.players[0].friendsHands!.yaw-Math.PI*2)).toBeLessThan(.01);expect(frame.players[0].friendsHands!.pitch).toBeCloseTo(.4,2);
  }
  s.setInput('host',input(3,{friendsTool:1}));s.tick(50);expect(reuse.interpolate(b,s.createSnapshot(),.5).players[0].friendsHands).toBeUndefined();
 });
});
