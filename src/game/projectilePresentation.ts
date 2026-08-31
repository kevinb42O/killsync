import type { Projectile } from '../types';

let visualSequence = 0;

/**
 * Gameplay ids are class labels (`arc_web`, `tendril`, …), not instance ids.
 * Give the renderer a stable unique key without changing collision semantics.
 */
export function getProjectileVisualId(projectile: Projectile): string {
  if (projectile.visualId) return projectile.visualId;
  visualSequence += 1;
  projectile.visualId = `${projectile.id}:vfx-${visualSequence}`;
  return projectile.visualId;
}

/** Test-only reset keeps visual identity tests deterministic. */
export function resetProjectileVisualIdsForTest() {
  visualSequence = 0;
}

/** Combat range must only be bounded by a broad safety ceiling, never weapon class. */
export function sanitizeProjectileRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 12;
  return Math.max(0.5, Math.min(radius, 1600));
}

/**
 * Gameplay radius is allowed to grow freely; screen-space VFX is not. This
 * keeps the first upgrade satisfying while asymptotically approaching a
 * weapon-specific readability ceiling instead of covering the combat field.
 */
export function compressVisualRadius(radius: number, softCap: number, hardCap: number): number {
  const safeRadius = sanitizeProjectileRadius(radius);
  const safeSoftCap = Math.max(0.5, softCap);
  const safeHardCap = Math.max(safeSoftCap, hardCap);
  if (safeRadius <= safeSoftCap) return safeRadius;
  const overshoot = safeRadius - safeSoftCap;
  return safeSoftCap + (safeHardCap - safeSoftCap) * (1 - Math.exp(-overshoot / safeSoftCap));
}

/** Whether a circular enemy overlaps a finite beam segment. */
export function beamIntersectsCircle(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
): boolean {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const lengthSq = abx * abx + aby * aby;
  const projection = lengthSq > 0
    ? ((center.x - start.x) * abx + (center.y - start.y) * aby) / lengthSq
    : 0;
  const t = Math.max(0, Math.min(1, projection));
  const dx = center.x - (start.x + abx * t);
  const dy = center.y - (start.y + aby * t);
  return dx * dx + dy * dy < radius * radius;
}
