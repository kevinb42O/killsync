import * as THREE from 'three';

// Typed arrays remain shared through Three's uniform cloning and update every
// material without traversing the world or retaining individual shader handles.
const viewMatrices=new Float32Array(4*16);
const texel=new Float32Array(2);
const viewMatrix=new THREE.Matrix4();
let activeAtlas:FriendsSharedFlashlightAtlas|undefined;
const viewport=new THREE.Vector4();
const scissor=new THREE.Vector4();

function installSharedShadowShader(){
  let chunk=THREE.ShaderChunk.lights_pars_begin;
  if(chunk.includes('friendsSharedFlashlightShadow'))return;
  const start=chunk.indexOf('void getSpotLightInfo('),end=chunk.indexOf('#endif',start);
  const spot=chunk.slice(start,end).replace('light.visible = ( light.color != vec3( 0.0 ) );',`
    #if NUM_SPOT_LIGHTS >= 4
    if ( light.color != vec3( 0.0 ) && spotLight.decay < -950.49 && spotLight.decay > -950.90 ) {
      int slot=int(floor((-spotLight.decay-950.5)*8.+.5));
      light.color*=friendsSharedFlashlightShadow(slot,geometryPosition);
    }
    #endif
    light.visible = ( light.color != vec3( 0.0 ) );`);
  chunk=chunk.slice(0,start)+`
    #if NUM_SPOT_LIGHTS >= 4
    uniform sampler2DShadow friendsFlashlightAtlas[1];
    uniform mat4 friendsFlashlightShadowView[4];
    uniform vec2 friendsFlashlightTexel[1];
    float friendsSharedFlashlightShadow(int slot,vec3 position) {
      vec4 projected=friendsFlashlightShadowView[slot]*vec4(position,1.);
      vec3 q=projected.xyz/projected.w;
      vec2 lo=vec2(float(slot-2*(slot/2)),float(slot/2))*.5;
      if(projected.w<=0. || q.z>1. || q.z<0. || any(lessThan(q.xy,lo)) || any(greaterThan(q.xy,lo+vec2(.5))))return 0.;
      q.z-=.0003;
      vec2 d=friendsFlashlightTexel[0]*.75;
      // Clamp PCF taps to this tile so adjacent beams never bleed together.
      vec2 a=lo+friendsFlashlightTexel[0]*.5,b=lo+vec2(.5)-friendsFlashlightTexel[0]*.5;
      return .25*(texture(friendsFlashlightAtlas[0],vec3(clamp(q.xy+d,a,b),q.z))
        +texture(friendsFlashlightAtlas[0],vec3(clamp(q.xy-d,a,b),q.z))
        +texture(friendsFlashlightAtlas[0],vec3(clamp(q.xy+vec2(d.x,-d.y),a,b),q.z))
        +texture(friendsFlashlightAtlas[0],vec3(clamp(q.xy+vec2(-d.x,d.y),a,b),q.z)));
    }
    #endif
  `+spot+chunk.slice(end);
  THREE.ShaderChunk.lights_pars_begin=chunk;
}

/** Four depth tiles, one GPU sampler. Native shadow rendering retains terrain
 * coverage, custom depth materials, instancing and skinning. The spots do not
 * enter Three's native shadow sampler array; one requested tile is drawn after
 * the world pass, when the renderer's scene state is valid, for the next frame. */
export class FriendsSharedFlashlightAtlas {
  private target:THREE.WebGLRenderTarget;
  private matrices=Array.from({length:4},()=>new THREE.Matrix4());
  private tileMatrices=Array.from({length:4},(_,i)=>new THREE.Matrix4().set(
    .5,0,0,(i%2)*.5,0,.5,0,Math.floor(i/2)*.5,0,0,1,0,0,0,0,1));
  private pending?:{light:THREE.SpotLight;index:number;done:()=>void};
  private previousAfter:THREE.Scene['onAfterRender'];
  private after:THREE.Scene['onAfterRender'];
  private disposed=false;

  constructor(private scene:THREE.Scene,private renderer:THREE.WebGLRenderer,private tileSize:number){
    installSharedShadowShader();
    this.target=new THREE.WebGLRenderTarget(tileSize*2,tileSize*2);
    this.target.texture.name='shared-flashlight-atlas-color';
    this.target.depthTexture=new THREE.DepthTexture(tileSize*2,tileSize*2,THREE.UnsignedIntType);
    this.target.depthTexture.compareFunction=THREE.LessEqualCompare;
    this.target.depthTexture.minFilter=this.target.depthTexture.magFilter=THREE.LinearFilter;
    this.target.depthTexture.name='shared-flashlight-shadow-atlas';
    // This owned GPU resource must remain the same texture in cloned uniforms.
    const depth=this.target.depthTexture;depth.clone=()=>depth;
    this.previousAfter=scene.onAfterRender;
    this.after=(...args)=>{this.previousAfter.call(scene,...args);if(args[0]===renderer)this.renderPending(args[2]);};
    scene.onAfterRender=this.after;
    renderer.initRenderTarget?.(this.target);
    this.bindUniforms();
  }

  configure(light:THREE.SpotLight,index:number){
    light.castShadow=false;light.decay=-(950.5+index*.125);
    light.shadow.map=this.target;
    const tile=new THREE.Vector4(index%2,Math.floor(index/2),1,1);
    light.shadow.getViewport=()=>tile;
  }

  update(camera:THREE.PerspectiveCamera){
    this.bindUniforms();
    for(let i=0;i<4;i++)viewMatrix.multiplyMatrices(this.matrices[i],camera.matrixWorld).toArray(viewMatrices,i*16);
    texel.fill(1/(this.tileSize*2));
  }

  request(light:THREE.SpotLight,index:number,done:()=>void){this.pending={light,index,done};}

  private bindUniforms(){
    if(activeAtlas===this)return;activeAtlas=this;
    for(const key of ['standard','physical','lambert','phong','toon'] as const){
      const uniforms=THREE.ShaderLib[key].uniforms;
      uniforms.friendsFlashlightAtlas={value:[this.target.depthTexture]};
      uniforms.friendsFlashlightShadowView={value:viewMatrices};
      uniforms.friendsFlashlightTexel={value:texel};
    }
  }

  private renderPending(camera:THREE.Camera){
    const pending=this.pending;if(!pending || this.disposed)return;this.pending=undefined;
    const {light,index}=pending,r=this.renderer,clear=r.clear,target=r.getRenderTarget();
    r.getViewport(viewport);r.getScissor(scissor);const scissorTest=r.getScissorTest(),needsUpdate=r.shadowMap.needsUpdate;
    // Native shadows clear their target. Restrict that clear to one atlas tile.
    r.clear=(...args)=>{r.setScissor((index%2)*this.tileSize,Math.floor(index/2)*this.tileSize,this.tileSize,this.tileSize);r.setScissorTest(true);clear.apply(r,args);};
    try{
      light.shadow.needsUpdate=true;r.shadowMap.needsUpdate=true;
      r.shadowMap.render([light],this.scene,camera);
      this.matrices[index].multiplyMatrices(this.tileMatrices[index],light.shadow.matrix);
      pending.done();
    }finally{
      r.clear=clear;r.shadowMap.needsUpdate=needsUpdate;r.setRenderTarget(target);
      r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);
    }
  }

  dispose(){
    if(this.disposed)return;this.disposed=true;this.pending=undefined;
    if(this.scene.onAfterRender===this.after)this.scene.onAfterRender=this.previousAfter;
    if(activeAtlas===this)activeAtlas=undefined;
    this.target.dispose();
  }
}
