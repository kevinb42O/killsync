import * as THREE from 'three';
import { DISTANT_ISLANDS, distantIslandHeightAt } from '../world/FriendsOuterIslands';

const TILE = 96, EXTENT = 1.48;
/** One small static atlas supplies the missing outer-island coast depths and
 * seabed gradients to the existing ocean pass. Main-island resolution stays
 * unchanged; only fragments inside an outer island's bounds sample the atlas. */
export function createOuterIslandBathymetry() {
  const count = DISTANT_ISLANDS.length, width = TILE * count;
  const pixels = new Float32Array(width * TILE * 4);
  const regions = DISTANT_ISLANDS.map(island => new THREE.Vector4(island.x, island.z, island.rx * EXTENT, island.rz * EXTENT));
  DISTANT_ISLANDS.forEach((island, tile) => {
    const depths = new Float32Array(TILE * TILE), dx = island.rx * EXTENT * 2 / TILE, dz = island.rz * EXTENT * 2 / TILE;
    for (let z = 0; z < TILE; z++) for (let x = 0; x < TILE; x++) {
      depths[z*TILE+x] = -distantIslandHeightAt((x+.5-TILE/2)*dx, (z+.5-TILE/2)*dz, island);
    }
    for (let z = 0; z < TILE; z++) for (let x = 0; x < TILE; x++) {
      const depth = depths[z*TILE+x];
      const gx = (depths[z*TILE+Math.min(TILE-1,x+1)]-depths[z*TILE+Math.max(0,x-1)]) / (dx*(x===0||x===TILE-1?1:2));
      const gz = (depths[Math.min(TILE-1,z+1)*TILE+x]-depths[Math.max(0,z-1)*TILE+x]) / (dz*(z===0||z===TILE-1?1:2));
      pixels.set([depth, Math.max(0,Math.min(2000,depth/Math.max(.04,Math.hypot(gx,gz)))),gx,gz], (z*width+tile*TILE+x)*4);
    }
  });
  const packed = Uint16Array.from(pixels, value => THREE.DataUtils.toHalfFloat(value));
  const texture = new THREE.DataTexture(packed,width,TILE,THREE.RGBAFormat,THREE.HalfFloatType);
  texture.minFilter=texture.magFilter=THREE.LinearFilter; texture.needsUpdate=true;
  return { texture, regions };
}
export function applyOuterIslandBathymetry(material: THREE.ShaderMaterial, atlas: ReturnType<typeof createOuterIslandBathymetry>) {
  material.uniforms.outerCoastAtlas={value:atlas.texture};
  material.uniforms.outerCoastRegions={value:atlas.regions};
  material.uniforms.outerCoastEnabled={value:1};
  material.fragmentShader=material.fragmentShader.replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>
uniform sampler2D outerCoastAtlas;
uniform float outerCoastEnabled;
uniform vec4 outerCoastRegions[${DISTANT_ISLANDS.length}];
vec4 outerCoastAt(vec2 p){
  for(int i=0;i<${DISTANT_ISLANDS.length};i++){
    vec4 region=outerCoastRegions[i];vec2 uv=(p-region.xy)/region.zw*.5+.5;
    if(uv.x>0. && uv.y>0. && uv.x<1. && uv.y<1.){
      // RGBA16F supports hardware filtering: one fetch instead of four.
      vec2 inset=clamp(uv,vec2(${(.5/TILE).toFixed(8)}),vec2(${(1-.5/TILE).toFixed(8)}));
      return texture2D(outerCoastAtlas,vec2((inset.x+float(i))/${DISTANT_ISLANDS.length.toFixed(1)},inset.y));
    }
  }
  return vec4(256.,0.,0.,0.);
}`);
  material.fragmentShader=material.fragmentShader.replace('float depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);', `float depth=mix(256.,texture2D(bathymetry,clamp(uv,0.,1.)).r,inside);
vec4 outerCoast=vec4(256.,0.,0.,0.);float outerWater=0.;
if(ocean>.5 && inside<.5 && outerCoastEnabled>.5){outerCoast=outerCoastAt(p);depth=outerCoast.r;outerWater=1.;}`);
  material.fragmentShader=material.fragmentShader.replace('coast=coastAt(uv);surfPhase=coastPhase(p,coast);surfWeight=coastWeight(depth,coast)*inside;', 'coast=outerWater>.5?outerCoast:coastAt(uv);surfPhase=coastPhase(p,coast);surfWeight=coastWeight(depth,coast)*max(inside,outerWater);');
}
