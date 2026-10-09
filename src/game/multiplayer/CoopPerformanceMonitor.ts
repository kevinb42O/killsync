export interface CoopRenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  campfireDrawCalls?: number;
  forestDrawCalls?: number;
  visibleForestTrees?: number;
  batchedEnemies: number;
  enemyBatches: number;
  enemyCount: number;
}

type MemoryPerformance = Performance & { memory?: { usedJSHeapSize: number } };

/** Co-op telemetry. Press `=` to show or hide it. */
export class CoopPerformanceMonitor {
  private readonly element: HTMLPreElement;
  private visible: boolean;
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || (event.key !== '=' && (event.code !== 'Equal' || event.shiftKey))
      || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.visible = !this.visible;
    this.element.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.resetSample(performance.now());
  };
  private sampleStartedAt = performance.now();
  private frames = 0;
  private frameTotalMs = 0;
  private frameMaxMs = 0;
  private peakDrawCalls = 0;
  private renderTotalMs = 0;
  private simulationTotalMs = 0;
  private snapshotTotalMs = 0;
  private simulationSamples = 0;

  static mount(container: HTMLElement): CoopPerformanceMonitor {
    return new CoopPerformanceMonitor(container);
  }

  private constructor(container: HTMLElement) {
    this.visible = new URLSearchParams(window.location.search).get('coopPerf') === '1';
    this.element = document.createElement('pre');
    this.element.dataset.coopPerformance = 'true';
    Object.assign(this.element.style, {
      position: 'absolute', top: '8px', right: '8px', zIndex: '100', margin: '0', padding: '8px 10px',
      color: '#a5f3fc', background: 'rgba(2, 8, 18, .86)', border: '1px solid rgba(103, 232, 249, .35)',
      font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', pointerEvents: 'none', whiteSpace: 'pre',
      display: this.visible ? 'block' : 'none',
    });
    container.appendChild(this.element);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  get isVisible() { return this.visible; }

  recordFrame(frameMs: number, renderMs: number, stats: CoopRenderStats) {
    this.frames++; this.frameTotalMs += frameMs; this.frameMaxMs = Math.max(this.frameMaxMs, frameMs); this.renderTotalMs += renderMs;
    this.peakDrawCalls = Math.max(this.peakDrawCalls, stats.drawCalls);
    const now = performance.now(), duration = now - this.sampleStartedAt;
    if (duration < 500) return;
    const heap = (performance as MemoryPerformance).memory?.usedJSHeapSize;
    const simulation = this.simulationSamples ? this.simulationTotalMs / this.simulationSamples : 0;
    const snapshot = this.simulationSamples ? this.snapshotTotalMs / this.simulationSamples : 0;
    this.element.textContent = [
      `FPS ${(this.frames * 1000 / duration).toFixed(1)}  frame ${(this.frameTotalMs / this.frames).toFixed(1)} ms  max ${this.frameMaxMs.toFixed(1)} ms`,
      `render ${(this.renderTotalMs / this.frames).toFixed(1)} ms  sim ${simulation.toFixed(2)} ms  snapshot ${snapshot.toFixed(2)} ms`,
      `draws ${stats.drawCalls} (peak ${this.peakDrawCalls})  tris ${formatCount(stats.triangles)}  enemies ${stats.enemyCount}`,
      `batched ${stats.batchedEnemies} in ${stats.enemyBatches} draws`,
      `campfire ${stats.campfireDrawCalls ?? 0} draws  forest ${stats.forestDrawCalls ?? 0} draws / ${stats.visibleForestTrees ?? 0} trees`,
      `geometry ${stats.geometries}  textures ${stats.textures}${heap === undefined ? '' : `  heap ${(heap / 1048576).toFixed(1)} MB`}`,
    ].join('\n');
    this.resetSample(now);
  }

  private resetSample(now: number) {
    this.sampleStartedAt = now; this.frames = 0; this.frameTotalMs = 0; this.frameMaxMs = 0; this.peakDrawCalls = 0; this.renderTotalMs = 0;
    this.simulationTotalMs = 0; this.snapshotTotalMs = 0; this.simulationSamples = 0;
  }

  recordHostWork(simulationMs: number, snapshotMs: number) {
    this.simulationTotalMs += simulationMs; this.snapshotTotalMs += snapshotMs; this.simulationSamples++;
  }

  destroy() { window.removeEventListener('keydown', this.handleKeyDown); this.element.remove(); }
}

function formatCount(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : value >= 1_000 ? `${(value / 1_000).toFixed(0)}k` : String(value);
}
