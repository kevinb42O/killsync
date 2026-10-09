import { ISLAND_SEA_LEVEL } from './FriendsWaterBodies';

/** One authored channel shared by solid terrain, lava mesh and spatial audio. */
export const LAVA_SOURCE={x:34240,y:33792,level:2714.5};
const PROFILE=[[700,2714.5],[1400,2440],[2100,2350],[2800,1980],[3500,1570],[4200,1210],[4900,850],[5600,510],[6300,270],[7000,210],[7700,165],[8400,-30],[9100,-145],[9800,ISLAND_SEA_LEVEL-22]] as const;
export function lavaRiverPoint(t:number){
  t=Math.max(0,Math.min(1,t));const r=700+t*9100;
  const bend=Math.sin(t*Math.PI)*320*Math.sin(t*10);
  const x=LAVA_SOURCE.x+Math.cos(1.05)*r+bend,y=LAVA_SOURCE.y+Math.sin(1.05)*r;
  let z=PROFILE[0][1] as number;
  for(let i=1;i<PROFILE.length;i++)if(r<=PROFILE[i][0]){const a=PROFILE[i-1],b=PROFILE[i],f=(r-a[0])/(b[0]-a[0]);z=a[1]+(b[1]-a[1])*f;break;}
  const width=230+70*Math.sin(t*9)**2+100*t*t;
  return {x,y,z,width,t};
}
export const LAVA_RIVER_POINTS=Array.from({length:153},(_,i)=>lavaRiverPoint(i/152));
export const LAVA_SEA_ENTRY=lavaRiverPoint(.95);
export function lavaRiverAt(x:number,y:number){
  const points=LAVA_RIVER_POINTS;
  if(y<points[0].y-240||y>points[152].y+240||x<34200||x>39500)return;
  const index=Math.max(0,Math.min(151,Math.floor((y-points[0].y)/(points[152].y-points[0].y)*152)));
  let best:ReturnType<typeof lavaRiverPoint>&{side:number}|undefined;
  for(let i=Math.max(0,index-2);i<=Math.min(151,index+2);i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const f=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy))),side=Math.hypot(x-a.x-dx*f,y-a.y-dy*f);
    if(!best||side<best.side)best={x:a.x+dx*f,y:a.y+dy*f,z:a.z+(b.z-a.z)*f,width:a.width+(b.width-a.width)*f,t:a.t+(b.t-a.t)*f,side};
  }
  return best&&best.side<best.width/2+160?best:undefined;
}
export function lavaChannelTerrain(x:number,y:number,ground:number){
  const p=lavaRiverAt(x,y);if(!p)return ground;
  const f=Math.max(0,Math.min(1,(p.side-p.width/2-26)/134)),blend=f*f*(3-2*f);
  // A full voxel of clearance prevents both the near voxels and distant mesh
  // from poking through the molten surface, including the steep breach.
  return (p.z-76)*(1-blend)+ground*blend;
}

/** Bare ground beyond each molten edge, leaving room for even the widest canopy. */
export const LAVA_TREE_CLEARANCE = 560;
const TREE_RADIUS = Math.max(...LAVA_RIVER_POINTS.map(p => p.width / 2)) + LAVA_TREE_CLEARANCE;
const TREE_BOUNDS = {
  minX: Math.min(...LAVA_RIVER_POINTS.map(p => p.x)) - TREE_RADIUS,
  maxX: Math.max(...LAVA_RIVER_POINTS.map(p => p.x)) + TREE_RADIUS,
  minY: LAVA_RIVER_POINTS[0].y - TREE_RADIUS,
  maxY: LAVA_RIVER_POINTS[152].y + TREE_RADIUS,
};
const RIVER_Y_STEP = LAVA_RIVER_POINTS[1].y - LAVA_RIVER_POINTS[0].y;
const TREE_SEGMENT_RADIUS = Math.ceil(TREE_RADIUS / RIVER_Y_STEP) + 1;
/** Fast bounds reject, then only nearby segments. Used during forest construction. */
export function lavaRiverTreeClearance(x: number, y: number): boolean {
  if (x < TREE_BOUNDS.minX || x > TREE_BOUNDS.maxX || y < TREE_BOUNDS.minY || y > TREE_BOUNDS.maxY) return false;
  const index = Math.max(0, Math.min(151, Math.floor((y - LAVA_RIVER_POINTS[0].y) / RIVER_Y_STEP)));
  for (let i = Math.max(0, index - TREE_SEGMENT_RADIUS); i <= Math.min(151, index + TREE_SEGMENT_RADIUS); i++) {
    const a = LAVA_RIVER_POINTS[i], b = LAVA_RIVER_POINTS[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    const gapX = x - a.x - dx * f, gapY = y - a.y - dy * f;
    const radius = (a.width + (b.width - a.width) * f) / 2 + LAVA_TREE_CLEARANCE;
    if (gapX * gapX + gapY * gapY <= radius * radius) return true;
  }
  return false;
}
