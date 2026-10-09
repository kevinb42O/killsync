import { describe, expect, it } from 'vitest';
import { FriendsFishing, FISHING_BITE_MS, FISHING_CAST_MS, FISHING_REEL_MS, FISHING_WAIT_MIN_MS, FISHING_WAIT_MAX_MS, LOOSE_FISH_LIMIT, fishLengthCm, fishingCatchSize, type FishingActor, type FishingEnvironment } from './FriendsFishing';
import { SnapshotDecoder, compactSnapshotWirePayload } from './snapshotReplication';
import { FriendsSimulation } from './FriendsSimulation';
import { friendsToolInput } from './FriendsToolControls';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { FRIENDS_RIVERS } from '../world/FriendsHydrology';
import { ISLAND_LAKES } from '../world/FriendsIsland';

const input=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:Math.round((-.3+Math.PI*.44)/(Math.PI*.88)*65535),friendsTool:7,selectedSlot:0,firing:false,fireActionId:0,altFireActionId:0,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const player=():FishingActor=>({id:'host',x:0,y:0,z:0,angle:0,lifeState:'alive'});
const environment:FishingEnvironment={water:(x)=>x>=80?{level:0,depth:40,bodyId:'test'}:undefined,floor:(x)=>x>=80?-40:0,blocked:()=>false};
const fixtureBiteDelay=FISHING_CAST_MS+(FISHING_WAIT_MIN_MS+FISHING_WAIT_MAX_MS)/2+50;
function fixture(sizeRandom=.5,env:FishingEnvironment=environment){
  let samples=0;
  const fishing=new FriendsFishing(()=>++samples%2?.5:sizeRandom),p=player();let now=0,command=input();
  const step=(ms=50)=>{for(let t=0;t<ms;t+=50){now+=50;fishing.update(50,now,[p],new Map([[p.id,command]]),env);}};
  const click=()=>{command={...command,fireActionId:(command.fireActionId??0)+1,firing:true};step();};
  const catchFish=()=>{click();step(fixtureBiteDelay);expect(fishing.snapshot().casts[0]?.phase).toBe('bite');click();step(FISHING_REEL_MS);expect(fishing.held(p.id)).toBeDefined();};
  return {fishing,p,step,click,catchFish,get now(){return now;},set command(i:MultiplayerInputFrame){command=i;},get command(){return command;}};
}

