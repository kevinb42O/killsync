/** Shared deterministic world clock. One real second is one in-game minute.
 * Use world elapsed time, never a client's wall clock or accumulated frames. */
export const FRONTIER_DAY_DURATION_MS = 24 * 60 * 1000;
export const FRONTIER_START_HOUR = 9;
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export type FrontierDayPhase = 'Dawn' | 'Day' | 'Dusk' | 'Night';
export function sampleFrontierDayNight(elapsedMs: number) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const days = elapsed / FRONTIER_DAY_DURATION_MS + FRONTIER_START_HOUR / 24;
  const fraction = days % 1, hour = fraction * 24;
  const angle = (fraction - .25) * TAU;
  // Orthogonal orbital axes keep the sun away from the zenith singularity.
  const c = Math.cos(angle), s = Math.sin(angle);
  const sunDirection: [number, number, number] = [.832050294 * c + .316227766 * s, .821583836 * s, -.554700196 * c + .474341649 * s];
  const moonDirection = sunDirection.map(n => -n) as [number, number, number];
  const elevation = sunDirection[1];
  const daylight = smooth(-.12, .32, elevation);
  const stars = 1 - smooth(-.24, -.035, elevation);
  const twilight = (1 - smooth(.02, .42, Math.abs(elevation))) * smooth(-.30, -.06, elevation);
  const sunIntensity = 1.85 * smooth(-.025, .30, elevation);
  const moonIntensity = .24 * smooth(0, .30, -elevation) * (1 - daylight);
  const phase: FrontierDayPhase = hour >= 5 && hour < 7 ? 'Dawn' : hour >= 7 && hour < 17 ? 'Day' : hour >= 17 && hour < 19 ? 'Dusk' : 'Night';
  const minutes = Math.floor(hour * 60 + 1e-7) % 1440;
  return {
    hour, day: Math.floor(days) + 1, phase, daylight, stars, twilight,
    sunDirection, moonDirection, sunIntensity, moonIntensity,
    ambientIntensity: .055 + .595 * daylight,
    fillIntensity: .14 + .46 * daylight,
    exposure: .96 - .06 * daylight,
    clock: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  };
}
export type FrontierDayNightSample = ReturnType<typeof sampleFrontierDayNight>;
