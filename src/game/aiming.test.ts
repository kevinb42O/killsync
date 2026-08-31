import { describe, expect, it } from 'vitest';
import { solveMuzzleConvergence } from './aiming';

describe('solveMuzzleConvergence', () => {
  it('starts at the muzzle and converges on the camera aim point', () => {
    const solution = solveMuzzleConvergence(
      { x: 0, y: 26, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 2, y: 24, z: -12 },
      { x: 0, y: 26, z: -100 }
    );

    expect(solution.muzzlePosition3D).toEqual({ x: 2, y: 24, z: -12 });
    expect(solution.direction3D.x).toBeLessThan(0);
    expect(solution.direction3D.y).toBeGreaterThan(0);
    expect(solution.direction3D.z).toBeLessThan(0);
    expect(Math.hypot(
      solution.direction3D.x,
      solution.direction3D.y,
      solution.direction3D.z
    )).toBeCloseTo(1, 6);
  });

  it('uses a distant camera target when nothing is hit', () => {
    const solution = solveMuzzleConvergence(
      { x: 10, y: 20, z: 30 },
      { x: 1, y: 0, z: 0 },
      { x: 12, y: 18, z: 30 },
      undefined,
      500
    );

    expect(solution.aimPoint3D).toEqual({ x: 510, y: 20, z: 30 });
    expect(solution.direction2D.x).toBeGreaterThan(0.99);
  });

  it('preserves obstruction state for collision-aware callers', () => {
    const solution = solveMuzzleConvergence(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: -1 },
      { x: 0, y: 0, z: -10 },
      100,
      true
    );

    expect(solution.obstructed).toBe(true);
  });
});
