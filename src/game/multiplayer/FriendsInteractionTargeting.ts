import { retreatWorkReserved } from '../world/FriendsRetreatPaths';
import { friendsCampfireContains } from '../world/FriendsTerrain';
import { raycastFriendsBuild, friendsShapeBoxes, worldBox, type FriendsBuildPiece } from './FriendsBuilding';
import type { FrontierTree, FrontierTool } from './FriendsFrontier';
import { friendsFixedPlatformProtected, friendsSpawnProtected, type FriendsTerrain, type TerrainRay, type TerrainHit } from '../world/FriendsTerrain';
import { scenicTransitProtected } from '../world/FriendsRailInfrastructure';

export const FRIENDS_MINING_REACH = 240;
/** Reject distant trunks before sampling terrain support; preserve reachable corners. */
export function friendsTreeWithinReach(tree: FrontierTree, x: number, y: number, reach = FRIENDS_MINING_REACH) {
  const radius = 18 * tree.scale, dx = Math.max(0, Math.abs(tree.x - x) - radius), dy = Math.max(0, Math.abs(tree.y - y) - radius);
  return dx * dx + dy * dy <= reach * reach;
}
export type MiningWorkPlane = {axis:0|1|2;value:number};
export type InteractionTarget = {
  id: string; kind: 'soil' | 'stone' | 'ore' | 'wood' | 'build';
  x: number; y: number; z: number; nx: number; ny: number; nz: number;
  distance: number; fill?: boolean; valid: boolean; reason?: string;
  ground?: TerrainHit; tree?: FrontierTree; piece?: FriendsBuildPiece;
};

/** Shared by host and presentation. No Three.js, camera offsets or visual meshes. */
export function friendsInteractionTarget(terrain: FriendsTerrain, ray: TerrainRay, tool: FrontierTool,
  pieces: readonly FriendsBuildPiece[], trees: readonly FrontierTree[], permitted = true, workPlane?: MiningWorkPlane, fill = false, retreatActive:readonly string[]=[]): InteractionTarget | undefined {
  fill = tool === 3 && fill;
  const ground = terrain.raycast(ray, FRIENDS_MINING_REACH);
  const build = raycastFriendsBuild(pieces, ray, FRIENDS_MINING_REACH);
  let result: InteractionTarget | undefined = ground && {
    id: `${ground.vx},${ground.vy},${ground.vz}`, kind: ground.material === 1 ? 'soil' : ground.material > 2 ? 'ore' : 'stone',
    ...ground, ground, valid: true,
  };
  if (build && (!result || build.distance < result.distance)) result = {
    id: `build:${build.piece.id}`, kind: 'build', ...build, valid: tool === 2,
    reason: tool === 2 ? undefined : 'Use the pickaxe to break built pieces.',
  };
  // Trunks use a bounded box, including vertical rays; unlike the old projected
  // horizontal distance, the parameter is always distance along a unit aim ray.
  for (const tree of trees) {
    const radius = 18 * tree.scale, min = [tree.x - radius, tree.y - radius, tree.z],
      max = [tree.x + radius, tree.y + radius, tree.z + 230 * tree.scale];
    const origin = [ray.x, ray.y, ray.z], dirs = [ray.dx, ray.dy, ray.dz];
    let near = 0, far = result?.distance ?? FRIENDS_MINING_REACH, axis = 2;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dirs[i]) < 1e-8) { if (origin[i] < min[i] || origin[i] > max[i]) { far = -1; break; } continue; }
      const a = (min[i] - origin[i]) / dirs[i], b = (max[i] - origin[i]) / dirs[i];
      if (Math.min(a, b) > near) { near = Math.min(a, b); axis = i; }
      far = Math.min(far, Math.max(a, b));
    }
    if (near <= far && far >= 0 && near < (result?.distance ?? FRIENDS_MINING_REACH)) {
      const normal = [0, 0, 0]; normal[axis] = dirs[axis] > 0 ? -1 : 1;
      result = { id: tree.id, kind: 'wood', tree, x: ray.x + ray.dx * near, y: ray.y + ray.dy * near,
        z: ray.z + ray.dz * near, nx: normal[0], ny: normal[1], nz: normal[2], distance: near, valid: tool === 1,
        reason: tool === 1 ? undefined : 'Use the axe on tree trunks.' };
    }
  }
  if (!result) return;
  if (!permitted) return { ...result, valid: false, reason: 'The host needs to enable world editing.' };
  if (result.ground) {
    const g = result.ground, x = (g.vx + .5) * 32, y = (g.vy + .5) * 32, z = (g.vz + .5) * 32;
    let reason: string | undefined;
    if (friendsFixedPlatformProtected(x, y, z)) reason = friendsSpawnProtected(x,y,z) ? 'The player spawn platform is indestructible.' : friendsCampfireContains(x,y) ? 'Keep the campfire gathering spot intact.' : 'The hauling platform is indestructible.';
    else if (retreatWorkReserved({x,y,z},retreatActive)) reason = 'Keep the quiet place and its approach intact.';
    else if (scenicTransitProtected(x, y, z)) reason = 'Keep the railway corridor clear.';
    else if (tool === 1) reason = 'Aim the axe at a tree trunk.';
    else if (!fill && g.vz <= -16) reason = 'Bedrock. Explore sideways.';
    else if (tool === 3 && !fill && g.material !== 1) reason = 'Stone needs the pickaxe.';
    else if (!fill && pieces.some(p => friendsShapeBoxes(p.shape).some(local => {
      const b = worldBox(p, local);
      return Math.abs(x - b.x) < b.w / 2 + 16 - .01 && Math.abs(y - b.y) < b.d / 2 + 16 - .01 && Math.abs((g.vz + 1) * 32 - b.z) < .1;
    }))) reason = 'This block supports a saved build. Move or remove the piece first.';
    if(!reason&&!fill&&workPlane&&(tool===2||tool===3)){
      const normal=[g.nx,g.ny,g.nz],cell=[g.vx,g.vy,g.vz],axis=workPlane.axis;
      if(Math.abs(normal[axis])<.5||Math.abs((cell[axis]+(normal[axis]>0?1:0))*32-workPlane.value)>.1)reason='Work face locked. Aim along this face or unlock it.';
    }
    result = { ...result, fill: fill || undefined, valid: !reason, reason };
  }
  return result;
}

