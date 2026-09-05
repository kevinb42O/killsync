import { describe, expect, it, vi } from 'vitest';
import { HostSimulationClock } from './HostSimulationClock';

describe('host simulation clock', () => {
  it('recovers fixed simulation steps after a delayed render interval', () => {
    const step = vi.fn();
    const clock = new HostSimulationClock(1000 / 30, step);
    clock['lastAt'] = 1_000;
    clock.pulse(1_100);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('bounds pathological catch-up after system suspension', () => {
    const step = vi.fn();
    const clock = new HostSimulationClock(1000 / 30, step);
    clock['lastAt'] = 1_000;
    clock.pulse(60_000);
    expect(step.mock.calls.length).toBeLessThanOrEqual(8);
  });
});
