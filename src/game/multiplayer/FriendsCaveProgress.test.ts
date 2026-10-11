import {describe,it,expect} from 'vitest';
import {FriendsSimulation} from './FriendsSimulation';
import {FriendsExpedition,normalizeFriendsProgress,nearbyFriendsCaveTreasure} from './FriendsExpedition';
import {CAVE_TREASURES} from '../world/FriendsCave';
import {CAVE_LEGACY_REWARDS} from '../world/FriendsCaveLegacyRewards';
import {CAVE_LIFTS,CAVE_LAVA,nearbyCaveLift} from '../world/FriendsCaveDescent';
import {FriendsTerrain} from '../world/FriendsTerrain';
import {MULTIPLAYER_PROTOCOL_VERSION,clampInputFrame,type MultiplayerInputFrame} from './protocol';
import {SnapshotDecoder,compactSnapshotWirePayload} from './snapshotReplication';
import {LocalPlayerPrediction} from './LocalPlayerPrediction';
import {CoopSnapshotInterpolator,interpolateCoopSnapshot} from './snapshotInterpolation';
import type {FriendsBuildPiece} from './FriendsBuilding';
import {FriendsWorldHost,FriendsWorldGuest} from './FriendsWorldReplication';
const seeds=[{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Guest',color:'#aaa'}];
const input=(sequence:number):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,aimPitch:0,selectedSlot:0,interactActionId:sequence,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
describe('shared descent discoveries and return routes',()=>{
 it('does not recover a discovery through a player-built wall',()=>{
  const reward=CAVE_TREASURES.find(t=>t.id==='descent-forge-cache')!,terrain=new FriendsTerrain(),expedition=new FriendsExpedition(undefined,undefined,terrain);
  const player={id:'guest',x:reward.x-96,y:reward.y,z:reward.z,lifeState:'alive'};
  const wall:FriendsBuildPiece={id:1,x:reward.x-48,y:reward.y,z:reward.z,rotation:1,shape:'wall',finish:'teal',author:'host',revision:1};
  expect(nearbyFriendsCaveTreasure(player,[],terrain,[wall])).toBeUndefined();
  expect(nearbyFriendsCaveTreasure(player,[],terrain,[{...wall,z:wall.z-160}])?.id).toBe(reward.id);
  expect(expedition.interact(player,0,[wall])).toBeUndefined();expect(expedition.progress.openedTreasures).not.toContain(reward.id);
  expect(expedition.interact(player,1,[])).toBe('treasure');expect(expedition.progress.openedTreasures).toContain(reward.id);
 });
 it('preserves guest work planes throughout the new dungeon depth',()=>{
  for(const value of [-896,-2560,-4032])expect(clampInputFrame({...input(1),friendsWorkPlane:{axis:2,value}}).friendsWorkPlane).toEqual({axis:2,value});
  expect(clampInputFrame({...input(1),friendsWorkPlane:{axis:2,value:-5000}}).friendsWorkPlane).toBeUndefined();
 });
 it('selects and safely uses every unlocked shortcut in both directions',()=>{
  const claims=CAVE_LIFTS.map(l=>l.claim),terrain=new FriendsTerrain();
  const e=new FriendsExpedition(normalizeFriendsProgress({openedTreasures:claims}),undefined,terrain);
  for(const lift of CAVE_LIFTS){
   const p={id:'guest',x:lift.x,y:lift.y,z:lift.z,lifeState:'alive'};
   expect(nearbyCaveLift(p,claims)?.id,lift.id).toBe(lift.id);
   expect(e.interact(p,0),lift.id).toBe('caveLift');expect(p,lift.id).toMatchObject(lift.destination);
  }
 });
 it('rejects a landing with terrain touching the body edge or a built wall',()=>{
  const lift=CAVE_LIFTS[0],d=lift.destination,terrain=new FriendsTerrain();
  const e=new FriendsExpedition(normalizeFriendsProgress({openedTreasures:[lift.claim]}),undefined,terrain);
  const p={id:'guest',x:lift.x,y:lift.y,z:lift.z,lifeState:'alive'};
  const wall:FriendsBuildPiece={...d,id:1,shape:'wall',finish:'teal',author:'host',revision:1,rotation:0};
  expect(e.interact(p,0,[wall])).toBeUndefined();expect(p.z).toBe(lift.z);
  terrain.set(Math.floor((d.x+20)/32),Math.floor(d.y/32),Math.floor(d.z/32),2);
  expect(e.interact(p,0)).toBeUndefined();expect(p.z).toBe(lift.z);
 });
 it('recovers beside an obstructed lava ledge and clears old flight and jump motion',()=>{
  const lava=CAVE_LAVA[2],terrain=new FriendsTerrain(),e=new FriendsExpedition(undefined,undefined,terrain);
  const wall:FriendsBuildPiece={...lava.safe,id:1,shape:'wall',finish:'teal',author:'host',revision:1,rotation:0};
  const p={id:'guest',x:lava.x,y:lava.y,z:lava.z,lifeState:'alive',friendsSoaring:{phase:'flying'},velocityX:500,verticalVelocity:-700,jumpBufferMs:100,slideMs:100,swimming:true};
  expect(e.recoverCaveLava(p,0,[wall])).toBe(true);expect(p.x).not.toBe(lava.safe.x);
  expect(p).toMatchObject({velocityX:0,verticalVelocity:0,jumpBufferMs:0,slideMs:0,swimming:false});expect(p.friendsSoaring).toBeUndefined();
 });
 it('preserves health and discoveries when every local lava ledge is obstructed',()=>{
  const lava=CAVE_LAVA[2],sim=new FriendsSimulation(seeds,1,normalizeFriendsProgress({openedTreasures:['descent-crystal-cache']}));
  const walls:FriendsBuildPiece[]=[[0,0],[-64,0],[64,0],[0,-64],[0,64],[-96,-64],[96,-64],[0,-128]].map(([dx,dy],i)=>({...lava.safe,x:lava.safe.x+dx,y:lava.safe.y+dy,id:i+1,shape:'wall',finish:'teal',author:'host',revision:1,rotation:0}));
  const player=sim['players'].get('guest')!;Object.assign(player,{x:lava.x,y:lava.y,z:lava.z});
  expect(sim['friends']!.recoverCaveLava(player,0,walls)).toBe(true);
  expect(player).toMatchObject({x:6500,y:5488,z:704,health:player.maxHealth,lifeState:'alive'});
  expect(sim.createSnapshot().friends!.progress.openedTreasures).toContain('descent-crystal-cache');
 });
 it('snaps a guest shortcut on the wire and discards pre-teleport predicted movement',()=>{
  const lift=CAVE_LIFTS[0],sim=new FriendsSimulation(seeds,1,normalizeFriendsProgress({openedTreasures:[lift.claim]}));
  Object.assign(sim['players'].get('guest')!,{x:lift.x,y:lift.y,z:lift.z});
  const previous=sim.createSnapshot(),prediction=new LocalPlayerPrediction('guest');prediction.reconcile(previous);
  for(let i=1;i<=4;i++)prediction.step({...input(i),movement:1});
  sim.setInput('guest',input(1));sim.tick(50);
  const current=new SnapshotDecoder().decode(compactSnapshotWirePayload(sim.createSnapshot()),1)!;
  expect(current.combatEvents.some(e=>e.kind==='player_redeployed'&&e.playerId==='guest')).toBe(true);
  const interpolation=new CoopSnapshotInterpolator();
  for(const frame of [interpolateCoopSnapshot(previous,current,.25),interpolation.interpolate(previous,current,.25)])expect(frame.players.find(p=>p.id==='guest')).toMatchObject(lift.destination);
  prediction.reconcile(current);expect(prediction['pending']).toHaveLength(0);
  expect(prediction.present(current,input(5),0,0).players.find(p=>p.id==='guest')).toMatchObject(lift.destination);
 });
 it('replicates discoveries and supplies through durable deltas and a late-join baseline',()=>{
  const sim=new FriendsSimulation(seeds),host=new FriendsWorldHost(),guests=new Map<string,FriendsWorldGuest>();
  const add=(id:string)=>guests.set(id,new FriendsWorldGuest(message=>{const m=message as {kind:string;epoch:string;revision:number};if(m.kind==='ack')host.acknowledge(id,m.epoch,m.revision);else host.request(id);},()=>{}));
  const sync=(now:number)=>{const snapshot=sim.createSnapshot();host.update(snapshot);host.pump([...guests.keys()],now,(id,packet)=>{guests.get(id)!.receive(packet,now);return true;},message=>{throw new Error(message);});return snapshot;};
  add('guest');sync(0);
  const reward=CAVE_TREASURES.find(t=>t.id==='descent-crystal-cache')!;
  Object.assign(sim['players'].get('host')!,{x:reward.x,y:reward.y,z:reward.z});sim.setInput('host',input(1));sim.tick(50);
  let snapshot=sync(1000),state=guests.get('guest')!.decode(host.motion('guest',snapshot));
  expect(state!.friends!.progress.openedTreasures).toContain(reward.id);expect(state!.friends!.frontier!.stock).toEqual(snapshot.friends!.frontier!.stock);
  add('late');snapshot=sync(2000);state=guests.get('late')!.decode(host.motion('late',snapshot));
  expect(state!.friends!.progress.openedTreasures).toContain(reward.id);expect(state!.friends!.frontier!.stock).toEqual(snapshot.friends!.frontier!.stock);
 });
 it('preserves every historical chest claim and its exact gold after placements retire',()=>{
  const opened=Object.keys(CAVE_LEGACY_REWARDS),p=normalizeFriendsProgress({openedTreasures:[...opened,opened[0],'unknown'],caveGold:99999999});
  expect(p.openedTreasures).toEqual(opened);expect(p.caveGold).toBe(3_036_250);
  expect(normalizeFriendsProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
 });
 it('awards workshop materials and reinforced tools once when host and guest recover the forge together',()=>{
  const sim=new FriendsSimulation(seeds),reward=CAVE_TREASURES.find(t=>t.tools)!;
  for(const p of sim['players'].values())Object.assign(p,{x:reward.x,y:reward.y,z:reward.z});
  const before=sim.createSnapshot().friends!.frontier!.stock;
  sim.setInput('host',input(1));sim.setInput('guest',input(1));sim.tick(50);
  const after=sim.createSnapshot();expect(after.friends!.frontier!.stock.ingots).toBe(before.ingots+16);expect(after.friends!.frontier!.upgrades).toBe(1);
  expect(after.friends!.progress.openedTreasures).toEqual([reward.id]);
  const decoded=new SnapshotDecoder().decode(compactSnapshotWirePayload(after),1)!;expect(decoded.friends!.progress.openedTreasures).toEqual([reward.id]);
  sim.setInput('host',input(2));sim.setInput('guest',input(2));sim.tick(50);expect(sim.createSnapshot().friends!.frontier!.stock.ingots).toBe(before.ingots+16);
 });
 it('requires a discovery to use its shortcut and preserves that access on reload',()=>{
  const lift=CAVE_LIFTS[0],p={id:'host',x:lift.x,y:lift.y,z:lift.z,lifeState:'alive'},terrain=new FriendsTerrain();
  expect(nearbyCaveLift(p,[])).toBeUndefined();
  const e=new FriendsExpedition({version:1,discovered:[],signals:[],salvageCleared:false,restored:false,openedTreasures:[lift.claim]},undefined,terrain);
  const saved=e.snapshot().progress;const restored=new FriendsExpedition(saved,undefined,terrain);
  expect(restored.interact(p,0)).toBe('caveLift');expect(p).toMatchObject(lift.destination);
  const obstructed={id:'guest',x:lift.x,y:lift.y,z:lift.z,lifeState:'alive'};
  terrain.set(Math.floor(lift.destination.x/32),Math.floor(lift.destination.y/32),Math.floor((lift.destination.z+32)/32),2);
  expect(restored.interact(obstructed,1)).toBeUndefined();expect(obstructed.z).toBe(lift.z);
 });
 it('unlocks usable building finishes through discoveries and enforces them on the host',()=>{
  const sim=new FriendsSimulation(seeds),p=sim['players'].get('host')!,reward=CAVE_TREASURES.find(t=>t.id==='descent-crystal-cache')!;
  const terrain=sim['friendsFrontier']!.terrain;const ground=terrain.surfaceHeight(24112,24016);terrain.addGrade([24112,24016,ground,128]);
  const request={requestId:10,action:'place' as const,shape:'lamp' as const,finish:'crystal' as const,pose:{x:24112,y:24016,z:ground,rotation:0}};
  expect(sim.friendsBuild('host',request).message).toContain('Recover');
  Object.assign(p,{x:reward.x,y:reward.y,z:reward.z});sim.setInput('host',input(1));sim.tick(50);
  Object.assign(p,{x:24016,y:24016,z:ground});
  expect(sim.friendsBuild('host',{...request,requestId:11}).ok).toBe(true);
  const snapshot=sim.createSnapshot();expect(snapshot.friends!.building!.pieces.some(piece=>piece.finish==='crystal')).toBe(true);
  const restored=new FriendsSimulation(seeds,1,snapshot.friends!.progress,snapshot.friends!.building,undefined,snapshot.friends!.frontier);
  expect(restored.createSnapshot().friends!.building!.pieces.some(piece=>piece.finish==='crystal')).toBe(true);
 });
 it('returns a lava contact to a local ledge with full health and saved discoveries intact',()=>{
  const sim=new FriendsSimulation(seeds),p=sim['players'].get('host')!,lava=CAVE_LAVA[2];
  Object.assign(p,{x:lava.x,y:lava.y,z:lava.z-4});sim.tick(50);
  expect(p).toMatchObject(lava.safe);expect(p.health).toBe(p.maxHealth);expect(p.lifeState).toBe('alive');
 });
});
