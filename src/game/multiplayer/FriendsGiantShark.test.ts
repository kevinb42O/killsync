import { describe,expect,it } from 'vitest';
import { isGiantShark, sharkFight, sharkLanding, sharkWaterPose, sharkWaterStep } from './FriendsGiantShark';
import type { FishingEnvironment } from './FriendsFishing';
const env:FishingEnvironment={water:()=>({level:0,depth:400,bodyId:'sea'}),floor:()=>-400,blocked:()=>false};
describe('giant shark body clearance and fight',()=>{
 it('applies only to sharks at least six metres long',()=>{
  expect(isGiantShark({species:'shark',size:599/85})).toBe(false);expect(isGiantShark({species:'shark',size:600/85})).toBe(true);expect(isGiantShark({species:'tuna',size:10})).toBe(false);
 });
 it('reduces runs and load to zero at exhaustion',()=>{
  const fresh=sharkFight(0,900,1),tired=sharkFight(.9,900,1);expect(fresh.load).toBeGreaterThan(tired.load);expect(sharkFight(1,900,1)).toEqual({run:0,side:0,load:0});
 });
 it('rejects shallow water, dry nose/tail points, floors and obstructed fins',()=>{
  const point={x:0,y:0,z:0};expect(sharkWaterPose(env,point,10,0)).toBeDefined();
  for(const bad of [{...env,water:()=>({level:0,depth:10,bodyId:'sea'})},{...env,water:(x:number,y:number)=>Math.abs(x)>160||Math.abs(y)>40?undefined:env.water!(x,y)},{...env,floor:()=>-10},{...env,blocked:()=>true},{...env,waterObstacle:()=>true}])expect(sharkWaterPose(bad,point,10,0)).toBeUndefined();
 });
 it('sweeps the whole body rather than skipping an obstacle between endpoints',()=>{
  const wall={...env,waterObstacle:(x:number,_y:number,radius:number)=>Math.abs(x-260)<radius};
  const safe=sharkWaterStep(wall,{x:0,y:0,z:0},{x:600,y:0,z:0},10,Math.PI/2);
  expect(safe).toBeDefined();expect(safe!.x).toBeLessThan(260);
 });
 it('finds deeper water alongside the player and keeps away from boat hulls',()=>{
  const shore={...env,water:(x:number,y:number)=>x<140?undefined:env.water!(x,y),waterObstacle:(x:number,y:number,r:number)=>Math.abs(x-230)<40+r&&Math.abs(y)<20+r};
  const landing=sharkLanding(shore,{x:0,y:0,z:0},{x:600,y:0,z:0},10)!;
  expect(landing).toBeDefined();expect(sharkWaterPose(shore,landing.point,10,landing.angle)).toBeDefined();expect(Math.hypot(landing.point.x-230,landing.point.y)).toBeGreaterThan(100);
 });
});
