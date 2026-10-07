import { baseTerrainHeight } from './FriendsTerrain';
import { scenicStationRanges } from './FriendsScenicStructures';
import { railColumns, sampleRailAlignment, type RailVector } from './FriendsRailAlignment';
import { scenicRailway, scenicStationPoses } from './FriendsScenicRailway';
import { surveyRailwaySections, type RailwaySection } from './FriendsRailwaySurvey';
import { islandArchRange } from './FriendsIsland';
export const RAIL_EXCAVATION_HALF_WIDTH=144,RAIL_EXCAVATION_HEIGHT=224;
const cache=new Map<string,ReturnType<typeof railColumns>>();
export function scenicRailColumns(x:number,y:number){
  if(!scenicRailway().tiles.has(`${Math.floor(x/512)},${Math.floor(y/512)}`))return [];
  const key=`${x},${y}`;let columns=cache.get(key);
  if(!columns){columns=railColumns(scenicRailway(),x,y,RAIL_EXCAVATION_HALF_WIDTH);if(cache.size>24000)cache.clear();cache.set(key,columns);}
  return columns;
}
export function scenicTunnelRoof(side:number){return 156+68*Math.sqrt(Math.max(0,1-(side/RAIL_EXCAVATION_HALF_WIDTH)**2));}
let tunnelSections:RailwaySection[]|undefined;
/** One bore survey owns both the lining and the landscape above it, including
 * short gaps between terrain terraces that belong to the same tunnel. */
export function scenicTunnelSections(){
  if(!tunnelSections){const route=scenicRailway(),stations=scenicStationPoses();
    tunnelSections=surveyRailwaySections(route,d=>{
      const p=sampleRailAlignment(route,d);
      const h=baseTerrainHeight(p.x,p.y),arch=islandArchRange(p.x,p.y);
      return h>p.z+RAIL_EXCAVATION_HEIGHT&&(!arch||h>=arch[1]+64)&&!stations.some(s=>{const delta=Math.abs(s.distance-d);return Math.min(delta,route.length-delta)<1536;});
    },96);
  }
  return tunnelSections;
}
export function scenicTunnelAt(distance:number){
  const sections=scenicTunnelSections();let lo=0,hi=sections.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(sections[mid].end<distance)lo=mid+1;else hi=mid;}
  return sections[lo]&&sections[lo].start<=distance?sections[lo]:undefined;
}
// Voxel excavation tests cell centres. Outward rounding would erase a
// surviving roof when switching from detailed terrain to distant terrain.
const voxelBoundary=(height:number)=>Math.ceil((height-16)/32)*32;
/** Sampling hint for the smooth renderer's narrow tunnel cover slabs. */
export function scenicTunnelCoverLimit(x:number,y:number,height:number){
  const arch=islandArchRange(x,y);
  return (!arch||height>=arch[1]+64)&&scenicRailColumns(x,y).some(p=>scenicTunnelAt(p.distance))?height-64:height;
}
export function scenicRailAir(x:number,y:number,z:number){return scenicRailColumns(x,y).some(p=>z>=p.z-24&&z<p.z+scenicTunnelRoof(p.side));}
export function scenicRailProtected(x:number,y:number,z:number){return scenicRailColumns(x,y).some(p=>z>=p.z-48&&z<p.z+RAIL_EXCAVATION_HEIGHT);}
/** Cuttings are visible even before a volume is streamed. A fully enclosed
 * tunnel preserves the mountain's surface and gets an explicit volume shell. */
export function scenicRailSurface(x:number,y:number,height:number){
  const columns=scenicRailColumns(x,y);
  const arch=islandArchRange(x,y);
  for(const p of columns)if(scenicTunnelAt(p.distance)&&(!arch||height>=arch[1]+64))height=Math.max(height,voxelBoundary(p.z+scenicTunnelRoof(p.side))+64);
  for(const p of columns)if(height>voxelBoundary(p.z-24)&&height<=voxelBoundary(p.z+scenicTunnelRoof(p.side)))height=Math.min(height,voxelBoundary(p.z-24));
  return height;
}
export function scenicRailRanges(x:number,y:number,height:number):[number,number][] {
  return scenicRailColumns(x,y).filter(p=>voxelBoundary(p.z-24)<height).map(p=>[voxelBoundary(p.z-24),Math.min(height,voxelBoundary(p.z+scenicTunnelRoof(p.side)))]);
}
export function scenicRailFloor(x:number,y:number,z:number,step=8):number|undefined {
  let floor:number|undefined;
  for(const p of scenicRailColumns(x,y)){
    const top=p.side<=80?p.z:p.side<=112&&baseTerrainHeight(p.sample.x,p.sample.y)>p.z+12?p.z-24:undefined;
    if(top!==undefined&&top<=z+step&&(floor===undefined||top>floor))floor=top;
  }
  for(const station of scenicStationPoses()){
    const dx=x-station.x,dy=y-station.y,c=Math.cos(station.angle),s=Math.sin(station.angle),a=dx*c+dy*s,b=-dx*s+dy*c;
    if(Math.abs(a)<=1280&&b>=80&&b<=384&&station.z+14<=z+step)floor=Math.max(floor??-Infinity,station.z+14);
  }
  return floor;
}
export function scenicRailCeiling(x:number,y:number,z:number){
  let ceiling:number|undefined;
  for(const p of scenicRailColumns(x,y))if(p.side<=80&&p.z-24>z+.1)ceiling=Math.min(ceiling??Infinity,p.z-24);
  return ceiling;
}
/** Platform/rail decks exist independent of renderer residency. */
export function scenicRailDeckSolid(p:RailVector){return scenicRailColumns(p.x,p.y).some(c=>c.side<=80&&p.z>=c.z-24&&p.z<c.z);}

const transitCache=new Map<string,[number,number][]>();
export function scenicStructureRanges(x:number,y:number){const key=`${x},${y}`;let value=transitCache.get(key);if(!value){value=scenicStationRanges(x,y);if(transitCache.size>24000)transitCache.clear();transitCache.set(key,value);}return value;}
export function scenicTransitRanges(x:number,y:number,height:number):[number,number][]{return [...scenicRailRanges(x,y,height),...scenicStructureRanges(x,y).filter(r=>voxelBoundary(r[0])<height).map(r=>[voxelBoundary(r[0]),Math.min(height,voxelBoundary(r[1]))] as [number,number])];}
export function scenicTransitAir(x:number,y:number,z:number){return scenicRailAir(x,y,z)||scenicStructureRanges(x,y).some(([lo,hi])=>z>=lo&&z<hi);}
export function scenicTransitProtected(x:number,y:number,z:number){return scenicRailProtected(x,y,z)||scenicStructureRanges(x,y).some(([lo,hi])=>z>=lo-32&&z<hi);}
export function scenicTransitSurface(x:number,y:number,height:number){height=scenicRailSurface(x,y,height);for(const [lo,hi]of scenicStructureRanges(x,y))if(height>voxelBoundary(lo)&&height<=voxelBoundary(hi))height=Math.min(height,voxelBoundary(lo));return height;}
