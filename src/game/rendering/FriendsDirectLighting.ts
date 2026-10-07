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
