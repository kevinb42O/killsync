import { describe, it, expect, vi } from 'vitest';
import { collideRock, rockSurface, friendsGroveRocks, FriendsRockCollisionCache } from './FriendsRocks';
import { FriendsTerrain } from './FriendsTerrain';
import { frontierTrees } from '../multiplayer/FriendsFrontier';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { LocalPlayerPrediction } from '../multiplayer/LocalPlayerPrediction';

const rock={x:1000,y:1000,z:64,scale:1,rotation:0};
describe('woodland boulder collision',()=>{
  it('blocks the fitted rock, supports its sloped top, and clears above and below it',()=>{
    const top=rockSurface(rock,rock.x,rock.y)!;expect(top).toBeGreaterThan(rock.z+20);
    const p={x:rock.x,y:rock.y};expect(collideRock(rock,p,rock.z,19)).toBe(true);
    expect(Math.hypot(p.x-rock.x,p.y-rock.y)).toBeGreaterThan(19);
    expect(collideRock(rock,p,rock.z,19)).toBe(false);
    expect(collideRock(rock,{x:rock.x,y:rock.y},top,19)).toBe(false);
    expect(collideRock(rock,{x:rock.x,y:rock.y},rock.z-60,19)).toBe(false);
    expect(rockSurface(rock,rock.x+100,rock.y)).toBeUndefined();
  });
  it('rotates and scales the same hull as the instanced model',()=>{
    const rotated={...rock,rotation:1,scale:1.5},dx=10,dy=15;
    const x=rotated.x+(Math.cos(1)*dx+Math.sin(1)*dy)*1.5,y=rotated.y+(-Math.sin(1)*dx+Math.cos(1)*dy)*1.5;
    expect(rockSurface(rotated,x,y)).toBeCloseTo(rock.z+(rockSurface(rock,rock.x+dx,rock.y+dy)!-rock.z)*1.5);
    expect(collideRock(rotated,{x,y},rock.z,19)).toBe(true);
  });
  it('uses identical placements and contacts on the host and guest and invalidates harvested groves',()=>{
    const terrain=new FriendsTerrain();let tree:ReturnType<typeof frontierTrees>[number]|undefined;
    for(let a=20;a<70&&!tree;a++)for(let b=20;b<70&&!tree;b++)tree=frontierTrees(a,b).find(t=>terrain.supports(t.x,t.y,t.z));
    expect(tree).toBeDefined();const r=friendsGroveRocks([tree!],terrain)[0];
    const sim=new FriendsSimulation([{id:'walk',label:'Walk',color:'#fff'}]),snapshot=sim.createSnapshot(),frontier=sim['friendsFrontier']!;
    const actual=new FriendsRockCollisionCache().near(r.x,r.y,snapshot.friends!.frontier!,terrain).find(q=>q.x===r.x&&q.y===r.y)!;
    expect(actual).toBeDefined();const host={x:actual.x,y:actual.y},guest={...host},z=actual.z;
    const predictor=new LocalPlayerPrediction('walk');predictor.reconcile(snapshot);
    expect(frontier.collideRocks(host,z,19)).toBe(true);
    expect(predictor['rockCollisions'].collide(guest,z,19,snapshot.friends!.frontier!,predictor['terrain'])).toBe(true);
    expect(guest).toEqual(host);
    const top=rockSurface(actual,actual.x,actual.y)!;
    expect(sim['getPlayerStructureFloor']({x:actual.x,y:actual.y,z:top},19)).toBeCloseTo(top);
    expect(predictor['rockCollisions'].floor(actual.x,actual.y,top,snapshot.friends!.frontier!,predictor['terrain'])).toBeCloseTo(top);
    const cache=new FriendsRockCollisionCache(),forest={revision:0,harvested:[] as string[],planted:[{...tree!,id:'planted:test',x:actual.x+200,y:actual.y}]};
    const before=cache.near(actual.x,actual.y,forest,terrain);
    forest.harvested=frontierTrees(Math.floor(tree!.x/512),Math.floor(tree!.y/512)).map(t=>t.id);forest.revision++;
    expect(cache.near(actual.x,actual.y,forest,terrain)).not.toEqual(before);
  });
});

describe('rock cache invalidation',()=>{
  const tree={id:'planted:1',x:20000,y:20000,z:64,kind:'pine' as const,scale:1};
  function fixture(){
    const terrain=new FriendsTerrain();
    const supports=vi.spyOn(terrain,'supports').mockReturnValue(true);
    vi.spyOn(terrain,'surfaceHeight').mockReturnValue(64);
    return {terrain,supports,cache:new FriendsRockCollisionCache(),forest:{revision:0,harvested:['removed:1'],planted:[{...tree}]}};
  }
  it('reuses placements without terrain queries across unrelated revisions and equivalent guest snapshots',()=>{
    const {terrain,supports,cache,forest}=fixture(),before=cache.near(tree.x,tree.y,forest,terrain);
    supports.mockClear();
    forest.revision++;
    expect(cache.near(tree.x,tree.y,forest,terrain)).toBe(before);
    const next={...forest,revision:forest.revision+1,harvested:[...forest.harvested],planted:forest.planted.map(t=>({...t}))};
    expect(cache.near(tree.x,tree.y,next,terrain)).toBe(before);
    expect(supports).not.toHaveBeenCalled();
  });
  it('detects host Set additions and planting into the same array',()=>{
    const {terrain,cache}=fixture(),forest={harvested:new Set<string>(),planted:[{...tree}]};
    const before=cache.near(tree.x,tree.y,forest,terrain);
    forest.harvested.add(tree.id);
    const cut=cache.near(tree.x,tree.y,forest,terrain);
    expect(cut).not.toBe(before);expect(cut.some(r=>r.x===tree.x+60&&r.y===tree.y)).toBe(false);
    forest.planted.push({...tree,id:'planted:2',x:tree.x+128});
    expect(cache.near(tree.x,tree.y,forest,terrain)).not.toBe(cut);
  });
  it('detects same-count forest replacements, including changed planted coordinates',()=>{
    const {terrain,cache,forest}=fixture(),before=cache.near(tree.x,tree.y,forest,terrain);
    forest.harvested=[tree.id];
    const cut=cache.near(tree.x,tree.y,forest,terrain);expect(cut).not.toBe(before);
    forest.planted=[{...tree,x:tree.x+128}];
    expect(cache.near(tree.x,tree.y,forest,terrain)).not.toBe(cut);
  });
  it('refreshes support after terrain edits and when the terrain instance is replaced',()=>{
    const {terrain,supports,cache,forest}=fixture(),before=cache.near(tree.x,tree.y,forest,terrain);
    supports.mockReturnValue(false);terrain.revision++;
    const excavated=cache.near(tree.x,tree.y,forest,terrain);
    expect(excavated).not.toBe(before);expect(excavated).toHaveLength(0);
    const replacement=new FriendsTerrain();replacement.revision=terrain.revision;
    vi.spyOn(replacement,'supports').mockReturnValue(true);vi.spyOn(replacement,'surfaceHeight').mockReturnValue(64);
    expect(cache.near(tree.x,tree.y,forest,replacement)).not.toBe(excavated);
  });
  it('refreshes on water changes and crossing grove cell boundaries',()=>{
    const {terrain,cache,forest}=fixture(),before=cache.near(tree.x,tree.y,forest,terrain);
    terrain.waterEpoch++;
    const changedWater=cache.near(tree.x,tree.y,forest,terrain);expect(changedWater).not.toBe(before);
    expect(cache.near(tree.x+512,tree.y,forest,terrain)).not.toBe(changedWater);
  });
});
