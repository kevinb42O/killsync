import { FRIENDS_BUILD_MEADOW, FRIENDS_GARDEN_TERRACE } from '../world/FriendsRegion';
import { getNearbyWorldObstacles } from '../world/WorldLayout';
import { friendsBuildCeiling, friendsBuildFloor, resolveFriendsBuildCollisions, type FriendsBuildPiece } from './FriendsBuilding';
export const FRIENDS_PROJECT_IDS = ['garden_walk', 'observatory', 'commons'] as const;
export type FriendsProjectId = typeof FRIENDS_PROJECT_IDS[number];
export type FriendsProjectSnapshot = { completed: FriendsProjectId[]; active: FriendsProjectId[] };
export const FRIENDS_PROJECTS = {
  garden_walk: { name: 'The Garden Walk', detail: 'Connect the west approach to the garden terrace with a walkable ramp, stairs or bridge.', x: 7936, y: 7520, z: 0, reward: 'A restored terrace garden + 300 credits for everyone' },
  observatory: { name: 'The Echo Observatory', detail: 'Mount a survey lens on your build above 192 height on your own tower anywhere in the frontier.', x: 6280, y: 8650, z: 192, reward: 'A crew observatory + 300 credits for everyone' },
  commons: { name: 'Sunline Commons', detail: 'Build a gathering beacon with a bench, planter and lantern at a meeting place of your choosing.', ...FRIENDS_BUILD_MEADOW, z: 0, reward: 'A valley meeting marker + 300 credits for everyone' },
} as const;
/** A bounded capsule-clear surface search, not a touching-block count. It
 * accepts different route designs and uses the production floor/collision data. */
export function gardenWalkConnected(pieces: readonly FriendsBuildPiece[]) {
  const relevant = pieces.filter(p => Math.abs(p.x - 8272) < 430 && Math.abs(p.y - 7530) < 330);
  if (!relevant.length) return false;
  const queue = [{ x: 7936, y: 7520, z: 0 }], seen = new Set<string>();
  for (let head = 0; head < queue.length && seen.size < 6000; head++) {
    const p = queue[head], key = `${p.x}:${p.y}:${Math.round(p.z)}`; if (seen.has(key)) continue; seen.add(key);
    if (Math.abs(p.x - FRIENDS_GARDEN_TERRACE.x) < 64 && Math.abs(p.y - FRIENDS_GARDEN_TERRACE.y) < 96 && p.z >= 127) return true;
    for (const [dx, dy] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) {
      const x = p.x + dx, y = p.y + dy; if (x < 7936 || x > 8480 || y < 7296 || y > 7776) continue;
      let z = friendsBuildFloor(relevant, x, y, p.z, 18) ?? 0;
      const obstacles = getNearbyWorldObstacles(x, y, 19, 'friends_frontier');
      for (const o of obstacles) if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height && o.elevation <= p.z + 18) z = Math.max(z, o.elevation);
      if (Math.abs(z - p.z) > 18) continue;
      if (obstacles.some(o => z + 18 < o.elevation && x + 19 > o.x && x - 19 < o.x + o.width && y + 19 > o.y && y - 19 < o.y + o.height)) continue;
      const ceiling = friendsBuildCeiling(relevant, x, y, z); if (ceiling !== undefined && z + 50 > ceiling) continue;
      const test = { x, y }; if (resolveFriendsBuildCollisions(relevant, test, z, 19, 50, 18) && Math.hypot(test.x - x, test.y - y) > .5) continue;
      if (!seen.has(`${x}:${y}:${Math.round(z)}`)) queue.push({ x, y, z });
    }
  }
  return false;
}
export class FriendsProjects {
  private completed: FriendsProjectId[];
  private active: FriendsProjectId[] = [];
  constructor(saved?: FriendsProjectSnapshot) { this.completed = FRIENDS_PROJECT_IDS.filter(id => saved?.completed?.includes(id)); }
  update(pieces: readonly FriendsBuildPiece[]) {
    this.active = [];
    // The old garden terrace no longer exists. Legacy completion remains saved.
    if (pieces.some(p => p.shape === 'survey_lens' && p.z >= 192 && (friendsBuildFloor(pieces.filter(q => q.id !== p.id), p.x, p.y, p.z, 0) ?? -1) >= p.z - 1)) this.active.push('observatory');
    const beacon = pieces.find(p => p.shape === 'gathering_beacon');
    if (beacon && ['bench', 'planter', 'lamp'].every(shape => pieces.some(p => p.shape === shape && Math.hypot(p.x - beacon.x, p.y - beacon.y, p.z - beacon.z) < 192))) this.active.push('commons');
    const newly = this.active.filter(id => !this.completed.includes(id)); this.completed.push(...newly); return newly;
  }
  snapshot(): FriendsProjectSnapshot { return { completed: [...this.completed], active: [...this.active] }; }
}
