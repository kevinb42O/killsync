import { compactSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';
import { interpolateCoopSnapshot } from './snapshotInterpolation';
import { FriendsWorldGuest, FriendsWorldHost } from './FriendsWorldReplication';
import { describe,it,expect } from 'vitest';
import { FriendsHauling, type PhysicalCargo, type HaulingEnvironment } from './FriendsHauling';
import { craneOutlet, craneCargoAnchor, nearbyCrane, CRANE_MIN_LENGTH } from './FriendsCrane';
import type { FriendsBuildPiece } from './FriendsBuilding';
import { validFriendsCommand } from './FriendsCommands';
import { FriendsSimulation } from './FriendsSimulation';
import { buildCost } from './FriendsFrontier';
import { filterBuildLibrary } from './FriendsBuildControls';

const fixture=()=>{
  const piece:FriendsBuildPiece={id:77,shape:'crane',finish:'teal',author:'Host',revision:1,x:880,y:1000,z:400,rotation:0};
  const cargo:PhysicalCargo={id:'lantern-core',x:1000,y:1000,z:0,angle:0,vx:0,vy:0,vz:0,spin:0};
  const player={id:'host',lifeState:'alive',x:816,y:1060,z:400};
  const h=new FriendsHauling({version:1,cargo:[cargo],delivered:false});
  const env:HaulingEnvironment={revision:'crane',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[],builds:[piece]};
  h.syncCranes(env);return {piece,cargo:h.getCargo()[0],player,h,env};
};
const run=(f:ReturnType<typeof fixture>,seconds:number,env=f.env)=>{for(let t=0;t<seconds*1000;t+=50){f.h.controlCrane(f.player,77,'crane_heartbeat',env,true,t);f.h.update(50,t,[f.player],new Map(),env);}};
const connect=(f:ReturnType<typeof fixture>)=>f.h.controlCrane(f.player,77,'crane_connect',f.env);

describe('buildable vertical freight crane',()=>{
  it('is discoverable in the building library with a fixed material recipe',()=>{
    expect(filterBuildLibrary('workshop','',[])).toContain('crane');expect(filterBuildLibrary('blocks','crane',[])).toContain('crane');
    expect(buildCost('crane','teal')).toEqual({planks:12,ingots:6});
  });
  it.each([0,1,2,3])('rotates the outlet into open space at quarter turn %s',rotation=>{
    const f=fixture(),p={...f.piece,rotation},outlet=craneOutlet(p);
    expect(Math.hypot(outlet.x-p.x,outlet.y-p.y)).toBeCloseTo(120);expect(outlet.z).toBe(534);
  });
  it('connects remotely from the top without moving the load or the player',()=>{
    const f=fixture(),before={...f.cargo},operator={...f.player};
    expect(connect(f).ok).toBe(true);expect(f.cargo).toEqual(before);expect(f.player).toEqual(operator);
    const crane=f.h.snapshot().cranes![0],anchor=craneCargoAnchor(f.cargo,crane);
    expect(anchor).toEqual({x:1000,y:1000,z:48});expect(crane.length).toBe(486);
  });
  it('lifts solo straight up, brakes in the air, lowers and releases to gravity',()=>{
    const f=fixture();connect(f);f.h.controlCrane(f.player,77,'crane_raise',f.env);run(f,3);
    expect(f.cargo.z).toBeGreaterThan(135);expect(f.cargo.x).toBeCloseTo(1000,8);expect(f.cargo.y).toBeCloseTo(1000,8);
    expect(f.cargo.spin).toBe(0);expect(f.player).toMatchObject({x:816,y:1060,z:400});
    f.h.controlCrane(f.player,77,'crane_hold',f.env);run(f,1);const held=f.cargo.z;run(f,2);
    expect(f.cargo.z).toBeCloseTo(held,1);
    f.h.controlCrane(f.player,77,'crane_lower',f.env);run(f,1);expect(f.cargo.z).toBeLessThan(held-35);
    f.h.controlCrane(f.player,77,'crane_hold',f.env);run(f,2);const releaseHeight=f.cargo.z;
    expect(f.h.controlCrane(f.player,77,'crane_release',f.env).ok).toBe(true);run(f,.4);
    expect(f.cargo.z).toBeLessThan(releaseHeight-10);expect(f.h.snapshot().cranes![0].cargoId).toBeUndefined();
  });
  it('stops at the top limit and settles at ground when lowered',()=>{
    const f=fixture();connect(f);f.h.controlCrane(f.player,77,'crane_raise',f.env);run(f,14);
    expect(f.h.snapshot().cranes![0]).toMatchObject({length:CRANE_MIN_LENGTH,mode:'hold'});expect(f.cargo.z+48).toBeLessThanOrEqual(534-CRANE_MIN_LENGTH+.1);
    f.h.controlCrane(f.player,77,'crane_lower',f.env);run(f,14);
    expect(f.cargo.z).toBeGreaterThan(-1);expect(f.cargo.z).toBeLessThan(1);expect(f.h.snapshot().cranes![0]).toMatchObject({mode:'hold',blocked:true});
  });
  it('stalls on a solid ceiling without clipping or storing a long pull',()=>{
    const f=fixture();connect(f);f.h.controlCrane(f.player,77,'crane_raise',f.env);
    const env={...f.env,colliders:()=>[{x:1000,y:1000,z:200,w:180,d:180,h:32}]};run(f,5,env);
    expect(f.cargo.z+48).toBeLessThan(201);expect(f.h.snapshot().cranes![0]).toMatchObject({mode:'hold',blocked:true});
    const before=f.cargo.z;run(f,1,{...env,revision:'ceiling-removed',colliders:()=>[]});expect(f.cargo.z).toBeCloseTo(before,0);
  });
  it('brakes when the operator walks away or disconnects, and lets a teammate take over',()=>{
    const f=fixture();connect(f);f.h.controlCrane(f.player,77,'crane_raise',f.env);run(f,1);
    f.player.x+=500;run(f,1);expect(f.h.snapshot().cranes![0].mode).toBe('hold');
    const teammate={...f.player,id:'guest',x:816};expect(f.h.controlCrane(teammate,77,'crane_lower',f.env).ok).toBe(true);
    f.h.update(50,0,[],new Map(),f.env);expect(f.h.snapshot().cranes![0].mode).toBe('hold');
  });
  it('rejects distant, dead, forbidden and vehicle-mounted operators and malformed commands',()=>{
    const f=fixture();expect(f.h.controlCrane({...f.player,x:2000},77,'crane_connect',f.env).ok).toBe(false);
    expect(f.h.controlCrane({...f.player,lifeState:'downed'},77,'crane_connect',f.env).ok).toBe(false);
    expect(f.h.controlCrane(f.player,77,'crane_connect',f.env,false).ok).toBe(false);
    expect(nearbyCrane([{...f.piece,attachment:{vehicleId:'grand-1',x:0,y:0,z:0}}],f.player)).toBeUndefined();
    for(const pieceId of [undefined,-1,NaN,2.5,'77'])expect(validFriendsCommand({requestId:1,action:'crane_raise',pieceId},false)).toBe(false);
    expect(validFriendsCommand({requestId:1,action:'crane_raise',pieceId:77},false)).toBe(true);
  });
  it('rejects a blocked path, misaligned load, moving load and a second connection',()=>{
    const f=fixture();expect(f.h.controlCrane(f.player,77,'crane_connect',{...f.env,blocked:()=>true}).ok).toBe(false);
    f.cargo.x+=80;expect(connect(f).ok).toBe(false);f.cargo.x-=80;f.cargo.vz=40;expect(connect(f).ok).toBe(false);f.cargo.vz=0;
    expect(connect(f).ok).toBe(true);expect(connect(f).ok).toBe(false);
    const other={...f.piece,id:78};f.env.builds=[f.piece,other];f.h.syncCranes(f.env);expect(f.h.controlCrane(f.player,78,'crane_connect',f.env).ok).toBe(false);
  });
  it('lets an offset attachment stay vertical without snapping the load sideways',()=>{
    const f=fixture();f.cargo.x-=12;f.cargo.y+=8;expect(connect(f).ok).toBe(true);f.h.controlCrane(f.player,77,'crane_raise',f.env);run(f,2);
    const anchor=craneCargoAnchor(f.cargo,f.h.snapshot().cranes![0]);expect(anchor.x).toBeCloseTo(1000,8);expect(anchor.y).toBeCloseTo(1000,8);
    expect(f.cargo.x).toBeCloseTo(988,8);expect(f.cargo.y).toBeCloseTo(1008,8);
  });
  it('frees the physics guide if its crane is removed and does not share mutable snapshot state',()=>{
    const f=fixture();connect(f);f.h.controlCrane(f.player,77,'crane_raise',f.env);run(f,2);f.h.controlCrane(f.player,77,'crane_hold',f.env);run(f,2);
    const before=f.h.snapshot(),z=f.cargo.z;f.env.builds=[];run(f,.5);
    expect(f.h.snapshot().cranes).toEqual([]);expect(before.cranes![0].cargoId).toBe('lantern-core');expect(f.cargo.z).toBeLessThan(z-10);
  });
  it('validates and deduplicates host commands and preserves building permissions',()=>{
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Guest',color:'#aaa'}]),f=fixture();
    s['friendsBuilding']!['pieces']=[f.piece];const p=s['players'].get('host')!;Object.assign(p,f.player);
    const h=s['friends']!.hauling;Object.assign(h.getCargo()[0],f.cargo);s['haulingEnvironment']=()=>f.env;
    const request={requestId:1,action:'crane_connect' as const,pieceId:77};expect(s.friendsAction('host',request).ok).toBe(true);expect(s.friendsAction('host',request).ok).toBe(true);
    expect(s.friendsBuild('host',{requestId:2,action:'remove',pieceId:77}).message).toMatch(/Release/);
    expect(s.friendsBuild('host',{requestId:3,action:'undo'}).message).toMatch(/Release/);
    s.setFriendsGuestAccess(false);Object.assign(s['players'].get('guest')!,{...f.player,id:'guest'});
    expect(s.friendsAction('guest',{requestId:1,action:'crane_raise',pieceId:77}).ok).toBe(false);
  });
  it('replicates crane controls and attached cargo through snapshot deltas and island motion',()=>{
    const f=fixture(),s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),before=s.createSnapshot();
    before.friends!.building!.pieces=[f.piece];before.friends!.hauling=f.h.snapshot();
    const codec=new SnapshotDecoder();codec.decode(compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot:before}),10);
    connect(f);f.h.controlCrane(f.player,77,'crane_raise',f.env);run(f,1);
    const next={...before,friends:{...before.friends!,hauling:f.h.snapshot()}};
    const decoded=codec.decode(compactSnapshotWirePayload(createSnapshotDelta(before,next,10)),11)!;
    expect(decoded.friends!.hauling).toEqual(JSON.parse(JSON.stringify(next.friends!.hauling)));
    const host=new FriendsWorldHost(),guest=new FriendsWorldGuest((m:any)=>{if(m.kind==='ack')host.acknowledge('guest',m.epoch,m.revision);},()=>{});
    host.update(before);host.pump(['guest'],0,(_id,packet)=>{guest.receive(packet,0);return true;},message=>{throw new Error(message);});
    expect(guest.decode(host.motion('guest',next))!.friends!.hauling).toEqual(next.friends!.hauling);
    expect(before.friends!.hauling!.cranes![0].cargoId).toBeUndefined();
  });
  it('interpolates a free moving hook without altering a connect edge',()=>{
    const f=fixture(),s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),before=s.createSnapshot();before.friends!.hauling=f.h.snapshot();
    const next=structuredClone(before);next.friends!.hauling!.cranes![0].length-=100;
    const half=interpolateCoopSnapshot(before,next,.5);expect(half.friends!.hauling!.cranes![0].length).toBe(f.h.snapshot().cranes![0].length-50);
    next.friends!.hauling!.cranes![0].cargoId='lantern-core';expect(interpolateCoopSnapshot(before,next,.5).friends!.hauling!.cranes![0].length).toBe(next.friends!.hauling!.cranes![0].length);
  });

});
