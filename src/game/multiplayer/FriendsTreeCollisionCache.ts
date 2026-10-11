import { frontierTrees, type FrontierSnapshot, type FrontierTree } from './FriendsFrontier';
import type { FriendsTerrain } from '../world/FriendsTerrain';

type Forest = Pick<FrontierSnapshot, 'planted'> & {harvested:readonly string[]|ReadonlySet<string>};
type SupportTerrain = Pick<FriendsTerrain, 'supports' | 'revision' | 'waterEpoch'>;

/** Supports guest snapshot arrays and host harvesting Sets. Retain only the
 * current nine-cell list; weak support entries do not retain departed trees. */
export class FriendsTreeCollisionCache {
  private harvested?: Forest['harvested'];
  private harvestedCount=-1;
  private plantedCount=-1;
  private removed = new Set<string>();
  private planted?: readonly FrontierTree[];
  private cellX = NaN;
  private cellY = NaN;
  private candidates: readonly FrontierTree[] = [];
  private terrain?: SupportTerrain;
  private terrainRevision = -1;
  private terrainEpoch = -1;
  private support = new WeakMap<FrontierTree, boolean>();

  collide(position: {x:number;y:number}, z:number, radius:number, forest:Forest, terrain:SupportTerrain) {
    const count=Array.isArray(forest.harvested)?forest.harvested.length:(forest.harvested as ReadonlySet<string>).size;
    if (forest.harvested !== this.harvested||count!==this.harvestedCount) {
      this.harvestedCount=count;
      this.harvested = forest.harvested;
      this.removed = new Set(forest.harvested);
    }
    if (terrain !== this.terrain || terrain.revision !== this.terrainRevision || terrain.waterEpoch !== this.terrainEpoch) {
      this.terrain = terrain;
      this.terrainRevision = terrain.revision;
      this.terrainEpoch = terrain.waterEpoch;
      this.support = new WeakMap();
    }
    const cx = Math.floor(position.x / 512), cy = Math.floor(position.y / 512);
    if (cx !== this.cellX || cy !== this.cellY || forest.planted !== this.planted||forest.planted.length!==this.plantedCount) {
      this.plantedCount=forest.planted.length;
      this.cellX = cx; this.cellY = cy; this.planted = forest.planted;
      const candidates = [...forest.planted];
      // Keep the original order: earlier trunk contacts can move the body.
      for (let a=cx-1;a<=cx+1;a++) for (let b=cy-1;b<=cy+1;b++) candidates.push(...frontierTrees(a,b));
      this.candidates = candidates;
    }
    let collided = false;
    for (const t of this.candidates) {
      if (this.removed.has(t.id) || z >= t.z + 180*t.scale || z+50 < t.z) continue;
      const dx=position.x-t.x,dy=position.y-t.y,extent=radius+10*t.scale;
      if (Math.abs(dx)>=extent || Math.abs(dy)>=extent) continue;
      const d=Math.hypot(dx,dy);
      if (d>=extent) continue;
      let supported=this.support.get(t);
      if (supported===undefined) { supported=terrain.supports(t.x,t.y,t.z); this.support.set(t,supported); }
      if (!supported) continue;
      position.x=t.x+(d>.001?dx/d:1)*extent;
      position.y=t.y+(d>.001?dy/d:0)*extent;
      collided=true;
    }
    return collided;
  }
}
