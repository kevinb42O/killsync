import { CASTLE_STAIRS } from '../world/FriendsTerrain';
import type { CargoPhysicsRegion, CargoStaticCollider } from './FriendsCargoPhysics';

/** Fan stair envelopes and exact parapets. Small risers must not snag a skid. */
export function castleCargoColliders(region:CargoPhysicsRegion):CargoStaticCollider[]{
  const treads=new Set<ReturnType<typeof CASTLE_STAIRS.at>[number]>();
  for(let x=region.minX;x<=region.maxX+256;x+=256)for(let y=region.minY;y<=region.maxY+256;y+=256)for(const t of CASTLE_STAIRS.at(x,y))treads.add(t);
  const result:CargoStaticCollider[]=[];
  for(const t of treads){
    if(t.z+Math.max(t.railA,t.railB)<region.minZ||t.z-64>region.maxZ)continue;
    const half=t.width/2;
    const p=(end:'a'|'b',offset:number,z:number)=>({x:t[end].x+t[end==='a'?'nxA':'nxB']*offset,y:t[end].y+t[end==='a'?'nyA':'nyB']*offset,z});
    const hull=(inner:number,outer:number,bottomA:number,bottomB:number,topA:number,topB:number)=>{
      const vertices=[p('a',outer,bottomA),p('a',inner,bottomA),p('b',inner,bottomB),p('b',outer,bottomB),p('a',outer,topA),p('a',inner,topA),p('b',inner,topB),p('b',outer,topB)];
      if(Math.max(...vertices.map(p=>p.x))<region.minX||Math.min(...vertices.map(p=>p.x))>region.maxX||Math.max(...vertices.map(p=>p.y))<region.minY||Math.min(...vertices.map(p=>p.y))>region.maxY)return;
      const x=vertices.reduce((sum,p)=>sum+p.x,0)/8,y=vertices.reduce((sum,p)=>sum+p.y,0)/8,z=vertices.reduce((sum,p)=>sum+p.z,0)/8;
      result.push({x,y,z,w:t.width,d:8,h:topA-z,kind:'hull',vertices:vertices.map(p=>({x:p.x-x,y:p.y-y,z:p.z-z}))});
    };
    // Match the traversable grade, within one eight-unit visible riser. Flat
    // individual treads present hundreds of tiny walls to a pitched cargo hull.
    hull(-half,half,t.z-64,t.z-64,t.a.z,t.b.z);
    if(Math.max(t.railA,t.railB)>1){
      hull(half,half+16,t.z,t.z,t.a.z+Math.max(1,t.railA),t.b.z+Math.max(1,t.railB));
      hull(-half-16,-half,t.z,t.z,t.a.z+Math.max(1,t.railA),t.b.z+Math.max(1,t.railB));
    }
  }
  return result;
}
