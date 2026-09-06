import { describe, expect, it } from 'vitest';
import { ProjectileMuzzlePresentation } from './ProjectileMuzzlePresentation';

describe('ProjectileMuzzlePresentation', () => {
  it('aligns a new projectile laterally with the muzzle without rewinding it', () => {
    const presentation = new ProjectileMuzzlePresentation();
    const projectile = { position: { x: 80, y: 40 }, z: 24 };

    presentation.anchor(1, projectile, { x: 104, y: 27, z: 55 }, { x: 1, y: 0, z: 0 });
    presentation.present(1, projectile, 16);

    expect(projectile.position).toEqual({ x: 80, y: 55 });
    expect(projectile.z).toBe(27);
  });

  it('smoothly converges on the authoritative flight path without re-anchoring', () => {
    const presentation = new ProjectileMuzzlePresentation(100);
    const first = { position: { x: 80, y: 40 }, z: 24 };
    presentation.anchor(1, first, { x: 80, y: 24, z: 60 }, { x: 1, y: 0, z: 0 });
    presentation.present(1, first, 50);

    const halfway = { position: { x: 140, y: 40 }, z: 24 };
    presentation.present(1, halfway, 50);
    expect(halfway.position.y).toBe(50);

    expect([...presentation.activeIds()]).toEqual([]);
  });

  it('can forget a correction when its projectile leaves the snapshot', () => {
    const presentation = new ProjectileMuzzlePresentation();
    const first = { position: { x: 0, y: 0 }, z: 0 };
    presentation.anchor(7, first, { x: 0, y: 0, z: 10 }, { x: 1, y: 0, z: 0 });
    presentation.forget(7);

    const reused = { position: { x: 30, y: 0 }, z: 0 };
    presentation.present(7, reused, 16);
    expect(reused.position.x).toBe(30);
  });
});
