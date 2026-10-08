import type { CargoStaticCollider, CargoPhysicsRegion } from './FriendsCargoPhysics';
import type { HaulingActor, HaulingEnvironment, PhysicalCargo } from './FriendsHauling';
import { cargoWorldPoint, cargoRotation } from './FriendsCargoPose';
import { assemblyMemberBoxes } from './FriendsCraneAssemblies';
import type { FriendsBuildPiece } from './FriendsBuilding';

import { boxOBB, overlapOBB, cross, type Point, type OBB } from './FriendsOrientedBox';
export { boxOBB, overlapOBB } from './FriendsOrientedBox';
function cargoOBB(c:PhysicalCargo,offset:Point):OBB {
  const centre=cargoWorldPoint(c,{x:0,y:0,z:24}),q=cargoRotation(c);
  const rotate=(v:Point)=>{const t=cross(q,v),u=cross(q,t);return {x:v.x+2*(q.w*t.x+u.x),y:v.y+2*(q.w*t.y+u.y),z:v.z+2*(q.w*t.z+u.z)};};
  return {centre:{x:centre.x+offset.x,y:centre.y+offset.y,z:centre.z+offset.z},axes:[rotate({x:1,y:0,z:0}),rotate({x:0,y:1,z:0}),rotate({x:0,y:0,z:1})],half:[36,28,24]};
}
function bounds(b:OBB):CargoPhysicsRegion {
  const extent=(k:'x'|'y'|'z')=>b.axes.reduce((sum,v,i)=>sum+Math.abs(v[k])*b.half[i],0);
  return {minX:b.centre.x-extent('x'),maxX:b.centre.x+extent('x'),minY:b.centre.y-extent('y'),maxY:b.centre.y+extent('y'),minZ:b.centre.z-extent('z'),maxZ:b.centre.z+extent('z')};
}
function intersectsWorld(b:OBB,env:HaulingEnvironment,ignore:ReadonlySet<number>,players:readonly HaulingActor[],loads:readonly PhysicalCargo[],cargoId?:string) {
  const region=bounds(b);
  if(region.minX<128||region.maxX>47872||region.minY<128||region.maxY>47872||region.minZ< -512||region.maxZ>6000)return 'World boundary';
  // DDA-style local voxel sampling, then an exact separating-axis check. The
  // query is bounded by one small member/load volume, never the whole island.
  if(env.solid)for(let z=Math.floor(region.minZ/32);z<=Math.floor(region.maxZ/32);z++)for(let y=Math.floor(region.minY/32);y<=Math.floor(region.maxY/32);y++)for(let x=Math.floor(region.minX/32);x<=Math.floor(region.maxX/32);x++) {
    if(env.solid(x,y,z)&&overlapOBB(b,boxOBB({x:x*32+16,y:y*32+16,z:z*32,w:32,d:32,h:32})))return 'Terrain';
  }
  for(const collider of [...(env.colliders?.(region)??[]),...(env.dynamicColliders?.(region)??[])]) {
    if(collider.buildId!==undefined&&ignore.has(collider.buildId))continue;
    // Authored ramps/hulls are conservative here; they still use their exact
    // contacts in the cargo solver. Rotation must not push through their envelope.
    if(overlapOBB(b,boxOBB(collider)))return 'Structure or tree';
  }
  if(!env.solid && (env.floor(b.centre.x,b.centre.y,region.minZ+1,0)??-Infinity)>region.minZ+.5)return 'Ground';
  for(const p of players)if(p.lifeState==='alive'&&overlapOBB(b,boxOBB({x:p.x,y:p.y,z:p.z,w:38,d:38,h:50})))return 'Crew in the way';
  for(const c of loads)if(c.id!==cargoId&&overlapOBB(b,cargoOBB(c,{x:0,y:0,z:0})))return 'Another load';
  for(const v of env.vehicles) {
    const angle=v.angle;
    // Respect the open passenger/freight decks instead of reserving their full
    // volume. Closed wagons, roof and deck surfaces remain solid.
    const parts=v.closed?[{x:v.x,y:v.y,z:v.z-14,w:v.length,d:v.width,h:128,angle}]:[{x:v.x,y:v.y,z:v.z-6,w:v.length,d:v.width,h:6,angle},{x:v.x,y:v.y,z:v.z+(v.kind==='train'?109:101),w:v.length,d:v.width,h:6,angle}];
    if(parts.some(c=>overlapOBB(b,boxOBB(c))))return 'Transport';
  }
}
export function sweepCrane(pieces:readonly FriendsBuildPiece[],rootId:number,from:number,to:number,outlet:(angle:number)=>Point,env:HaulingEnvironment,players:readonly HaulingActor[],loads:readonly PhysicalCargo[],cargo?:PhysicalCargo,hookLength?:number) {
  const members=pieces.filter(p=>p.assembly?.rootId===rootId),ignore=new Set([rootId,...members.map(p=>p.id)]);
  const oldOutlet=outlet(from),radius=Math.max(1,...members.map(p=>Math.hypot(p.assembly!.x,p.assembly!.y)+64));
  const steps=Math.max(1,Math.ceil(Math.abs(to-from)*radius/3));
  if(steps>32)return 'Motor travel limit';
  for(let step=1;step<=steps;step++) {
    const angle=from+(to-from)*step/steps,nextOutlet=outlet(angle);
    for(const box of assemblyMemberBoxes(pieces,rootId,angle)){const reason=intersectsWorld(boxOBB(box),env,ignore,players,loads,cargo?.id);if(reason)return reason;}
    if(cargo){const shift={x:nextOutlet.x-oldOutlet.x,y:nextOutlet.y-oldOutlet.y,z:0};const reason=intersectsWorld(cargoOBB(cargo,shift),env,ignore,players,loads,cargo.id);if(reason)return reason;}
    // Cable checks use the straight guide, including an empty hook.
    const endZ=cargo?cargoWorldPoint(cargo,{x:0,y:0,z:48}).z:hookLength===undefined?undefined:nextOutlet.z-hookLength;
    if(endZ!==undefined&&env.blocked(nextOutlet,{...nextOutlet,z:endZ}))return 'Cable obstruction';
  }
}
