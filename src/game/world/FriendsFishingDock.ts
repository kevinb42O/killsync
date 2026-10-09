export const ROWBOAT_ID='reedwater-skiff';
export const OPPOSITE_ROWBOAT_ID='deepmere-skiff';
export function isRowboatSeat(seat:{vehicleId:string;index:number}|undefined){return seat?.vehicleId===ROWBOAT_ID||seat?.vehicleId===OPPOSITE_ROWBOAT_ID;}

/** The Deepmere fishing dock sits beside the shared skiff's original mooring. */
export const FRIENDS_FISHING_DOCK = {
  x: 13624,
  y: 22440,
  angle: 2.60,
  deck: 192,
  length: 420,
  pierWidth: 104,
} as const;

/** A separate low casting deck on the shallow northwest edge of Deepmere. */
export const FRIENDS_FISHING_PLATFORM = {
  x: 13550,
  y: 22200,
  angle: 0,
  deck: 160,
  length: 150,
  width: 120,
} as const;

/** The opposite-bank landing faces back across Deepmere toward the first dock. */
export const FRIENDS_OPPOSITE_DOCK = {
  x: 10196,
  y: 24780,
  angle: -0.548,
  deck: 160,
  length: 460,
  width: 104,
} as const;

const oppositeBoatAlong = 150, oppositeBoatAcross = 130;
export const FRIENDS_OPPOSITE_BOAT = {
  x: FRIENDS_OPPOSITE_DOCK.x + oppositeBoatAlong * Math.cos(FRIENDS_OPPOSITE_DOCK.angle) - oppositeBoatAcross * Math.sin(FRIENDS_OPPOSITE_DOCK.angle),
  y: FRIENDS_OPPOSITE_DOCK.y + oppositeBoatAlong * Math.sin(FRIENDS_OPPOSITE_DOCK.angle) + oppositeBoatAcross * Math.cos(FRIENDS_OPPOSITE_DOCK.angle),
  angle: FRIENDS_OPPOSITE_DOCK.angle,
} as const;

/** Small downward cuts flatten only the landings and the independent fishing pad. */
export const FRIENDS_DOCK_LANDSCAPE_CUTS = [
  { x: 13804, y: 22332, top: 192, core: 40, collar: 48 },
  { x: 13600, y: 22200, top: 160, core: 120, collar: 100 },
  { x: 9957, y: 24926, top: 160, core: 42, collar: 38 },
] as const;

/** Local deck coordinates use the same X/Z frame as the dock's Three.js group. */
export function friendsFishingDockSurface(x: number, y: number) {
  const dx = x - FRIENDS_FISHING_DOCK.x, dy = y - FRIENDS_FISHING_DOCK.y;
  const c = Math.cos(FRIENDS_FISHING_DOCK.angle), s = Math.sin(FRIENDS_FISHING_DOCK.angle);
  const along = dx * c + dy * s;
  const across = -dx * s + dy * c;
  const firstDock = Math.abs(along) <= FRIENDS_FISHING_DOCK.length / 2 && Math.abs(across) <= FRIENDS_FISHING_DOCK.pierWidth / 2;
  const secondDx = x - FRIENDS_OPPOSITE_DOCK.x, secondDy = y - FRIENDS_OPPOSITE_DOCK.y;
  const c2 = Math.cos(FRIENDS_OPPOSITE_DOCK.angle), s2 = Math.sin(FRIENDS_OPPOSITE_DOCK.angle);
  const secondAlong = secondDx * c2 + secondDy * s2;
  const secondAcross = -secondDx * s2 + secondDy * c2;
  const secondDock = Math.abs(secondAlong) <= FRIENDS_OPPOSITE_DOCK.length / 2 && Math.abs(secondAcross) <= FRIENDS_OPPOSITE_DOCK.width / 2;
  const secondApproach = secondAlong >= -FRIENDS_OPPOSITE_DOCK.length / 2 - 80 && secondAlong < -FRIENDS_OPPOSITE_DOCK.length / 2
    && Math.abs(secondAcross) <= FRIENDS_OPPOSITE_DOCK.width / 2 + 10;
  const platformDx = x - FRIENDS_FISHING_PLATFORM.x, platformDy = y - FRIENDS_FISHING_PLATFORM.y;
  const cp = Math.cos(FRIENDS_FISHING_PLATFORM.angle), sp = Math.sin(FRIENDS_FISHING_PLATFORM.angle);
  const platformAlong = platformDx * cp + platformDy * sp;
  const platformAcross = -platformDx * sp + platformDy * cp;
  const fishingPlatform = Math.abs(platformAlong) <= FRIENDS_FISHING_PLATFORM.length / 2
    && Math.abs(platformAcross) <= FRIENDS_FISHING_PLATFORM.width / 2;
  if (firstDock) return FRIENDS_FISHING_DOCK.deck;
  if (secondDock || secondApproach) return FRIENDS_OPPOSITE_DOCK.deck;
  if (fishingPlatform) return FRIENDS_FISHING_PLATFORM.deck;
  return undefined;
}
