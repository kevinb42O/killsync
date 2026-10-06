import type { CoopSnapshot } from './CoopSimulation';
import { CoopSnapshotInterpolator } from './snapshotInterpolation';

/** Fixed presentation delay absorbs packet and worker timing variation. The
 * entire expedition shares one clock, rather than separately extrapolating
 * its camera, walking players and moving deck. */
export class FriendsPresentationTimeline {
  private readonly frames: CoopSnapshot[] = [];
  private readonly interpolator = new CoopSnapshotInterpolator();
  private clockOffset?: number;
  private presentedElapsed = -Infinity;
  constructor(private readonly delayMs: number) {}

  push(snapshot: CoopSnapshot, receivedAt: number) {
    const latest = this.frames.at(-1);
    if (latest && snapshot.tick < latest.tick) this.reset();
    if (this.frames.at(-1)?.tick === snapshot.tick) return;
    const offset = receivedAt - snapshot.elapsedMs;
    // A late packet must not reset the animation phase. Slowly track genuine
    // clock drift while giving earlier arrivals more weight.
    this.clockOffset = this.clockOffset === undefined ? offset : this.clockOffset + (offset - this.clockOffset) * (offset < this.clockOffset ? .15 : .015);
    this.frames.push(snapshot);
    if (this.frames.length > 24) this.frames.shift();
  }

  sample(now: number): CoopSnapshot | undefined {
    if (!this.frames.length || this.clockOffset === undefined) return;
    const elapsed = Math.max(this.presentedElapsed, now - this.clockOffset - this.delayMs);
    this.presentedElapsed = elapsed;
    while (this.frames.length > 2 && this.frames[1].elapsedMs <= elapsed) this.frames.shift();
    const first = this.frames[0], last = this.frames.at(-1)!;
    if (elapsed <= first.elapsedMs) return first;
    for (let i = 1; i < this.frames.length; i++) {
      const previous = this.frames[i - 1], current = this.frames[i];
      if (elapsed <= current.elapsedMs && current.elapsedMs > previous.elapsedMs) return this.interpolator.interpolate(previous, current, (elapsed - previous.elapsedMs) / (current.elapsedMs - previous.elapsedMs));
    }
    return last;
  }
  reset() { this.frames.length = 0; this.clockOffset = undefined; this.presentedElapsed = -Infinity; this.interpolator.reset(); }
}
