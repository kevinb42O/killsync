import type { MultiplayerInputFrame } from './protocol';

export const CONFETTI_TOOL = 11 as const;
export type FriendsConfettiBurst = {
  id: number;
  playerId: string;
  x: number;
  y: number;
  z: number;
  angle: number;
  atMs: number;
};
export type FriendsConfettiSnapshot = { bursts: FriendsConfettiBurst[] };

type ConfettiActor = { id: string; x: number; y: number; z: number; lifeState: string; swimming?: boolean; friendsDevFlight?: boolean };
const BURST_LIFETIME_MS = 3_800;
const MAX_RECORDED_BURSTS = 24;

/** Small host-owned event log: only burst origins travel over the wire. */
export class FriendsConfetti {
  private serial = 0;
  private bursts: FriendsConfettiBurst[] = [];
  private lastFire = new Map<string, number>();
  private lastBurstAt = new Map<string, number>();

  update(now: number, players: readonly ConfettiActor[], inputs: ReadonlyMap<string, MultiplayerInputFrame>) {
    const ids = new Set(players.map(player => player.id));
    for (const player of players) {
      const input = inputs.get(player.id);
      const action = input?.fireActionId ?? 0;
      const previous = this.lastFire.get(player.id) ?? 0;
      this.lastFire.set(player.id, Math.max(previous, action));
      if (action <= previous || input?.friendsTool !== CONFETTI_TOOL || player.lifeState !== 'alive'
        || player.swimming || player.friendsDevFlight || input.friendsFishingBlocked) continue;

      // One burst per short interval prevents an input device from flooding snapshots.
      if (now - (this.lastBurstAt.get(player.id) ?? -Infinity) < 180) continue;
      this.lastBurstAt.set(player.id, now);
      const angle = input.aimAngle / 65535 * Math.PI * 2;
      this.bursts.push({
        id: ++this.serial,
        playerId: player.id,
        x: player.x + Math.cos(angle) * 18,
        y: player.y + Math.sin(angle) * 18,
        z: player.z + 52,
        angle,
        atMs: now,
      });
    }
    for (const id of this.lastFire.keys()) if (!ids.has(id)) { this.lastFire.delete(id); this.lastBurstAt.delete(id); }
    this.bursts = this.bursts.filter(burst => now - burst.atMs < BURST_LIFETIME_MS).slice(-MAX_RECORDED_BURSTS);
  }

  snapshot(): FriendsConfettiSnapshot | undefined {
    return this.bursts.length ? { bursts: this.bursts.map(burst => ({ ...burst })) } : undefined;
  }
}
