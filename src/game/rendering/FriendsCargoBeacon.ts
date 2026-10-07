import * as THREE from 'three';
import { cargoBounds } from '../multiplayer/FriendsCargoPose';
import type { PhysicalCargo } from '../multiplayer/FriendsHauling';

export const CARGO_BEACON_HEIGHT = 24000;

/** A single billboard quad: an objective light column occluded by world geometry. */
export class FriendsCargoBeacon extends THREE.Group {
  private readonly cameraPosition = new THREE.Vector3();
  private readonly geometry = new THREE.PlaneGeometry(1, CARGO_BEACON_HEIGHT);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#ffc36e') }, seconds: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 tint;uniform float seconds;varying vec2 vUv;
      void main(){
        float edge=pow(max(0.0,1.0-abs(vUv.x*2.0-1.0)),2.0);
        float core=pow(edge,8.0);
        float fade=smoothstep(0.0,0.001,vUv.y)*(1.0-smoothstep(0.85,1.0,vUv.y));
        float pulse=0.92+0.08*sin(seconds*1.8-vUv.y*12.0);
        gl_FragColor=vec4(mix(tint,vec3(1.0),core*0.35),fade*pulse*(edge*0.4+core*0.55));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: true, depthWrite: false, fog: false,
    toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  private readonly column = new THREE.Mesh(this.geometry, this.material);
  constructor(){
    super();this.name='cargo-location-beacon';this.column.name='cargo-light-column';
    this.column.position.y=CARGO_BEACON_HEIGHT/2;
    this.column.frustumCulled=false;this.column.renderOrder=60;this.add(this.column);
    this.column.onBeforeRender=(_renderer,_scene,camera)=>this.faceCamera(camera);
    this.visible=false;
  }
  /** Keep the column vertical and readable even at the player's high FOV. */
  faceCamera(camera:THREE.Camera){
    const p=camera.getWorldPosition(this.cameraPosition),dx=p.x-this.position.x,dz=p.z-this.position.z;
    this.column.rotation.y=Math.atan2(dx,dz);
    const apparentWidth=camera instanceof THREE.PerspectiveCamera ? 2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.035 : .05;
    this.column.scale.x=Math.max(32,Math.hypot(dx,dz)*apparentWidth);
    this.column.updateMatrixWorld(true);
  }
  update(cargo:PhysicalCargo|undefined,elapsed:number,delivered=false){
    this.visible=Boolean(cargo);if(!cargo)return;
    this.position.set(cargo.x,cargoBounds(cargo).maxZ+2,cargo.y);
    this.material.uniforms.seconds.value=elapsed/1000;
    this.material.uniforms.tint.value.set(delivered?'#a5f279':'#ffc36e');
  }
  dispose(){this.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
