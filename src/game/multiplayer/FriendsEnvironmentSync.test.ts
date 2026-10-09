import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { CoopSimulation, type CoopSnapshot } from './CoopSimulation';
import { FriendsWorldHost, FriendsWorldGuest } from './FriendsWorldReplication';
import { compactSnapshotWirePayload, expandSnapshotWirePayload, SnapshotDecoder, SnapshotReplicator } from './snapshotReplication';
import { FriendsEnvironmentPreview, type FriendsEnvironmentChange } from '../world/FriendsEnvironmentPreview';

const seeds = [{ id: 'host', label: 'Host', color: '#0ff' }, { id: 'guest', label: 'Guest', color: '#f0f' }];

function connection(simulation: FriendsSimulation, peerId: string) {
  const host = new FriendsWorldHost(), replicator = new SnapshotReplicator(), decoder = new SnapshotDecoder();
  const guest = new FriendsWorldGuest(message => {
    const ack = message as { kind: string; epoch: string; revision: number };
    if (ack.kind === 'ack') host.acknowledge(peerId, ack.epoch, ack.revision);
  }, () => {});
  let tick = 0;
  return () => {
    const snapshot = simulation.createSnapshot();
    host.update(snapshot);
    host.pump([peerId], snapshot.elapsedMs, (_id, packet) => { guest.receive(packet, snapshot.elapsedMs); return true; }, message => { throw new Error(message); });
    const motion = host.motion(peerId, snapshot) as { snapshot: CoopSnapshot };
    const wire = JSON.parse(JSON.stringify(compactSnapshotWirePayload({ ...motion, snapshot: replicator.payloadFor(peerId, motion.snapshot, ++tick) })));
    const envelope = expandSnapshotWirePayload(wire) as { snapshot: unknown };
    const decoded = decoder.decode(envelope.snapshot, tick);
    expect(decoded).toBeDefined();
    const result = guest.decode({ ...envelope, snapshot: decoded });
    expect(result?.friends?.environment).toEqual(snapshot.friends?.environment);
    return result!;
  };
}

function sample(snapshot: CoopSnapshot, clock = new FriendsEnvironmentPreview()) {
  clock.synchronize(snapshot.friends!.environment!);
  clock.time(snapshot.world.elapsedMs, snapshot.elapsedMs);
  return { ...clock.state, windSeconds: clock.windSeconds };
}

function advance(simulation: FriendsSimulation, milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) simulation.tick(50);
}

describe('host-authoritative Friends environment synchronization', () => {
  it('replicates presets, pause/resume, rate changes, wind and reset through compact keyframes and deltas', () => {
    const simulation = new FriendsSimulation(seeds), receive = connection(simulation, 'guest');
    expect(sample(receive())).toMatchObject({ clock: '09:00', enabled: false, speed: 1 });
    const change = (settings: FriendsEnvironmentChange) => {
      expect(simulation.setFriendsEnvironment('host', settings)).toBeDefined();
      const guestState = sample(receive());
      expect(guestState).toEqual(sample(simulation.createSnapshot()));
      return guestState;
    };
    expect(change({ hour: 0, speed: 0 })).toMatchObject({ clock: '00:00', phase: 'Night' });
    advance(simulation, 1000);
    expect(sample(receive())).toMatchObject({ clock: '00:00', windSeconds: 1 });
    expect(change({ speed: 120, windSpeed: 4 })).toMatchObject({ resumeSpeed: 120, windSeconds: 1 });
    advance(simulation, 500);
    expect(sample(receive())).toMatchObject({ clock: '01:00', windSeconds: 3 });
    const before = sample(simulation.createSnapshot()).elapsedMs;
    expect(change({ speed: .25 }).elapsedMs).toBe(before);
    advance(simulation, 1000);
    expect(sample(receive()).elapsedMs).toBe(before + 250);
    expect(change({ hour: 12, speed: 0 })).toMatchObject({ clock: '12:00', phase: 'Day' });
    expect(change({ reset: true })).toMatchObject({ enabled: false, speed: 1, resumeSpeed: 1, windSpeed: 1, elapsedMs: 2500 });
  });

  it('gives late joiners the current accelerated phase and overrides stale local previews', () => {
    const simulation = new FriendsSimulation(seeds);
    advance(simulation, 1000);
    simulation.setFriendsEnvironment('host', { hour: 23, speed: 120, windSpeed: 0 });
    advance(simulation, 1000);
    const receive = connection(simulation, 'late-guest');
    const local = new FriendsEnvironmentPreview();
    local.change({ hour: 12, speed: 0, windSpeed: 4 });
    expect(sample(receive(), local)).toEqual(sample(simulation.createSnapshot()));
    expect(local.state).toMatchObject({ clock: '01:00', speed: 120, windSpeed: 0 });
  });

  it('rejects guest changes and does not add an environment to survival mode', () => {
    const simulation = new FriendsSimulation(seeds), before = simulation.createSnapshot().friends!.environment;
    expect(simulation.setFriendsEnvironment('guest', { hour: 0, speed: 0 })).toBeUndefined();
    expect(simulation.createSnapshot().friends!.environment).toEqual(before);
    const survival = new CoopSimulation(seeds);
    expect(survival.setFriendsEnvironment('host', { hour: 0 })).toBeUndefined();
    expect(survival.createSnapshot().friends).toBeUndefined();
  });
});
