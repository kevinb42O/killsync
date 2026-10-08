import type { FriendsSnapshot, FriendsVehicle } from './multiplayer/FriendsExpedition';

export type TrainCue = 'trainDepart' | 'trainBrake' | 'trainStop' | 'trainHorn';
export type TrainSoundMix = { engine: number; rail: number; enginePan: number; railPan: number; rate: number; nearby: boolean };
export const QUIET_TRAIN: TrainSoundMix = { engine: 0, rail: 0, enginePan: 0, railPan: 0, rate: 1, nearby: false };
type Point = { x: number; y: number; z: number };
type Motion = Point & { at: number; speed: number; moving: boolean; braked: boolean; stoppedAt?: number };
export function trainAttenuation(distance: number, range = 1400) {
  const n = Math.max(0, Math.min(1, 1 - distance / range)); return n * n * (3 - 2 * n);
}

/** Two train families, not individual wagons. Sample at 2 Hz using existing
 * snapshots; no physics, timers, or additional motion replication. */
export class FriendsTrainSound {
  private previous = new Map<boolean, Motion>();
  private lastHorn?: number;
  private lastTime = -1;
  sample(friends: FriendsSnapshot, listener: Point, at: number, yaw: number, underground = false) {
    if (at < this.lastTime) { this.previous.clear(); this.lastHorn = undefined; }
    this.lastTime = at;
    const events: { cue: TrainCue; volume: number; pan: number }[] = [];
    const mix = { ...QUIET_TRAIN }; let closest = Infinity;
    const spatial = (vehicle: FriendsVehicle, range: number) => {
      const dx = vehicle.x - listener.x, dy = vehicle.y - listener.y;
      const d = Math.hypot(dx, dy, vehicle.z - listener.z);
      return { distance: d, gain: trainAttenuation(d, range) * (underground && d > 350 ? .12 : 1), pan: Math.sin(Math.atan2(dy, dx) - yaw) * .85 };
    };
    for (const scenic of [false, true]) {
      const cars = friends.vehicles.filter(v => v.kind === 'train' && Boolean(v.scenic) === scenic);
      const engine = cars.find(v => v.closed); if (!engine) { this.previous.delete(scenic); continue; }
      const old = this.previous.get(scenic), dt = old ? (at - old.at) / 1000 : 0;
      const speed = scenic ? friends.scenicRailway?.speed ?? 0 : old
        ? dt > 0 ? Math.min(1200, Math.hypot(engine.x - old.x, engine.y - old.y, engine.z - old.z) / dt) : old.speed
        : friends.trainStoppedMs > 0 || friends.transport?.held ? 0 : 180;
      const state: Motion = { x: engine.x, y: engine.y, z: engine.z, at, speed, moving: old?.moving ?? speed > 5, braked: old?.braked ?? false, stoppedAt: old?.stoppedAt };
      let nearest = engine, nearestSpatial = spatial(engine, 900);
      for (const car of cars) { const s = spatial(car, 900); if (s.distance < nearestSpatial.distance) { nearest = car; nearestSpatial = s; } }
      const motor = spatial(engine, 1400), cueSource = spatial(nearest, 1400);
      const emit = (cue: TrainCue, level: number) => { if (cueSource.gain > .015) events.push({ cue, volume: level * cueSource.gain, pan: cueSource.pan }); };
      // The first sample establishes state. Late joins and teleports don't depart.
      if (old && dt > 0 && dt <= 2) {
        if (!state.moving && speed > 5) { state.moving = true; state.braked = false; state.stoppedAt = undefined; emit('trainDepart', .25); }
        if (state.moving && old.speed > 35 && speed < 30 && !state.braked) { state.braked = true; emit('trainBrake', .19); }
        if (state.moving && speed < 1) {
          state.stoppedAt ??= at;
          if (at - state.stoppedAt >= 1000) { state.moving = false; emit('trainStop', .22); }
        } else state.stoppedAt = undefined;
      }
      mix.nearby ||= spatial(engine, 2400).gain > .015 || cueSource.gain > .015;
      if (speed > 1 && nearestSpatial.distance < closest) {
        closest = nearestSpatial.distance; const rolling = Math.min(1, Math.max(0, speed - 1) / 35);
        Object.assign(mix, { engine: .24 * motor.gain * rolling, rail: .18 * nearestSpatial.gain * rolling,
          enginePan: motor.pan, railPan: nearestSpatial.pan, rate: .72 + .48 * Math.min(1, speed / 450) });
      }
      this.previous.set(scenic, state);
    }
    const horn = friends.trainHorn;
    if (horn && this.lastHorn !== undefined && horn.serial !== this.lastHorn && at - horn.atMs >= 0 && at - horn.atMs < 4000) {
      const engine = friends.vehicles.find(v => v.id === horn.vehicleId);
      if (engine) { const s = spatial(engine, 2400); if (s.gain > .015) events.push({ cue: 'trainHorn', volume: .37 * s.gain, pan: s.pan }); }
    }
    this.lastHorn = horn?.serial ?? this.lastHorn ?? 0;
    return { mix, events };
  }
}
