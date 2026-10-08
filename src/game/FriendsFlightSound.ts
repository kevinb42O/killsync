import type { FrontierTree } from './multiplayer/FriendsFrontier';

type Point = { x: number; y: number; z: number };
export type TreeCanopy = { bottom: number; top: number; radius: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Sweep the player's short flight segment through canopy ellipsoids. This
 * catches quick crossings without a physics body or per-tree audio nodes. */
export class FriendsFlightFoliage {
  private previous?: Point & { at: number };
  private nextContact = 0;
  sample(point: Point, at: number, enabled: boolean, trees: readonly FrontierTree[],
    standing: (tree: FrontierTree) => boolean, canopy: (tree: FrontierTree) => TreeCanopy | undefined, yaw: number) {
    const old = this.previous;
    this.previous = enabled ? { ...point, at } : undefined;
    if (!enabled || !old) { this.nextContact = 0; return; }
    const dt = at - old.at, travel = Math.hypot(point.x - old.x, point.y - old.y, point.z - old.z);
    if (dt <= 0 || dt > 250 || travel > 500 || travel < .1 || at < this.nextContact) return;
    let closest = Infinity, contact: FrontierTree | undefined;
    for (const tree of trees) {
      const crown = canopy(tree); if (!crown) continue;
      const radius = crown.radius * tree.scale + 12, halfHeight = (crown.top - crown.bottom) * tree.scale / 2 + 16;
      if (radius <= 12 || halfHeight <= 16) continue;
      if (Math.abs(point.x - tree.x) > radius + travel || Math.abs(point.y - tree.y) > radius + travel) continue;
      const centerZ = tree.z + (crown.top + crown.bottom) * tree.scale / 2;
      const ax = (old.x - tree.x) / radius, ay = (old.y - tree.y) / radius, az = (old.z + 30 - centerZ) / halfHeight;
      const dx = (point.x - old.x) / radius, dy = (point.y - old.y) / radius, dz = (point.z - old.z) / halfHeight;
      const t = clamp(-(ax * dx + ay * dy + az * dz) / (dx * dx + dy * dy + dz * dz));
      const d = Math.hypot(ax + t * dx, ay + t * dy, az + t * dz);
      if (d < 1 && d < closest && standing(tree)) { closest = d; contact = tree; }
    }
    if (!contact) return;
    this.nextContact = at + 360;
    return { volume: .16 + .18 * clamp(travel / (dt / 1000) / 900), rate: .95 + .15 * clamp(travel / 80),
      pan: Math.sin(Math.atan2(contact.y - point.y, contact.x - point.x) - yaw) * .55 };
  }
}
