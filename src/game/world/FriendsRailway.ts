/** A surveyed scenic railway, sampled by arc length. Carriages and map/render
 * geometry all consume this same route; none invent their own corners. */
export const RAIL_WAYPOINTS = [
  [6200, 4870], [7520, 4740], [8580, 5260], [9510, 6420],
  // Keep the whole carriage, including riders at its sides, clear of the
  // eastern greenhouse before turning toward the garden station.
  [9550, 7360], [8450, 8130], [7280, 8900], [6200, 9340],
  [4920, 9210], [3680, 8590], [3210, 7450], [3340, 6120], [4450, 5120],
] as const;
type RoutePoint = { x: number; y: number; distance: number };
const points: RoutePoint[] = [];
const at = (i: number) => RAIL_WAYPOINTS[(i + RAIL_WAYPOINTS.length) % RAIL_WAYPOINTS.length];
const cubic = (a: number, b: number, c: number, d: number, t: number) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
let distance = 0;
for (let i = 0; i <= RAIL_WAYPOINTS.length * 100; i++) {
  const segment = Math.floor(i / 100), t = i % 100 / 100;
  const a = at(segment - 1), b = at(segment), c = at(segment + 1), d = at(segment + 2);
  const x = cubic(a[0], b[0], c[0], d[0], t), y = cubic(a[1], b[1], c[1], d[1], t);
  if (points.length) distance += Math.hypot(x - points.at(-1)!.x, y - points.at(-1)!.y);
  points.push({ x, y, distance });
}
export const TRAIN_LOOP_LENGTH = distance;
export const TRAIN_STOPS = [420, points[400].distance, points[700].distance, points[1000].distance];
export const FRIENDS_STATION_PLATFORM = { halfLength: 200, depth: 112, offset: 165, height: 8, roofHalfLength: 175, roofDepth: 124, roofOffset: 175, roofBottom: 148, roofTop: 154 } as const;
export const INITIAL_TRAIN_DISTANCE = TRAIN_STOPS[0];
export const RAIL_STATIONS = TRAIN_STOPS.map((d, i) => ({ id: ['depot', 'garden', 'archive', 'wreck'][i], name: ['Sunline Station', 'Glass Gardens', 'Echo Observatory', 'Rustwater Outpost'][i], distance: d, ...sampleTrainRoute(d - 390) }));
export function sampleTrainRoute(distance: number): { x: number; y: number; angle: number } {
  const d = ((distance % TRAIN_LOOP_LENGTH) + TRAIN_LOOP_LENGTH) % TRAIN_LOOP_LENGTH;
  let lo = 0, hi = points.length - 1;
  while (lo + 1 < hi) { const m = (lo + hi) >>> 1; if (points[m].distance <= d) lo = m; else hi = m; }
  const a = points[lo], b = points[hi], t = (d - a.distance) / Math.max(.001, b.distance - a.distance);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
export function railwayDistance(x: number, y: number) {
  let closest = Infinity;
  // Segment distance protects the complete track, including between samples.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const ex = x - a.x - t * dx, ey = y - a.y - t * dy;
    closest = Math.min(closest, ex * ex + ey * ey);
  }
  return Math.sqrt(closest);
}
