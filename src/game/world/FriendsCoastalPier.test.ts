import { describe, expect, it } from 'vitest';
import { FRIENDS_COASTAL_PIER as p, friendsCoastalPierSurface, coastalPierApproachHeight } from './FriendsCoastalPier';
import { FriendsTerrain, FRIENDS_SPAWN_PLATFORM, baseTerrainHeight } from './FriendsTerrain';
import { islandCoastDistance, ISLAND_SEA_LEVEL } from './FriendsIsland';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { quantizeAngle, quantizePitch } from '../multiplayer/CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../multiplayer/protocol';

const point=(along:number,across=0)=>({x:p.x+Math.cos(p.angle)*along-Math.sin(p.angle)*across,y:p.y+Math.sin(p.angle)*along+Math.cos(p.angle)*across});
describe('retained western timber dock',()=>{
  it('connects the western beach to open sea above the water',()=>{
    const end=point(p.sections*p.sectionLength);
    expect(Math.hypot(p.x-FRIENDS_SPAWN_PLATFORM.x,p.y-FRIENDS_SPAWN_PLATFORM.y)).toBeLessThan(4500);
    expect(baseTerrainHeight(p.x,p.y)).toBeLessThanOrEqual(p.deck-24);
    expect(islandCoastDistance(p.x,p.y)).toBeGreaterThan(0);
    expect(islandCoastDistance(end.x,end.y)).toBeLessThan(-200);
    expect(p.deck-ISLAND_SEA_LEVEL).toBeGreaterThan(50);
  });
  it('supports players along every span and seam without extending the floor into the surrounding sea',()=>{
    const terrain=new FriendsTerrain();
    for(let along=1;along<p.sections*p.sectionLength;along+=7){
      for(const across of [-45,0,45]){const q=point(along,across);
        expect(terrain.floor(q.x,q.y,p.deck)).toBe(p.deck);
        expect(terrain.supports(q.x,q.y,p.deck)).toBe(true);
      }
    }
    for(const q of [point(-p.approachLength-1),point(p.sections*p.sectionLength+1),point(600,p.width/2+1)])expect(friendsCoastalPierSurface(q.x,q.y)).toBeUndefined();
    const sea=point(600,p.width/2+25);expect(terrain.floor(sea.x,sea.y,p.deck)).toBeLessThan(p.deck);
    for(const across of [-180,0,180]){const head=point((p.sections-.5)*p.sectionLength,across);expect(terrain.floor(head.x,head.y,p.deck)).toBe(p.deck);expect(terrain.supports(head.x,head.y,p.deck)).toBe(true);}
    const below=point(600);expect(terrain.floor(below.x,below.y,p.deck-60)).toBeLessThan(p.deck);
  });
  it.each([-48,0,48])('walks down the beach gangway and back inland at offset %s without jumping or hitting voxel faces',(offset)=>{
    const sim=new FriendsSimulation([{id:'review',label:'Review',color:'#fff'}]),player=sim['players'].get('review')!;
    const terrain=sim['friendsFrontier']!.terrain,beach=point(-p.approachLength-40,offset);
    Object.assign(player,{...beach,z:terrain.surfaceHeight(beach.x,beach.y),verticalVelocity:0,friendsDevFlight:false});
    let sequence=0;
    const walk=(angle:number,ticks:number)=>{for(let i=0;i<ticks;i++){
      sim.setInput(player.id,{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++sequence,clientTime:sequence*50,movement:1,aimAngle:quantizeAngle(angle),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});sim.tick(50);
      const floor=friendsCoastalPierSurface(player.x,player.y);
      if(floor!==undefined){expect(player.z).toBeCloseTo(floor,3);expect(player.verticalVelocity).toBe(0);}
      expect(player.swimming).toBe(false);
    }};
    walk(p.angle,70);expect(player.x).toBeLessThan(p.x-100);
    walk(p.angle+Math.PI,70);expect(player.x).toBeGreaterThan(beach.x-16);
    for(let along=-p.rampLength;along<0;along+=16){const q=point(along);expect(terrain.surfaceHeight(q.x,q.y)).toBeLessThan(coastalPierApproachHeight(along)-12);}
  });
  it('walks from the beach across every join and onto both sides of the T landing in the host simulation',()=>{
    const sim=new FriendsSimulation([{id:'review',label:'Review',color:'#fff'}]),player=sim['players'].get('review')!;
    const beach=point(-32);Object.assign(player,{...beach,z:friendsCoastalPierSurface(beach.x,beach.y)??sim['friendsFrontier']!.terrain.surfaceHeight(beach.x,beach.y),verticalVelocity:0,friendsDevFlight:false});
    let sequence=0;
    const walk=(angle:number,ticks:number)=>{for(let n=0;n<ticks;n++){
      sim.setInput('review',{type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence:++sequence,clientTime:sequence*50,movement:1,aimAngle:quantizeAngle(angle),aimPitch:quantizePitch(0),selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
      sim.tick(50);expect(player.z).toBeCloseTo(friendsCoastalPierSurface(player.x,player.y)!,4);expect(player.verticalVelocity).toBe(0);
    }};
    walk(p.angle,85);
    expect(Math.hypot(player.x-p.x,player.y-p.y)).toBeGreaterThan(720);
    walk(p.angle+Math.PI/2,17);
    walk(p.angle-Math.PI/2,34);
  });
});
