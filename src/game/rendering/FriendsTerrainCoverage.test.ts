import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';
import { frontierMaterial } from './FriendsFrontierVisuals';
afterEach(() => vi.restoreAllMocks());
const compile = (material: THREE.Material) => {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
};
describe('terrain layer ownership', () => {
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
});
