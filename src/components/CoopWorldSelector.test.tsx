import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoopWorldSelector } from './CoopWorldSelector';

describe('CoopWorldSelector', () => {
  it('keeps earlier worlds selectable after a later world is unlocked', () => {
    const markup = renderToStaticMarkup(
      <CoopWorldSelector
        unlockedWorldIds={['neon_bastion', 'cinderworks']}
        selectedWorldId="cinderworks"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Select World 1: NEON BASTION"');
    expect(markup).toContain('aria-label="Select World 2: CINDERWORKS"');
    expect(markup).toContain('aria-label="Locked World 3: WHITE SILENCE"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('SELECTED');
  });
});
