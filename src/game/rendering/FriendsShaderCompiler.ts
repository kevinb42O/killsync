import type * as THREE from 'three';

/** Three's compileAsync polls a material's currentProgram. Streaming can
 * dispose that material while the poll is pending, leaving currentProgram
 * undefined. Poll stable WebGL handles instead, and cancel on arena exit. */
export class FriendsShaderCompiler {
  private disposed = false;
  private waits = new Set<() => void>();
  constructor(private renderer: THREE.WebGLRenderer) {}

  async compile(scene: THREE.Object3D, camera: THREE.Camera): Promise<void> {
    if (this.disposed) return;
    this.renderer.compile(scene, camera);
    const extension = this.renderer.extensions.get('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
    if (!extension) return;
    const gl = this.renderer.getContext();
    const programs = (this.renderer.info.programs || []).map(program => program.program).filter(Boolean);
    const started = performance.now();
    await new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => { clearTimeout(timer); this.waits.delete(finish); resolve(); };
      this.waits.add(finish);
      const poll = () => {
        if (this.disposed || gl.isContextLost()) { finish(); return; }
        // A deleted handle belongs to an asset that streamed out during compile.
        const ready = programs.every(program => !gl.isProgram(program) || gl.getProgramParameter(program, extension.COMPLETION_STATUS_KHR));
        if (ready || performance.now() - started > 10000) { finish(); return; }
        timer = setTimeout(poll, 10);
      };
      poll();
    });
  }

  dispose() { this.disposed = true; for (const finish of [...this.waits]) finish(); }
}
