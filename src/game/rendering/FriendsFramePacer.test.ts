import { describe, expect, it } from 'vitest';
import { FriendsFramePacer } from './FriendsFramePacer';

describe('Friends render pacing', () => {
  it.each([60, 120, 144])('paces 30 FPS on a %i Hz display and carries the elapsed animation time', refresh => {
    const pacer = new FriendsFramePacer(0), times: number[] = [], deltas: number[] = [];
    for (let i = 1; i <= refresh * 10; i++) {
      const now = i * 1000 / refresh, elapsed = pacer.takeFrame(now, 30);
      if (elapsed !== undefined) { times.push(now); deltas.push(elapsed); }
    }
    expect(times.length).toBeGreaterThanOrEqual(299); expect(times.length).toBeLessThanOrEqual(301);
    expect(deltas.reduce((sum, n) => sum + n, 0)).toBeCloseTo(times.at(-1)!);
  });
  it('does not skip callbacks on devices already below the limit or render catch-up bursts after a stall', () => {
    const pacer = new FriendsFramePacer(0);
    for (let now = 50; now <= 500; now += 50) expect(pacer.takeFrame(now, 30)).toBe(50);
    expect(pacer.takeFrame(1500, 30)).toBe(1000);
    expect(pacer.takeFrame(1516, 30)).toBeUndefined();
    expect(pacer.takeFrame(1534, 30)).toBe(34);
  });
  it.each([0, 30, 60, 120] as const)('rebases a first RAF timestamp older than arena mount with limit %i', limit => {
    const pacer = new FriendsFramePacer(1000);
    expect(pacer.takeFrame(500, limit)).toBe(0);
    expect(pacer.takeFrame(517, limit)).toBe(17);
    expect(pacer.takeFrame(534, 0)).toBe(17);
  });
  it('changes the limit immediately and resumes every callback when unlimited', () => {
    const pacer = new FriendsFramePacer(0);
    expect(pacer.takeFrame(16, 30)).toBe(16);
    expect(pacer.takeFrame(25, 30)).toBeUndefined();
    expect(pacer.takeFrame(26, 60)).toBe(10);
    expect(pacer.takeFrame(27, 0)).toBe(1); expect(pacer.takeFrame(28, 0)).toBe(1);
  });
});
