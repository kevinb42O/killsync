import { describe, expect, it } from 'vitest';
import { createValleyPlantings, VALLEY_PATHS, segmentDistance, VALLEY_CAMPS, FRIENDS_BUILD_CLEARINGS } from './FriendsLandscape';
import { railwayDistance, RAIL_STATIONS, FRIENDS_STATION_PLATFORM, sampleTrainRoute, TRAIN_LOOP_LENGTH } from './FriendsRailway';
import { friendsRegionObstacles } from './FriendsRegion';

describe('surveyed Friends landscape',()=>{
  it('reserves broad building areas without decorative vegetation',()=>{
    const {trees,shrubs,rocks}=createValleyPlantings();
    for(const p of [...trees,...shrubs,...rocks])for(const c of FRIENDS_BUILD_CLEARINGS)
      expect(((p.x-c.x)/(c.rx+p.radius))**2+((p.z-c.y)/(c.ry+p.radius))**2).toBeGreaterThan(1);
    expect(FRIENDS_BUILD_CLEARINGS.reduce((area,c)=>area+Math.PI*c.rx*c.ry,0)).toBeGreaterThan(6_000_000);
  });
  it('keeps solid landmarks and station platforms clear of the full moving train',()=>{
    const obstacles=friendsRegionObstacles(),intersections:string[]=[];
    for(let d=0;d<TRAIN_LOOP_LENGTH;d+=10){
      const p=sampleTrainRoute(d),c=Math.cos(p.angle),s=Math.sin(p.angle);
      // A carriage, roof and a rider at either side, throughout the circuit.
      for(const x of [-95,0,95])for(const y of [-79,0,79]){
        const wx=p.x+x*c-y*s,wy=p.y+x*s+y*c;
        for(const b of obstacles)if(wx>b.x&&wx<b.x+b.width&&wy>b.y&&wy<b.y+b.height)intersections.push(`train at ${d} intersects ${b.id}`);
        for(const station of RAIL_STATIONS){
          const dx=wx-station.x,dy=wy-station.y,sc=Math.cos(station.angle),ss=Math.sin(station.angle),lx=dx*sc+dy*ss,ly=-dx*ss+dy*sc;
          if(Math.abs(lx)<FRIENDS_STATION_PLATFORM.roofHalfLength&&Math.abs(ly-FRIENDS_STATION_PLATFORM.roofOffset)<FRIENDS_STATION_PLATFORM.roofDepth/2)intersections.push(`train at ${d} intersects ${station.id} canopy`);
        }
      }
    }
    expect(intersections.slice(0,20)).toEqual([]);
  });
  it('keeps the complete rotated tree and shrub footprint outside the train envelope and paths',()=>{
    const {trees,shrubs}=createValleyPlantings();expect(trees.length).toBeGreaterThan(30);expect(trees.length).toBeLessThanOrEqual(72);
    let railClearance=Infinity,pathClearance=Infinity,buildingClearance=Infinity;
    for(const p of [...trees,...shrubs]){
      railClearance=Math.min(railClearance,railwayDistance(p.x,p.z)-p.radius);
      for(const path of VALLEY_PATHS)for(let i=1;i<path.points.length;i++)pathClearance=Math.min(pathClearance,segmentDistance({x:p.x,y:p.z},path.points[i-1],path.points[i])-p.radius-path.width/2);
      for(const b of friendsRegionObstacles())buildingClearance=Math.min(buildingClearance,Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.z,0,p.z-b.y-b.height))-p.radius);
    }
    expect(railClearance).toBeGreaterThanOrEqual(180);expect(pathClearance).toBeGreaterThanOrEqual(18);expect(buildingClearance).toBeGreaterThanOrEqual(24);
  });
  it('keeps destination camps off the railway, including their fire and sign',()=>{
    for(const camp of VALLEY_CAMPS)for(const [dx,dy,r] of [[0,0,77],[110,75,25],[180,0,27]])expect(railwayDistance(camp.x+dx,camp.y+dy)-r).toBeGreaterThan(100);
  });
  it('routes walkways around solid architecture and the lake rather than through it',()=>{
    const buildings=friendsRegionObstacles().filter(b=>!b.id.startsWith('ridge'));
    for(const p of VALLEY_PATHS)for(let i=1;i<p.points.length;i++)for(let step=0;step<=50;step++){
      const a=p.points[i-1],b=p.points[i],x=a.x+(b.x-a.x)*step/50,y=a.y+(b.y-a.y)*step/50;
      for(const obstacle of buildings)expect(x>obstacle.x&&x<obstacle.x+obstacle.width&&y>obstacle.y&&y<obstacle.y+obstacle.height,`${p.id} crosses ${obstacle.id}`).toBe(false);
    }
  });
});
