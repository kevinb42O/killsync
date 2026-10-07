import * as THREE from 'three';
import { FriendsShaderCompiler } from './FriendsShaderCompiler';

type DrawObject = THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite;
type RenderPass = { scene: THREE.Scene; camera: THREE.Camera };

/** Prepare cold GPU resources before drawing them. Compilation polls the
 * parallel shader extension rather than waiting for linking inside render().
 * Upload one texture per animation frame so cold assets do not arrive in a
 * single blocking burst. Simulation and DOM input continue during preparation. */
export class FriendsGraphicsWarmup {
  private textures = new WeakMap<THREE.Texture, number>();
  private programs = new WeakMap<THREE.Material, { version: number; keys: Set<string> }>();
  private compiling = false;
  private disposed = false;
  private label?: HTMLDivElement;
  private presented = false;
  private hidden: THREE.Object3D[] = [];
  private compiler: FriendsShaderCompiler;

  constructor(private renderer: THREE.WebGLRenderer) { this.compiler = new FriendsShaderCompiler(renderer); }

  mount(container: HTMLElement) {
    this.label = document.createElement('div');
    this.label.setAttribute('role', 'status');
    this.label.textContent = 'Preparing island graphics…';
    this.label.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#071512;color:#b5ffe0;font:14px monospace;z-index:7;pointer-events:none';
    container.appendChild(this.label);
  }

  prepare(passes: readonly RenderPass[], extra?: () => Promise<unknown>): boolean {
    if (this.disposed) return false;
    const cold: { material: THREE.Material; key: string }[] = [];
    const maps = new Set<THREE.Texture>();
    const blocked = new Set<THREE.Object3D>();
    let visibleDraws = 0;
    for (const { scene } of passes) {
      const lights = new Map<string, number>();
      scene.traverseVisible(object => {
        if (!(object instanceof THREE.Light)) return;
        const key = `${object.type}:${Number(object.castShadow)}:${Number(Boolean((object as THREE.SpotLight).map))}`;
        lights.set(key, (lights.get(key) || 0) + 1);
      });
      const layout = [...lights].sort().map(([key, count]) => `${key}:${count}`).join('|');
      scene.traverse(object => {
        const draw = object as DrawObject;
        if (!draw.material) return;
        if (draw.visible) visibleDraws++;
        const mesh = draw as THREE.Mesh;
        const attributes = mesh.geometry?.attributes;
        const variant = [
          object.type,
          Number(Boolean((mesh as THREE.InstancedMesh).isInstancedMesh)),
          Number(Boolean((mesh as THREE.SkinnedMesh).isSkinnedMesh)),
          Number(Boolean((mesh as THREE.InstancedMesh).instanceColor)),
          Object.entries(attributes || {}).map(([name, attribute]) => `${name}:${attribute.itemSize}`).sort().join(','),
          Object.entries(mesh.geometry?.morphAttributes || {}).map(([name, targets]) => `${name}:${targets.length}`).join(','),
        ].join(':');
        for (const material of Array.isArray(draw.material) ? draw.material : [draw.material]) {
          const key = `${variant}:${layout}:${scene.fog instanceof THREE.FogExp2 ? 'exp' : scene.fog ? 'linear' : ''}:${this.renderer.getRenderTarget()?.texture.type || 0}`;
          const known = this.programs.get(material);
          if (known?.version !== material.version || !known.keys.has(key)) {
            cold.push({ material, key });
            if (draw.visible) blocked.add(draw);
          }
          const collect = (value: unknown) => {
            if (value instanceof THREE.Texture && !value.isRenderTargetTexture && value.version > 0 && this.textures.get(value) !== value.version) {
              maps.add(value);
              if (draw.visible) blocked.add(draw);
            }
          };
          for (const value of Object.values(material)) {
            collect(value);
          }
          // Alpine rock/biome maps are injected through shader uniforms.
          for (const value of Object.values(material.userData)) {
            collect(value);
          }
          if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) {
            const value = uniform.value;
            collect(value);
          }
        }
      });
    }
    const texture = maps.values().next().value as THREE.Texture | undefined;
    if (texture) {
      // Render-target textures are allocated by their own pass, not initTexture.
      if (!texture.isRenderTargetTexture) {
        try { this.renderer.initTexture(texture); }
        catch (error) { console.warn('Island texture preparation failed', error); }
      }
      this.textures.set(texture, texture.version);
    }
    if (cold.length && !this.compiling) {
      this.compiling = true;
      void (async () => {
        // A material can be shared between passes. Wait for each variant before
        // another compile changes Three's current-program pointer for it.
        for (const { scene, camera } of passes) {
          if (this.disposed) return;
          await this.compiler.compile(scene, camera);
        }
        if (!this.disposed && !this.presented && extra) await extra();
      })().catch(error => {
        // Failed preparation must not strand the player behind a loading screen.
        console.warn('Island shader preparation failed', error);
      }).then(() => {
        if (this.disposed) return;
        for (const { material, key } of cold) {
          let known = this.programs.get(material);
          if (!known || known.version !== material.version) this.programs.set(material, known = { version: material.version, keys: new Set() });
          known.keys.add(key);
        }
        this.compiling = false;
      });
    }
    const ready = !this.compiling && !cold.length && maps.size <= Number(Boolean(texture));
    if (ready) {
      this.presented = true;
      this.label?.remove();
      this.label = undefined;
    }
    if (this.presented && blocked.size < visibleDraws) {
      // Streamed props/tools can prepare in the background while the existing
      // world and camera continue drawing. Restore visibility after all passes.
      for (const object of blocked) { object.visible = false; this.hidden.push(object); }
      return true;
    }
    return ready;
  }

  finishFrame() { for (const object of this.hidden) object.visible = true; this.hidden.length = 0; }
  dispose() { this.disposed = true; this.compiler.dispose(); this.finishFrame(); this.label?.remove(); this.label = undefined; }
}
