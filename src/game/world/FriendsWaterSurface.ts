import { ISLAND_LAKES, ISLAND_SEA_LEVEL, islandArchRange, islandLakeRadius, islandCoastDistance } from './FriendsIsland';
import { baseTerrainHeight } from './FriendsTerrain';
import { riverWetAt } from './FriendsHydrology';
export function friendsWaterGround(x:number,y:number){return islandArchRange(x,y)?.[0]??baseTerrainHeight(x,y);}
/** The same bounded wet footprint is used by pixels, swimming and audio. */
export function friendsWaterLevel(x:number,y:number):number|undefined{
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>48000||y>48000)return;
  let level:number|undefined;
  const river=riverWetAt(x,y);
  if(river)level=river.level;
  for(const lake of ISLAND_LAKES){
    if(Math.abs(x-lake.x)>lake.rx*1.45||Math.abs(y-lake.y)>lake.ry*1.45||islandLakeRadius(x,y,lake)>1.15)continue;
    // A tributary only enters the fixed lake surface after its descent ends.
    if(river&&Math.abs(river.level-lake.level)>1)continue;
    level=level===undefined?lake.level:Math.max(level,lake.level);
  }
  if(level===undefined&&islandCoastDistance(x,y)<80)level=ISLAND_SEA_LEVEL;
  return level!==undefined&&friendsWaterGround(x,y)<level-1?level:undefined;
}
