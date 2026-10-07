import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsNightVision } from './FriendsNightVision';

function setup() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const goggles = new FriendsNightVision(scene);
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let width = 1280, height = 720;
  const renderer = {
    autoClear: false, toneMappingExposure: .9,
    shadowMap: { needsUpdate: false },
    getDrawingBufferSize: (size: THREE.Vector2) => size.set(width, height),
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => { currentTarget = target; }),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const infrared = scene.getObjectByName('night-vision-infrared') as THREE.SpotLight;
  const fill = scene.getObjectByName('night-vision-near-fill') as THREE.PointLight;
  return { goggles, camera, renderer, infrared, fill, resize: () => { width = 1920; height = 1080; } };
}

describe('Friends night vision goggles', () => {
  it('leaves a fresh session dark and incurs no render pass until explicitly toggled', () => {
    const { goggles, camera, renderer, infrared, fill } = setup();
    expect(goggles.equipped).toBe(false);
    for (let i = 0; i < 60; i++) expect(goggles.beginFrame(renderer, camera, 16)).toBe(false);
    expect(infrared.visible).toBe(false); expect(fill.visible).toBe(false);
    expect(renderer.setRenderTarget).not.toHaveBeenCalled();
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    expect(goggles.toggle()).toBe(true);
    expect(goggles.beginFrame(renderer, camera, 16)).toBe(true);
    expect(infrared.visible).toBe(true); expect(fill.visible).toBe(true);
    goggles.endFrame(renderer);
    expect(goggles.toggle()).toBe(false);
    for (let i = 0; i < 60; i++) {
      if (goggles.beginFrame(renderer, camera, 16)) goggles.endFrame(renderer);
    }
    expect(goggles.beginFrame(renderer, camera, 16)).toBe(false);
    expect(infrared.visible).toBe(false); expect(fill.visible).toBe(false);
    expect(renderer.getRenderTarget()).toBeNull();
    goggles.dispose();
  });

  it('tracks camera aim, preserves renderer state, and resizes the HDR buffer', () => {
    const { goggles, camera, renderer, infrared, resize } = setup();
    const originalTarget = new THREE.WebGLRenderTarget(100, 100);
    renderer.setRenderTarget(originalTarget);
    camera.position.set(12000, -150, 5000); camera.lookAt(12500, 0, 4600);
    goggles.toggle(); goggles.beginFrame(renderer, camera, 100);
    const buffer = renderer.getRenderTarget()!;
    expect(buffer.width).toBe(1280); expect(buffer.height).toBe(720);
    expect(infrared.position.equals(camera.position)).toBe(true);
    expect(infrared.target.position.clone().sub(camera.position).normalize()
      .dot(camera.getWorldDirection(new THREE.Vector3()))).toBeCloseTo(1);
    goggles.endFrame(renderer);
    expect(renderer.getRenderTarget()).toBe(originalTarget);
    expect(renderer.autoClear).toBe(false); expect(renderer.toneMappingExposure).toBe(.9);
    resize(); goggles.beginFrame(renderer, camera, 16);
    expect(renderer.getRenderTarget()).toBe(buffer);
    expect(buffer.width).toBe(1920); expect(buffer.height).toBe(1080);
    goggles.endFrame(renderer);
    const released = vi.fn(); buffer.addEventListener('dispose', released);
    goggles.dispose(); expect(released).toHaveBeenCalled();
    expect(infrared.parent).toBeNull(); expect(infrared.target.parent).toBeNull();
    originalTarget.dispose();
  });

  it('suspends infrared when spectating and resumes only if already equipped', () => {
    const { goggles, camera, renderer, infrared } = setup();
    goggles.toggle(); goggles.beginFrame(renderer, camera, 100); goggles.endFrame(renderer);
    expect(goggles.beginFrame(renderer, camera, 16, false)).toBe(false);
    expect(infrared.visible).toBe(false); expect(goggles.equipped).toBe(true);
    expect(goggles.beginFrame(renderer, camera, 16, true)).toBe(true);
    goggles.endFrame(renderer);
    goggles.toggle(); goggles.beginFrame(renderer, camera, 16, false);
    expect(goggles.beginFrame(renderer, camera, 16, true)).toBe(false);
    goggles.dispose();
  });
});
