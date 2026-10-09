import { describe,it,expect } from 'vitest';
import { FriendsRetreats,retreatSwitchPrompt,retreatSeatPrompt } from './FriendsRetreats';
import { RETREAT_SEATS,RETREAT_SITES,STILLWATER,RETREAT_SWITCH,retreatPoint,retreatFloor,retreatCeiling,collideRetreats } from '../world/FriendsRetreatSites';
import { FriendsTerrain,TERRAIN_GENERATION } from '../world/FriendsTerrain';
import { FriendsSimulation } from './FriendsSimulation';
import { quantizeAngle,quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { FriendsWorldHost,FriendsWorldGuest } from './FriendsWorldReplication';
import { exportFriendsWorld } from './FriendsWorldStorage';
import type { ScenicActor } from './FriendsScenicService';
const active=RETREAT_SITES.map(s=>s.id);
const seat=RETREAT_SEATS.find(s=>s.siteId===STILLWATER.id)!;
const actor=(id:string,s=seat):ScenicActor&{angle:number}=>({id,x:s.x,y:s.y,z:s.z-16,angle:s.angle,lifeState:'alive'});
const input=(sequence:number,angle=0,action=0)=>({type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:sequence*50,movement:0,aimAngle:quantizeAngle(angle),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,interactActionId:action});
describe('quiet places',()=>{
  it('supports the room floor, real doorway, solid windows and ceiling with shared geometry',()=>{
    const floor=retreatPoint(STILLWATER,0,-12);expect(retreatFloor(floor,active)).toBe(STILLWATER.z);
    expect(retreatCeiling(floor,active)).toBe(STILLWATER.z+76);
    const door=retreatPoint(STILLWATER,-72,-12);const open={x:door.x,y:door.y};expect(collideRetreats(open,door.z,13,active)).toBe(false);
    const pane=retreatPoint(STILLWATER,0,-56,20);expect(collideRetreats({...pane},pane.z,13,active)).toBe(true);
    expect(retreatFloor(floor,[])).toBeUndefined();
  });
  it('claims adjacent seats atomically, keeps them off train snapshots, stands safely and releases on death',()=>{
    const sim=new FriendsSimulation([{id:'a',label:'A',color:'#fff'},{id:'b',label:'B',color:'#fff'}]);
    const a=sim['players'].get('a')!,b=sim['players'].get('b')!;Object.assign(a,actor('a'));Object.assign(b,actor('b'));
    sim.setInput('a',input(1,seat.angle,1));sim.setInput('b',input(1,seat.angle,1));sim.tick(50);
    expect(a.friendsSeat?.vehicleId).toBe(STILLWATER.id);expect(b.friendsSeat?.vehicleId).toBe(STILLWATER.id);expect(a.friendsSeat!.index).not.toBe(b.friendsSeat!.index);
    for(let i=2;i<8;i++){sim.setInput('a',{...input(i),movement:1});sim.tick(50);}
    expect(a.x).toBe(seat.x);expect(a.z).toBe(seat.z);expect(sim.createSnapshot().friends!.scenicRailway!.seats).toEqual([]);
    sim.setInput('a',{...input(8),jumpPressed:true});sim.tick(50);expect(a.friendsSeat).toBeUndefined();expect(a.crouching).toBe(false);
    b.lifeState='downed';sim['friends']!.retreats.update([b],new Set());expect(b.friendsSeat).toBeUndefined();
  });
  it('cannot claim seats through a wall or reserve seats while flying',()=>{
    const r=new FriendsRetreats(),p=actor('outside');Object.assign(p,retreatPoint(STILLWATER,0,62));
    expect(r.interact(p,[p],new FriendsTerrain())).toBe(false);
    const flying={...actor('flight'),friendsDevFlight:true};expect(retreatSeatPrompt(flying,[],r.state)).toBeUndefined();
  });
  it('requires a nearby aimed switch interaction and ignores repeated network actions',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'H',color:'#fff'}]),p=sim['players'].get('host')!;
    Object.assign(p,retreatPoint(STILLWATER,-50,0),{angle:STILLWATER.angle+Math.PI});
    const angle=Math.atan2(RETREAT_SWITCH.y-p.y,RETREAT_SWITCH.x-p.x);
    expect(retreatSwitchPrompt({...p,angle:angle+Math.PI},sim['friends']!.retreats.state)).toBeUndefined();
    sim.setInput('host',input(1,angle,1));sim.tick(50);expect(sim['friends']!.retreats.state.lightsOn).toBe(false);
    for(let i=2;i<=5;i++){sim.setInput('host',input(i,angle,1));sim.tick(50);}
    expect(sim['friends']!.retreats.state.switchSerial).toBe(1);
    sim.setInput('host',input(6,angle,2));sim.tick(50);expect(sim['friends']!.retreats.state.lightsOn).toBe(true);
    Object.assign(p,{x:STILLWATER.x+1000});sim.setInput('host',input(7,angle,3));sim.tick(50);expect(sim['friends']!.retreats.state.switchSerial).toBe(2);
  });
  it('saves an off switch, migrates old saves and preserves nearby terrain edits',()=>{
    const r=new FriendsRetreats({version:1,lightsOn:false});expect(new FriendsRetreats(r.save()).state.lightsOn).toBe(false);
    expect(new FriendsRetreats().state.lightsOn).toBe(true);
    const snapshot={generation:TERRAIN_GENERATION,revision:1,edits:[[Math.floor(STILLWATER.x/32),Math.floor(STILLWATER.y/32),Math.floor(STILLWATER.z/32),0] as [number,number,number,0]]};
    const terrain=new FriendsTerrain(snapshot);r.configure([],terrain);expect(r.state.active).not.toContain(STILLWATER.id);expect(terrain.snapshot().edits).toEqual(snapshot.edits);
  });
  it('replicates switch state through motion and recovers it through persistent world storage',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'H',color:'#fff'}]),host=new FriendsWorldHost();let ack:any;
    const guest=new FriendsWorldGuest(m=>{ack=m;},()=>{}),first=sim.createSnapshot();
    host.update(first);host.pump(['guest'],0,(_id,packet)=>{guest.receive(packet,0);return true;},message=>{throw Error(message);});
    host.acknowledge('guest',ack.epoch,ack.revision);sim['friends']!.retreats.state.lightsOn=false;
    const next=sim.createSnapshot(),decoded=guest.decode(host.motion('guest',next));expect(decoded?.friends?.retreats?.lightsOn).toBe(false);
    const saved=JSON.parse(exportFriendsWorld({...next.friends!,building:next.friends!.building!,progress:next.friends!.progress}));
    expect(saved.transport.retreats.lightsOn).toBe(false);expect(saved.transport.retreats).not.toHaveProperty('seats');
    const restored=new FriendsSimulation([{id:'host',label:'H',color:'#fff'}],undefined,saved.progress,saved.building,saved.projects,saved.frontier,saved.transport);expect(restored['friends']!.retreats.state.lightsOn).toBe(false);
  });
});

