import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';

export interface RunPlacementExclusion { x: number; y: number; radius?: number }

/** Run beats are placed away from pre-generated station sites, ensuring the
 * objectives, bosses, and extraction route cannot overlap a capture node. */
export function findClearRunPosition(desired: { x: number; y: number }, radius: number, exclusions: readonly RunPlacementExclusion[] = []) {
  const margin = radius + 20;
  const origin = { x: Math.max(margin, Math.min(GAME_WIDTH - margin, desired.x)), y: Math.max(margin, Math.min(GAME_HEIGHT - margin, desired.y)) };
  const candidates: Array<{ x: number; y: number }> = [];
  for (let ring = 0; ring <= 24; ring++) {
    const samples = ring === 0 ? 1 : 24;
    for (let sample = 0; sample < samples; sample++) {
      const angle = sample / samples * Math.PI * 2;
      const x = origin.x + Math.cos(angle) * ring * 50;
      const y = origin.y + Math.sin(angle) * ring * 50;
      if (x < margin || y < margin || x > GAME_WIDTH - margin || y > GAME_HEIGHT - margin) continue;
      if (isWorldPositionClear(x, y, radius) && clearsExclusions(x, y, radius, exclusions)) return { x, y };
    }
  }

  // Scored deterministic fallback: prefer a genuinely separated clear site,
  // never the old unconditional map-centre escape hatch.
  for (let y = margin; y <= GAME_HEIGHT - margin; y += 240) {
    for (let x = margin; x <= GAME_WIDTH - margin; x += 240) {
      if (isWorldPositionClear(x, y, radius) && clearsExclusions(x, y, radius, exclusions)) candidates.push({ x, y });
    }
  }
  if (!candidates.length) throw new Error('No clear run position is available');
  return candidates.sort((a, b) => fallbackScore(b, desired, exclusions) - fallbackScore(a, desired, exclusions) || a.x - b.x || a.y - b.y)[0];
}

export const RUN_STATION_CLEARANCE = 650;

function clearsExclusions(x: number, y: number, radius: number, exclusions: readonly RunPlacementExclusion[]) {
  return exclusions.every(point => Math.hypot(x - point.x, y - point.y) >= radius + (point.radius || 0) + RUN_STATION_CLEARANCE);
}

function fallbackScore(candidate: { x: number; y: number }, desired: { x: number; y: number }, exclusions: readonly RunPlacementExclusion[]) {
  const desiredDistance = Math.hypot(candidate.x - desired.x, candidate.y - desired.y);
  const exclusionDistance = exclusions.length ? Math.min(...exclusions.map(point => Math.hypot(candidate.x - point.x, candidate.y - point.y))) : RUN_STATION_CLEARANCE;
  return exclusionDistance * .2 - desiredDistance;
}
