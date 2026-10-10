import { describe,it,expect } from 'vitest';
import { FriendsBuilding,friendsPlacementError,getFriendsBuildPose,raycastFriendsBuild,resolveFriendsBuildPieces,type FriendsBuildPiece } from './FriendsBuilding';
import { durableBuildPieces,resolveAssemblyPose } from './FriendsAssemblyPose';
import { craneSocketPose,craneTopologyError } from './FriendsCraneAssemblies';
import { FriendsHauling,type HaulingEnvironment } from './FriendsHauling';
import { craneCargoAnchor,craneOutlet } from './FriendsCrane';
import { sweepCrane,boxOBB,overlapOBB } from './FriendsCraneSweep';
import { craneCameraPose,DEFAULT_CRANE_CAMERA } from './FriendsCraneCamera';
import { FriendsBuildSpatialIndex } from './FriendsInteractionTargeting';
import { validFriendsCommand } from './FriendsCommands';
import { FriendsWorldHost,FriendsWorldGuest } from './FriendsWorldReplication';
import { FriendsSimulation } from './FriendsSimulation';
import { interpolateCoopSnapshot } from './snapshotInterpolation';
const root:FriendsBuildPiece={id:10,x:1000,y:1000,z:400,rotation:0,shape:'crane_joint',finish:'teal',author:'Host',revision:1};
const actor={id:'host',lifeState:'alive',x:940,y:1060,z:400};
function kit(){const pieces=[{...root}],boom={...craneSocketPose(pieces,pieces[0],'crane_boom',0)!,id:11,shape:'crane_boom' as const,finish:'teal' as const,author:'Host',revision:1};pieces.push(boom);pieces.push({...craneSocketPose(pieces,boom,'crane_winch',0)!,id:12,shape:'crane_winch',finish:'teal',author:'Host',revision:1});return pieces;}
function fixture(){const pieces=kit(),h=new FriendsHauling({version:1,cargo:[{id:'lantern-core',x:1096,y:1000,z:0,angle:0,vx:0,vy:0,vz:0,spin:0}],delivered:false});const env:HaulingEnvironment={revision:'kit',floor:()=>0,collide:()=>false,blocked:()=>false,vehicles:[],builds:pieces};h.syncCranes(env);let elapsed=0;return {pieces,h,env,cargo:h.getCargo()[0],command:(action:Parameters<typeof h.controlCrane>[2],p=actor,id=10)=>h.controlCrane(p,id,action,env,true,elapsed),run:(ms:number,players=[actor],heartbeat=true)=>{for(let t=0;t<ms;t+=50){elapsed+=50;if(heartbeat&&elapsed%1000===0)h.controlCrane(actor,10,'crane_heartbeat',env,true,elapsed);h.update(50,elapsed,players,new Map(),env);}}};}

