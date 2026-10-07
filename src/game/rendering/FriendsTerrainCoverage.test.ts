import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';
import { createIslandRuinMaterials, FriendsIslandVisuals } from './FriendsIslandVisuals';
import { frontierMaterial } from './FriendsFrontierVisuals';
afterEach(() => vi.restoreAllMocks());
const compile = (material: THREE.Material) => {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
};
describe('terrain layer ownership', () => {
  it('partitions the horizon, surface shell and excavation without sharing GPU programs',()=>{
    const coverage=new THREE.DataTexture(),blockCoverage=new THREE.DataTexture(),altitude={value:1};
    const near=new THREE.MeshStandardMaterial(),shell=new THREE.MeshStandardMaterial(),far=new THREE.MeshStandardMaterial();
    configureTerrainCoverage(near,coverage,94,'near');
    configureTerrainCoverage(shell,coverage,94,'surface',{texture:blockCoverage,altitude});
    configureTerrainCoverage(far,coverage,94,'horizon',{texture:blockCoverage,altitude});
    expect(new Set([near,shell,far].map(m=>m.customProgramCacheKey())).size).toBe(3);
    const surfaceShader=compile(shell),farShader=compile(far);
    expect(surfaceShader.fragmentShader).toContain('terrainDither>=blockDetail||terrainDither<terrainDetail');
    expect(farShader.fragmentShader).toContain('terrainDither<max(terrainDetail,blockDetail)');
    for(const shader of [surfaceShader,farShader]){
      expect(shader.uniforms.blockCoverage.value).toBe(blockCoverage);expect(shader.uniforms.blockAltitude).toBe(altitude);
      expect(shader.fragmentShader).toContain('smoothstep(6144.0,8192.0');
    }
  });
  it('keeps complementary near and horizon masks in separate GPU programs', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture<HTMLImageElement>());
    const near = frontierMaterial('Ground037'), far = frontierMaterial('Ground037');
    const coverage = new THREE.DataTexture(new Uint8Array([0,255]),2,1,THREE.RedFormat);
    configureTerrainCoverage(near,coverage,2,'near');configureTerrainCoverage(far,coverage,2,'horizon');
    expect(near.customProgramCacheKey()).not.toBe(far.customProgramCacheKey());
    expect(compile(near).fragmentShader).toContain('>=terrainDetail)discard');
    expect(compile(far).fragmentShader).toContain('<terrainDetail)discard');
    expect(compile(near).uniforms.fineCoverage.value).toBe(coverage);
  });
  it('samples the solid side of chunk boundaries for both layers', () => {
    const near = new THREE.MeshStandardMaterial(), far = new THREE.MeshStandardMaterial(), coverage = new THREE.DataTexture();
    for (const [material,layer] of [[near,'near'],[far,'horizon']] as const) {
      configureTerrainCoverage(material,coverage,94,layer);
      expect(compile(material).vertexShader).toContain('position-normal*.01');
      expect(compile(material).fragmentShader).toContain('floor(terrainOwner/512.)');
    }
    for (const direction of [-1,1]) {
      const face=512,solid=face-direction*.01;
      expect(Math.floor(solid/512)).toBe(direction>0?0:1);
    }
  });
  it('keeps distant monuments visible when their nearby voxel materials have complementary coverage',()=>{
    vi.spyOn(THREE.TextureLoader.prototype,'load').mockImplementation(()=>new THREE.Texture<HTMLImageElement>());
    const coverage=new THREE.DataTexture(new Uint8Array(94*94),94,94,THREE.RedFormat);
    const near=createIslandRuinMaterials(frontierMaterial('Rock030','#ffffff',true));
    const distant=new FriendsIslandVisuals(near,coverage,94);
    for(const m of near)configureTerrainCoverage(m,coverage,94,'near');
    const mesh=distant.getObjectByName('unified-voxel-masonry') as THREE.Mesh;
    const shader=compile((mesh.material as THREE.Material[])[0]);
    expect(shader.fragmentShader).toContain('<terrainDetail)discard');
    expect(shader.fragmentShader).not.toContain('>=terrainDetail)discard');
    expect(shader.vertexShader.match(/varying vec2 terrainOwner;/g)).toHaveLength(1);
    expect(shader.vertexShader).toContain('terrainPosition=instanceMatrix*terrainPosition');
    distant.dispose();
  });

});
