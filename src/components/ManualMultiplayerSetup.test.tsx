import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ManualMultiplayerSetup } from './ManualMultiplayerSetup';

describe('ManualMultiplayerSetup Level Selection', () => {
  it('renders level selection prominently in setup by default', () => {
    const markup = renderToStaticMarkup(
      <ManualMultiplayerSetup
        onClose={() => undefined}
        onLaunch={() => undefined}
      />,
    );

    // Verify Level Selection header & tags
    expect(markup).toContain('Level Selection // Sector Route');
    expect(markup).toContain('Deployment world');
    expect(markup).toContain('LEVEL SELECT');

    // Verify world cards and level numbers
    expect(markup).toContain('NEON BASTION');
    expect(markup).toContain('CINDERWORKS');
    expect(markup).toContain('WHITE SILENCE');
    expect(markup).toContain('NULL GARDEN');
    expect(markup).toContain('Level 1');
    expect(markup).toContain('Level 2');
    expect(markup).toContain('Level 3');
    expect(markup).toContain('Level 4');

    // Verify tab navigation
    expect(markup).toContain('All Commands');
    expect(markup).toContain('01 // Operative &amp; Level');
    expect(markup).toContain('02 // Squad Matchmaking');
  });
});
