import { FriendsSimulation } from './FriendsSimulation';
import { describe, expect, it } from 'vitest';
import { advancePlayerMovement, type PlayerMotionState } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FRIENDS_RIVERS } from '../world/FriendsHydrology';
import { friendsWaterGround, friendsWaterLevel } from '../world/FriendsWaterSurface';
import { FriendsTerrain } from '../world/FriendsTerrain';

const input=(sequence:number,extra:Partial<MultiplayerInputFrame>={}):MultiplayerInputFrame=>({
  type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:0,aimAngle:0,
  aimPitch:32768,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,
  jumpPressed:false,dashPressed:false,...extra,
});
const actor=(extra:Partial<PlayerMotionState>={}):PlayerMotionState=>({x:12128,y:23600,z:136.5,
  angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:0,...extra});
const move=(p:PlayerMotionState,command=input(1),ms=50,floor=(p:{x:number;y:number;z?:number})=>friendsWaterGround(p.x,p.y))=>
  advancePlayerMovement(p,command,ms,undefined,undefined,floor,'friends_frontier',{elevationAware:true,volumetric:true,ceiling:6000,stepHeight:8});

describe('frontier swimming and diving',()=>{
  it('floats at the surface and preserves neutral buoyancy underwater without jet fuel',()=>{
    const surface=actor(),deep=actor({z:-350,verticalVelocity:-1000,sliding:true,jetActive:true,jetFuel:0});
    for(let i=0;i<80;i++){move(surface,input(i));move(deep,input(i));}
    expect(surface.z).toBeCloseTo(136.5,5);expect(surface.swimSubmerged).toBe(false);
    expect(deep.z).toBeGreaterThan(-375);expect(deep.z).toBeLessThan(-350);
    expect(deep.verticalVelocity).toBeCloseTo(0,5);expect(deep.swimSubmerged).toBe(true);
    expect(deep.sliding).toBe(false);expect(deep.jetActive).toBe(false);expect(deep.jetFuel).toBe(100);
  });
  it('dives with crouch, holds depth on release, and surfaces with held Space',()=>{
    const p=actor();for(let i=0;i<60;i++)move(p,input(i,{sliding:true}));
    expect(p.z).toBeLessThan(-120);expect(p.swimSubmerged).toBe(true);
    for(let i=60;i<80;i++)move(p,input(i));const depth=p.z;
    for(let i=80;i<100;i++)move(p,input(i));expect(Math.abs(p.z-depth)).toBeLessThan(.01);
    for(let i=100;i<180;i++)move(p,input(i,{jetHeld:true}));
    expect(p.z).toBeCloseTo(136.5,4);expect(p.swimSubmerged).toBe(false);expect(p.jetActive).toBe(false);
  });
  it('swims toward the camera pitch and never tunnels through the real lakebed',()=>{
    const p=actor(),terrain=new FriendsTerrain();
    for(let i=0;i<200;i++)move(p,input(i,{sliding:true}),50,q=>terrain.floor(q.x,q.y,q.z??p.z,0)??-416);
    expect(p.z).toBe(-416);expect(p.verticalVelocity).toBe(0);
    const forward=actor({z:0});for(let i=0;i<20;i++)move(forward,input(i,{movement:1,aimPitch:12000}));
    expect(forward.z).toBeLessThan(-40);expect(forward.x).toBeGreaterThan(12150);
  });
  it('lets the player swim and applies a gentle downstream current',()=>{
    const point=FRIENDS_RIVERS[2].points.find(p=>p.distance>3000)!;
    const p=actor({...point,z:point.z-18}),start={x:p.x,y:p.y};move(p);
    expect((p.x-start.x)*point.tx+(p.y-start.y)*point.ty).toBeGreaterThan(0);
    const before=p.x;move(p,input(2,{movement:1}));expect(p.x).toBeGreaterThan(before+4);
    expect(friendsWaterLevel(p.x,p.y)).toBeDefined();
  });
  it('hops out once per surface press while keeping a shallow solid floor walkable',()=>{
    const p=actor();move(p,input(2,{jumpPressed:true}));
    expect(p.z).toBeGreaterThan(142.5);expect(p.verticalVelocity).toBeGreaterThan(0);
    const velocity=p.verticalVelocity;move(p,input(2,{jumpPressed:true}));
    expect(p.verticalVelocity).toBeLessThan(velocity);expect(p.lastJumpSequence).toBe(2);
    const deck=actor({z:144});move(deck,input(1),50,()=>144);expect(deck.z).toBe(144);expect(deck.swimming).toBe(false);
  });
  it('replicates a dive below sea level and lets the real host controller surface without recovery or a jet launch',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
    const p=(sim as unknown as {players:Map<string,PlayerMotionState>}).players.get('host')!;Object.assign(p,{x:12128,y:23600,z:136.5,verticalVelocity:0,friendsDevFlight:false});
    for(let i=1;i<=160;i++){sim.setInput('host',input(i,{friendsDevFlightDown:true}));sim.tick(50);}
    let snapshot=sim.createSnapshot().players[0];expect(snapshot.z).toBe(-416);expect(snapshot.lifeState).toBe('alive');expect(snapshot.motion?.swimSubmerged).toBe(true);
    for(let i=161;i<=280;i++){sim.setInput('host',input(i,{jetHeld:true}));sim.tick(50);}
    snapshot=sim.createSnapshot().players[0];expect(snapshot.z).toBeCloseTo(136.5,3);expect(snapshot.motion?.swimSubmerged).toBe(false);expect(snapshot.jetActive).toBe(false);
  });
  it('produces the same dive movement for host ticks and split prediction ticks',()=>{
    const point=FRIENDS_RIVERS[1].points[300],host=actor({...point,z:point.z-18}),prediction={...host};
    for(let i=1;i<=30;i++){
      const command=input(i,{movement:9,sprinting:true,sliding:i<20});move(host,command,50);
      move(prediction,command,25);move(prediction,command,25);
    }
    expect(prediction.x).toBeCloseTo(host.x,7);expect(prediction.y).toBeCloseTo(host.y,7);expect(prediction.z).toBeCloseTo(host.z,7);
    expect(prediction.swimSubmerged).toBe(host.swimSubmerged);
  });
  it('lets guests dive through the ordinary crouch input while retaining host-only flight permissions',()=>{
    const sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'},{id:'guest',label:'Guest',color:'#aaa'}]);
    const p=(sim as unknown as {players:Map<string,PlayerMotionState>}).players.get('guest')!;
    Object.assign(p,{x:12128,y:23600,z:136.5,verticalVelocity:0,friendsDevFlight:false});
    for(let i=1;i<=60;i++){sim.setInput('guest',input(i,{sliding:true,friendsDevFlightDown:true}));sim.tick(50);}
    const guest=sim.createSnapshot().players.find(p=>p.id==='guest')!;
    expect(guest.z).toBeLessThan(-120);expect(guest.motion?.swimSubmerged).toBe(true);expect(guest.friendsDevFlight).toBe(false);
  });
});
