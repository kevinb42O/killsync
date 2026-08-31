import { describe, expect, it, beforeEach } from 'vitest';
import type { Projectile } from '../types';
import { beamIntersectsCircle, compressVisualRadius, getProjectileVisualId, resetProjectileVisualIdsForTest, sanitizeProjectileRadius } from './projectilePresentation';

function projectile(id: string): Projectile {
  return {
    id,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 12,
    health: 1,
    maxHealth: 1,
    color: '#fff',
    damage: 1,
    duration: 100,
    ownerId: 'player',
    penetration: 1,
  };
}

describe('projectile presentation identity', () => {
  beforeEach(resetProjectileVisualIdsForTest);

  it('keeps one stable visual identity per gameplay instance', () => {
    const echo = projectile('echo');
    expect(getProjectileVisualId(echo)).toBe('echo:vfx-1');
    expect(getProjectileVisualId(echo)).toBe('echo:vfx-1');
  });

  it('does not merge simultaneous projectiles that share a gameplay class id', () => {
    expect(getProjectileVisualId(projectile('tendril'))).toBe('tendril:vfx-1');
    expect(getProjectileVisualId(projectile('tendril'))).toBe('tendril:vfx-2');
  });

  it('preserves legitimate area growth while guarding invalid radii', () => {
    expect(sanitizeProjectileRadius(360)).toBe(360);
    expect(sanitizeProjectileRadius(Infinity)).toBe(12);
  });

  it('compresses only oversized visual effects, never gameplay radius', () => {
    expect(compressVisualRadius(12, 18, 30)).toBe(12);
    const compressed = compressVisualRadius(360, 80, 130);
    expect(compressed).toBeGreaterThan(80);
    expect(compressed).toBeLessThan(130);
  });

  it('uses a finite beam for lightning/web collision instead of a midpoint circle', () => {
    expect(beamIntersectsCircle({ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 8 }, 10)).toBe(true);
    expect(beamIntersectsCircle({ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 80 }, 10)).toBe(false);
  });
});
