import * as THREE from 'three';
import { FriendsShaderWarmup } from './FriendsShaderWarmup';

/** Hold the hologram until actual local streaming is ready; the camera and
 * simulation continue normally throughout. A failed asset cannot trap arrival. */
export class FriendsArrivalSequence {
  active=false;
  age=0;
  reveal=0;
  private settling=0;
  private revealing=false;
  start(){this.active=true;this.age=this.reveal=this.settling=0;this.revealing=false;}
  update(deltaMs:number,ready:boolean,allowFallback=true){
    if(!this.active)return;
    const dt=Math.max(0,Math.min(100,deltaMs));this.age+=dt;
    this.settling=ready?this.settling+dt:0;
    if(!this.revealing && this.age>=950 && (this.settling>=200 || (allowFallback && this.age>=12000)))this.revealing=true;
    if(this.revealing)this.reveal=Math.min(1,this.reveal+dt/2800);
    if(this.reveal===1)this.active=false;
  }
  get stage(){return !this.active?'online':this.reveal>0?'materializing':this.age<600?'linking':'assembling';}
}

const fragmentShader = `
uniform sampler2D image, wireImage, worldDepth, wireDepth, glyphAtlas;
uniform mat4 inverseProjection, cameraWorld;
uniform vec3 origin;
uniform vec2 resolution;
uniform float reveal, time;
varying vec2 vUv;
float hash(float n){return fract(sin(n*127.1)*43758.5453);}
float grid(vec2 p,float size){vec2 q=abs(fract(p/size-.5)-.5)/max(fwidth(p/size),vec2(.0001));return 1.-min(min(q.x,q.y),1.);}
void main(){
  vec3 source=texture2D(image,vUv).rgb;
  #ifdef TONE_MAPPING
    source=toneMapping(source);
  #endif
  float depth=texture2D(worldDepth,vUv).r;
  vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);
  vec3 world=(cameraWorld*vec4(view.xyz/view.w,1.)).xyz;
  float distanceFromSpawn=min(length(world.xz-origin.xz),18000.);
  float radius=pow(reveal,1.8)*20500.;
  float built=1.-smoothstep(radius-250.,radius+450.,distanceFromSpawn);
  float horizon=smoothstep(.58,.98,reveal);
  if(depth>.999995)built=horizon;
  built=max(built,smoothstep(.87,1.,reveal));
  built*=smoothstep(0.,.18,reveal);
  float wireVisible=step(texture2D(wireDepth,vUv).r,depth+.000005);
  float outline=dot(texture2D(wireImage,vUv).rgb,vec3(.333))*wireVisible;
  float lattice=depth<.999995?grid(world.xz,64.)*.22+grid(world.xy,64.)*.08:0.;
  float front=exp(-abs(distanceFromSpawn-radius)/240.)*(1.-smoothstep(.85,1.,reveal));
  vec3 mint=vec3(.20,.95,.67);
  vec3 digital=vec3(.003,.016,.015)+mint*(outline*.52+lattice*.25);
  digital+=mint*front*(.15+lattice*.65+outline*.35);
  // Falling hex columns form the digital sky behind the real wire geometry.
  vec2 cells=resolution/vec2(16.,24.);
  vec2 cell=floor(vUv*cells),inside=fract(vUv*cells);
  float seed=hash(cell.x+7.);
  float head=fract(time*(.07+seed*.06)+seed);
  float trail=mod(head-vUv.y+1.,1.);
  float stream=exp(-trail*12.)*step(.32,seed);
  float character=floor(hash(cell.x*61.+cell.y*3.+floor(time*3.))*16.);
  float glyph=texture2D(glyphAtlas,vec2((character+inside.x)/16.,inside.y)).a;
  float rainFade=(1.-smoothstep(.15,.90,reveal))*.23;
  digital+=mint*glyph*stream*rainFade;
  float scan=.96+.04*sin(vUv.y*resolution.y*3.14159);
  digital*=scan;
  vec3 result=mix(digital,source,built);
  result+=mint*front*.08;
  float finish=smoothstep(.78,1.,reveal);
  float vignette=1.-dot(vUv-.5,vUv-.5)*.45*(1.-finish);
  gl_FragColor=vec4(result*vignette,1.);
  #include <colorspace_fragment>
}`;

