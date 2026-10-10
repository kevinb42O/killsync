import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bindUnderwaterMaterial, createUnderwaterLightUniforms } from './FriendsUnderwaterLighting';
import { applyFriendsCaveLighting } from './FriendsCaveLighting';
import { FriendsClouds } from './FriendsClouds';
import { configureTerrainCoverage } from './FriendsTerrainCoverage';

describe('underwater composition with production terrain lighting', () => {
  for (const mode of ['standard', 'cloud', 'cave'] as const) {
    it(`declares depth transmission before use with ${mode} lighting`, () => {
      const material = new THREE.MeshStandardMaterial();
      const coverage = new THREE.DataTexture(new Uint8Array([255]), 1, 1);
      const clouds = mode === 'cloud' ? new FriendsClouds({} as THREE.WebGLRenderer) : undefined;
      if (clouds) clouds.shade(material);
      if (mode === 'cave') applyFriendsCaveLighting(material);
      configureTerrainCoverage(material, coverage, 1, 'near');
      const uniforms = createUnderwaterLightUniforms(), release = bindUnderwaterMaterial(material, uniforms);
      const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<THREE.Material['onBeforeCompile']>[0];
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      const declaration = shader.fragmentShader.indexOf('vec3 fuwDepthTransmission=vec3(1.);');
      const use = shader.fragmentShader.indexOf('mix(vec3(1.),fuwDepthTransmission');
      expect(declaration).toBeGreaterThan(shader.fragmentShader.indexOf('void main()'));
      expect(declaration).toBeLessThan(use);
      expect(shader.fragmentShader.match(/vec3 fuwDepthTransmission=/g)).toHaveLength(1);
      expect(shader.fragmentShader).toContain('terrainDetail');
      if (mode === 'cloud') expect(shader.fragmentShader).toContain('cloudSun');
      if (mode === 'cave') expect(shader.fragmentShader).toContain('directLight.color *= 0.');
      expect(shader.uniforms.fuwEnabled).toBe(uniforms.enabled);
      release();clouds?.release();material.dispose();coverage.dispose();
    });
  }
});
