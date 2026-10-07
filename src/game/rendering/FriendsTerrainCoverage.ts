import * as THREE from 'three';
import { BLOCK_DETAIL_START, BLOCK_DETAIL_END } from './FriendsTerrainStreaming';

/** Complementary masks must use distinct GPU programs, even when their
 * textures and standard material defines are identical. Sample inside the
 * solid face so a wall on a chunk edge belongs to the chunk that owns it. */
export function configureTerrainCoverage(material: THREE.Material, coverage: THREE.DataTexture, grid: number, layer: 'near' | 'horizon' | 'surface', blocks?: {texture:THREE.DataTexture;altitude:THREE.IUniform<number>}) {
  const decorate = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}:terrain-coverage-${layer}-${blocks?'shells-v3':'v2'}`;
  material.onBeforeCompile = (shader, renderer) => {
    decorate(shader, renderer);
    shader.uniforms.fineCoverage = { value: coverage };
    shader.uniforms.fineGrid = { value: grid };
    if(blocks){shader.uniforms.blockCoverage={value:blocks.texture};shader.uniforms.blockAltitude=blocks.altitude;}
    shader.vertexShader = 'varying vec2 terrainOwner;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 terrainPosition=vec4(position-normal*.01,1.);
#ifdef USE_INSTANCING
terrainPosition=instanceMatrix*terrainPosition;
#endif
terrainOwner=(modelMatrix*terrainPosition).xz;`);
    const comparison = layer === 'near' ? '>=' : '<';
    const blockMask=blocks?`float blockDetail=texture2D(blockCoverage,(floor(terrainOwner/512.)+.5)/fineGrid).r*blockAltitude;
blockDetail*=1.-smoothstep(${BLOCK_DETAIL_START.toFixed(1)},${BLOCK_DETAIL_END.toFixed(1)},distance(cameraPosition.xz,terrainOwner));
float terrainDither=fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)));
${layer==='surface'?'if(terrainDither>=blockDetail||terrainDither<terrainDetail)discard;':'if(terrainDither<max(terrainDetail,blockDetail))discard;'}`:`if(fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)))${comparison}terrainDetail)discard;`;
    shader.fragmentShader = 'varying vec2 terrainOwner;uniform sampler2D fineCoverage;uniform float fineGrid;\n'+(blocks?'uniform sampler2D blockCoverage;uniform float blockAltitude;\n':'') + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float terrainDetail=texture2D(fineCoverage,(floor(terrainOwner/512.)+.5)/fineGrid).r;
${blockMask}`);
  };
}