/** Capture the actual streamed scene and its wire geometry. The reveal never
 * rewrites or recompiles gameplay materials, and stops rendering extra passes
 * as soon as arrival completes. */
export class FriendsWorldArrival {
  readonly sequence=new FriendsArrivalSequence();
  private size=new THREE.Vector2();
  private image?:THREE.WebGLRenderTarget;
  private wire?:THREE.WebGLRenderTarget;
  private atlas?:THREE.Texture;
  private wireMaterial=new THREE.MeshBasicMaterial({color:0x68f5b6,wireframe:true,side:THREE.DoubleSide,toneMapped:false});
  private pass=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{
    image:{value:null},wireImage:{value:null},worldDepth:{value:null},wireDepth:{value:null},glyphAtlas:{value:null},
    inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},
    origin:{value:new THREE.Vector3()},resolution:{value:new THREE.Vector2()},reveal:{value:0},time:{value:0},
  },vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader});
  private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
  private status?:HTMLDivElement;
  private title?:HTMLElement;
  private bar?:HTMLElement;
  private previousStage='';
  private warmup?:FriendsShaderWarmup;
  private shadersReady=false;
  private startedAt=0;
  private preparationFallback=false;

  get preparingShaders(){return this.sequence.active && this.sequence.reveal===0 && !this.shadersReady;}
  get preparationStats(){return { ...this.warmup?.stats, ready:this.shadersReady, fallback:this.preparationFallback };}

  constructor(){this.quad.frustumCulled=false;this.pass.add(this.quad);}
  mount(container:HTMLElement){
    this.status=document.createElement('div');this.status.setAttribute('role','status');
    this.status.style.cssText='position:fixed;z-index:8;left:50%;bottom:18%;transform:translateX(-50%);width:min(360px,78vw);pointer-events:none;text-align:center;color:#b5ffe0;font:11px monospace;letter-spacing:3px;text-shadow:0 0 18px #49efaa;display:none';
    const location=document.createElement('div');location.textContent='OPERATOR LINK / SUNLINE COMMONS';location.style.cssText='opacity:.6;font-size:9px;margin-bottom:16px';
    this.title=document.createElement('div');this.title.style.cssText='font-size:19px;letter-spacing:5px';
    const track=document.createElement('div');track.style.cssText='height:1px;background:#8de6ce30;margin:18px 0';
    this.bar=document.createElement('div');this.bar.style.cssText='height:1px;background:#b5ffe0;box-shadow:0 0 10px #8de6ce;transform-origin:left;transform:scaleX(0)';track.append(this.bar);
    this.status.append(location,this.title,track);container.append(this.status);
  }
  start(x:number,y:number,z:number){this.sequence.start();this.previousStage='';this.material.uniforms.origin.value.set(x,z,y);this.shadersReady=false;this.preparationFallback=false;this.startedAt=performance.now();this.warmup?.invalidate();}
  update(deltaMs:number,readiness:{ready:boolean;progress:number},enabled=true){
    if(!enabled){this.sequence.active=false;}
    this.sequence.update(deltaMs,readiness.ready && this.shadersReady,this.shadersReady);
    this.material.uniforms.time.value+=Math.max(0,deltaMs)/1000;
    this.material.uniforms.reveal.value=this.sequence.reveal;
    if(this.status){
      this.status.style.display=this.sequence.active?'block':'none';
      const stage=this.sequence.stage;
      if(stage!==this.previousStage){this.title!.textContent=stage==='linking'?'ESTABLISHING LINK':stage==='assembling'?'ASSEMBLING WORLD':this.sequence.reveal>.8?'WELCOME HOME':'MATERIALIZING';this.previousStage=stage;}
      if(this.sequence.reveal>.8)this.title!.textContent='WELCOME HOME';
      this.bar!.style.transform=`scaleX(${this.sequence.reveal>0?.3+this.sequence.reveal*.7:Math.max(.03,readiness.progress*.3)})`;
      this.status.style.opacity=String(this.sequence.reveal>.9?(1-this.sequence.reveal)*10:1);
    }
    if(!this.sequence.active)this.releaseBuffers();
  }

  private buffers(renderer:THREE.WebGLRenderer){
    renderer.getDrawingBufferSize(this.size);
    const scale=Math.min(1,1600/Math.max(this.size.x,this.size.y));this.size.multiplyScalar(scale).floor();
    if(!this.image){
      this.image=new THREE.WebGLRenderTarget(this.size.x,this.size.y,{type:THREE.HalfFloatType});
      this.image.depthTexture=new THREE.DepthTexture(this.size.x,this.size.y,THREE.UnsignedIntType);
      this.wire=new THREE.WebGLRenderTarget(this.size.x,this.size.y);
      this.wire.depthTexture=new THREE.DepthTexture(this.size.x,this.size.y,THREE.UnsignedIntType);
      if(typeof document!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=24;const ctx=canvas.getContext('2d')!;ctx.font='18px monospace';ctx.textAlign='center';ctx.fillStyle='white';
        for(let i=0;i<16;i++)ctx.fillText(i.toString(16).toUpperCase(),i*16+8,19);
        this.atlas=new THREE.CanvasTexture(canvas);this.atlas.minFilter=this.atlas.magFilter=THREE.NearestFilter;
      }else this.atlas=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
      this.material.uniforms.image.value=this.image.texture;this.material.uniforms.wireImage.value=this.wire!.texture;this.material.uniforms.worldDepth.value=this.image.depthTexture;this.material.uniforms.wireDepth.value=this.wire!.depthTexture;this.material.uniforms.glyphAtlas.value=this.atlas;
    }else if(this.image.width!==this.size.x||this.image.height!==this.size.y){this.image.setSize(this.size.x,this.size.y);this.wire!.setSize(this.size.x,this.size.y);}
    this.material.uniforms.resolution.value.copy(this.size);
  }

  render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera){
    if(!this.sequence.active)return false;
    this.buffers(renderer);
    const target=renderer.getRenderTarget(),autoClear=renderer.autoClear,override=scene.overrideMaterial,background=scene.background,fog=scene.fog;
    const hidden:THREE.Object3D[]=[];
    try{
      renderer.autoClear=true;renderer.setRenderTarget(this.image!);
      if(this.sequence.reveal===0){
        // Compile against the actual HDR capture and final scene lights. The
        // wire view continues drawing while the driver prepares local shaders.
        // Unsupported extensions/errors have a bounded wall-clock fallback.
        if(!renderer.extensions?.has('KHR_parallel_shader_compile') || performance.now()-this.startedAt>=30000){
          this.shadersReady=true;this.preparationFallback=true;
        }else{
          this.warmup??=new FriendsShaderWarmup(renderer,scene,{initialView:true});
          this.warmup.update(camera);this.shadersReady=this.warmup.ready;
        }
      }
      const captureWorld=this.shadersReady || this.sequence.reveal>0;
      if(captureWorld)renderer.render(scene,camera);
      scene.traverse(node=>{if(node.visible&&(node.name==='frontier-day-night-sky'||node.name==='frontier-volumetric-cumulus'||node.name==='the-surrounding-ocean'||node.name==='friends-player-arrivals'||node.name.includes('smoke')||node instanceof THREE.Sprite)){hidden.push(node);node.visible=false;}});
      scene.overrideMaterial=this.wireMaterial;scene.background=new THREE.Color(0x000000);scene.fog=null;
      renderer.setRenderTarget(this.wire!);renderer.render(scene,camera);
      scene.overrideMaterial=override;scene.background=background;scene.fog=fog;for(const node of hidden)node.visible=true;
      this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);this.material.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      this.material.uniforms.worldDepth.value=captureWorld?this.image!.depthTexture:this.wire!.depthTexture;
      renderer.setRenderTarget(target);renderer.render(this.pass,this.camera);
    }finally{
      scene.overrideMaterial=override;scene.background=background;scene.fog=fog;for(const node of hidden)node.visible=true;
      renderer.setRenderTarget(target);renderer.autoClear=autoClear;
    }
    return true;
  }
  private releaseBuffers(){this.image?.dispose();this.image=undefined;this.wire?.dispose();this.wire=undefined;this.atlas?.dispose();this.atlas=undefined;}
  dispose(){this.warmup?.dispose();this.releaseBuffers();this.quad.geometry.dispose();this.material.dispose();this.wireMaterial.dispose();this.status?.remove();}
}
