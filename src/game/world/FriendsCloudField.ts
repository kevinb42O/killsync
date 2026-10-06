import { FRONTIER_SIZE, terrainHash } from './FriendsTerrain';
export type FrontierCloud = { x:number; z:number; altitude:number; width:number; height:number; depth:number; shape:[number,number,number,number] };
export const CLOUD_FIELD_MARGIN=9000;
export const CLOUD_FIELD_SPAN=FRONTIER_SIZE+CLOUD_FIELD_MARGIN*2;
/** A seeded weather field, sampled without grid cells. Irregular separation and
 * several cloud banks leave both crowded skies and large blue-sky openings. */
export function createFrontierCloudField(count=78):FrontierCloud[]{
  const clouds:FrontierCloud[]=[];
  for(let candidate=0;candidate<count*20&&clouds.length<count;candidate++){
    const seed=candidate+3901,x=terrainHash(seed,11)*CLOUD_FIELD_SPAN-CLOUD_FIELD_MARGIN,z=terrainHash(seed,17)*CLOUD_FIELD_SPAN-CLOUD_FIELD_MARGIN;
    const size=terrainHash(seed,23),width=450+size**1.8*2850,depth=width*(.48+terrainHash(seed,29)*.82),height=180+terrainHash(seed,31)**1.5*900;
    // Variable spacing rather than a fixed lattice, including small clouds near banks.
    if(clouds.some(c=>Math.hypot(c.x-x,c.z-z)<Math.min(width,c.width)*.65+450))continue;
    clouds.push({x,z,altitude:3300+terrainHash(seed,37)*1900,width,height,depth,shape:[terrainHash(seed,41),terrainHash(seed,43),terrainHash(seed,47),terrainHash(seed,53)]});
  }
  return clouds;
}
