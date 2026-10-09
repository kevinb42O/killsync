import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {FriendsTerrain} from '../world/FriendsTerrain';
import {FriendsSubmergedDressing} from './FriendsSubmergedDressing';
import {FriendsUnderwaterVisuals} from './FriendsUnderwaterVisuals';
const camera=()=>{const c=new THREE.PerspectiveCamera();c.position.set(12128,-285,23600);return c;};
describe('local submerged scenery budgets and activation',()=>{
 it('does not allocate scenery or query placement terrain for a player on land',()=>{
  const scene=new THREE.Scene(),terrain=new FriendsTerrain(),effect=new FriendsUnderwaterVisuals(scene),c=camera(),floor=vi.spyOn(terrain,'floor');c.position.y=220;
  for(let i=0;i<80;i++){effect.beginFrame();effect.update(c,i*16,true,1,terrain,false);}
  expect(scene.getObjectByName('submerged-bed-dressing')).toBeUndefined();expect(floor).not.toHaveBeenCalled();effect.dispose();
 });
 it('places deterministic scenery incrementally and reuses buffers across travel',()=>{
  const a=new FriendsSubmergedDressing(new THREE.Scene()),b=new FriendsSubmergedDressing(new THREE.Scene()),terrain=new FriendsTerrain(),c=camera(),geometry=a.rocks.geometry;
  a.update(c,1000,terrain,'deepmere');expect(a.stats.sampledTiles).toBeLessThanOrEqual(12);
  for(let i=0;i<121;i++){a.update(c,1000+i*16,terrain,'deepmere');b.update(c,1000+i*16,terrain,'deepmere');}
  expect(a.stats.placedTiles).toBeGreaterThan(50);expect([...a.rocks.instanceMatrix.array]).toEqual([...b.rocks.instanceMatrix.array]);
  const samples=a.stats.sampledTiles,version=a.rocks.instanceMatrix.version;a.update(c,5000,terrain,'deepmere');expect(a.stats.sampledTiles).toBe(samples);expect(a.rocks.instanceMatrix.version).toBe(version);
  c.position.x+=600;a.update(c,6000,terrain,'deepmere');expect(a.stats.sampledTiles-samples).toBeLessThanOrEqual(12);expect(a.rocks.geometry).toBe(geometry);expect(a.rocks.count).toBe(363);expect(a.plants.count).toBe(484);expect(a.timber.count).toBe(121);expect((a.timber.material as THREE.Material).customProgramCacheKey()).not.toBe((a.rocks.material as THREE.Material).customProgramCacheKey());a.dispose();b.dispose();
 });
 it('supports surface swimming and hides everything without placement work after leaving',()=>{
  const scene=new THREE.Scene(),terrain=new FriendsTerrain(),effect=new FriendsUnderwaterVisuals(scene),c=camera();c.position.y=170;
  effect.update(c,1000,true,1,terrain,true);const root=scene.getObjectByName('submerged-bed-dressing')!;expect(root.visible).toBe(true);expect(effect.overlay.visible).toBe(false);
  const floor=vi.spyOn(terrain,'floor');floor.mockClear();effect.beginFrame();effect.update(c,1016,true,1,terrain,false);expect(root.visible).toBe(false);expect(floor).not.toHaveBeenCalled();effect.dispose();expect(root.parent).toBeNull();
 });
 it('skips non lake/sea water and rebuilt tiles omit solid construction',()=>{
  const terrain=new FriendsTerrain(),scene=new THREE.Scene(),dressing=new FriendsSubmergedDressing(scene),c=camera();dressing.update(c,1000,terrain,'river');expect(dressing.root.visible).toBe(false);expect(dressing.stats.sampledTiles).toBe(0);
  vi.spyOn(terrain,'floor').mockReturnValue(128);for(let i=0;i<121;i++)dressing.update(c,2000+i*16,terrain,'deepmere');expect(dressing.stats.placedTiles).toBe(0);expect([...dressing.plants.instanceMatrix.array].every(v=>v===0||v===1)).toBe(true);dressing.dispose();
 });
});
