import { FRONTIER_SIZE } from '../world/FriendsTerrain';

export const FRIENDS_MENU_SCENERY = {
  timeScale: 60,
  windSpeed: .5,
  radius: 36000,
  altitude: 12000,
  cloudAltitude: 4300,
  descentDurationMs: 65000,
  orbitDurationMs: 360000,
  center: { x: FRONTIER_SIZE / 2, y: 600, z: FRONTIER_SIZE / 2 },
} as const;

const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const swell = (elapsed: number, duration: number) => (1 - Math.cos(elapsed / duration * Math.PI * 2)) / 2;

/** Continuous camera choreography; no shot cuts or loop-reset teleport. */
export function friendsMenuCameraPose(elapsedMs: number) {
  const elapsed = Math.max(0, elapsedMs);
  const { center, altitude, cloudAltitude, descentDurationMs, orbitDurationMs } = FRIENDS_MENU_SCENERY;
  const descent = ease(Math.min(1, elapsed / descentDurationMs));
  const cruise = Math.max(0, elapsed - descentDurationMs);
  const lap = elapsed / orbitDurationMs * Math.PI * 2;
  const angle = Math.PI * .18 + lap + .14 * Math.sin(lap) + .035 * Math.sin(lap * 2);
  // A slow coastal dolly reveals the railway and landmarks at different scales.
  const cruiseRadius = 35000 - 2400 * swell(cruise, 260000);
  const radius = FRIENDS_MENU_SCENERY.radius + (cruiseRadius - FRIENDS_MENU_SCENERY.radius) * descent;
  const y = altitude + (cloudAltitude - altitude) * descent
    + 1450 * swell(cruise, 230000) + 600 * swell(cruise, 155000);
  return {
    position: { x: center.x + Math.cos(angle) * radius, y, z: center.z + Math.sin(angle) * radius },
    // The central island stays the subject. Modest framing changes provide
    // foreground parallax while preserving a level horizon and a calm form.
    target: {
      x: center.x + 900 * Math.sin(lap * .5) * descent,
      y: center.y + (300 + 200 * Math.sin(lap * .75)) * descent,
      z: center.z + 700 * Math.sin(lap * .75) * descent,
    },
  };
}

export function friendsMenuCameraPosition(elapsedMs: number) { return friendsMenuCameraPose(elapsedMs).position; }
