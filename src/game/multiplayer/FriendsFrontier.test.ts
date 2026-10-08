import { railExpedition } from './friendsRailTestFixtures';
import type { FriendsBuildPiece } from './FriendsBuilding';
import { describe, expect, it } from 'vitest';
import { FriendsFrontier, type FrontierRequest, packKey, frontierContract, isFrontierSave, packWeight, frontierForestDensity, frontierTrees } from './FriendsFrontier';
import { FriendsTerrain, FRONTIER_SITES, baseTerrainHeight, FRIENDS_CAVE_HEIGHT, FRIENDS_AIRFIELD_HEIGHT, FRIENDS_ARRIVAL_HEIGHT } from '../world/FriendsTerrain';
import { meshTerrainChunk } from '../world/FriendsTerrainMesh';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { MAX_SNAPSHOT_BYTES, encodeSnapshotPackets, SnapshotAssembler } from './snapshotTransport';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsBuilding, friendsPlacementError } from './FriendsBuilding';
import { FriendsExpedition } from './FriendsExpedition';
import { exportFriendsWorld, parseFriendsWorldImport } from './FriendsWorldStorage';
import { compactSnapshotWirePayload, SnapshotDecoder } from './snapshotReplication';
const flatTerrain=()=>{const t=new FriendsTerrain();t.addGrade([8000,8000,0,512]);t.addGrade([9616,10000,0,512]);return t;};
const flatFrontier=()=>{const f=new FriendsFrontier(undefined,false);f.terrain.addGrade([8000,8000,0,512]);return f;};
const actor = (extra = {}) => ({ id: 'host', label: 'Explorer', x: 5900, y: 5710, z: 0, lifeState: 'alive', ...extra });
const down = (x = 8000, y = 8000) => ({ x, y, z: 26, dx: 0, dy: 0, dz: -1 });
const workshop:FriendsBuildPiece={id:1,shape:'workbench',finish:'timber',author:'Host',revision:1,x:6000,y:5712,z:0,rotation:0};
const seeds = [{ id: 'host', label: 'Explorer', color: '#8de6ce' }];