describe('casual Friends fishing',()=>{
  it('measures nose-to-tail length and makes giants rare without removing them',()=>{
    expect(fishLengthCm(.45)).toBe(38);expect(fishLengthCm(4.2)).toBe(357);
    const sizes=Array.from({length:10000},(_,i)=>fishingCatchSize(i/10000));
    expect(sizes.every(s=>s>=.45&&s<=4.2)).toBe(true);
    expect(sizes.filter(s=>s>=2)).toHaveLength(150);
    expect(sizes.filter(s=>s<1).length).toBeGreaterThan(5000);
    expect(fishingCatchSize(1)).toBeCloseTo(4.2);
  });
  it('pulls a taut bobber when walking away while preserving its paid-out length and bite timing',()=>{
    const f=fixture(.5,{...environment,water:()=>({level:0,depth:40,bodyId:'test'}),floor:()=>-40});f.click();f.step(700);const before=f.fishing.snapshot().casts[0];
    f.p.x=-90;f.step(1600);const after=f.fishing.snapshot().casts[0];
    expect(after.x).toBeLessThan(before.x-30);expect(after.lineLength).toBe(before.lineLength);expect(after.biteAt).toBe(before.biteAt);
    const x=after.x;f.p.x+=40;f.step(500);expect(f.fishing.snapshot().casts[0].x).toBeCloseTo(x);
  });
  it('retrieves safely when a dragged bobber reaches the dry bank',()=>{
    const f=fixture();f.click();f.step(700);f.p.x=-170;f.step(3500);
    expect(f.fishing.snapshot().casts).toHaveLength(0);expect(f.fishing.snapshot().fish).toHaveLength(0);
  });
  it('preserves the original catcher when another player picks up the fish',()=>{
    const f=fixture();f.catchFish();f.command={...f.command,altFireActionId:1};f.step(1200);
    const guest={...f.p,id:'guest'};expect(f.fishing.pickup(guest,7,f.now,environment)).toBe(true);
    expect(f.fishing.held('guest')?.caughtBy).toBe('host');
  });
  it('blocks pickup across walls and keeps initial releases on the clear side',()=>{
    const f=fixture();f.catchFish();f.command={...f.command,altFireActionId:1};f.step(1200);
    expect(f.fishing.pickup(f.p,7,f.now,{blocked:()=>true})).toBe(false);
    expect(f.fishing.pickup(f.p,7,f.now,environment)).toBe(true);
    const wall={...environment,blocked:(a:{x:number},b:{x:number})=>a.x<10&&b.x>=10};
    f.fishing.update(50,f.now+50,[f.p],new Map([['host',{...f.command,altFireActionId:2}]]),wall);
    expect(f.fishing.snapshot().fish[0].x).toBeLessThan(10);
  });
  it('allows fishing in retreat and skiff seats but keeps operating seats blocked',()=>{
    for(const vehicleId of ['skyfalls-bench','reedwater-skiff','deepmere-skiff']){
      const f=fixture();f.p.friendsSeat={vehicleId,index:0};f.catchFish();expect(f.fishing.held('host')).toBeDefined();
    }
    const f=fixture();f.p.friendsSeat={vehicleId:'rail-train',index:0};f.click();expect(f.fishing.snapshot().casts).toHaveLength(0);
  });

  it('casts, signals a bite, automatically reels and holds exactly one fish despite repeated held input',()=>{
    const f=fixture();f.click();expect(f.fishing.snapshot().casts[0].phase).toBe('casting');
    f.step(FISHING_CAST_MS);expect(f.fishing.snapshot().casts[0].phase).toBe('waiting');
    f.step(fixtureBiteDelay-FISHING_CAST_MS);expect(f.fishing.snapshot().casts[0].phase).toBe('bite');f.click();f.step(FISHING_REEL_MS+500);
    expect(f.fishing.snapshot().casts).toHaveLength(0);expect(f.fishing.snapshot().fish).toHaveLength(1);expect(f.fishing.held('host')?.phase).toBe('held');
    f.step(4000);expect(f.fishing.held('host')).toBeDefined();
  });
  it('gives another bite after a miss and cancels early retrieval without manufacturing a fish',()=>{
    const f=fixture();f.click();f.step(fixtureBiteDelay);expect(f.fishing.snapshot().casts[0].phase).toBe('bite');f.step(FISHING_BITE_MS);expect(f.fishing.snapshot().casts[0].phase).toBe('waiting');
    f.step(9500);expect(f.fishing.snapshot().casts[0].phase).toBe('bite');expect(f.fishing.snapshot().fish).toHaveLength(0);
    f.command={...f.command,aiming:true};f.step(500);expect(f.fishing.snapshot().casts).toHaveLength(0);
    f.command={...f.command,aiming:false};f.click();f.step(700);f.click();f.step(500);expect(f.fishing.snapshot().casts).toHaveLength(0);
  });
  it('randomizes bites over a wide window and draws a fresh delay after a miss',()=>{
    const delays=[0,.25,.5,.999].map(random=>{
      const fishing=new FriendsFishing(()=>random),p=player(),command=input({fireActionId:1});
      fishing.update(50,50,[p],new Map([[p.id,command]]),environment);
      const cast=fishing.snapshot().casts[0],delay=cast.biteAt-50-FISHING_CAST_MS;
      expect(delay).toBeGreaterThanOrEqual(FISHING_WAIT_MIN_MS);expect(delay).toBeLessThan(FISHING_WAIT_MAX_MS);
      return delay;
    });
    expect(delays[3]-delays[0]).toBeGreaterThan(20000);
    const samples=[.1,.5,.9],fishing=new FriendsFishing(()=>samples.shift()??.5),p=player(),command=input({fireActionId:1}),commands=new Map([[p.id,command]]);
    fishing.update(50,50,[p],commands,environment);
    const biteAt=fishing.snapshot().casts[0].biteAt;
    fishing.update(50,750,[p],commands,environment);fishing.update(50,biteAt,[p],commands,environment);
    fishing.update(50,biteAt+FISHING_BITE_MS,[p],commands,environment);
    expect(fishing.snapshot().casts[0].biteAt-biteAt-FISHING_BITE_MS).toBe(13000);
  });
  it('rejects land, obstructed casts, swimming, seats and building; changing tools cancels a cast',()=>{
    for(const env of [{...environment,water:()=>undefined},{...environment,blocked:()=>true}]){
      const fishing=new FriendsFishing();fishing.update(50,50,[player()],new Map([['host',input({fireActionId:1})]]),env);expect(fishing.snapshot().casts).toHaveLength(0);
    }
    for(const p of [{...player(),swimming:true},{...player(),friendsSeat:{vehicleId:'boat',index:0}}]){
      const fishing=new FriendsFishing();fishing.update(50,50,[p],new Map([['host',input({fireActionId:1})]]),environment);expect(fishing.snapshot().casts).toHaveLength(0);
    }
    const f=fixture();f.click();f.command={...f.command,friendsFishingBlocked:true};f.step();expect(f.fishing.snapshot().casts).toHaveLength(0);
    f.command={...f.command,friendsFishingBlocked:false};f.click();f.command={...f.command,friendsTool:6};f.step();expect(f.fishing.snapshot().casts).toHaveLength(0);
  });
  it.each([0,.5,.999])('drops, picks up and throws a fish of size sample %s back into water',sizeRandom=>{
    const f=fixture(sizeRandom);f.catchFish();f.command={...f.command,altFireActionId:1};f.step(1200);
    expect(f.fishing.snapshot().fish[0].phase).toBe('dry');expect(f.fishing.pickup(f.p,7,f.now)).toBe(true);expect(f.fishing.pickup({...f.p,id:'guest'},7,f.now)).toBe(false);
    f.click();f.step(2000);expect(f.fishing.snapshot().fish[0].phase).toBe('swimming');f.step(5000);expect(f.fishing.snapshot().fish).toHaveLength(0);
  });
  it('keeps bridge drops dry and releases held fish on tool change/disconnection',()=>{
    const f=fixture();f.catchFish();f.p.x=100;f.p.z=30;f.command={...f.command,friendsTool:6};f.step();expect(f.fishing.held('host')).toBeUndefined();
    const bridge={...environment,floor:()=>30};for(let i=0;i<30;i++)f.fishing.update(50,f.now+i*50,[f.p],new Map([['host',f.command]]),bridge);
    expect(f.fishing.snapshot().fish[0].phase).toBe('dry');expect(f.fishing.snapshot().fish[0].z).toBeGreaterThan(30);
    expect(f.fishing.pickup(f.p,6,f.now+1600)).toBe(true);f.fishing.update(50,f.now+1650,[],new Map(),bridge);expect(f.fishing.held('host')).toBeUndefined();
  });
  it('bounds loose fish and expires unattended fish while retaining held catches',()=>{
    const f=fixture();for(let i=0;i<LOOSE_FISH_LIMIT+4;i++){f.catchFish();f.command={...f.command,altFireActionId:i+1};f.step(1200);}
    expect(f.fishing.snapshot().fish.length).toBeLessThanOrEqual(LOOSE_FISH_LIMIT);
    f.catchFish();f.p.x=-3000;f.step(92000);expect(f.fishing.snapshot().fish).toHaveLength(1);expect(f.fishing.held('host')).toBeDefined();
  });
  it('enforces the loose limit when many held catches are released together, without deleting a held fish',()=>{
    const fishing=new FriendsFishing(()=>.5),players=Array.from({length:LOOSE_FISH_LIMIT+4},(_,i)=>({...player(),id:`angler-${i}`}));
    const commands=(fireActionId:number,release=false)=>new Map(players.map((p,i)=>[p.id,input({fireActionId,altFireActionId:release&&i>0?1:0})]));
    fishing.update(50,50,players,commands(1),environment);
    fishing.update(50,750,players,commands(1),environment);
    fishing.update(50,20000,players,commands(1),environment);
    fishing.update(50,20050,players,commands(2),environment);
    const caughtAt=20050+FISHING_REEL_MS;
    fishing.update(50,caughtAt,players,commands(2),environment);
    expect(fishing.snapshot().fish.every(f=>f.phase==='held')).toBe(true);
    expect(fishing.snapshot().fish).toHaveLength(players.length);
    fishing.update(50,caughtAt+50,players,commands(2,true),environment);
    expect(fishing.snapshot().fish.filter(f=>f.phase!=='held'&&f.phase!=='fading')).toHaveLength(LOOSE_FISH_LIMIT);
    expect(fishing.held(players[0].id)).toBeDefined();
    fishing.update(50,caughtAt+1050,players,commands(2,true),environment);
    expect(fishing.snapshot().fish).toHaveLength(LOOSE_FISH_LIMIT+1);
  });
  it('uses the shared water field across lakes, rivers and sea rather than fishing zones',()=>{
    const points=[...ISLAND_LAKES.map(l=>({x:l.x,y:l.y})),...FRIENDS_RIVERS.map(r=>r.points[Math.floor(r.points.length/2)]),{x:0,y:24000}];let checked=0;
    for(const point of points){const w=friendsWaterAt(point.x,point.y);if(!w)continue;
      const p={...player(),...point,z:w.level+32};const fishing=new FriendsFishing(()=>.5);
      fishing.update(50,50,[p],new Map([['host',input({fireActionId:1})]]),{...environment,water:friendsWaterAt});
      expect(fishing.snapshot().casts).toHaveLength(1);checked++;
    }expect(checked).toBeGreaterThanOrEqual(6);
  });
  it('accepts slot 7 over the wire and never treats it as a harvesting tool',()=>{
    expect(clampInputFrame(input({friendsTool:7})).friendsTool).toBe(7);expect(friendsToolInput(7,true,true).held).toBe(false);
  });
  it('runs the real host loop on a lake platform without firing weapons or mining; snapshots replicate the catch',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);const internal=sim as any,p=internal.players.get('host');
    Object.assign(p,{x:12128,y:23600,z:224,verticalVelocity:0,friendsDevFlight:false});internal.friendsFrontier.terrain.set(Math.floor(p.x/32),Math.floor(p.y/32),6,2);
    let action=1,caught=false;
    for(let i=1;i<=750;i++){
      const state=sim.createSnapshot().friends?.fishing;if(state?.casts[0]?.phase==='bite'&&action===1)action=2;
      sim.setInput('host',input({sequence:i,fireActionId:action,firing:true}));sim.tick(50);
      if(sim.createSnapshot().friends?.fishing?.fish.some(f=>f.ownerId==='host')){caught=true;break;}
    }
    expect(caught).toBe(true);const snapshot=sim.createSnapshot();expect(new SnapshotDecoder().decode(compactSnapshotWirePayload(snapshot),1)?.friends?.fishing).toEqual(snapshot.friends?.fishing);expect(new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}],1,snapshot.friends!.progress,snapshot.friends!.building,snapshot.friends!.projects,snapshot.friends!.frontier,snapshot.friends!.transport).createSnapshot().friends?.fishing?.fish).toHaveLength(0);expect(sim.createSnapshot().projectiles).toHaveLength(0);expect(sim.createSnapshot().friends?.frontier?.interaction?.actions.host).toBeUndefined();
  });
});
