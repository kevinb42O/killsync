import {describe,it,expect} from 'vitest';
import {friendsListenerSubmerged} from './FriendsSwimAudio';
import {FriendsTerrain} from '../world/FriendsTerrain';
describe('head immersion audio state',()=>{
 const terrain=new FriendsTerrain();
 it('waits for the head to enter the water, independent of the dive intent flag',()=>{
  const p={x:12128,y:23600,z:136.5,motion:{swimming:true,swimSubmerged:true}};
  expect(friendsListenerSubmerged(p,terrain)).toBe(false);p.z=115;expect(friendsListenerSubmerged(p,terrain)).toBe(true);
  p.motion.swimSubmerged=false;expect(friendsListenerSubmerged(p,terrain)).toBe(true);
 });
 it('uses the deep sea level and small waterline hysteresis',()=>{
  const p={x:44000,y:23852,z:-2500,motion:{swimming:true}};expect(friendsListenerSubmerged(p,terrain)).toBe(true);
  p.z=-168.5-26-.8;expect(friendsListenerSubmerged(p,terrain,false)).toBe(false);expect(friendsListenerSubmerged(p,terrain,true)).toBe(true);
  p.z=-168.5-26+1;expect(friendsListenerSubmerged(p,terrain,true)).toBe(false);
 });
});
