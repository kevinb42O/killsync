import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsPointLightBudget } from './FriendsPointLightBudget';

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const visible = () => { const lights: THREE.PointLight[] = []; scene.traverseVisible(o => {
    if (o instanceof THREE.PointLight && o.layers.test(camera.layers)) lights.push(o);
  }); return lights; };
  const renderer = {render: vi.fn(visible), compile: vi.fn(visible)} as unknown as THREE.WebGLRenderer;
  const originalRender = renderer.render, originalCompile = renderer.compile;
  const budget = new FriendsPointLightBudget(renderer, scene);
  const add = (intensity: number, shadow = false) => {
    const light = new THREE.PointLight(0xffffff, intensity); light.castShadow = shadow; scene.add(light); return light;
  };
  return {scene, camera, renderer, budget, add, visible, originalRender, originalCompile};
}

describe('Friends point-light shader budget', () => {
  it('removes dormant slots, preserves active and shadow lights, and restores authored visibility', () => {
    const f = fixture(), active = f.add(100), shadow = f.add(0, true);
    const dormant = Array.from({length: 24}, () => f.add(0));
    f.budget.withLayout(f.camera, () => {
      expect(f.visible()).toHaveLength(8);
      expect(f.visible()).toContain(active); expect(f.visible()).toContain(shadow);
      expect(dormant.every(l => !l.visible)).toBe(true);
      // Nested render/compile do not count padding as authored lights.
      f.renderer.render(f.scene, f.camera); f.renderer.compile(f.scene, f.camera);
      expect(f.visible()).toHaveLength(8);
    });
    expect(dormant.every(l => l.visible)).toBe(true);
    expect(f.visible()).toHaveLength(26);
  });

  it('never drops active lights, holds the layout at boundaries, then shrinks after settling', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const f = fixture(), lights = Array.from({length: 27}, (_, i) => f.add(i < 19 ? 50 : 0));
    f.budget.withLayout(f.camera, () => {
      expect(f.visible()).toHaveLength(24);
      expect(lights.slice(0, 19).every(l => f.visible().includes(l))).toBe(true);
    });
    lights.forEach(l => l.intensity = 0);
    f.budget.withLayout(f.camera, () => expect(f.visible()).toHaveLength(24));
    lights[0].intensity = .000001;
    f.budget.withLayout(f.camera, () => expect(f.visible()).toContain(lights[0]));
    clock.mockReturnValue(4999);
    f.budget.withLayout(f.camera, () => expect(f.visible()).toHaveLength(24));
    clock.mockReturnValue(5000);
    f.budget.withLayout(f.camera, () => expect(f.visible()).toHaveLength(8));
    clock.mockRestore();
  });

  it('uses the original slot count when all lights contribute', () => {
    const f = fixture(); Array.from({length: 27}, () => f.add(50));
    f.budget.withLayout(f.camera, () => expect(f.visible()).toHaveLength(27));
  });

  it('restarts the shrink delay when a light crosses the bucket boundary again', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const f = fixture(), lights = Array.from({length: 27}, (_, i) => f.add(i < 9 ? 50 : 0));
    const count = () => f.budget.withLayout(f.camera, () => f.visible().length);
    expect(count()).toBe(16);
    lights[8].intensity = 0; expect(count()).toBe(16);
    clock.mockReturnValue(4000); lights[8].intensity = 50; expect(count()).toBe(16);
    clock.mockReturnValue(4500); lights[8].intensity = 0; expect(count()).toBe(16);
    clock.mockReturnValue(5000); expect(count()).toBe(16);
    clock.mockReturnValue(9500); expect(count()).toBe(8);
    clock.mockRestore();
  });

  it('preserves wrappers installed later and makes retained calls harmless after disposal', () => {
    const f = fixture(); Array.from({length: 27}, () => f.add(0));
    const budgetRender = f.renderer.render;
    const laterRender = vi.fn((scene: THREE.Object3D, camera: THREE.Camera) => budgetRender(scene, camera));
    f.renderer.render = laterRender;
    f.renderer.render(f.scene, f.camera);
    expect(vi.mocked(f.originalRender).mock.results[0].value).toHaveLength(8);
    f.budget.dispose();
    expect(f.renderer.render).toBe(laterRender);
    f.renderer.render(f.scene, f.camera);
    expect(vi.mocked(f.originalRender).mock.results[1].value).toHaveLength(27);
  });

  it('respects hidden ancestors and camera layers without changing author visibility', () => {
    const f = fixture(), group = new THREE.Group(); group.visible = false; f.scene.add(group);
    const hidden = f.add(100); group.add(hidden);
    const otherLayer = f.add(100); otherLayer.layers.set(2);
    const explicitHidden = f.add(0); explicitHidden.visible = false;
    f.budget.withLayout(f.camera, () => {
      expect(f.visible()).toHaveLength(0);
      expect(otherLayer.visible).toBe(true); expect(hidden.visible).toBe(true);
    });
    expect(explicitHidden.visible).toBe(false);
    f.camera.layers.set(2);
    f.budget.withLayout(f.camera, () => expect(f.visible()).toContain(otherLayer));
  });

  it('applies matching layouts to rendering and target-scene compilation only', () => {
    const f = fixture(); Array.from({length: 27}, () => f.add(0));
    const viewmodel = new THREE.Scene();
    f.renderer.render(f.scene, f.camera);
    expect(vi.mocked(f.originalRender).mock.results[0].value).toHaveLength(8);
    f.renderer.compile(viewmodel, f.camera, f.scene);
    expect(vi.mocked(f.originalCompile).mock.results[0].value).toHaveLength(8);
    f.renderer.render(viewmodel, f.camera);
    expect(vi.mocked(f.originalRender).mock.results[1].value).toHaveLength(27);
  });

  it('restores lights after exceptions and releases wrappers and padding on disposal', () => {
    const f = fixture(), light = f.add(0);
    expect(() => f.budget.withLayout(f.camera, () => { throw new Error('render failed'); })).toThrow('render failed');
    expect(light.visible).toBe(true);
    f.budget.dispose();
    expect(f.renderer.render).toBe(f.originalRender); expect(f.renderer.compile).toBe(f.originalCompile);
    expect(f.scene.children).toEqual([light]);
    f.budget.dispose();
  });
});
