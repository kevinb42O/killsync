import { frontierTrees, type FrontierSnapshot, type FrontierTree } from './multiplayer/FriendsFrontier';
import { islandCoastDistance, ISLAND_SEA_LEVEL } from './world/FriendsIsland';
import { baseTerrainHeight } from './world/FriendsTerrain';

export type FriendsSoundscapeMix = { wind: number; birds: number; birdPan?: number; crickets: number; surf: number; foliage: number; foliagePan: number };
export const QUIET_SOUNDSCAPE: FriendsSoundscapeMix = { wind: 0, birds: 0, crickets: 0, surf: 0, foliage: 0, foliagePan: 0 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
/** Match the island's rocky mountain band, while also exposing high flight
 * and towers. Ordinary hills, beaches and small jumps stay completely quiet. */
export function windExposure(height: number, groundHeight: number) {
  return Math.max(smooth((height - 1700) / 900), smooth((height - groundHeight - 480) / 800));
}
/** Coast distance comes from the same irregular shoreline as the terrain.
 * Height matters too: a beach is audible; a distant mountaintop is quiet. */
export function coastalSurfLevel(coastDistance: number, height: number) {
  const proximity = clamp(1 - Math.hypot(coastDistance, height - ISLAND_SEA_LEVEL) / 1600);
  return .42 * proximity * proximity;
}

/** Called twice per second, using the same cached tree cells as the world.
 * No per-tree audio nodes, timers, raycasts, or work on each render frame. */
export class FriendsSoundscape {
  private harvested = new Set<string>();
  private harvestedStamp = '';
  sample(frontier: FrontierSnapshot, x: number, y: number, z: number, yaw: number,
    daylight: number, windSpeed: number, windSeconds: number, underground: boolean,
    standing: (tree: FrontierTree) => boolean = () => true,
    groundHeight = baseTerrainHeight(x, y)): FriendsSoundscapeMix {
    if (underground) return QUIET_SOUNDSCAPE;
    const stamp = `${frontier.harvested.length}:${frontier.harvested.at(-1) || ''}`;
    if (stamp !== this.harvestedStamp) { this.harvestedStamp = stamp; this.harvested = new Set(frontier.harvested); }
    let distance = 750, nearest: FrontierTree | undefined;
    const inspect = (tree: FrontierTree) => {
      if (this.harvested.has(tree.id)) return;
      const d = Math.hypot(tree.x - x, tree.y - y, Math.max(0, Math.abs(z - tree.z) - 160));
      if (d < distance && standing(tree)) { distance = d; nearest = tree; }
    };
    for (const tree of frontier.planted) inspect(tree);
    const cx = Math.floor(x / 512), cy = Math.floor(y / 512);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) for (const tree of frontierTrees(a, b)) inspect(tree);
    const forest = clamp(1 - distance / 750), foliage = clamp(1 - distance / 350);
    const breeze = clamp(windSpeed / 2), gust = .8 + .2 * Math.sin(windSeconds * .17);
    const pan = nearest ? Math.sin(Math.atan2(nearest.y - y, nearest.x - x) - yaw) * .65 : 0;
    return {
      wind: windExposure(z, groundHeight) * (.22 + breeze * .18) * Math.min(1, Math.max(0, windSpeed)) * gust * (1 - forest * .6),
      birds: 0, // Only the rendered bird population can provide calls.
      crickets: (.05 + forest * .07) * (1 - clamp(daylight)),
      surf: coastalSurfLevel(islandCoastDistance(x, y), z),
      foliage: foliage * breeze * .2 * gust, foliagePan: pan,
    };
  }
}
