import { friendsWaterWaveShader, friendsWaterWaveUniforms } from './FriendsWaterWaves';
import * as THREE from 'three';

/** Heights of the actual near-plane corners, including camera roll and view offsets. */
export function waterlineViewHeights(camera:THREE.Camera,level:number,out=new THREE.Vector3()){
  camera.updateMatrixWorld(true);
  const bottomLeft=new THREE.Vector3(-1,-1,-1).unproject(camera);
  const bottomRight=new THREE.Vector3(1,-1,-1).unproject(camera);
  const topLeft=new THREE.Vector3(-1,1,-1).unproject(camera);
  return out.set(bottomLeft.y-level,bottomRight.y-bottomLeft.y,topLeft.y-bottomLeft.y);
}
export function waterlineViewRange(heights:THREE.Vector3){
  const corners=[heights.x,heights.x+heights.y,heights.x+heights.z,heights.x+heights.y+heights.z];
  return {min:Math.min(...corners),max:Math.max(...corners)};
}

/** Two scene passes only while the lens intersects water. Composite linear HDR
 * images before tone mapping, with a one-pixel antialiased surface boundary. */
export class FriendsWaterlineComposite{
  private dry?:THREE.WebGLRenderTarget;
  private wet?:THREE.WebGLRenderTarget;
  private size=new THREE.Vector2();
  private scene=new THREE.Scene();
  private camera=new THREE.Camera();
  private material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{dry:{value:null},wet:{value:null},heights:{value:new THREE.Vector3()},inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},waves:{value:0},
      time:{value:0},wavePatch:{value:0},waveAmplitude:{value:0},ocean:{value:0},patchHalfExtent:{value:4096},shorebreakStrength:{value:0},bathymetry:{value:new THREE.DataTexture(new Float32Array([1000]),1,1,THREE.RedFormat,THREE.FloatType)},waterOrigin:{value:new THREE.Vector2()},waterExtent:{value:new THREE.Vector2(1,1)},patchCentre:{value:new THREE.Vector2()}},
    vertexShader:'varying vec2 screenUv;void main(){screenUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 screenUv;uniform sampler2D dry,wet;uniform vec3 heights;uniform mat4 inverseProjection,cameraWorld;uniform float waves;
      ${friendsWaterWaveUniforms}
      ${friendsWaterWaveShader}
      void main(){
        float height=heights.x+screenUv.x*heights.y+screenUv.y*heights.z;
        if(waves>.5){
          vec4 point=inverseProjection*vec4(screenUv*2.-1.,-1.,1.);
          vec3 world=(cameraWorld*vec4(point.xyz/point.w,1.)).xyz;
          height-=friendsWaterWaveHeight(world.xz,world.y-height);
        }
        float width=max(fwidth(height),.00001);
        float submerged=1.-smoothstep(-width*.5,width*.5,height);
        gl_FragColor=mix(texture2D(dry,screenUv),texture2D(wet,screenUv),submerged);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  private fallbackTexture=this.material.uniforms.bathymetry.value as THREE.DataTexture;
  private geometry=new THREE.BufferGeometry();
  constructor(){
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.material.uniforms.bathymetry.value.needsUpdate=true;
    const mesh=new THREE.Mesh(this.geometry,this.material);mesh.frustumCulled=false;this.scene.add(mesh);
  }
  render(renderer:THREE.WebGLRenderer,heights:THREE.Vector3,drawDry:()=>void,drawWet:()=>void,camera:THREE.Camera,waterMaterial?:THREE.ShaderMaterial){
    const target=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    if(target)this.size.set(target.width,target.height);else renderer.getDrawingBufferSize(this.size);
    if(!this.dry){
      const options={type:THREE.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)};
      this.dry=new THREE.WebGLRenderTarget(this.size.x,this.size.y,options);this.wet=this.dry.clone();
      this.material.uniforms.dry.value=this.dry.texture;this.material.uniforms.wet.value=this.wet.texture;
    }
    this.dry.setSize(this.size.x,this.size.y);this.wet!.setSize(this.size.x,this.size.y);
    const uniforms=this.material.uniforms;
    uniforms.heights.value.copy(heights);uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.waves.value=waterMaterial?1:0;
    if(waterMaterial)for(const name of ['time','wavePatch','waveAmplitude','ocean','patchHalfExtent','shorebreakStrength','bathymetry','waterOrigin','waterExtent','patchCentre'])uniforms[name].value=waterMaterial.uniforms[name].value;
    try{
      renderer.autoClear=true;
      renderer.setRenderTarget(this.dry);drawDry();
      renderer.setRenderTarget(this.wet!);drawWet();
      renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      renderer.render(this.scene,this.camera);
    }finally{
      renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;
    }
  }
  dispose(){this.dry?.dispose();this.wet?.dispose();this.geometry.dispose();this.material.dispose();this.fallbackTexture.dispose();}
}
