import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsFrontier } from './FriendsFrontier';
import { COOP_STALE_INPUT_MS, quantizeAngle, quantizePitch } from './CoopSimulation';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { SnapshotDecoder, compactSnapshotWirePayload } from './snapshotReplication';

const seeds = [{ id: 'host', label: 'Host', color: '#0ff' }, { id: 'guest', label: 'Guest', color: '#f0f' }];
const input = (sequence: number, extra: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(-Math.atan2(26, 64)),
  selectedSlot: 0, firing: false, aiming: true, sprinting: false, sliding: false,
  reviving: false, jumpPressed: false, dashPressed: false, friendsTool: 3, ...extra,
});
function fixture(id = 'host') {
  const sim = new FriendsSimulation(seeds), frontier = sim['friendsFrontier']!;
  frontier.terrain.addGrade([8000, 8000, 0, 512]);
  const player = sim['players'].get(id)!;
  Object.assign(player, { x: 7952, y: 8016, z: 0, verticalVelocity: 0 });
  return { sim, frontier, player };
}
function hold(sim: FriendsSimulation, id: string, extra: Partial<MultiplayerInputFrame> = {}, start = 0, duration = 352) {
  for (let elapsed = 0; elapsed < duration; elapsed += 16) {
    sim.setInput(id, clampInputFrame(input(start + elapsed + 1, extra)));
    sim.tick(16);
  }
}

describe('combined shovel secondary action', () => {
  it.each(['host', 'guest'])('fills from held secondary input for %s without zooming or digging', id => {
    const { sim, frontier } = fixture(id), mined = frontier.snapshot().mined;
    hold(sim, id);
    expect(frontier.terrain.material(250, 250, 0)).toBe(1);
    expect(frontier.snapshot().mined).toBe(mined);
    expect(sim.createSnapshot().players.find(p => p.id === id)!.isAiming).toBe(false);
    expect(frontier.snapshot().interaction!.actions[id]).toMatchObject({ tool: 3, fill: true });
    expect(frontier.snapshot().interaction!.contacts).toHaveLength(1);
    const decoded = new SnapshotDecoder().decode(compactSnapshotWirePayload(sim.createSnapshot()), 1)!;
    expect(decoded.friends!.frontier!.interaction!.actions[id]).toMatchObject({ tool: 3, fill: true });
    expect(decoded.friends!.frontier!.terrain.edits).toEqual(frontier.snapshot().terrain.edits);
    sim.setInput(id, input(1000, { aiming: false }));
    sim.tick(16);
    expect(frontier.snapshot().interaction!.actions[id]).toBeUndefined();
    for (let elapsed = 0; elapsed < 500; elapsed += 16) sim.tick(16);
    expect(frontier.terrain.material(250, 250, 1)).toBe(0);
  });

  it('gives filling priority while both buttons are held and restarts on a mode change', () => {
    const f = new FriendsFrontier(undefined, false);
    f.terrain.addGrade([8000, 8000, 0, 512]);
    const actor = { id: 'host', x: 7952, y: 8016, z: 0, lifeState: 'alive' };
    const ray = { x: 8016, y: 8016, z: 26, dx: 0, dy: 0, dz: -1 };
    f.pack(actor).soil = 1;
    f.advanceTool(actor, 3, ray, 0, [], true);
    f.advanceTool(actor, 3, ray, 320, [], true, true, [], undefined, undefined, true);
    f.advanceTool(actor, 3, ray, 330, [], true, true, [], undefined, undefined, true);
    expect(f.snapshot().interaction!.contacts).toHaveLength(0);
    f.advanceTool(actor, 3, ray, 650, [], true, true, [], undefined, undefined, true);
    expect(f.terrain.material(250, 250, 0)).toBe(1);
    expect(f.snapshot().mined).toBe(0);
    expect(f.pack(actor).soil).toBe(0);
    expect(f.target(actor, 3, ray, [], true, undefined, undefined, true)?.fill).toBe(true);
  });

  it('fills against stone while the primary shovel still rejects mining stone', () => {
    const f = new FriendsFrontier(undefined, false);
    f.terrain.addGrade([8000, 8000, 0, 512]); f.terrain.set(250, 250, -1, 2);
    const actor = { id: 'host', x: 7952, y: 8016, z: 0, lifeState: 'alive' };
    const ray = { x: 8016, y: 8016, z: 26, dx: 0, dy: 0, dz: -1 };
    f.pack(actor).soil = 1;
    expect(f.target(actor, 3, ray, [])?.reason).toContain('pickaxe');
    expect(f.target(actor, 3, ray, [], true, undefined, { axis: 0, value: 8000 }, true)?.valid).toBe(true);
    f.tool(actor, 3, ray, 1000, [], true, [], undefined, true);
    expect(f.terrain.material(250, 250, 0)).toBe(1);
    expect(f.pack(actor).soil).toBe(0);
    f.tool(actor, 3, { ...ray, z: 58 }, 1400, [], true, [], undefined, true);
    expect(f.terrain.material(250, 250, 1)).toBe(0);
    expect(f.snapshot().feedback.host.message).toContain('Gather soil');
  });

  it('honors guest permissions and cancels a stale held fill before contact', () => {
    const { sim, frontier } = fixture('guest');
    sim.setFriendsGuestAccess(false); hold(sim, 'guest');
    expect(frontier.terrain.material(250, 250, 0)).toBe(0);
    expect(frontier.snapshot().feedback.guest.message).toContain('enable world editing');
    sim.setFriendsGuestAccess(true);
    sim.setInput('guest', input(1000, { aiming: false })); sim.tick(16);
    sim.setInput('guest', input(1001));
    sim['inputReceivedAtMs'].set('guest', sim.createSnapshot().elapsedMs - COOP_STALE_INPUT_MS + 20);
    for (let elapsed = 0; elapsed < 500; elapsed += 16) sim.tick(16);
    expect(frontier.terrain.material(250, 250, 0)).toBe(0);
    expect(frontier.snapshot().interaction!.actions.guest).toBeUndefined();
  });

  it('preserves aiming for other tools and rejects the removed Earthwork id on the wire', () => {
    for (const tool of [0, 1, 2] as const) {
      const { sim, frontier } = fixture();
      hold(sim, 'host', { friendsTool: tool });
      expect(sim.createSnapshot().players[0].isAiming).toBe(true);
      expect(frontier.terrain.material(250, 250, 0)).toBe(0);
      expect(frontier.snapshot().mined).toBe(0);
    }
    expect(clampInputFrame(input(1, { friendsTool: 4 as unknown as 3 })).friendsTool).toBe(0);
  });
});
