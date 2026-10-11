import { describe, expect, it } from 'vitest';
import { FriendsStones, stoneCanSkip, STONE_TOOL, STONE_CHARGE_MS } from './FriendsStones';
import type { FishingActor, FishingEnvironment } from './FriendsFishing';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { FriendsSimulation } from './FriendsSimulation';
import { SnapshotDecoder, compactSnapshotWirePayload } from './snapshotReplication';
import { advancePlayerMovement, type PlayerMotionState } from './playerMovement';
import { firstPersonEyeZ } from './FirstPersonEye';

const input=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:quantizeAngle(0),aimPitch:quantizePitch(0),friendsTool:STONE_TOOL,selectedSlot:0,firing:false,fireActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const actor=(id='host',x=0):FishingActor=>({id,x,y:0,z:0,angle:0,lifeState:'alive'});
const env:FishingEnvironment={water:x=>x>80?{level:0,depth:50,bodyId:'lake'}:undefined,floor:x=>x>80?-50:0,blocked:()=>false};
function fixture(environment=env){
  const stones=new FriendsStones(),players=[actor()],hits:string[]=[];let command=input(),now=0;
  const step=(ms=50)=>{for(let t=0;t<ms;t+=50){now+=50;stones.update(50,now,players,new Map([['host',command]]),environment,id=>hits.push(id));}};
  const tap=(pitch=0)=>{command=input({fireActionId:(command.fireActionId??0)+1,aimPitch:quantizePitch(pitch)});step();};
  return {stones,players,hits,step,tap,get now(){return now;},get command(){return command;},set command(c:MultiplayerInputFrame){command=c;}};
}

describe('Friends Fun stones',()=>{
  it('clamps the new slot and keeps mining input inactive',()=>{expect(clampInputFrame(input()).friendsTool).toBe(8);});
  it('launches along the center view ray at every pitch and posture, then falls under gravity',()=>{
    for(const pitch of [-1.3,-.4,0,.8,1.3])for(const posture of [{},{sliding:true},{friendsSeat:{vehicleId:'bench',index:0}}]){
      const stones=new FriendsStones(),p={...actor(),z:100,...posture},angle=1.1;
      const environment={...env,water:()=>undefined,floor:()=>undefined};
      const commands=new Map([[p.id,input({fireActionId:1,aimAngle:quantizeAngle(angle),aimPitch:quantizePitch(pitch)})]]);
      stones.update(0,50,[p],commands,environment,()=>{});
      const launch=stones.snapshot().stones[0],speed=Math.hypot(launch.vx,launch.vy,launch.vz);
      expect(launch.vx/speed).toBeCloseTo(Math.cos(angle)*Math.cos(pitch),4);
      expect(launch.vy/speed).toBeCloseTo(Math.sin(angle)*Math.cos(pitch),4);
      expect(launch.vz/speed).toBeCloseTo(Math.sin(pitch),4);
      expect(launch.x-p.x).toBeCloseTo(launch.vx/speed*6);
      expect(launch.y-p.y).toBeCloseTo(launch.vy/speed*6);
      expect(launch.z-firstPersonEyeZ(p)).toBeCloseTo(launch.vz/speed*6);
      for(let i=1;i<=4;i++)stones.update(50,50+i*50,[p],commands,environment,()=>{});
      const flight=stones.snapshot().stones[0];
      expect(flight.vz).toBeCloseTo(launch.vz-230*.2);
      expect(flight.z).toBeLessThan(launch.z+launch.vz*.2);
      expect(flight.x).toBeCloseTo(launch.x+launch.vx*.2);
      expect(flight.y).toBeCloseTo(launch.y+launch.vy*.2);
    }
  });
  it('uses the ceiling-adjusted viewpoint and cannot release through a close wall',()=>{
    const stones=new FriendsStones(),p=actor(),commands=new Map([[p.id,input({fireActionId:1})]]);
    const environment={...env,eyeCeiling:()=>45};
    stones.update(0,50,[p],commands,environment,()=>{});
    expect(stones.snapshot().stones[0].z).toBeCloseTo(42,3);
    const blocked=new FriendsStones();
    blocked.update(0,50,[p],commands,{...environment,blocked:(a,b)=>a.x<3&&b.x>=3},()=>{});
    expect(blocked.snapshot().stones).toHaveLength(0);
  });
  it('charges once, throws on release and refills without repeating held or replayed input',()=>{
    const f=fixture();f.command=input({fireActionId:1,firing:true});f.step(STONE_CHARGE_MS);
    expect(f.stones.snapshot().stones).toHaveLength(0);expect(f.stones.snapshot().equipped[0].chargeAt).toBe(50);
    f.command={...f.command,firing:false};f.step();expect(f.stones.snapshot().stones).toHaveLength(1);
    expect(f.stones.snapshot().stones[0].vx).toBeCloseTo(700);expect(f.stones.snapshot().equipped[0].readyAt).toBeGreaterThan(f.now);
    f.step(200);expect(f.stones.snapshot().stones).toHaveLength(1);
    f.command={...f.command,fireActionId:2};f.step();expect(f.stones.snapshot().stones).toHaveLength(1);
    f.step(300);f.command={...f.command,fireActionId:1};f.step();expect(f.stones.snapshot().stones).toHaveLength(1);
  });
  it('skips several times at a shallow angle and sinks on a steep impact',()=>{
    const shallow=fixture();shallow.command=input({fireActionId:1,firing:true});shallow.step(STONE_CHARGE_MS+50);
    shallow.command={...shallow.command,firing:false};shallow.step();shallow.step(1400);
    expect(shallow.stones.snapshot().stones[0]?.skips).toBeGreaterThanOrEqual(2);
    expect(shallow.stones.snapshot().splashes.some(s=>s.skip>0)).toBe(true);
    const steep=fixture();steep.tap(-.7);steep.step(700);
    expect(steep.stones.snapshot().stones).toHaveLength(0);
    expect(stoneCanSkip(400,-70,0)).toBe(true);expect(stoneCanSkip(400,-300,0)).toBe(false);expect(stoneCanSkip(100,-10,0)).toBe(false);
  });
  it('hits a friend once, skips its owner, and cannot hit through a wall',()=>{
    const dry={...env,water:()=>undefined,floor:()=>0},f=fixture(dry);f.players.push(actor('friend',100));f.tap();f.step(400);
    expect(f.hits).toEqual(['friend']);expect(f.stones.snapshot().stones).toHaveLength(0);
    const wall=fixture({...dry,blocked:(a,b)=>a.x<60&&b.x>=60});wall.players.push(actor('friend',100));wall.tap();wall.step(400);expect(wall.hits).toEqual([]);
  });
  it('cancels a charge when stowed, in a skiff, swimming, piloting, or input is stale',()=>{
    for(const cancel of ['blocked','seat','oppositeSeat','swim','tool','stale','pilot']){
      const f=fixture({...env,piloting:()=>cancel==='pilot'});f.command=input({fireActionId:1,firing:true});f.step();
      if(cancel==='seat')f.players[0].friendsSeat={vehicleId:'reedwater-skiff',index:0};
      if(cancel==='oppositeSeat')f.players[0].friendsSeat={vehicleId:'deepmere-skiff',index:0};
      if(cancel==='swim')f.players[0].swimming=true;
      f.command={...f.command,firing:false,friendsFishingBlocked:cancel==='blocked',friendsTool:cancel==='tool'?6:8};
      if(cancel==='stale')f.stones.update(50,f.now+50,f.players,new Map(),env,()=>{});else f.step();
      expect(f.stones.snapshot().stones).toHaveLength(0);
    }
  });
  it('throws at friends from benches and campfire chairs',()=>{
    for(const vehicleId of ['bench','commons-campfire']){const f=fixture({...env,water:()=>undefined,floor:()=>0});f.players[0].friendsSeat={vehicleId,index:0};f.players.push(actor('friend',100));f.tap();f.step(400);expect(f.hits).toEqual(['friend']);}
  });
  it('replicates harmless player hits through the real snapshot codec',()=>{
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Friend',color:'#f00'}]);
    const host=s['players'].get('host')!,guest=s['players'].get('guest')!;
    Object.assign(host,{x:6500,y:5500,z:s['friendsFrontier']!.terrain.surfaceHeight(6500,5500)});
    Object.assign(guest,{x:6600,y:5500,z:host.z});const health=guest.health;
    for(let i=0;i<10;i++){s.setInput('host',input({sequence:i+1,fireActionId:1}));s.tick(50);}
    const frame=s.createSnapshot();expect(guest.health).toBe(health);expect(frame.combatEvents.some(e=>e.kind==='player_damaged'&&e.playerId==='guest'&&e.amount===0)).toBe(true);
    const decoded=new SnapshotDecoder().decode(compactSnapshotWirePayload(frame),1)!;
    expect(decoded.friends!.stones).toEqual(frame.friends!.stones);
  });
});

