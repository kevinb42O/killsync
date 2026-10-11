import * as THREE from 'three';

/** Experimental benchmark controller; do not install in live gameplay.
 * First use of a new bucket can block the main thread compiling world shaders.
 * Three reserves shader work for every visible light, even at intensity zero.
 * Keep a small, stable point-light layout without changing authored lights or
 * their shadows. Grow in eight-slot steps; never discard a contributing light.
 * Delay shrinking for five seconds to avoid shader churn at lamp boundaries. */
export class FriendsPointLightBudget {
  enabled = true;
  private capacity = 8;
  private smallerCapacity = -1;
  private smallerSince = 0;
  private padding: THREE.PointLight[] = [];
  private depth = 0;
  private originalRender: THREE.WebGLRenderer['render'];
  private originalCompile: THREE.WebGLRenderer['compile'];
  private render: THREE.WebGLRenderer['render'];
  private compile: THREE.WebGLRenderer['compile'];

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {
    this.originalRender = renderer.render;
    this.originalCompile = renderer.compile;
    this.render = (scene, camera) => this.withLayout(camera, () => this.originalRender.call(renderer, scene, camera), scene);
    this.compile = (scene, camera, targetScene) => this.withLayout(camera,
      () => this.originalCompile.call(renderer, scene, camera, targetScene), targetScene ?? scene);
    renderer.render = this.render;
    renderer.compile = this.compile;
  }

  /** Warmup's light-layout discovery must see the same slots as rendering. */
  withLayout<T>(camera: THREE.Camera, action: () => T, scene: THREE.Object3D = this.scene): T {
    if (!this.enabled || scene !== this.scene || this.depth) return action();
    const dormant: THREE.PointLight[] = [];
    let contributing = 0, total = 0;
    this.scene.traverseVisible(object => {
      const light = object as THREE.PointLight;
      if (!light.isPointLight || light.userData.friendsLightPadding || !light.layers.test(camera.layers)) return;
      total++;
      // Keep shadow slots, including dormant ones, so existing shadow samplers
      // and cached cave maps keep their layout and activation behaviour.
      if (light.intensity === 0 && !light.castShadow) dormant.push(light);
      else contributing++;
    });
    // Do not exceed the original layout when every authored light is active.
    // Returning to an earlier bucket reuses Three's cached shader programs.
    const desired = Math.min(total, Math.ceil(contributing / 8) * 8 || Math.min(8, total));
    this.capacity = Math.min(total, Math.max(this.capacity, desired));
    if (desired < this.capacity) {
      const now = performance.now();
      if (this.smallerCapacity !== desired) { this.smallerCapacity = desired; this.smallerSince = now; }
      if (now - this.smallerSince >= 5000) this.capacity = desired;
    } else this.smallerCapacity = -1;
    const count = this.capacity - contributing;
    while (this.padding.length < count) {
      const light = new THREE.PointLight(0xffffff, 0);
      light.name = 'friends-point-light-padding';
      light.userData.friendsLightPadding = true;
      light.visible = false;
      this.padding.push(light);
      this.scene.add(light);
    }
    for (const light of dormant) light.visible = false;
    for (let i = 0; i < count; i++) {
      this.padding[i].layers.mask = camera.layers.mask;
      this.padding[i].visible = true;
    }
    this.depth++;
    try { return action(); }
    finally {
      this.depth--;
      for (const light of dormant) light.visible = true;
      for (const light of this.padding) light.visible = false;
    }
  }

  dispose() {
    if (this.renderer.render === this.render) this.renderer.render = this.originalRender;
    if (this.renderer.compile === this.compile) this.renderer.compile = this.originalCompile;
    for (const light of this.padding) light.removeFromParent();
    this.padding.length = 0;
    this.enabled = false;
  }
}
