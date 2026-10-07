import {FriendsWorldHost,FriendsWorldGuest} from './FriendsWorldReplication';
import {describe,it,expect} from 'vitest';
import {FriendsScenicService,scenicControlNearby,scenicSeatPrompt,scenicVehicles} from './FriendsScenicService';
import {FriendsSimulation} from './FriendsSimulation';
import {vehicleWorldPoint,vehicleLocalPoint,vehiclePlaneHeight} from './FriendsVehiclePose';
import {FriendsBuilding,friendsBuildFloor,friendsBuildCeiling,raycastFriendsBuild,getFriendsBuildPose,friendsPlacementError,resolveFriendsBuildPose} from './FriendsBuilding';
import {friendsVehicleFloor,friendsVehicleCeiling} from './FriendsExpedition';
import {SCENIC_STOP_OFFSET,SCENIC_PLATFORM_HALF} from '../world/FriendsTrainLayout';
import {scenicStationPoses,scenicRailway} from '../world/FriendsScenicRailway';
import {railWrap} from '../world/FriendsRailAlignment';
import {validFriendsCommand} from './FriendsCommands';
import {CoopSnapshotInterpolator} from './snapshotInterpolation';
const actor={id:'host',label:'Host',lifeState:'alive',x:0,y:0,z:0};
describe('long Grand Traverse and operating controls',()=>{
  it('is more than three times the old length, with ten wagons, seven empty freight decks and full station capacity',()=>{
    const cars=scenicVehicles(0),length=225*10+105+90;
    expect(cars).toHaveLength(11);expect(length/765).toBeGreaterThan(3);expect(cars.filter(v=>v.wagonKind&&v.wagonKind!=='touring')).toHaveLength(7);
    for(const station of scenicStationPoses())for(const v of scenicVehicles(station.distance+SCENIC_STOP_OFFSET)){
      const c=Math.cos(station.angle),s=Math.sin(station.angle),along=(v.x-station.x)*c+(v.y-station.y)*s,side=-(v.x-station.x)*s+(v.y-station.y)*c;
      expect(Math.abs(along)+v.length/2).toBeLessThan(SCENIC_PLATFORM_HALF);expect(Math.abs(side)).toBeLessThan(.02);expect(v.z).toBeCloseTo(station.z+14,4);expect(v.pitch).toBeCloseTo(0,5);
    }
    const freight=cars[4],p={...actor,...vehicleWorldPoint(freight,{x:0,y:0,z:0})};expect(scenicSeatPrompt(p,[freight])).toBeUndefined();
    const high=vehicleWorldPoint(freight,{x:0,y:0,z:120});expect(friendsVehicleFloor([freight],high.x,high.y,high.z)).toBeCloseTo(vehiclePlaneHeight(freight,high.x,high.y));expect(friendsVehicleCeiling([freight],p.x,p.y,p.z)).toBeUndefined();
  });
  it('reaches 360 km/h continuously, safely slows to walking speed and resets the selected operating mode for a new game',()=>{
    const service=new FriendsScenicService();service.dwell=0;expect(service.control(360,false)).toBe(true);let max=0,travel=0;
    for(let i=0;i<600;i++){const old=service.distance;service.update(1000,[],new Set());max=Math.max(max,service.speed);travel+=railWrap(service.distance-old,scenicRailway().length);expect(service.dwell).toBe(0);expect(Number.isFinite(service.speed)).toBe(true);}
    expect(max*.3).toBeGreaterThan(359);expect(travel).toBeGreaterThan(scenicRailway().length);
    service.control(6,false);for(let i=0;i<100;i++)service.update(1000,[],new Set());expect(service.speed*.3).toBeCloseTo(6,1);
    const saved=service.snapshot(),restored=new FriendsScenicService(saved);expect(restored.targetSpeed).toBe(132);expect(restored.autoStops).toBe(true);expect(restored.speed).toBe(0);
    expect(service.control(NaN,true)).toBe(false);expect(service.control(361,true)).toBe(false);expect(validFriendsCommand({action:'scenic_speed',requestId:1,speedKmh:Infinity,stopAtStations:true},false)).toBe(false);
  },60000);
  it('still stops exactly at all stations in express mode',()=>{
    const service=new FriendsScenicService();service.control(360,true);service.dwell=0;let count=0,old=service.nextStop;
    for(let i=0;i<2500&&count<5;i++){service.update(1000,[],new Set());if(old!==service.nextStop){expect(service.speed).toBe(0);expect(Math.abs(railWrap(service.distance-scenicStationPoses()[old].distance-SCENIC_STOP_OFFSET,scenicRailway().length))).toBeLessThan(.001);old=service.nextStop;count++;}}
    expect(count).toBe(5);
  },60000);
  it('requires the actual front controller and host-approved guest access, and replays commands without a second edit',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Guest',color:'#aaa'}]),p=sim['players'].get('host')!,request={requestId:1,action:'scenic_speed' as const,speedKmh:240,stopAtStations:false};
    expect(sim.friendsAction('host',request).ok).toBe(false);const v=sim['friends']!.vehicles().find(v=>v.id==='grand-0')!;Object.assign(p,vehicleWorldPoint(v,{x:52,y:0,z:0}));expect(scenicControlNearby(p,[v])).toBe(true);
    expect(sim.friendsAction('host',{...request,requestId:2}).ok).toBe(true);expect(sim['friends']!.scenic!.targetSpeed).toBeCloseTo(800);
    expect(sim.friendsAction('host',{...request,requestId:2,speedKmh:6}).ok).toBe(true);expect(sim['friends']!.scenic!.targetSpeed).toBeCloseTo(800);
    const guest=sim['players'].get('guest')!;Object.assign(guest,p,{id:'guest'});sim['friendsBuilding']!.setGuestAccess(false);expect(sim.friendsAction('guest',{...request,requestId:3}).ok).toBe(false);
  });
  it('secures placed objects in a wagon frame, keeps exact inclined collision and supports save, move, undo and interpolation',()=>{
    let vehicles=scenicVehicles(90000),v=vehicles[4];const building=new FriendsBuilding();building.vehicleProvider=()=>vehicles;
    const pose={...vehicleWorldPoint(v,{x:56,y:0,z:0}),rotation:0,attachment:{vehicleId:v.id,x:56,y:0,z:0}},p={...actor,...vehicleWorldPoint(v,{x:0,y:0,z:0})};
    expect(building.request(p,{requestId:1,action:'place',shape:'storage',finish:'timber',pose},'host',[]).ok).toBe(true);
    const item=building.getPieces()[0],top=vehicleWorldPoint(v,{x:56,y:0,z:48});expect(friendsBuildFloor([item],top.x,top.y,top.z,0)).toBeCloseTo(top.z,6);
    const hit=raycastFriendsBuild([item],{x:top.x,y:top.y,z:top.z+50,dx:0,dy:0,dz:-1});expect(hit?.distance).toBeCloseTo(50,6);
    const deckEye=vehicleWorldPoint(v,{x:-56,y:0,z:50}),preview=getFriendsBuildPose([], {...deckEye,dx:0,dy:0,dz:-1},'storage',0,undefined,vehicles);expect(preview?.attachment?.vehicleId).toBe(v.id);expect(friendsPlacementError([], 'storage',preview,p,[],undefined,false,undefined,vehicles)).toBeUndefined();
    expect(friendsPlacementError([],'wall',pose,p,[],undefined,false,undefined,vehicles)).toMatch(/clearance/);
    vehicles=scenicVehicles(90500);v=vehicles[4];const moved=building.getPieces()[0],local=vehicleLocalPoint(v,moved);expect(local.x).toBeCloseTo(56,6);expect(local.z).toBeCloseTo(0,6);
    const restored=new FriendsBuilding(building.snapshot());restored.vehicleProvider=()=>vehicles;expect(restored.getPieces()[0].x).toBeCloseTo(moved.x,6);
    Object.assign(p,vehicleWorldPoint(v,{x:0,y:0,z:0}));expect(building.request(p,{requestId:2,action:'remove',pieceId:item.id,expectedRevision:item.revision},'host',[]).ok).toBe(true);expect(building.request(p,{requestId:3,action:'undo'},'host',[]).ok).toBe(true);expect(building.getPieces()[0].attachment?.vehicleId).toBe(v.id);
    expect(friendsBuildCeiling([moved],moved.x,moved.y,moved.z-20)).toBeCloseTo(moved.z,6);
    expect(resolveFriendsBuildPose(item,vehicles).x).toBeCloseTo(moved.x,6);
    // Presentation must preserve each wagon's type and dimensions while following the route.
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);const a=sim.createSnapshot();sim['friends']!.scenic!.distance+=80;const b=sim.createSnapshot(),frame=new CoopSnapshotInterpolator().interpolate(a,b,.5);
    expect(frame.friends!.vehicles.find(v=>v.id==='grand-3')!.wagonKind).toBe('flatbed');expect(frame.friends!.vehicles.find(v=>v.id==='grand-3')!.length).toBe(210);
  });
  it('carries a passenger standing on a secured chest through high-speed curves and rebuilds cargo poses on a guest motion frame',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),service=sim['friends']!.scenic!,building=sim['friendsBuilding']!,p=sim['players'].get('host')!;
    service.distance=90000;service.control(360,false);service.dwell=0;const v=service.vehicles()[4];
    Object.assign(p,vehicleWorldPoint(v,{x:0,y:0,z:0}));expect(building.request(p,{requestId:1,action:'place',shape:'storage',finish:'timber',pose:{...vehicleWorldPoint(v,{x:56,y:0,z:0}),rotation:0,attachment:{vehicleId:v.id,x:56,y:0,z:0}}},'host',[]).ok).toBe(true);
    Object.assign(p,vehicleWorldPoint(v,{x:56,y:0,z:48}));service.speed=1200;
    for(let i=0;i<300;i++){sim.tick(50);const local=vehicleLocalPoint(service.vehicles()[4],p);expect(local.x).toBeCloseTo(56,4);expect(local.y).toBeCloseTo(0,4);expect(local.z).toBeCloseTo(48,4);}
    const host=new FriendsWorldHost(),guest=new FriendsWorldGuest((message:any)=>{if(message.kind==='ack')host.acknowledge('guest',message.epoch,message.revision);},()=>{});
    const before=sim.createSnapshot();host.request('guest');host.update(before);host.pump(['guest'],1000,(_id,packet)=>{guest.receive(packet,1000);return true;},message=>{throw new Error(message);});
    service.distance+=500;const after=sim.createSnapshot();host.update(after);const decoded=guest.decode(host.motion('guest',after));
    expect(decoded).toBeDefined();const car=after.friends!.vehicles.find(v=>v.id==='grand-3')!,load=decoded!.friends!.building!.pieces[0],local=vehicleLocalPoint(car,load);expect(local.x).toBeCloseTo(56,6);expect(local.z).toBeCloseTo(0,6);
  },60000);

});
