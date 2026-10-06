import { FRIENDS_AIRPAD, FRIENDS_HUB, FRIENDS_BUILD_MEADOW, FRIENDS_LAKE, FRIENDS_PLACES, FRIENDS_SALVAGE, FRIENDS_SIGNALS } from './FriendsRegion';
import { railwayDistance } from './FriendsRailway';

// Construction space is reserved before scenery is placed. The valley interior
// stays open; woodland is a small backdrop along the outer edge.
export const FRIENDS_BUILD_CLEARINGS = [
  { name: 'Building Meadow', x: 6260, y: 6100, rx: 1100, ry: 800 },
  { name: 'South Meadow', x: 6220, y: 7650, rx: 1150, ry: 800 },
  { name: 'Garden Approach', x: 8020, y: 7680, rx: 600, ry: 380 },
] as const;
export const FRIENDS_TREE_LIMIT = 72;
export type FriendsSceneryPlacement = { asset: 'oak' | 'autumnOak' | 'canopyTree' | 'roundPine' | 'pine' | 'bush' | 'broadRock' | 'wildGrass'; x: number; y: number; rotation: number; scale: number; width: number; depth: number; height: number };
export function insideFriendsBuildClearing(x: number, y: number, extent = 0) {
  return FRIENDS_BUILD_CLEARINGS.some(c => ((x - c.x) / (c.rx + extent)) ** 2 + ((y - c.y) / (c.ry + extent)) ** 2 <= 1);
}
export function friendsSceneryAllowed(x: number, y: number, extent: number) {
  if (railwayDistance(x, y) < 260 + extent || insideFriendsBuildClearing(x, y, extent)) return false;
  if (((x - FRIENDS_LAKE.x) / (FRIENDS_LAKE.rx + 120 + extent)) ** 2 + ((y - FRIENDS_LAKE.y) / (FRIENDS_LAKE.ry + 120 + extent)) ** 2 < 1) return false;
  if ([FRIENDS_HUB, FRIENDS_AIRPAD, ...FRIENDS_PLACES, ...FRIENDS_SIGNALS].some(p => Math.hypot(x - p.x, y - p.y) < 500 + extent)) return false;
  return Math.hypot(x - FRIENDS_SALVAGE.x, y - FRIENDS_SALVAGE.y) > FRIENDS_SALVAGE.radius + 120 + extent;
}
export function friendsSceneryPlacements(): FriendsSceneryPlacement[] {
  const placements: FriendsSceneryPlacement[] = [];
  const groves = [[2650, 4570], [2400, 6730], [2800, 9470], [6530, 10000], [10300, 8240], [9840, 4370]];
  const species = ['oak', 'autumnOak', 'roundPine', 'pine', 'canopyTree', 'oak'] as const;
  groves.forEach(([cx, cy], grove) => {
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.399, r = 65 + Math.sqrt(i) * 80;
      const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r, scale = .78 + i % 4 * .08;
      const tree = { asset: species[grove], x, y, rotation: angle, scale, width: 110, depth: 110, height: species[grove] === 'pine' ? 215 : 165 };
      if (friendsSceneryAllowed(x, y, Math.hypot(tree.width, tree.depth) * scale / 2)) placements.push(tree);
      // Each offset decoration is checked independently, with its full footprint.
      const shrub = { asset: 'bush' as const, x: x + 90, y: y + 40, rotation: angle, scale: 1, width: 50, depth: 50, height: 30 };
      if (i % 3 === 0 && friendsSceneryAllowed(shrub.x, shrub.y, 36)) placements.push(shrub);
      const rock = { asset: 'broadRock' as const, x: x - 100, y, rotation: angle, scale: 1, width: 75, depth: 65, height: 45 };
      if (i % 6 === 0 && friendsSceneryAllowed(rock.x, rock.y, 50)) placements.push(rock);
    }
  });
  return placements;
}
