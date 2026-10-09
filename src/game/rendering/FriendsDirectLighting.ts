import * as THREE from 'three';
import { STILLWATER,RETREAT_BULB } from '../world/FriendsRetreatSites';

/** Keep all light uniforms and shadow samplers present, while skipping BRDF
 * and shadow work for lights whose contribution is exactly zero. Uniform
 * branches let inactive lamps remain in the stable day/night shader layout. */
export function cullInactiveFriendsLights(lighting: string) {
  return lighting.replace(
    /get(Point|Spot)LightInfo\( ([a-z]+Light), geometryPosition, directLight \);([\s\S]*?RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)/g,
    (_original, kind: string, light: string, contribution: string) =>
      `if ( ${light}.color != vec3( 0.0 ) ) {
        get${kind}LightInfo( ${light}, geometryPosition, directLight );
        if ( directLight.visible ) {${contribution}
        }
      }`,
  );
}

/** Clip the two interior fixtures to their physical shell. Every lit world
 * material consumes this shared chunk, so lamps cannot shine through walls
 * onto the landscape. The deliberately small window-spill lamp stays outside. */
export function installRetreatLightBounds(){
  if(THREE.ShaderChunk.lights_fragment_begin.includes('retreatShellPoint'))return;
  const c=Math.cos(STILLWATER.angle),s=Math.sin(STILLWATER.angle);
  const clip=`{vec3 retreatShellPoint=(transpose(mat3(viewMatrix))*geometryPosition+cameraPosition)-vec3(${STILLWATER.x},${STILLWATER.z},${STILLWATER.y});
    vec2 rp=mat2(${c},${-s},${s},${c})*retreatShellPoint.xz;
    if(abs(rp.x)>74.||abs(rp.y)>58.||retreatShellPoint.y<-.5||retreatShellPoint.y>76.)directLight.color*=0.;}`;
  THREE.ShaderChunk.lights_fragment_begin=THREE.ShaderChunk.lights_fragment_begin
    .replace('getPointLightInfo( pointLight, geometryPosition, directLight );',`getPointLightInfo( pointLight, geometryPosition, directLight );if((pointLight.distance==220.&&distance(pointLight.position,(viewMatrix*vec4(${RETREAT_BULB.x},${RETREAT_BULB.z},${RETREAT_BULB.y},1.)).xyz)<.1)||(pointLight.distance==91.25&&distance(pointLight.position,(viewMatrix*vec4(${STILLWATER.x},${STILLWATER.z+35},${STILLWATER.y},1.)).xyz)<.1))`+clip);
}
