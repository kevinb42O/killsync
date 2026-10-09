import { ISLAND_LAKES, ISLAND_SEA_LEVEL, islandArchRange, islandLakeRadius, islandCoastDistance } from './FriendsIsland';
import { baseTerrainHeight, skyfallWaterLevelAt } from './FriendsTerrain';
import { riverWetAt, riverSampleAt } from './FriendsHydrology';

export type FriendsWaterSample = { level:number; depth:number; bodyId:string };
/** Match the actual 32-unit collision cells, including open cave mouths. */
export function friendsWaterGround(x:number,y:number){
  const cx=Math.floor(x/32)*32+16,cy=Math.floor(y/32)*32+16;
  return Math.min(baseTerrainHeight(cx,cy),islandArchRange(cx,cy)?.[0]??Infinity);
}
/** One owner per wet point. All render masks, swimmers and boats use this field.
 * Flat river/lake joins belong to the lake; descending reaches belong to the
 * river. Their boundary has exactly the same elevation and depth on both sides. */
export function friendsWaterAt(x:number,y:number):FriendsWaterSample|undefined{
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>48000||y>48000)return;
  const river=riverWetAt(x,y);
  const cascade=skyfallWaterLevelAt(x,y);
  let level=river?.level??(cascade&&cascade.side<cascade.width*.64?cascade.level:undefined),bodyId=river?.riverId??(level!==undefined?cascade?.id:undefined);
  for(const lake of ISLAND_LAKES){
    if(Math.abs(x-lake.x)>lake.rx*1.5||Math.abs(y-lake.y)>lake.ry*1.5||islandLakeRadius(x,y,lake)>1.45)continue;
    if(river&&Math.abs(river.level-lake.level)>.05||cascade&&cascade.level>lake.level+1)continue;
    if(friendsWaterGround(x,y)>=lake.level-1)continue;
    level=lake.level;bodyId=lake.id;break;
  }
  if((level===undefined||Math.abs(level-ISLAND_SEA_LEVEL)<.05)&&islandCoastDistance(x,y)<80){level=ISLAND_SEA_LEVEL;bodyId='sea';}
  if(level===undefined||!bodyId)return;
  const depth=level-friendsWaterGround(x,y);
  return depth>1?{level,depth,bodyId}:undefined;
}
export function friendsWaterLevel(x:number,y:number){return friendsWaterAt(x,y)?.level;}
/** Signed ownership mask, deliberately identical for adjacent water meshes. */
export function friendsWaterDepth(x:number,y:number,bodyId:string){
  const s=friendsWaterAt(x,y);return s?.bodyId===bodyId?s.depth:-32;
}

/** Keep the visual sheet buried in its banks. The navigation field stops at
 * solid collision cells, but the distant terrain interpolates those cells.
 * Cutting the mesh at that same texel exposes an air edge below the smooth
 * bank. Dry bank texels therefore retain water geometry behind the terrain;
 * ordinary depth testing supplies the actual visible shoreline. */
export function friendsWaterRenderDepth(x:number,y:number,bodyId:string){
  const wet=friendsWaterAt(x,y);
  if(wet)return wet.bodyId===bodyId?wet.depth:-32;
  const river=riverSampleAt(x,y),cascade=skyfallWaterLevelAt(x,y);
  let owner:string|undefined,level:number|undefined;
  if(river&&river.side<river.width*.8+32){owner=river.riverId;level=river.level;}
  else if(cascade&&cascade.side<cascade.width*.8+32){owner=cascade.id;level=cascade.level;}
  // Give dry bank texels the same lake ownership as their adjacent wet
  // texels. Extending two translucent sheets over a join would darken it.
  for(const lake of ISLAND_LAKES){
    if(Math.abs(x-lake.x)>lake.rx*1.5||Math.abs(y-lake.y)>lake.ry*1.5||islandLakeRadius(x,y,lake)>1.45)continue;
    if(river&&Math.abs(river.level-lake.level)>1||cascade&&cascade.level>lake.level+1)continue;
    owner=lake.id;level=lake.level;break;
  }
  return owner===bodyId&&level!==undefined?Math.max(1,level-friendsWaterGround(x,y)):-32;
}
