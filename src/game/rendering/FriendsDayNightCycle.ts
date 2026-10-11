import * as THREE from 'three';
import { sampleFrontierDayNight, type FrontierDayNightSample } from '../world/FriendsDayNight';
import { updateFrontierSunShadow } from './FriendsSunShadow';
import { FriendsSunShadowCache } from './FriendsSunShadowCache';
import { createNightNebulaTexture, NIGHT_SKY_GLSL, updateNightMeteor } from './FriendsNightSky';
import { FriendsStarField } from './FriendsStarField';

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

/** One atmosphere draw, one random star batch and shared exterior uniforms. The
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
  private shadowCache: FriendsSunShadowCache;
  private nebulaTexture = createNightNebulaTexture();
  private starField: FriendsStarField;
  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer,
    private camera: THREE.PerspectiveCamera, private lights: FrontierCelestialLighting) {
    this.originalBackground = scene.background; scene.background = this.background;
    this.moon.name = 'frontier-moonlight';
    // Keep one shadow slot and one map for the entire orbit. Changing the
    // number of shadow lights at the horizon recompiles every lit material.
    lights.sun.castShadow = true;
    this.shadowCache = new FriendsSunShadowCache(scene,renderer,lights.sun);
    this.moon.castShadow = false;
    scene.add(this.moon, this.moon.target);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(80000, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        horizon: { value: this.horizon }, zenith: { value: this.zenith },
        sunDirection: { value: this.sunDirection }, moonDirection: { value: this.moonDirection },
        sunColor: { value: new THREE.Color() }, daylight: this.daylight,
        twilight: { value: 0 }, stars: { value: 0 }, time: { value: 0 },
        meteorHead: { value: new THREE.Vector3() }, meteorTail: { value: new THREE.Vector3() },
        meteorStrength: { value: 0 },
        nebulaMap: { value: this.nebulaTexture },
      },
      vertexShader: `varying vec3 skyDirection;
        void main(){skyDirection=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
      fragmentShader: `varying vec3 skyDirection;
        uniform vec3 horizon,zenith,sunDirection,moonDirection,sunColor;
        uniform float daylight,twilight,stars,time;
        ${NIGHT_SKY_GLSL}
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
          vec3 skyAir=c;
          float skyPixel=length(fwidth(d));
          if(stars>0.001) c=nightSky(c,d,skyPixel);
          float lunar=dot(d,moonDirection);
          float moonUp=smoothstep(-.025,.025,moonDirection.y);
          if(lunar>.9997&&moonUp>0.){
            vec3 right=normalize(cross(vec3(0.,1.,0.),moonDirection));vec3 up=cross(moonDirection,right);
            vec2 uv=vec2(dot(d,right),dot(d,up))/.014;
            float r=length(uv),aa=max(skyPixel/.014,.002);
            if(r<1.+aa){
              vec3 normal=vec3(uv,sqrt(max(0.,1.-r*r)));
              vec3 light=normalize(vec3(dot(sunDirection,right),dot(sunDirection,up),-dot(sunDirection,moonDirection)));
              float detailLod=max(0.,log2(max(1.,aa*128.)));
              float rock=textureLod(nebulaMap,uv*.38+vec2(.32,.57),detailLod).r;
              float maria=smoothstep(.43,.65,textureLod(nebulaMap,uv*.12+vec2(.14,.23),detailLod).r);
              float relief=lunarCrater(uv,vec2(-.34,.32),.17)+lunarCrater(uv,vec2(.40,-.26),.12)
                +lunarCrater(uv,vec2(.18,.54),.09)+lunarCrater(uv,vec2(-.18,-.55),.13);
              float shade=.16+.84*max(0.,dot(normal,light));
              vec3 surface=vec3(.58,.65,.76)*shade*(.85+.15*rock-maria*.17+relief);
              float transmission=exp(-.075/max(moonDirection.y,.06));
              c=mix(c,mix(skyAir,surface,transmission),(1.-smoothstep(1.-aa*.5,1.+aa*.5,r))*moonUp);
            }
          }
          c+=vec3(.027,.046,.083)*pow(max(0.,lunar),500.)*stars*moonUp;
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.sky.name = 'frontier-day-night-sky'; this.sky.renderOrder = -1000; this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.starField = new FriendsStarField(scene, this.sky.material.uniforms as { stars: THREE.IUniform; time: THREE.IUniform; moonDirection: THREE.IUniform });
    this.update(0);
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
    u.meteorStrength.value = state.stars > .001
      ? updateNightMeteor(frameMs / 1000, u.meteorHead.value, u.meteorTail.value) : 0;
    this.starField.update(this.camera, this.renderer, state.stars > .001);
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
    this.shadowCache.dispose();
    this.nebulaTexture.dispose();
    this.starField.dispose();
    this.sky.geometry.dispose(); this.sky.material.dispose(); this.sky.removeFromParent();
    this.moon.shadow.dispose(); this.moon.removeFromParent(); this.moon.target.removeFromParent();
    if (this.scene.background === this.background) this.scene.background = this.originalBackground;
  }
}
