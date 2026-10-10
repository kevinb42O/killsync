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
  const terrain=new FriendsTerrain({generation:TERRAIN_GENERATION,revision:1,edits:[[1000,1,Math.ceil(ISLAND_SEA_LEVEL/32)-1,0]]});
  const visual=new FriendsFloodWaterVisuals(terrain,atmosphere());visual.sync();
  return {terrain,visual};
}
describe('excavation water rendering lifecycle',()=>{
  it('uses supplied sparse geometry without allocating a dense water grid',()=>{
    const geometry=new THREE.BufferGeometry();const water=islandWater(32016,16,512,512,ISLAND_SEA_LEVEL,()=>64,false,16,geometry);
    expect(water.geometry).toBe(geometry);expect(water.geometry.attributes).toEqual({});
    geometry.dispose();water.material.dispose();(water.userData.bathymetry as THREE.Texture).dispose();
  });
  it('keeps sea excavation opacity independent of the natural ocean patch',()=>{
    const {visual}=fixture(),sheet=visual.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    expect(sheet.material.uniforms.ocean.value).toBe(1);
    expect(sheet.material.uniforms.oceanPatchBlend.value).toBe(0);
    const natural=islandWater(24000,24000,48000,48000,ISLAND_SEA_LEVEL,()=>64,true,4);
    expect(natural.material.uniforms.oceanPatchBlend.value).toBe(1);
    visual.dispose();natural.geometry.dispose();natural.material.dispose();(natural.userData.bathymetry as THREE.Texture).dispose();
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
  it('extends the original sea surface instead of drawing a second flat sheet',()=>{
    const {visual}=fixture(),natural=islandWater(32016,16,512,512,ISLAND_SEA_LEVEL,()=>64);
    natural.material.uniforms.ocean.value=1;natural.material.uniforms.waveAmplitude.value=5;
    const geometry=natural.geometry;visual.bindNatural(natural);
    expect(visual.children).toHaveLength(0);expect(natural.geometry).toBe(geometry);
    expect(natural.material.uniforms.waveAmplitude.value).toBe(5);
    const mask=natural.material.uniforms.excavationMask.value as THREE.DataTexture;
    const data=mask.image.data as Uint16Array,index=(1500+1000)*2;
    expect(THREE.DataUtils.fromHalfFloat(data[index+1])).toBeGreaterThan(0);
    expect(natural.material.vertexShader).toContain('if(excavation.y>0.)depth=excavation.y');
    expect(natural.material.fragmentShader).toContain('if(excavation.y>0.)depth=excavation.y');
    visual.dispose();natural.geometry.dispose();natural.material.dispose();(natural.userData.bathymetry as THREE.Texture).dispose();
  });
  it('retains identical buffers after an equivalent terrain restoration and releases replaced resources',()=>{
    const {terrain,visual}=fixture(),sheet=visual.children[0] as THREE.Mesh,geometry=sheet.geometry,material=sheet.material as THREE.Material,texture=sheet.userData.bathymetry as THREE.Texture;
    let disposed=0;for(const resource of [geometry,material,texture])resource.addEventListener('dispose',()=>disposed++);
    terrain.restore(terrain.snapshot());visual.sync();expect(visual.children[0]).toBe(sheet);expect(disposed).toBe(0);
    terrain.restore({generation:TERRAIN_GENERATION,revision:2,edits:[]});visual.sync();expect(visual.children).toHaveLength(0);expect(disposed).toBe(3);
    visual.dispose();expect(disposed).toBe(3);
  });
});
