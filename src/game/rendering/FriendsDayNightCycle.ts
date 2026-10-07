import * as THREE from 'three';
import { sampleFrontierDayNight, type FrontierDayNightSample } from '../world/FriendsDayNight';
import { updateFrontierSunShadow } from './FriendsSunShadow';

export type FrontierCelestialLighting = {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  fill: THREE.HemisphereLight;
  cameraKey?: THREE.DirectionalLight;
  rim?: THREE.DirectionalLight;
};

const color = (hex: number) => new THREE.Color(hex);
const palette = {
  horizon: [color(0x172b49), color(0xc6dcd3), color(0xd28d7c)],
  zenith: [color(0x071224), color(0x77b4df), color(0x304c7b)],
  sun: [color(0xffa15d), color(0xffe6c4)],
  ambient: [color(0x809fc5), color(0xe1f4e5)],
  ground: [color(0x35435a), color(0x778361)],
  clouds: [color(0x435579), color(0xf5efda), color(0xe9a280)],
};

/** A single sky draw and shared uniforms for every exterior shader. The
 * atmosphere lives outside cave classification; real roofs provide occlusion. */
export class FriendsDayNightCycle {
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly moon = new THREE.DirectionalLight(0xa3c6ff, .24);
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  readonly surfaceTint = { value: new THREE.Color() };
  readonly cloudColor = { value: new THREE.Color() };
  readonly lightDirection = { value: new THREE.Vector3() };
  readonly lightColor = { value: new THREE.Color() };
  readonly daylight = { value: 1 };
  readonly directStrength = { value: 1 };
  state: FrontierDayNightSample = sampleFrontierDayNight(0);
  private originalBackground: THREE.Scene['background'];
  private background = new THREE.Color();
  private lastShadowMs = -Infinity;
  private previousMoonShadow = false;
  private focus = new THREE.Vector3();
  private sunDirection = new THREE.Vector3();
  private moonDirection = new THREE.Vector3();
  private moonColor = color(0xa3c6ff);
  private shadowDirection = new THREE.Vector3();
  private shadowFocus = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer,
    private camera: THREE.PerspectiveCamera, private lights: FrontierCelestialLighting) {
    this.originalBackground = scene.background; scene.background = this.background;
    this.moon.name = 'frontier-moonlight';
    // Keep one shadow slot and one map for the entire orbit. Changing the
    // number of shadow lights at the horizon recompiles every lit material.
    lights.sun.castShadow = true;
    this.moon.castShadow = false;
    scene.add(this.moon, this.moon.target);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(80000, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        horizon: { value: this.horizon }, zenith: { value: this.zenith },
        sunDirection: { value: this.sunDirection }, moonDirection: { value: this.moonDirection },
        sunColor: { value: new THREE.Color() }, daylight: this.daylight,
        twilight: { value: 0 }, stars: { value: 0 }, time: { value: 0 },
      },
      vertexShader: `varying vec3 skyDirection;
        void main(){skyDirection=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
      fragmentShader: `varying vec3 skyDirection;
        uniform vec3 horizon,zenith,sunDirection,moonDirection,sunColor;
        uniform float daylight,twilight,stars,time;
        float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        void main(){
          vec3 d=normalize(skyDirection);float h=max(0.,d.y);
          vec3 c=mix(horizon,zenith,pow(h,.42));
          float solar=clamp(dot(d,sunDirection),-1.,1.);
          float sunUp=smoothstep(-.035,.025,sunDirection.y);
          float nearSun=pow(max(0.,solar),8.);
          float warmHorizon=exp(-abs(d.y)*6.)*nearSun*twilight;
          c+=vec3(.65,.14,.045)*warmHorizon;
          c+=sunColor*(pow(max(0.,solar),64.)*.14+pow(max(0.,solar),800.)*.32)*sunUp;
          float disc=smoothstep(cos(.009),cos(.007),solar)*sunUp;
          c+=sunColor*disc*4.;
          // Hash the two face coordinates, never a dominant coordinate rounded
          // near +/-340. Integrate small stars over the pixel footprint so
          // camera motion cannot make pinpoints pop on and off between pixels.
          vec3 ad=abs(d);vec2 faceUv;float face;
          if(ad.x>=ad.y&&ad.x>=ad.z){faceUv=d.yz/ad.x;face=d.x>0.?0.:1.;}
          else if(ad.y>=ad.z){faceUv=d.xz/ad.y;face=d.y>0.?2.:3.;}
          else{faceUv=d.xy/ad.z;face=d.z>0.?4.:5.;}
          vec2 p=faceUv*340.;vec3 cell=vec3(floor(p),face);float seed=hash(cell);
          vec2 centre=cell.xy+vec2(.3+.4*hash(cell+1.),.3+.4*hash(cell+3.));
          vec2 delta=p-centre,footprint=fwidth(p);
          float variance=.0064+dot(footprint,footprint)/12.;
          float stellar=exp(-dot(delta,delta)/(2.*variance))*(.0064/variance)*step(.986,seed);
          stellar*=1.-smoothstep(.96,1.,max(abs(faceUv.x),abs(faceUv.y)));
          float twinkle=.85+.15*sin(time*.45+seed*350.);
          vec3 starColor=mix(vec3(.55,.73,1.),vec3(1.,.85,.62),hash(cell+11.));
          float galaxy=pow(max(0.,1.-abs(dot(d,normalize(vec3(.25,.8,.48))))),26.);
          float grain=hash(floor(d*220.));
          c+=(starColor*stellar*twinkle*.9+vec3(.012,.016,.028)*galaxy*(.4+.6*grain))*stars*smoothstep(-.02,.15,d.y);
          float lunar=dot(d,moonDirection);
          float moonDisc=smoothstep(cos(.014),cos(.0125),lunar)*smoothstep(-.025,.025,moonDirection.y);
          vec3 right=normalize(cross(vec3(0.,1.,0.),moonDirection));vec3 up=cross(moonDirection,right);
          vec2 uv=vec2(dot(d,right),dot(d,up))/.014;
          vec3 normal=vec3(uv,sqrt(max(0.,1.-dot(uv,uv))));
          float shade=max(.12,dot(normal,normalize(vec3(.25,.2,1.))));
          float craters=.82+.18*hash(vec3(floor(uv*18.),2.));
          c=mix(c,vec3(.72,.82,1.)*shade*craters*.9,moonDisc);
          c+=vec3(.07,.11,.2)*pow(max(0.,lunar),350.)*stars;
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.sky.name = 'frontier-day-night-sky'; this.sky.renderOrder = -1000; this.sky.frustumCulled = false;
    scene.add(this.sky); this.update(0);
  }
  update(elapsedMs: number, frameMs = elapsedMs) {
    const state = this.state = sampleFrontierDayNight(elapsedMs);
    const d = state.daylight, t = state.twilight;
    this.horizon.copy(palette.horizon[0]).lerp(palette.horizon[1], d).lerp(palette.horizon[2], t * .65);
    this.zenith.copy(palette.zenith[0]).lerp(palette.zenith[1], d).lerp(palette.zenith[2], t * .55);
    this.background.copy(this.horizon); this.sky.position.copy(this.camera.position);
    this.sunDirection.fromArray(state.sunDirection).normalize(); this.moonDirection.fromArray(state.moonDirection).normalize();
    const u = this.sky.material.uniforms;
    u.sunColor.value.copy(palette.sun[0]).lerp(palette.sun[1], THREE.MathUtils.smoothstep(this.sunDirection.y, 0, .55));
    u.twilight.value = t; u.stars.value = state.stars; u.time.value = frameMs / 1000;
    this.daylight.value = d;
    this.lights.ambient.color.copy(palette.ambient[0]).lerp(palette.ambient[1], d);
    this.lights.ambient.intensity = state.ambientIntensity;
    this.lights.fill.color.copy(palette.ambient[0]).lerp(palette.zenith[1], d);
    this.lights.fill.groundColor.copy(palette.ground[0]).lerp(palette.ground[1], d);
    this.lights.fill.intensity = state.fillIntensity;
    if (this.lights.cameraKey) this.lights.cameraKey.intensity = .018 + .082 * d;
    if (this.lights.rim) this.lights.rim.intensity = .025 + .175 * d;
    this.renderer.toneMappingExposure = state.exposure;
    // Custom unlit assets need the same illumination as the standard materials.
    this.surfaceTint.value.setRGB(.085 + .915 * d, .12 + .88 * d, .19 + .81 * d);
    this.cloudColor.value.copy(palette.clouds[0]).lerp(palette.clouds[1], d).lerp(palette.clouds[2], t * .65);
    const moonDominant = state.moonIntensity > state.sunIntensity;
    this.lightDirection.value.copy(moonDominant ? this.moonDirection : this.sunDirection);
    this.lightColor.value.copy(moonDominant ? this.moonColor : u.sunColor.value);
    this.directStrength.value = moonDominant ? state.moonIntensity / 1.85 : state.sunIntensity / 1.85;
    this.focus.copy(this.camera.position); this.focus.y -= 30;
    // The primary slot follows the dominant body; the unshadowed secondary
    // preserves the other body's contribution through twilight. Directions,
    // colours and intensities are uniforms, so this needs no shader variants
    // or second shadow-map allocation at sunset.
    this.lights.sun.color.copy(this.lightColor.value);
    this.lights.sun.intensity = moonDominant ? state.moonIntensity : state.sunIntensity;
    this.moon.color.copy(moonDominant ? u.sunColor.value : this.moonColor);
    this.moon.intensity = moonDominant ? state.sunIntensity : state.moonIntensity;
    this.lights.sun.shadow.intensity = this.lights.sun.intensity > .01 ? 1 : 0;
    updateFrontierSunShadow(this.lights.sun, this.focus, this.lightDirection.value);
    updateFrontierSunShadow(this.moon, this.focus, moonDominant ? this.sunDirection : this.moonDirection);
    // One map updates at the existing 10 Hz cadence, independent of frame rate.
    if (frameMs - this.lastShadowMs >= 100 || frameMs < this.lastShadowMs || moonDominant !== this.previousMoonShadow
      || this.shadowDirection.distanceToSquared(this.lightDirection.value) > .0001 || this.shadowFocus.distanceToSquared(this.focus) > 256 * 256) {
      this.renderer.shadowMap.needsUpdate = true; this.lastShadowMs = frameMs;
      this.shadowDirection.copy(this.lightDirection.value);this.shadowFocus.copy(this.focus);
    }
    this.previousMoonShadow = moonDominant;
  }
  dispose() {
    this.sky.geometry.dispose(); this.sky.material.dispose(); this.sky.removeFromParent();
    this.moon.shadow.dispose(); this.moon.removeFromParent(); this.moon.target.removeFromParent();
    if (this.scene.background === this.background) this.scene.background = this.originalBackground;
  }
}
