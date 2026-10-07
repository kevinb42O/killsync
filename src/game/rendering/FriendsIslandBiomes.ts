import * as THREE from 'three';
import { islandClimate } from '../world/FriendsIsland';

let climate: THREE.DataTexture | undefined;
/** One shared climate field keeps near chunks and the entire horizon coloured
 * identically. Float channels retain shoreline distance and soft biome edges. */
export function islandBiomeTexture() {
  if(climate)return climate;
  const size=384,data=new Float32Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)data.set(islandClimate((x+.5)*48000/size,(y+.5)*48000/size),(y*size+x)*4);
  climate=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.FloatType);
  climate.minFilter=climate.magFilter=THREE.LinearFilter;climate.needsUpdate=true;
  const texture=climate;texture.addEventListener('dispose',()=>{if(climate===texture)climate=undefined;});
  return texture;
}

export const ISLAND_BIOME_GLSL=`
  float islandHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float islandNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(islandHash(i),islandHash(i+vec2(1,0)),f.x),mix(islandHash(i+vec2(0,1)),islandHash(i+1.),f.x),f.y);}
  vec4 islandClimate=texture2D(islandBiomes,frontierWorld.xz/48000.);
  float elevation=frontierWorld.y, slope=1.-max(0.,frontierFace.y);
  float broad=islandNoise(frontierWorld.xz/740.),detail=islandNoise(frontierWorld.xz/95.);
  vec2 rockUv=(abs(frontierFace.x)>.5?frontierWorld.zy:abs(frontierFace.z)>.5?frontierWorld.xy:frontierWorld.xz)/210.;
  vec3 rockTex=texture2D(alpineRock,rockUv).rgb;
  // Living meadows have warm dry patches, cool moss and fine soil interruptions.
  vec3 meadow=mix(vec3(.20,.30,.10),vec3(.38,.43,.19),broad);
  meadow*=.80+texture2D(map,frontierWorld.xz/180.).r*.55;
  vec3 earth=mix(vec3(.25,.17,.10),vec3(.37,.29,.18),detail);
  float earthPatch=smoothstep(.60,.85,broad)*(1.-smoothstep(1100.,2200.,elevation));
  vec3 terrain=mix(meadow,earth,earthPatch*.55);
  // Exposed strata and scree break through hills before the snow line.
  vec3 stone=mix(vec3(.26,.29,.28),rockTex*1.15,.58);
  float rock=max(smoothstep(1150.+broad*550.,2400.,elevation),slope*.94);
  terrain=mix(terrain,stone,rock);
  float shore=1.-smoothstep(750.,1550.+broad*350.,islandClimate.r);
  vec3 sand=mix(vec3(.72,.57,.34),vec3(.90,.78,.53),detail*.55+broad*.35);
  float wetSand=1.-smoothstep(-145.,-50.,elevation);
  sand=mix(sand,sand*vec3(.48,.57,.60),wetSand*.72);
  terrain=mix(terrain,sand,shore*(1.-slope*.70));
  // Damp basins: peat, dark mud and patches of moss rather than grass tint.
  float mud=smoothstep(.30,.65,islandClimate.g)*(1.-smoothstep(850.,1300.,elevation));
  vec3 peat=mix(vec3(.13,.105,.07),vec3(.24,.23,.13),broad);
  terrain=mix(terrain,peat,mud);
  float snow=smoothstep(2750.+broad*500.,3450.+detail*160.,elevation)*(1.-slope*.80);
  terrain=mix(terrain,vec3(.84,.91,.94)*(.92+detail*.08),snow);
  float ice=islandClimate.a*smoothstep(2450.,3350.,elevation)*(1.-slope*.5);
  vec3 glacier=mix(vec3(.28,.58,.68),vec3(.67,.86,.91),detail);
  float crevasse=pow(1.-abs(sin(frontierWorld.x*.014+islandNoise(frontierWorld.xz/370.)*5.+frontierWorld.z*.003)),12.);
  glacier*=1.-crevasse*.28;terrain=mix(terrain,glacier,ice*.92);
  // Lava flows leave weathered black basalt and rust-red ash on the flanks.
  float volcanic=smoothstep(.12,.8,islandClimate.b);
  vec3 basalt=mix(vec3(.065,.073,.076),vec3(.24,.15,.105),broad*.8)*(.75+rockTex.r*.65);
  terrain=mix(terrain,basalt,volcanic);
  diffuseColor.rgb=terrain;
  roughnessFactor=mix(roughnessFactor,.36,wetSand*shore*.65+mud*.45);
  roughnessFactor=mix(roughnessFactor,.27,ice*.8);
`;
