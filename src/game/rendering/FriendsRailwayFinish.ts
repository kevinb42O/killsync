import * as THREE from 'three';

export const RAIL_FINISH={steel:0,rail:1,timber:2,concrete:3,light:4,platform:5,paint:6,ballast:7,rubber:8,masonry:9,zinc:10} as const;
/** Small deterministic surface grain, projected in world units. Instancing cannot
 * stretch a concrete texture into long stripes along a tall pier or bridge beam. */
export function createRailwayFinishes(){
  const frame=new THREE.Matrix4();
  const size=128,data=new Uint8Array(size*size*4);let random=9127351;
  for(let i=0;i<size*size;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;const n=random>>>24;data.set([n,Math.round(100+n*.5),128,255],i*4);}
  const grain=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.minFilter=THREE.LinearMipmapLinearFilter;grain.magFilter=THREE.LinearFilter;grain.generateMipmaps=true;grain.needsUpdate=true;
  const finish=(color:number,roughness:number,metalness:number,kind:'paint'|'metal'|'concrete'|'timber'|'ballast'|'masonry')=>{
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness});
    material.onBeforeCompile=shader=>{
      shader.uniforms.railGrain={value:grain};shader.uniforms.railFinishFrame={value:frame};
      shader.vertexShader='uniform mat4 railFinishFrame;varying vec3 vRailFinishPosition;varying vec3 vRailFinishNormal;varying vec2 vRailFinishUv;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 finishPosition=vec4(position,1.);vec3 finishNormal=normal;
        #ifdef USE_INSTANCING
          finishPosition=instanceMatrix*finishPosition;finishNormal=mat3(instanceMatrix)*finishNormal;
        #endif
        vRailFinishPosition=(railFinishFrame*modelMatrix*finishPosition).xyz;vRailFinishNormal=normalize(mat3(railFinishFrame*modelMatrix)*finishNormal);vRailFinishUv=uv;
        #ifdef USE_INSTANCING
          vRailFinishUv=abs(vRailFinishNormal.x)>abs(vRailFinishNormal.z)?vRailFinishPosition.zy:vRailFinishPosition.xy;
        #endif`);
      shader.fragmentShader='uniform sampler2D railGrain;varying vec3 vRailFinishPosition;varying vec3 vRailFinishNormal;varying vec2 vRailFinishUv;\n'+shader.fragmentShader;
      const scale=kind==='ballast'?8:kind==='timber'?36:24,amount=kind==='ballast'?.30:kind==='metal'?.045:kind==='paint'?.045:.11;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 finishWeight=pow(abs(vRailFinishNormal),vec3(4.));finishWeight/=max(.001,finishWeight.x+finishWeight.y+finishWeight.z);
        float finishGrain=dot(vec3(texture2D(railGrain,vRailFinishPosition.yz/${scale.toFixed(1)}).r,texture2D(railGrain,vRailFinishPosition.xz/${scale.toFixed(1)}).r,texture2D(railGrain,vRailFinishPosition.xy/${scale.toFixed(1)}).r),finishWeight);
        diffuseColor.rgb*=1.+(finishGrain-.5)*${amount.toFixed(3)};
        ${kind==='concrete'?`float formDistance=abs(fract(vRailFinishPosition.y/32.)-.5);float formLine=1.-smoothstep(.004,.012,formDistance);diffuseColor.rgb*=1.-formLine*.035*(1.-finishWeight.y);`:''}
        ${kind==='timber'?`float woodLine=sin(vRailFinishPosition.x*.62+finishGrain*2.);diffuseColor.rgb*=1.+woodLine*.035;`:''}
        ${kind==='masonry'?`float stoneRow=floor(vRailFinishUv.y/12.);vec2 stoneCell=vec2(vRailFinishUv.x/28.+mod(stoneRow,2.)*.5,vRailFinishUv.y/12.);vec2 stoneEdge=min(fract(stoneCell),1.-fract(stoneCell));vec2 stoneAA=max(fwidth(stoneCell),vec2(.006));float mortar=1.-min(smoothstep(.01,.01+stoneAA.x,stoneEdge.x),smoothstep(.018,.018+stoneAA.y,stoneEdge.y));diffuseColor.rgb*=1.-mortar*.24;`:''}`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(finishGrain-.5)*.06,.08,1.);');
    };
    material.customProgramCacheKey=()=>`railway-finish-${kind}-v2`;return material;
  };
  const materials:THREE.Material[]=[finish(0x454f49,.62,.18,'paint'),finish(0xb7bfbd,.26,.88,'metal'),finish(0x76624c,.91,.02,'timber'),finish(0xaaa99d,.92,.01,'concrete'),new THREE.MeshBasicMaterial({color:0xffd6a1}),finish(0xb9b3a1,.94,.02,'concrete'),finish(0x587567,.62,.12,'paint'),finish(0x77766d,.98,0,'ballast'),new THREE.MeshStandardMaterial({color:0x232724,roughness:.94}),finish(0x89877b,.98,.01,'masonry'),finish(0x8f9b98,.52,.72,'metal')];
  return {materials,grain,frame};
}

export function railArchGeometry(outerWidth:number,outerRise:number,innerWidth:number,innerRise:number,depth:number,bevel=0){
  const shape=new THREE.Shape();shape.moveTo(-outerWidth,-32);shape.lineTo(outerWidth,-32);shape.lineTo(outerWidth,156);
  for(let i=0;i<=40;i++){const t=i*Math.PI/40;shape.lineTo(outerWidth*Math.cos(t),156+outerRise*Math.sin(t));}shape.closePath();
  const hole=new THREE.Path();hole.moveTo(-innerWidth,-24);hole.lineTo(-innerWidth,156);
  for(let i=40;i>=0;i--){const t=i*Math.PI/40;hole.lineTo(innerWidth*Math.cos(t),156+innerRise*Math.sin(t));}hole.lineTo(innerWidth,-24);hole.closePath();shape.holes.push(hole);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:40});geometry.translate(0,0,-depth/2);return geometry;
}
