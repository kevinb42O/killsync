import * as THREE from 'three';

/** Cave props and rock share the same subdued ambient response. Direct point
 * and spot lights remain intact; outdoor sunlight cannot light buried objects. */
export function applyFriendsCaveLighting(material: THREE.MeshStandardMaterial) {
  const decorate = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    decorate(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= 0.;',
    )).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= .015; reflectedLight.indirectSpecular *= .025;');
  };
  material.customProgramCacheKey = () => `${baseKey}:cave-lighting-v2`;
  return material;
}
