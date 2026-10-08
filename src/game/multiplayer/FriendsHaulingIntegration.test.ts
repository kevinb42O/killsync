import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { railSimulation } from './friendsRailTestFixtures';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { compactSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';
import { interpolateCoopSnapshot } from './snapshotInterpolation';
import { SALVAGE_CORE_SPAWN, securedCargoPose, cargoInDeliveryBay } from './FriendsHauling';
import { FRIENDS_DELIVERY_BAY } from '../world/FriendsHaulingGoal';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
const seeds=[{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Friend',color:'#f90'}];
const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:quantizeAngle(0),aimPitch:quantizePitch(0),friendsTool:5,selectedSlot:0,firing:false,fireActionId:0,interactActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
function flatFixture(){
  const s=railSimulation(seeds),v=s.createSnapshot().friends!.vehicles[0],c=s['friends']!.hauling.getCargo()[0],p=s['players'].get('host')!;
  Object.assign(c,{x:v.x,y:v.y+200,z:0,angle:0,vx:0,vy:0,vz:0,spin:0,secured:undefined});
  Object.assign(p,{x:c.x-120,y:c.y,z:0,angle:0,verticalVelocity:0});return {s,p,c};
}
describe('hauling in the authoritative Friends game',()=>{
  it('hauls an unloaded core across the final home-deck leg and delivers through the shared F interaction',()=>{
    const s=new FriendsSimulation([seeds[0]]),c=s['friends']!.hauling.getCargo()[0],p=s['players'].get('host')!,goal=FRIENDS_DELIVERY_BAY;
    Object.assign(c,{x:goal.x+120,y:goal.y,z:goal.z});
    Object.assign(p,{x:c.x-120,y:c.y,z:c.z,angle:0,verticalVelocity:0});
    s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);
    expect(s.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);
    let sequence=2;
    for(;sequence<502&&!cargoInDeliveryBay(c);sequence++){
      s.setInput('host',input(sequence,{movement:p.x>goal.x-24?2:0,aiming:p.x<=goal.x-24}));s.tick(50);
    }
    expect(cargoInDeliveryBay(c),JSON.stringify({cargo:c,player:{x:p.x,y:p.y,z:p.z}})).toBe(true);
    s.setInput('host',input(sequence++,{firing:true,fireActionId:2}));s.tick(50);
    for(let i=0;i<40;i++){s.setInput('host',input(sequence++));s.tick(50);}
    s.setInput('host',input(sequence++,{interactActionId:1}));s.tick(50);
    const snapshot=s.createSnapshot();expect(snapshot.friends!.hauling!.completedCargoIds,JSON.stringify({cargo:c,player:{x:p.x,y:p.y,z:p.z},feedback:snapshot.friends!.hauling!.feedback})).toContain(c.id);
    expect(snapshot.friends!.hauling!.delivered).toBe(false);
    expect(snapshot.friends!.hauling!.cargo).toHaveLength(3);
    const decoder=new SnapshotDecoder();expect(decoder.decode(compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot}),10)?.friends!.hauling!.completedCargoIds).toContain(c.id);
  });
  it('spawns the core on its dedicated platform 750m from the goal and keeps it stable at rest',()=>{
    const s=new FriendsSimulation(seeds),before=s.createSnapshot().friends!.hauling!.cargo[0],terrain=s['friendsFrontier']!.terrain;
    expect(before).toMatchObject(SALVAGE_CORE_SPAWN);
    expect(Math.hypot(before.x-FRIENDS_DELIVERY_BAY.x,before.y-FRIENDS_DELIVERY_BAY.y)/12).toBeCloseTo(750,0);
    for(const p of s.createSnapshot().players)expect(Math.hypot(before.x-p.x,before.y-p.y)).toBeGreaterThan(80);
    for(let dx=-96;dx<=96;dx+=32)for(let dy=-96;dy<=96;dy+=32){
      expect(terrain.floor(before.x+dx,before.y+dy,6000,0)).toBe(before.z);
      expect(s['friendsFrontier']!.collideTrees({x:before.x+dx,y:before.y+dy},before.z,20)).toBe(false);
    }
    expect(terrain.collide({x:before.x,y:before.y},before.z,20,48,8)).toBe(false);
    for(let i=0;i<100;i++)s.tick(50);
    const settled=s.createSnapshot().friends!.hauling!.cargo[0];
    expect(Math.hypot(settled.x-before.x,settled.y-before.y)).toBeLessThan(48);expect(settled.z).toBeCloseTo(before.z,0);
    expect(Math.hypot(settled.vx,settled.vy,settled.vz,settled.spin)).toBe(0);
    for(let i=0;i<20;i++)s.tick(50);expect(s.createSnapshot().friends!.hauling!.cargo[0]).toEqual(settled);
  });
  it.each([0,Math.PI/2,Math.PI,-Math.PI/2])('allows hauling the remote core along the actual terrain at angle %s',angle=>{
    const s=new FriendsSimulation([seeds[0]]),c=s['friends']!.hauling.getCargo()[0],p=s['players'].get('host')!,start={x:c.x,y:c.y};
    Object.assign(p,{x:c.x-Math.cos(angle)*120,y:c.y-Math.sin(angle)*120,z:c.z,angle,verticalVelocity:0});
    s.setInput('host',input(1,{aimAngle:quantizeAngle(angle),firing:true,fireActionId:1}));s.tick(50);
    expect(s.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);
    for(let i=2;i<=61;i++){s.setInput('host',input(i,{aimAngle:quantizeAngle(angle),movement:2}));s.tick(50);}
    expect(Math.hypot(c.x-start.x,c.y-start.y)).toBeGreaterThan(20);
  });
  it('lets the load leave the remote pickup deck and descend onto the homeward terrain',()=>{
    const s=new FriendsSimulation([seeds[0]]),c=s['friends']!.hauling.getCargo()[0],p=s['players'].get('host')!,start={...c};
    Object.assign(p,{x:c.x-120,y:c.y,z:c.z,angle:0,verticalVelocity:0});
    s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);
    for(let i=2;i<=161;i++){s.setInput('host',input(i,{movement:2}));s.tick(50);}
    expect(c.x,JSON.stringify(c)).toBeLessThan(start.x-180);
    expect(c.z,JSON.stringify(c)).toBeLessThan(start.z-16);
  });
  it('resets the core at every game start from old and current saves while preserving other world progress',()=>{
    const original=new FriendsSimulation(seeds).createSnapshot().friends!,old=structuredClone(original.transport!);
    delete old.hauling!.spawnRevision;old.hauling!.delivered=true;
    Object.assign(old.hauling!.cargo[0],{x:6272,y:5056,z:-512,orientation:[.5,.5,.5,.5],secured:{vehicleId:'sunline-0',x:20,y:0,angle:0},vx:100});
    const restored=new FriendsSimulation(seeds,1,original.progress,original.building,original.projects,original.frontier,old),f=restored.createSnapshot().friends!,c=restored['friends']!.hauling.getCargo()[0];
    expect(c).toMatchObject({...SALVAGE_CORE_SPAWN,vx:0,vy:0,vz:0,spin:0});expect(c.secured).toBeUndefined();expect(c.orientation).toBeUndefined();
    expect(f.hauling!.delivered).toBe(false);expect(f.progress).toEqual(original.progress);expect(f.building!.pieces).toEqual(original.building!.pieces);
    c.x+=64;const moved=restored.createSnapshot().friends!;
    const reloaded=new FriendsSimulation(seeds,1,moved.progress,moved.building,moved.projects,moved.frontier,moved.transport).createSnapshot().friends!;
    expect(reloaded.hauling!.cargo[0]).toMatchObject({...SALVAGE_CORE_SPAWN,angle:0,vx:0,vy:0,vz:0,spin:0});
    expect(reloaded.hauling!.cargo[0].secured).toBeUndefined();expect(reloaded.hauling!.ropes).toHaveLength(0);
  });
  it('keeps the load in place when another player joins or returns home during the active game',()=>{
    const s=new FriendsSimulation([seeds[0]]),c=s['friends']!.hauling.getCargo()[0];c.x+=80;c.angle=.3;
    expect(s.addPlayer(seeds[1])).toBe(true);
    expect(s.friendsAction('host',{requestId:1,action:'home'}).ok).toBe(true);
    expect(c.x).toBe(SALVAGE_CORE_SPAWN.x+80);expect(c.angle).toBe(.3);
  });
  it('consumes trigger edges once, preserves terrain and weapons, and lets guests attach without building permission',()=>{
    const {s,p,c}=flatFixture();s.setFriendsGuestAccess(false);
    s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);
    expect(s.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);
    for(let i=2;i<8;i++){s.setInput('host',input(i,{firing:true,fireActionId:1}));s.tick(50);}
    expect(s.createSnapshot().friends!.hauling!.ropes).toHaveLength(1);expect(s.createSnapshot().projectiles).toHaveLength(0);
    const guest=s['players'].get('guest')!;Object.assign(guest,{x:p.x,y:c.y+12,z:0,angle:0});
    s.setInput('guest',input(1,{firing:true,fireActionId:1}));s.tick(50);expect(s.createSnapshot().friends!.hauling!.ropes).toHaveLength(2);
    s.setInput('host',input(8,{firing:true,fireActionId:2}));s.tick(50);expect(s.createSnapshot().friends!.hauling!.ropes.map(r=>r.id)).toEqual(['guest']);
  });
  it('replicates cargo and ropes through compact keyframes and deltas without mutating earlier snapshots',()=>{
    const {s,c}=flatFixture(),before=s.createSnapshot(),decoder=new SnapshotDecoder();
    decoder.decode(compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot:before}),10);
    s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);const next=s.createSnapshot();
    const decoded=decoder.decode(compactSnapshotWirePayload(createSnapshotDelta(before,next,10)),11)!;
    expect(decoded.friends!.hauling).toEqual(JSON.parse(JSON.stringify(next.friends!.hauling)));
    c.x+=30;expect(before.friends!.hauling!.cargo[0].x).not.toBe(c.x);expect(before.friends!.hauling!.ropes).toHaveLength(0);
  });
  it('saves the active load for snapshots but resets it when starting another game',()=>{
    const {s,c}=flatFixture();s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);c.x+=50;
    const f=s.createSnapshot().friends!,restored=new FriendsSimulation(seeds,1,f.progress,f.building,f.projects,f.frontier,JSON.parse(JSON.stringify(f.transport)));
    expect(f.hauling!.cargo[0].x).toBe(c.x);
    expect(restored.createSnapshot().friends!.hauling!.cargo[0]).toMatchObject(SALVAGE_CORE_SPAWN);expect(restored.createSnapshot().friends!.hauling!.ropes).toHaveLength(0);
  });
  it('secures through F, prevents dismantling loaded trains and releases through F',()=>{
    const {s,c,p}=flatFixture();s['friends']!.controlTrain('train_hold');const v=s['friends']!.vehicles()[0];
    Object.assign(c,{x:v.x,y:v.y,z:v.z});Object.assign(p,{x:v.x,y:v.y+48,z:v.z});
    s.setInput('host',input(1,{interactActionId:1}));s.tick(50);expect(c.secured?.vehicleId).toBe(v.id);
    expect(s['friends']!.removeTrain([])).toMatch(/Unload/);
    s.setInput('host',input(2,{interactActionId:2}));s.tick(50);expect(c.secured).toBeUndefined();
  });
  it('interpolates secured cargo in the same frame as its turning carriage',()=>{
    const {s,c}=flatFixture(),v=s['friends']!.vehicles()[0];Object.assign(c,{x:v.x+15,y:v.y,z:v.z,secured:{vehicleId:v.id,x:15,y:0,angle:0}});
    const before=s.createSnapshot(),next=structuredClone(before),nv=next.friends!.vehicles.find(n=>n.id===v.id)!;
    nv.x+=120;nv.angle+=Math.PI/2;nv.z+=64;
    Object.assign(next.friends!.hauling!.cargo[0],securedCargoPose(next.friends!.hauling!.cargo[0],[nv]));
    const frame=interpolateCoopSnapshot(before,next,.5),fv=frame.friends!.vehicles.find(n=>n.id===v.id)!,load=frame.friends!.hauling!.cargo[0];
    expect(load.x).toBeCloseTo(fv.x+Math.cos(fv.angle)*15);expect(load.y).toBeCloseTo(fv.y+Math.sin(fv.angle)*15);expect(load.z).toBe(fv.z);
  });
  it('keeps a tethered guest on the host timeline instead of replaying movement through the load',()=>{
    const {s,p}=flatFixture();s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);const frame=s.createSnapshot(),prediction=new LocalPlayerPrediction('host');
    prediction.reconcile(frame);prediction.step(input(2,{movement:1}));const shown=prediction.present(frame,input(2,{movement:1}),15,16);
    expect(shown.players.find(n=>n.id==='host')!.x).toBe(p.x);
  });
  it('releases stale input tethers without affecting inventory cargo',()=>{
    const {s}=flatFixture();s.setInput('host',input(1,{firing:true,fireActionId:1}));s.tick(50);const inventory=s.createSnapshot().friends!.frontier!.cargo;
    for(let i=0;i<40;i++)s.tick(50);
    expect(s.createSnapshot().friends!.hauling!.ropes).toHaveLength(0);expect(s.createSnapshot().friends!.frontier!.cargo).toEqual(inventory);
  });
});
