import type { WorldObstacle } from './WorldLayout';

// Arrival, transport and construction are separate places connected by paths.
export const FRIENDS_HUB = { x: 5900, y: 5620 };
export const FRIENDS_AIRPAD = { x: 4700, y: 5720 };
export const FRIENDS_BUILD_MEADOW = { x: 6260, y: 6100, radius: 540 };
export const FRIENDS_LAKE = { x: 7440, y: 6520, rx: 1040, ry: 710 };
export const FRIENDS_SALVAGE = { x: 4260, y: 7050, radius: 620, ceiling: 300 };
export const FRIENDS_GARDEN_TERRACE = { x: 8352, y: 7530, z: 128 };
export const FRIENDS_MARKETS = [{ x: 5780, y: 5450 }, { x: 8630, y: 7340 }, { x: 6350, y: 8860 }];
export const FRIENDS_FOUNDRY = { x: 5520, y: 5460 };
export const FRIENDS_PLACES = [
  { id: 'depot', name: 'SUNLINE COMMONS', x: 5900, y: 5500, color: '#ffd494', description: 'Build a place to call yours. The station is north, the aircraft bay west.' },
  { id: 'garden', name: 'GLASS GARDENS', x: 8630, y: 7340, color: '#8de6ce', description: 'A lakeside garden. Build a way up to its sun terrace.' },
  { id: 'archive', name: 'THE ECHO ARCHIVE', x: 6280, y: 8650, color: '#d4b3ff', description: 'Old stone, tall pines and a sky waiting to be rediscovered.' },
  { id: 'wreck', name: 'RUSTWATER SALVAGE', x: 4220, y: 7200, color: '#ffa08c', description: 'An optional combat reserve. Outside its marked boundary, you are safe.' },
] as const;
export const FRIENDS_SIGNALS = [
  { id: 'garden', x: 8670, y: 7490, title: 'The gardener’s recording', text: '“We sent the last light south. The observatory should remember.”' },
  { id: 'archive', x: 6300, y: 8890, title: 'The astronomer’s recording', text: '“Three lights, one home. Find the lost relay by the rustwater wreck.”' },
  { id: 'wreck', x: 4220, y: 7790, title: 'The missing relay', text: '“Bring the signal home. There is still someone listening.”' },
] as const;
export function insideFriendsCombat(x: number, y: number, z = 0) {
  return z >= 0 && z < FRIENDS_SALVAGE.ceiling && Math.hypot(x - FRIENDS_SALVAGE.x, y - FRIENDS_SALVAGE.y) < FRIENDS_SALVAGE.radius - 2;
}
/** The frontier has no prebuilt settlement or invisible landmark walls. */
export function friendsRegionObstacles(): WorldObstacle[] { return []; }
