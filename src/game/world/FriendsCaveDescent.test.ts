import {describe,it,expect} from 'vitest';
import {FriendsTerrain} from './FriendsTerrain';
import {FRIENDS_BEDROCK_TOP,FRIENDS_TERRAIN_BOTTOM} from './FriendsTerrainLimits';
import {CAVE_DESCENT_ROUTE,CAVE_DESCENT_ROOMS,CAVE_UPPER_ROUTES,CAVE_BEDROCK_ROUTE,CAVE_BEDROCK_ROOM,CAVE_STAIRS,CAVE_LAVA,CAVE_LIFTS,caveLavaAt} from './FriendsCaveDescent';
import {friendsInteractionTarget} from '../multiplayer/FriendsInteractionTargeting';
import {FriendsFrontier} from '../multiplayer/FriendsFrontier';
import {advancePlayerMovement,type PlayerMotionState} from '../multiplayer/playerMovement';
import {MULTIPLAYER_PROTOCOL_VERSION,type MultiplayerInputFrame} from '../multiplayer/protocol';
const input=(sequence:number,angle:number):MultiplayerInputFrame=>({type:'input',version:MULTIPLAYER_PROTOCOL_VERSION,sequence,clientTime:0,movement:1,aimAngle:Math.round(((angle+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*65535),aimPitch:0,selectedSlot:0,firing:false,sprinting:false,sliding:false,reviving:false,jumpPressed:false,dashPressed:false});
describe('Lantern Descent depth and safety',()=>{
 it('allows deep mining and preserves an indestructible bedrock floor through edits, blasts and saves',()=>{
  const t=new FriendsTerrain(),x=7000,y=8000,vx=Math.floor(x/32),vy=Math.floor(y/32),bottom=FRIENDS_TERRAIN_BOTTOM/32;
  expect(t.set(vx,vy,-32,0)).toBe(true);
  for(const vz of [bottom,bottom+1]){expect(t.set(vx,vy,vz,0)).toBe(false);expect(t.material(vx,vy,vz)).toBe(2);}
  const restored=new FriendsTerrain({...t.snapshot(),edits:[[vx,vy,bottom,0]]});expect(restored.material(vx,vy,bottom)).toBe(2);
  const f=new FriendsFrontier();f.blastTerrain({x,y,z:FRIENDS_BEDROCK_TOP-32},96);expect(f.terrain.material(vx,vy,bottom)).toBe(2);
  t.set(vx,vy,FRIENDS_BEDROCK_TOP/32,0);
  const bedrock=friendsInteractionTarget(t,{x,y,z:FRIENDS_BEDROCK_TOP,dx:0,dy:0,dz:-1},2,[],[]);expect(bedrock?.valid).toBe(false);expect(bedrock?.reason).toContain('Bedrock');
  const deep=friendsInteractionTarget(t,{x,y,z:-1024,dx:0,dy:0,dz:-1},2,[],[]);expect(deep?.valid).toBe(true);
 });
 it('descends through five distinct themes to the vault, with at most eight-unit stair risers',()=>{
  expect(new Set(CAVE_DESCENT_ROOMS.map(r=>r.theme)).size).toBe(5);
  expect(CAVE_DESCENT_ROOMS.at(-1)!.floor).toBe(-3584);expect(new FriendsTerrain().floor(CAVE_BEDROCK_ROOM.x,CAVE_BEDROCK_ROOM.y,CAVE_BEDROCK_ROOM.floor)).toBe(FRIENDS_BEDROCK_TOP);
  for(const s of CAVE_STAIRS)expect(Math.abs(s.a.z-s.b.z)).toBeLessThanOrEqual(8);
  const t=new FriendsTerrain();for(const l of CAVE_LIFTS){expect(t.supports(l.x,l.y,l.z),l.id).toBe(true);expect(t.supports(l.destination.x,l.destination.y,l.destination.z),l.id).toBe(true);}
 });
 it('walks the complete descent and ascent through normal player physics without jumping',()=>{
  const t=new FriendsTerrain();let sequence=0;
  const complete=[...CAVE_UPPER_ROUTES.flat(),...CAVE_DESCENT_ROUTE,...CAVE_BEDROCK_ROUTE].filter((p,i,all)=>!i||p.x!==all[i-1].x||p.y!==all[i-1].y);
  for(const points of [complete,[...complete].reverse()]){
   const start=points[0],p:PlayerMotionState={...start,angle:0,sprinting:false,sliding:false,crouching:false,verticalVelocity:0,lastJumpSequence:-1,slideAngle:0};
   for(let i=1;i<points.length;i++){
    const target=points[i];let ticks=0;
    while(Math.hypot(target.x-p.x,target.y-p.y)>12&&ticks++<1400){
     advancePlayerMovement(p,input(++sequence,Math.atan2(target.y-p.y,target.x-p.x)),16,(pos,r)=>t.collide(pos,p.z,r),undefined,pos=>t.floor(pos.x,pos.y,pos.z??p.z),'friends_frontier',{elevationAware:true,volumetric:true,ceiling:6000,stepHeight:8,overhead:pos=>t.ceiling(pos.x,pos.y,pos.z)});
     expect(p.z).toBeGreaterThan(FRIENDS_TERRAIN_BOTTOM);
    }
    expect(ticks,`route ${i} toward ${target.x},${target.y}, got ${p.x},${p.y},${p.z}`).toBeLessThan(1400);
    // Let gravity finish the last downward tread after releasing movement.
    for(let settle=0;settle<30;settle++)advancePlayerMovement(p,{...input(++sequence,0),movement:0},16,(pos,r)=>t.collide(pos,p.z,r),undefined,pos=>t.floor(pos.x,pos.y,pos.z??p.z),'friends_frontier',{elevationAware:true,volumetric:true,ceiling:6000,stepHeight:8,overhead:pos=>t.ceiling(pos.x,pos.y,pos.z)});
    expect(Math.abs(p.z-target.z),`height toward ${target.x},${target.y},${target.z}, got ${p.x},${p.y},${p.z}`).toBeLessThanOrEqual(16);
   }
  }
 },20000);
 it('protects contained lava basins and never treats a bridge or another level as contact',()=>{
  const t=new FriendsTerrain();for(const l of CAVE_LAVA){
   expect(caveLavaAt(l.x,l.y,l.z)).toBe(l);expect(caveLavaAt(l.x,l.y,l.z+60)).toBeUndefined();
   expect(t.supports(l.safe.x,l.safe.y,l.safe.z),l.id).toBe(true);
   expect(t.set(Math.floor(l.x/32),Math.floor(l.y/32),Math.floor((l.bed-16)/32),0)).toBe(false);
   const edit:[number,number,number,0]=[Math.floor(l.x/32),Math.floor(l.y/32),Math.floor((l.bed-16)/32),0];
   const restored=new FriendsTerrain({...t.snapshot(),edits:[edit]});expect(restored.material(...edit.slice(0,3) as [number,number,number])).toBe(2);
  }
 });
});
