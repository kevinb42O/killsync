import { describe, expect, it } from 'vitest';
import { FriendsBirds, BIRD_PATIENCE_MS, SEEDS_TOOL } from './FriendsBirds';
import type { BirdEnvironment } from './FriendsBirds';
import type { FishingActor } from './FriendsFishing';
import { MULTIPLAYER_PROTOCOL_VERSION, clampInputFrame, type MultiplayerInputFrame } from './protocol';
import { quantizePitch } from './CoopSimulation';
import { FriendsSimulation } from './FriendsSimulation';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';
import { RETREAT_SEATS } from '../world/FriendsRetreatSites';
import { FriendsWorldHost, FriendsWorldGuest } from './FriendsWorldReplication';

const input=(extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:1,clientTime:0,movement:0,aimAngle:0,aimPitch:quantizePitch(0),friendsTool:SEEDS_TOOL,selectedSlot:0,firing:false,fireActionId:0,aiming:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false,...extra});
const env:BirdEnvironment={floor:()=>0,water:()=>undefined,blocked:()=>false,outdoors:()=>true};
function fixture(random=()=>0,environment=env){
  const birds=new FriendsBirds(random),p:FishingActor={id:'host',x:0,y:0,z:0,angle:0,lifeState:'alive'};let now=0,command=input();
  const step=(ms=50)=>{for(let i=0;i<ms;i+=50){now+=50;birds.update(50,now,[p],new Map([[p.id,command]]),environment);}};
  return {birds,p,step,get command(){return command;},set command(c:MultiplayerInputFrame){command=c;}};
}