/** Rebuilt only on a build revision. Attached pieces stay dynamic candidates. */
export class FriendsBuildSpatialIndex {
  private cells = new Map<string, FriendsBuildPiece[]>();
  private dynamic: FriendsBuildPiece[] = [];
  private revision = -1;
  update(pieces: readonly FriendsBuildPiece[], revision: number) {
    if (revision === this.revision) { if(this.dynamic.length)this.dynamic = pieces.filter(p => p.attachment||p.assembly); return; }
    this.revision = revision; this.cells.clear(); this.dynamic = [];
    for (const p of pieces) {
      if (p.attachment||p.assembly) { this.dynamic.push(p); continue; }
      for (const b of friendsShapeBoxes(p.shape).map(local => worldBox(p, local))) {
        for (let x = Math.floor((b.x - b.w / 2) / 256); x <= Math.floor((b.x + b.w / 2) / 256); x++)
          for (let y = Math.floor((b.y - b.d / 2) / 256); y <= Math.floor((b.y + b.d / 2) / 256); y++) {
            const key = `${x},${y}`, bucket = this.cells.get(key) || []; if (!bucket.includes(p)) bucket.push(p); this.cells.set(key, bucket);
          }
      }
    }
  }
  get hasAttachments() {return this.dynamic.length>0;}
  near(x: number, y: number, reach: number): FriendsBuildPiece[] {
    const result = new Set(this.dynamic);
    for (let a = Math.floor((x - reach) / 256); a <= Math.floor((x + reach) / 256); a++)
      for (let b = Math.floor((y - reach) / 256); b <= Math.floor((y + reach) / 256); b++)
        for (const piece of this.cells.get(`${a},${b}`) || []) result.add(piece);
    return [...result];
  }
}
