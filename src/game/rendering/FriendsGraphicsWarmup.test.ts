import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FriendsGraphicsWarmup } from './FriendsGraphicsWarmup';

function fixture() {
  const gl = { isContextLost: () => false, isProgram: () => true, getProgramParameter: vi.fn(() => true) };
  const renderer = { compile: vi.fn(() => new Set<THREE.Material>()), info: { programs: [{ program: {} }] }, extensions: { get: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }) }, getContext: () => gl, initTexture: vi.fn(), getRenderTarget: () => null } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const warmup = new FriendsGraphicsWarmup(renderer), passes = [{ scene, camera }];
  return { renderer, gl, scene, material, warmup, passes };
}
async function settle(warmup: FriendsGraphicsWarmup, passes: Parameters<FriendsGraphicsWarmup['prepare']>[0]) {
  await vi.waitFor(() => { expect(warmup['compiling']).toBe(false); expect(warmup.prepare(passes)).toBe(true); });
  warmup.finishFrame();
}

describe('Friends GPU preparation', () => {
  it('waits for parallel compilation without submitting repeated work and then reuses programs', async () => {
    const { warmup, renderer, gl, passes } = fixture();
    let ready = false;const done = () => { ready = true; };
    gl.getProgramParameter.mockImplementation(() => ready);
    expect(warmup.prepare(passes)).toBe(false);
    expect(warmup.prepare(passes)).toBe(false);
    expect(renderer.compile).toHaveBeenCalledTimes(1);
    done(); await settle(warmup, passes);
    expect(renderer.compile).toHaveBeenCalledTimes(1);
    warmup.dispose();
  });
  it('uploads at most one new texture each frame and catches textures that finish loading later', async () => {
    const { warmup, renderer, material, passes } = fixture();
    const a = new THREE.DataTexture(new Uint8Array(4), 1, 1), b = a.clone();
    a.needsUpdate = true; b.needsUpdate = true;
    material.map = a; material.normalMap = b;
    warmup.prepare(passes); expect(renderer.initTexture).toHaveBeenCalledTimes(1);
    warmup.prepare(passes); expect(renderer.initTexture).toHaveBeenCalledTimes(2);
    await settle(warmup, passes);
    a.needsUpdate = true;
    warmup.prepare(passes); expect(renderer.initTexture).toHaveBeenCalledTimes(3);
    warmup.dispose();
  });
  it('does not recompile on light position/intensity changes, but prepares new light and geometry variants', async () => {
    const { warmup, renderer, scene, material, passes } = fixture();
    const light = new THREE.PointLight('white', 0); scene.add(light);
    warmup.prepare(passes); await settle(warmup, passes);
    light.intensity = 100; light.position.x = 100;
    expect(warmup.prepare(passes)).toBe(true); expect(renderer.compile).toHaveBeenCalledTimes(1);
    light.visible = false;
    expect(warmup.prepare(passes)).toBe(false); await settle(warmup, passes);
    const streamed = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2);scene.add(streamed);
    expect(warmup.prepare(passes)).toBe(true); expect(streamed.visible).toBe(false);
    expect(scene.children[0].visible).toBe(true); warmup.finishFrame();expect(streamed.visible).toBe(true);
    await settle(warmup, passes);
    expect(renderer.compile).toHaveBeenCalledTimes(3);
    warmup.dispose();
  });
  it('accepts compiler-owned material version changes instead of restarting compilation forever', async () => {
    const { warmup, renderer, material, passes } = fixture();
    vi.mocked(renderer.compile).mockImplementation(() => { material.needsUpdate = true; return new Set(); });
    warmup.prepare(passes); await settle(warmup, passes);
    expect(renderer.compile).toHaveBeenCalledTimes(1);
    material.needsUpdate = true;
    warmup.prepare(passes); await settle(warmup, passes);
    expect(renderer.compile).toHaveBeenCalledTimes(2);
    warmup.dispose();
  });
  it('recovers from rejected compilation and ignores completion after disposal', async () => {
    const { warmup, renderer, passes } = fixture();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(renderer.compile).mockImplementation(() => { throw new Error('unsupported driver'); });
    warmup.prepare(passes); await settle(warmup, passes);
    expect(warn).toHaveBeenCalledOnce();
    warmup.dispose(); expect(warmup.prepare(passes)).toBe(false);
    warn.mockRestore();
  });
  it('cancels subsequent render passes when the arena exits during preparation', async () => {
    const { warmup, renderer, gl, passes } = fixture();
    let ready = false;const done = () => { ready = true; };
    gl.getProgramParameter.mockImplementation(() => ready);
    const extra = vi.fn(async () => {});
    warmup.prepare([...passes, { scene: new THREE.Scene(), camera: passes[0].camera }], extra);
    warmup.dispose();done();
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(renderer.compile).toHaveBeenCalledOnce();expect(extra).not.toHaveBeenCalled();
  });
});
