import { describe, it, expect, vi } from 'vitest';
import { FriendsProjects, gardenWalkConnected } from './FriendsProjects';
import { exportFriendsWorld, parseFriendsWorldImport, saveFriendsWorld, readFriendsWorld, FRIENDS_WORLD_KEY } from './FriendsWorldStorage';
import { FriendsBuilding, friendsBuildFloor, friendsBuildCeiling, resolveFriendsBuildCollisions, friendsPlacementError, raycastFriendsBuild, getFriendsBuildPose, FRIENDS_BUILD_LIMIT, type FriendsBuildPiece } from './FriendsBuilding';
import { FriendsSimulation } from './FriendsSimulation';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { FRIENDS_AIRPAD, FRIENDS_HUB, FRIENDS_SALVAGE, insideFriendsCombat } from '../world/FriendsRegion';
import { compactSnapshotWirePayload, SnapshotDecoder } from './snapshotReplication';
import { encodeSnapshotPackets } from './snapshotTransport';
import { RAIL_STATIONS, railwayDistance, sampleTrainRoute, TRAIN_LOOP_LENGTH } from '../world/FriendsRailway';
const actor = { id: 'host', label: 'Host', x: 6150, y: 6144, z: 0, lifeState: 'alive' };
const piece = (shape: FriendsBuildPiece['shape'], extra: Partial<FriendsBuildPiece> = {}): FriendsBuildPiece => ({ id: 1, x: 6400, y: 6144, z: 0, rotation: 0, shape, finish: 'stone', author: 'Host', revision: 1, ...extra });
const pose = { x: 6400, y: 6144, z: 0, rotation: 0 };
describe('permanent Friends building', () => {
  it('stacks, shares and restores pieces without tactical charges or expiry', () => {
    const building = new FriendsBuilding();
    expect(building.request(actor, { requestId: 1, action: 'place', shape: 'cube', finish: 'stone', pose }, 'host', [actor]).ok).toBe(true);
    expect(building.request(actor, { requestId: 2, action: 'place', shape: 'cube', finish: 'timber', pose: { ...pose, z: 64 } }, 'host', [actor]).ok).toBe(true);
    expect(new FriendsBuilding(building.snapshot()).snapshot().pieces).toHaveLength(2);
    const s = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#8de6ce' }], 1, undefined, building.snapshot());
    for (let i = 0; i < 240; i++) s.tick(50);
    expect(s.createSnapshot().friends!.building!.pieces).toHaveLength(2);
  });
  it('rejects duplicates, occupied space, malformed poses, protected infrastructure and floating placement', () => {
    const b = new FriendsBuilding(), request = { requestId: 1, action: 'place' as const, shape: 'cube' as const, finish: 'stone' as const, pose };
    b.request(actor, request, 'host', [actor]); expect(b.request(actor, request, 'host', [actor]).ok).toBe(false); expect(b.snapshot().pieces).toHaveLength(1);
    expect(friendsPlacementError([], 'cube', { ...pose, x: NaN })).toBeTruthy();
    expect(friendsPlacementError([], 'cube', { ...pose, z: 64 })).toMatch(/Attach/);
    expect(friendsPlacementError([], 'cube', { ...pose, x: FRIENDS_AIRPAD.x, y: FRIENDS_AIRPAD.y })).toMatch(/bay/);
    const station = RAIL_STATIONS[0]; expect(friendsPlacementError([], 'cube', { ...pose, x: Math.round(station.x/4)*4, y: Math.round(station.y/4)*4 })).toBeUndefined();
    expect(friendsPlacementError([], 'cube', pose, actor, [{ ...actor, x: pose.x, y: pose.y }])).toMatch(/friend/);
  });
  it('protects a later edit from undo and enforces host-owned permissions', () => {
    const b = new FriendsBuilding(); b.request(actor, { requestId: 1, action: 'place', shape: 'cube', finish: 'stone', pose }, 'host', [actor]);
    const p = b.snapshot().pieces[0], guest = { ...actor, id: 'guest', label: 'Guest' };
    expect(b.request(guest, { requestId: 1, action: 'paint', pieceId: p.id, expectedRevision: p.revision, finish: 'rose' }, 'host', [actor,guest]).ok).toBe(true);
    expect(b.request(actor, { requestId: 2, action: 'undo' }, 'host', [actor]).ok).toBe(false);
    b.request(actor, { requestId: 3, action: 'permissions', allowed: false }, 'host', [actor]);
    expect(b.request(guest, { requestId: 2, action: 'permissions', allowed: true }, 'host', [actor]).ok).toBe(false);
    expect(b.request(guest, { requestId: 3, action: 'remove', pieceId: p.id, expectedRevision: 2 }, 'host', [actor]).ok).toBe(false);
  });
  it('undoes and redoes removal and placement without duplicating geometry', () => {
    const b = new FriendsBuilding(); b.request(actor, { requestId: 1, action: 'place', shape: 'cube', finish: 'stone', pose }, 'host', [actor]);
    b.request(actor, { requestId: 2, action: 'undo' }, 'host', [actor]); expect(b.snapshot().pieces).toHaveLength(0);
    b.request(actor, { requestId: 3, action: 'redo' }, 'host', [actor]); expect(b.snapshot().pieces).toHaveLength(1);
    const p=b.snapshot().pieces[0]; b.request(actor,{requestId:4,action:'remove',pieceId:p.id,expectedRevision:p.revision},'host',[actor]);
    b.request(actor,{requestId:5,action:'undo'},'host',[actor]); expect(b.snapshot().pieces).toHaveLength(1);
  });
  it('uses real ramp heights, door/window openings and distinct floors/ceilings', () => {
    const ramp=piece('ramp'); expect(friendsBuildFloor([ramp],6400,6144,16)).toBe(16);
    expect(friendsBuildFloor([ramp],6428,6144,32)).toBe(30);
    expect(friendsBuildFloor([ramp],6428,6144,0,0)).toBeUndefined();
    const door=piece('doorway'); const through={x:6400,y:6144}; expect(resolveFriendsBuildCollisions([door],through,0,19)).toBe(false);
    expect(resolveFriendsBuildCollisions([piece('window')],{x:6400,y:6144},0,19)).toBe(true);
    const slab=piece('slab',{z:128}); expect(friendsBuildFloor([slab],6400,6144,0)).toBeUndefined(); expect(friendsBuildCeiling([slab],6400,6144,0)).toBe(128);
    expect(friendsBuildFloor([slab],6400,6144,136)).toBe(136); expect(friendsBuildCeiling([slab],6400,6144,136)).toBeUndefined();
    expect(resolveFriendsBuildCollisions([slab],{x:6400,y:6144},0,19)).toBe(false);
  });
  it('ray-targets the actual ramp face and snaps thin panels to touching faces', () => {
    const ray={x:6400,y:6144,z:200,dx:0,dy:0,dz:-1}; expect(raycastFriendsBuild([piece('ramp')],ray)?.z).toBe(16);
    expect(getFriendsBuildPose([piece('cube')],ray,'slab',0)?.z).toBe(64);
    const side=getFriendsBuildPose([piece('cube')],{x:6400,y:6044,z:64,dx:0,dy:1,dz:0},'wall',0)!;
    expect(side.y).toBe(6108); expect(friendsPlacementError([piece('cube')],'wall',side)).toBeUndefined();
  });
  it('keeps a full static world beneath transport and queue bounds, with a decodable keyframe', () => {
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}]); const snap=s.createSnapshot();
    snap.friends!.building={revision:42,guestsCanBuild:true,pieces:Array.from({length:FRIENDS_BUILD_LIMIT},(_,i)=>piece('cube',{id:i+1,x:5000+i%32*64,y:6000+Math.floor(i/32)*64,revision:42}))};
    const encoded=JSON.stringify({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick:1,sentAt:0,payload:compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot:snap})});
    const packets=encodeSnapshotPackets(encoded,1); expect(packets.length).toBeGreaterThan(0); expect(packets.reduce((n,p)=>n+p.byteLength,0)).toBeLessThan(128000);
    expect(new SnapshotDecoder().decode(compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot:snap}),1)?.friends?.building?.pieces).toHaveLength(FRIENDS_BUILD_LIMIT);
  });
  it('keeps guest ramp movement in agreement with the host', () => {
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}]); const p=s['players'].get('host')!;
    Object.assign(p,{x:6350,y:6144,z:0}); s.friendsBuild('host',{requestId:1,action:'place',shape:'ramp',finish:'timber',pose});
    const predictor=new LocalPlayerPrediction('host'); predictor.reconcile(s.createSnapshot());
    for(let i=1;i<15;i++){const input={type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence:i,clientTime:0,movement:1,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false}; predictor.step(input);s.setInput('host',input);s.tick(1000/30);}
    const frame=s.createSnapshot(),input={type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence:15,clientTime:0,movement:0,aimAngle:0,aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false};
    const presented=predictor.present(frame,input,0,0).players[0]; expect(presented.x).toBeCloseTo(p.x,5);expect(presented.z).toBeCloseTo(p.z,5);
  });
});
describe('scenic valley layout',()=>{
  it('separates arrivals from both transport spawns and closes a smooth route through four stations',()=>{
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}]),frame=s.createSnapshot(),p=frame.players[0];
    expect(Math.hypot(FRIENDS_AIRPAD.x-p.x,FRIENDS_AIRPAD.y-p.y)).toBeGreaterThan(1000);
    expect(frame.friends!.vehicles.filter(v=>v.kind==='train').every(v=>Math.hypot(v.x-p.x,v.y-p.y)>600)).toBe(true);
    expect(railwayDistance(FRIENDS_HUB.x,FRIENDS_HUB.y)).toBeGreaterThan(400);
    expect(RAIL_STATIONS).toHaveLength(4);
    const a=sampleTrainRoute(0),b=sampleTrainRoute(TRAIN_LOOP_LENGTH);expect(b.x).toBeCloseTo(a.x);expect(b.y).toBeCloseTo(a.y);
    for(let d=0;d<TRAIN_LOOP_LENGTH;d+=50){const a=sampleTrainRoute(d),b=sampleTrainRoute(d+50);expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeGreaterThan(49);expect(Math.abs(Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle)))).toBeLessThan(.2);}
  });
  it('makes retreat immediately safe and rejects safe-side damage',()=>{
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}]),p=s['players'].get('host')!;
    const hp=p.health; s['damagePlayer'](p,999,FRIENDS_SALVAGE.x,FRIENDS_SALVAGE.y);expect(p.health).toBe(hp);
    Object.assign(p,{x:FRIENDS_SALVAGE.x+FRIENDS_SALVAGE.radius,y:FRIENDS_SALVAGE.y,z:0});expect(insideFriendsCombat(p.x,p.y,p.z)).toBe(false);s['damagePlayer'](p,50,FRIENDS_SALVAGE.x,FRIENDS_SALVAGE.y);expect(p.health).toBe(hp);
    Object.assign(p,{x:4260,y:7050,z:0});s['spawnMissionEnemy']('basic',4260,7050,'guard',1,'#ff9878',0,-777);const e=s['enemies'][0];
    Object.assign(p,{x:FRIENDS_HUB.x,y:FRIENDS_HUB.y});s['applyDamage'](e,999,'host','plasma_gun');expect(e.health).toBe(e.maxHealth);
    Object.assign(p,{x:4260,y:7050,z:0});s['applyDamage'](e,999,'host','plasma_gun');expect(e.dying).toBe(true);
  });
});