describe('modular crane sockets and durable topology',()=>{
 it('reuses assembly poses until live angles or durable pieces change',()=>{
  const b=new FriendsBuilding({pieces:kit()}),angles=new Map([[10,0]]);
  b.craneAngleProvider=()=>angles;
  const first=b.getPieces();expect(first).toHaveLength(3);expect(b.getPieces()).toBe(first);
  angles.set(10,Math.PI/4);
  const moved=b.getPieces();expect(moved).not.toBe(first);expect(moved[2].x).toBeCloseTo(1000+96/Math.sqrt(2));expect(b.getPieces()).toBe(moved);
  angles.clear();expect(b.getPieces()[2].x).toBeCloseTo(first[2].x);
  const before=b.getPieces();b.parkCrane(10,.7);expect(b.getPieces()).not.toBe(before);expect(b.getPieces()[2].assemblyFrame?.angle).toBeCloseTo(.7);
 });
 it('builds an explicit joint / boom / winch chain and resolves arbitrary live yaw',()=>{
  const pieces=kit(),live=resolveFriendsBuildPieces(pieces,[],new Map([[10,Math.PI/4]]));expect(craneTopologyError(pieces)).toBeUndefined();expect(live[2].x).toBeCloseTo(1000+96/Math.sqrt(2));expect(live[2].assemblyFrame?.angle).toBeCloseTo(Math.PI/4);
  const ray={x:live[1].x,y:live[1].y,z:600,dx:0,dy:0,dz:-1};expect(raycastFriendsBuild(live,ray)?.piece.id).toBe(11);
  const preview=getFriendsBuildPose(live,ray,'crane_winch',0)!;expect(preview.assembly?.parentId).toBe(11);expect(preview.x).toBeCloseTo(live[2].x);
 });
 it('allows a designed elbow but rejects branches, multiple winches and forged sockets',()=>{
  const pieces=kit().slice(0,2),elbow={...craneSocketPose(pieces,pieces[1],'crane_boom',1)!,id:13,shape:'crane_boom' as const,finish:'teal' as const,author:'Host',revision:1};
  expect(friendsPlacementError(pieces,'crane_boom',elbow)).toBeUndefined();pieces.push(elbow);expect(craneTopologyError(pieces)).toBeUndefined();
  expect(friendsPlacementError(pieces,'crane_winch',craneSocketPose(pieces,pieces[1],'crane_winch',0))).toMatch(/occupied/);
  const malformed={...elbow,assembly:{...elbow.assembly!,x:140}};expect(friendsPlacementError(pieces.slice(0,2),'crane_boom',malformed)).toMatch(/socket/);
  expect(validFriendsCommand({requestId:1,action:'place',shape:'crane_boom',finish:'teal',pose:{...elbow,assembly:{...elbow.assembly!,rootId:NaN}}},true)).toBe(false);
  expect(craneTopologyError([...kit(),{...kit()[2],id:14}])).toBeDefined();
 });
 it('uses precise oriented collision rather than diagonal enclosing boxes',()=>{
  const a=boxOBB({x:0,y:0,z:0,w:96,d:20,h:24,angle:Math.PI/4}),b=boxOBB({x:32,y:-32,z:0,w:8,d:8,h:24});expect(overlapOBB(a,b)).toBe(false);expect(overlapOBB(a,boxOBB({x:32,y:32,z:0,w:8,d:8,h:24}))).toBe(true);
 });
 it('restores local coordinates at the parked angle and protects parent removal / undo',()=>{
  const pieces=kit();pieces[0].craneAngle=.7;const live=resolveFriendsBuildPieces(pieces,[],new Map([[10,.7]]));
  const saved=durableBuildPieces(live);expect(saved[1].x).toBe(48);expect(saved[1].assemblyFrame).toBeUndefined();
  const b=new FriendsBuilding({revision:1,guestsCanBuild:true,pieces:saved});expect(b.getPieces()).toHaveLength(3);expect(b.getPieces()[2].x).toBeCloseTo(live[2].x);
  expect(b.request(actor,{requestId:1,action:'remove',pieceId:10,expectedRevision:b.getPieces()[0].revision},'host',[]).message).toMatch(/Dismantle/);
  expect(b.request(actor,{requestId:2,action:'remove',pieceId:12,expectedRevision:b.getPieces().find(p=>p.id===12)!.revision},'host',[]).ok).toBe(true);expect(b.request(actor,{requestId:3,action:'undo'},'host',[]).ok).toBe(true);expect(craneTopologyError(b.getPieces())).toBeUndefined();
  expect(new FriendsBuilding({revision:1,guestsCanBuild:true,pieces:[root,{...pieces[1],assembly:{...pieces[1].assembly!,parentId:999}}]}).getPieces()).toHaveLength(1);
 });
 it('updates the interaction index while only assembly motion changes',()=>{
  const index=new FriendsBuildSpatialIndex(),pieces=kit();index.update(pieces,1);expect(index.hasAttachments).toBe(true);const live=resolveFriendsBuildPieces(pieces,[],new Map([[10,1]]));index.update(live,1);expect(index.near(1000,1000,200).find(p=>p.id===12)?.y).toBeCloseTo(live[2].y);
 });
});

