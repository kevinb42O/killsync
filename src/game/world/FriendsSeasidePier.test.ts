import { describe,expect,it } from 'vitest';
import { FRIENDS_SEASIDE_PIER as p,seasidePierPoint,seasidePierDeck,seasidePierLocal,friendsSeasidePierSurface,collideSeasidePier } from './FriendsSeasidePier';
import { baseTerrainHeight,FriendsTerrain,FRIENDS_SPAWN_PLATFORM } from './FriendsTerrain';
import { islandCoastDistance,ISLAND_SEA_LEVEL } from './FriendsIsland';
import { FRIENDS_COASTAL_PIER } from './FriendsCoastalPier';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { quantizeAngle,quantizePitch } from '../multiplayer/CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../multiplayer/protocol';

describe('Blankenberge-inspired seaside pleasure pier',()=>{
  it('places the grand promenade near spawn and the pavilion far out over the sea, separately from the retained dock',()=>{
    expect(Math.hypot(p.x-FRIENDS_SPAWN_PLATFORM.x,p.y-FRIENDS_SPAWN_PLATFORM.y)).toBeLessThan(2500);
    expect(Math.hypot(p.x-FRIENDS_COASTAL_PIER.x,p.y-FRIENDS_COASTAL_PIER.y)).toBeGreaterThan(2000);
    expect(p.landing-baseTerrainHeight(p.x,p.y)).toBe(4);
    expect(p.width).toBeGreaterThan(300);expect(p.length).toBeGreaterThan(3000);
    const head=seasidePierPoint(p.length);expect(islandCoastDistance(head.x,head.y)).toBeLessThan(-2000);
    expect(p.deck-ISLAND_SEA_LEVEL).toBeGreaterThan(200);
  });
  it('shares a continuous ramp, promenade and circular terrace floor without creating floors in the sea beside it',()=>{
    const terrain=new FriendsTerrain();
    for(let along=32;along<p.length;along+=31){const q=seasidePierPoint(along),top=seasidePierDeck(along);expect(terrain.floor(q.x,q.y,top)).toBeCloseTo(top);expect(terrain.supports(q.x,q.y,top)).toBe(true);}
    for(let a=0;a<Math.PI*2;a+=.2){const q=seasidePierPoint(p.length+Math.cos(a)*600,Math.sin(a)*600);expect(terrain.floor(q.x,q.y,p.deck)).toBe(p.deck);}
    const outside=seasidePierPoint(1600,p.width/2+20);expect(friendsSeasidePierSurface(outside.x,outside.y)).toBeUndefined();
    const below=seasidePierPoint(1600);expect(terrain.floor(below.x,below.y,p.deck-60)).toBeLessThan(p.deck);
  });
  it('blocks the visible guardrails and glazing while leaving the pavilion doorway and terrace connection open',()=>{
    const rail=seasidePierPoint(1000,p.width/2-5);expect(collideSeasidePier(rail,p.deck,14)).toBe(true);expect(seasidePierLocal(rail.x,rail.y).across).toBeLessThan(p.width/2-14);
    const overRail=seasidePierPoint(1000,p.width/2-5);expect(collideSeasidePier(overRail,p.deck+50,14)).toBe(false);
    const door=seasidePierPoint(p.length-p.pavilionRadius,0);expect(collideSeasidePier(door,p.deck,14)).toBe(false);
    const window=seasidePierPoint(p.length,p.pavilionRadius-5);expect(collideSeasidePier(window,p.deck,14)).toBe(true);
    const join=seasidePierPoint(p.length-p.terraceRadius,0);expect(collideSeasidePier(join,p.deck,14)).toBe(false);
  });
  it('walks from the beach up the ramp and through the pavilion entrance in production simulation',()=>{
    const sim=new FriendsSimulation([{id:'review',label:'Review',color:'#fff'}]),player=sim['players'].get('review')!,beach=seasidePierPoint(-32);
    Object.assign(player,{...beach,z:baseTerrainHeight(beach.x,beach.y),verticalVelocity:0,friendsDevFlight:false});
    let lastAlong=-32;
    for(let i=1;i<=425;i++){
      sim.setInput('review',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:i,clientTime:i*50,movement:1,aimAngle:quantizeAngle(p.angle),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});sim.tick(50);
      const {along,across}=seasidePierLocal(player.x,player.y);
      expect(along).toBeGreaterThan(lastAlong);expect(Math.abs(across)).toBeLessThan(30);lastAlong=along;
      if(along>100)expect(player.z).toBeCloseTo(seasidePierDeck(along),3);
    }
    expect(lastAlong).toBeGreaterThan(p.length);expect(player.z).toBe(p.deck);
  },10000);
});

