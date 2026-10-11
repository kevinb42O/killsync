import {describe,it,expect} from 'vitest';
import {FRIENDS_BREAKWATERS,breakwaterPoint,breakwaterTop,friendsBreakwaterSurface,raycastBreakwaters,collideBreakwaters} from './FriendsBreakwaters';
import {FriendsTerrain,baseTerrainHeight} from './FriendsTerrain';
import {ISLAND_SEA_LEVEL,islandCoastDistance} from './FriendsIsland';
import {FriendsSimulation} from '../multiplayer/FriendsSimulation';
import {quantizeAngle,quantizePitch} from '../multiplayer/CoopSimulation';
import {MULTIPLAYER_PROTOCOL_VERSION} from '../multiplayer/protocol';

describe('Belgian coastal stone groynes',()=>{
  it('attaches all fifteen entrances to dry beaches and reaches open sea without gaps in shared walking support',()=>{
    const terrain=new FriendsTerrain();expect(FRIENDS_BREAKWATERS).toHaveLength(15);
    for(const b of FRIENDS_BREAKWATERS){expect(baseTerrainHeight(b.x,b.y)).toBe(-160);const tip=breakwaterPoint(b,b.length);expect(islandCoastDistance(tip.x,tip.y)).toBeLessThan(-300);
      for(let a=0;a<=b.length;a+=7){const q=breakwaterPoint(b,a),z=breakwaterTop(a);expect(z).toBeGreaterThan(ISLAND_SEA_LEVEL);expect(terrain.floor(q.x,q.y,z)).toBeCloseTo(z);expect(terrain.supports(q.x,q.y,z)).toBe(true);}
      const outside=breakwaterPoint(b,600,161);expect(friendsBreakwaterSurface(outside.x,outside.y)).toBeUndefined();expect(terrain.floor(outside.x,outside.y,-128)).toBeLessThan(ISLAND_SEA_LEVEL);
    }
  });
  it('blocks fishing casts into the stones, while casts out to sea clear the structure',()=>{
    const b=FRIENDS_BREAKWATERS[0],p=breakwaterPoint(b,500),top=breakwaterTop(500),terrain=new FriendsTerrain();
    const down={...p,z:top+60,dx:0,dy:0,dz:-1};expect(raycastBreakwaters(down,100)?.distance).toBeCloseTo(60);expect(terrain.raycast(down,100)?.distance).toBeCloseTo(60);
    expect(raycastBreakwaters({...p,z:top+50,dx:b.c,dy:b.s,dz:0},2000)).toBeUndefined();
    const side=breakwaterPoint(b,500,180);expect(raycastBreakwaters({...side,z:top-90,dx:b.s,dy:-b.c,dz:0},100)?.distance).toBeCloseTo(20);
    const swimmer=breakwaterPoint(b,500,155);expect(collideBreakwaters(swimmer,top-90,14,50,8)).toBe(true);
    const walker=breakwaterPoint(b,500);expect(collideBreakwaters(walker,top,14,50,8)).toBe(false);
  });
  it('walks from the sand up the ramp and along the stones in the host simulation',()=>{
    const b=FRIENDS_BREAKWATERS[0],sim=new FriendsSimulation([{id:'walk',label:'Walk',color:'#fff'}]),player=sim['players'].get('walk')!;
    Object.assign(player,{...breakwaterPoint(b,-24),z:-160,verticalVelocity:0,friendsDevFlight:false});
    for(let n=1;n<=88;n++){sim.setInput('walk',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:n,clientTime:n*50,movement:1,aimAngle:quantizeAngle(Math.atan2(b.s,b.c)),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});sim.tick(50);expect(player.z).toBeGreaterThanOrEqual(-160);expect(player.verticalVelocity).toBe(0);}
    expect(Math.hypot(player.x-b.x,player.y-b.y)).toBeGreaterThan(650);expect(player.z).toBe(-128);
    for(let n=89;n<150;n++){
      sim.setInput('walk',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:n,clientTime:n*50,movement:0,aimAngle:quantizeAngle(Math.atan2(b.s,b.c)),aimPitch:quantizePitch(0),friendsTool:7,selectedSlot:0,firing:false,fireActionId:1,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});sim.tick(50);
      if(sim.createSnapshot().friends!.fishing.casts[0]?.phase==='waiting')break;
    }
    const cast=sim.createSnapshot().friends!.fishing.casts[0];expect(cast?.phase).toBe('waiting');expect(cast.z).toBeCloseTo(ISLAND_SEA_LEVEL+2);expect(player.z).toBe(-128);
  });
});

it('checks an overlapping groyne when the collision radius crosses a spatial bucket boundary',()=>{
  // A large probe centred outside the groyne buckets must still detect its side.
  const b=FRIENDS_BREAKWATERS[0],point=breakwaterPoint(b,b.length/2,800);
  expect(collideBreakwaters(point,-220,700,50,0)).toBe(true);
});
