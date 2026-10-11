import { describe, expect, it } from 'vitest';
import { FriendsBuilding, type FriendsBuildPiece } from './FriendsBuilding';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsWorldGuest, FriendsWorldHost, worldDiff, worldPatch } from './FriendsWorldReplication';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('optional fields in reliable island patches', () => {
  it('matches JSON semantics for cleared objects, scalars and array entries', () => {
    const before = { attachment: { vehicleId: 'grand-3', x: 0 }, linked: 10, list: ['host', 2] };
    const after = { attachment: undefined, linked: undefined, list: [undefined, 3], unused: undefined };
    expect(worldPatch(wire(before), wire(worldDiff(before, after)))).toEqual(wire(after));
  });

  it('replicates moving an attached build onto land and undoing the move', () => {
    const actor = { id: 'host', label: 'Host', x: 6150, y: 6144, z: 0, lifeState: 'alive' };
    const piece: FriendsBuildPiece = { id: 1, shape: 'cube', finish: 'stone', author: 'Host', revision: 1,
      x: 6400, y: 6144, z: 0, rotation: 0, attachment: { vehicleId: 'grand-3', x: 16, y: 0, z: 0 } };
    const building = new FriendsBuilding({ pieces: [piece] });
    const snapshot = new FriendsSimulation([{ ...actor, color: '#fff' }]).createSnapshot();
    const host = new FriendsWorldHost();
    const controls: string[] = [];
    const guest = new FriendsWorldGuest(message => {
      const m = message as { kind: string; epoch: string; revision: number };
      controls.push(m.kind);
      if (m.kind === 'ack') host.acknowledge('guest', m.epoch, m.revision);
      else host.request('guest');
    }, () => {});
    let now = 0;
    const receive = () => {
      snapshot.friends!.building = building.snapshot();
      host.update(snapshot);
      for (let i = 0; i < 10; i++) {
        now += 100;
        host.pump(['guest'], now, (_id, packet) => { guest.receive(packet, now); return true; }, message => { throw new Error(message); });
      }
      return guest.decode(host.motion('guest', snapshot))!.friends!.building!.pieces[0];
    };
    expect(receive().attachment).toEqual(piece.attachment);
    expect(building.request(actor, { requestId: 1, action: 'move', pieceId: 1, expectedRevision: 1,
      pose: { x: 6464, y: 6144, z: 0, rotation: 0 } }, 'host', [actor]).ok).toBe(true);
    expect(receive().attachment).toBeUndefined();
    expect(building.request(actor, { requestId: 2, action: 'undo' }, 'host', [actor]).ok).toBe(true);
    expect(receive().attachment).toEqual(piece.attachment);
    expect(controls).not.toContain('request');
  });
});