import { retreatPaths,retreatPathFloor,retreatWorkReserved } from '../world/FriendsRetreatPaths';
import { friendsInteractionTarget } from './FriendsInteractionTargeting';
describe('quiet-place approaches and protection',()=>{
  it('provides continuous, terrain-clear approaches and matching host/client support',()=>{
    const terrain=new FriendsTerrain();
    for(const path of retreatPaths()){
      expect(path.points[0].z-path.points[0].ground).toBeLessThanOrEqual(8.001);
      for(let i=0;i<path.points.length;i++){
        const p=path.points[i];expect(retreatPathFloor(p,active)).toBeCloseTo(p.z,4);
        expect(terrain.collide({x:p.x,y:p.y},p.z,13,50,8),`${path.siteId} point ${i}`).toBe(false);
        if(i)expect(Math.abs(p.z-path.points[i-1].z)).toBeLessThanOrEqual(8.001);
      }
      expect(retreatPathFloor(path.points[0],[])).toBeUndefined();
    }
  });
  it('protects active room support with clear tool feedback, leaves skipped sites editable and preserves saved construction',()=>{
    const r=new FriendsRetreats(),terrain=new FriendsTerrain(),point=retreatPoint(STILLWATER,0,0);
    expect(retreatWorkReserved({...point,z:point.z-24},active)).toBe(true);
    const ray={...point,z:point.z+100,dx:0,dy:0,dz:-1};
    expect(friendsInteractionTarget(terrain,ray,2,[],[],true,undefined,false,active)?.reason).toContain('quiet place');
    expect(friendsInteractionTarget(terrain,ray,2,[],[],true,undefined,false,[])?.valid).toBe(true);
    const build={id:999,author:'Builder',ownerId:'builder',ownerColor:'#fff',shape:'cube' as const,finish:'timber' as const,rotation:0,x:point.x,y:point.y,z:point.z,revision:1};
    expect(r.constructionConflict({...point,w:32,d:32,h:64})).toBe(true);r.configure([build],terrain);
    expect(r.state.active).not.toContain(STILLWATER.id);expect(build.id).toBe(999);
  });
});


import { FriendsBuilding } from './FriendsBuilding';
it('supports a full five-player fire gathering and lets every seat stand clear of the flame',()=>{
  const r=new FriendsRetreats(),terrain=new FriendsTerrain(),seats=RETREAT_SEATS.filter(s=>s.siteId==='saltwind-camp'),crew=seats.map((s,i)=>actor('crew-'+i,s));
  for(const p of crew)expect(r.interact(p,crew,terrain)).toBe(true);
  expect(new Set(crew.map(p=>p.friendsSeat!.index)).size).toBe(5);
  for(const p of crew){expect(r.stand(p,crew,terrain)).toBe(true);expect(Math.hypot(p.x-RETREAT_SITES[3].x,p.y-RETREAT_SITES[3].y)).toBeGreaterThan(31);}
});
it('rejects group construction and undo restoration before committing into a reserved site',()=>{
  const b=new FriendsBuilding(),a={id:'builder',label:'Builder',x:STILLWATER.x+200,y:STILLWATER.y,z:0,lifeState:'alive'},pose={x:STILLWATER.x,y:STILLWATER.y,z:0,rotation:0};
  expect(b.request(a,{requestId:1,action:'place',shape:'cube',finish:'timber',pose},a.id,[]).ok).toBe(true);
  const piece=b.getPieces()[0];expect(b.request(a,{requestId:2,action:'remove',pieceId:piece.id,expectedRevision:piece.revision},a.id,[]).ok).toBe(true);
  b.placementGuard=()=> 'Keep the quiet place clear.';
  expect(b.request(a,{requestId:3,action:'undo'},a.id,[]).message).toContain('quiet place');
  expect(b.request(a,{requestId:4,action:'place_group',shape:'cube',finish:'timber',poses:[pose]},a.id,[]).message).toContain('quiet place');
  expect(b.getPieces()).toEqual([]);
});
