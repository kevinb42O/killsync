import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ManualMultiplayerSetup, createSoloMultiplayerLaunch } from './ManualMultiplayerSetup';

describe('ManualMultiplayerSetup Level Selection', () => {
  it('offers Friends mode separately and binds launches to the expedition world', () => {
    const markup = renderToStaticMarkup(<ManualMultiplayerSetup initialGameMode="friends" onClose={() => undefined} onLaunch={() => undefined} />);
    expect(markup).toContain('Sunline Expedition'); expect(markup).toContain('Reality Breach');
    expect(markup).not.toContain('Deployment world'); expect(markup).not.toContain('Wipe');
    const player = { id: 'test', label: 'Friend', color: '#8de6ce' };
    const expedition = createSoloMultiplayerLaunch({ player, language: 'en', gameMode: 'friends', worldId: 'cinderworks' });
    expect(expedition.gameMode).toBe('friends'); expect(expedition.worldId).toBe('friends_frontier');
    const survival = createSoloMultiplayerLaunch({ player, language: 'en', worldId: 'cinderworks' });
    expect(survival.gameMode).toBe('survival'); expect(survival.worldId).toBe('cinderworks');
  });
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
