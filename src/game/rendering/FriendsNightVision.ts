import * as THREE from 'three';

/** Local goggles: infrared illumination and an HDR phosphor pass. Nothing is
 * enabled or allocated on the GPU until the player explicitly equips them. */
export class FriendsNightVision {
  private enabled = false;
  private blend = 0;
  private time = 0;
  private infrared = new THREE.SpotLight(0xffffff, 1_200_000, 4800, 1.32, .65, 2);
  private fill = new THREE.PointLight(0xffffff, 9_000, 900, 2);
  private target = new THREE.Object3D();
  private forward = new THREE.Vector3();
  private size = new THREE.Vector2();
  private buffer?: THREE.WebGLRenderTarget;
  private previousTarget: THREE.WebGLRenderTarget | null = null;
  private pass = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      image: { value: null }, blend: { value: 0 }, time: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      uniform sampler2D image;
      uniform float blend;
      uniform float time;
      uniform vec2 resolution;
      varying vec2 vUv;
      float nvgLuminance(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
      float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 source = texture2D(image, vUv).rgb;
        vec3 natural = source;
        #ifdef TONE_MAPPING
          natural = toneMapping(natural);
        #endif
        // Compress lamps and crystals while lifting faint reflected light.
        // Neighbour samples give only highlights a soft phosphor halo.
        vec2 texel = 2. / resolution;
        float halo = nvgLuminance(texture2D(image, vUv + vec2(texel.x, 0.)).rgb
          + texture2D(image, vUv - vec2(texel.x, 0.)).rgb
          + texture2D(image, vUv + vec2(0., texel.y)).rgb
          + texture2D(image, vUv - vec2(0., texel.y)).rgb) * .25;
        float energy = max(0., nvgLuminance(source));
        float signal = pow(energy / (energy + .6), .45);
        signal += (1. - exp(-halo * .5)) * .045;
        float noise = (grain(floor(vUv * resolution) + floor(time * 30.)) - .5) * .018;
        float scan = sin(vUv.y * resolution.y * 3.14159) * .004;
        signal = clamp(signal + noise + scan, 0., 1.);
        vec3 phosphor = mix(vec3(.003, .013, .007), vec3(.20, .78, .31), signal);
        phosphor = mix(phosphor, vec3(.65, .97, .70), smoothstep(.82, 1., signal) * .35);
        vec2 p = vUv * 2. - 1.;
        // Two overlapping, wide eyepieces preserve a generous exploration FOV.
        float lens = min(length((p - vec2(.20, 0.)) / vec2(.90, 1.12)),
                         length((p + vec2(.20, 0.)) / vec2(.90, 1.12)));
        float rim = smoothstep(.83, 1.02, lens);
        phosphor *= 1. - rim * .96;
        phosphor += vec3(.012, .033, .016) * exp(-abs(lens - .96) * 95.);
        gl_FragColor = vec4(mix(natural, phosphor, blend), 1.);
        #include <colorspace_fragment>
      }`,
  });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor(scene: THREE.Scene) {
    this.infrared.name = 'night-vision-infrared';
    this.fill.name = 'night-vision-near-fill';
    this.infrared.visible = this.fill.visible = false;
    this.infrared.target = this.target;
    this.infrared.castShadow = true;
    this.infrared.shadow.mapSize.set(512, 512);
    this.infrared.shadow.camera.near = 2;
    this.infrared.shadow.bias = -.0003;
    this.infrared.shadow.normalBias = .6;
    scene.add(this.infrared, this.fill, this.target);
    this.quad.frustumCulled = false;
    this.pass.add(this.quad);
  }

  get equipped() { return this.enabled; }
  toggle() { return this.enabled = !this.enabled; }

  /** Run after camera movement, before the world and hand passes. */
  beginFrame(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, deltaMs: number, available = true) {
    const dt = Math.max(0, Math.min(deltaMs, 100)) / 1000;
    this.time += dt;
    const active = this.enabled && available;
    this.blend = available ? THREE.MathUtils.damp(this.blend, active ? 1 : 0, active ? 10 : 16, dt) : 0;
    if (this.blend < .001) this.blend = 0;
    this.infrared.visible = this.fill.visible = this.blend > 0;
    if (!this.blend) return false;

    camera.getWorldDirection(this.forward);
    this.infrared.position.copy(camera.position);
    this.fill.position.copy(camera.position);
    this.target.position.copy(camera.position).addScaledVector(this.forward, 4800);
    this.infrared.intensity = 1_200_000 * this.blend;
    this.fill.intensity = 9_000 * this.blend;
    renderer.shadowMap.needsUpdate = true;
    renderer.getDrawingBufferSize(this.size);
    if (!this.buffer) {
      this.buffer = new THREE.WebGLRenderTarget(this.size.x, this.size.y, {
        type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        // Preserve anti-aliasing on the sharp rock silhouettes inside goggles.
        samples: 2,
      });
      this.buffer.texture.name = 'night-vision-hdr';
      this.material.uniforms.image.value = this.buffer.texture;
    } else if (this.buffer.width !== this.size.x || this.buffer.height !== this.size.y) {
      this.buffer.setSize(this.size.x, this.size.y);
    }
    this.material.uniforms.resolution.value.copy(this.size);
    this.material.uniforms.blend.value = this.blend;
    this.material.uniforms.time.value = this.time;
    this.previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.buffer);
    return true;
  }

  endFrame(renderer: THREE.WebGLRenderer) {
    if (!this.blend) return;
    renderer.setRenderTarget(this.previousTarget);
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.render(this.pass, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.infrared.shadow.dispose();
    this.infrared.removeFromParent(); this.fill.removeFromParent(); this.target.removeFromParent();
    this.buffer?.dispose(); this.quad.geometry.dispose(); this.material.dispose();
  }
}
