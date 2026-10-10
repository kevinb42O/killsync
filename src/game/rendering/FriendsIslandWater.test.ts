import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsIslandOcean, islandOceanDepth, islandWater } from './FriendsIslandVisuals';
import { FriendsRiverVisuals } from './FriendsRiverVisuals';
import { ISLAND_LAKES, ISLAND_SEA_LEVEL, ISLAND_VOLCANO } from '../world/FriendsIsland';
import { FriendsVolcanoSmoke } from './FriendsVolcanoSmoke';

describe('island fluid stability and bounded effects',()=>{
  it('excludes seawater beneath inland lakebeds and bounds the added river geometry and textures',()=>{
    expect(islandOceanDepth(12128,23600)).toBeLessThan(0);
    expect(islandOceanDepth(31450.27,23852.08)).toBeGreaterThan(0);
    const rivers=new FriendsRiverVisuals(islandWater,new THREE.MeshStandardMaterial());
    let triangles=0,textureBytes=0,bridgeDraws=0;
    for(const object of rivers.children){
      const mesh=object as THREE.Mesh<THREE.BufferGeometry,THREE.Material>;
      triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
      if(mesh.material instanceof THREE.ShaderMaterial){
        textureBytes+=(mesh.material.uniforms.bathymetry.value as THREE.DataTexture).image.data.byteLength;
        expect(mesh.material.vertexShader).toContain('streamFlow=riverFlow');
        expect(mesh.material.fragmentShader).toContain('float ribbons=');
      }else bridgeDraws++;
    }
    expect(triangles).toBeLessThan(40000);expect(textureBytes).toBeLessThan(1024*1024);
    expect(rivers.waterMaterials.length).toBeLessThanOrEqual(32);expect(bridgeDraws).toBe(2);
    rivers.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();o.material.dispose();if(o.material instanceof THREE.ShaderMaterial)o.material.uniforms.bathymetry.value.dispose();}});
  });
  it('keeps every fluid away from a terrain step, even at the highest wave crest',()=>{
    const gap=(level:number)=>Math.min(level-Math.floor(level/32)*32,Math.ceil(level/32)*32-level);
    expect(gap(ISLAND_SEA_LEVEL)).toBeGreaterThan(5);
    for(const lake of ISLAND_LAKES)expect(gap(lake.level)).toBeGreaterThan(.8);
    expect(gap(ISLAND_VOLCANO.lavaLevel)).toBeGreaterThan(.4);
  });
  it('moves one bounded wave grid without rebuilding or scrolling its world-space pattern',()=>{
    const ocean=new FriendsIslandOcean(),patch=ocean.getObjectByName('camera-following-wave-grid') as THREE.Mesh;
    const far=ocean.children.find(o=>o!==patch) as THREE.Mesh,geometry=patch.geometry;
    expect(geometry.index!.count/3).toBe(32768);expect(far.geometry.index!.count/3).toBe(2);
    ocean.update(12,new THREE.Vector3(13111,1400,21777));
    expect(patch.position.x%64).toBe(0);expect(patch.position.z%64).toBe(0);expect(patch.position.y).toBe(ISLAND_SEA_LEVEL);
    const a=patch.material as THREE.ShaderMaterial,b=far.material as THREE.ShaderMaterial;
    expect(a.uniforms.patchCentre).toBe(b.uniforms.patchCentre);
    expect(a.uniforms.bathymetry.value).toBe(b.uniforms.bathymetry.value);
    expect(a.uniforms.time.value).toBe(12);expect(a.polygonOffset).toBe(true);
    ocean.update(13,new THREE.Vector3(13200,1400,21900));expect(patch.geometry).toBe(geometry);
    ocean.dispose();
  });
  it('animates volcanic smoke in a single fixed-size instance batch',()=>{
    const plume=new FriendsVolcanoSmoke(),geometry=plume.geometry;
    expect(plume.count).toBe(32);expect(plume.material.depthWrite).toBe(false);
    const seeds=geometry.getAttribute('plumeSeed'),bands=geometry.getAttribute('plumeBand'),matrices=plume.instanceMatrix;
    expect(seeds.count).toBe(32);expect(bands.count).toBe(32);
    expect([...bands.array].filter(b=>b===0)).toHaveLength(20);
    expect([...bands.array].filter(b=>b===1)).toHaveLength(12);
    const version=matrices.version;
    for(const seconds of [0,30,300]){
      plume.update(seconds);expect(plume.count).toBe(32);expect(plume.geometry).toBe(geometry);
      expect(plume.instanceMatrix).toBe(matrices);expect(matrices.version).toBe(version);
      expect(plume.material.uniforms.time.value).toBe(seconds);
    }
    plume.dispose();
  });
});
