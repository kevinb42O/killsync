import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const mesh = vi.hoisted(() => ({ positions: new Float32Array([0,0,0, 32,0,0, 0,32,0]), normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]), uv: new Float32Array([0,0, 1,0, 0,1]), groups: [{ start:0, count:3, materialIndex:0 }] }));
vi.mock('../world/FriendsIslandRuinMesh', () => ({ meshIslandRuins: vi.fn(() => mesh) }));

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage?: (event: { data: typeof mesh }) => void;
  onerror?: () => void;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { MockWorker.instances.push(this); }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('streamed immutable island masonry', () => {
  async function setup() {
    vi.resetModules(); MockWorker.instances = []; vi.stubGlobal('Worker', MockWorker);
    return (await import('./FriendsIslandMasonry')).FriendsIslandMasonry;
  }

  it('starts one worker for concurrent scenes and installs the exact boundary in separate GPU resources', async () => {
    const Masonry = await setup(), materials = [new THREE.MeshStandardMaterial()];
    const first = new Masonry(materials), second = new Masonry(materials);
    expect(MockWorker.instances).toHaveLength(1);
    expect(first.geometry.getAttribute('position')).toBeUndefined();
    const worker = MockWorker.instances[0]; worker.onmessage!({ data: mesh });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(first.geometry).not.toBe(second.geometry);
    expect(first.geometry.getAttribute('position').array).toBe(mesh.positions);
    expect(second.geometry.getAttribute('normal').array).toBe(mesh.normals);
    expect(first.geometry.groups).toEqual(mesh.groups);
    expect(first.receiveShadow && first.castShadow).toBe(true);
    const cached = new Masonry(materials);
    expect(MockWorker.instances).toHaveLength(1); expect(cached.geometry.getAttribute('position').count).toBe(3);
    first.dispose(); second.dispose(); cached.dispose();
  });

  it('does not install geometry into a scene disposed during loading', async () => {
    const Masonry = await setup(), object = new Masonry([]), geometry = object.geometry;
    object.dispose(); MockWorker.instances[0].onmessage!({ data: mesh });
    expect(object.geometry).toBe(geometry); expect(geometry.getAttribute('position')).toBeUndefined();
  });

  it('defers the exact fallback after worker failure and still respects cancellation', async () => {
    const Masonry = await setup(); vi.useFakeTimers();
    const live = new Masonry([]), closed = new Masonry([]); closed.dispose();
    const worker = MockWorker.instances[0]; worker.onerror!();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(live.geometry.getAttribute('position')).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(live.geometry.getAttribute('position').array).toBe(mesh.positions);
    expect(closed.geometry.getAttribute('position')).toBeUndefined(); live.dispose();
  });
});
