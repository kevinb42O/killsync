import { ISLAND_SEA_LEVEL } from './FriendsWaterBodies';

/** One authored channel shared by solid terrain, lava mesh and spatial audio. */
export const LAVA_SOURCE={x:34240,y:33792,level:2714.5};
// The lake owns the level throat. Begin the descent at an actual ribbon
// vertex, so the crater and river join without an unsupported vertical step.
export const LAVA_CRATER_OUTLET=700+9100*6/152;
export const LAVA_BANK_APRON=320;
const PROFILE=[[700,2714.5],[LAVA_CRATER_OUTLET,2714.5],[1400,2440],[2100,2350],[2800,1980],[3500,1570],[4200,1210],[4900,850],[5600,510],[6300,270],[7000,210],[7700,165],[8400,-30],[9100,-145],[9800,ISLAND_SEA_LEVEL-22]] as const;
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function lavaCraterRadius(x:number,y:number){
  const dx=x-LAVA_SOURCE.x,dy=y-LAVA_SOURCE.y,a=Math.atan2(dy,dx);
  return Math.hypot(dx,dy)/(1+.08*Math.sin(a*5)+.045*Math.sin(a*9+.6));
}
/** A solid bowl and rim, before the outlet cuts its one deliberate opening. */
export function lavaCraterTerrain(x:number,y:number,ground:number){
  if(Math.abs(x-LAVA_SOURCE.x)>1800||Math.abs(y-LAVA_SOURCE.y)>1800)return ground;
  const r=lavaCraterRadius(x,y);if(r>=1540)return ground;
  if(r<780)return Math.min(ground,LAVA_SOURCE.level-224+32*smooth(r/780));
  const angle=Math.atan2(y-LAVA_SOURCE.y,x-LAVA_SOURCE.x);
  // Broad broken rim sectors with smaller weathered shoulders. All relief is
  // real terrain, so a rock silhouette also provides a collision surface.
  const relief=48+34*Math.sin(angle*3+.8)+22*Math.sin(angle*7-1.2)
    +18*Math.sin(x/137+y/193)*Math.sin(y/113-x/227);
  const shore=LAVA_SOURCE.level-192+(352+relief)*smooth((r-780)/420);
  return shore+(ground-shore)*smooth((r-1240)/300);
}
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
  if(y<points[0].y-540||y>points[152].y+540||x<33900||x>40000)return;
  const index=Math.max(0,Math.min(151,Math.floor((y-points[0].y)/(points[152].y-points[0].y)*152)));
  let best:ReturnType<typeof lavaRiverPoint>&{side:number}|undefined;
  for(let i=Math.max(0,index-10);i<=Math.min(151,index+10);i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const f=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy))),side=Math.hypot(x-a.x-dx*f,y-a.y-dy*f);
    if(!best||side<best.side)best={x:a.x+dx*f,y:a.y+dy*f,z:a.z+(b.z-a.z)*f,width:a.width+(b.width-a.width)*f,t:a.t+(b.t-a.t)*f,side};
  }
  return best&&best.side<best.width/2+LAVA_BANK_APRON?best:undefined;
}
export function lavaChannelTerrain(x:number,y:number,ground:number){
  const p=lavaRiverAt(x,y);if(!p)return ground;
  // Each collision cell must support the lowest part of the descending sheet;
  // each bank must contain its upstream height, including smoothed corners.
  const downstream=lavaRiverAt(p.x,p.y+48)?.z??p.z;
  const upstream=lavaRiverAt(p.x,p.y-80)?.z??p.z;
  const bed=Math.min(p.z,downstream)-96;
  const a=LAVA_RIVER_POINTS[Math.min(151,Math.floor(p.t*152))],b=LAVA_RIVER_POINTS[Math.min(152,Math.floor(p.t*152)+1)];
  const bank=Math.sign((x-p.x)*-(b.y-a.y)+(y-p.y)*(b.x-a.x));
  // Each side weathers independently. The safe inner floor and high outer
  // containment remain, while shelves and outcrops stop mirroring each other.
  const weather=Math.sin(p.t*51+bank*1.7)*.55+Math.sin(p.t*117-bank*2.3)*.3+Math.sin(p.t*233+bank)*.15;
  const shoulder=(42+32*weather+18*Math.sin(x/79+y/107)*Math.sin(y/61-x/131))*smooth((p.z+20)/300);
  const crest=Math.max(p.z,upstream)+96+shoulder;
  const half=p.width/2;
  const foot=.66+weather*.07;
  const channel=bed+(crest-bed)*smooth((p.side/half-foot)/(.62+weather*.05));
  const shelf=half*(1.7+weather*.12);
  const collar=channel+(ground-channel)*smooth((p.side-shelf)/(half+LAVA_BANK_APRON-shelf));
  // Open the submerged mouth into the ocean. A nearest-segment query has a
  // round end cap; fading past the final vertex prevents an artificial dam.
  if(p.t===1){
    const tip=LAVA_RIVER_POINTS[152],before=LAVA_RIVER_POINTS[151];
    const dx=tip.x-before.x,dy=tip.y-before.y;
    const past=((x-tip.x)*dx+(y-tip.y)*dy)/Math.hypot(dx,dy);
    if(past>0)return ground+(collar-ground)*(1-smooth(past/192));
  }
  // The flat throat cuts through the crater rim at lake level. Both fields
  // share this exact bank and floor; everywhere else the crater stays sealed.
  // The source starts inside the lake. Its rounded upstream segment cap must
  // never build a horseshoe-shaped bank or island across the molten bowl.
  return p.z===LAVA_SOURCE.level&&lavaCraterRadius(x,y)<1240?Math.min(ground,collar):collar;
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
