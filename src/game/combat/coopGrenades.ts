export const GRENADE_CAPACITY = 2;
export const GRENADE_RECHARGE_MS = 24000;
export const GRENADE_FUSE_MS = 1600;
export const GRENADE_RADIUS = 220;
export interface CoopGrenadeSnapshot { id: number; ownerId: string; x: number; y: number; z: number; fuseMs: number; vx: number; vy: number; vz: number; }
export interface GrenadeContact { x: number; y: number; z: number; nx: number; ny: number; nz: number; }
/** Swept collision, gravity and restitution are host-only. Replicas draw snapshots. */
export function advanceGrenade(grenade: CoopGrenadeSnapshot, dtMs: number, collision: (from: CoopGrenadeSnapshot, x: number, y: number, z: number) => GrenadeContact | undefined) {
  const dt = dtMs / 1000;
  grenade.fuseMs = Math.max(0, grenade.fuseMs - dtMs);
  grenade.vz -= 600 * dt;
  const x = grenade.x + grenade.vx * dt, y = grenade.y + grenade.vy * dt, z = grenade.z + grenade.vz * dt;
  const hit = collision(grenade, x, y, z);
  if (hit) {
    const dot = grenade.vx * hit.nx + grenade.vy * hit.ny + grenade.vz * hit.nz;
    grenade.vx = (grenade.vx - 2 * dot * hit.nx) * .56;
    grenade.vy = (grenade.vy - 2 * dot * hit.ny) * .56;
    grenade.vz = (grenade.vz - 2 * dot * hit.nz) * .48;
    grenade.x = hit.x + hit.nx * 2; grenade.y = hit.y + hit.ny * 2; grenade.z = Math.max(4, hit.z + hit.nz * 4);
  } else { grenade.x = x; grenade.y = y; grenade.z = z; }
  if (grenade.z <= 4 && grenade.vz < 0) {
    grenade.z = 4; grenade.vz = Math.abs(grenade.vz) > 35 ? -grenade.vz * .38 : 0;
    grenade.vx *= .75; grenade.vy *= .75;
  }
  return grenade.fuseMs === 0;
}
export function grenadeDamage(distance: number) { return distance > GRENADE_RADIUS ? 0 : 240 * (1 - .72 * Math.max(0, distance) / GRENADE_RADIUS); }
