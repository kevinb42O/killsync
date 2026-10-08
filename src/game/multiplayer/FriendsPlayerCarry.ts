import type { HaulingActor, HaulingEnvironment } from './FriendsHauling';
import { isCampfireSeat } from './FriendsCampfireSeats';

type Point = { x: number; y: number; z: number };
type CarryActor = HaulingActor & {
  friendsSeat?: { vehicleId: string; index: number };
  sprinting?: boolean; sliding?: boolean; crouching?: boolean; jetActive?: boolean;
  platformVelocityX?: number; platformVelocityY?: number; platformVelocityZ?: number;
  coyoteMs?: number; jumpBufferMs?: number; slideMs?: number; slideHeld?: boolean;
};
export type PlayerCarryRope = { id: string; playerId: string; length: number; bends: Point[] };
type Carry = { rope: PlayerCarryRope; trail: Point[]; passenger: CarryActor };
const FOLLOW_DISTANCE = 56;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const point = ({ x, y, z }: Point): Point => ({ x, y, z });

/** Assisted passenger motion follows the carrier's travelled route. Replaying
 * ground collisions or gravity here would strand an AFK passenger at ledges. */
export class FriendsPlayerCarry {
  private carries = new Map<string, Carry>();

  isCarried(id: string) { return [...this.carries.values()].some(c => c.rope.playerId === id); }
  hasCarrier(id: string) { return this.carries.has(id); }
  release(id: string) {
    let released = false;
    for (const [carrierId, carry] of this.carries) if (carrierId === id || carry.rope.playerId === id) {
      // The assist can follow flight speeds. Releasing it must not convert
      // that presentation velocity into an uncontrolled airborne launch.
      carry.passenger.velocityX = carry.passenger.velocityY = carry.passenger.verticalVelocity = 0;
      this.carries.delete(carrierId); released = true;
    }
    return released;
  }
  canAttach(carrier: CarryActor, passenger: CarryActor) {
    return carrier.id !== passenger.id && carrier.lifeState === 'alive' && passenger.lifeState === 'alive'
      && !this.hasCarrier(carrier.id) && !this.isCarried(carrier.id)
      && !this.hasCarrier(passenger.id) && !this.isCarried(passenger.id);
  }
  attach(carrier: CarryActor, passenger: CarryActor) {
    delete passenger.friendsSeat;
    this.carries.set(carrier.id, {
      passenger,
      rope: { id: carrier.id, playerId: passenger.id, length: distance(carrier, passenger), bends: [] },
      trail: [point(passenger), point(carrier)],
    });
  }
  update(dt: number, players: readonly CarryActor[], env: HaulingEnvironment) {
    const seconds = Math.max(0, Math.min(100, dt)) / 1000;
    const actors = new Map(players.map(p => [p.id, p]));
    for (const [id, carry] of this.carries) {
      const carrier = actors.get(id), passenger = actors.get(carry.rope.playerId);
      if (!carrier || !passenger || carrier.lifeState !== 'alive' || passenger.lifeState !== 'alive'
        || isCampfireSeat(carrier.friendsSeat) || passenger.friendsSeat || env.vehicles.some(v => v.pilotId === passenger.id)) {
        this.release(id); continue;
      }
      if (seconds === 0) continue;
      const trail = carry.trail, end = trail[trail.length - 1];
      const travelled = distance(end, carrier);
      // Home, world travel and recovery are discontinuities, never a tow impulse.
      if (travelled > 900 || distance(trail[0], passenger) > 80) { this.release(id); continue; }
      if (travelled > .001) trail.push(point(carrier));
      let length = 0;
      for (let i = 1; i < trail.length; i++) length += distance(trail[i - 1], trail[i]);
      const excess = Math.max(0, length - FOLLOW_DISTANCE);
      // Match ordinary carrier speed, with a bounded, softly braking catch-up
      // when first attached at range. Consume the polyline rather than cutting
      // diagonally through the carrier's corners or flattening their jumps.
      let travel = Math.min(excess, travelled + Math.min(300 * seconds, excess * (1 - Math.exp(-5 * seconds))));
      const consumed = travel;
      const before = point(passenger);
      while (travel > 0 && trail.length > 1) {
        const a = trail[0], b = trail[1], leg = distance(a, b);
        if (leg <= travel + .0001) { travel = Math.max(0, travel - leg); trail.shift(); }
        else { const alpha = travel / leg; a.x += (b.x - a.x) * alpha; a.y += (b.y - a.y) * alpha; a.z += (b.z - a.z) * alpha; travel = 0; }
      }
      Object.assign(passenger, trail[0]);
      passenger.velocityX = seconds ? (passenger.x - before.x) / seconds : 0;
      passenger.velocityY = seconds ? (passenger.y - before.y) / seconds : 0;
      passenger.verticalVelocity = 0;
      passenger.sprinting = passenger.sliding = passenger.crouching = passenger.jetActive = false;
      passenger.platformVelocityX = passenger.platformVelocityY = passenger.platformVelocityZ = 0;
      passenger.coyoteMs = passenger.jumpBufferMs = passenger.slideMs = 0;
      passenger.slideHeld = false;
      carry.rope.length = Math.max(FOLLOW_DISTANCE, length - consumed);
      carry.rope.bends = trail.slice(1, -1).reverse().map(p => ({ ...p, z: p.z + 26 }));
    }
  }
  snapshot(): PlayerCarryRope[] {
    return [...this.carries.values()].map(({ rope }) => ({ ...rope, bends: rope.bends.map(point) }));
  }
}

/** A forgiving body-sized hit volume, still requiring a clear aimed shot. */
export function rayCarryPlayer(origin: Point, direction: Point, player: Point, reach: number): number | undefined {
  const center = { x: player.x, y: player.y, z: player.z + 26 };
  const dx = center.x - origin.x, dy = center.y - origin.y, dz = center.z - origin.z;
  // The muzzle can overlap an adjacent body. Ignore that body rather than
  // stealing a cargo shot aimed past an operator standing shoulder to shoulder.
  if (Math.hypot(dx, dy, dz) < 23) return;
  const along = dx * direction.x + dy * direction.y + dz * direction.z;
  const radius = 23;
  const perpendicular = dx * dx + dy * dy + dz * dz - along * along;
  if (perpendicular > radius * radius) return;
  const half = Math.sqrt(Math.max(0, radius * radius - perpendicular));
  if (along + half < 0 || along - half > reach) return;
  return Math.max(0, along - half);
}
