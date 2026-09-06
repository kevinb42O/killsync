import { describe, expect, it } from 'vitest';
import { buildThreatIndicators } from './OffscreenThreatIndicators';

describe('buildThreatIndicators', () => {
  it('hides enemies inside the first-person view and groups a crowd by direction', () => {
    const indicators = buildThreatIndicators({
      facingAngle: 0,
      width: 1280,
      height: 720,
      threats: [
        { dx: 500, dy: 0, dist: 500, type: 'basic' },
        { dx: -300, dy: 10, dist: 300, type: 'basic' },
        { dx: -330, dy: -12, dist: 330, type: 'fast' },
      ],
    });
    expect(indicators).toHaveLength(1);
    expect(indicators[0].count).toBe(2);
    expect(indicators[0].screenY).toBeGreaterThan(360);
  });

  it('caps cues, keeps bosses at any distance, and ignores distant fodder', () => {
    const indicators = buildThreatIndicators({
      facingAngle: 0,
      width: 1000,
      height: 700,
      maxIndicators: 2,
      threats: [
        { dx: -2500, dy: 0, dist: 2500, type: 'titan', color: '#f00' },
        { dx: 0, dy: 2500, dist: 2500, type: 'basic' },
        { dx: 0, dy: -500, dist: 500, type: 'fast' },
        { dx: -400, dy: 400, dist: 566, type: 'basic' },
      ],
    });
    expect(indicators).toHaveLength(2);
    expect(indicators.some(indicator => indicator.boss)).toBe(true);
  });

  it('uses exact top-down offscreen flags', () => {
    const indicators = buildThreatIndicators({
      facingAngle: 0,
      width: 800,
      height: 600,
      perspective: false,
      threats: [
        { dx: 50, dy: 0, dist: 50, type: 'basic', offscreen: false },
        { dx: 900, dy: 0, dist: 900, type: 'basic', offscreen: true },
      ],
    });
    expect(indicators).toHaveLength(1);
    expect(indicators[0].screenX).toBeGreaterThan(400);
  });
});
