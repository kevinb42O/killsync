export interface ProjectilePresentationPosition {
  position: { x: number; y: number };
  z?: number;
}

export interface MuzzleWorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface ProjectileFlightDirection {
  x: number;
  y: number;
  z: number;
}

type MuzzleCorrection = {
  x: number;
  y: number;
  z: number;
  elapsedMs: number;
};

/**
 * Network projectiles are authoritative, but the locally controlled player is
 * rendered ahead using movement prediction. This presentation-only reconciler
 * aligns a newly observed local projectile with the rendered barrel, then
 * eases it onto the authoritative flight path without moving gameplay state.
 */
export class ProjectileMuzzlePresentation {
  private readonly corrections = new Map<number, MuzzleCorrection>();

  constructor(private readonly convergenceMs = 64) {}

  anchor(
    id: number,
    projectile: ProjectilePresentationPosition,
    muzzle: MuzzleWorldPosition,
    direction: ProjectileFlightDirection,
  ) {
    const delta = {
      x: muzzle.x - projectile.position.x,
      y: muzzle.y - (projectile.z ?? muzzle.y),
      z: muzzle.z - projectile.position.y,
    };
    const directionLength = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const normalized = { x: direction.x / directionLength, y: direction.y / directionLength, z: direction.z / directionLength };
    const alongFlight = delta.x * normalized.x + delta.y * normalized.y + delta.z * normalized.z;
    // Correct only across the trajectory. Rewinding along it makes a delayed
    // network round visibly accelerate from the barrel, which is more
    // distracting than preserving its authoritative forward progress.
    this.corrections.set(id, {
      x: delta.x - normalized.x * alongFlight,
      y: delta.z - normalized.z * alongFlight,
      z: delta.y - normalized.y * alongFlight,
      elapsedMs: 0,
    });
  }

  present(id: number, projectile: ProjectilePresentationPosition, deltaMs: number) {
    const correction = this.corrections.get(id);
    if (!correction) return;

    const progress = Math.min(1, correction.elapsedMs / Math.max(1, this.convergenceMs));
    // Smoothstep avoids a visible lateral velocity discontinuity at either end
    // while keeping the first displayed frame on the muzzle's trajectory.
    const remaining = 1 - progress * progress * (3 - 2 * progress);
    projectile.position.x += correction.x * remaining;
    projectile.position.y += correction.y * remaining;
    if (projectile.z !== undefined) projectile.z += correction.z * remaining;
    correction.elapsedMs += Math.max(0, deltaMs);
    if (correction.elapsedMs >= this.convergenceMs) this.corrections.delete(id);
  }

  activeIds() { return this.corrections.keys(); }

  forget(id: number) { this.corrections.delete(id); }

  clear() { this.corrections.clear(); }
}
