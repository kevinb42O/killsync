import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsCampfire } from './FriendsCampfire';
import { installRetreatLightBounds } from './FriendsDirectLighting';

const originalLighting = THREE.ShaderChunk.lights_fragment_begin;
afterEach(() => { THREE.ShaderChunk.lights_fragment_begin = originalLighting; });

function compile(material: THREE.Material) {
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('Campfire direct lighting', () => {
  it.each([false, true])('skips inactive lamps while retaining authored patterns and late-installed room bounds (retreat=%s)', retreat => {
    const fire = new FriendsCampfire(new THREE.Scene(), retreat
      ? { id: 'saltwind-camp', x: 0, y: 0, z: 0, scale: .5, seats: false }
      : undefined);
    // The main fire is created before the retreat installs its shared bounds.
    installRetreatLightBounds();
    const materials = new Set<THREE.MeshStandardMaterial>();
    fire.group.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) materials.add(object.material);
    });
    try {
      expect(materials.size).toBe(5);
      for (const material of materials) {
        const shader = compile(material);
        expect(shader.fragmentShader).toContain('if ( pointLight.color != vec3( 0.0 ) )');
        expect(shader.fragmentShader).toContain('if ( spotLight.color != vec3( 0.0 ) )');
        expect(shader.fragmentShader).toContain('if ( directLight.visible )');
        expect(shader.fragmentShader).toContain('retreatShellPoint');
        expect(shader.fragmentShader).toContain('getPointShadow(');
        expect(shader.fragmentShader).toContain('getShadow( spotShadowMap');
        expect(shader.fragmentShader).toContain('getDirectionalLightInfo( directionalLight, directLight );');
        expect(material.customProgramCacheKey()).toContain(':friends-direct-light-culling-v1');
      }
      const wood = fire.group.getObjectByName('campfire-eight-timber-seats') as THREE.Mesh;
      expect(compile(wood.material as THREE.Material).vertexShader).toContain('timberPosition=position;');
      expect(compile(wood.material as THREE.Material).fragmentShader).toContain('float grain=sin(');
      expect((wood.material as THREE.Material).customProgramCacheKey()).toBe('commons-timber-grain:friends-direct-light-culling-v1');
      const gravel = fire.group.getObjectByName('campfire-gravel-clearing') as THREE.Mesh;
      expect(compile(gravel.material as THREE.Material).fragmentShader).toContain('float grit=noise(');
      expect((gravel.material as THREE.Material).customProgramCacheKey()).toBe('commons-gravel:friends-direct-light-culling-v1');
    } finally {
      fire.dispose();
    }
  });
});
