import * as THREE from 'three';

export function createUnderwaterLightUniforms(){
  return {enabled:{value:0},time:{value:0},level:{value:0},sunlight:{value:0},
    clarity:{value:1},exposure:{value:1},sunDirection:{value:new THREE.Vector3(.55,.75,-.35).normalize()}};
}
export type UnderwaterLightUniforms=ReturnType<typeof createUnderwaterLightUniforms>;

/** Decorates existing material passes. Each underwater scene owns its uniforms;
 * existing terrain masks, cave lighting, shadows and material hooks stay intact. */
export function bindUnderwaterMaterial(material:THREE.MeshStandardMaterial,uniforms:UnderwaterLightUniforms){
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
  const key=previousKey.call(material),allowSun=material.userData.frontierCaveLighting?0:1;
  const decorate:typeof material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.fuwEnabled=uniforms.enabled;shader.uniforms.fuwTime=uniforms.time;
    shader.uniforms.fuwLevel=uniforms.level;shader.uniforms.fuwSunlight=uniforms.sunlight;
    shader.uniforms.fuwClarity=uniforms.clarity;shader.uniforms.fuwExposure=uniforms.exposure;shader.uniforms.fuwSunDirection=uniforms.sunDirection;
    shader.vertexShader='varying vec3 fuwWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 fuwPosition=vec4(transformed,1.);
      #ifdef USE_BATCHING
      fuwPosition=batchingMatrix*fuwPosition;
      #endif
      #ifdef USE_INSTANCING
      fuwPosition=instanceMatrix*fuwPosition;
      #endif
      fuwWorld=(modelMatrix*fuwPosition).xyz;`);
    shader.fragmentShader=`varying vec3 fuwWorld;
      uniform float fuwEnabled,fuwTime,fuwLevel,fuwSunlight,fuwClarity,fuwExposure;
      uniform vec3 fuwSunDirection;
      float fuwCaustics(vec2 p){
        // Two warped wave families form narrow, moving light filaments.
        vec2 q=p*.041;
        q+=vec2(sin(q.y*.73+fuwTime*.43)+sin((q.x+q.y)*.31-fuwTime*.25),sin(q.x*.61-fuwTime*.37)+cos((q.y-q.x)*.43+fuwTime*.19))*1.1;
        float a=sin(q.x+q.y*.52+fuwTime*.48);
        float b=sin(q.y-q.x*.43-fuwTime*.39);
        float lines=pow(max(0.,1.-abs(a+b)*.9),8.);
        float cells=pow(max(0.,1.-abs(a-b)*.9),10.);
        return min(1.,lines*.65+cells*.45);
      }
      `+shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin).replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= mix(1.,fuwExposure,fuwEnabled*step(fuwWorld.y,fuwLevel));').replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= mix(1.,.20+.80*fuwExposure,fuwEnabled*step(fuwWorld.y,fuwLevel));').replace('#include <opaque_fragment>',`
      if(fuwEnabled>.001){
        float submerged=smoothstep(0.,6.,fuwLevel-fuwWorld.y)*fuwEnabled;
        float travel=length(cameraPosition-fuwWorld);
        // Red attenuates faster than green/blue, without obscuring close detail.
        vec3 transmission=exp(-travel*vec3(.0016,.00048,.00022)*fuwClarity);
        outgoingLight*=mix(vec3(1.),transmission,submerged);
        if(fuwSunlight>.001){
        vec3 worldNormal=inverseTransformDirection(normal,viewMatrix);
        float incidence=.18+.82*max(0.,dot(worldNormal,fuwSunDirection));
        float bedDepth=max(0.,fuwLevel-fuwWorld.y);
        float sunlight=fuwSunlight*exp(-bedDepth*.0025)*${allowSun.toFixed(1)};
        vec2 projected=fuwWorld.xz-fuwSunDirection.xz*bedDepth/max(.25,fuwSunDirection.y);
        float pattern=fuwCaustics(projected);
        outgoingLight*=1.-sunlight*submerged*.12;
        outgoingLight+=diffuseColor.rgb*vec3(.68,.88,.78)*pattern*incidence*sunlight*submerged*1.35;
        }
      }
      #include <opaque_fragment>`);
  };
  material.onBeforeCompile=decorate;material.customProgramCacheKey=()=>`${key}:underwater-light-v1:${allowSun}`;material.needsUpdate=true;
  return ()=>{if(material.onBeforeCompile===decorate){material.onBeforeCompile=previous;material.customProgramCacheKey=previousKey;material.needsUpdate=true;}};
}
