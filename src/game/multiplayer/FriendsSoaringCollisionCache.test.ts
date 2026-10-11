import { describe,it,expect } from 'vitest';
import { FriendsTreeCollisionCache } from './FriendsTreeCollisionCache';
describe('canopy forest contact cache',()=>{
  it('reuses support queries but notices a mutated host harvesting Set and new planting',()=>{
    const cache=new FriendsTreeCollisionCache(),harvested=new Set<string>();let calls=0;
    const tree={id:'planted:wing',x:-10000,y:-10000,z:0,scale:1,kind:'pine'} as any;
    const forest={harvested,planted:[tree]},terrain={revision:0,waterEpoch:0,supports:()=>{calls++;return true;}};
    for(let i=0;i<14;i++)expect(cache.collide({x:tree.x,y:tree.y},80,4,forest,terrain)).toBe(true);
    expect(calls).toBe(1);harvested.add(tree.id);
    expect(cache.collide({x:tree.x,y:tree.y},80,4,forest,terrain)).toBe(false);
    forest.planted.push({...tree,id:'planted:new-wing'});
    expect(cache.collide({x:tree.x,y:tree.y},80,4,forest,terrain)).toBe(true);expect(calls).toBe(2);
  });
});
