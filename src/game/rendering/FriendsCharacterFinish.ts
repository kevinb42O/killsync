import * as THREE from 'three';
import type { FriendsCharacterModel } from './FriendsCharacterModel';

export const FRIENDS_CUTE_PALETTES = [
  {name:'Seafoam',identity:'#22d3ee',head:'#79C9C0',upper:'#F4C66B',lower:'#5578B0'},
  {name:'Peach',identity:'#f472b6',head:'#F09A86',upper:'#B7D9BC',lower:'#766E9B'},
  {name:'Lilac',identity:'#a78bfa',head:'#B8A0D7',upper:'#F3D78E',lower:'#687DAD'},
  {name:'Buttercup',identity:'#fbbf24',head:'#F3D36C',upper:'#8DC8BD',lower:'#5C83B2'},
  {name:'Pistachio',identity:'#34d399',head:'#A7C58E',upper:'#F2B29B',lower:'#698B96'},
] as const;
const finishes=new Map<string,THREE.MeshStandardMaterial>();
export function friendsCutePalette(identity:string) {
  const c=new THREE.Color(identity);return FRIENDS_CUTE_PALETTES.reduce((best,p)=>{
    const distance=(x:string)=>{const b=new THREE.Color(x);return (c.r-b.r)**2+(c.g-b.g)**2+(c.b-b.b)**2;};
    return distance(p.identity)<distance(best.identity)?p:best;
  });
}
/** The artist's atlas retains eye pupils, borders, beak and face shading.
 * Recolour only its saturated cloth/skin regions, keeping neutral details crisp.
 * Materials are cached per crew palette; held equipment keeps the shared finish. */
export function finishFriendsCharacter(model:FriendsCharacterModel, identity:string) {
  const palette=friendsCutePalette(identity);model.root.userData.palette=palette.name;
  model.parts.forEach((part,index)=>part.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const swatch=index===0?palette.head:index<=3?palette.upper:palette.lower,key=`${palette.name}:${index===0?'head':index<=3?'upper':'lower'}`;
    let material=finishes.get(key);
    if(!material){
      material=(o.material as THREE.MeshStandardMaterial).clone();material.roughness=.82;
      const tint=new THREE.Color(swatch);
      material.onBeforeCompile=shader=>{
        shader.uniforms.crewTint={value:tint};shader.uniforms.crewLowerTint={value:new THREE.Color(palette.lower)};shader.uniforms.crewHead={value:index===0?1:0};
        shader.vertexShader='varying vec3 crewSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncrewSurface=position;');
        shader.fragmentShader='varying vec3 crewSurface;uniform vec3 crewTint;uniform vec3 crewLowerTint;uniform float crewHead;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          float hi=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
          float lo=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
          float chroma=(hi-lo)/max(hi,.001);
          bool beak=crewHead>.5 && hi<.25 && diffuseColor.r>diffuseColor.g*2. && diffuseColor.g>diffuseColor.b*1.4;
          if(chroma>.23 && !beak){bool trousers=crewHead<.5 && diffuseColor.b>diffuseColor.r*1.12;diffuseColor.rgb=(trousers?crewLowerTint:crewTint)*(.72+.38*hi);}
          float grain=fract(sin(dot(floor(crewSurface*12.),vec3(12.9898,78.233,37.719)))*43758.5453);
          diffuseColor.rgb*=.992+.016*grain;
        `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          if(crewHead>.5 && chroma<.15 && hi>.48)roughnessFactor=.28;
        `);
      };
      material.customProgramCacheKey=()=>`friends-cute-finish-${key}`;material.userData.friendsSharedTextures=true;material.userData.coopOperatorShared=true;finishes.set(key,material);
    }
    o.material=material;
  }));
}
