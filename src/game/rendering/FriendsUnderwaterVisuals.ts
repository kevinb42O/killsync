import type { FriendsTerrain } from '../world/FriendsTerrain';
import { friendsLiveWaterAt, friendsLiveWaterSurface } from '../world/FriendsFloodWater';
import * as THREE from 'three';
import { FriendsSubmergedDressing } from './FriendsSubmergedDressing';
import { friendsWaterAt } from '../world/FriendsWaterSurface';
import { bindUnderwaterMaterial, createUnderwaterLightUniforms } from './FriendsUnderwaterLighting';

/** Existing fog/material passes plus a bounded mote batch and soft light planes.
 * No scene copies, reflection cameras or intermediate full-screen targets. */
export class FriendsUnderwaterVisuals{
  private dressing?:FriendsSubmergedDressing;
  private fog=new THREE.FogExp2(0x225c64,.001);
  private deepColor=new THREE.Color('#082b40');
  private background=new THREE.Color('#347f85');
  private originalFog:THREE.Scene['fog']=null;
  private originalBackground:THREE.Scene['background']=null;
  private hiddenAtmosphere:{object:THREE.Object3D;visible:boolean}[]=[];
  private active=false;private wasSubmerged=false;private enteredAt=0;private lastScan=-Infinity;
  private lastCover=-Infinity;private coverKey='';private skyExposure=1;
  private lighting=createUnderwaterLightUniforms();
  private bindings=new Map<THREE.MeshStandardMaterial,{release:()=>void;disposed:()=>void}>();
  private matrix=new THREE.Matrix4();private lightDirection=new THREE.Vector3();
  readonly overlay:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  readonly motes:THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  readonly shafts:THREE.InstancedMesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  constructor(private scene:THREE.Scene){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{light:{value:1},depth:{value:0},time:{value:0},immersion:{value:0},entry:{value:0}},
      vertexShader:'varying vec2 screenUv;void main(){screenUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`varying vec2 screenUv;uniform float depth,time,light,immersion,entry;void main(){
        vec2 p=(screenUv-.5)*vec2(1.35,1.);float rim=smoothstep(.25,.82,length(p));
        float ring=pow(max(0.,1.-abs(length(p)-(.15+(1.-entry)*.8))*16.),2.)*entry;
        float surface=1.-smoothstep(8.,70.,depth);
        float shimmer=sin(p.x*18.+sin(p.y*13.+time*.6))*sin(p.y*19.-time*.5);
        float alpha=(.008+rim*.028+ring*.08+abs(shimmer)*surface*.006)*immersion;
        gl_FragColor=vec4(vec3(.065,.25,.29)*(.3+.7*light)+ring*vec3(.10,.18,.17),alpha);
      }`});
    this.overlay=new THREE.Mesh(geometry,material);this.overlay.name='underwater-lens';this.overlay.frustumCulled=false;this.overlay.renderOrder=10000;this.overlay.visible=false;scene.add(this.overlay);
    const points=new THREE.BufferGeometry(),positions=[],seeds=[];
    for(let i=0;i<192;i++){const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};positions.push(hash(i*3)*1000,hash(i*3+1)*700,hash(i*3+2)*1000);seeds.push(hash(i+900));}
    points.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));points.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
    const moteMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},level:{value:0},light:{value:1},immersion:{value:0}},
      vertexShader:`attribute float seed;uniform float time,level;varying float moteFade,moteSeed;void main(){
        vec3 range=vec3(1000.,700.,1000.);
        vec3 drift=vec3(time*1.8,sin(time*.35+seed*30.)*9.,time*.7);
        vec3 p=mod(position+drift-cameraPosition+range*.5,range)-range*.5+cameraPosition;
        vec4 mv=viewMatrix*vec4(p,1.);float distance=-mv.z;
        moteFade=smoothstep(12.,75.,distance)*(1.-smoothstep(260.,500.,distance))*step(p.y,level-2.);
        moteSeed=seed;gl_PointSize=clamp((1.2+seed*1.3)*220./max(50.,distance),1.,5.);gl_Position=projectionMatrix*mv;
      }`,fragmentShader:`uniform float light,immersion;varying float moteFade,moteSeed;void main(){
        float circle=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));
        gl_FragColor=vec4(mix(vec3(.30,.56,.48),vec3(.72,.87,.78),moteSeed)*(.20+.8*light),circle*moteFade*immersion*(.12+moteSeed*.13));
      }`});
    this.motes=new THREE.Points(points,moteMaterial);this.motes.name='underwater-suspended-motes';this.motes.frustumCulled=false;this.motes.renderOrder=6;this.motes.visible=false;scene.add(this.motes);
    const shaftsMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{level:this.lighting.level,direction:this.lighting.sunDirection,time:this.lighting.time,strength:{value:0}},
      vertexShader:`uniform float level;uniform vec3 direction;varying vec2 beamUv;void main(){
        vec3 anchor=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;anchor.y=level-3.;
        vec3 down=-direction;vec3 side=normalize(cross(down,normalize(cameraPosition-anchor))+vec3(.0001,0.,0.));
        vec3 p=anchor+down*uv.y*850.+side*(uv.x-.5)*(55.+uv.y*100.);
        beamUv=uv;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`,fragmentShader:`uniform float strength,time;varying vec2 beamUv;void main(){
        float edge=pow(max(0.,1.-abs(beamUv.x-.5)*2.),3.);
        float vertical=smoothstep(0.,.06,beamUv.y)*(1.-smoothstep(.15,1.,beamUv.y));
        float drift=.72+.28*sin(beamUv.y*8.+time*.25);
        gl_FragColor=vec4(.38,.64,.53,edge*vertical*drift*strength*.055);
      }`});
    this.shafts=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),shaftsMaterial,9);this.shafts.name='underwater-soft-sun-shafts';this.shafts.frustumCulled=false;this.shafts.renderOrder=5;this.shafts.visible=false;scene.add(this.shafts);
    this.bindSceneMaterials();
  }
  private bindSceneMaterials(){
    this.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const material of Array.isArray(o.material)?o.material:[o.material]){
      if(!(material instanceof THREE.MeshStandardMaterial)||this.bindings.has(material))continue;
      const release=bindUnderwaterMaterial(material,this.lighting);
      const disposed=()=>{release();this.bindings.delete(material);material.removeEventListener('dispose',disposed);};
      this.bindings.set(material,{release,disposed});material.addEventListener('dispose',disposed);
    }});
  }
  /** Restore before daylight updates, then apply after the final camera pose. */
  beginFrame(){
    this.dressing?.hide();this.lighting.enabled.value=0;this.motes.visible=this.shafts.visible=this.overlay.visible=false;
    if(!this.active)return;
    this.scene.fog=this.originalFog;this.scene.background=this.originalBackground;
    for(const saved of this.hiddenAtmosphere)saved.object.visible=saved.visible;this.hiddenAtmosphere.length=0;this.active=false;
  }
  private exposure(camera:THREE.Camera,level:number,elapsed:number,terrain?:FriendsTerrain){
    if(!terrain)return 1;
    const vx=Math.floor(camera.position.x/32),vy=Math.floor(camera.position.z/32),vz=Math.floor(camera.position.y/32),key=`${vx},${vy},${vz}:${terrain.waterEpoch}`;
    if(key===this.coverKey&&elapsed-this.lastCover<400)return this.skyExposure;
    this.coverKey=key;this.lastCover=elapsed;let open=0;
    for(const [dx,dy]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
      let blocked=false;for(let z=vz+1;z<=Math.ceil(level/32)+2;z++)if(terrain.material(vx+dx,vy+dy,z)){blocked=true;break;}
      if(!blocked)open++;
    }
    this.skyExposure=open/5;return this.skyExposure;
  }
  update(camera:THREE.Camera,elapsed:number,enabled=true,daylight=1,terrain?:FriendsTerrain,swimming=false){
    const water=enabled?(terrain?friendsLiveWaterAt(terrain,camera.position.x,camera.position.z,camera.position.y):friendsWaterAt(camera.position.x,camera.position.z)):undefined;
    const depth=water?water.level-camera.position.y:0;
    const surface=water??(enabled&&swimming&&terrain?friendsLiveWaterSurface(terrain,camera.position.x,camera.position.z):undefined);
    if(enabled&&terrain&&surface&&(swimming||depth>=.5)){
      if(!this.dressing){this.dressing=new FriendsSubmergedDressing(this.scene);this.bindSceneMaterials();}
      this.dressing.update(camera,elapsed,terrain,surface.bodyId);
    }else this.dressing?.hide();
    if(depth<.5){this.wasSubmerged=false;return;}
    if(!this.wasSubmerged){this.enteredAt=elapsed;this.wasSubmerged=true;}
    if(elapsed-this.lastScan>750){this.bindSceneMaterials();this.lastScan=elapsed;}
    this.originalFog=this.scene.fog;this.originalBackground=this.scene.background;
    const immersion=THREE.MathUtils.smoothstep(depth,0,18),dark=THREE.MathUtils.smoothstep(depth,60,900),sea=water!.bodyId==='sea';
    const exposure=this.exposure(camera,water!.level,elapsed,terrain);
    const sun=this.scene.children.find(o=>o instanceof THREE.DirectionalLight) as THREE.DirectionalLight|undefined;
    if(sun){this.lightDirection.subVectors(sun.position,sun.target.position).normalize();this.lighting.sunDirection.value.copy(this.lightDirection);}
    const sunHeight=THREE.MathUtils.smoothstep(this.lighting.sunDirection.value.y,.04,.30);
    const sunlight=daylight*exposure*sunHeight;
    if(depth>18)for(const name of ['frontier-day-night-sky','frontier-volumetric-cumulus']){
      const object=this.scene.getObjectByName(name);if(object){this.hiddenAtmosphere.push({object,visible:object.visible});object.visible=false;}
    }
    this.fog.color.set(sea?'#398e96':'#397d72').lerp(this.deepColor,dark).multiplyScalar(.12+.88*daylight);
    if(this.originalFog)this.fog.color.lerp(this.originalFog.color,1-immersion);
    const originalDensity=this.originalFog instanceof THREE.FogExp2?this.originalFog.density:0;
    this.fog.density=THREE.MathUtils.lerp(originalDensity,(sea?.00072:.00095)+dark*.0016,immersion);
    this.background.copy(this.fog.color);if(this.originalBackground instanceof THREE.Color)this.background.lerp(this.originalBackground,1-immersion);
    this.scene.fog=this.fog;this.scene.background=this.background;this.active=true;
    this.lighting.enabled.value=immersion;this.lighting.time.value=elapsed/1000;this.lighting.level.value=water!.level;this.lighting.sunlight.value=sunlight;this.lighting.exposure.value=exposure;this.lighting.clarity.value=sea?.85:1.1;
    const u=this.overlay.material.uniforms;u.immersion.value=immersion;u.light.value=daylight;u.depth.value=depth;u.time.value=elapsed/1000;u.entry.value=Math.max(0,1-(elapsed-this.enteredAt)/850);this.overlay.visible=true;
    const m=this.motes.material.uniforms;m.time.value=elapsed/1000;m.level.value=water!.level;m.light.value=daylight;m.immersion.value=immersion;this.motes.visible=true;
    this.shafts.material.uniforms.strength.value=sunlight*immersion*(1-dark);this.shafts.visible=sunlight>.02&&dark<.95;
    if(this.shafts.visible){const x=Math.round(camera.position.x/160)*160,z=Math.round(camera.position.z/160)*160;for(let i=0;i<9;i++){
      this.matrix.makeTranslation(x+(i%3-1)*250+Math.sin(i*13)*90,0,z+(Math.floor(i/3)-1)*250+Math.cos(i*17)*90);this.shafts.setMatrixAt(i,this.matrix);
    }this.shafts.instanceMatrix.needsUpdate=true;}
  }
  dispose(){
    this.beginFrame();for(const [material,binding]of this.bindings){material.removeEventListener('dispose',binding.disposed);binding.release();}this.bindings.clear();
    for(const object of [this.overlay,this.motes,this.shafts]){object.removeFromParent();object.geometry.dispose();object.material.dispose();}
    this.shafts.dispose();this.dressing?.dispose();
  }
}
