import HostClockWorker from './hostClock.worker.ts?worker';

/** The authoritative cadence is driven outside requestAnimationFrame, so a
 * hidden or slow rendering tab cannot directly pause the match clock. */
export class HostSimulationClock {
  private worker?: Worker;
  private fallbackTimer = 0;
  private lastAt = performance.now();
  private accumulator = 0;

  constructor(private readonly stepMs: number, private readonly onStep: (now: number) => void) {}

  start() {
    this.lastAt = performance.now();
    try {
      this.worker = new HostClockWorker();
      this.worker.onmessage = () => this.pulse(performance.now());
      this.worker.postMessage('start');
    } catch {
      this.fallbackTimer = window.setInterval(() => this.pulse(performance.now()), Math.max(8, this.stepMs / 2));
    }
  }

  stop() {
    this.worker?.postMessage('stop');
    this.worker?.terminate();
    this.worker = undefined;
    window.clearInterval(this.fallbackTimer);
    this.fallbackTimer = 0;
  }

  /** Public for deterministic clock tests. Catch-up is bounded to avoid a
   * resume spiral after a suspended laptop, while ordinary background timer
   * jitter is fully recovered. */
  pulse(now: number) {
    this.accumulator += Math.min(250, Math.max(0, now - this.lastAt));
    this.lastAt = now;
    let steps = 0;
    while (this.accumulator + 1e-6 >= this.stepMs && steps < 8) {
      this.accumulator -= this.stepMs;
      this.onStep(now);
      steps++;
    }
    if (steps === 8) this.accumulator = Math.min(this.accumulator, this.stepMs * 2);
  }
}
