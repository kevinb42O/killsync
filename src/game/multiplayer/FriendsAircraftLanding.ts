import type { FriendsTerrain } from '../world/FriendsTerrain';

export const AIRCRAFT_CONTACT_RADIUS = 175;
/** Match the collision disk, including voxel corners between the skids.
 * Cache stationary approaches; edits or a lower altitude invalidate support. */
export class FriendsAircraftLanding {
  private cache?: { terrain: FriendsTerrain; revision: number; x: number; y: number; z: number; floor: number };
  floor(terrain: FriendsTerrain | undefined, x: number, y: number, z: number) {
    if (!terrain) return 0;
    const cached = this.cache;
    if (cached && cached.terrain === terrain && cached.revision === terrain.revision && cached.x === x && cached.y === y && z <= cached.z && z >= cached.floor) return cached.floor;
    let floor = terrain.floor(x, y, z + .01, 0) ?? 0;
    const r = AIRCRAFT_CONTACT_RADIUS;
    for (let vx = Math.floor((x-r)/32); vx <= Math.floor((x+r)/32); vx++) {
      for (let vy = Math.floor((y-r)/32); vy <= Math.floor((y+r)/32); vy++) {
        const nx = Math.max(vx*32, Math.min(vx*32+32, x)), ny = Math.max(vy*32, Math.min(vy*32+32, y));
        if (Math.hypot(x-nx,y-ny) >= r) continue;
        floor = Math.max(floor, terrain.floor(vx*32+16, vy*32+16, z+.01, 0) ?? floor);
      }
    }
    this.cache = { terrain, revision: terrain.revision, x, y, z, floor };
    return floor;
  }
}

/** Brake over the last metre, with a finite, gentle final contact. */
export function aircraftDescentSpeed(clearance: number) {
  return Math.min(300, Math.max(8, Math.max(0, clearance) * 2.4));
}
