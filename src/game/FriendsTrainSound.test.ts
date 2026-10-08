import { describe, expect, it } from 'vitest';
import { FriendsTrainSound, trainAttenuation } from './FriendsTrainSound';
import type { FriendsSnapshot } from './multiplayer/FriendsExpedition';
import { FriendsSimulation } from './multiplayer/FriendsSimulation';
import { FriendsWorldGuest, FriendsWorldHost } from './multiplayer/FriendsWorldReplication';

const listener = { x: 0, y: 0, z: 0 };
const snapshot = (speed: number, x = 80): FriendsSnapshot => ({
  vehicles: [{ id: 'grand-engine', kind: 'train', scenic: true, closed: true, x, y: 0, z: 0, angle: 0, length: 180, width: 112 }],
  scenicRailway: { speed }, trainStoppedMs: 0,
} as FriendsSnapshot);
describe('train sound follows actual shared train state', () => {
  it('stays silent parked and emits each departure, braking, and stop only once', () => {
    const sound = new FriendsTrainSound();
    expect(sound.sample(snapshot(0), listener, 0, 0).mix.engine).toBe(0);
    expect(sound.sample(snapshot(6), listener, 500, 0).events.map(e => e.cue)).toEqual(['trainDepart']);
    expect(sound.sample(snapshot(80), listener, 1000, 0).events).toHaveLength(0);
    expect(sound.sample(snapshot(20), listener, 1500, 0).events.map(e => e.cue)).toEqual(['trainBrake']);
    expect(sound.sample(snapshot(0), listener, 2000, 0).events).toHaveLength(0);
    expect(sound.sample(snapshot(0), listener, 3000, 0).events.map(e => e.cue)).toEqual(['trainStop']);
    expect(sound.sample(snapshot(0), listener, 3500, 0).events).toHaveLength(0);
  });
  it('uses 3D distance, fades smoothly, and never plays departure for a late join', () => {
    const sound = new FriendsTrainSound(), near = sound.sample(snapshot(180), listener, 0, 0);
    expect(near.events).toHaveLength(0); expect(near.mix.engine).toBeGreaterThan(0);
    const far = sound.sample(snapshot(180), { ...listener, z: 3000 }, 500, 0);
    expect(far.mix.engine).toBe(0); expect(far.mix.rail).toBe(0); expect(far.events).toHaveLength(0);
    expect(trainAttenuation(1400)).toBe(0); expect(trainAttenuation(0)).toBe(1);
  });
  it('deduplicates horn snapshots and ignores old horns on join', () => {
    const sound = new FriendsTrainSound(); sound.sample(snapshot(0), listener, 0, 0);
    const f = { ...snapshot(0), trainHorn: { serial: 1, atMs: 500, vehicleId: 'grand-engine' } };
    expect(sound.sample(f, listener, 500, 0).events.map(e => e.cue)).toEqual(['trainHorn']);
    expect(sound.sample(f, listener, 1000, 0).events).toHaveLength(0);
    expect(new FriendsTrainSound().sample(f, listener, 1000, 0).events).toHaveLength(0);
  });
  it('keeps a nearby parked train from masking another moving train', () => {
    const f = snapshot(180, 600);
    f.vehicles.push({ ...f.vehicles[0], id: 'sunline-engine', scenic: false, x: 30 });
    f.trainStoppedMs = 1000;
    const sample = new FriendsTrainSound().sample(f, listener, 0, 0);
    expect(sample.mix.engine).toBeGreaterThan(0); expect(sample.mix.rail).toBeGreaterThan(0);
  });
  it('validates horn range, access, cooldown, command replay, and guest replication at the host', () => {
    const sim = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#fff' }, { id: 'guest', label: 'Guest', color: '#aaa' }]);
    const hostActor = sim['players'].get('host')!, guestActor = sim['players'].get('guest')!;
    Object.assign(hostActor, { x: 0, y: 0, z: 6000 });
    expect(sim.friendsAction('host', { requestId: 1, action: 'train_horn' }).ok).toBe(false);
    const car = sim['friends']!.vehicles().find(v => v.id === 'grand-0')!;
    Object.assign(hostActor, { x: car.x, y: car.y, z: car.z });
    const worldHost = new FriendsWorldHost(), worldGuest = new FriendsWorldGuest((m: any) => { if (m.kind === 'ack') worldHost.acknowledge('guest', m.epoch, m.revision); }, () => {});
    worldHost.request('guest'); worldHost.update(sim.createSnapshot());
    worldHost.pump(['guest'], 0, (_id, packet) => { worldGuest.receive(packet, 0); return true; }, message => { throw Error(message); });
    expect(sim.friendsAction('host', { requestId: 2, action: 'train_horn' }).ok).toBe(true);
    expect(sim.friendsAction('host', { requestId: 2, action: 'train_horn' }).ok).toBe(true);
    expect(sim.createSnapshot().friends!.trainHorn?.serial).toBe(1);
    expect(worldGuest.decode(worldHost.motion('guest', sim.createSnapshot()))?.friends?.trainHorn?.serial).toBe(1);
    expect(sim.friendsAction('host', { requestId: 3, action: 'train_horn' }).ok).toBe(false);
    Object.assign(guestActor, { x: car.x, y: car.y, z: car.z }); sim['friendsBuilding']!.setGuestAccess(false);
    expect(sim.friendsAction('guest', { requestId: 4, action: 'train_horn' }).ok).toBe(false);
    expect(sim['friends']!.soundTrainHorn(hostActor, 8000)).toBeUndefined();
    expect(sim.createSnapshot().friends!.trainHorn?.serial).toBe(2);
  }, 60000);
});
