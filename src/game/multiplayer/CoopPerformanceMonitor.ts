export interface CoopRenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  batchedEnemies: number;
  enemyBatches: number;
  enemyCount: number;
}

type MemoryPerformance = Performance & { memory?: { usedJSHeapSize: number } };

/** Development-only, opt-in co-op telemetry. Enable with `?coopPerf=1`. */
export class CoopPerformanceMonitor {
  private readonly element: HTMLPreElement;
  private sampleStartedAt = performance.now();
  private frames = 0;
  private frameTotalMs = 0;
  private frameMaxMs = 0;
  private renderTotalMs = 0;
  private simulationTotalMs = 0;
  private snapshotTotalMs = 0;
  private simulationSamples = 0;

  static mount(container: HTMLElement): CoopPerformanceMonitor | undefined {
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get('coopPerf') !== '1') return undefined;
    return new CoopPerformanceMonitor(container);
  }

  private constructor(container: HTMLElement) {
    this.element = document.createElement('pre');
    this.element.dataset.coopPerformance = 'true';
    Object.assign(this.element.style, {
      position: 'absolute', top: '8px', right: '8px', zIndex: '100', margin: '0', padding: '8px 10px',
      color: '#a5f3fc', background: 'rgba(2, 8, 18, .86)', border: '1px solid rgba(103, 232, 249, .35)',
      font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', pointerEvents: 'none', whiteSpace: 'pre',
    });
    container.appendChild(this.element);
  }

  recordFrame(frameMs: number, renderMs: number, stats: CoopRenderStats) {
    this.frames++; this.frameTotalMs += frameMs; this.frameMaxMs = Math.max(this.frameMaxMs, frameMs); this.renderTotalMs += renderMs;
    const now = performance.now(), duration = now - this.sampleStartedAt;
    if (duration < 500) return;
    const heap = (performance as MemoryPerformance).memory?.usedJSHeapSize;
    const simulation = this.simulationSamples ? this.simulationTotalMs / this.simulationSamples : 0;
    const snapshot = this.simulationSamples ? this.snapshotTotalMs / this.simulationSamples : 0;
    this.element.textContent = [
      `FPS ${(this.frames * 1000 / duration).toFixed(1)}  frame ${(this.frameTotalMs / this.frames).toFixed(1)} ms  max ${this.frameMaxMs.toFixed(1)} ms`,
      `render ${(this.renderTotalMs / this.frames).toFixed(1)} ms  sim ${simulation.toFixed(2)} ms  snapshot ${snapshot.toFixed(2)} ms`,
      `draws ${stats.drawCalls}  tris ${formatCount(stats.triangles)}  enemies ${stats.enemyCount}`,
      `batched ${stats.batchedEnemies} in ${stats.enemyBatches} draws`,
      `geometry ${stats.geometries}  textures ${stats.textures}${heap === undefined ? '' : `  heap ${(heap / 1048576).toFixed(1)} MB`}`,
    ].join('\n');
    this.sampleStartedAt = now; this.frames = 0; this.frameTotalMs = 0; this.frameMaxMs = 0; this.renderTotalMs = 0;
    this.simulationTotalMs = 0; this.snapshotTotalMs = 0; this.simulationSamples = 0;
  }

  recordHostWork(simulationMs: number, snapshotMs: number) {
    this.simulationTotalMs += simulationMs; this.snapshotTotalMs += snapshotMs; this.simulationSamples++;
  }

  destroy() { this.element.remove(); }
}

function formatCount(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : value >= 1_000 ? `${(value / 1_000).toFixed(0)}k` : String(value);
}