describe('volumetric frontier and resource economy', () => {
  it('leaves most of the world open while retaining dense, deterministic woodland regions', () => {
    let wooded=0,total=0;
    for(let x=256;x<48000;x+=512)for(let y=256;y<48000;y+=512){total++;if(frontierForestDensity(x,y)>0)wooded++;}
    expect(wooded/total).toBeGreaterThan(.2);expect(wooded/total).toBeLessThan(.4);
    expect(frontierForestDensity(10700,4200)).toBe(1);
    const first=frontierTrees(21,8);expect(first.length).toBeGreaterThan(3);expect(first.length).toBeLessThanOrEqual(10);expect(frontierTrees(21,8)).toEqual(first);
    for(let x=10;x<20;x++)for(let y=14;y<20;y++)for(const tree of frontierTrees(x,y))if(!tree.id.startsWith('starter:'))expect(frontierForestDensity(tree.x,tree.y)).toBeGreaterThan(0);
  });
  it('excavates below zero, exposes a lower floor, and places harvested soil without duplication', () => {
    const f = flatFrontier(), p = actor({ x: 8000, y: 8000 });
    f.tool(p, 3, down(), 1000, []); f.tool(p, 3, down(), 1400, []);
    expect(f.terrain.floor(p.x, p.y, 0)).toBe(-64); expect(f.pack(p).soil).toBe(2);
    f.tool(p, 3, down(), 1800, [], true, [], undefined, true); expect(f.terrain.floor(p.x, p.y, 0)).toBe(-32); expect(f.pack(p).soil).toBe(1);
    f.tool(p, 3, down(), 2200, []); expect(f.pack(p).soil).toBe(2);
    const restored = new FriendsFrontier(f.snapshot()); expect(restored.terrain.floor(p.x, p.y, 0)).toBe(-64); expect(restored.pack(p).soil).toBe(2);
  });
  it('keeps the cave floor and roof separate and generates exposed underground faces with correct winding', () => {
    const t = new FriendsTerrain(); expect(t.floor(6512, 6192, FRIENDS_CAVE_HEIGHT, 0)).toBe(FRIENDS_CAVE_HEIGHT); expect(t.ceiling(6512, 6192, FRIENDS_CAVE_HEIGHT)).toBe(FRIENDS_CAVE_HEIGHT+96);
    const m = meshTerrainChunk(t, 13, 12); expect(m.positions.length).toBeGreaterThan(0);
    let underground = false;
    for (let i = 0; i < m.positions.length; i += 9) {
      const ax=m.positions[i+3]-m.positions[i], ay=m.positions[i+4]-m.positions[i+1], az=m.positions[i+5]-m.positions[i+2];
      const bx=m.positions[i+6]-m.positions[i], by=m.positions[i+7]-m.positions[i+1], bz=m.positions[i+8]-m.positions[i+2];
      expect((ay*bz-az*by)*m.normals[i]+(az*bx-ax*bz)*m.normals[i+1]+(ax*by-ay*bx)*m.normals[i+2]).toBeGreaterThan(0);
      if (m.positions[i+1] < FRIENDS_CAVE_HEIGHT) underground = true;
    }
    expect(underground).toBe(true);
  });
  it('pays for a tree exactly once when two players harvest the same trunk and preserves it in saves', () => {
    const f = flatFrontier(), a = actor({ x: 5960, y: 5860, z:baseTerrainHeight(6096,5872) }), b = actor({ id: 'guest', label: 'Guest', x: 5960, y: 5860, z:baseTerrainHeight(6096,5872) });
    const ray = { x: 5960, y: 5860, z: baseTerrainHeight(6096,5872)+26, dx: 1, dy: 0, dz: 0 };
    f.tool(a,1,ray,1000,[]); f.tool(b,1,ray,1050,[]); f.tool(a,1,ray,1400,[]); f.tool(b,1,ray,1450,[]); f.tool(a,1,ray,1800,[]); f.tool(b,1,ray,1850,[]);
    expect(f.snapshot().chopped).toBe(1); expect(f.pack(a).wood + f.pack(b).wood).toBe(46);
    const saved = new FriendsFrontier(f.snapshot()); saved.tool(a,1,ray,2200,[]); expect(saved.snapshot().chopped).toBe(1);
    expect(saved.treesNear(6080,5860).some(t => t.id === 'starter:cedar')).toBe(false);
  });
  it('enforces cooldowns, pack capacity and permissions', () => {
    const f = flatFrontier(), p = actor({ x: 8000, y: 8000 }); f.tool(p,3,down(),1000,[],false); expect(f.snapshot().mined).toBe(0);
    f.tool(p,3,down(),1400,[]); f.tool(p,3,down(),1410,[]); expect(f.snapshot().mined).toBe(1);
    f.pack(p).soil=160; f.tool(p,3,down(),1800,[]); expect(f.snapshot().mined).toBe(1);
    f.pack(p).soil=0; f.tool(p,3,down(5900,5630),2200,[]); expect(f.terrain.floor(5900,5630,6000,0)).toBe(FRIENDS_ARRIVAL_HEIGHT);
  });
  it('prevents filling an operator and rejects invalid terrain edits and malformed planted trees', () => {
    const f = flatFrontier(), p = actor({ x: 8000, y: 8000 }); f.tool(p,3,down(),1000,[]);
    f.tool(p,3,down(),1400,[],true,[actor({ id:'guest', x:8000, y:8000, z:-32 })],undefined,true); expect(f.pack(p).soil).toBe(1);
    expect(f.terrain.set(-1,2,3,0)).toBe(false); expect(f.terrain.set(250,250,256,1)).toBe(false);
    expect(isFrontierSave({ ...f.snapshot(), planted:[{ id:'bad',x:NaN,y:0,z:0,kind:'pine',scale:1 }] })).toBe(false);
    expect(isFrontierSave({ ...f.snapshot(), terrain:{revision:0,edits:[[1,2,3,9]]} })).toBe(false);
  });
  it('requires real material expenditure for building, refunds to storage, and charges redo after undo', () => {
    const f = flatFrontier(), p = actor({ x: 6150, y: 6144 }), b = new FriendsBuilding();
    const economy = (before: Parameters<FriendsFrontier['buildTransition']>[1], after: Parameters<FriendsFrontier['buildTransition']>[2]) => f.buildTransition(p,before,after);
    const place = { requestId:1, action:'place' as const, shape:'cube' as const, finish:'timber' as const, pose:{x:6400,y:6144,z:0,rotation:0} };
    expect(b.request(p,place,'host',[p],economy).ok).toBe(true); expect(f.pack(p).wood).toBe(16);
    expect(b.request(p,{ requestId:2,action:'undo' },'host',[p],economy).ok).toBe(true); expect(f.snapshot().stock.wood).toBe(2);
    expect(b.request(p,{ requestId:3,action:'redo' },'host',[p],economy).ok).toBe(true); expect(f.pack(p).wood).toBe(14);
    expect(b.request(p,place,'host',[p],economy).ok).toBe(false); expect(f.pack(p).wood).toBe(14);
  });
  it('crafts from one inventory, rejects duplicate requests, and conserves storage transfers', () => {
    const f = flatFrontier(), p = actor();
    expect(f.request(p,{ requestId:1,action:'planks' },0,[workshop],[]).ok).toBe(true); expect(f.pack(p).wood).toBe(16); expect(f.pack(p).planks).toBe(4);
    expect(f.request(p,{ requestId:1,action:'planks' },10,[workshop],[]).ok).toBe(false); expect(f.pack(p).planks).toBe(4);
    const count=packWeight(f.pack(p)); f.request(p,{requestId:2,action:'deposit'},0,[workshop],[]); expect(packWeight(f.pack(p))).toBe(0); expect(packWeight(f.snapshot().stock)).toBe(count);
    f.request(p,{requestId:3,action:'withdraw',resource:'wood'},0,[workshop],[]); expect(f.pack(p).wood).toBe(16); expect(f.snapshot().stock.wood).toBe(0);
    expect(f.request(actor({ x:20000 }),{requestId:4,action:'planks'},0,[workshop],[]).ok).toBe(false);
  });
  it('discovers regional caches once and requires physical delivery of repeatable orders', () => {
    const f = flatFrontier(), p = actor(); f.pack(p).wood=24; f.pack(p).stone=12;
    f.request(p,{requestId:1,action:'deposit'},0,[workshop],[]); expect(f.request(p,{requestId:2,action:'contract'},0,[workshop],[]).ok).toBe(true);
    expect(f.snapshot().contracts).toBe(1); const order=frontierContract(1); expect(order.destination?.id).toBe('mine');
    f.pack(p).wood=16; f.pack(p).stone=8; expect(f.request(p,{requestId:3,action:'contract'},0,[workshop],[]).ok).toBe(false);
    const site=FRONTIER_SITES[0]; p.x=site.x; p.y=site.y; p.z=baseTerrainHeight(site.x,site.y); f.explore(p,1000); f.explore(p,2000);
    expect(f.snapshot().discovered).toEqual(['mine']); expect(f.snapshot().stock.ingots).toBe(7);
    expect(f.request(p,{requestId:4,action:'contract'},0,[workshop],[]).ok).toBe(true); expect(f.pack(p).wood).toBe(0); expect(f.snapshot().contracts).toBe(2);
    const restored=new FriendsFrontier(f.snapshot()); restored.explore(p,3000); expect(restored.snapshot().stock.ingots).toBe(12);
  });
  it('loads and unloads persistent cargo beside an open train carriage', () => {
    const f = flatFrontier(), expedition = railExpedition(), v=expedition.vehicles().find(v => v.kind==='train' && !v.closed)!, p=actor({x:v.x,y:v.y,z:v.z});
    const count=packWeight(f.pack(p)); expect(f.request(p,{requestId:1,action:'load'},0,[],[v]).ok).toBe(true); expect(packWeight(f.pack(p))).toBe(0); expect(packWeight(f.snapshot().cargo)).toBe(count);
    const restored=new FriendsFrontier(f.snapshot()); expect(restored.request(p,{requestId:2,action:'unload'},0,[],[v]).ok).toBe(true); expect(packWeight(restored.pack(p))).toBe(count); expect(packWeight(restored.snapshot().cargo)).toBe(0);
  });
  it('lets actual simulation players fall into excavations and restores terrain, economy and parked transport', () => {
    const s=new FriendsSimulation(seeds), p=s['players'].get('host')!, f=s['friendsFrontier']!;
    p.x=8000;p.y=8000;p.z=0;f.terrain.addGrade([8000,8000,0,512]);f.terrain.set(250,250,-1,0);f.terrain.set(250,250,-2,0);
    for(let i=0;i<30;i++)s.tick(50);expect(p.z).toBe(-64);
    s['friends']!.controlTrain('train_hold'); const snap=s.createSnapshot().friends!;
    const exported=parseFriendsWorldImport(exportFriendsWorld({progress:snap.progress,building:snap.building!,frontier:snap.frontier,transport:snap.transport}));
    const restored=new FriendsSimulation(seeds,1,exported.progress,exported.building,exported.projects,exported.frontier,exported.transport); const frame=restored.createSnapshot().friends!;
    expect(frame.frontier!.terrain.edits).toEqual(snap.frontier!.terrain.edits); expect(frame.transport!.held).toBe(true); expect(frame.vehicles.find(v=>v.kind==='aircraft')!.z).toBe(FRIENDS_AIRFIELD_HEIGHT+14);
    expect(frame.frontier!.packs[packKey(p)]).toEqual(snap.frontier!.packs[packKey(p)]);
  });
  it('clears pilot binding and momentum when returning home and invalidates terrain on import', () => {
    const s=new FriendsSimulation(seeds), p=s['players'].get('host')!, e=s['friends']!, v=e.vehicles().find(v=>v.kind==='aircraft')!;
    p.x=v.x+100;p.y=v.y;p.z=v.z;e.interact(p,0);p.platformVelocityX=300;
    expect(s.friendsAction('host',{requestId:1,action:'home'}).ok).toBe(true);expect(p.x).toBe(5900);expect(p.z).toBe(FRIENDS_ARRIVAL_HEIGHT);expect(p.platformVelocityX).toBe(0);expect(e.vehicles().find(v=>v.kind==='aircraft')!.pilotId).toBeUndefined();
    const f=s.createSnapshot().friends!;expect(s.restoreFriendsWorld('host',f.progress,f.building!,f.projects,f.frontier,f.transport)).toBe(true);expect(s.createSnapshot().friends!.frontier!.terrain.revision).toBeGreaterThan(f.frontier!.terrain.revision);
  });
  it('replicates a frontier keyframe including terrain and cargo through the real snapshot decoder', () => {
    const s=new FriendsSimulation(seeds), p=s['players'].get('host')!;s['friendsFrontier']!.tool(p,3,down(),1000,[]);
    const frame=s.createSnapshot(), decoded=new SnapshotDecoder().decode(compactSnapshotWirePayload(frame), 1);
    expect(decoded?.friends?.frontier?.terrain.edits).toEqual(frame.friends!.frontier!.terrain.edits);expect(decoded?.friends?.frontier?.packs).toEqual(frame.friends!.frontier!.packs);
  });
  it('releases the edit budget when soil is restored and supports renewable planted forestry', () => {
    const t=flatTerrain();t.set(250,250,-1,0);expect(t.snapshot().edits).toHaveLength(1);t.set(250,250,-1,1);expect(t.snapshot().edits).toHaveLength(0);
    const f=flatFrontier(),p=actor({x:8000,y:8000});expect(f.request(p,{requestId:1,action:'plant'},0,[workshop],[]).ok).toBe(true);
    const ray={x:8000,y:8000,z:26,dx:1,dy:0,dz:0};for(let i=0;i<6;i++)f.tool(p,1,ray,1000+i*300,[]);
    expect(f.snapshot().planted).toHaveLength(0);expect(f.snapshot().harvested.some(id=>id.startsWith('planted:'))).toBe(false);expect(f.pack(p).saplings).toBe(3);
    expect(f.request(p,{requestId:2,action:'plant'},3000,[],[]).ok).toBe(true);
  });
  it('rejects prototype-property network actions without changing or crashing the world', () => {
    const f=flatFrontier(),p=actor();
    expect(f.request(p,{requestId:1,action:'toString'} as unknown as FrontierRequest,0,[],[]).ok).toBe(false);
    expect(f.request(p,{requestId:2,action:'withdraw',resource:'__proto__'} as unknown as FrontierRequest,0,[],[]).ok).toBe(false);
    expect(f.pack(p).wood).toBe(18);
  });

  it('excavates through real input frames, falls onto the new floor, and consumes no gun ammunition', () => {
    const s=new FriendsSimulation(seeds),p=s['players'].get('host')!;p.x=8000;p.y=8000;p.z=0;s['friendsFrontier']!.terrain.addGrade([8000,8000,0,512]);
    const ammo=p.weaponStates[0].magazineAmmo;
    s.setInput('host',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:quantizeAngle(0),aimPitch:quantizePitch(-1.4),selectedSlot:0,friendsTool:3,firing:true,fireActionId:1,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
    for(let i=0;i<40;i++)s.tick(50);
    expect(s.createSnapshot().friends!.frontier!.mined).toBe(2);expect(p.z).toBe(-64);expect(p.weaponStates[0].magazineAmmo).toBe(ammo);
  });
  it('fits a saturated settlement and excavation save into a complete late-join packet set', () => {
    const frame=new FriendsSimulation(seeds).createSnapshot(),f=frame.friends!.frontier!;
    f.terrain.edits=Array.from({length:6000},(_,i)=>[800+i%600,Math.floor(i/600)+1200,-10,0]);
    f.terrain.grades=Array.from({length:7280},(_,i)=>[2000+i%100*64,3000+Math.floor(i/100)*64,0,128]);
    f.harvested=Array.from({length:12000},(_,i)=>`${Math.floor(i/180)}:${Math.floor(i/18)%10}:${i%18}`);
    frame.friends!.building!.pieces=Array.from({length:1024},(_,i)=>({id:i+1,shape:'cube',finish:'timber',rotation:0,x:16000+i%32*64,y:16000+Math.floor(i/32)*64,z:0,author:'Explorer',revision:1}));
    const message=JSON.stringify({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick:1,sentAt:0,payload:compactSnapshotWirePayload(frame)});
    expect(new TextEncoder().encode(message).length).toBeLessThan(MAX_SNAPSHOT_BYTES);const packets=encodeSnapshotPackets(message,1);expect(packets.length).toBeGreaterThan(1);
    const assembler=new SnapshotAssembler();let restored:string|undefined;for(const packet of packets.reverse())restored=assembler.push(packet,0)||restored;
    expect(restored).toBe(message);
  });

  it('requires actual support at zero elevation after the ground beneath a build is excavated', () => {
    const terrain=flatTerrain();for(let x=299;x<=301;x++)for(let y=311;y<=313;y++)terrain.set(x,y,-1,0);
    const pose={x:9616,y:10000,z:0,rotation:0};
    expect(friendsPlacementError([], 'cube',pose,undefined,[],undefined,false,terrain)).toContain('Attach');
    expect(friendsPlacementError([], 'cube',{...pose,z:-32},undefined,[],undefined,false,terrain)).toBeUndefined();
  });

});