describe('functional shared projects and exports', () => {
  it('finds a traversable ramp route and rejects an impassable wall', () => {
    const ramps = Array.from({length:4},(_,i)=>piece('ramp',{id:i+1,x:8032+i*64,y:7520,z:i*32}));
    const terrace=piece('slab',{id:10,x:8288,y:7520,z:128});
    expect(gardenWalkConnected([...ramps,terrace])).toBe(true);
    expect(gardenWalkConnected([piece('wall',{x:8224,y:7520})])).toBe(false);
    expect(gardenWalkConnected([...ramps.slice(0,3),terrace])).toBe(false);
  });
  it('rewards a furnished commons once and distinguishes removal from its completed milestone', () => {
    const pieces = ['gathering_beacon','bench','planter','lamp'].map((shape,i)=>piece(shape as FriendsBuildPiece['shape'],{id:i+1,x:6208+i*48,y:6144}));
    const projects=new FriendsProjects();expect(projects.update(pieces)).toEqual(['commons']);expect(projects.update(pieces)).toEqual([]);
    projects.update([]);expect(projects.snapshot()).toEqual({completed:['commons'],active:[]});
  });
  it('writes the latest world before awaiting the database and recovers the previous intact mirror', async () => {
    const records=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>records.get(key)||null,setItem:(key:string,value:string)=>records.set(key,value)});
    try {
      const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}]), f=s.createSnapshot().friends!;
      const pending=saveFriendsWorld({progress:f.progress,building:{revision:1,guestsCanBuild:true,pieces:[piece('cube')]}});
      expect(readFriendsWorld()?.building.pieces).toHaveLength(1);await pending;
      await saveFriendsWorld({progress:f.progress,building:{revision:2,guestsCanBuild:true,pieces:[]}});
      records.set(FRIENDS_WORLD_KEY,'corrupt');expect(readFriendsWorld()?.building.pieces).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('invalidates renderer caches and stale piece edits when the host imports a world', () => {
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}],1,undefined,{revision:1,guestsCanBuild:true,pieces:[piece('cube')]});
    const before=s.createSnapshot().friends!;
    expect(s.restoreFriendsWorld('host',before.progress,{revision:1,guestsCanBuild:true,pieces:[piece('ramp')]})).toBe(true);
    const after=s.createSnapshot().friends!.building!;expect(after.revision).toBeGreaterThan(before.building!.revision);expect(after.pieces[0].revision).toBe(after.revision);
  });
  it('preserves floating remnants and edit order in a world export, while rejecting corrupt imports', () => {
    const building = {revision:8,guestsCanBuild:true,pieces:[piece('slab',{z:192}),piece('cube',{id:2,x:6464})]};
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#8de6ce'}]);
    const value={progress:s.createSnapshot().friends!.progress,building};
    const restored=parseFriendsWorldImport(exportFriendsWorld(value));expect(new FriendsBuilding(restored.building).getPieces()).toHaveLength(2);
    expect(()=>parseFriendsWorldImport(exportFriendsWorld({...value,building:{...building,pieces:[piece('cube',{x:NaN})]}}))).toThrow(/invalid/);
  });
});
