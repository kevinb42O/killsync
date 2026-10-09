import * as THREE from 'three';
import { installFriendsFlashlightFalloff } from './FriendsFlashlightFalloff';
import { FRIENDS_NIGHT_VISION_RANGE, friendsVisionAngle, friendsVisionBufferSize } from './FriendsVision';
import type { FriendsFlashlightGlare } from './FriendsSharedFlashlights';

const vertexShader = 'varying vec2 vUv; void main() { vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
export const FRIENDS_NIGHT_VISION_INTENSITY = 2_400_000;
const IR_SOFT_DISTANCE = 600;

export type FriendsNightVisionOptions = { maxPixels?: number; samples?: number };

/** One stable linear HDR world/hand path, whether goggles are equipped or not.
 * Off frames only copy/tone-map the image. This avoids changing every world's
 * shader output/tone-mapping configuration when the player equips goggles. */
export class FriendsNightVision {
  private enabled = false;
  private blend = 0;
  private time = 0;
  private deltaSeconds = 0;
  private infrared = new THREE.SpotLight(0xffffff, 0, FRIENDS_NIGHT_VISION_RANGE, 1.35, .18, -IR_SOFT_DISTANCE);
  private target = new THREE.Object3D();
  private forward = new THREE.Vector3();
  private position = new THREE.Vector3();
  private size = new THREE.Vector2();
  private buffer?: THREE.WebGLRenderTarget;
  private previousTarget: THREE.WebGLRenderTarget | null = null;
  private framePending = false;
  private disposed = false;
  private pass = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      image: { value: null }, exposure: { value: null }, blend: { value: 0 }, time: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      flashlightFlares: {value:Array.from({length:4},()=>new THREE.Vector4())},
      flashlightGlare: {value:0}, flashlightEffects: {value:false},
    },
    vertexShader,
    fragmentShader: `
      uniform sampler2D image, exposure;
      uniform float blend, time;
      uniform vec2 resolution;
      uniform vec4 flashlightFlares[4];
      uniform float flashlightGlare;
      uniform bool flashlightEffects;
      varying vec2 vUv;
      float nvgLuminance(vec3 c) { return dot(c,vec3(.2126,.7152,.0722)); }
      float grain(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main() {
        vec3 source=max(texture2D(image,vUv).rgb,vec3(0.));
        vec3 natural=source;
        #ifdef TONE_MAPPING
          natural=toneMapping(natural);
        #endif
        // Uniform off branch skips metering, grain and neighbourhood samples.
        if (blend <= 0.) {
          gl_FragColor=vec4(natural,1.);
        } else {
          float gain=texture2D(exposure,vec2(.5)).r;
          float energy=max(0.,nvgLuminance(source))*gain;
          float signal=pow(energy/(energy+.40),.65);
          vec2 texel=1.5/resolution;
          float neighbours=nvgLuminance(texture2D(image,vUv+vec2(texel.x,0.)).rgb
            +texture2D(image,vUv-vec2(texel.x,0.)).rgb
            +texture2D(image,vUv+vec2(0.,texel.y)).rgb
            +texture2D(image,vUv-vec2(0.,texel.y)).rgb)*.25;
          // Bounded local contrast keeps machining/rock detail without halos.
          float detail=clamp(log2(1.+energy)-log2(1.+max(neighbours,0.)*gain),-.6,.6)*.06;
          float noise=(grain(floor(vUv*resolution)+floor(time*24.))-.5)*.008;
          signal=clamp(signal+detail+noise,0.,1.);
          vec3 phosphor=mix(vec3(.004,.014,.007),vec3(.22,.74,.34),signal);
          phosphor=mix(phosphor,vec3(.62,.91,.69),smoothstep(.78,.99,signal)*.28);
          vec2 p=vUv*2.-1.;
          p.x*=clamp((resolution.x/resolution.y)/(16./9.),.75,1.35);
          float lens=min(length((p-vec2(.24,0.))/vec2(1.06,1.25)),
                         length((p+vec2(.24,0.))/vec2(1.06,1.25)));
          // A faint eyepiece edge preserves useful peripheral vision.
          float rim=smoothstep(.95,1.35,lens);
          phosphor*=1.-rim*.18;
          phosphor+=vec3(.001,.003,.002)*exp(-abs(lens-1.12)*60.);
          gl_FragColor=vec4(mix(natural,phosphor,blend),1.);
        }
        if (flashlightEffects) {
          // Fuse lens glare into the existing copy pass: no bloom targets,
          // extra scene draw or shader variant when another player toggles.
          vec3 tint=mix(vec3(.88,.94,1.),vec3(.50,.88,.57),blend);
          gl_FragColor.rgb=mix(gl_FragColor.rgb,tint,flashlightGlare*mix(.18,.24,blend));
          for(int i=0;i<4;i++) {
            if(flashlightFlares[i].z>0.) {
              vec2 p=vUv-flashlightFlares[i].xy;p.x*=resolution.x/resolution.y;
              float r2=dot(p,p);
              float halo=exp(-r2/ .0012)*.10+exp(-r2/ .00009)*.25+exp(-r2/ .000008)*.65;
              float streak=exp(-abs(p.y)*1200.)*exp(-abs(p.x)*30.)*.09;
              gl_FragColor.rgb+=tint*(halo+streak)*flashlightFlares[i].z;
            }
          }
          gl_FragColor.rgb=min(gl_FragColor.rgb,vec3(1.));
        }
        #include <colorspace_fragment>
      }`,
  });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  // A 1x1 GPU exposure history avoids synchronous pixel readback. Sixteen
  // stratified log-luminance samples reduce the influence of lamps/crystals; an
  // asymmetric adaptation responds quickly to glare, slowly to darkness.
  private meterPass = new THREE.Scene();
  private meterMaterial = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { image: { value: null }, history: { value: null }, initialized: { value: false }, meterEnabled: { value: false }, delta: { value: 0 } },
    vertexShader,
    fragmentShader: `
      uniform sampler2D image, history;
      uniform bool initialized, meterEnabled;
      uniform float delta;
      void main() {
        if (!meterEnabled) { gl_FragColor=vec4(1.,0.,0.,1.); return; }
        float total=0.;
        for(int y=0;y<4;y++)for(int x=0;x<4;x++) {
          vec2 uv=(vec2(float(x),float(y))+.5)/4.;
          float l=dot(max(texture2D(image,uv).rgb,vec3(0.)),vec3(.2126,.7152,.0722));
          total+=log2(.01+min(l,32.));
        }
        float average=max(0.,exp2(total/16.)-.01);
        float target=clamp(.20/max(average,.025),.08,8.);
        float previous=initialized?texture2D(history,vec2(.5)).r:target;
        float speed=target<previous?6.:1.8;
        float gain=mix(previous,target,1.-exp(-speed*delta));
        gl_FragColor=vec4(gain,0.,0.,1.);
      }`,
  });
  private meterQuad = new THREE.Mesh(this.quad.geometry, this.meterMaterial);
  private exposureTargets = [0,1].map(() => new THREE.WebGLRenderTarget(1,1,{ type: THREE.HalfFloatType, depthBuffer: false }));
  private exposureIndex = 0;
  private exposureInitialized = false;
  private meterWarmed = false;

  constructor(scene: THREE.Scene, private options: FriendsNightVisionOptions = {}) {
    installFriendsFlashlightFalloff();
    // Keep light/shadow counts constant. Zero intensity is completely dark.
    this.infrared.name = 'night-vision-infrared';
    this.infrared.target = this.target;
    this.infrared.castShadow = true;
    this.infrared.shadow.mapSize.set(1024,1024);
    this.infrared.shadow.camera.near = 4;
    this.infrared.shadow.bias = -.0003;
    this.infrared.shadow.normalBias = 1.2;
    this.infrared.shadow.autoUpdate = false;
    this.infrared.shadow.needsUpdate = true;
    scene.add(this.infrared,this.target);
    this.quad.frustumCulled = this.meterQuad.frustumCulled = false;
    this.pass.add(this.quad); this.meterPass.add(this.meterQuad);
    for(const target of this.exposureTargets)target.texture.name='night-vision-exposure';
  }

  get equipped() { return this.enabled; }
  toggle() { return this.enabled = !this.enabled; }
  /** Recreate the HDR target at the next frame boundary, retaining exposure history. */
  setSamples(samples: number) { this.options.samples = samples; }
  setFlashlightGlare(effect:FriendsFlashlightGlare) {
    const flares=this.material.uniforms.flashlightFlares.value as THREE.Vector4[];
    for(let i=0;i<flares.length;i++){
      if(effect.flares[i])flares[i].copy(effect.flares[i]);else flares[i].set(0,0,0,0);
    }
    this.material.uniforms.flashlightGlare.value=THREE.MathUtils.clamp(effect.glare,0,1);
    this.material.uniforms.flashlightEffects.value=effect.glare>0 || flares.some(f=>f.z>0);
  }

  /** Run after final camera movement, before world and hand rendering. */
  beginFrame(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, deltaMs: number, available = true) {
    if(this.disposed)return false;
    this.deltaSeconds = Math.max(0,Math.min(deltaMs,100))/1000;
    this.time += this.deltaSeconds;
    const active = this.enabled && available;
    this.blend = available ? THREE.MathUtils.damp(this.blend,active?1:0,active?10:16,this.deltaSeconds) : 0;
    if(this.blend<.001)this.blend=0;
    if(this.blend>.999)this.blend=1;
    this.infrared.intensity=FRIENDS_NIGHT_VISION_INTENSITY*this.blend;
    camera.getWorldPosition(this.position);camera.getWorldDirection(this.forward);
    this.infrared.position.copy(this.position);
    this.target.position.copy(this.position).addScaledVector(this.forward,FRIENDS_NIGHT_VISION_RANGE);
    this.infrared.angle=friendsVisionAngle(camera);
    if(this.blend)this.infrared.shadow.needsUpdate=true;
    if(this.infrared.shadow.needsUpdate)renderer.shadowMap.needsUpdate=true;

    renderer.getDrawingBufferSize(this.size);
    friendsVisionBufferSize(this.size.x,this.size.y,this.options.maxPixels ?? 3840*2160,this.size);
    const samples = Math.max(0, Math.min(this.options.samples ?? 2, renderer.capabilities?.maxSamples ?? 4));
    if (this.buffer && this.buffer.samples !== samples) {
      this.buffer.dispose(); this.buffer = undefined;
    }
    if(!this.buffer){
      this.buffer=new THREE.WebGLRenderTarget(this.size.x,this.size.y,{
        type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
        samples,
      });
      this.buffer.texture.name='friends-vision-hdr';
      this.material.uniforms.image.value=this.meterMaterial.uniforms.image.value=this.buffer.texture;
      // The tiny exposure buffers are allocated during the first world frame.
      if (!this.meterWarmed) for(const target of this.exposureTargets)renderer.initRenderTarget(target);
    }else if(this.buffer.width!==this.size.x||this.buffer.height!==this.size.y){
      this.buffer.setSize(this.size.x,this.size.y);
    }
    this.material.uniforms.resolution.value.copy(this.size);
    this.material.uniforms.blend.value=this.blend;
    this.material.uniforms.time.value=this.time;
    this.previousTarget=renderer.getRenderTarget();
    renderer.setRenderTarget(this.buffer);
    this.framePending=true;
    return true;
  }

  endFrame(renderer: THREE.WebGLRenderer) {
    if(!this.framePending||this.disposed)return;
    this.framePending=false;
    const autoClear=renderer.autoClear;
    try{
      renderer.autoClear=true;
      if(this.blend||!this.meterWarmed){
        const next=1-this.exposureIndex;
        this.meterMaterial.uniforms.history.value=this.exposureTargets[this.exposureIndex].texture;
        this.meterMaterial.uniforms.initialized.value=this.exposureInitialized;
        this.meterMaterial.uniforms.meterEnabled.value=this.blend>0;
        this.meterMaterial.uniforms.delta.value=this.deltaSeconds;
        renderer.setRenderTarget(this.exposureTargets[next]);renderer.render(this.meterPass,this.camera);
        this.exposureIndex=next;this.meterWarmed=true;this.exposureInitialized=this.blend>0;
      }else this.exposureInitialized=false;
      this.material.uniforms.exposure.value=this.exposureTargets[this.exposureIndex].texture;
      renderer.setRenderTarget(this.previousTarget);renderer.render(this.pass,this.camera);
    }finally{
      renderer.setRenderTarget(this.previousTarget);renderer.autoClear=autoClear;
    }
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;
    this.infrared.shadow.dispose();this.infrared.removeFromParent();this.target.removeFromParent();
    this.buffer?.dispose();this.exposureTargets.forEach(target=>target.dispose());
    this.quad.geometry.dispose();this.material.dispose();this.meterMaterial.dispose();
  }
}
