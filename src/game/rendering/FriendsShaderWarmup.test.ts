import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsShaderWarmup } from './FriendsShaderWarmup';

type MockProgram = { isReady: ReturnType<typeof vi.fn>; getUniforms: ReturnType<typeof vi.fn>; getAttributes: ReturnType<typeof vi.fn> };

function fixture(parallel = true, initialView = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const programs = new Map<THREE.Material, MockProgram>();
  const ready = { value: false }, target = { value: new THREE.WebGLRenderTarget(4, 4) as THREE.WebGLRenderTarget | null };
  const extraPrograms = new Map<THREE.Material, MockProgram>();
  const compile = vi.fn((object: THREE.Mesh) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) programs.set(material, {
      isReady: vi.fn(() => ready.value), getUniforms: vi.fn(), getAttributes: vi.fn(),
    });
    return new Set(materials);
  });
  const renderer = {
    domElement: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    getContext: () => ({ isContextLost: () => false }), getRenderTarget: () => target.value,
    extensions: { has: () => parallel }, properties: { has: (m: THREE.Material) => programs.has(m), get: (m: THREE.Material) => {
      const variants = new Map<string, MockProgram>();
      if (programs.has(m)) variants.set('front', programs.get(m)!);
      if (extraPrograms.has(m)) variants.set('back', extraPrograms.get(m)!);
      return { currentProgram: programs.get(m), programs: variants };
    } },
    shadowMap: { enabled: true, type: THREE.PCFShadowMap }, toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace, compile, initTexture:vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const add = (name: string) => {
    const mesh = new THREE.Mesh<THREE.BoxGeometry, THREE.Material>(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = name; scene.add(mesh); return mesh;
  };
  const warmup = new FriendsShaderWarmup(renderer, scene, {initialView});
  return { scene, camera, programs, extraPrograms, ready, target, renderer, compile, add, warmup };
}

describe('background world shader preparation', () => {
  it('spreads scene discovery across frames before submitting a sorted batch', () => {
    const f = fixture(); f.ready.value = true;
    for (let i = 0; i < 12; i++) f.add('ordinary-' + i);
    const castle = f.add('crown-of-highfall-standard');
    let clock = 0;
    const timer = vi.spyOn(performance, 'now').mockImplementation(() => clock++);
    try {
      f.warmup.update(f.camera, 0);
      expect(f.warmup.stats.scanning).toBe(true); expect(f.compile).not.toHaveBeenCalled();
      for (let frame = 1; frame < 40 && f.warmup.stats.scanning; frame++) f.warmup.update(f.camera, frame * 16);
      expect(f.warmup.stats.scanning).toBe(false);
      expect(f.compile.mock.calls[0][0]).toBe(castle);
    } finally { timer.mockRestore(); f.warmup.dispose(); }
  });

  it('prepares dormant castle materials first without changing scene visibility or parentage', () => {
    const f = fixture(); f.add('ordinary'); const castle = f.add('crown-of-highfall-standard'); castle.visible = false;
    f.warmup.update(f.camera, 0);
    expect(f.compile).toHaveBeenCalledExactlyOnceWith(castle, f.camera, f.scene);
    expect(castle.visible).toBe(false); expect(castle.parent).toBe(f.scene);
    expect(f.renderer.getRenderTarget()).toBe(f.target.value);
    f.warmup.dispose();
  });

  it('bounds submissions and never performs first-use introspection before the nonblocking readiness check passes', () => {
    const f = fixture(); const first = f.add('first'); const second = f.add('second');
    f.warmup.update(f.camera, 0);
    const program = f.programs.get(first.material as THREE.Material)!;
    for (let frame = 1; frame < 20; frame++) f.warmup.update(f.camera, frame * 16);
    expect(f.compile).toHaveBeenCalledTimes(1);
    expect(program.getUniforms).not.toHaveBeenCalled(); expect(program.getAttributes).not.toHaveBeenCalled();
    f.ready.value = true; f.warmup.update(f.camera, 320);
    expect(program.getUniforms).toHaveBeenCalledOnce(); expect(program.getAttributes).toHaveBeenCalledOnce();
    expect(f.compile).toHaveBeenCalledTimes(2); expect(f.compile.mock.calls[1][0]).toBe(second);
    f.warmup.update(f.camera, 336); f.warmup.update(f.camera, 1000);
    expect(f.compile).toHaveBeenCalledTimes(2);
    f.warmup.dispose();
  });

  it('discovers delayed assets and changes to material textures, and drops removed objects', () => {
    const f = fixture(); f.ready.value = true; const first = f.add('first'); const removed = f.add('removed');
    f.warmup.update(f.camera, 0); removed.removeFromParent();
    f.warmup.update(f.camera, 16); expect(f.compile).toHaveBeenCalledTimes(1);
    const late = f.add('late'); f.warmup.update(f.camera, 1000);
    expect(f.compile.mock.calls[1][0]).toBe(late);
    const texture = new THREE.Texture(); (first.material as THREE.MeshStandardMaterial).map = texture;
    f.warmup.update(f.camera, 2000); expect(f.compile.mock.calls[2][0]).toBe(first);
    texture.needsUpdate = true; f.warmup.update(f.camera, 3000);
    expect(f.compile).toHaveBeenCalledTimes(4);
    f.warmup.dispose();
  });

  it('reprepares after shader layout changes, but ignores light position and intensity changes', () => {
    const f = fixture(); f.ready.value = true; f.add('first');
    const light = new THREE.PointLight(); f.scene.add(light);
    f.warmup.update(f.camera, 0); f.warmup.update(f.camera, 16);
    light.position.set(10, 20, 30); light.intensity = 0;
    f.warmup.update(f.camera, 1000); expect(f.compile).toHaveBeenCalledTimes(1);
    light.castShadow = true; f.warmup.update(f.camera, 2000); expect(f.compile).toHaveBeenCalledTimes(2);
    f.target.value = null; f.warmup.update(f.camera, 3000); expect(f.compile).toHaveBeenCalledTimes(3);
    f.warmup.dispose();
  });

  it('ignores incidental two-sided draw versions but notices shader feature changes', () => {
    const f = fixture(); f.ready.value = true;
    const mesh = f.add('water'), material = mesh.material as THREE.MeshStandardMaterial;
    material.transparent = true; material.side = THREE.DoubleSide;
    f.warmup.update(f.camera, 0); f.warmup.update(f.camera, 16);
    material.side = THREE.BackSide; material.needsUpdate = true;
    material.side = THREE.FrontSide; material.needsUpdate = true; material.side = THREE.DoubleSide;
    f.warmup.update(f.camera, 1000); expect(f.compile).toHaveBeenCalledTimes(1);
    material.vertexColors = true; material.needsUpdate = true;
    f.warmup.update(f.camera, 2000); expect(f.compile).toHaveBeenCalledTimes(2);
    f.warmup.dispose();
  });

  it('never polls a disposed program or uses blocking introspection without the parallel extension', () => {
    const f = fixture(); const mesh = f.add('first'); f.warmup.update(f.camera, 0);
    const program = f.programs.get(mesh.material as THREE.Material)!;
    f.warmup.dispose(); f.warmup.update(f.camera, 16);
    expect(program.isReady).not.toHaveBeenCalled(); expect(program.getUniforms).not.toHaveBeenCalled();
    const fallback = fixture(false); const fallbackMesh = fallback.add('fallback'); fallback.warmup.update(fallback.camera, 0);
    expect(fallback.programs.get(fallbackMesh.material as THREE.Material)!.getUniforms).not.toHaveBeenCalled();
    expect(fallback.warmup.stats.completed).toBe(1); fallback.warmup.dispose();
  });

  it('waits for and prepares both front and back programs of transparent materials', () => {
    const f = fixture(); f.ready.value = true; const mesh = f.add('water');
    const back = { isReady: vi.fn(() => false), getUniforms: vi.fn(), getAttributes: vi.fn() };
    f.extraPrograms.set(mesh.material as THREE.Material, back);
    f.warmup.update(f.camera, 0); f.warmup.update(f.camera, 16);
    expect(back.isReady).toHaveBeenCalledOnce(); expect(back.getUniforms).not.toHaveBeenCalled();
    back.isReady.mockReturnValue(true); f.warmup.update(f.camera, 32);
    expect(back.getUniforms).toHaveBeenCalledOnce(); expect(back.getAttributes).toHaveBeenCalledOnce();
    f.warmup.dispose();
  });

  it('abandons a pending object removed from the scene before querying its programs', () => {
    const f = fixture(), mesh = f.add('temporary'); f.warmup.update(f.camera, 0);
    const program = f.programs.get(mesh.material as THREE.Material)!;
    mesh.removeFromParent(); f.warmup.update(f.camera, 16);
    expect(program.isReady).not.toHaveBeenCalled(); expect(f.warmup.stats.pending).toBe(false);
    f.warmup.dispose();
  });
});

describe('initial spawn shader preparation', () => {
  it('keeps a prepared view ready during a time-sliced rescan with no new material work', () => {
    const f=fixture(true,true);f.ready.value=true;
    const first=f.add('spawn');first.position.z=-10;
    const timer=vi.spyOn(performance,'now').mockReturnValue(0);
    try{
      f.warmup.update(f.camera,0);f.warmup.update(f.camera,16);expect(f.warmup.ready).toBe(true);
      for(let i=0;i<20;i++){const mesh=f.add('same-program-'+i);mesh.position.z=-10;mesh.material=first.material;}
      let clock=0;timer.mockImplementation(()=>clock++);
      f.warmup.update(f.camera,100);
      expect(f.warmup.stats.scanning).toBe(true);expect(f.warmup.ready).toBe(true);
      f.warmup.invalidate();expect(f.warmup.ready).toBe(false);
    }finally{timer.mockRestore();f.warmup.dispose();}
  });

  it('only prepares visible camera layers and frustum, preserving hidden subtrees', () => {
    const f = fixture(true, true);
    const visible = f.add('spawn'); visible.position.z = -10;
    const outside = f.add('distant'); outside.position.x = 5000;
    const dormant = f.add('crown-of-highfall'); dormant.visible = false;
    const child = f.add('hidden-child'), parent = new THREE.Group();
    f.scene.add(parent); parent.add(child); parent.visible = false;
    const otherLayer = f.add('other-layer'); otherLayer.layers.set(2);
    const alwaysDrawn = f.add('sky'); alwaysDrawn.position.x = 5000; alwaysDrawn.frustumCulled = false;
    const timer = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      f.warmup.update(f.camera, 0);
      expect(f.compile.mock.calls.map(call => call[0])).toEqual([visible, alwaysDrawn]);
      expect(parent.visible).toBe(false); expect(child.parent).toBe(parent);
      expect(f.warmup.ready).toBe(false);
      f.ready.value = true; f.warmup.update(f.camera, 16);
      expect(f.warmup.ready).toBe(true);
    } finally { timer.mockRestore(); f.warmup.dispose(); }
  });

  it('bounds concurrent batches and can finish ready batches while another is compiling', () => {
    const f = fixture(true, true);
    const meshes = Array.from({length: 17}, (_, i) => {const mesh=f.add('spawn-'+i);mesh.position.z=-10;return mesh;});
    const timer = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      f.warmup.update(f.camera, 0);
      expect(f.compile).toHaveBeenCalledTimes(8); expect(f.warmup.stats.pendingCount).toBe(8);
      f.warmup.update(f.camera, 16); expect(f.compile).toHaveBeenCalledTimes(8);
      const waiting = f.programs.get(meshes[0].material as THREE.Material)!;
      const finished = f.programs.get(meshes[1].material as THREE.Material)!;
      finished.isReady.mockReturnValue(true); f.warmup.update(f.camera, 32);
      expect(waiting.getUniforms).not.toHaveBeenCalled(); expect(finished.getUniforms).toHaveBeenCalledOnce();
      expect(f.compile).toHaveBeenCalledTimes(9); expect(f.warmup.stats.pendingCount).toBe(8);
      f.ready.value = true;
      for(let frame=3;frame<9;frame++)f.warmup.update(f.camera,frame*16);
      expect(f.warmup.ready).toBe(true); expect(f.compile).toHaveBeenCalledTimes(17);
    } finally { timer.mockRestore(); f.warmup.dispose(); }
  });

  it('stages one shared texture per update, includes shader uniforms and revisits changed images', () => {
    const f=fixture(true,true);f.ready.value=true;
    const texture=new THREE.Texture(),uniformTexture=new THREE.Texture(),target=new THREE.WebGLRenderTarget(4,4);
    const mesh=f.add('mapped');mesh.position.z=-10;(mesh.material as THREE.MeshStandardMaterial).map=texture;
    const custom=f.add('custom');custom.position.z=-10;
    custom.material=new THREE.ShaderMaterial({uniforms:{maps:{value:[texture,uniformTexture,target.texture]}}});
    const timer=vi.spyOn(performance,'now').mockReturnValue(0);
    try{
      f.warmup.update(f.camera,0);f.warmup.update(f.camera,16);
      expect(f.renderer.initTexture).toHaveBeenCalledExactlyOnceWith(texture);expect(f.warmup.ready).toBe(false);
      f.warmup.update(f.camera,32);expect(f.renderer.initTexture).toHaveBeenCalledTimes(2);
      expect(f.renderer.initTexture).toHaveBeenLastCalledWith(uniformTexture);expect(f.warmup.ready).toBe(true);
      texture.needsUpdate=true;f.warmup.update(f.camera,100);f.warmup.update(f.camera,116);
      expect(f.renderer.initTexture).toHaveBeenCalledTimes(3);expect(f.renderer.initTexture).toHaveBeenLastCalledWith(texture);
      const restored=vi.mocked(f.renderer.domElement.addEventListener).mock.calls[0][1] as EventListener;
      restored(new Event('webglcontextrestored'));expect(f.warmup.ready).toBe(false);
      f.warmup.update(f.camera,132);f.warmup.update(f.camera,148);f.warmup.update(f.camera,164);
      expect(f.renderer.initTexture).toHaveBeenCalledTimes(5);expect(f.warmup.ready).toBe(true);
    }finally{timer.mockRestore();f.warmup.dispose();target.dispose();}
  });

  it('discovers streamed meshes and camera changes before reveal, then cancels pending work on dispose', () => {
    const f = fixture(true, true); f.ready.value = true;
    const first=f.add('spawn');first.position.z=-10;
    const laterView=f.add('new-view');laterView.position.set(5000,0,-10);
    const timer = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      f.warmup.update(f.camera,0);f.warmup.update(f.camera,16);expect(f.warmup.ready).toBe(true);
      f.camera.position.x=5000; f.ready.value=false;
      f.warmup.update(f.camera,100);expect(f.compile.mock.calls[1][0]).toBe(laterView);expect(f.warmup.ready).toBe(false);
      const program=f.programs.get(laterView.material as THREE.Material)!;
      f.warmup.dispose();f.warmup.update(f.camera,116);
      expect(program.isReady).not.toHaveBeenCalled();expect(program.getUniforms).not.toHaveBeenCalled();
    } finally { timer.mockRestore(); f.warmup.dispose(); }
  });
});
