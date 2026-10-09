import { HIGHFALL_CASTLE } from './world/FriendsCastle';
import { CASTLE_STAIRS } from './world/FriendsTerrain';
import { FRIENDS_CAMPFIRE } from './world/FriendsRegion';
import { campfireHeat } from './multiplayer/FriendsCampfireSimulation';

type Point = { x: number; y: number; z: number };
export type CampfireSoundMix = { volume: number; pan: number };
export const QUIET_CAMPFIRE: CampfireSoundMix = { volume: 0, pan: 0 };

/** Spatially indexed authored treads also define the music's approach region.
 * A wider exit boundary prevents repeated switching at the edge of the path. */
export function inCastleMusicArea(point: Point, alreadyInside = false) {
  const c = HIGHFALL_CASTLE, margin = alreadyInside ? 320 : 192;
  if (Math.abs(point.x - c.x) <= c.half + margin && Math.abs(point.y - c.y + 320) <= 1536 + margin
    && point.z >= c.foundation - 256 && point.z <= c.floor + 2200) return true;
  for (const t of CASTLE_STAIRS.at(point.x, point.y)) {
    if (Math.abs(point.z - t.z) > (alreadyInside ? 320 : 224)) continue;
    const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y;
    const along = Math.max(0, Math.min(1, ((point.x - t.a.x) * dx + (point.y - t.a.y) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(point.x - t.a.x - dx * along, point.y - t.a.y - dy * along) <= t.width / 2 + (alreadyInside ? 160 : 96)) return true;
  }
  return false;
}

export function campfireSound(point: Point, yaw: number, fuelSeconds = 0, underground = false,source:Point=FRIENDS_CAMPFIRE): CampfireSoundMix {
  if (underground) return QUIET_CAMPFIRE;
  const fire = source, dx = fire.x - point.x, dy = fire.y - point.y;
  const distance = Math.hypot(dx, dy, fire.z + 24 - point.z);
  const n = Math.max(0, Math.min(1, 1 - distance / 650));
  // The rendered fire always has a small base flame; extra timber boosts it.
  return { volume: .38 * n * n * (3 - 2 * n) * (.75 + .25 * (campfireHeat(fuelSeconds) - 1) / .8),
    pan: Math.sin(Math.atan2(dy, dx) - yaw) * .8 };
}