describe('hard landing presentation',()=>{
  const motion=(z:number):PlayerMotionState=>({x:1000,y:1000,z,angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:0});
  it('emits one hard impact and leaves small jumps and flight quiet',()=>{
    for(const [height,expected] of [[500,1],[70,0]]){
      const p=motion(height),hits:number[]=[];
      for(let i=0;i<70;i++)advancePlayerMovement(p,input({friendsTool:6}),50,undefined,undefined,()=>0,'friends_frontier',{elevationAware:true,volumetric:true,ceiling:6000,onLanding:speed=>hits.push(speed)});
      expect(p.z).toBe(0);expect(hits).toHaveLength(expected);
    }
    const flying=motion(500),hits:number[]=[];
    advancePlayerMovement(flying,input({friendsDevFlight:true}),50,undefined,undefined,()=>0,'friends_frontier',{elevationAware:true,volumetric:true,devFlightAllowed:true,ceiling:6000,onLanding:speed=>hits.push(speed)});
    expect(hits).toHaveLength(0);
  });
  it('broadcasts the red-overlay event after a real high fall without removing health',()=>{
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),p=s['players'].get('host')!;
    const floor=s['friendsFrontier']!.terrain.surfaceHeight(p.x,p.y),health=p.health;p.z=floor+500;
    const hits=new Set<number>();
    for(let i=0;i<50;i++){s.setInput('host',input({sequence:i+1,friendsTool:6}));s.tick(50);for(const e of s.createSnapshot().combatEvents)if(e.kind==='player_damaged'&&e.amount===0)hits.add(e.id);}
    expect(p.health).toBe(health);expect(hits.size).toBe(1);
  });
});