describe('Friends seed hands and curious birds',()=>{
  it('scatters exactly once per primary action and attracts a small feeding flock',()=>{
    const f=fixture(()=>.5);f.command=input({fireActionId:1,firing:true});f.step();
    expect(f.birds.snapshot().patches).toHaveLength(1);expect(f.birds.snapshot().birds).toHaveLength(2);
    f.step(5000);expect(f.birds.snapshot().patches).toHaveLength(1);expect(f.birds.snapshot().birds.every(b=>b.phase==='feeding')).toBe(true);
    expect(new Set(f.birds.snapshot().birds.map(b=>b.id)).size).toBe(2);expect(f.birds.snapshot().birds.every(b=>b.atMs>2000)).toBe(true);
    f.step(21000);expect(f.birds.snapshot().birds.every(b=>b.phase==='perched')).toBe(true);
    f.step(30000);expect(f.birds.snapshot().birds).toHaveLength(0);f.step(5000);expect(f.birds.snapshot().patches).toHaveLength(0);
  });
  it('offers an arm without scattering and lets a visitor land, peck and eat the visible seeds',()=>{
    const f=fixture();f.command=input({aiming:true,fireActionId:1});f.step(BIRD_PATIENCE_MS);
    expect(f.birds.snapshot().patches).toHaveLength(0);expect(f.birds.snapshot().birds).toHaveLength(0);
    f.step(50);expect(f.birds.snapshot().birds[0]?.ownerId).toBe('host');
    f.step(2500);expect(f.birds.snapshot().birds[0]?.phase).toBe('feeding');
    f.step(3000);expect(f.birds.snapshot().equipped[0].amount).toBeGreaterThan(0);expect(f.birds.snapshot().equipped[0].amount).toBeLessThan(.6);
    f.step(3300);expect(f.birds.snapshot().birds[0].phase).toBe('perched');expect(f.birds.snapshot().equipped[0]).toMatchObject({holding:true,amount:0});
    const id=f.birds.snapshot().birds[0].id;f.step(120000);expect(f.birds.snapshot().birds).toHaveLength(1);expect(f.birds.snapshot().birds[0]).toMatchObject({id,phase:'perched'});expect(f.birds.snapshot().equipped[0].amount).toBe(0);
    f.command=input({aiming:false});f.step();expect(f.birds.snapshot().birds[0].phase).toBe('leaving');
  });
  it('ignites birds that land on seeds scattered into the real campfire, then lets them fly away',()=>{
    const f=fixture(()=>0,{...env,floor:()=>FRIENDS_CAMPFIRE.z});Object.assign(f.p,{x:FRIENDS_CAMPFIRE.x-65,y:FRIENDS_CAMPFIRE.y,z:FRIENDS_CAMPFIRE.z});
    f.command=input({fireActionId:1});f.step();expect(f.birds.snapshot().patches[0].inFire).toBe(true);
    f.step(3900);expect(f.birds.snapshot().birds[0]).toMatchObject({phase:'leaving'});expect(f.birds.snapshot().birds[0].burningUntil).toBeGreaterThan(3950);
    f.step(3000);expect(f.birds.snapshot().birds).toHaveLength(0);
    const cold=fixture();cold.command=input({fireActionId:1});cold.step(6000);expect(cold.birds.snapshot().birds[0].burningUntil).toBeUndefined();
  });
  it('keeps hand visits probabilistic and resets patience after movement',()=>{
    const noVisitor=fixture(()=>.99);noVisitor.command=input({aiming:true});noVisitor.step(60000);expect(noVisitor.birds.snapshot().birds).toHaveLength(0);
    const f=fixture();f.command=input({aiming:true});f.step(6000);f.p.x+=6;f.step(4000);expect(f.birds.snapshot().birds).toHaveLength(0);
    f.step(6000);expect(f.birds.snapshot().birds).toHaveLength(1);
    f.p.x+=6;f.step();expect(f.birds.snapshot().birds[0].phase).toBe('leaving');
  });
  it('works on an outdoor bench and makes perched birds flee when the arm lowers or turns',()=>{
    for(const action of ['release','turn','tool','disconnect']){
      const f=fixture();f.p.friendsSeat={vehicleId:'skyfalls-bench',index:0};f.command=input({aiming:true});f.step(11000);
      expect(f.birds.snapshot().birds[0]?.phase).toBe('feeding');
      if(action==='release')f.command=input({aiming:false});
      if(action==='turn')f.p.angle+=.4;
      if(action==='tool')f.command=input({friendsTool:6});
      if(action==='disconnect')f.birds.update(50,11050,[],new Map(),env);else f.step();
      expect(f.birds.snapshot().birds[0]?.phase).toBe('leaving');
    }
  });
  it('does not attract birds indoors, while swimming, flying, or piloting',()=>{
    for(const state of ['indoor','swim','flight','pilot','blocked']){
      const f=fixture(()=>0,{...env,outdoors:()=>state!=='indoor',piloting:()=>state==='pilot'});
      f.p.swimming=state==='swim';f.p.friendsDevFlight=state==='flight';f.command=input({aiming:true,friendsFishingBlocked:state==='blocked'});f.step(30000);
      expect(f.birds.snapshot().birds).toHaveLength(0);
    }
  });
  it('uses the real outdoor seat and preserves bird visits through island baseline/motion replication',()=>{
    expect(clampInputFrame(input()).friendsTool).toBe(9);
    const s=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]),p=s['players'].get('host')!,seat=RETREAT_SEATS.find(s=>s.siteId==='skyfalls-bench')!;
    Object.assign(p,{x:seat.x,y:seat.y,z:seat.z,friendsSeat:{vehicleId:seat.siteId,index:seat.index}});
    (s['friends'] as unknown as {birds:FriendsBirds}).birds=new FriendsBirds(()=>0);
    for(let i=0;i<440;i++){s.setInput('host',input({sequence:i+1,aiming:true}));s.tick(50);}
    const snapshot=s.createSnapshot();expect(snapshot.friends!.birds!.birds[0]?.phase).toBe('perched');expect(snapshot.projectiles).toHaveLength(0);
    const host=new FriendsWorldHost();let guest:FriendsWorldGuest;guest=new FriendsWorldGuest((m:any)=>{if(m.kind==='ack')host.acknowledge('peer',m.epoch,m.revision);},()=>{});
    host.update(snapshot);for(let now=0;now<2000;now+=50)host.pump(['peer'],now,(_id,packet)=>{guest.receive(packet,now);return true;},e=>{throw Error(e);});
    expect(guest.decode(host.motion('peer',snapshot))?.friends?.birds).toEqual(snapshot.friends!.birds);
    expect(new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot().friends!.birds!.birds).toHaveLength(0);
  });
});