describe('powered crane motors and shared control',()=>{
 it('rotates and lifts together with a perfectly vertical cable and fixed operator',()=>{
  const f=fixture();expect(f.command('crane_connect').ok).toBe(true);f.command('crane_left');f.command('crane_raise');f.run(4000);const c=f.h.snapshot().cranes![0],out=craneOutlet(c),anchor=craneCargoAnchor(f.cargo,c);
  expect(c.angle).toBeGreaterThan(.5);expect(f.cargo.z).toBeGreaterThan(150);expect(anchor.x).toBeCloseTo(out.x,6);expect(anchor.y).toBeCloseTo(out.y,6);expect(actor).toMatchObject({x:940,y:1060,z:400});
  f.command('crane_stop_all');f.run(1000);const held={...f.cargo},angle=f.h.snapshot().cranes![0].angle;f.run(1000);expect(f.cargo.x).toBeCloseTo(held.x,6);expect(f.cargo.z).toBeCloseTo(held.z,1);expect(f.h.snapshot().cranes![0].angle).toBe(angle);
  f.command('crane_release');f.run(400);expect(f.cargo.z).toBeLessThan(held.z-10);
 });
 it('brakes after missed heartbeat, departure or access revocation',()=>{
  const f=fixture();f.command('crane_left');f.run(3500,[actor],false);expect(f.h.snapshot().cranes![0].armMode).toBe('hold');expect(f.h.snapshot().cranes![0].operatorId).toBeUndefined();
  f.command('crane_left');f.run(100,[]);expect(f.h.snapshot().cranes![0].armMode).toBe('hold');
  f.command('crane_left');f.env.craneAccess=()=>false;f.run(100);expect(f.h.snapshot().cranes![0].armMode).toBe('hold');
 });
 it('gives emergency stop priority, prevents competing movement and supports explicit takeover',()=>{
  const f=fixture(),guest={...actor,id:'guest'};f.command('crane_left');expect(f.command('crane_right',guest).ok).toBe(false);expect(f.command('crane_stop_all',guest).ok).toBe(true);expect(f.h.snapshot().cranes![0]).toMatchObject({operatorId:'host',armMode:'hold'});expect(f.command('crane_takeover').ok).toBe(true);expect(f.command('crane_right').ok).toBe(true);
 });
 it('links a console to both motors and leaves a neighboring crane independent',()=>{
  const f=fixture(),console={...root,id:20,shape:'crane_console' as const,x:1060,y:1080,craneRootId:10};f.env.builds=[...f.pieces,console,{...root,id:30,x:1250}];const operator={...actor,x:1080,y:1090};expect(f.command('crane_left',operator,20).ok).toBe(true);expect(f.h.snapshot().cranes!.find(c=>c.pieceId===10)?.armMode).toBe('left');expect(f.h.snapshot().cranes!.find(c=>c.pieceId===30)?.armMode).toBe('hold');
 });
 it('does not invent a cable before a winch exists and initializes it near the floor when attached',()=>{
  const f=fixture();f.env.builds=f.pieces.slice(0,2);f.h.syncCranes(f.env);expect(f.command('crane_raise').ok).toBe(false);f.env.builds=f.pieces;f.h.syncCranes(f.env);expect(f.h.snapshot().cranes![0].length).toBeGreaterThan(450);expect(f.command('crane_connect').ok).toBe(true);
 });
 it('checks intermediate arm and load poses, players, transports and empty cable paths',()=>{
  const f=fixture(),out=(a:number)=>craneOutlet({...f.h.snapshot().cranes![0],angle:a});
  expect(sweepCrane(f.pieces,10,-.3,.3,out,{...f.env,colliders:()=>[{x:1080,y:1000,z:528,w:2,d:2,h:20}]},[],[])).toBe('Structure or tree');
  Object.assign(f.cargo,out(-.3),{z:0});
  expect(sweepCrane(f.pieces,10,-.3,.3,out,{...f.env,colliders:()=>[{x:1096,y:1000,z:0,w:2,d:2,h:48}]},[],[],f.cargo)).toBe('Structure or tree');
  Object.assign(f.cargo,out(0),{z:0});
  expect(sweepCrane(f.pieces,10,0,.01,out,f.env,[{...actor,x:1096,y:1000,z:0}],[],f.cargo)).toBe('Crew in the way');
  expect(sweepCrane(f.pieces,10,0,.01,out,{...f.env,blocked:()=>true},[],[],undefined,100)).toBe('Cable obstruction');
  const v={id:'train',kind:'train' as const,x:1096,y:1000,z:0,angle:0,length:250,width:120,closed:true};expect(sweepCrane(f.pieces,10,0,.01,out,{...f.env,vehicles:[v as any]},[],[],f.cargo)).toBe('Transport');
 });
 it('stalls both motors before a collision and does not accumulate arm travel',()=>{
  const f=fixture();f.command('crane_connect');f.command('crane_left');f.command('crane_raise');f.env.colliders=()=>[{x:1096,y:1008,z:0,w:12,d:12,h:100}];f.run(200);expect(f.h.snapshot().cranes![0]).toMatchObject({blocked:true,armMode:'hold',mode:'hold',angle:0});f.env.colliders=()=>[];f.run(500);expect(f.h.snapshot().cranes![0].angle).toBe(0);
 });
});