import { PIER_CAFE_CHAIRS, PIER_CAFE_ID, seasidePierSupports } from './FriendsSeasidePier';
import { FriendsRetreats,retreatSeatPrompt } from '../multiplayer/FriendsRetreats';
import { isQuietSeat } from './FriendsRetreatSites';
it('offers every café chair, holds the seated player, and exits onto the deck',()=>{
  const terrain=new FriendsTerrain(),retreats=new FriendsRetreats({version:1,active:[]});
  for(const seat of PIER_CAFE_CHAIRS){
    const actor={id:'guest',x:seat.x,y:seat.y,z:seat.exit.z,lifeState:'alive' as const,angle:seat.angle,friendsSeat:undefined as {vehicleId:string;index:number}|undefined,crouching:false};
    expect(retreatSeatPrompt(actor,[actor],retreats.state)?.seat).toEqual({vehicleId:PIER_CAFE_ID,index:seat.index});
    expect(retreats.interact(actor,[actor],terrain)).toBe(true);expect(isQuietSeat(actor.friendsSeat)).toBe(true);expect(actor.z).toBe(seat.z);
    actor.x+=20;retreats.update([actor],new Set(),terrain);expect(actor.x).toBe(seat.x);
    expect(retreatSeatPrompt({...actor,id:'other',friendsSeat:undefined},[actor],retreats.state)).toBeUndefined();
    expect(retreats.interact(actor,[actor],terrain)).toBe(true);expect(actor.friendsSeat).toBeUndefined();expect(actor.z).toBe(96);expect(actor.crouching).toBe(false);
    expect(terrain.collide({...actor},actor.z,13,50,8)).toBe(false);
  }
});
it('sinks every support below the seabed across its whole footprint',()=>{
  const terrain=new FriendsTerrain(),ground=(x:number,y:number)=>terrain.height(Math.floor(x/32),Math.floor(y/32));
  const supports=seasidePierSupports(ground);expect(supports.length).toBeGreaterThan(30);
  for(const support of supports)for(const dx of [-48,0,48])for(const dy of [-48,0,48]){
    const point=seasidePierPoint(support.along+dx,support.across+dy);
    expect(support.bottom).toBeLessThanOrEqual(ground(point.x,point.y)-96);expect(support.top).toBeGreaterThan(support.bottom);
  }
});
it('sits and stands with real F input, jump input and multiplayer snapshots',()=>{
  const sim=new FriendsSimulation([{id:'cafe',label:'Café',color:'#fff'}]),player=sim['players'].get('cafe')!,seat=PIER_CAFE_CHAIRS[0];
  Object.assign(player,{x:seat.x,y:seat.y,z:seat.exit.z,angle:seat.angle});
  const input=(sequence:number,action:number,jumpPressed=false)=>({type:'input' as const,version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:sequence*50,movement:0,aimAngle:quantizeAngle(seat.angle),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed,dashPressed:false,interactActionId:action});
  sim.setInput(player.id,input(1,1));sim.tick(50);expect(player.friendsSeat?.vehicleId).toBe(PIER_CAFE_ID);
  expect(sim.createSnapshot().players.find(p=>p.id===player.id)?.friendsSeat).toEqual(player.friendsSeat);
  sim.setInput(player.id,input(2,2));sim.tick(50);expect(player.friendsSeat).toBeUndefined();expect(player.z).toBe(96);
  Object.assign(player,{x:seat.x,y:seat.y,z:seat.exit.z});sim.setInput(player.id,input(3,3));sim.tick(50);expect(player.friendsSeat).toBeDefined();
  sim.setInput(player.id,input(4,3,true));sim.tick(50);expect(player.friendsSeat).toBeUndefined();
});

it('stops floor searches at the deck while retaining higher edits and the seabed below',()=>{
  const terrain=new FriendsTerrain(),point=seasidePierPoint(2200),vx=Math.floor(point.x/32),vy=Math.floor(point.y/32);
  let calls=0;const exposed=terrain.exposedMaterial.bind(terrain);
  terrain.exposedMaterial=(...args)=>{calls++;return exposed(...args);};
  expect(terrain.floor(point.x,point.y,96)).toBe(96);expect(calls).toBe(0);
  expect(terrain.set(vx,vy,3,1)).toBe(true);expect(terrain.floor(point.x,point.y,120,8)).toBe(128);
  expect(terrain.floor(point.x,point.y,40)).toBeLessThan(-168);expect(calls).toBeGreaterThan(0);
});
it('separates the landing and ramp from beach surfaces across the entire entrance',()=>{
  const terrain=new FriendsTerrain();
  for(let along=0;along<640;along+=16)for(let across=-192;across<=192;across+=16){
    const point=seasidePierPoint(along,across);expect(seasidePierDeck(along)-terrain.surfaceHeight(point.x,point.y)).toBeGreaterThan(1);
  }
});

it('blocks casts at the glazing, rails and slab, preserving the doorway and ray range',()=>{
  const terrain=new FriendsTerrain(),sim=new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
  const from=seasidePierPoint(p.length+p.pavilionRadius+20),to=seasidePierPoint(p.length+p.pavilionRadius-20),z=p.deck+60;
  const ray={...from,z,dx:(to.x-from.x)/40,dy:(to.y-from.y)/40,dz:0};
  expect(terrain.raycast(ray,40)?.distance).toBeCloseTo(20);expect(terrain.raycast(ray,19)).toBeUndefined();
  expect(sim['haulingEnvironment']().blocked({...from,z},{...to,z})).toBe(true);
  const doorFrom=seasidePierPoint(p.length-p.pavilionRadius-20),doorTo=seasidePierPoint(p.length-p.pavilionRadius+20);
  expect(sim['haulingEnvironment']().blocked({...doorFrom,z},{...doorTo,z})).toBe(false);
  const deck=seasidePierPoint(1400);
  expect(terrain.raycast({...deck,z:p.deck+40,dx:0,dy:0,dz:-1},100)?.distance).toBeCloseTo(40);
  expect(terrain.raycast({...deck,z:p.deck-40,dx:0,dy:0,dz:1},100)?.distance).toBeCloseTo(22);
  const rail=seasidePierPoint(1400,p.width/2+20),direction={dx:Math.sin(p.angle),dy:-Math.cos(p.angle),dz:0};
  expect(terrain.raycast({...rail,z:p.deck+20,...direction},40)?.distance).toBeCloseTo(20);
  expect(terrain.raycast({...rail,z:p.deck+40,...direction},40)).toBeUndefined();
});
