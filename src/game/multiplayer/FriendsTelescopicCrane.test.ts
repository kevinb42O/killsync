import { FriendsSimulation } from './FriendsSimulation';
import { FriendsWorldHost, FriendsWorldGuest } from './FriendsWorldReplication';
import { interpolateCoopSnapshot } from './snapshotInterpolation';
import { FriendsCargoPhysics } from './FriendsCargoPhysics';
import {describe,it,expect} from 'vitest';
import { FriendsHauling, type HaulingEnvironment, type PhysicalCargo } from './FriendsHauling';
import { craneOutlet, craneCargoAnchor, type CraneAction } from './FriendsCrane';
import { FriendsBuilding, raycastFriendsBuild, friendsBuildFloor, type FriendsBuildPiece } from './FriendsBuilding';
import { CRANE_MAX_MAST_EXTENSION, CRANE_MAX_BOOM_EXTENSION, applyCraneMotion } from './FriendsTelescopicCrane';
import { validFriendsCommand } from './FriendsCommands';
import { craneCameraPose } from './FriendsCraneCamera';

function fixture(dimensions={mastExtension:0,boomExtension:0}) {
  const piece:FriendsBuildPiece={id:77,x:10000,y:10000,z:0,rotation:0,shape:'crane',finish:'teal',author:'Host',revision:1,...dimensions};
  const cargo:PhysicalCargo={id:'lantern-core',x:10120,y:10000,z:0,angle:0,vx:0,vy:0,vz:0,spin:0};
  const actor={id:'host',lifeState:'alive',x:9936,y:10060,z:0},h=new FriendsHauling({version:1,cargo:[cargo],delivered:false});
  const env:HaulingEnvironment={revision:'test',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[],builds:[piece]};h.syncCranes(env);
  let time=0;
  const command=(a:CraneAction)=>h.controlCrane(actor,77,a,env,true,time);
  const run=(ms:number,heartbeat=true)=>{for(let t=0;t<ms;t+=25){time+=25;if(heartbeat)command('crane_heartbeat');h.update(25,time,[actor],new Map(),env);}};
  return {piece,actor,h,env,command,run,state:()=>h.snapshot().cranes![0],cargo:h.getCargo()[0]};
}
describe('telescopic prefab crane',()=>{
  it('keeps the original hook position and turns around the mast, including quarter-turn placements',()=>{
    for(let rotation=0;rotation<4;rotation++){
      const f=fixture();const p={...f.state(),rotation,angle:Math.PI};const out=craneOutlet(p),a=rotation*Math.PI/2;
      expect(out.x).toBeCloseTo(10000-248*Math.cos(a));expect(out.y).toBeCloseTo(10000-248*Math.sin(a));expect(out.z).toBe(134);
    }
  });
  it('runs mast, boom, rotation and winch together, keeping a connected load suspended with bounded sway',()=>{
    const f=fixture();expect(f.command('crane_connect').ok).toBe(true);
    for(const a of ['crane_mast_up','crane_extend','crane_left','crane_raise'] as const)expect(f.command(a).ok).toBe(true);f.run(1000);
    const c=f.state(),out=craneOutlet(c),anchor=craneCargoAnchor(f.cargo,c);
    expect(c.mastExtension).toBeGreaterThan(100);expect(c.boomExtension).toBeGreaterThan(100);expect(c.angle).toBeGreaterThan(.05);
    expect(Math.hypot(anchor.x-out.x,anchor.y-out.y)).toBeGreaterThan(1);expect(Math.abs(Math.hypot(anchor.x-out.x,anchor.y-out.y,anchor.z-out.z)-c.length)).toBeLessThan(8.5);expect(f.cargo.z).toBeGreaterThan(100);
    f.command('crane_stop_all');const pose=f.state();f.run(500);expect(f.state()).toMatchObject({angle:pose.angle,mastExtension:pose.mastExtension,boomExtension:pose.boomExtension,armMode:'hold',mode:'hold',mastMode:'hold',boomMode:'hold'});
  });
  it('swings after braking, settles with anti-sway, and preserves momentum on release',()=>{
    const f=fixture();f.command('crane_connect');f.command('crane_mast_up');f.run(1000);f.command('crane_stop_all');
    f.command('crane_left');f.run(1500);f.command('crane_stop_all');
    const stopped=f.state(),position={x:f.cargo.x,y:f.cargo.y};f.run(200);
    expect(f.state().angle).toBe(stopped.angle);expect(Math.hypot(f.cargo.x-position.x,f.cargo.y-position.y)).toBeGreaterThan(.5);
    expect(f.state().swayAngle).toBeGreaterThan(.1);
    f.command('crane_release');expect(Math.hypot(f.cargo.vx,f.cargo.vy)).toBeGreaterThan(1);
    const released={x:f.cargo.x,y:f.cargo.y};f.run(100);expect(Math.hypot(f.cargo.x-released.x,f.cargo.y-released.y)).toBeGreaterThan(.1);
    expect(f.state().swayAngle).toBe(0);
    const steady=fixture();steady.command('crane_connect');steady.command('crane_mast_up');steady.run(1000);steady.command('crane_stop_all');steady.command('crane_left');steady.run(1500);steady.command('crane_stop_all');steady.command('crane_stabilize');steady.run(10000);
    expect(steady.state().swayAngle).toBeLessThan(.05);expect(steady.state().antiSway).toBe(true);
  });
  it('stops sway at an obstruction and skips stationary sway collision queries',()=>{
    const f=fixture();f.command('crane_connect');f.command('crane_mast_up');f.run(1000);f.command('crane_stop_all');f.command('crane_left');f.run(1000);f.command('crane_stop_all');
    const p={x:f.cargo.x,y:f.cargo.y};f.env.colliders=()=>[{x:f.cargo.x,y:f.cargo.y,z:f.cargo.z-1,w:80,d:64,h:60}];f.run(25);
    expect(f.state().blocked).toBe(true);expect(f.cargo.x).toBe(p.x);expect(f.cargo.y).toBe(p.y);
    const rest=fixture();rest.command('crane_connect');rest.run(1000);let queries=0;rest.env.colliders=()=>{queries++;return [];};rest.env.floor=()=>{queries++;return 0;};rest.run(1000);expect(queries).toBe(0);
  });
  it('reaches the giant limits, brakes at each limit, and retracts again',()=>{
    const f=fixture();f.command('crane_mast_up');f.command('crane_extend');f.run(21000);
    expect(f.state()).toMatchObject({mastExtension:CRANE_MAX_MAST_EXTENSION,boomExtension:CRANE_MAX_BOOM_EXTENSION,mastMode:'hold',boomMode:'hold',blocked:false});
    const out=craneOutlet(f.state());expect(out.z+26).toBe(256*12);expect(out.x-9936).toBe(256*12);
    f.command('crane_mast_down');f.command('crane_retract');f.run(21000);expect(f.state()).toMatchObject({mastExtension:0,boomExtension:0,mastMode:'hold',boomMode:'hold'});
  });
  it('collision-checks extension paths and keeps every axis braked after an obstruction disappears',()=>{
    const f=fixture();f.env.colliders=()=>[{x:10190,y:10000,z:130,w:10,d:100,h:60}];f.command('crane_extend');f.command('crane_mast_up');f.run(1200);
    expect(f.state()).toMatchObject({blocked:true,mastMode:'hold',boomMode:'hold',armMode:'hold',mode:'hold'});
    const pose=f.state();f.env.colliders=()=>[];f.run(500);expect(f.state().boomExtension).toBe(pose.boomExtension);
  });
  it('sweeps vertically with the load and brakes before pushing it through a ceiling',()=>{
    const f=fixture();f.command('crane_connect');f.env.colliders=()=>[{x:10120,y:10000,z:100,w:100,d:100,h:10}];f.command('crane_mast_up');f.run(1000);
    expect(f.state()).toMatchObject({blocked:true,mastMode:'hold'});expect(f.cargo.z+48).toBeLessThan(100);
  });
  it('brakes on a stale operator lease and when the operator leaves the base',()=>{
    const f=fixture();f.command('crane_mast_up');f.command('crane_extend');f.command('crane_left');f.run(3200,false);
    expect(f.state()).toMatchObject({mastMode:'hold',boomMode:'hold',armMode:'hold'});expect(f.state().operatorId).toBeUndefined();
    f.command('crane_extend');f.actor.x+=500;f.run(100);expect(f.state().boomMode).toBe('hold');
  });
  it('does not sweep the stationary ground console against its operator when raising the mast',()=>{
    const f=fixture();f.actor.y=9950;f.command('crane_mast_up');f.run(500);expect(f.state().blocked).toBe(false);expect(f.state().mastExtension).toBeGreaterThan(20);
  });
  it('supports independent brakes and precision speed',()=>{
    const normal=fixture(),fine=fixture();fine.command('crane_precision');for(const f of [normal,fine]){f.command('crane_mast_up');f.command('crane_extend');f.run(1200);}
    expect(fine.state().boomExtension!).toBeLessThan(normal.state().boomExtension!*.3);
    normal.command('crane_stop_mast');const height=normal.state().mastExtension;normal.run(200);expect(normal.state().mastExtension).toBe(height);expect(normal.state().boomMode).toBe('extend');
  });
  it('ramps extension motors again when their direction is reversed',()=>{
    const f=fixture();f.command('crane_mast_up');f.command('crane_extend');f.run(1200);
    const height=f.state().mastExtension!,reach=f.state().boomExtension!;
    f.command('crane_mast_down');f.command('crane_retract');f.run(25);
    expect(height-f.state().mastExtension!).toBeGreaterThan(0);expect(height-f.state().mastExtension!).toBeLessThan(1);
    expect(reach-f.state().boomExtension!).toBeGreaterThan(0);expect(reach-f.state().boomExtension!).toBeLessThan(1);
  });
  it('parks and restores dimensions with old-world defaults and rejects forged dimensions',()=>{
    const f=fixture(),b=new FriendsBuilding({revision:1,guestsCanBuild:true,pieces:[f.piece]});b.parkCrane(77,.8,1000,2000);
    const restored=new FriendsBuilding(b.snapshot());expect(restored.getPieces()[0]).toMatchObject({craneAngle:.8,mastExtension:1000,boomExtension:2000});
    const legacy=fixture();delete legacy.piece.mastExtension;delete legacy.piece.boomExtension;const old=new FriendsHauling();old.syncCranes(legacy.env);expect(old.snapshot().cranes![0]).toMatchObject({mastExtension:0,boomExtension:0,angle:0});
    for(const dimensions of [{mastExtension:NaN},{mastExtension:-1},{boomExtension:CRANE_MAX_BOOM_EXTENSION+1}])expect(validFriendsCommand({requestId:1,action:'place',pose:{...f.piece,...dimensions}},true)).toBe(false);
    for(const action of ['crane_mast_up','crane_extend','crane_stop_mast','crane_precision','crane_stabilize'])expect(validFriendsCommand({requestId:1,action,pieceId:77},false)).toBe(true);
  });
  it('restores old longer booms at the new limit without resetting their mast or angle',()=>{
    const f=fixture(),saved={...f.piece,mastExtension:1200,boomExtension:4424,craneAngle:.7};
    const b=new FriendsBuilding({revision:1,guestsCanBuild:true,pieces:[saved]});
    expect(b.getPieces()[0]).toMatchObject({mastExtension:1200,boomExtension:CRANE_MAX_BOOM_EXTENSION,craneAngle:.7});
    expect(validFriendsCommand({requestId:1,action:'place',pose:saved},true)).toBe(false);
  });
  it('targets the real extended boom at arbitrary angles and preserves the original root identity',()=>{
    const f=fixture({mastExtension:500,boomExtension:1000});f.piece.craneAngle=Math.PI/4;
    const c={...f.state(),angle:Math.PI/4},out=craneOutlet(c),ray={x:out.x,y:out.y,z:out.z+100,dx:0,dy:0,dz:-1};
    expect(raycastFriendsBuild([f.piece],ray)?.piece).toBe(f.piece);
    expect(friendsBuildFloor([f.piece],out.x,out.y,1000,0)).toBeGreaterThan(out.z);
    // A point inside the diagonal broad AABB but far from the narrow arm is empty.
    expect(raycastFriendsBuild([f.piece],{x:out.x,y:10000,z:900,dx:0,dy:0,dz:-1})).toBeUndefined();
    const live=applyCraneMotion([f.piece],[{...c,mastExtension:900,boomExtension:1800}]);expect(live[0]).toMatchObject({mastExtension:900,boomExtension:1800,craneAngle:Math.PI/4});
  });
  it('fits the mast foot, full boom and hook in the overview even when the hook is raised',()=>{
    const f=fixture({mastExtension:CRANE_MAX_MAST_EXTENSION,boomExtension:CRANE_MAX_BOOM_EXTENSION}),c={...f.state(),length:12};
    const view=craneCameraPose(c,undefined,{mode:'overview',orbit:0,distance:280});expect(view.target.z).toBeLessThan(craneOutlet(c).z*.6);expect(view.distance).toBeGreaterThan(6000);
  });
  it('replicates and interpolates dimensions through motion without creating construction patches',()=>{
    const f=fixture(),sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),before=sim.createSnapshot();
    before.friends!.building={revision:1,guestsCanBuild:true,pieces:[f.piece]};f.command('crane_connect');before.friends!.hauling=f.h.snapshot();
    const host=new FriendsWorldHost(),guest=new FriendsWorldGuest((m:any)=>{if(m.kind==='ack')host.acknowledge('guest',m.epoch,m.revision);},()=>{});
    host.update(before);host.pump(['guest'],0,(_id,packet)=>{guest.receive(packet,0);return true;},()=>{});
    f.command('crane_connect');f.command('crane_stabilize');f.command('crane_mast_up');f.command('crane_extend');f.command('crane_left');f.run(1000);
    const after={...before,friends:{...before.friends!,hauling:f.h.snapshot()}};host.update(after);let patches=0;host.pump(['guest'],1000,()=>{patches++;return true;},()=>{});expect(patches).toBe(0);
    const decoded=guest.decode(host.motion('guest',after))!;
    expect(decoded.friends!.hauling!.cranes![0]).toMatchObject({antiSway:true,swayAngle:f.state().swayAngle});
    expect(decoded.friends!.building!.pieces[0]).toMatchObject({mastExtension:f.state().mastExtension,boomExtension:f.state().boomExtension,craneAngle:f.state().angle});
    const half=interpolateCoopSnapshot(before,after,.5);expect(half.friends!.building!.pieces[0].mastExtension).toBeCloseTo(f.state().mastExtension!/2);expect(half.friends!.building!.pieces[0].boomExtension).toBeCloseTo(f.state().boomExtension!/2);
  });
  it('updates telescoping cargo-contact dimensions without allocating another physics body',()=>{
    const f=fixture(),physics=new FriendsCargoPhysics();let width=32,height=20;
    const env={...f.env,dynamicColliders:()=>[{buildId:77,x:f.cargo.x+100,y:f.cargo.y,z:0,w:width,d:40,h:height}]};
    physics.prepare(f.cargo,env);const bodies=(physics as any).movingBuilds as Map<string,any>,body=[...bodies.values()][0];
    width=160;height=100;physics.prepare(f.cargo,env);expect([...bodies.values()][0]).toBe(body);expect(body.shapes[0].halfExtents.x).toBe(160/64);expect(body.shapes[0].halfExtents.z).toBe(100/64);expect(body.shapeOffsets[0].z).toBe(100/64);
  });

});
