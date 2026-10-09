import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { advancePlayerMovement, FRIENDS_HARD_LANDING_MIN_DROP, type PlayerMotionState } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { SnapshotDecoder, compactSnapshotWirePayload } from './snapshotReplication';

const input = (sequence: number, extra: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 0, aimAngle: 0, aimPitch: 0, selectedSlot: 0, firing: false,
  sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, ...extra,
});
const motion = (z: number): PlayerMotionState => ({
  x: 1000, y: 1000, z, angle: 0, sprinting: false, sliding: false, crouching: false,
  verticalVelocity: 0, lastJumpSequence: -1, slideAngle: 0,
});

describe('Friends high-fall overlay trigger', () => {
  it('keeps actual jumps and held jump boosts quiet, including on high platforms', () => {
    for (const floor of [0, 3000]) for (const boosted of [false, true]) {
      const player = motion(floor), hits: number[] = [];
      for (let i = 0; i < 180; i++) {
        advancePlayerMovement(player, input(i + 1, { jumpPressed: i === 0, jetHeld: boosted && i < 25 }), 50,
          undefined, undefined, () => floor, 'friends_frontier', {
            elevationAware: true, volumetric: true, ceiling: 6000, onLanding: speed => hits.push(speed),
          });
      }
      expect(player.z).toBe(floor);
      expect(hits).toEqual([]);
    }
  });

  it('rejects short drops even when their impact speed exceeds the old trigger', () => {
    for (const floor of [0, 3000]) {
      const player = motion(floor + FRIENDS_HARD_LANDING_MIN_DROP - 50), hits: number[] = [];
      for (let i = 0; i < 80; i++) advancePlayerMovement(player, input(i + 1), 50,
        undefined, undefined, () => floor, 'friends_frontier', {
          elevationAware: true, volumetric: true, ceiling: 6000, onLanding: speed => hits.push(speed),
        });
      expect(player.z).toBe(floor);
      expect(hits).toEqual([]);
    }
  });

  it('flashes once on contact after a high drop with or without fresh input', () => {
    for (const dt of [1000 / 120, 1000 / 30, 50]) for (const freshInput of [true, false]) {
      const floor = 2000, player = motion(floor + 500), hits: number[] = [];
      for (let i = 0; i < Math.ceil(3000 / dt); i++) {
        advancePlayerMovement(player, freshInput ? input(i + 1) : undefined, dt,
          undefined, undefined, () => floor, 'friends_frontier', {
            elevationAware: true, volumetric: true, ceiling: 6000,
            onLanding: speed => { expect(player.z).toBeLessThanOrEqual(floor); hits.push(speed); },
          });
        if (player.z > floor) expect(hits).toEqual([]);
      }
      expect(player.z).toBe(floor);
      expect(hits).toHaveLength(1);
      expect(player.fallPeakZ).toBeUndefined();
      // The preceding high fall must not contaminate the next ordinary jump.
      for (let i = 0; i < 80; i++) advancePlayerMovement(player, input(1000 + i, { jumpPressed: i === 0 }), 50,
        undefined, undefined, () => floor, 'friends_frontier', {
          elevationAware: true, volumetric: true, ceiling: 6000, onLanding: speed => hits.push(speed),
        });
      expect(hits).toHaveLength(1);
    }
  });

  it('replicates fall height while airborne and emits one harmless landing event through the host', () => {
    const simulation = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#fff' }]);
    const player = simulation['players'].get('host')!;
    const floor = simulation['friendsFrontier']!.terrain.surfaceHeight(player.x, player.y);
    const health = player.health;
    player.z = floor + 500;
    simulation.setInput('host', input(1));
    simulation.tick(50);
    const airborne = new SnapshotDecoder().decode(compactSnapshotWirePayload(simulation.createSnapshot()), 1)!;
    expect(airborne.players[0].motion?.fallPeakZ).toBe(floor + 500);
    expect(airborne.combatEvents.some(e => e.kind === 'player_damaged')).toBe(false);
    const events = new Set<number>();
    for (let i = 0; i < 80; i++) {
      simulation.setInput('host', input(i + 2));
      simulation.tick(50);
      for (const event of simulation.createSnapshot().combatEvents) {
        if (event.kind === 'player_damaged' && event.playerId === 'host') {
          expect(event.amount).toBe(0);
          events.add(event.id);
        }
      }
    }
    expect(player.health).toBe(health);
    expect(events.size).toBe(1);
  });
});
