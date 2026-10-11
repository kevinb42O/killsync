import { describe,it,expect,vi } from 'vitest';
import { FriendsFishingBoat } from './FriendsFishingBoat';
import { FriendsExpedition, friendsVehicleFloor, carryOnVehicle, resolveFriendsVehicleCollisions } from './FriendsExpedition';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { FISHING_BOAT_ID,FISHING_BOAT_HOME,FISHING_BOAT_HELM,fishingBoatDeckContains } from '../world/FriendsFishingBoat';
import { vehicleWorldPoint, vehicleLocalPoint } from './FriendsVehiclePose';
import { MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame } from './protocol';
import { quantizeAngle,quantizePitch } from './CoopSimulation';
const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:quantizeAngle(Math.PI),aimPitch:quantizePitch(-.3),friendsTool:6,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const actor=(id:string)=>({id,...vehicleWorldPoint(new FriendsFishingBoat().vehicle(),FISHING_BOAT_HELM),lifeState:'alive',friendsSeat:undefined as {vehicleId:string;index:number}|undefined,verticalVelocity:0,crouching:false,swimming:false});
describe('sail-and-fish boat',()=>{
  it('reserves one helm without relocating the player, sails, and stops in place with F',()=>{
    const boat=new FriendsFishingBoat(new FriendsTerrain()),host=actor('host'),guest=actor('guest');
    const boarding={x:host.x,y:host.y,z:host.z};expect(boat.interact(host,[host,guest])).toBe(true);expect({x:host.x,y:host.y,z:host.z}).toEqual(boarding);expect(boat.vehicle().pilotId).toBe(host.id);expect(boat.vehicle().moored).toBe(false);
    expect(boat.interact(guest,[host,guest])).toBe(false);
    const before=boat.vehicle();
    for(let i=1;i<=100;i++)boat.update(50,i*50,[host,guest],new Map([['host',input(i,{movement:i<35?5:1})]]));
    expect(Math.hypot(boat.vehicle().x-before.x,boat.vehicle().y-before.y)).toBeGreaterThan(300);
    expect(boat.vehicle().angle).toBeLessThan(before.angle-.2);
    const release={x:host.x,y:host.y,z:host.z};expect(boat.interact(host,[host,guest])).toBe(true);expect({x:host.x,y:host.y,z:host.z}).toEqual(release);
    expect(boat.vehicle().pilotId).toBeUndefined();expect(host.friendsSeat).toBeUndefined();expect(host.swimming).toBe(false);
    expect(friendsVehicleFloor([boat.vehicle()],host.x,host.y,host.z)).toBeCloseTo(host.z);
    const stopped=boat.save();for(let i=101;i<160;i++)boat.update(50,i*50,[host,guest],new Map([['host',input(i,{movement:1})]]));
    expect(boat.save()).toEqual(stopped);
  });
  it('leaves the berth and reverses steering without abrupt heading steps',()=>{
    const boat=new FriendsFishingBoat(new FriendsTerrain()),p=actor('host');boat.interact(p,[p]);
    let previous=boat.vehicle().angle,previousStep=0,maxDepartureChange=0,maxReversalChange=0;
    for(let i=1;i<=150;i++){
      boat.update(50,i*50,[p],new Map([['host',input(i,{movement:i<=90?5:9})]]));
      const angle=boat.vehicle().angle,step=angle-previous,change=Math.abs(step-previousStep);
      if(i<=90)maxDepartureChange=Math.max(maxDepartureChange,change);else maxReversalChange=Math.max(maxReversalChange,change);
      previous=angle;previousStep=step;
    }
    // Real berth geometry previously caused ~0.024-radian on/off jumps;
    // reversing held steering previously changed by ~0.010 radians per tick.
    expect(maxDepartureChange).toBeLessThan(.009);expect(maxReversalChange).toBeLessThan(.005);
    expect(previousStep).toBeGreaterThan(.024); // Steady turn authority is retained.
    const stopped=boat.save();boat.release(p.id);boat.update(50,7550,[p],new Map([['host',input(151,{movement:9})]]));
    expect(boat.save()).toEqual(stopped);
  });
  it('lets players jump from the actual T head onto the aft deck without remote helm control',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),p=sim['players'].get('host')!;
    Object.assign(p,{x:1820,y:5965,z:-96,verticalVelocity:0,swimming:false});
    const boat=sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!;
    expect(sim['friends']!.fishingBoat.interact(p,[p])).toBe(false);
    for(let i=1;i<45;i++){
      sim.setInput('host',input(i,{movement:p.x>1710?1:0,aimAngle:quantizeAngle(Math.PI),jumpPressed:i===1}));sim.tick(50);
    }
    const v=sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!;
    expect(fishingBoatDeckContains(v,p)).toBe(true);expect(p.swimming).toBe(false);
    expect(friendsVehicleFloor([v],p.x,p.y,p.z)).toBeCloseTo(p.z,3);
  });
  it('carries standing friends through translation, turns and wave heave, and excludes the tapered bow',()=>{
    const expedition=new FriendsExpedition(undefined,undefined,new FriendsTerrain()),host=actor('host'),guest=actor('guest');
    expect(expedition.fishingBoat.interact(host,[host,guest])).toBe(true);
    Object.assign(guest,vehicleWorldPoint(expedition.fishingBoat.vehicle(),{x:-165,y:-42,z:0}));
    for(let i=1;i<=60;i++){
      expedition.update(50,i*50,[host,guest],new Map([['host',input(i,{movement:5})],['guest',input(i)]]));
      const v=expedition.fishingBoat.vehicle(),local=vehicleLocalPoint(v,guest);
      expect(local.x).toBeCloseTo(-165,4);expect(local.y).toBeCloseTo(-42,4);expect(local.z).toBeCloseTo(0,4);
    }
    const v=expedition.fishingBoat.vehicle(),offBow=vehicleWorldPoint(v,{x:215,y:60,z:0});
    expect(fishingBoatDeckContains(v,offBow)).toBe(false);
    const jumper=vehicleWorldPoint(v,{x:-165,y:40,z:60});expect(carryOnVehicle(jumper,v,{...v,x:v.x+100})).toBe(false);
  });
  it('stops before shores, docks and built walls, and blocks walking through the cabin',()=>{
    const boat=new FriendsFishingBoat(new FriendsTerrain()),p=actor('host');boat.interact(p,[p]);
    const start=boat.save();
    const wall={id:999,x:start.x,y:start.y-325,z:-176,rotation:0,shape:'wall' as const,finish:'stone' as const,author:'host',revision:1};
    for(let i=1;i<120;i++)boat.update(50,i*50,[p],new Map([['host',input(i,{movement:1})]]),undefined,[wall]);
    expect(boat.vehicle().y).toBeGreaterThan(wall.y+225);
    const v=boat.vehicle(),point=vehicleWorldPoint(v,{x:60,y:47,z:0});
    expect(resolveFriendsVehicleCollisions([v],point,point.z,19)).toBe(true);
    const local=vehicleLocalPoint(v,point);expect(Math.abs(local.y-47)).toBeGreaterThanOrEqual(20);
    const doorway=vehicleWorldPoint(v,{x:-6,y:0,z:0});expect(resolveFriendsVehicleCollisions([v],doorway,doorway.z,19)).toBe(false);
  });
  it('stays where it stopped during play and returns to the dock on the next game',()=>{
    const boat=new FriendsFishingBoat(new FriendsTerrain()),p=actor('host');boat.interact(p,[p]);
    for(let i=1;i<40;i++)boat.update(50,i*50,[p],new Map([['host',input(i,{movement:5})]]));
    boat.release(p.id);const saved=boat.save();boat.update(50,2000,[],new Map());expect(boat.save()).toEqual(saved);
    expect(Math.hypot(saved.x-FISHING_BOAT_HOME.x,saved.y-FISHING_BOAT_HOME.y)).toBeGreaterThan(100);
    const transport=new FriendsExpedition(undefined,undefined,new FriendsTerrain()).snapshot().transport!;
    transport.fishingBoat=saved;
    const restarted=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}],undefined,undefined,undefined,undefined,undefined,transport);
    for(let i=0;i<3;i++){
      const snapshot=restarted.createSnapshot().friends!;
      expect(snapshot.transport!.fishingBoat).toEqual({...FISHING_BOAT_HOME,moored:true});
      const boat=snapshot.vehicles.find(v=>v.id===FISHING_BOAT_ID)!;
      expect({x:boat.x,y:boat.y,angle:boat.angle,moored:boat.moored}).toEqual({...FISHING_BOAT_HOME,moored:true});
      expect(boat.pilotId).toBeUndefined();expect(boat.speed).toBe(0);expect(boat.rudder).toBe(0);
      restarted.tick(50);
    }
  });
  it('reuses clear navigation cells and invalidates them on same-revision terrain restore',()=>{
    const terrain=new FriendsTerrain(),boat=new FriendsFishingBoat(terrain),spy=vi.spyOn(terrain,'collide');
    expect(boat['terrainBlocked'](1680,5800)).toBe(false);
    const first=spy.mock.calls.length;
    for(let i=0;i<100;i++)expect(boat['terrainBlocked'](1681,5801)).toBe(false);
    expect(spy.mock.calls.length).toBe(first);
    const save=terrain.snapshot();save.edits.push([Math.floor(1680/32),Math.floor(5800/32),0,1]);terrain.restore(save);
    expect(boat['terrainBlocked'](1680,5800)).toBe(true);
    expect(spy.mock.calls.length).toBeGreaterThan(first);
  });
  it('uses real F action edges, keeps standing through bobbing, and casts from the stopped deck',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
    const p=sim['players'].get('host')!;Object.assign(p,actor('host'));
    const command=(n:number,extra:Partial<MultiplayerInputFrame>={})=>{sim.setInput('host',input(n,extra));sim.tick(50);};
    command(1,{interactActionId:1});
    expect(sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!.pilotId).toBe('host');
    for(let i=2;i<82;i++)command(i,{interactActionId:1,movement:5});
    command(82,{interactActionId:2});
    const stopped=sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!;
    expect(Math.hypot(stopped.x-FISHING_BOAT_HOME.x,stopped.y-FISHING_BOAT_HOME.y)).toBeGreaterThan(100);
    expect(stopped.pilotId).toBeUndefined();expect(p.friendsSeat).toBeUndefined();
    for(let i=83;i<183;i++){
      command(i,{interactActionId:2,friendsTool:7});const v=sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!;
      expect(p.swimming).toBe(false);expect(friendsVehicleFloor([v],p.x,p.y,p.z)).toBeCloseTo(p.z,3);
      expect(v.x).toBe(stopped.x);expect(v.y).toBe(stopped.y);
    }
    // Walk through the real rear doorway, then around the locker to the rail.
    let walkSequence=183;
    for(const waypoint of [{x:32,y:0,z:0},{x:-50,y:0,z:0},{x:-50,y:42,z:0},{x:-165,y:42,z:0}]){
      for(let n=0;n<180;n++){
        const v=sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!;
        const target=vehicleWorldPoint(v,waypoint),distance=Math.hypot(target.x-p.x,target.y-p.y);
        if(distance<5)break;
        command(++walkSequence,{interactActionId:2,friendsTool:7,movement:1,aimAngle:quantizeAngle(Math.atan2(target.y-p.y,target.x-p.x))});
      }
      const local=vehicleLocalPoint(sim.createSnapshot().friends!.vehicles.find(v=>v.id===FISHING_BOAT_ID)!,p);
      expect(Math.hypot(local.x-waypoint.x,local.y-waypoint.y)).toBeLessThan(6);
    }
    const fishingAngle=quantizeAngle(stopped.angle+Math.PI/2);
    for(let i=183;i<208;i++)command(++walkSequence,{interactActionId:2,friendsTool:7,aimAngle:fishingAngle,firing:true,fireActionId:1});
    expect(sim.createSnapshot().friends!.fishing!.charges).toHaveLength(1);
    command(++walkSequence,{interactActionId:2,friendsTool:7,aimAngle:fishingAngle,fireActionId:1});
    expect(sim.createSnapshot().friends!.fishing!.casts).toHaveLength(1);
    expect(sim.createSnapshot().friends!.transport!.fishingBoat).toBeDefined();
    let hooked=false,caught=false;
    for(let i=209;i<1100;i++){
      if(sim.createSnapshot().friends!.fishing!.casts[0]?.phase==='bite')hooked=true;
      command(++walkSequence,{interactActionId:2,friendsTool:7,aimAngle:fishingAngle,fireActionId:hooked?2:1,firing:hooked});
      if(sim.createSnapshot().friends!.fishing!.fish.some(f=>f.ownerId==='host')){caught=true;break;}
    }
    expect(caught).toBe(true);expect(p.swimming).toBe(false);
  });
});

it('stops the full hull at a narrow wall between probe columns and resumes after removal',()=>{
  const boat=new FriendsFishingBoat(new FriendsTerrain()),p=actor('host');boat.interact(p,[p]);
  const initial=boat.vehicle(),wall={id:900,x:initial.x+45,y:initial.y-500,z:-176,rotation:1,shape:'wall' as const,finish:'stone' as const,author:'host',revision:1};
  for(let n=1;n<140;n++)boat.update(50,n*50,[p],new Map([['host',input(n,{movement:1})]]),undefined,[wall]);
  expect(boat.vehicle().y).toBeGreaterThan(wall.y+initial.length/2);expect(boat.vehicle().speed).toBe(0);
  for(let n=140;n<240;n++)boat.update(50,n*50,[p],new Map([['host',input(n,{movement:1})]]),undefined,[]);
  expect(boat.vehicle().y).toBeLessThan(wall.y-initial.length/2);
});
