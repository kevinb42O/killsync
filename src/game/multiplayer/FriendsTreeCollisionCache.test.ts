import { describe, expect, it, vi } from 'vitest';
import { FriendsTreeCollisionCache } from './FriendsTreeCollisionCache';
import { frontierTrees, type FrontierTree } from './FriendsFrontier';

const tree = (id='planted:1',x=20000,y=20000,z=0):FrontierTree => ({id,x,y,z,kind:'pine',scale:1});
function original(position:{x:number;y:number},z:number,radius:number,forest:{harvested:string[];planted:FrontierTree[]},supports:(x:number,y:number,z:number)=>boolean) {
  const cx=Math.floor(position.x/512),cy=Math.floor(position.y/512),removed=new Set(forest.harvested);
  const trees=[...forest.planted];for(let a=cx-1;a<=cx+1;a++)for(let b=cy-1;b<=cy+1;b++)trees.push(...frontierTrees(a,b));
  let collided=false;
  for(const t of trees){
    if(removed.has(t.id)||!supports(t.x,t.y,t.z)||z>=t.z+180*t.scale||z+50<t.z)continue;
    const dx=position.x-t.x,dy=position.y-t.y,d=Math.hypot(dx,dy),extent=radius+10*t.scale;
    if(d<extent){position.x=t.x+(d>.001?dx/d:1)*extent;position.y=t.y+(d>.001?dy/d:0)*extent;collided=true;}
  }
  return collided;
}

describe('guest tree collision cache',()=>{
  it('matches the original at floating-point contact boundaries',()=>{
    const forest={harvested:[],planted:[tree()]},terrain={revision:1,waterEpoch:1,supports:()=>true},cache=new FriendsTreeCollisionCache();
    for(let i=0;i<360;i++)for(const scale of [1-Number.EPSILON,1,1+Number.EPSILON]){
      const angle=i*Math.PI/180,full={x:20000+29*Math.cos(angle)*scale,y:20000+29*Math.sin(angle)*scale},cached={...full};
      expect(cache.collide(cached,0,19,forest,terrain)).toBe(original(full,0,19,forest,terrain.supports));
      expect(cached).toEqual(full);
    }
  });
  it('matches 6000 seeded checks through planting, harvesting, region travel, and terrain repairs',()=>{
    let seed=1234567;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    const cache=new FriendsTreeCollisionCache(),terrain={revision:0,waterEpoch:0,supports:(x:number,y:number,z:number)=>(Math.floor(x+y+z)+terrain.waterEpoch)%3!==0};
    for(let frame=0;frame<60;frame++){
      const planted=Array.from({length:64},(_,i)=>({...tree(`planted:${i}`,20000+Math.floor(random()*16)*32,20000+Math.floor(random()*16)*32,Math.floor(random()*8)*32),scale:.1+random()*2.9}));
      const forest={planted,harvested:planted.filter(()=>random()<.2).map(t=>t.id)};
      terrain.waterEpoch++;if(frame%2)terrain.revision++;
      for(let sample=0;sample<100;sample++){
        const t=planted[Math.floor(random()*planted.length)],full={x:t.x+(random()-.5)*80,y:t.y+(random()-.5)*80},cached={...full},z=t.z+(random()-.25)*200,radius=12+random()*20;
        expect(cache.collide(cached,z,radius,forest,terrain)).toBe(original(full,z,radius,forest,terrain.supports));
        expect(cached).toEqual(full);
      }
    }
  });
  it('matches the original collision order across regions and overlapping trunks',()=>{
    const forest={harvested:['planted:3'],planted:[tree('planted:1',6080,5860),tree('planted:2',6104,5860),tree('planted:3',6096,5860)]};
    const terrain={revision:1,waterEpoch:1,supports:(x:number,y:number)=>Math.round(x+y)%3!==0};
    const cache=new FriendsTreeCollisionCache();
    const samples=[...forest.planted,...frontierTrees(11,11),...frontierTrees(20,8),...frontierTrees(21,8)];
    for(const t of samples)for(const radius of [12,19,32])for(const [dx,dy,dz]of [[0,0,0],[15,0,0],[28,4,0],[0,0,180],[-16,-16,-51],[0,0,-50]]){
      const full={x:t.x+dx,y:t.y+dy},cached={...full},z=t.z+dz;
      expect(cache.collide(cached,z,radius,forest,terrain)).toBe(original(full,z,radius,forest,terrain.supports));
      expect(cached).toEqual(full);
    }
  });
  it('checks support only for reachable trunks and reuses positive and negative results',()=>{
    const supports=vi.fn(()=>true),terrain={revision:1,waterEpoch:1,supports};
    const forest={harvested:[],planted:[tree(),tree('planted:2',30000,30000),tree('planted:3',20000,20000,500)]};
    const cache=new FriendsTreeCollisionCache();
    for(let i=0;i<20;i++)expect(cache.collide({x:20000,y:20000},0,19,forest,terrain)).toBe(true);
    expect(supports).toHaveBeenCalledTimes(1);
    supports.mockReturnValue(false);terrain.revision++;
    for(let i=0;i<20;i++)expect(cache.collide({x:20000,y:20000},0,19,forest,terrain)).toBe(false);
    expect(supports).toHaveBeenCalledTimes(2);
    supports.mockReturnValue(true);terrain.waterEpoch++;
    expect(cache.collide({x:20000,y:20000},0,19,forest,terrain)).toBe(true);
    expect(supports).toHaveBeenCalledTimes(3);
  });
  it('observes harvested, regrown, replaced, and removed planted trees between snapshots',()=>{
    const terrain={revision:1,waterEpoch:1,supports:()=>true},cache=new FriendsTreeCollisionCache();
    let forest={harvested:[] as string[],planted:[tree()]};
    const hit=()=>cache.collide({x:20000,y:20000},0,19,forest,terrain);
    expect(hit()).toBe(true);
    forest={...forest,harvested:['planted:1']};expect(hit()).toBe(false);
    forest={...forest,harvested:[]};expect(hit()).toBe(true);
    forest={...forest,planted:[tree('planted:1',22000,22000)]};expect(hit()).toBe(false);
    expect(cache.collide({x:22000,y:22000},0,19,forest,terrain)).toBe(true);
    forest={...forest,planted:[]};expect(cache.collide({x:22000,y:22000},0,19,forest,terrain)).toBe(false);
  });
  it('invalidates support when the terrain object changes with identical revisions',()=>{
    const cache=new FriendsTreeCollisionCache(),forest={harvested:[],planted:[tree()]};
    expect(cache.collide({x:20000,y:20000},0,19,forest,{revision:1,waterEpoch:1,supports:()=>true})).toBe(true);
    expect(cache.collide({x:20000,y:20000},0,19,forest,{revision:1,waterEpoch:1,supports:()=>false})).toBe(false);
  });
});