describe('crane camera and multiplayer presentation',()=>{
 it('keeps enough load context, supports overview and avoids blocked camera positions',()=>{
  const f=fixture(),c=f.h.snapshot().cranes![0],load=craneCameraPose(c,f.cargo,DEFAULT_CRANE_CAMERA);expect(load.distance).toBe(280);expect(load.target).toMatchObject({x:1096,y:1000,z:28});
  const overview=craneCameraPose(c,f.cargo,{...DEFAULT_CRANE_CAMERA,mode:'overview'});expect(overview.distance).toBeGreaterThan(load.distance);expect(overview.target.z).toBeGreaterThan(load.target.z);
  let queries=0;const clear=craneCameraPose(c,f.cargo,DEFAULT_CRANE_CAMERA,()=>++queries===1?40:undefined);expect(queries).toBe(2);expect(clear.distance).toBe(280);
 });
 it('replicates continuous motion without durable world patches and interpolates across the wrap',()=>{
  const f=fixture(),sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),snapshot=sim.createSnapshot();snapshot.friends!.building={revision:1,guestsCanBuild:true,pieces:f.pieces};snapshot.friends!.hauling=f.h.snapshot();
  const host=new FriendsWorldHost(),guest=new FriendsWorldGuest((m:any)=>{if(m.kind==='ack')host.acknowledge('guest',m.epoch,m.revision);},()=>{});host.update(snapshot);host.pump(['guest'],0,(_id,p)=>{guest.receive(p,0);return true;},()=>{});
  f.command('crane_left');f.run(2000);const next={...snapshot,friends:{...snapshot.friends!,building:{...snapshot.friends!.building!,pieces:resolveFriendsBuildPieces(f.pieces,[],f.h.getCraneAngles())},hauling:f.h.snapshot()}};
  host.update(next);let packets=0;host.pump(['guest'],1000,()=>{packets++;return true;},()=>{});expect(packets).toBe(0);
  const decoded=guest.decode(host.motion('guest',next))!;expect(decoded.friends!.building!.pieces[2].y).toBeCloseTo(next.friends.building.pieces[2].y);
  const a=structuredClone(next),b=structuredClone(next);a.friends!.hauling!.cranes![0].angle=3.1;b.friends!.hauling!.cranes![0].angle=-3.1;const middle=interpolateCoopSnapshot(a,b,.5);expect(Math.abs(middle.friends!.hauling!.cranes![0].angle!)).toBeCloseTo(Math.PI);const member=middle.friends!.building!.pieces[2];expect(member.x).toBeCloseTo(904,1);
 });
});

describe('ground crew crane hooks',()=>{
 it('attaches and detaches beside the hook without stealing the operator lease',()=>{
  const f=fixture(),crew={...actor,id:'crew',x:1096,y:1080,z:0};f.command('crane_takeover');const before=f.h.snapshot().cranes![0];
  expect(f.h.controlCrane(crew,10,'crane_hook_connect',f.env,false,500).ok).toBe(true);expect(f.h.snapshot().cranes![0]).toMatchObject({cargoId:'lantern-core',operatorId:'host',leaseUntilMs:before.leaseUntilMs});
  expect(f.h.controlCrane(crew,10,'crane_left',f.env,false,500).ok).toBe(false);
  expect(f.command('crane_raise').ok).toBe(true);
  expect(f.h.controlCrane(crew,10,'crane_hook_release',f.env,false,500).ok).toBe(true);expect(f.h.snapshot().cranes![0]).toMatchObject({operatorId:'host',mode:'hold'});expect(f.h.snapshot().cranes![0].cargoId).toBeUndefined();
 });
 it('requires a living crew member beside a clear, aligned hook and refuses remote detach',()=>{
  const f=fixture(),crew={...actor,id:'crew',x:1096,y:1080,z:0};f.command('crane_connect');
  expect(f.h.controlCrane({...crew,y:1400},10,'crane_hook_release',f.env,true,0).ok).toBe(false);
  expect(f.h.controlCrane({...crew,lifeState:'downed'},10,'crane_hook_release',f.env,true,0).ok).toBe(false);
  expect(f.h.controlCrane(crew,10,'crane_hook_release',{...f.env,blocked:()=>true},true,0).ok).toBe(false);expect(f.h.snapshot().cranes![0].cargoId).toBe('lantern-core');
 });
});

describe('moving crane contact cache',()=>{
 it('updates authored yaw contacts without recreating voxel bodies',async()=>{
  const {FriendsCargoPhysics}=await import('./FriendsCargoPhysics'),f=fixture(),physics=new FriendsCargoPhysics();let angle=0;
  f.env.dynamicColliders=()=>[{buildId:11,x:1072,y:1000,z:48,w:96,d:20,h:20,angle}];physics.prepare(f.cargo,f.env);const terrain=physics['terrain'],body=[...physics['movingBuilds'].values()][0],count=physics.world.bodies.length;
  angle=.6;physics.prepare(f.cargo,f.env);expect([...physics['movingBuilds'].values()][0]).toBe(body);expect(body.quaternion.z).toBeCloseTo(Math.sin(.3));expect(physics['terrain']).toBe(terrain);expect(physics.world.bodies).toHaveLength(count);
 });
});

describe('crew clearance during vertical lifting',()=>{
 it('stalls the winch beneath a crew member without moving them',()=>{
  const f=fixture(),crew={...actor,id:'crew',x:1096,y:1000,z:200},before={...crew};f.command('crane_connect');f.command('crane_raise');f.run(5000,[actor,crew]);expect(f.cargo.z+48).toBeLessThanOrEqual(200.1);expect(f.h.snapshot().cranes![0]).toMatchObject({mode:'hold',blocked:true});expect(crew).toEqual(before);
 });
});
