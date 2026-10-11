import * as THREE from 'three';

export const FRONTIER_STAR_COUNT = 11000;

/** Independent samples on the sphere, with no cells, rows, tiles or lattice.
 * A fixed integer seed makes the sky identical on every client. */
export function createFrontierStarCatalog(count = FRONTIER_STAR_COUNT) {
  let seed = 0x761acf23;
  const random = () => {
    seed += 0x6d2b79f5;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const positions = new Float32Array(count * 3), appearance = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2, radius = Math.sqrt(1 - y * y);
    positions.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3);
    // Placement, brightness, radius, color and twinkle phase use independent
    // random values; selecting bright stars cannot reveal a placement pattern.
    appearance.set([.30 + 1.35 * Math.pow(random(), 4), .00011 + .00024 * Math.pow(random(), 2), random(), random()], i * 4);
  }
  return { positions, appearance };
}

/** One small point batch replaces full-screen procedural star hashing. World
 * depth and later cloud draws occlude it; celestial masks preserve the discs. */
export class FriendsStarField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private viewport = new THREE.Vector2(1, 1);
  private rotation = new THREE.Matrix3();
  private projection = new THREE.Vector2();
  constructor(scene: THREE.Scene, uniforms: { stars: THREE.IUniform; time: THREE.IUniform; moonDirection: THREE.IUniform }) {
    const catalog = createFrontierStarCatalog(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(catalog.positions, 3));
    geometry.setAttribute('appearance', new THREE.BufferAttribute(catalog.appearance, 4));
    const material = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false,
      uniforms: { stars: uniforms.stars, time: uniforms.time, moonDirection: uniforms.moonDirection,
        viewport: { value: this.viewport }, skyRotation: { value: this.rotation }, skyProjection: { value: this.projection } },
      vertexShader: /* glsl */ `
        uniform float stars,time;uniform vec2 viewport;
        attribute vec4 appearance;
        varying vec3 starColor;varying float sigma,pointWidth,energy;
        void main(){
          vec4 p=projectionMatrix*modelViewMatrix*vec4(position*80000.,1.);
          gl_Position=p.xyww;
          float angularPixels=appearance.y*projectionMatrix[1][1]*viewport.y*.5;
          sigma=sqrt(angularPixels*angularPixels+.22);
          pointWidth=ceil(sigma*6.);gl_PointSize=pointWidth;
          energy=(angularPixels*angularPixels)/(sigma*sigma);
          float twinkle=.93+.07*sin(time*(.28+appearance.w*.23)+appearance.w*6.2831853);
          starColor=mix(vec3(.68,.80,1.),vec3(1.,.87,.70),appearance.z)*appearance.x*twinkle*stars;
          starColor*=smoothstep(.015,.22,position.y);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec2 viewport,skyProjection;uniform mat3 skyRotation;
        uniform vec3 moonDirection;uniform float stars;
        varying vec3 starColor;varying float sigma,pointWidth,energy;
        float globeTransmission(vec3 d,vec3 direction,float radius,float pixel){
          if(dot(d,direction)<.998) return 1.;
          float r=length(cross(d,direction));
          return 1.-(1.-smoothstep(radius-pixel*.5,radius+pixel*.5,r))*stars;
        }
        void main(){
          vec2 offset=(gl_PointCoord-.5)*pointWidth;
          float profile=exp(-dot(offset,offset)/(2.*sigma*sigma))*energy;
          if(profile<.0005) discard;
          vec2 ndc=gl_FragCoord.xy/viewport*2.-1.;
          vec3 d=normalize(skyRotation*vec3(ndc/skyProjection,-1.));
          float pixel=2./(viewport.y*skyProjection.y);
          float transmission=globeTransmission(d,normalize(vec3(-.62,.48,-.62)),.018,pixel)
            *globeTransmission(d,normalize(vec3(.76,.38,-.52)),.009,pixel)
            *globeTransmission(d,normalize(vec3(-.35,.30,.89)),.005,pixel);
          float moonUp=smoothstep(-.025,.025,moonDirection.y);
          if(dot(d,moonDirection)>.9997){
            float r=length(cross(d,moonDirection));
            transmission*=1.-(1.-smoothstep(.014-pixel*.5,.014+pixel*.5,r))*moonUp;
          }
          // The rings remain translucent to background starlight. This is
          // the same tilted plane, division and opacity used by the sky pass.
          vec3 direction=normalize(vec3(-.62,.48,-.62));
          if(dot(d,direction)>.998){
            vec3 right=normalize(cross(vec3(0.,1.,0.),direction)),up=cross(direction,right);
            vec2 uv=vec2(dot(d,right),dot(d,up))/.018;
            vec3 n=normalize(vec3(-.25,.86,.44));
            float r=length(vec3(uv,-dot(n.xy,uv)/n.z));
            float aa=pixel/(.018*n.z);
            float inner=smoothstep(1.28-aa*.5,1.35+aa*.5,r);
            float outer=1.-smoothstep(2.38-aa*.5,2.48+aa*.5,r);
            float gap=(r-1.91)/max(.045,aa*.5);
            float division=1.-.86*exp(-gap*gap);
            float fine=sin(r*72.)*exp(-aa*aa*72.*72.*.20);
            float broad=.5+.5*sin(r*12.+.8);
            transmission*=1.-inner*outer*division*(.76+.12*broad+.018*fine)*stars;
          }
          if(transmission<.001) discard;
          gl_FragColor=vec4(starColor,min(1.,profile*4.)*transmission);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'frontier-random-stars'; this.points.frustumCulled = false;
    // Night vision can render into a smaller target than the canvas. Sprite
    // footprints and disc masks must use the actual target and render camera.
    this.points.onBeforeRender = (renderer, _scene, camera) => this.syncView(camera, renderer);
    this.points.renderOrder = -999; scene.add(this.points);
  }
  private syncView(camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
    this.rotation.setFromMatrix4(camera.matrixWorld);
    this.projection.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    const target = renderer.getRenderTarget?.();
    if (target) this.viewport.set(target.width, target.height);
    else renderer.getDrawingBufferSize?.(this.viewport);
  }
  update(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, visible: boolean) {
    this.points.visible = visible;
    if (!visible) return;
    this.points.position.copy(camera.position);
    camera.updateMatrixWorld();
    this.syncView(camera, renderer);
  }
  dispose() { this.points.geometry.dispose(); this.points.material.dispose(); this.points.removeFromParent(); }
}
