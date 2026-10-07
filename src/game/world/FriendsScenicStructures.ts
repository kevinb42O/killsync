import { scenicStationPoses } from './FriendsScenicRailway';
/** Level station reservations. No stair towers or elevated access structures. */
export function scenicStationRanges(x:number,y:number):[number,number][]{return scenicStationPoses().flatMap(p=>{
  const dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle),along=dx*c+dy*s,side=-dx*s+dy*c;
  return Math.abs(along)<1408&&side>=64&&side<400?[[p.z-32,p.z+240] as [number,number]]:[];
});}
