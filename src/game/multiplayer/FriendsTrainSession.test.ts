import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { scenicStationPoses } from '../world/FriendsScenicRailway';
import { SCENIC_STOP_OFFSET } from '../world/FriendsTrainLayout';
import { vehicleLocalPoint, vehicleWorldPoint } from './FriendsVehiclePose';

const players=[{id:'host',label:'Host',color:'#fff'}];
const key='killsync.friends.world.v2';
let records:Map<string,string>;
beforeEach(()=>{
  vi.resetModules();records=new Map();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>records.set(k,v)});
  vi.stubGlobal('indexedDB',undefined);
});
afterEach(()=>vi.unstubAllGlobals());
function travelledWorld(){
  const simulation=new FriendsSimulation(players),service=simulation['friends']!.scenic!;
  service.distance=90000;service.speed=900;service.dwell=0;service.nextStop=3;service.held=true;service.control(360,false);
  const f=simulation.createSnapshot().friends!;
  return {simulation,service,world:{version:2 as const,savedAt:Date.now(),progress:f.progress,building:f.building!,projects:f.projects,frontier:f.frontier,transport:{...f.transport!,scenicRailway:service.snapshot()}}};
}
function expectHome(simulation:FriendsSimulation){
  const f=simulation.createSnapshot().friends!,service=f.scenicRailway!,home=scenicStationPoses()[0].distance+SCENIC_STOP_OFFSET;
  expect(service.distance).toBeCloseTo(home);expect(service.speed).toBe(0);expect(service.targetSpeed).toBe(132);
  expect(service.dwell).toBe(45000);expect(service.nextStop).toBe(1);expect(service.held).toBe(false);expect(service.autoStops).toBe(true);
  expect(f.vehicles.find(v=>v.id==='grand-engine')!.routeDistance).toBeCloseTo(home);
  expect(f.transport!.scenicRailway).toBe(true);
}

describe('public train session lifecycle',()=>{
  it('starts at the spawn station when loading an old journey and keeps cargo attached to its wagon',async()=>{
    const {simulation,service,world}=travelledWorld(),building=simulation['friendsBuilding']!,p=simulation['players'].get('host')!,v=service.vehicles()[4];
    Object.assign(p,vehicleWorldPoint(v,{x:0,y:0,z:0}));
    expect(building.request(p,{requestId:1,action:'place',shape:'storage',finish:'timber',pose:{...vehicleWorldPoint(v,{x:56,y:0,z:0}),rotation:0,attachment:{vehicleId:v.id,x:56,y:0,z:0}}},'host',[]).ok).toBe(true);
    world.building=building.snapshot();records.set(key,JSON.stringify(world));
    const storage=await import('./FriendsWorldStorage'),loaded=storage.initialFriendsWorld();
    expect(loaded.transport!.scenicRailway).toBe(true);
    const fresh=new FriendsSimulation(players,73,loaded.progress,loaded.building,loaded.projects,loaded.frontier,loaded.transport);
    expectHome(fresh);
    const cargo=fresh['friendsBuilding']!.getPieces()[0],car=fresh['friends']!.scenic!.vehicles()[4];
    expect(cargo.attachment).toEqual({vehicleId:v.id,x:56,y:0,z:0});
    expect(vehicleLocalPoint(car,cargo).x).toBeCloseTo(56);expect(vehicleLocalPoint(car,cargo).z).toBeCloseTo(0);
    // Direct legacy transport callers also start fresh, even without storage migration.
    expectHome(new FriendsSimulation(players,73,world.progress,world.building,world.projects,world.frontier,world.transport));
  });

  it('omits journey position and speed from saves, backups and exports without resetting the running train',async()=>{
    const {service,world}=travelledWorld();records.set(key,JSON.stringify(world));
    const storage=await import('./FriendsWorldStorage');
    const result=await storage.saveFriendsWorld(world);expect(result.mirror).toBe(true);
    for(const savedKey of [key,`${key}.previous`]){
      const saved=JSON.parse(records.get(savedKey)!);expect(saved.transport.scenicRailway).toBe(true);
      expect(saved.building).toEqual(world.building);expect(saved.progress).toEqual(world.progress);
    }
    const exported=storage.exportFriendsWorld(world);expect(JSON.parse(exported).transport.scenicRailway).toBe(true);
    expect(storage.parseFriendsWorldImport(JSON.stringify(world)).transport!.scenicRailway).toBe(true);
    expect(storage.readFriendsWorld()!.transport!.scenicRailway).toBe(true);
    expect(service.distance).toBe(90000);expect(service.speed).toBe(900);expect(service.targetSpeed).toBeCloseTo(1200);expect(service.autoStops).toBe(false);
    const loaded=storage.parseFriendsWorldImport(exported);
    expectHome(new FriendsSimulation(players,73,loaded.progress,loaded.building,loaded.projects,loaded.frontier,loaded.transport));
  });

  it('resets the train for an in-game world reload while live snapshots still carry its current motion',()=>{
    const {simulation,service,world}=travelledWorld(),live=simulation.createSnapshot().friends!;
    expect(live.scenicRailway!.distance).toBe(90000);expect(live.scenicRailway!.speed).toBe(900);expect(live.transport!.scenicRailway).toBe(true);
    expect(simulation.restoreFriendsWorld('host',world.progress,world.building,world.projects,world.frontier,world.transport)).toBe(true);
    expectHome(simulation);expect(simulation['friends']!.scenic).not.toBe(service);
  });
});
