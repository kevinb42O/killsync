import { Vector4 } from 'three';
/** All water materials share this one moving hull cutout. The conservative
 * ellipse stays inside the wooden shell, keeping the open cockpit dry. */
export const rowboatWaterCutout={value:new Vector4(1e8,1e8,0,0)};
