import { SCENIC_STOP_OFFSET } from '../world/FriendsTrainLayout';
import { sampleRailAlignment } from '../world/FriendsRailAlignment';
import { describe,it,expect } from 'vitest';
import { FriendsScenicService,SCENIC_SEATS,scenicVehicles,type ScenicActor } from './FriendsScenicService';
import { vehicleWorldPoint,vehicleLocalPoint } from './FriendsVehiclePose';
import { friendsVehicleFloor,carryOnVehicle,trainGangways } from './FriendsExpedition';
import { scenicRailway,scenicStationPoses } from '../world/FriendsScenicRailway';
import { FriendsSimulation } from './FriendsSimulation';
import { quantizeAngle,quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { CoopSnapshotInterpolator } from './snapshotInterpolation';
import { compactSnapshotWirePayload,SnapshotDecoder } from './snapshotReplication';

const actor=(id='p'):ScenicActor=>({id,lifeState:'alive',x:0,y:0,z:0});
describe('Grand Traverse service and passenger frames',()=>{
  it('makes a complete circuit with every scheduled stop and a seated passenger',()=>{
    const service=new FriendsScenicService(),p=actor();Object.assign(p,vehicleWorldPoint(service.vehicles()[1],{x:0,y:0,z:0}));expect(service.interact(p,[p])).toBe(true);
    service.depart();const seen=new Set<string>(),chapters=new Set<number>();let previous=service.nextStop,stops=0,seconds=0,maxError=0;
    for(;seconds<10000&&stops<5;seconds++){
      service.update(1000,[p],new Set());chapters.add(Number(service.snapshot().chapter&&sampleRailAlignment(scenicRailway(),service.distance).chapter));
      if(service.nextStop!==previous){seen.add(scenicStationPoses()[previous].id);previous=service.nextStop;stops++;expect(service.speed).toBe(0);}
      const seat=p.friendsSeat!,v=service.vehicles().find(v=>v.id===seat.vehicleId)!,expected=vehicleWorldPoint(v,SCENIC_SEATS[seat.index]);maxError=Math.max(maxError,Math.hypot(p.x-expected.x,p.y-expected.y,p.z-expected.z));
      expect(service.speed).toBeGreaterThanOrEqual(0);expect(service.speed).toBeLessThanOrEqual(132);
    }
    expect(stops).toBe(5);expect(seen.size).toBe(5);expect(maxError).toBeLessThan(.00001);expect(chapters.size).toBe(20);expect(seconds).toBeLessThan(8000);
  },60000);
  it('reserves unique seats, releases them with F or jump, and retains the exact car pose',()=>{
    const service=new FriendsScenicService(),players=[actor('a'),actor('b')],v=service.vehicles()[1];
    for(const p of players){Object.assign(p,vehicleWorldPoint(v,{x:0,y:0,z:0}));expect(service.interact(p,players)).toBe(true);}
    expect(players[0].friendsSeat).not.toEqual(players[1].friendsSeat);
    service.update(50,players,new Set(['a']));expect(players[0].friendsSeat).toBeUndefined();expect(players[1].friendsSeat).toBeDefined();expect(service.interact(players[1],players)).toBe(true);expect(players[1].friendsSeat).toBeUndefined();
  });
  it('carries walkers in an inclined rigid frame and keeps both railways’ gangways independent',()=>{
    const a=scenicVehicles(90000)[1],b=scenicVehicles(90100)[1],p=vehicleWorldPoint(a,{x:44,y:12,z:0});
    expect(friendsVehicleFloor([a],p.x,p.y,p.z)).toBeCloseTo(p.z,5);expect(carryOnVehicle(p,a,b)).toBe(true);const q=vehicleLocalPoint(b,p);expect(q.x).toBeCloseTo(44);expect(q.y).toBeCloseTo(12);expect(q.z).toBeCloseTo(0);
    const own=[{...a,id:'sunline-0',scenic:false},{...b,id:'sunline-1',scenic:false}];const links=trainGangways([...scenicVehicles(90000),...own]);expect(links).toHaveLength(10);expect(links.every(l=>Boolean(l.from.scenic)===Boolean(l.to.scenic))).toBe(true);
  });
  it('keeps a standing passenger on an incline through authoritative terrain movement',()=>{
    const simulation=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),p=simulation['players'].get('host')!,service=simulation['friends']!.scenic!;
    service.distance=90000;service.depart();Object.assign(p,vehicleWorldPoint(service.vehicles()[1],{x:0,y:0,z:0}));
    for(let i=0;i<300;i++){simulation.tick(50);const v=service.vehicles()[1];expect(Math.abs(vehicleLocalPoint(v,p).z)).toBeLessThan(.01);}
  });
  it('holds under an obstruction and starts fresh instead of restoring old journeys',()=>{
    const service=new FriendsScenicService();service.depart();for(let i=0;i<1000;i++)service.update(50,[],new Set());expect(service.speed).toBeGreaterThan(0);
    for(let i=0;i<1000;i++)service.update(50,[],new Set(),()=>true);expect(service.speed).toBe(0);expect(service.blocked).toBe(true);
    const save=service.snapshot(),restored=new FriendsScenicService(save);expect(restored.distance).toBeCloseTo(scenicStationPoses()[0].distance+SCENIC_STOP_OFFSET);expect(restored.speed).toBe(0);
    expect(new FriendsScenicService({...save,distance:NaN}).distance).not.toBeNaN();expect(new FriendsScenicService({...save,hash:'old'}).distance).toBeCloseTo(scenicStationPoses()[0].distance+SCENIC_STOP_OFFSET);
  });
  it('replicates seating, follows route curvature between network frames and ignores movement while seated',()=>{
    const simulation=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),p=simulation['players'].get('host')!,service=simulation['friends']!.scenic!;
    Object.assign(p,vehicleWorldPoint(service.vehicles()[1],{x:0,y:0,z:0}));simulation.tick(50);expect(service.interact(p,[p])).toBe(true);
    const a=simulation.createSnapshot();simulation.setInput('host',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:8,aimAngle:quantizeAngle(1),aimPitch:quantizePitch(.2),selectedSlot:0,firing:false,sprinting:true,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});service.depart();simulation.tick(50);
    const b=simulation.createSnapshot(),rider=b.players[0],v=b.friends!.vehicles.find(v=>v.id===rider.friendsSeat!.vehicleId)!;expect(vehicleLocalPoint(v,rider)).toMatchObject(SCENIC_SEATS[rider.friendsSeat!.index]);expect(rider.angle).toBeCloseTo(1,3);
    const interpolated=new CoopSnapshotInterpolator().interpolate(a,b,.5),iv=interpolated.friends!.vehicles.find(v=>v.id===rider.friendsSeat!.vehicleId)!;expect(vehicleLocalPoint(iv,interpolated.players[0]).z).toBeCloseTo(13);
    const decoded=new SnapshotDecoder().decode(compactSnapshotWirePayload(b),1);expect(decoded?.players[0].friendsSeat).toEqual(rider.friendsSeat);expect(decoded?.friends!.scenicRailway?.hash).toBe(scenicRailway().hash);
  });
});
