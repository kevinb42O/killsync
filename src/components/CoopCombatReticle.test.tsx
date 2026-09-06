import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoopCombatReticle } from './CoopCombatReticle';

describe('CoopCombatReticle', () => {
  it.each(['hip', 'ads'] as const)('renders a dark underlay and bright inner stroke in %s mode', mode => {
    const markup = renderToStaticMarkup(<CoopCombatReticle mode={mode} />);
    expect(markup).toContain(`coop-combat-reticle--${mode}`);
    expect(markup).toContain('coop-combat-reticle__arms--edge');
    expect(markup).toContain('coop-combat-reticle__arms--light');
    expect(markup).toContain('coop-combat-reticle__dot-edge');
  });
});
