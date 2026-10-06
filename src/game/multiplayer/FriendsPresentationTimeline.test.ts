import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import type { CoopSnapshot } from './CoopSimulation';
import { FriendsPresentationTimeline } from './FriendsPresentationTimeline';
import { interpolateCoopSnapshot, CoopSnapshotInterpolator } from './snapshotInterpolation';
import { vehicleLocal } from './FriendsExpedition';

const seed = [{ id: 'host', label: 'Host', color: '#8de6ce' }];
describe('Friends vehicle presentation', () => {
  it('interpolates passenger coordinates relative to a turning deck, rather than cutting through its world-space arc', () => {
    const s = new FriendsSimulation(seed), a = s.createSnapshot(), b = s.createSnapshot();
    const before = a.friends!.vehicles.find(v=>v.kind==='aircraft')!, after = b.friends!.vehicles.find(v=>v.kind==='aircraft')!; after.x += 70; after.y += 90; after.z += 80; after.angle = 1.2;
    Object.assign(a.players[0], { x: before.x - 45, y: before.y + 35, z: before.z });
    Object.assign(b.players[0], { x: after.x - 45 * Math.cos(after.angle) - 35 * Math.sin(after.angle), y: after.y - 45 * Math.sin(after.angle) + 35 * Math.cos(after.angle), z: after.z });
    for (const interpolate of [interpolateCoopSnapshot, (beforeFrame: CoopSnapshot, afterFrame: CoopSnapshot, t: number) => new CoopSnapshotInterpolator().interpolate(beforeFrame, afterFrame, t)]) {
      const frame = interpolate(a, b, .5), v = frame.friends!.vehicles.find(v=>v.kind==='aircraft')!, p = frame.players[0], local = vehicleLocal(v, p.x, p.y);
      expect(local.x).toBeCloseTo(-45, 8); expect(local.y).toBeCloseTo(35, 8); expect(p.z).toBe(v.z);
    }
  });
  it('keeps movement monotonic and continuous across irregular packet arrival times', () => {
    const s = new FriendsSimulation(seed), packets = Array.from({ length: 31 }, (_, i) => {
      const frame = s.createSnapshot(); frame.tick = i; frame.elapsedMs = i * 50;
      frame.friends!.vehicles[0].x = 6000 + i * 9;
      return { frame, arrival: 1000 + i * 50 + (i % 4 === 2 ? 32 : i % 4 === 3 ? 5 : 0) };
    });
    const timeline = new FriendsPresentationTimeline(120); let index = 0, previousX: number | undefined, previousDelta = 0;
    for (let now = 1000; now < 2450; now += 1000 / 60) {
      while (index < packets.length && packets[index].arrival <= now) { timeline.push(packets[index].frame, packets[index].arrival); index++; }
      const frame = timeline.sample(now); if (!frame) continue;
      const x = frame.friends!.vehicles[0].x;
      if (previousX !== undefined && now > 1200) { const delta = x - previousX; expect(delta).toBeGreaterThan(2.5); expect(delta).toBeLessThan(3.5); expect(Math.abs(delta - previousDelta)).toBeLessThan(.6); previousDelta = delta; }
      else previousDelta = 3;
      previousX = x;
    }
  });
});
