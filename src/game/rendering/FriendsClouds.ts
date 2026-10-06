import * as THREE from 'three';
import { terrainHash } from '../world/FriendsTerrain';
import { createFrontierCloudField, CLOUD_FIELD_MARGIN, CLOUD_FIELD_SPAN, type FrontierCloud } from '../world/FriendsCloudField';

/** Instanced, ray-marched 3D cumulus. World-space density gives parallax and
 * lets an aircraft enter the cloud; the shape is not painted onto the sky. */
export class FriendsClouds extends THREE.InstancedMesh<THREE.BoxGeometry,THREE.RawShaderMaterial> {
  private volume:THREE.Data3DTexture;
  private shadowTexture:THREE.CanvasTexture;
  private drift=new THREE.Vector2();
  constructor(){
    const clouds=createFrontierCloudField();
    const size=48,data=new Uint8Array(size**3);
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)data[x+size*(y+size*z)]=Math.floor(terrainHash(x,y,z)*255);
    const volume=new THREE.Data3DTexture(data,size,size,size);volume.format=THREE.RedFormat;volume.minFilter=volume.magFilter=THREE.LinearFilter;volume.wrapS=volume.wrapT=volume.wrapR=THREE.RepeatWrapping;volume.unpackAlignment=1;volume.needsUpdate=true;
    const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,side:THREE.BackSide,
      uniforms:{densityMap:{value:volume},wind:{value:new THREE.Vector3()},sunDirection:{value:new THREE.Vector3(1800,2300,-1200).normalize()}},
      vertexShader:`precision highp float;
in vec3 position;in mat4 instanceMatrix;in vec4 cloudSeed;flat out vec4 cloudRandom;uniform mat4 modelMatrix,viewMatrix,projectionMatrix;
out vec3 worldPosition,cloudCenter,cloudExtent;
void main(){cloudRandom=cloudSeed;mat4 m=modelMatrix*instanceMatrix;cloudCenter=m[3].xyz;cloudCenter.xz=mod(cloudCenter.xz+vec2(9000.),vec2(66000.))-vec2(9000.);cloudExtent=vec3(length(m[0].xyz),length(m[1].xyz),length(m[2].xyz));worldPosition=cloudCenter+position*cloudExtent;gl_Position=projectionMatrix*viewMatrix*vec4(worldPosition,1.);}`,
      fragmentShader:`precision highp float;precision highp sampler3D;
uniform sampler3D densityMap;uniform vec3 cameraPosition,wind,sunDirection;
in vec3 worldPosition,cloudCenter,cloudExtent;flat in vec4 cloudRandom;out vec4 outColor;
float density(vec3 p){
 vec3 q=(p-cloudCenter)/cloudExtent;
 float left=1.-length((q-vec3(-(.20+.35*cloudRandom.x),-(.05+.25*cloudRandom.y),.16*cloudRandom.z))/vec3(.36+.30*cloudRandom.y,.40+.38*cloudRandom.z,.45+.30*cloudRandom.x));
 float crown=1.-length((q-vec3(-.16+.30*cloudRandom.z,.03+.25*cloudRandom.x,-.12*cloudRandom.y))/vec3(.37+.30*cloudRandom.x,.50+.40*cloudRandom.y,.43+.33*cloudRandom.z));
 float right=1.-length((q-vec3(.22+.35*cloudRandom.y,-(.02+.22*cloudRandom.z),-.22*cloudRandom.x))/vec3(.30+.30*cloudRandom.z,.36+.35*cloudRandom.x,.35+.35*cloudRandom.y));
 if(cloudRandom.w<.28)left=-1.;if(cloudRandom.w>.75)right=-1.;
 float envelope=smoothstep(0.,.48,max(left,max(crown,right)));
 vec3 v=(p+wind)*(.000025+.000045*cloudRandom.z)+cloudRandom.xyz*5.;
 float n=texture(densityMap,v).r*.58+texture(densityMap,v*2.03).r*.28+texture(densityMap,v*4.11).r*.14;
 return smoothstep(.22+.10*cloudRandom.w,.68+.12*cloudRandom.x,envelope*(n+.32));
}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){
 vec3 ray=normalize(worldPosition-cameraPosition),ro=(cameraPosition-cloudCenter)/cloudExtent,rd=ray/cloudExtent;
 vec3 inv=1./rd,t0=(-vec3(1.)-ro)*inv,t1=(vec3(1.)-ro)*inv;
 vec3 nearT=min(t0,t1),farT=max(t0,t1);float a=max(0.,max(nearT.x,max(nearT.y,nearT.z))),b=min(farT.x,min(farT.y,farT.z));
 if(b<=a)discard;float stepSize=(b-a)/12.,transmission=1.;vec3 light=vec3(0.);
 float jitter=fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)));
 for(int i=0;i<12;i++){
  vec3 p=cameraPosition+ray*(a+(float(i)+jitter)*stepSize);float d=density(p);
  if(d>.01){float sunOcclusion=density(p+sunDirection*220.);float height=clamp((p.y-cloudCenter.y)/cloudExtent.y*.5+.5,0.,1.);
   vec3 color=mix(vec3(.40,.49,.54),vec3(.96,.94,.85),clamp(height*.55+(1.-sunOcclusion)*.55,0.,1.));
   float opacity=1.-exp(-d*stepSize*.007);light+=transmission*opacity*color;transmission*=1.-opacity;
   if(transmission<.025)break;
  }
 }
 float alpha=1.-transmission;if(alpha<.025)discard;
 float haze=1.-exp(-pow(a*.000009,2.));vec3 color=mix(light/max(.001,alpha),vec3(.68,.78,.75),haze);
 outColor=vec4(srgb(color),alpha);
}`});
    super(new THREE.BoxGeometry(2,2,2),material,clouds.length);this.volume=volume;this.name='frontier-volumetric-cumulus';this.renderOrder=5;this.frustumCulled=false;
    this.geometry.setAttribute('cloudSeed',new THREE.InstancedBufferAttribute(new Float32Array(clouds.flatMap(c=>c.shape)),4));
    clouds.forEach((c,i)=>{const matrix=new THREE.Matrix4().compose(new THREE.Vector3(c.x,c.altitude,c.z),new THREE.Quaternion(),new THREE.Vector3(c.width,c.height,c.depth));this.setMatrixAt(i,matrix);});
    this.shadowTexture=this.makeShadowTexture(clouds);
    this.computeBoundingSphere();
  }
  private makeShadowTexture(clouds:FrontierCloud[]){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,512,512);
    const scale=512/CLOUD_FIELD_SPAN;
    for(const c of clouds){
      const [a,b,d,w]=c.shape;
      const lobes=[{x:-(.20+.35*a),z:.16*d,rx:.36+.30*b,rz:.45+.30*a,enabled:w>=.28},{x:-.16+.30*d,z:-.12*b,rx:.37+.30*a,rz:.43+.33*d,enabled:true},{x:.22+.35*b,z:-.22*a,rx:.30+.30*d,rz:.35+.35*b,enabled:w<=.75}];
      for(const l of lobes){if(!l.enabled)continue;const x=(c.x-c.altitude*1800/2300+l.x*c.width+CLOUD_FIELD_MARGIN)*scale,z=(c.z+c.altitude*1200/2300+l.z*c.depth+CLOUD_FIELD_MARGIN)*scale;
        ctx.save();ctx.translate(x,z);ctx.scale(c.width*l.rx*scale,c.depth*l.rz*scale);const gradient=ctx.createRadialGradient(0,0,.05,0,0,1);gradient.addColorStop(0,`rgba(255,255,255,${.45+c.height/1800})`);gradient.addColorStop(.65,'rgba(255,255,255,.3)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    }
    const texture=new THREE.CanvasTexture(canvas);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
  }
  /** One soft shadow lookup per surface fragment; no extra shadow render pass. */
  shade(material:THREE.Material){
    if(material.userData.frontierCloudShadow)return;material.userData.frontierCloudShadow=true;
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous(shader,renderer);shader.uniforms.frontierCloudShadow={value:this.shadowTexture};shader.uniforms.frontierCloudDrift={value:this.drift};
      shader.vertexShader='varying vec3 cloudSurface;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
vec4 cloudVertex=vec4(transformed,1.);
#ifdef USE_INSTANCING
cloudVertex=instanceMatrix*cloudVertex;
#endif
cloudSurface=(modelMatrix*cloudVertex).xyz;`);
      shader.fragmentShader='varying vec3 cloudSurface;uniform sampler2D frontierCloudShadow;uniform vec2 frontierCloudDrift;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
vec2 cloudUV=(cloudSurface.xz-frontierCloudDrift+vec2(-1800./2300.,1200./2300.)*cloudSurface.y+${CLOUD_FIELD_MARGIN.toFixed(1)})/${CLOUD_FIELD_SPAN.toFixed(1)};
float cloudShadow=texture2D(frontierCloudShadow,cloudUV).r;float cloudSun=1.-cloudShadow*.55;
reflectedLight.directDiffuse*=cloudSun;reflectedLight.directSpecular*=cloudSun;`);
    };material.customProgramCacheKey=()=>key+':cloud-shadow';material.needsUpdate=true;
  }
  update(seconds:number){this.drift.set(seconds*9,seconds*3);this.position.set(this.drift.x,0,this.drift.y);this.material.uniforms.wind.value.set(seconds*2,0,seconds);}

  release(){this.volume.dispose();this.shadowTexture.dispose();this.material.dispose();this.geometry.dispose();this.dispose();this.removeFromParent();}
}
