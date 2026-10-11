import { describe, expect, it } from 'vitest';
import { CoopSimulation, quantizePitch } from './CoopSimulation';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsWorldGuest, FriendsWorldHost, worldDiff, worldPatch } from './FriendsWorldReplication';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { compactSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder, SnapshotReplicator } from './snapshotReplication';

const wire = (value: unknown): any => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

describe('Friends replication stress regressions', () => {
  it('round trips 2000 seeded nested state transitions over both JSON patch formats', () => {
    let seed = 0xcafef00d;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const value = (depth: number): unknown => {
      const kind = Math.floor(random() * (depth ? 7 : 5));
      if (kind === 0) return undefined;
      if (kind === 1) return null;
      if (kind === 2) return Math.round(random() * 1000);
      if (kind === 3) return random() > .5;
      if (kind === 4) return `text-${Math.round(random() * 10)}`;
      if (kind === 5) return Array.from({ length: Math.floor(random() * 5) }, () => value(depth - 1));
      return Object.fromEntries(Array.from({ length: Math.floor(random() * 5) }, (_, i) => [`field${i}`, value(depth - 1)]));
    };
    const template = new CoopSimulation([{ id: 'host', label: 'Host', color: '#fff' }]).createSnapshot();
    for (let i = 0; i < 2000; i++) {
      const before = { field: value(3), list: [value(2), value(2)] };
      const after = { field: value(3), list: [value(2), value(2)] };
      expect(worldPatch(wire(before), wire(worldDiff(before, after))), `world case ${i}`).toEqual(wire(after));
      const base = { ...template, auditFixture: before, players: [{ ...template.players[0], auditFixture: before }] };
      const next = { ...template, auditFixture: after, players: [{ ...template.players[0], auditFixture: after }] };
      const decoder = new SnapshotDecoder();
      decoder.decode(wire(compactSnapshotWirePayload({ format: 'coop_snapshot_full', snapshot: base })), 1);
      expect(decoder.decode(wire(compactSnapshotWirePayload(createSnapshotDelta(base, next, 1))), 2), `motion case ${i}`).toEqual(wire(next));
    }
  });

  it('keeps two guests synchronized through 1200 moving, casting and tool-switching simulation ticks', () => {
    const seeds = ['host', 'guest-a', 'guest-b'].map(id => ({ id, label: id, color: '#fff' }));
    const simulation = new FriendsSimulation(seeds), host = new FriendsWorldHost();
    const guests = seeds.slice(1).map(({ id }) => {
      const decoder = new SnapshotDecoder(), replicator = new SnapshotReplicator();
      const guest = new FriendsWorldGuest(message => {
        const m = message as { kind: string; epoch: string; revision: number };
        if (m.kind === 'ack') host.acknowledge(id, m.epoch, m.revision);
        else host.request(id);
      }, () => decoder.reset());
      return { id, guest, decoder, replicator };
    });
    let casts = 0, clearedWeaponFields = 0;
    for (let tick = 1; tick <= 1200; tick++) {
      const phase = tick % 120;
      for (const { id } of seeds) {
        const input: MultiplayerInputFrame = { type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION,
          sequence: tick, clientTime: tick * 50, movement: tick % 40 < 20 ? 1 : 2,
          aimAngle: (tick * 193) % 65536, aimPitch: quantizePitch(.2), selectedSlot: 0,
          friendsTool: phase < 10 ? 0 : phase < 105 ? 7 : 6,
          firing: phase >= 12 && phase < 35, fireActionId: Math.floor(tick / 120) * 2 + (phase >= 12 ? 1 : 0),
          sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false };
        simulation.setInput(id, input);
      }
      simulation.tick(50);
      const snapshot = simulation.createSnapshot();
      casts += snapshot.friends!.fishing!.casts.length;
      if (snapshot.players[0].grenades === undefined) clearedWeaponFields++;
      host.update(snapshot);
      host.pump(guests.map(g => g.id), tick * 50, (id, packet) => {
        guests.find(g => g.id === id)!.guest.receive(packet, tick * 50); return true;
      }, message => { throw new Error(message); });
      for (const { id, guest, replicator, decoder } of guests) {
        const motion = host.motion(id, snapshot) as { snapshot: typeof snapshot };
        expect(motion).toBeDefined();
        const payload = wire(compactSnapshotWirePayload(replicator.payloadFor(id, motion.snapshot, tick)));
        const decoded = decoder.decode(payload, tick);
        expect(decoded).toBeDefined();
        const state = guest.decode({ ...motion, snapshot: decoded });
        expect(state?.players).toEqual(wire(snapshot.players));
        expect(state?.friends?.fishing).toEqual(wire(snapshot.friends!.fishing));
      }
    }
    expect(casts).toBeGreaterThan(100);
    expect(clearedWeaponFields).toBeGreaterThan(1000);
  }, 30000);
});
