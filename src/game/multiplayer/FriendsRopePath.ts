import type { TerrainHit, TerrainRay } from '../world/FriendsTerrain';
export type RopePoint={x:number;y:number;z:number};
export type RopeObstacle=TerrainHit & {ropeCorners?:RopePoint[]};
const distance=(a:RopePoint,b:RopePoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Small contact route around voxel edges. Every leg is checked against the world. */
export function routeHaulingRope(from:RopePoint,to:RopePoint,blocked:(a:RopePoint,b:RopePoint)=>boolean,raycast:(ray:TerrainRay,length:number)=>RopeObstacle|undefined,previous:readonly RopePoint[]=[]):RopePoint[]|undefined {
  let checks=0;const obstructed=(a:RopePoint,b:RopePoint)=>++checks>96||blocked(a,b);
  if(!obstructed(from,to))return [];
  const clear=(points:readonly RopePoint[])=>{for(let i=1;i<points.length;i++)if(obstructed(points[i-1],points[i]))return false;return true;};
  if(previous.length&&clear([from,...previous,to]))return previous.map(p=>({...p}));
  const hit=(a:RopePoint,b:RopePoint)=>{const d=distance(a,b);return raycast({...a,dx:(b.x-a.x)/d,dy:(b.y-a.y)/d,dz:(b.z-a.z)/d},d-.5);};
  const corners=(h:RopeObstacle)=>{
    if(h.ropeCorners)return h.ropeCorners;
    const points:RopePoint[]=[];
    // Include face and edge centres, so a straight pull doesn't zigzag across a block.
    for(const x of [-3.5,16,35.5])for(const y of [-3.5,16,35.5])for(const z of [-3.5,16,35.5])if(x!==16||y!==16||z!==16)
      points.push({x:h.vx*32+x,y:h.vy*32+y,z:h.vz*32+z});
    return points;
  };
  const obstacle=hit(from,to);if(!obstacle)return;
  const candidates=corners(obstacle).filter(p=>!obstructed(from,p)).sort((a,b)=>distance(from,a)+distance(a,to)-distance(from,b)-distance(b,to));let best:RopePoint[]|undefined,bestLength=distance(from,to)+96;
  for(const p of candidates){const length=distance(from,p)+distance(p,to);if(length<bestLength&&!obstructed(p,to)){best=[p];bestLength=length;}}
  if(best)return best;
  // A second bend handles a ledge plus the adjacent block; never perform an unbounded search.
  for(const p of candidates.slice(0,6)){
    const next=hit(p,to);if(!next)continue;
    for(const q of corners(next)){
      const length=distance(from,p)+distance(p,q)+distance(q,to);
      if(length<bestLength&&!obstructed(p,q)&&!obstructed(q,to)){best=[p,q];bestLength=length;}
    }
  }
  return best;
}
