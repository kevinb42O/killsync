import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoopSimulation } from '../game/multiplayer/CoopSimulation';
import { getWorldObstacles } from '../game/world/WorldLayout';
import { CoopTacticalMap } from './CoopTacticalMap';

describe('CoopTacticalMap', () => {
  it('renders authoritative buildings, clear squad labels, and operator facing information', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#22d3ee' },
      { id: 'guest', label: 'Guest', color: '#f472b6' },
    ], 22, 'map-test');
    const snapshot = simulation.createSnapshot();
    const markup = renderToStaticMarkup(<CoopTacticalMap snapshot={snapshot} localPlayer={snapshot.players[0]} onPingMission={() => {}} onClose={() => {}} />);
    expect(getWorldObstacles(snapshot.world!.id).length).toBeGreaterThan(50);
    expect(markup).toContain('data-map-layer="buildings"');
    expect(markup).toContain('YOU');
    expect(markup).toContain('Guest');
    expect(markup).toContain('double-click a contract to squad-ping');
    expect(markup).toContain('player-glow');
  });
});
