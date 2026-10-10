import {describe,it,expect} from 'vitest';
import {FriendsHauling,type HaulingEnvironment,type PhysicalCargo} from './FriendsHauling';
import {aircraftWinchBindings,aircraftWinchDirection,AIRCRAFT_WINCH_MIN_LENGTH,AIRCRAFT_WINCH_MAX_LENGTH} from './FriendsAircraftWinch';
import {craneOutlet,craneCargoAnchor} from './FriendsCrane';
import {MULTIPLAYER_PROTOCOL_VERSION,clampInputFrame,type MultiplayerInputFrame} from './protocol';
import {neutralizeMenuInput} from '../LocalGamePreferences';
import {FriendsExpedition,type FriendsVehicle} from './FriendsExpedition';
import {FriendsSimulation} from './FriendsSimulation';
import {FriendsWorldHost,FriendsWorldGuest} from './FriendsWorldReplication';
import {interpolateCoopSnapshot} from './snapshotInterpolation';
const input=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
function fixture(){
 const vehicle:FriendsVehicle={id:'sunskiff',kind:'aircraft',x:10000,y:10000,z:240,angle:0,length:280,width:160,pilotId:'host'},actor={id:'host',lifeState:'alive',x:10100,y:10000,z:240},guest={id:'guest',lifeState:'alive',x:10300,y:10000,z:0};
 const cargo:PhysicalCargo={id:'lantern-core',x:10000,y:10000,z:0,angle:0,vx:0,vy:0,vz:0,spin:0},h=new FriendsHauling({version:1,cargo:[cargo],delivered:false}),env:HaulingEnvironment={revision:'test',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[vehicle],builds:[]};
 let time=0;const run=(ms:number,extra:Partial<MultiplayerInputFrame>={},id='host')=>{for(let t=0;t<ms;t+=25){time+=25;h.update(25,time,[actor,guest],new Map([[id,input(extra)]]),env);}};run(25);
 const connect=()=>{run(3400,{friendsAircraftWinch:1});run(25);run(25,{friendsAircraftHookHeld:true});run(25);expect(h.getAircraftWinch()?.cargoId).toBe('lantern-core');};
 return {h,env,actor,guest,vehicle,cargo:h.getCargo()[0],run,connect,state:()=>h.getAircraftWinch()!};
}
describe('pilot helicopter winch',()=>{
 it('maps keyboard layouts and strips malformed or menu-held inputs',()=>{
  expect(aircraftWinchBindings('AZERTY')).toEqual({raise:'a',lower:'e',hook:'v'});expect(aircraftWinchBindings('QWERTY')).toEqual({raise:'q',lower:'e',hook:'v'});
  for(const value of [NaN,Infinity,2,'1',undefined])expect(aircraftWinchDirection(value)).toBe(0);
  expect(clampInputFrame(input({friendsAircraftWinch:99 as any,friendsAircraftHookHeld:'true' as any}))).toMatchObject({friendsAircraftWinch:0,friendsAircraftHookHeld:false});
  expect(neutralizeMenuInput(input({friendsAircraftWinch:1,friendsAircraftHookHeld:true}))).toMatchObject({friendsAircraftWinch:0,friendsAircraftHookHeld:false});
 });
 it('skips terrain and cable work when the hook is stowed',()=>{
  const f=fixture();let queries=0;f.env.floor=()=>{queries++;return 0;};f.env.blocked=()=>{queries++;return false;};for(let i=0;i<40;i++)(f.h as any).updateAircraftWinch(25,[f.actor,f.guest],new Map([['host',input()]]),f.env,i*25);expect(queries).toBe(0);
 });
 it('pays out smoothly, retracts to the dock, brakes on key release and ignores passengers',()=>{
  const f=fixture();f.run(1000,{friendsAircraftWinch:1},'guest');expect(f.state().length).toBe(0);
  f.run(25);f.run(1000,{friendsAircraftWinch:1});expect(f.state().length).toBeGreaterThan(40);const length=f.state().length;f.run(500);expect(f.state().length).toBe(length);expect(f.state().mode).toBe('hold');
  f.run(2000,{friendsAircraftWinch:-1});expect(f.state().length).toBe(0);expect(f.state().mode).toBe('hold');
 });
 it('stops at the ground and the maximum cable length',()=>{
  const f=fixture();f.run(6000,{friendsAircraftWinch:1});expect(f.state().length).toBe(214);expect(f.state().mode).toBe('hold');
  f.vehicle.z=7000;f.run(120000,{friendsAircraftWinch:1});expect(f.state().length).toBe(AIRCRAFT_WINCH_MAX_LENGTH);
 });
 it('attaches without teleporting, lifts, sways with flight and holds a minimum hull clearance',()=>{
  const f=fixture(),initial={x:f.cargo.x,y:f.cargo.y};f.connect();expect(f.cargo.x).toBeCloseTo(initial.x,3);expect(f.cargo.y).toBeCloseTo(initial.y,3);
  f.run(1200,{friendsAircraftWinch:-1});expect(f.cargo.z).toBeGreaterThan(35);
  for(let i=0;i<30;i++){const next={...f.vehicle,x:f.vehicle.x+8};expect(f.h.allowAircraftFlight(f.vehicle,next,f.env,[f.actor,f.guest])).toBe(true);f.vehicle.x=next.x;f.actor.x=next.x+100;f.run(25);}
  expect(f.state().swayAngle).toBeGreaterThan(.1);const anchor=craneCargoAnchor(f.cargo,f.state()),out=craneOutlet(f.state());expect(Math.hypot(anchor.x-out.x,anchor.y-out.y)).toBeGreaterThan(1);
  f.run(5000,{friendsAircraftWinch:-1});expect(f.state().length).toBeGreaterThanOrEqual(AIRCRAFT_WINCH_MIN_LENGTH);expect(f.cargo.z+48).toBeLessThan(f.vehicle.z-18);
 });
 it('requires a deliberate held release and preserves moving-load momentum',()=>{
  const f=fixture();f.connect();f.run(1000,{friendsAircraftWinch:-1});
  for(let i=0;i<20;i++){f.vehicle.x+=4;f.actor.x+=4;f.run(25);}
  f.run(200,{friendsAircraftHookHeld:true});expect(f.state().cargoId).toBe('lantern-core');expect(f.state().releaseProgress).toBeGreaterThan(0);
  f.run(25);expect(f.state().releaseProgress).toBe(0);f.run(700,{friendsAircraftHookHeld:true});expect(f.state().cargoId).toBeUndefined();expect(Math.hypot(f.cargo.vx,f.cargo.vy)).toBeGreaterThan(1);
 });
 it('brakes on lost input and pilot handover without dropping the load',()=>{
  const f=fixture();f.connect();f.run(500,{friendsAircraftWinch:-1});f.run(1000,{},'guest');expect(f.state().mode).toBe('hold');expect(f.state().cargoId).toBe('lantern-core');
  f.vehicle.pilotId='guest';f.run(1000,{friendsAircraftWinch:1},'guest');const held=f.state().length;f.run(500,{friendsAircraftWinch:1},'guest');expect(f.state().length).toBeCloseTo(held,1);
  f.run(25,{},'guest');f.run(500,{friendsAircraftWinch:1},'guest');expect(f.state().length).toBeGreaterThan(held+10);
 });
 it('rejects swept flight through structures, cable obstructions and nearby crew',()=>{
  const f=fixture();f.connect();f.run(1000,{friendsAircraftWinch:-1});const pose={x:f.cargo.x,y:f.cargo.y,z:f.cargo.z};
  f.env.colliders=()=>[{x:10060,y:10000,z:f.cargo.z,w:8,d:100,h:80}];expect(f.h.allowAircraftFlight(f.vehicle,{...f.vehicle,x:10100},f.env,[f.actor])).toBe(false);expect(f.cargo).toMatchObject(pose);
  f.env.colliders=()=>[];f.env.blocked=()=>true;expect(f.h.allowAircraftFlight(f.vehicle,{...f.vehicle,x:10010},f.env,[f.actor])).toBe(false);
  f.env.blocked=()=>false;expect(f.h.allowAircraftFlight(f.vehicle,{...f.vehicle,x:10030},f.env,[{...f.guest,x:10045,y:10000,z:f.cargo.z}])).toBe(false);
 });
 it('sweeps an empty deployed cable before flight, while stowed winches skip the query',()=>{
  const f=fixture();let queries=0;f.env.blocked=()=>{queries++;return true;};
  expect(f.h.allowAircraftFlight(f.vehicle,{...f.vehicle,x:10030},f.env,[f.actor])).toBe(true);expect(queries).toBe(0);
  f.env.blocked=()=>false;f.run(1000,{friendsAircraftWinch:1});expect(f.state().length).toBeGreaterThan(40);
  f.env.blocked=(tip,hook)=>{queries++;return tip.x>10015&&hook.z<200;};const before={...f.vehicle};
  expect(f.h.allowAircraftFlight(f.vehicle,{...f.vehicle,x:10030},f.env,[f.actor])).toBe(false);
  expect(f.vehicle).toEqual(before);expect(f.state()).toMatchObject({mode:'hold',blocked:true,blockedReason:'Cable obstruction',winchSpeed:0});
  f.env.blocked=()=>false;expect(f.h.allowAircraftFlight(f.vehicle,{...f.vehicle,x:10030},f.env,[f.actor])).toBe(true);
 });
 it('allows ground hook work, rejects distant/pilot requests, and releases cleanly on reset',()=>{
  const f=fixture();f.run(3400,{friendsAircraftWinch:1});f.run(25);
  expect(f.h.controlAircraftHook(f.actor,'airwinch_hook_connect',f.env).ok).toBe(false);
  f.guest.x=10030;f.guest.y=10000;expect(f.h.controlAircraftHook(f.guest,'airwinch_hook_connect',f.env).ok).toBe(true);
  expect(f.h.controlAircraftHook({...f.guest,x:11000},'airwinch_hook_release',f.env).ok).toBe(false);
  f.h.resetAircraftWinch();expect(f.h.getAircraftWinch()).toBeUndefined();f.run(25);expect(f.state().length).toBe(0);expect(f.state().cargoId).toBeUndefined();
 });
 it('preserves aircraft reset rules and ordinary flight when no load is attached',()=>{
  const e=new FriendsExpedition(),before=e.vehicles().find(v=>v.kind==='aircraft')!,p={id:'host',lifeState:'alive',x:before.x+100,y:before.y,z:before.z,verticalVelocity:0};(e as any).aircraft.pilotId='host';
  e.update(25,25,[p],new Map([['host',input({movement:1,jetHeld:true})]]));const after=e.vehicles().find(v=>v.kind==='aircraft')!;expect(after.x-before.x).toBeCloseTo(10.5);expect(after.z-before.z).toBe(7.5);
  e.resetAircraft(undefined,[p]);expect(e.vehicles().find(v=>v.kind==='aircraft')?.pilotId).toBeUndefined();expect(e.hauling.getAircraftWinch()).toBeUndefined();
 });
 it('rolls back blocked aircraft movement before moving its pilot',()=>{
  const e=new FriendsExpedition(),a=e.vehicles().find(v=>v.kind==='aircraft')!,p={id:'host',lifeState:'alive',x:a.x+40,y:a.y,z:a.z,verticalVelocity:0};(e as any).aircraft.pilotId='host';
  e.update(25,25,[p],new Map([['host',input()]]));const before={...e.vehicles().find(v=>v.kind==='aircraft')!},position={x:p.x,y:p.y,z:p.z};let checks=0;
  e.update(25,50,[p],new Map([['host',input({movement:1,jetHeld:true})]]),[],undefined,()=>{checks++;return false;});
  expect(checks).toBe(1);expect(e.vehicles().find(v=>v.kind==='aircraft')).toEqual(before);expect(p).toMatchObject(position);
 });
 it('replicates winch motion without construction patches and interpolates it for guests',()=>{
  const f=fixture(),s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),before=s.createSnapshot();before.friends!.hauling=f.h.snapshot();before.friends!.vehicles=[{...f.vehicle}];
  const host=new FriendsWorldHost(),guest=new FriendsWorldGuest((m:any)=>{if(m.kind==='ack')host.acknowledge('guest',m.epoch,m.revision);},()=>{});host.update(before);host.pump(['guest'],0,(_id,p)=>{guest.receive(p,0);return true;},()=>{});
  f.run(1000,{friendsAircraftWinch:1});const after={...before,friends:{...before.friends!,hauling:f.h.snapshot()}};host.update(after);let patches=0;host.pump(['guest'],1000,()=>{patches++;return true;},()=>{});expect(patches).toBe(0);expect(guest.decode(host.motion('guest',after))!.friends!.hauling!.aircraftWinch?.length).toBe(f.state().length);
  const half=interpolateCoopSnapshot(before,after,.5);expect(half.friends!.hauling!.aircraftWinch?.length).toBeCloseTo(f.state().length/2);
 });
});
