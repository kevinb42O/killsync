import type { FriendsVehicle } from './multiplayer/FriendsExpedition';
import { SILENT_SPATIAL, spatialSound, type SoundPoint } from './FriendsWorldSound';

/** Two shared recordings sampled with the existing 2 Hz soundscape update.
 * Propulsion follows confirmed helm/speed state; wave bobbing cannot rev it. */
export function friendsBoatSound(vehicles: readonly FriendsVehicle[], listener: SoundPoint, yaw: number, underground = false) {
  const mix = { boatEngine: SILENT_SPATIAL, boatWater: SILENT_SPATIAL };
  if (underground) return mix;
  for (const boat of vehicles) {
    if (boat.kind !== 'fishingBoat') continue;
    const speed = Number.isFinite(boat.speed) ? Math.min(1, Math.abs(boat.speed!) / 220) : 0;
    const water = spatialSound(boat, listener, yaw, 600, .055 + .075 * speed);
    if (water.volume > mix.boatWater.volume) mix.boatWater = { ...water, cutoff: 6500 };
    if (!boat.pilotId || boat.moored) continue;
    const engine = spatialSound(boat, listener, yaw, 1200, .10 + .14 * speed);
    if (engine.volume > mix.boatEngine.volume) mix.boatEngine = { ...engine, rate: .85 + .30 * speed, cutoff: 5500 };
  }
  return mix;
}
