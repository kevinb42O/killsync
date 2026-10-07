import type * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FriendsShaderCompiler } from './FriendsShaderCompiler';

afterEach(() => vi.useRealTimers());
function fixture() {
  const handle = {};
  const gl = { isContextLost: vi.fn(() => false), isProgram: vi.fn(() => true), getProgramParameter: vi.fn(() => false) };
  const renderer = {
    compile: vi.fn(), extensions: { get: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }) },
    getContext: () => gl, info: { programs: [{ program: handle }] },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, gl, compiler: new FriendsShaderCompiler(renderer), scene: {} as THREE.Scene, camera: {} as THREE.Camera };
}
describe('cancellable parallel shader preparation', () => {
  it('waits for completion without reading a mutable material-program pointer', async () => {
    vi.useFakeTimers();
    const { compiler, renderer, gl, scene, camera } = fixture();
    const done = vi.fn(); const ready = compiler.compile(scene, camera).then(done);
    // Disposal can remove the cache entry while the captured GL handle lives.
    renderer.info.programs.length = 0;
    await vi.advanceTimersByTimeAsync(20); expect(done).not.toHaveBeenCalled();
    gl.getProgramParameter.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(10); await ready; expect(done).toHaveBeenCalledOnce();
    compiler.dispose();
  });
  it('finishes safely if a streamed asset deletes its program during the poll', async () => {
    vi.useFakeTimers();
    const { compiler, gl, scene, camera } = fixture();
    const ready = compiler.compile(scene, camera);
    gl.isProgram.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(10); await ready;
    expect(vi.getTimerCount()).toBe(0); compiler.dispose();
  });
  it('cancels all pending timers on exit and stops on context loss', async () => {
    vi.useFakeTimers();
    const { compiler, scene, camera } = fixture();
    const ready = compiler.compile(scene, camera);
    compiler.dispose(); await ready; expect(vi.getTimerCount()).toBe(0);
    const second = fixture(); const lost = second.compiler.compile(second.scene, second.camera);
    second.gl.isContextLost.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(10); await lost;
    expect(vi.getTimerCount()).toBe(0); second.compiler.dispose();
  });
});
