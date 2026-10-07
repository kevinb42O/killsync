import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ManualMultiplayerSetup, createSoloMultiplayerLaunch } from './ManualMultiplayerSetup';

describe('ManualMultiplayerSetup Level Selection', () => {
  it('offers Friends mode separately and binds launches to the expedition world', () => {
    const markup = renderToStaticMarkup(<ManualMultiplayerSetup initialGameMode="friends" onClose={() => undefined} onLaunch={() => undefined} />);
    expect(markup).toContain('A little adventure, together.');
    expect(markup).toContain('Open my island'); expect(markup).toContain('Join a friend'); expect(markup).toContain('Play on my own');
    for (const tactical of ['Reality Breach', 'Operator Class', 'All Commands', 'Deployment world', 'Wipe']) expect(markup).not.toContain(tactical);
    const player = { id: 'test', label: 'Friend', color: '#8de6ce' };
    const expedition = createSoloMultiplayerLaunch({ player, language: 'en', gameMode: 'friends', worldId: 'cinderworks' });
    expect(expedition.gameMode).toBe('friends'); expect(expedition.worldId).toBe('friends_frontier');
    expect(expedition.players[0].operatorId).toBe('solar_guard'); expect(expedition.players[0].skinId).toBe('solar_guard');
    const survival = createSoloMultiplayerLaunch({ player, language: 'en', worldId: 'cinderworks' });
    expect(survival.gameMode).toBe('survival'); expect(survival.worldId).toBe('cinderworks');
  });
  it('replaces a saved combat class only in the Friends session', () => {
    const player = { id: 'friend', label: 'Lena', color: '#ffffff', skinId: 'royal_inferno' as const, operatorId: 'royal_inferno' as const,
      imprint: { operatorId: 'royal_inferno', generation: 5, ranks: { power: 9, vitality: 8, mobility: 7, handling: 6, reach: 5 } } };
    const friends = createSoloMultiplayerLaunch({ player, gameMode: 'friends' });
    expect(friends.players[0]).toMatchObject({ id: friends.friendsCrew!.saved.hostId, label: player.label, color: player.color, operatorId: 'solar_guard', skinId: 'solar_guard', imprint: { ranks: { power: 0, vitality: 0, mobility: 0, handling: 0, reach: 0 } } });
    expect(player.operatorId).toBe('royal_inferno');
    const survival = createSoloMultiplayerLaunch({ player });
    expect(survival.players[0].skinId).toBe('royal_inferno'); expect(survival.players[0].imprint.ranks.power).toBe(9);
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
