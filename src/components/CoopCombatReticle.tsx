export type CoopReticleMode = 'hip' | 'ads' | 'spell';

/**
 * One high-contrast reticle for every co-op firearm view. The dark stroke is
 * deliberately rendered as real geometry beneath the bright stroke, so blend
 * effects, white boss flashes, gas, and muzzle light cannot erase the aim point.
 */
export function CoopCombatReticle({ mode }: { mode: CoopReticleMode }) {
  const arms = mode === 'ads'
    ? 'M50 9V35 M50 65V91 M9 50H35 M65 50H91'
    : 'M50 15V36 M50 64V85 M15 50H36 M64 50H85';

  return (
    <div className={`coop-combat-reticle coop-combat-reticle--${mode}`} aria-hidden="true">
      <svg className="coop-combat-reticle__graphic" viewBox="0 0 100 100">
        {mode === 'spell' && <><circle className="coop-combat-reticle__spell-ring" cx="50" cy="50" r="27" /><path className="coop-combat-reticle__spell-ring" d="M50 8L54 18L50 22L46 18Z M92 50L82 54L78 50L82 46Z M50 92L46 82L50 78L54 82Z M8 50L18 46L22 50L18 54Z" /></>}
        <path className="coop-combat-reticle__arms coop-combat-reticle__arms--edge" d={arms} />
        <path className="coop-combat-reticle__arms coop-combat-reticle__arms--light" d={arms} />
        <circle className="coop-combat-reticle__dot-edge" cx="50" cy="50" r="5.4" />
        <circle className="coop-combat-reticle__dot" cx="50" cy="50" r="2.15" />
      </svg>
    </div>
  );
}
