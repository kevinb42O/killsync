import * as THREE from 'three';

/** Complementary masks must use distinct GPU programs, even when their
 * textures and standard material defines are identical. Sample inside the
 * solid face so a wall on a chunk edge belongs to the chunk that owns it. */
export function configureTerrainCoverage(material: THREE.Material, coverage: THREE.DataTexture, grid: number, layer: 'near' | 'horizon') {
  const decorate = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}:terrain-coverage-${layer}-v2`;
  material.onBeforeCompile = (shader, renderer) => {
    decorate(shader, renderer);
    shader.uniforms.fineCoverage = { value: coverage };
    shader.uniforms.fineGrid = { value: grid };
    shader.vertexShader = 'varying vec2 terrainOwner;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nterrainOwner=(modelMatrix*vec4(position-normal*.01,1.)).xz;');
    const comparison = layer === 'near' ? '>=' : '<';
    shader.fragmentShader = 'varying vec2 terrainOwner;uniform sampler2D fineCoverage;uniform float fineGrid;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float terrainDetail=texture2D(fineCoverage,(floor(terrainOwner/512.)+.5)/fineGrid).r;
if(fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)))${comparison}terrainDetail)discard;`);
  };
}
