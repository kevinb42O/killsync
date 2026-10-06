import { FRIENDS_BUILD_CLEARINGS, friendsSceneryPlacements, insideFriendsBuildClearing } from './FriendsScenery';
import { RAIL_STATIONS, FRIENDS_STATION_PLATFORM, railwayDistance } from './FriendsRailway';
import { FRIENDS_AIRPAD, FRIENDS_BUILD_MEADOW, FRIENDS_HUB, FRIENDS_LAKE, FRIENDS_PLACES, friendsRegionObstacles } from './FriendsRegion';

export type ValleyPoint = { x: number; y: number };
export interface ValleyPath { id: string; width: number; points: ValleyPoint[] }
export { FRIENDS_BUILD_CLEARINGS };
const path = (id: string, width: number, points: number[][]): ValleyPath => ({ id, width, points: points.map(([x,y]) => ({x,y})) });
const stationEntrance=(id:string)=>{
  const station=RAIL_STATIONS.find(p=>p.id===id)!,offset=FRIENDS_STATION_PLATFORM.offset+FRIENDS_STATION_PLATFORM.depth/2+20;
  return [station.x-Math.sin(station.angle)*offset,station.y+Math.cos(station.angle)*offset];
};
/** Surveyed routes follow shorelines and the spaces between buildings. The
 * ground renderer, map and vegetation all consume this same spatial plan. */
export const VALLEY_PATHS: ValleyPath[] = [
  path('commons-bay',125,[[5900,5620],[5260,5620],[4970,5720],[4700,5720]]),
  path('market-workshop',90,[[5900,5620],[5780,5450],[5520,5460]]),
  path('bay-workshop',80,[[4700,5720],[4490,5940],[4250,5920]]),
  path('station-commons',110,[stationEntrance('depot'),[6200,5400],[5900,5500],[5900,5620]]),
  path('meadow',100,[[5900,5620],[6100,5830],[6260,6100]]),
  path('north-shore',100,[[6200,5400],[6910,5480],[8020,5480],[8580,5750],[8775,6430],[9020,7035],[9020,7730],[8630,7830],[8630,7340]]),
  path('south-shore',100,[[6260,6100],[6280,7040],[6870,7440],[7770,7530],[8100,7830],[8630,7830],[8630,7340]]),
  path('observatory-walk',100,[[5900,5620],[5880,6460],[5900,7480],[6280,8200],[6280,8650],[6300,8890]]),
  path('garden-station',95,[stationEntrance('garden'),[9310,7500],[9040,7850],[8630,7830]]),
  path('archive-station',95,[stationEntrance('archive'),[6410,9090],[6280,9030],[6280,8650]]),
  path('outpost-station',95,[stationEntrance('wreck'),[3650,7870],[4030,7870],[4220,7790]]),
  path('reserve-edge',90,[[4700,5720],[4880,6290],[4980,7000],[4900,7740],[4400,7890],[4220,7790]]),
];
export const VALLEY_GROVES = [
  {id:'north-west',x:2650,y:4570,rx:350,ry:350},
  {id:'west-edge',x:2400,y:6730,rx:350,ry:350},
  {id:'south-west',x:2800,y:9470,rx:350,ry:350},
  {id:'south-edge',x:6530,y:10000,rx:350,ry:350},
  {id:'east-edge',x:10300,y:8240,rx:350,ry:350},
  {id:'north-east',x:9840,y:4370,rx:350,ry:350},
] as const;
export const VALLEY_CAMPS = [{x:3850,y:8220},{x:7710,y:5140},{x:5700,y:9750}];
export function segmentDistance(p: ValleyPoint, a: ValleyPoint, b: ValleyPoint) {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
const obstacles=friendsRegionObstacles();
export function valleyPlacementAllowed(x:number,y:number,radius:number) {
  if(VALLEY_CAMPS.some(p=>Math.hypot(x-p.x-70,y-p.y-35)<205+radius))return false;
  if(railwayDistance(x,y)<180+radius||insideFriendsBuildClearing(x,y,radius))return false;
  if(VALLEY_PATHS.some(p=>p.points.some((a,i)=>i>0&&segmentDistance({x,y},p.points[i-1],a)<p.width/2+radius+18)))return false;
  if(obstacles.some(b=>Math.hypot(Math.max(b.x-x,0,x-b.x-b.width),Math.max(b.y-y,0,y-b.y-b.height))<radius+24))return false;
  if(FRIENDS_PLACES.some(p=>Math.hypot(x-p.x,y-p.y)<330+radius))return false;
  if(Math.hypot(x-FRIENDS_HUB.x,y-FRIENDS_HUB.y)<410+radius||Math.hypot(x-FRIENDS_AIRPAD.x,y-FRIENDS_AIRPAD.y)<325+radius||Math.hypot(x-FRIENDS_BUILD_MEADOW.x,y-FRIENDS_BUILD_MEADOW.y)<FRIENDS_BUILD_MEADOW.radius+radius)return false;
  if(((x-FRIENDS_LAKE.x)/(FRIENDS_LAKE.rx+radius+50))**2+((y-FRIENDS_LAKE.y)/(FRIENDS_LAKE.ry+radius+50))**2<1)return false;
  for(const station of RAIL_STATIONS){const dx=x-station.x,dy=y-station.y,c=Math.cos(station.angle),s=Math.sin(station.angle),lx=dx*c+dy*s,ly=-dx*s+dy*c;if(Math.abs(lx)<385+radius&&ly>55-radius&&ly<230+radius)return false;}
  return true;
}
export function createValleyPlantings() {
  const placements=friendsSceneryPlacements().filter(p=>valleyPlacementAllowed(p.x,p.y,Math.hypot(p.width,p.depth)*p.scale/2));
  const pose=(p:typeof placements[number])=>({x:p.x,y:0,z:p.y,rotation:p.rotation,scale:p.scale,radius:Math.hypot(p.width,p.depth)*p.scale/2});
  const trees=placements.filter(p=>['oak','autumnOak','canopyTree','roundPine','pine'].includes(p.asset)).map(p=>({...pose(p),kind:p.asset}));
  const shrubs=placements.filter(p=>p.asset==='bush').map(pose);
  const rocks=placements.filter(p=>p.asset==='broadRock').map(pose);
  return {trees,shrubs,rocks};
}
