import * as THREE from 'three';

type Renderable = THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite;
type Program = { isReady(): boolean; getUniforms(): unknown; getAttributes(): unknown };
type Job = { object: Renderable; key: string; priority: number };
type Pending = { programs: Program[]; materials: Set<THREE.Material>; object: THREE.Object3D };
type Options = { initialView?: boolean };

/** Prepare dormant world materials in the real world render configuration.
 * Background work submits one object per frame. Initial-view preparation can
 * have eight batches outstanding, while bounding discovery and submission CPU
 * work. Readiness uses Three's nonblocking KHR query, never LINK_STATUS. */
export class FriendsShaderWarmup {
  private seen = new Set<string>();
  private queue: Job[] = [];
  private scanning?: { stack: THREE.Object3D[]; queued: Set<string>; jobs: Job[]; materials: Map<THREE.Material, string> };
  private pending: Pending[] = [];
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private viewLayers = new THREE.Layers();
  private layout = '';
  private scannedAt = -Infinity;
  private hasScanned = false;
  private disposed = false;
  private restored = () => { this.uploadedTextures = new WeakMap(); this.invalidate(); };
  private submitted = 0;
  private completed = 0;
  private failures = 0;
  private maxSubmitMs = 0;
  private maxReadinessMs = 0;
  private maxScanMs = 0;
  private materialStates = new WeakMap<THREE.Material, { features: string; id: number }>();
  private nextMaterialState = 0;
  private textures = new Set<THREE.Texture>();
  private uploadedTextures = new WeakMap<THREE.Texture, number>();
  private maxTextureMs = 0;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private options: Options = {}) {
    renderer.domElement.addEventListener('webglcontextrestored', this.restored);
  }

  private signature(object: Renderable, cache?: Map<THREE.Material, string>) {
    const geometry = object.geometry;
    const attributes = Object.entries(geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}`).sort().join(',');
    const morph = Object.entries(geometry.morphAttributes).map(([name, a]) => `${name}:${a?.length}`).sort().join(',');
    const instance = object as THREE.InstancedMesh, skin = object as THREE.SkinnedMesh;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const materialKeys = materials.map(material => {
      const cached = cache?.get(material); if (cached) return cached;
      const textures = Object.values(material).filter((v): v is THREE.Texture => v instanceof THREE.Texture)
        .map(t => `${t.uuid}:${t.version}:${t.channel}:${t.colorSpace}`).join(',');
      // Three increments material.version on every two-sided transparent draw
      // while switching front/back passes. Track shader features instead so
      // ordinary water/flame rendering cannot endlessly refill this queue.
      const m = material as THREE.MeshPhysicalMaterial & THREE.ShaderMaterial & THREE.PointsMaterial;
      const features = [material.type, material.side, material.transparent, material.alphaTest > 0,
        material.alphaHash, material.alphaToCoverage, m.fog, material.toneMapped,
        material.vertexColors, material.premultipliedAlpha, m.flatShading, m.normalMapType,
        m.sizeAttenuation, m.wireframe, m.clearcoat > 0, m.transmission > 0, m.sheen > 0,
        m.anisotropy > 0, m.iridescence > 0, m.dispersion > 0, m.defines,
        m.vertexShader, m.fragmentShader, material.customProgramCacheKey()];
      const state = `${JSON.stringify(features)}:${textures}`, previous = this.materialStates.get(material);
      const id = previous?.features === state ? previous.id : ++this.nextMaterialState;
      if (id !== previous?.id) this.materialStates.set(material, { features: state, id });
      const key = `${material.uuid}:${id}`; cache?.set(material, key); return key;
    }).join('|');
    return `${object.type}:${!!instance.isInstancedMesh}:${!!instance.instanceColor}:${!!skin.isSkinnedMesh}:${object.receiveShadow}:${attributes}:${morph}:${geometry.morphTargetsRelative}:${materialKeys}`;
  }

  private configuration(camera: THREE.Camera) {
    const counts: Record<string, number> = {};
    this.scene.traverseVisible(object => {
      const light = object as THREE.Light & { map?: THREE.Texture };
      if (!light.isLight || !light.layers.test(camera.layers)) return;
      counts[light.type] = (counts[light.type] || 0) + 1;
      if (light.castShadow) counts[light.type + ':shadow'] = (counts[light.type + ':shadow'] || 0) + 1;
      if (light.map) counts[light.type + ':map'] = (counts[light.type + ':map'] || 0) + 1;
    });
    const target = this.renderer.getRenderTarget();
    return JSON.stringify([Object.entries(counts).sort(), this.renderer.shadowMap.enabled, this.renderer.shadowMap.type,
      target ? target.texture.colorSpace : this.renderer.outputColorSpace, !target || !!(target as THREE.WebGLRenderTarget & { isXRRenderTarget?: boolean }).isXRRenderTarget,
      this.renderer.toneMapping, this.scene.fog?.constructor.name, this.scene.environment?.uuid,
      this.scene.environment?.version, camera.layers.mask]);
  }

  private scanStep() {
    const scan = this.scanning;
    if (!scan) return;
    const start = performance.now();
    // Discovery is also spread across frames: a large streamed scene must not
    // turn background preparation into a periodic full-scene CPU hitch.
    do {
      const object = scan.stack.pop()!;
      if (this.options.initialView && !object.visible) continue;
      for (let i = object.children.length - 1; i >= 0; i--) scan.stack.push(object.children[i]);
      const renderable = object as Renderable;
      if (!(renderable instanceof THREE.Mesh || renderable instanceof THREE.Points || renderable instanceof THREE.Line || renderable instanceof THREE.Sprite)) continue;
      if (!renderable.geometry.getAttribute('position')?.count) continue;
      if (this.options.initialView && (!renderable.layers.test(this.viewLayers) ||
        (renderable.frustumCulled && !(renderable instanceof THREE.Sprite ? this.frustum.intersectsSprite(renderable) : this.frustum.intersectsObject(renderable))))) continue;
      const key = this.signature(renderable, scan.materials);
      if (this.seen.has(key) || scan.queued.has(key)) continue;
      scan.queued.add(key);
      let priority = 2;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        if (/highfall|crown-of-highfall/.test(parent.name)) { priority = 0; break; }
        if (parent.name === 'island-monuments-and-skyfalls') priority = 1;
      }
      scan.jobs.push({ object: renderable, key, priority });
    } while (scan.stack.length && performance.now() - start < 2);
    if (!scan.stack.length) {
      this.queue = scan.jobs.filter(job => !this.seen.has(job.key)).sort((a, b) => a.priority - b.priority);
      this.scanning = undefined;
      this.hasScanned = true;
    }
    this.maxScanMs = Math.max(this.maxScanMs, performance.now() - start);
  }

  private attached(object: THREE.Object3D) {
    while (object.parent) object = object.parent;
    return object === this.scene;
  }

  /** Call only after the world HDR target has been selected, before drawing. */
  update(camera: THREE.Camera, now = performance.now()) {
    if (this.disposed || this.renderer.getContext().isContextLost()) return;
    if (!this.scanning && now - this.scannedAt >= (this.options.initialView ? 100 : 1000)) {
      const layout = this.configuration(camera);
      if (layout !== this.layout) { this.invalidate(); this.layout = layout; }
      if (this.options.initialView) {
        this.scene.updateMatrixWorld(); camera.updateMatrixWorld();
        this.viewLayers.mask = camera.layers.mask;
        this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      }
      this.scanning = { stack: [this.scene], queued: new Set(), jobs: [], materials: new Map() };
      this.scannedAt = now;
    }
    this.scanStep();
    const frameStart = performance.now();
    for (let i = 0; i < this.pending.length;) {
      const pending = this.pending[i];
      if (!this.attached(pending.object) || [...pending.materials].some(m => !this.renderer.properties.has(m))) {
        this.pending.splice(i, 1); continue;
      }
      const start = performance.now();
      try {
        if (!pending.programs.every(program => program.isReady())) { i++; continue; }
        // Material introspection is deferred until the nonblocking query says
        // the program is complete, rather than occurring on its first draw.
        for (const program of pending.programs) { program.getUniforms(); program.getAttributes(); }
        this.completed++;
      } catch { this.failures++; }
      this.maxReadinessMs = Math.max(this.maxReadinessMs, performance.now() - start);
      this.pending.splice(i, 1);
      if (this.options.initialView && performance.now() - frameStart >= 2) break;
    }
    if (this.options.initialView && this.textures.size && performance.now() - frameStart < 2) {
      const texture = this.textures.values().next().value!;
      this.textures.delete(texture);
      const start = performance.now();
      try { this.renderer.initTexture(texture); this.uploadedTextures.set(texture, texture.version); }
      catch { this.failures++; }
      this.maxTextureMs = Math.max(this.maxTextureMs, performance.now() - start);
    }
    const limit = this.options.initialView ? 8 : 1;
    let attempts = 0;
    while (this.pending.length < limit && attempts < limit &&
      (!this.options.initialView || performance.now() - frameStart < 2)) {
      const job = this.queue.shift();
      if (!job) break;
      attempts++;
      if (!this.attached(job.object) || this.signature(job.object) !== job.key) continue;
      this.seen.add(job.key);
      const start = performance.now();
      try {
        const materials = this.renderer.compile(job.object, camera, this.scene);
        this.submitted++;
        if (this.options.initialView) for (const material of materials) {
          const values = [...Object.values(material), ...Object.values((material as THREE.ShaderMaterial).uniforms || {}).flatMap(uniform => Array.isArray(uniform.value) ? uniform.value : [uniform.value])];
          for (const value of values) if (value instanceof THREE.Texture && !value.isRenderTargetTexture && this.uploadedTextures.get(value) !== value.version) this.textures.add(value);
        }
        if (this.renderer.extensions.has('KHR_parallel_shader_compile')) {
          // Same cached program/readiness API used by the installed Three.js
          // compileAsync. Poll here so disposal/context loss cannot leave its
          // uncancellable timer accessing disposed material properties.
          const programs = [...new Set([...materials].flatMap(material => {
            const properties = this.renderer.properties.get(material) as { currentProgram?: Program; programs?: Map<string, Program> };
            // Two-sided transparent materials have front AND back programs.
            // compileAsync only checks currentProgram; the unused back program
            // can still block its first draw unless it is checked as well.
            return properties.programs ? [...properties.programs.values()] : properties.currentProgram ? [properties.currentProgram] : [];
          }))];
          this.pending.push({ programs, materials, object: job.object });
        } else {
          // Issuing compilation ahead of visibility still provides driver lead
          // time. Never fall back to a blocking shader-status query.
          this.completed++;
        }
      } catch { this.failures++; }
      this.maxSubmitMs = Math.max(this.maxSubmitMs, performance.now() - start);
    }
  }

  // Rechecking an already prepared view must not reset arrival's settling
  // timer unless discovery actually finds new work.
  get ready() { return this.hasScanned && !this.scanning?.jobs.length && !this.queue.length && !this.pending.length && !this.textures.size; }
  invalidate() { this.seen.clear(); this.queue = []; this.scanning = undefined; this.pending = []; this.textures.clear(); this.scannedAt = -Infinity; this.hasScanned = false; }
  get stats() { return { submitted: this.submitted, completed: this.completed, queued: this.queue.length, scanning: !!this.scanning, pending: this.pending.length > 0, pendingCount: this.pending.length, texturesQueued: this.textures.size, failures: this.failures, maxSubmitMs: this.maxSubmitMs, maxReadinessMs: this.maxReadinessMs, maxScanMs: this.maxScanMs, maxTextureMs: this.maxTextureMs }; }
  dispose() { this.disposed = true; this.invalidate(); this.renderer.domElement.removeEventListener('webglcontextrestored', this.restored); }
}
