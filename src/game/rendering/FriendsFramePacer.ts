import type { FriendsFrameLimit } from '../LocalGamePreferences';

/** Gate world rendering only. Input, simulation and networking still run on every callback. */
export class FriendsFramePacer {
  private lastRenderedAt: number;
  private nextFrameAt: number;
  private limit: FriendsFrameLimit = 0;
  constructor(now: number) { this.lastRenderedAt = this.nextFrameAt = now; }

  takeFrame(now: number, limit: FriendsFrameLimit): number | undefined {
    // RAF timestamps mark the start of the browser frame, which can precede
    // performance.now() captured while mounting the arena in that same frame.
    // Rebase before pacing so camera damping never receives negative time.
    if (now < this.lastRenderedAt) {
      this.lastRenderedAt = this.nextFrameAt = now;
      this.limit = limit;
      return 0;
    }
    if (limit !== this.limit) { this.limit = limit; this.nextFrameAt = now; }
    // Allow sub-millisecond RAF timestamp jitter at the target boundary.
    if (limit && now + .5 < this.nextFrameAt) return undefined;
    const elapsed = now - this.lastRenderedAt;
    this.lastRenderedAt = now;
    if (limit) {
      const interval = 1000 / limit;
      this.nextFrameAt += interval * Math.max(1, Math.floor((now - this.nextFrameAt) / interval) + 1);
      // A slow frame must not create a burst of catch-up renders.
      if (now > this.nextFrameAt - interval / 2) this.nextFrameAt = now + interval;
    }
    return elapsed;
  }
}
