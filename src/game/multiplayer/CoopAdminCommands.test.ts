import { describe, expect, it } from 'vitest';
import { parseCoopAdminCommand, resolveCoopAdminTargets, resolveCoopAdminWorld, tokenizeCoopAdminCommand } from './CoopAdminCommands';
import type { CoopSnapshot } from './CoopSimulation';

const snapshot = {
  players: [
    { id: 'owner-id', label: 'Kevin', lifeState: 'alive', health: 80, maxHealth: 100 },
    { id: 'raven-id', label: 'Raven', lifeState: 'downed', health: 0, maxHealth: 120 },
    { id: 'ravage-id', label: 'Ravage', lifeState: 'alive', health: 50, maxHealth: 100 },
  ],
} as unknown as CoopSnapshot;

describe('co-op owner command parser', () => {
  it('supports quoted arguments and the teleport alias', () => {
    expect(tokenizeCoopAdminCommand(`announce "boss test now"`)).toEqual(['announce', 'boss test now']);
    expect(parseCoopAdminCommand('/tp @Raven center')).toEqual({ name: 'teleport', args: ['@Raven', 'center'] });
    expect(parseCoopAdminCommand('/world 4')).toEqual({ name: 'world', args: ['4'] });
    expect(parseCoopAdminCommand('/warp null')).toEqual({ name: 'world', args: ['null'] });
  });

  it('resolves numeric, short, and canonical world destinations', () => {
    expect(resolveCoopAdminWorld('2')).toBe('cinderworks');
    expect(resolveCoopAdminWorld('w3')).toBe('white_silence');
    expect(resolveCoopAdminWorld('null-garden')).toBe('null_garden');
    expect(resolveCoopAdminWorld('world9')).toBeUndefined();
  });

  it('rejects malformed and unknown commands', () => {
    expect(parseCoopAdminCommand(`announce "unfinished`)).toMatchObject({ ok: false });
    expect(parseCoopAdminCommand('eval window.location')).toMatchObject({ ok: false });
  });

  it('resolves owner, group, exact callsign, prefix, and id selectors', () => {
    expect(resolveCoopAdminTargets(snapshot, 'me', 'owner-id').map(player => player.id)).toEqual(['owner-id']);
    expect(resolveCoopAdminTargets(snapshot, '@downed', 'owner-id').map(player => player.id)).toEqual(['raven-id']);
    expect(resolveCoopAdminTargets(snapshot, '@Raven', 'owner-id').map(player => player.id)).toEqual(['raven-id']);
    expect(resolveCoopAdminTargets(snapshot, '@rav', 'owner-id').map(player => player.id)).toEqual(['raven-id', 'ravage-id']);
    expect(resolveCoopAdminTargets(snapshot, '#ravage-id', 'owner-id').map(player => player.id)).toEqual(['ravage-id']);
  });
});
