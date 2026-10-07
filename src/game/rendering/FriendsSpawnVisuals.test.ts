import { describe, expect, it, vi } from 'vitest';
import { FriendsSimulation } from '../multiplayer/FriendsSimulation';
import { FriendsSpawnVisuals, FRIENDS_ARRIVAL_MS } from './FriendsSpawnVisuals';

describe('Friends arrival animation', () => {
  it('plays once for arrivals and late joins at their actual elevation', () => {
    const simulation = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#8de6ce' }]);
    const visuals = new FriendsSpawnVisuals(), snapshot = simulation.createSnapshot();
    expect(visuals.update(snapshot.players, snapshot.combatEvents, 0)).toEqual(new Set(['host']));
    expect(visuals.children[0].position.y).toBe(snapshot.players[0].z);
    const root = visuals.children[0];
    expect(visuals.update(snapshot.players, snapshot.combatEvents, 500).size).toBe(0);
    expect(visuals.children[0]).toBe(root);
    simulation.addPlayer({ id: 'guest', label: 'Friend', color: '#fff' });
    const joined = simulation.createSnapshot();
    expect(visuals.update(joined.players, joined.combatEvents, 0)).toEqual(new Set(['guest']));
    expect(visuals.children).toHaveLength(2); visuals.dispose();
  });

  it('deduplicates repeated respawns and releases finished GPU resources', () => {
    const simulation = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#8de6ce' }]);
    const visuals = new FriendsSpawnVisuals(), initial = simulation.createSnapshot();
    visuals.update(initial.players, initial.combatEvents, 0);
    visuals.update(initial.players, initial.combatEvents, FRIENDS_ARRIVAL_MS);
    expect(visuals.children).toHaveLength(0);
    simulation.friendsAction('host', { requestId: 1, action: 'home' });
    const returned = simulation.createSnapshot();
    expect(visuals.update(returned.players, returned.combatEvents, 0)).toEqual(new Set(['host']));
    const root = visuals.children[0], geometry = (root.children[0] as import('three').Mesh).geometry;
    const release = vi.spyOn(geometry, 'dispose');
    expect(visuals.update(returned.players, returned.combatEvents, 750).size).toBe(0);
    expect(visuals.children[0]).toBe(root);
    visuals.update(returned.players, returned.combatEvents, 750);
    expect(release).toHaveBeenCalledOnce(); expect(visuals.children).toHaveLength(0);
    expect(visuals.update(returned.players, returned.combatEvents, 750).size).toBe(0); visuals.dispose();
  });
});
