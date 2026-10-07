import * as THREE from 'three';
import type { FriendsDayNightCycle } from './FriendsDayNightCycle';
import { createFrontierCloudField, CLOUD_FIELD_MARGIN, CLOUD_FIELD_SPAN, type FrontierCloud } from '../world/FriendsCloudField';
import { CLOUD_SAMPLE_GLSL, CLOUD_VOLUME_SIZE, CLOUD_WIND, createCloudVolume } from './FriendsCloudVolume';

/** Prebaked billowy density, distance-adaptive volume sampling, and one small
 * GPU shadow atlas. Both passes share the exact wind, shapes and cloud heights. */
export class FriendsClouds extends THREE.InstancedMesh<THREE.BoxGeometry,THREE.ShaderMaterial> {
  private volume:THREE.Data3DTexture;
  private shadowTarget:THREE.WebGLRenderTarget;
  private shadowScene=new THREE.Scene();
  private shadowCamera=new THREE.Camera();
  private shadowMesh:THREE.InstancedMesh<THREE.PlaneGeometry,THREE.RawShaderMaterial>;
  private drift={value:new THREE.Vector2()};
  private shadowDirection:THREE.IUniform<THREE.Vector3>;
  private shadowStrength={value:1};
  private lastShadowTime=-Infinity;
  private atlasDirection={value:new THREE.Vector3()};
  private atlasSlope={value:new THREE.Vector2()};
  private shadowPasses=0;
  private clouds:FrontierCloud[];
  private renderEntries:{index:number;depth:number}[]=[];
  private visibleClouds:{index:number;depth:number}[]=[];
  private order:number[]=[];
  private frustum=new THREE.Frustum();
  private projection=new THREE.Matrix4();
  private sphere=new THREE.Sphere();
  private lightView=new THREE.Vector2();
  private cloudTop=0;
  private viewDirection={value:new THREE.Vector3()};
  private renderer?:THREE.WebGLRenderer;
  private stableProjection?:THREE.Vector3;
  constructor(renderer?:THREE.WebGLRenderer,options:{stableProjection?:boolean}={}){
    const clouds=createFrontierCloudField();
    const volume=new THREE.Data3DTexture(createCloudVolume(),CLOUD_VOLUME_SIZE,CLOUD_VOLUME_SIZE,CLOUD_VOLUME_SIZE);
    volume.format=THREE.RGFormat;volume.minFilter=volume.magFilter=THREE.LinearFilter;volume.unpackAlignment=1;volume.needsUpdate=true;
    const direction={value:new THREE.Vector3(1800,2300,-1200).normalize()},drift={value:new THREE.Vector2()};
    const uniforms={densityMap:{value:volume},cloudDrift:drift,sunDirection:direction,
      cloudTint:{value:new THREE.Color(.96,.94,.85)},horizon:{value:new THREE.Color(.68,.78,.75)}};
    const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,side:THREE.BackSide,uniforms,
      vertexShader:`precision highp float;
        in vec4 cloudSeed;uniform vec2 cloudDrift;
        flat out vec4 cloudRandom;flat out vec3 cloudCenter,cloudExtent;out vec3 worldPosition;
        void main(){cloudRandom=cloudSeed;mat4 m=modelMatrix*instanceMatrix;
          cloudCenter=m[3].xyz;cloudCenter.xz=mod(cloudCenter.xz+cloudDrift+vec2(${CLOUD_FIELD_MARGIN.toFixed(1)}),vec2(${CLOUD_FIELD_SPAN.toFixed(1)}))-vec2(${CLOUD_FIELD_MARGIN.toFixed(1)});
          cloudExtent=vec3(length(m[0].xyz),length(m[1].xyz),length(m[2].xyz));
          worldPosition=cloudCenter+position*cloudExtent;gl_Position=projectionMatrix*viewMatrix*vec4(worldPosition,1.);}`,
      fragmentShader:`precision highp float;precision highp sampler3D;
        uniform vec3 sunDirection,cloudTint,horizon;
        flat in vec4 cloudRandom;flat in vec3 cloudCenter,cloudExtent;in vec3 worldPosition;out vec4 outColor;
        #define gl_FragColor outColor
        ${CLOUD_SAMPLE_GLSL}
        void main(){
          vec3 ray=normalize(worldPosition-cameraPosition),ro=(cameraPosition-cloudCenter)/cloudExtent,rd=ray/cloudExtent;
          // Finite slab intersections even when flight puts the camera exactly
          // on a volume boundary and a ray runs parallel to that face.
          vec3 safeRay=mix(vec3(1e-9),rd,greaterThan(abs(rd),vec3(1e-9)));
          vec3 inv=1./safeRay,t0=(-vec3(1.)-ro)*inv,t1=(vec3(1.)-ro)*inv;
          vec3 nearT=min(t0,t1),farT=max(t0,t1);
          float a=max(0.,max(nearT.x,max(nearT.y,nearT.z))),b=min(farT.x,min(farT.y,farT.z));if(b<=a)discard;
          int steps=a>18000.?6:a>7000.?8:12;
          float stepSize=(b-a)/float(steps),transmission=1.;vec3 light=vec3(0.);
          float jitter=fract(dot(floor(gl_FragCoord.xy),vec2(.754877666,.569840296)));
          for(int i=0;i<12;i++){
            if(i>=steps)break;
            vec3 q=(cameraPosition+ray*(a+(float(i)+jitter)*stepSize)-cloudCenter)/cloudExtent;
            vec2 field=cloudSample(q,cloudRandom);float d=field.r;if(d<.012)continue;
            float sideDensity=cloudSample(q+sunDirection*240./cloudExtent,cloudRandom).r;
            float illumination=clamp(field.g*.56+(1.-sideDensity)*.40,.14,1.);
            float silver=pow(max(0.,dot(ray,sunDirection)),8.)*(1.-d)*.18;
            vec3 color=cloudTint*(.30+.70*illumination+silver);
            float opacity=1.-exp(-d*stepSize*.0038);light+=transmission*opacity*color;transmission*=1.-opacity;
            if(transmission<.018)break;
          }
          float alpha=1.-transmission;if(alpha<.018)discard;
          float haze=1.-exp(-pow(a*.000009,2.));
          outColor=vec4(mix(light/max(.001,alpha),horizon,haze),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    super(new THREE.BoxGeometry(2,2,2),material,clouds.length);
    this.renderer=renderer;this.volume=volume;this.shadowDirection=direction;this.drift=drift;this.clouds=clouds;
    if(options.stableProjection)this.stableProjection=new THREE.Vector3(0,1,0);
    this.cloudTop=Math.max(...clouds.map(c=>c.altitude+c.height));
    this.renderEntries=clouds.map((_,index)=>({index,depth:0}));
    this.name='frontier-volumetric-cumulus';this.renderOrder=5;this.frustumCulled=false;
    const seeds=new THREE.InstancedBufferAttribute(new Float32Array(clouds.flatMap(c=>c.shape)),4);
    this.geometry.setAttribute('cloudSeed',seeds);
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();
    clouds.forEach((c,i)=>this.setMatrixAt(i,matrix.compose(new THREE.Vector3(c.x,c.altitude,c.z),rotation,new THREE.Vector3(c.width,c.height,c.depth))));
    this.order=clouds.map((_,i)=>i);this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);seeds.setUsage(THREE.DynamicDrawUsage);
    this.computeBoundingSphere();
    this.shadowTarget=new THREE.WebGLRenderTarget(1024,1024,{depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.shadowTarget.texture.name='frontier-cloud-optical-shadows';
    this.shadowTarget.texture.wrapS=this.shadowTarget.texture.wrapT=THREE.RepeatWrapping;
    const shadowMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,transparent:true,depthTest:false,depthWrite:false,
      uniforms:{densityMap:{value:volume},sunDirection:this.atlasDirection},
      vertexShader:`precision highp float;in vec3 position;in mat4 instanceMatrix;in vec4 cloudSeed;
        uniform vec3 sunDirection;
        flat out vec4 cloudRandom;flat out vec3 cloudExtent;out vec2 groundOffset;
        void main(){cloudRandom=cloudSeed;cloudExtent=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
          vec3 centre=instanceMatrix[3].xyz;
          vec2 slope=sunDirection.xz/max(.15,sunDirection.y);
          vec2 ground=mod(centre.xz-slope*centre.y+vec2(${CLOUD_FIELD_MARGIN.toFixed(1)}),vec2(${CLOUD_FIELD_SPAN.toFixed(1)}))-vec2(${CLOUD_FIELD_MARGIN.toFixed(1)});
          // Periodic copies preserve footprints that straddle the atlas edge.
          int copyIndex=gl_InstanceID%9;
          ground+=vec2(float(copyIndex%3-1),float(copyIndex/3-1))*${CLOUD_FIELD_SPAN.toFixed(1)};
          groundOffset=position.xy*(cloudExtent.xz+abs(slope)*cloudExtent.y)*2.;
          gl_Position=vec4((ground+groundOffset+vec2(${CLOUD_FIELD_MARGIN.toFixed(1)}))/${CLOUD_FIELD_SPAN.toFixed(1)}*2.-1.,0.,1.);}`,
      fragmentShader:`precision highp float;precision highp sampler3D;
        uniform vec3 sunDirection;flat in vec4 cloudRandom;flat in vec3 cloudExtent;in vec2 groundOffset;out vec4 outColor;
        ${CLOUD_SAMPLE_GLSL}
        void main(){float optical=0.;vec2 slope=sunDirection.xz/max(.15,sunDirection.y);
          for(int i=0;i<12;i++){float y=-1.+(float(i)+.5)/6.;vec3 q=vec3((groundOffset+slope*y*cloudExtent.y).x/cloudExtent.x,y,(groundOffset+slope*y*cloudExtent.y).y/cloudExtent.z);optical+=cloudSample(q,cloudRandom).r;}
          float pathStep=cloudExtent.y/6./max(.15,sunDirection.y);
          float opacity=1.-exp(-optical*pathStep*.0038);if(opacity<.01)discard;outColor=vec4(1.,1.,1.,opacity);}`});
    this.shadowMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),shadowMaterial,clouds.length*9);
    this.shadowMesh.geometry.setAttribute('cloudSeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds.array),4,false,9));
    this.shadowMesh.instanceMatrix=new THREE.InstancedBufferAttribute(new Float32Array(this.instanceMatrix.array),16,false,9);
    this.shadowMesh.frustumCulled=false;this.shadowScene.add(this.shadowMesh);
  }
  /** One weather-space optical-depth lookup, advected continuously by wind. */
  shade(material:THREE.Material){
    if(material.userData.frontierCaveLighting||material.userData.frontierCloudShadow)return;material.userData.frontierCloudShadow=true;
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous(shader,renderer);
      shader.uniforms.frontierCloudShadow={value:this.shadowTarget.texture};
      shader.uniforms.frontierCloudDirection=this.shadowDirection;shader.uniforms.frontierCloudSlope=this.atlasSlope;
      shader.uniforms.frontierCloudWind=this.drift;
      shader.uniforms.frontierCloudViewDirection=this.viewDirection;
      shader.vertexShader='varying vec3 cloudSurface;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 cloudVertex=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        cloudVertex=instanceMatrix*cloudVertex;
        #endif
        cloudSurface=(modelMatrix*cloudVertex).xyz;`);
      // Only the celestial directional light is blocked by clouds. Point/spot
      // lights (including torches and the flashlight) keep their own lighting.
      const lighting=THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',`getDirectionalLightInfo( directionalLight, directLight );
        {float cloudAlignment=smoothstep(.9999,.99999,dot(directLight.direction,frontierCloudViewDirection));
        directLight.color*=mix(1.,cloudSun,cloudAlignment);}`)
        .replace('directionalLightShadow = directionalLightShadows[ i ];',`directionalLightShadow = directionalLightShadows[ i ];
          {vec2 frontierShadowUV=vDirectionalShadowCoord[i].xy/vDirectionalShadowCoord[i].w;
          float frontierShadowBorder=min(min(frontierShadowUV.x,1.-frontierShadowUV.x),min(frontierShadowUV.y,1.-frontierShadowUV.y));
          directionalLightShadow.shadowIntensity*=smoothstep(0.,.08,frontierShadowBorder);}`);
      shader.fragmentShader='varying vec3 cloudSurface;uniform sampler2D frontierCloudShadow;uniform vec3 frontierCloudDirection,frontierCloudViewDirection;uniform vec2 frontierCloudSlope,frontierCloudWind;\n'+shader.fragmentShader.replace('#include <lights_fragment_begin>',lighting);
      shader.fragmentShader=shader.fragmentShader.replace('IncidentLight directLight;',`// Advect the immutable atlas continuously, rather than redrawing for wind.
        vec2 cloudUV=(cloudSurface.xz-frontierCloudWind-frontierCloudSlope*cloudSurface.y+${CLOUD_FIELD_MARGIN.toFixed(1)})/${CLOUD_FIELD_SPAN.toFixed(1)};
        float cloudShadow=texture2D(frontierCloudShadow,cloudUV).r;
        float cloudSun=1.-cloudShadow*.62*smoothstep(.05,.25,frontierCloudDirection.y);
        IncidentLight directLight;`);
    };material.customProgramCacheKey=()=>key+':cloud-optical-shadow-v3';material.needsUpdate=true;
  }
  private packVisible(camera:THREE.PerspectiveCamera){
    camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const view=camera.matrixWorldInverse.elements,visible=this.visibleClouds;visible.length=0;
    this.clouds.forEach((c,index)=>{
      const x=((c.x+this.drift.value.x+CLOUD_FIELD_MARGIN)%CLOUD_FIELD_SPAN+CLOUD_FIELD_SPAN)%CLOUD_FIELD_SPAN-CLOUD_FIELD_MARGIN;
      const z=((c.z+this.drift.value.y+CLOUD_FIELD_MARGIN)%CLOUD_FIELD_SPAN+CLOUD_FIELD_SPAN)%CLOUD_FIELD_SPAN-CLOUD_FIELD_MARGIN;
      this.sphere.center.set(x,c.altitude,z);this.sphere.radius=Math.hypot(c.width,c.height,c.depth);
      if(this.frustum.intersectsSphere(this.sphere)){
        const entry=this.renderEntries[index];entry.depth=-(view[2]*x+view[6]*c.altitude+view[10]*z+view[14]);visible.push(entry);
      }
    });
    visible.sort((a,b)=>b.depth-a.depth);this.count=visible.length;
    const matrices=this.instanceMatrix.array as Float32Array,seeds=this.geometry.getAttribute('cloudSeed') as THREE.InstancedBufferAttribute;
    let changed=false;
    visible.forEach(({index},slot)=>{
      if(this.order[slot]===index)return;changed=true;this.order[slot]=index;
      const c=this.clouds[index],offset=slot*16;matrices.fill(0,offset,offset+16);
      matrices[offset]=c.width;matrices[offset+5]=c.height;matrices[offset+10]=c.depth;matrices[offset+15]=1;
      matrices[offset+12]=c.x;matrices[offset+13]=c.altitude;matrices[offset+14]=c.z;
      (seeds.array as Float32Array).set(c.shape,slot*4);
    });
    if(changed){this.instanceMatrix.needsUpdate=true;seeds.needsUpdate=true;}
  }
  update(seconds:number,frameSeconds=seconds,camera?:THREE.PerspectiveCamera){
    this.drift.value.set(((seconds*CLOUD_WIND.x)%CLOUD_FIELD_SPAN+CLOUD_FIELD_SPAN)%CLOUD_FIELD_SPAN,((seconds*CLOUD_WIND.z)%CLOUD_FIELD_SPAN+CLOUD_FIELD_SPAN)%CLOUD_FIELD_SPAN);
    if(camera)this.packVisible(camera);
    this.viewDirection.value.copy(this.shadowDirection.value);if(camera)this.viewDirection.value.transformDirection(camera.matrixWorldInverse);
    const r=this.renderer;if(!r)return;
    // Night/low-horizon shadows have no visible contribution. Wind translation
    // needs no new pass; only an appreciable change in projected sunlight does.
    const direction=this.stableProjection??this.shadowDirection.value;
    if(this.shadowStrength.value<.001||this.shadowDirection.value.y<.05)return;
    this.lightView.set(direction.x/Math.max(.15,direction.y),direction.z/Math.max(.15,direction.y));
    const projectionShift=this.lightView.distanceTo(this.atlasSlope.value)*this.cloudTop;
    if(Number.isFinite(this.lastShadowTime)&&projectionShift<CLOUD_FIELD_SPAN/1024*.75)return;
    if(frameSeconds>=this.lastShadowTime&&frameSeconds-this.lastShadowTime<.20&&projectionShift<1024)return;
    this.atlasDirection.value.copy(direction);
    const target=r.getRenderTarget(),viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4());
    const scissorTest=r.getScissorTest(),clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),auto=r.autoClear;
    const shadows=r.shadowMap.enabled,shadowUpdate=r.shadowMap.needsUpdate;
    try{r.shadowMap.enabled=false;r.setRenderTarget(this.shadowTarget);r.setScissorTest(false);r.autoClear=false;r.setClearColor(0,0);r.clear();r.render(this.shadowScene,this.shadowCamera);
      this.atlasSlope.value.copy(this.lightView);this.lastShadowTime=frameSeconds;this.shadowPasses++;}
    finally{r.shadowMap.enabled=shadows;r.shadowMap.needsUpdate=shadowUpdate;r.setRenderTarget(target);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);r.setClearColor(clear,alpha);r.autoClear=auto;}
  }
  setAtmosphere(atmosphere:FriendsDayNightCycle){
    this.shadowDirection.value=atmosphere.lightDirection.value;this.shadowStrength=atmosphere.directStrength;
    this.material.uniforms.cloudTint=atmosphere.cloudColor;this.material.uniforms.horizon={value:atmosphere.horizon};
  }
  get windOffset(){return this.drift.value;}
  get stats(){return {visible:this.count,total:this.clouds.length,shadowPasses:this.shadowPasses};}
  release(){
    this.volume.dispose();this.shadowTarget.dispose();this.shadowMesh.geometry.dispose();this.shadowMesh.material.dispose();this.shadowMesh.dispose();
    this.material.dispose();this.geometry.dispose();this.dispose();this.removeFromParent();
  }
}
