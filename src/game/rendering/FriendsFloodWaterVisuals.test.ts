import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsTerrain, TERRAIN_GENERATION } from '../world/FriendsTerrain';
import { ISLAND_SEA_LEVEL } from '../world/FriendsIsland';
import { FriendsFloodWaterVisuals } from './FriendsFloodWaterVisuals';
import { islandWater } from './FriendsIslandVisuals';
import type { FriendsDayNightCycle } from './FriendsDayNightCycle';

const atmosphere=()=>({
  lightDirection:{value:new THREE.Vector3(0,1,0)},lightColor:{value:new THREE.Color(1,1,1)},
  directStrength:{value:1},surfaceTint:{value:new THREE.Color(1,1,1)},
  horizon:new THREE.Color(),zenith:new THREE.Color(),
}) as unknown as FriendsDayNightCycle;
function fixture(){
  const terrain=new FriendsTerrain({generation:TERRAIN_GENERATION,revision:1,edits:[[1000,0,Math.ceil(ISLAND_SEA_LEVEL/32)-1,0]]});
  const visual=new FriendsFloodWaterVisuals(terrain,atmosphere());visual.sync();
  return {terrain,visual};
}
describe('excavation water rendering lifecycle',()=>{
  it('uses supplied sparse geometry without allocating a dense water grid',()=>{
    const geometry=new THREE.BufferGeometry();const water=islandWater(32016,16,512,512,ISLAND_SEA_LEVEL,()=>64,false,16,geometry);
    expect(water.geometry).toBe(geometry);expect(water.geometry.attributes).toEqual({});
    geometry.dispose();water.material.dispose();(water.userData.bathymetry as THREE.Texture).dispose();
  });
  it('enables ownership masking for natural sheets bound after flooding starts',()=>{
    const {visual}=fixture();expect(visual.stats.floodDrawCalls).toBeGreaterThan(0);
    const natural=islandWater(32016,16,512,512,ISLAND_SEA_LEVEL,()=>64);
    visual.bindNatural(natural);
    expect(natural.material.uniforms.excavationMaskEnabled.value).toBe(1);
    expect(natural.material.uniforms.excavationMask.value).toBeInstanceOf(THREE.DataTexture);
    const shader=natural.material.fragmentShader;visual.bindNatural(natural);expect(natural.material.fragmentShader).toBe(shader);
    visual.dispose();expect(natural.material.uniforms.excavationMaskEnabled.value).toBe(0);expect(natural.material.uniforms.excavationMask.value).toBeNull();
    natural.geometry.dispose();natural.material.dispose();(natural.userData.bathymetry as THREE.Texture).dispose();
  });
  it('retains identical buffers after an equivalent terrain restoration and releases replaced resources',()=>{
    const {terrain,visual}=fixture(),sheet=visual.children[0] as THREE.Mesh,geometry=sheet.geometry,material=sheet.material as THREE.Material,texture=sheet.userData.bathymetry as THREE.Texture;
    let disposed=0;for(const resource of [geometry,material,texture])resource.addEventListener('dispose',()=>disposed++);
    terrain.restore(terrain.snapshot());visual.sync();expect(visual.children[0]).toBe(sheet);expect(disposed).toBe(0);
    terrain.restore({generation:TERRAIN_GENERATION,revision:2,edits:[]});visual.sync();expect(visual.children).toHaveLength(0);expect(disposed).toBe(3);
    visual.dispose();expect(disposed).toBe(3);
  });
});
