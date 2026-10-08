import * as THREE from 'three';
import { cullInactiveFriendsLights } from './FriendsDirectLighting';

/** Cave props and rock share the same subdued ambient response. Direct point
 * and spot lights remain intact; outdoor sunlight cannot light buried objects. */
export function applyFriendsCaveLighting(material: THREE.MeshStandardMaterial) {
  material.userData.frontierCaveLighting = true;
  const decorate = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    decorate(shader, renderer);
    // The detailed rock texture contains negative/near-zero tangent Z values.
    // They can flip normals into the wall and create black streaks under IR.
    // Keep them in the surface hemisphere, then bound the perturbation at
    // grazing angles so camera-mounted lights retain continuous illumination.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
      'mapN.xy *= normalScale;',
      `mapN.xy *= normalScale;
      mapN.z = max( mapN.z, .15 );
      float caveViewCos = abs( dot( normal, normalize( vViewPosition ) ) );
      float caveSlopeLimit = .75 * caveViewCos * inversesqrt( max( .001, 1. - caveViewCos * caveViewCos ) );
      float caveMappedSlope = length( mapN.xy ) / mapN.z;
      mapN.xy *= min( 1., caveSlopeLimit / max( caveMappedSlope, .001 ) );`,
    )).replace('#include <lights_fragment_begin>', cullInactiveFriendsLights(THREE.ShaderChunk.lights_fragment_begin).replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= 0.;',
    )).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= .015; reflectedLight.indirectSpecular *= .025;');
  };
  material.customProgramCacheKey = () => `${baseKey}:cave-lighting-v5`;
  return material;
}
