import { FriendsFrontier } from './FriendsFrontier';
import { SCENIC_WAGONS } from '../world/FriendsTrainLayout';
import { describe,expect,it } from 'vitest';
import { railEndpoints,railJoined,snapRailPose,railOverlapError,playerRailRoute,samplePlayerRail } from '../world/FriendsPlayerRail';
import { friendsPlacementError,type FriendsBuildPiece } from './FriendsBuilding';
import { FriendsExpedition,vehicleLocal,friendsWorldFloor,friendsVehicleCeiling } from './FriendsExpedition';
import { FriendsTerrain, FRIENDS_AIRFIELD_HEIGHT, FRIENDS_ARRIVAL_HEIGHT } from '../world/FriendsTerrain';
import { RAIL_STATIONS,FRIENDS_STATION_PLATFORM } from '../world/FriendsRailway';
import { friendsRegionObstacles,FRIENDS_AIRPAD } from '../world/FriendsRegion';
import { FriendsSimulation } from './FriendsSimulation';
import { railFixture,railExpedition } from './friendsRailTestFixtures';
import { exportFriendsWorld,parseFriendsWorldImport } from './FriendsWorldStorage';
import { SnapshotDecoder,compactSnapshotWirePayload,createSnapshotDelta } from './snapshotReplication';
const seeds=[{id:'host',label:'Host',color:'#8de6ce'}];
const track=(extra:Partial<FriendsBuildPiece>={}):FriendsBuildPiece=>({id:1,x:8000,y:10000,z:0,rotation:0,shape:'rail_straight',finish:'timber',author:'Host',revision:1,...extra});
const aircraft=(e:FriendsExpedition)=>e.vehicles().find(v=>v.kind==='aircraft')!;
describe('player-built railway and spawn transport',()=>{
  it('starts with a grounded helicopter and sightseeing service, without player builds',()=>{
    const s=new FriendsSimulation(seeds),f=s.createSnapshot().friends!;
    expect(f.vehicles.filter(v=>!v.scenic).map(v=>v.kind)).toEqual(['aircraft','rowboat','rowboat']);expect(f.vehicles.filter(v=>v.scenic)).toHaveLength(SCENIC_WAGONS.length+1);expect(f.building!.pieces).toEqual([]);expect(friendsRegionObstacles()).toEqual([]);
    expect(aircraft(s['friends']!)).toMatchObject({...FRIENDS_AIRPAD,z:FRIENDS_AIRFIELD_HEIGHT+14});
  });
  it('removes invisible station platform floors and roof ceilings too',()=>{
    for(const station of RAIL_STATIONS){const x=station.x-Math.sin(station.angle)*FRIENDS_STATION_PLATFORM.offset,y=station.y+Math.cos(station.angle)*FRIENDS_STATION_PLATFORM.offset;
      expect(friendsWorldFloor([],x,y,0)).toBeUndefined();expect(friendsWorldFloor([],x,y,200)).toBeUndefined();expect(friendsVehicleCeiling([],x,y,0)).toBeUndefined();
    }
  });
  it('rejects guest train assembly without spending materials when the host disables editing',()=>{
    const fixture=railFixture(),s=new FriendsSimulation([...seeds,{id:'guest',label:'Guest',color:'#fff'}],1,undefined,fixture.building,undefined,fixture.frontier),p=s['players'].get('guest')!;
    Object.assign(p,{x:4000,y:fixture.building.pieces[0].y-100,z:0});const pack=s['friendsFrontier']!.pack(p);Object.assign(pack,{planks:12,ingots:4});const before={...pack};s.setFriendsGuestAccess(false);
    expect(s.friendsAction('guest',{requestId:1,action:'train_place'}).ok).toBe(false);expect(pack).toEqual(before);expect(s.createSnapshot().friends!.vehicles.filter(v=>!v.scenic)).toHaveLength(3);
  });
  it('replicates train creation and dismantling through snapshot deltas without stale vehicles',()=>{
    const fixture=railFixture(),s=new FriendsSimulation(seeds,1,undefined,fixture.building,undefined,fixture.frontier),p=s['players'].get('host')!;Object.assign(p,{x:4000,y:fixture.building.pieces[0].y-200,z:0});Object.assign(s['friendsFrontier']!.pack(p),{planks:12,ingots:4});
    const before=s.createSnapshot(),decoder=new SnapshotDecoder();decoder.decode(compactSnapshotWirePayload(before),1);
    expect(s.friendsAction('host',{requestId:1,action:'train_place'}).ok).toBe(true);const built=s.createSnapshot();
    expect(decoder.decode(compactSnapshotWirePayload(createSnapshotDelta(before,built,1)),2)!.friends!.vehicles.filter(v=>!v.scenic)).toHaveLength(7);
    // Deltas reference retained keyframes, rather than earlier deltas.
    decoder.decode(compactSnapshotWirePayload(built),2);
    expect(s.friendsAction('host',{requestId:2,action:'train_remove'}).ok).toBe(true);const removed=s.createSnapshot();expect(decoder.decode(compactSnapshotWirePayload(createSnapshotDelta(built,removed,2)),3)!.friends!.vehicles.filter(v=>!v.scenic)).toHaveLength(3);
  });
  it('snaps a straight and quarter turn with matching position, elevation and tangent',()=>{
    for(let rotation=0;rotation<4;rotation++){
      const first=track({rotation}),end=railEndpoints(first)[1];
      const pose=snapRailPose([first],'rail_curve',{x:end.x+100*Math.cos(end.angle)-100*Math.sin(end.angle),y:end.y+100*Math.sin(end.angle)+100*Math.cos(end.angle),z:0,rotation});
      const next=track({...pose,id:2,shape:'rail_curve'});expect(railJoined(end,railEndpoints(next)[0])).toBe(true);expect(railOverlapError([first],next)).toBeUndefined();
      expect(playerRailRoute([first,next],1)?.entries).toHaveLength(2);
      const atEnd=snapRailPose([first],'rail_curve',{x:end.x,y:end.y,z:8,rotation});expect(railJoined(end,railEndpoints(track({...atEnd,id:3,shape:'rail_curve'}))[0])).toBe(true);
    }
  });
  it('rejects crossings, duplicates, incompatible joints and unsupported track spans',()=>{
    const first=track(),cross=track({id:2,rotation:1});expect(railOverlapError([first],cross)).toContain('cross');expect(railOverlapError([first],first)).toContain('cross');
    expect(playerRailRoute([first,track({id:2,x:8000,y:10128,rotation:1,shape:'rail_curve'})],1)).toBeUndefined();
    const terrain=new FriendsTerrain();terrain.set(247,312,-1,0);
    expect(friendsPlacementError([],'rail_straight',first,undefined,[],undefined,false,terrain)).toContain('Level');
    const unsupported=track({z:32});expect(friendsPlacementError([],'rail_straight',unsupported,undefined,[],undefined,false,new FriendsTerrain())).toContain('Level');
  });
  it('protects the ground beneath the ends of built rails from excavation',()=>{
    const f=new FriendsFrontier(),piece=track();f.terrain.addGrade([8000,10000,0,512]);const actor={id:'host',label:'Host',x:8110,y:10000,z:0,lifeState:'alive'};
    f.tool(actor,3,{x:8110,y:10000,z:26,dx:0,dy:0,dz:-1},1000,[piece]);
    expect(f.terrain.floor(8110,10000,0)).toBe(0);expect(f.snapshot().mined).toBe(0);
    f.tool(actor,3,{x:8110,y:10000,z:26,dx:0,dy:0,dz:-1},1400,[]);expect(f.snapshot().mined).toBe(1);
  });
  it('allows independent railways and walks a continuous closed loop, including its seam',()=>{
    const f=railFixture(true),route=playerRailRoute([...f.building.pieces,track({id:100,x:6000})],1)!;
    expect(route.closed).toBe(true);expect(route.entries).toHaveLength(20);
    for(let d=0;d<route.length;d+=7){const a=samplePlayerRail(route,d),b=samplePlayerRail(route,d+7);expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThanOrEqual(7.001);}
    expect(samplePlayerRail(route,0)).toEqual(samplePlayerRail(route,route.length));
  });
  it('builds tracks and assembles a valid train for free during testing',()=>{
    const clean=railFixture(),s=new FriendsSimulation(seeds,1,undefined,undefined,undefined,clean.frontier),p=s['players'].get('host')!,f=s['friendsFrontier']!;Object.assign(p,{x:8000,y:9800,z:0});
    f.terrain.addGrade([8000,10000,0,512]);
    const pose={x:8000,y:10000,z:0,rotation:0};expect(s.friendsBuild('host',{requestId:1,action:'place',shape:'rail_straight',finish:'stone',pose}).ok).toBe(true);expect(f.pack(p).wood).toBe(18);expect(f.pack(p).stone).toBe(12);
    p.x=10000;expect(s.friendsAction('host',{requestId:1,action:'train_place'}).ok).toBe(false);p.x=8000;expect(f.pack(p).wood).toBe(18);
    Object.assign(f.pack(p),{planks:12,ingots:4});expect(s.friendsAction('host',{requestId:2,action:'train_place'}).ok).toBe(true);expect(f.pack(p).wood).toBe(18);expect(f.pack(p).planks).toBe(12);
    expect(s.createSnapshot().friends!.vehicles.filter(v=>v.kind==='train'&&!v.scenic)).toHaveLength(1);
    const copy={...f.pack(p)};expect(s.friendsAction('host',{requestId:2,action:'train_place'}).ok).toBe(true);expect(s.friendsAction('host',{requestId:3,action:'train_place'}).ok).toBe(false);expect(f.pack(p)).toEqual(copy);
    expect(s.friendsBuild('host',{requestId:2,action:'remove',pieceId:1,expectedRevision:s.createSnapshot().friends!.building!.pieces[0].revision}).ok).toBe(false);
    expect(s.friendsAction('host',{requestId:4,action:'train_remove'}).ok).toBe(true);expect(f.snapshot().stock).toMatchObject({wood:0,planks:0,ingots:0});expect(s.createSnapshot().friends!.vehicles.filter(v=>!v.scenic)).toHaveLength(3);
  });
  it('shuttles on an open line without running beyond the track or dropping idle passengers',()=>{
    const e=railExpedition(),car=e.vehicles()[0],p={id:'host',x:car.x,y:car.y,z:car.z,lifeState:'alive'};
    let reversed=false;
    for(let i=0;i<2000;i++){e.update(50,i*50,[p],new Map());if(e.snapshot().transport!.railTrain!.direction===-1)reversed=true;const v=e.vehicles()[0];expect(vehicleLocal(v,p.x,p.y).x).toBeCloseTo(0,6);expect(p.z).toBe(v.z);}
    expect(reversed).toBe(true);
  });
  it('preserves passengers while extending the line and adding carriages',()=>{
    const e=new FriendsExpedition(),pieces=[track(),track({id:2,x:8256})];e.setRailway(pieces,1);e.placeTrain(pieces,{id:'host',x:8200,y:10000,z:0,lifeState:'alive'});
    const car=e.vehicles().find(v=>v.kind==='train'&&!v.closed)!,p={id:'guest',x:car.x,y:car.y,z:car.z,lifeState:'alive'};
    const expanded=[...pieces,track({id:3,x:8512}),track({id:4,x:8768})];e.setRailway(expanded,2,[p]);
    const after=e.vehicles().find(v=>v.id===car.id)!;expect(vehicleLocal(after,p.x,p.y).x).toBeCloseTo(0,6);expect(e.vehicles().filter(v=>v.kind==='train'&&!v.closed)).toHaveLength(3);
    expect(e.removeTrain([p])).toContain('step off');
  });
  it('saves and replicates a player railway and assembled train, resetting parked aircraft on load',()=>{
    const f=railFixture(true),s=new FriendsSimulation(seeds,1,undefined,f.building,undefined,f.frontier,f.transport),e=s['friends']!;
    Object.assign(e['aircraft'],{x:20000,y:15000,z:3000,pilotId:'host'});const snap=s.createSnapshot().friends!;
    const parsed=parseFriendsWorldImport(exportFriendsWorld({progress:snap.progress,building:snap.building!,frontier:snap.frontier,transport:snap.transport}));
    const next=new FriendsSimulation(seeds,1,parsed.progress,parsed.building,parsed.projects,parsed.frontier,parsed.transport),loaded=next.createSnapshot();
    expect(loaded.friends!.building!.pieces).toHaveLength(20);expect(loaded.friends!.vehicles.filter(v=>v.kind==='train'&&!v.scenic)).toHaveLength(4);expect(aircraft(next['friends']!)).toMatchObject({...FRIENDS_AIRPAD,z:FRIENDS_AIRFIELD_HEIGHT+14});
    const decoded=new SnapshotDecoder().decode(compactSnapshotWirePayload(loaded),1)!;expect(decoded.friends!.transport!.railTrain).toEqual(loaded.friends!.transport!.railTrain);
  });
  it('preserves the active aircraft and crew on a new player spawn and releases only the recovered pilot',()=>{
    const s=new FriendsSimulation(seeds),e=s['friends']!,p=s['players'].get('host')!;
    Object.assign(e['aircraft'],{x:20000,y:18000,z:2400,pilotId:'host'});Object.assign(p,{x:20100,y:18000,z:2400,platformVelocityX:400});
    s.addPlayer({id:'guest',label:'Guest',color:'#fff'});expect(aircraft(e)).toMatchObject({x:20000,y:18000,z:2400,pilotId:'host'});expect(p.z).toBe(2400);expect(p.platformVelocityX).toBe(400);
    s['recoverFriend'](p);expect(aircraft(e)).toMatchObject({x:20000,y:18000,z:2400});expect(aircraft(e).pilotId).toBeUndefined();expect(p.z).toBe(FRIENDS_ARRIVAL_HEIGHT);expect(p.platformVelocityX).toBe(0);
  });
  it('finds the actual ground at the designated aircraft spawn even in an imported terrain save',()=>{
    const terrain=new FriendsTerrain();terrain.set(Math.floor(FRIENDS_AIRPAD.x/32),Math.floor(FRIENDS_AIRPAD.y/32),FRIENDS_AIRFIELD_HEIGHT/32,1);
    const e=new FriendsExpedition(undefined,undefined,terrain);expect(aircraft(e).z).toBe(FRIENDS_AIRFIELD_HEIGHT+46);
  });
  it('requires a player-built workshop before crafting, then uses its real materials',()=>{
    const s=new FriendsSimulation(seeds),p=s['players'].get('host')!;
    expect(s.friendsAction('host',{requestId:1,action:'planks'}).ok).toBe(false);
    const workshopHeight=s['friendsFrontier']!.terrain.floor(6132,5500,6000,0)!;
    Object.assign(p,{x:6292,y:5500,z:workshopHeight});expect(s.friendsBuild('host',{requestId:1,action:'place',shape:'workbench',finish:'timber',pose:{x:6132,y:5500,z:workshopHeight,rotation:0}}).ok).toBe(true);
    expect(s.friendsAction('host',{requestId:2,action:'planks'}).ok).toBe(true);
    expect(s['friendsFrontier']!.pack(p)).toMatchObject({wood:16,stone:12,planks:4});
  });
});
