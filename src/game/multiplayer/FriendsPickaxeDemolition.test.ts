import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsBuilding, FRIENDS_BUILD_SHAPES, FRIENDS_FINISHES, friendsShapeBoxes, worldBox, type FriendsBuildPiece } from './FriendsBuilding';
import { FriendsFrontier, buildCost } from './FriendsFrontier';
import { friendsInteractionTarget } from './FriendsInteractionTargeting';
import { craneSocketPose, craneTopologyError } from './FriendsCraneAssemblies';
import { FriendsSimulation } from './FriendsSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { FriendsInteractionVisuals } from '../rendering/FriendsInteractionVisuals';
import { FriendsWorldGuest, FriendsWorldHost } from './FriendsWorldReplication';
import { exportFriendsWorld } from './FriendsWorldStorage';
import { railSimulation } from './friendsRailTestFixtures';

const actor = { id: 'host', label: 'Host', x: 7900, y: 8000, z: 128, lifeState: 'alive' };
const base: FriendsBuildPiece = { id: 1, x: 8000, y: 8000, z: 128, rotation: 0, shape: 'block', finish: 'stone', author: 'Host', revision: 1 };
function kit() {
  const root = { ...base, shape: 'crane_joint' as const, finish: 'teal' as const };
  const boom: FriendsBuildPiece = { ...root, ...craneSocketPose([root], root, 'crane_boom', 0)!, id: 2, shape: 'crane_boom' };
  const winch: FriendsBuildPiece = { ...root, ...craneSocketPose([root, boom], boom, 'crane_winch', 0)!, id: 3, shape: 'crane_winch' };
  const console: FriendsBuildPiece = { ...root, id: 4, shape: 'crane_console', x: 7936, y: 8096, craneRootId: 1 };
  return [root, boom, winch, console];
}
function fixture(pieces = [base]) {
  const frontier = new FriendsFrontier(undefined, false);
  const building = new FriendsBuilding({ revision: 1, guestsCanBuild: true, pieces });
  frontier.terrain.addGrade([8000, 8000, 0, 512]); frontier.pack(actor);
  frontier.demolishBuild = (who, piece) => building.demolish(who, piece.id, piece.revision, 'host',
    Object.assign((before, after) => frontier.buildTransition(who, before, after), { batch: edits => frontier.buildBatchTransition(who, edits) }));
  return { frontier, building };
}
function aim(piece: FriendsBuildPiece) {
  const b = worldBox(piece, friendsShapeBoxes(piece.shape)[0]);
  return { x: b.x, y: b.y, z: b.z + b.h + 12, dx: 0, dy: 0, dz: -1 };
}
function breakPiece(f: ReturnType<typeof fixture>, piece: FriendsBuildPiece, who = actor, start = 0) {
  const ray = aim(piece);
  const nearby = { ...who, x: ray.x, y: ray.y, z: piece.z };
  for (let hit = 0; hit < 4; hit++) f.frontier.tool(nearby, 2, ray, start + hit * 250, f.building.getPieces());
}

describe('pickaxe demolition of player construction', () => {
  it.each(FRIENDS_BUILD_SHAPES)('breaks %s through the shared target and tool contact path', shape => {
    const pieces = shape === 'crane_boom' || shape === 'crane_winch' || shape === 'crane_console' ? kit() : [{ ...base, shape }];
    const f = fixture(pieces), piece = f.building.getPieces().find(p => p.shape === shape)!;
    expect(piece).toBeDefined();
    expect(friendsInteractionTarget(f.frontier.terrain, aim(piece), 2, f.building.getPieces(), [])).toMatchObject({ kind: 'build', valid: true, piece: { id: piece.id } });
    breakPiece(f, piece);
    expect(f.building.getPieces().some(p => p.id === piece.id)).toBe(false);
    expect(f.frontier.snapshot().interaction!.contacts.at(-1)).toMatchObject({ broken: true, kind: 'stone', pieceId: piece.id });
    expect(f.frontier.snapshot().mined).toBe(0);
    expect(craneTopologyError(f.building.getPieces())).toBeUndefined();
  });
  it.each(Object.keys(FRIENDS_FINISHES))('uses the pickaxe for %s finishes and refunds the recipe once', finish => {
    const piece = { ...base, finish: finish as keyof typeof FRIENDS_FINISHES }, f = fixture([piece]);
    f.frontier.pack(actor).wood = 1000; // A full pack does not prevent demolition into shared storage.
    breakPiece(f, f.building.getPieces()[0]);
    const stock = f.frontier.snapshot().stock;
    for (const [resource, amount] of Object.entries(buildCost(piece.shape, piece.finish))) expect(stock[resource]).toBe(amount);
    expect(f.frontier.snapshot().interaction!.contacts.filter(c => c.broken)).toHaveLength(1);
  });
  it('winds up, shares four-hit progress between players, and preserves durable state until the final contact', () => {
    const f = fixture(), piece = f.building.getPieces()[0], ray = aim(piece), who = { ...actor, x: ray.x, y: ray.y };
    const revision = f.building.getRevision(), frontierRevision = f.frontier.getRevision();
    f.frontier.advanceTool(who, 2, ray, 0, f.building.getPieces(), true);
    f.frontier.advanceTool(who, 2, ray, 179, f.building.getPieces(), true);
    expect(f.frontier.snapshot().interaction!.contacts).toHaveLength(0);
    f.frontier.advanceTool(who, 2, ray, 180, f.building.getPieces(), true);
    const guest = { ...who, id: 'guest' };
    f.frontier.tool(guest, 2, ray, 200, f.building.getPieces());
    f.frontier.tool(who, 2, ray, 450, f.building.getPieces());
    expect(f.frontier.snapshot().interaction!.damage[0].value).toBe(3);
    expect(f.building.getRevision()).toBe(revision); expect(f.frontier.getRevision()).toBe(frontierRevision);
    f.frontier.tool(guest, 2, ray, 470, f.building.getPieces());
    expect(f.building.getPieces()).toHaveLength(0); expect(f.building.getRevision()).toBe(revision + 1);
    expect(f.frontier.snapshot().stock.stone).toBe(1);
    expect(f.building.demolish(who, piece.id, piece.revision, 'host')).toContain('changed');
  });
  it('respects editing permissions, tool choice, range and living actors', () => {
    const f = fixture(), piece = f.building.getPieces()[0], ray = aim(piece);
    for (const tool of [1, 3] as const) {
      expect(f.frontier.target(actor, tool, ray, f.building.getPieces())?.reason).toContain('pickaxe');
      f.frontier.tool(actor, tool, ray, 0, f.building.getPieces());
    }
    f.frontier.tool(actor, 2, ray, 0, f.building.getPieces(), false);
    f.frontier.tool({ ...actor, lifeState: 'downed' }, 2, ray, 0, f.building.getPieces());
    expect(f.frontier.target(actor, 2, { ...ray, z: 800 }, f.building.getPieces())?.piece).toBeUndefined();
    f.building.setGuestAccess(false);
    breakPiece(f, piece, { ...actor, id: 'guest' });
    expect(f.building.getPieces()).toHaveLength(1); expect(f.frontier.snapshot().stock.stone).toBe(0);
    expect(f.frontier.snapshot().interaction!.contacts.some(c => c.broken)).toBe(false);
  });
  it('starts fresh after painting and clears damage for pieces removed or changed elsewhere', () => {
    const f = fixture(), piece = f.building.getPieces()[0], ray = aim(piece);
    f.frontier.tool(actor, 2, ray, 0, f.building.getPieces()); f.frontier.tool(actor, 2, ray, 250, f.building.getPieces());
    expect(f.building.request(actor, { requestId: 1, action: 'paint', pieceId: 1, expectedRevision: piece.revision, finish: 'timber' }, 'host', []).ok).toBe(true);
    f.frontier.tool(actor, 2, ray, 500, f.building.getPieces());
    expect(f.frontier.snapshot().interaction!.damage[0].value).toBe(1);
    f.building.demolish(actor, 1, f.building.getPieces()[0].revision, 'host');
    f.frontier.tickTools(600, new Set(['host']), new Set(['host']), f.building.getPieces());
    expect(f.frontier.snapshot().interaction!.damage).toHaveLength(0);
  });
  it('removes connected crane children atomically and restores the whole assembly with undo', () => {
    const f = fixture(kit());
    breakPiece(f, f.building.getPieces()[0]);
    expect(f.building.getPieces()).toHaveLength(0);
    expect(f.frontier.snapshot().stock).toMatchObject({ ingots: 13, stone: 8, planks: 14 });
    expect(f.building.request(actor, { requestId: 1, action: 'undo' }, 'host', []).ok).toBe(true);
    expect(f.building.getPieces()).toHaveLength(4); expect(craneTopologyError(f.building.getPieces())).toBeUndefined();
  });
  it('shows cracks and chips for built pieces without treating them as terrain voxels', () => {
    const f = fixture(), ray = aim(f.building.getPieces()[0]);
    f.frontier.tool(actor, 2, ray, 0, f.building.getPieces());
    const visuals = new FriendsInteractionVisuals(new THREE.Scene());
    visuals.update(f.frontier.target(actor, 2, ray, f.building.getPieces()), f.frontier.snapshot().interaction, f.frontier.terrain, actor.id, 0, actor);
    expect(visuals.stats).toMatchObject({ crackFaces: 1, fragments: 4 });
    expect(Array.from(visuals['cracks'].instanceMatrix.array).every(Number.isFinite)).toBe(true);
    visuals.dispose();
  });
  it('breaks track carrying a player train and updates the route immediately', () => {
    const sim = railSimulation([{ id: 'host', label: 'Host', color: '#fff' }]);
    const building = sim['friendsBuilding']!, frontier = sim['friendsFrontier']!, piece = building.getPieces()[0];
    const player = sim['players'].get('host')!;
    Object.assign(player, { x: piece.x, y: piece.y, z: piece.z });
    expect(sim['friends']!.trackInUse(piece.id)).toBe(true);
    for (let hit = 0; hit < 4; hit++) frontier.tool(player, 2, aim(piece), hit * 250, building.getPieces());
    expect(building.getPieces().some(p => p.id === piece.id)).toBe(false);
    expect(sim['friends']!.hasTrain()).toBe(false);
    expect(sim['friends']!.vehicles().some(v => v.kind === 'train' && !v.scenic)).toBe(false);
  });
  it('breaks a loaded crane and releases suspended cargo to gravity', () => {
    const sim = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#fff' }], undefined, undefined,
      { revision: 1, guestsCanBuild: true, pieces: kit() });
    const building = sim['friendsBuilding']!, frontier = sim['friendsFrontier']!, hauling = sim['friends']!.hauling;
    const player = sim['players'].get('host')!;
    Object.assign(player, { x: 7940, y: 8060, z: 128 });
    const env = () => ({ revision: String(building.getRevision()), floor: () => 0, collide: () => false, blocked: () => false, vehicles: [], builds: building.getPieces() });
    sim['haulingEnvironment'] = env;
    const cargo = hauling.getCargo()[0]; Object.assign(cargo, { x: 8096, y: 8000, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, secured: undefined });
    expect(hauling.controlCrane(player, 1, 'crane_connect', env()).ok).toBe(true);
    expect(hauling.controlCrane(player, 1, 'crane_raise', env()).ok).toBe(true);
    for (let time = 50; time <= 1000; time += 50) hauling.update(50, time, [player], new Map(), env());
    hauling.controlCrane(player, 1, 'crane_hold', env());
    const height = cargo.z; expect(height).toBeGreaterThan(20);
    const piece = building.getPieces()[0];
    for (let hit = 0; hit < 4; hit++) frontier.tool(player, 2, aim(piece), hit * 250, building.getPieces());
    expect(building.getPieces()).toHaveLength(0); expect(hauling.snapshot().cranes).toHaveLength(0);
    for (let time = 1050; time <= 1750; time += 50) hauling.update(50, time, [player], new Map(), env());
    expect(cargo.z).toBeLessThan(height - 10);
  });
  it('runs demolition through host input and replicates/saves the removed piece', () => {
    const sim = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#fff' }], undefined, undefined,
      { revision: 1, guestsCanBuild: true, pieces: [{ ...base, z: 0 }] });
    const player = sim['players'].get('host')!;
    Object.assign(player, { x: 7936, y: 8000, z: 0 }); sim['friendsFrontier']!.terrain.addGrade([8000, 8000, 0, 512]);
    const ammo = player.weaponStates[0].magazineAmmo;
    const host = new FriendsWorldHost(), guest = new FriendsWorldGuest((m: any) => { if (m.kind === 'ack') host.acknowledge('guest', m.epoch, m.revision); }, () => {});
    const transfer = (now: number) => { host.update(sim.createSnapshot()); host.pump(['guest'], now, (_id, packet) => { guest.receive(packet, now); return true; }, message => { throw new Error(message); }); };
    transfer(0);
    expect(guest.decode(host.motion('guest', sim.createSnapshot()))!.friends!.building!.pieces).toHaveLength(1);
    for (let sequence = 1; sequence <= 24; sequence++) {
      sim.setInput('host', { type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: sequence * 50, movement: 0,
        aimAngle: quantizeAngle(0), aimPitch: quantizePitch(-Math.atan2(24, 64)), selectedSlot: 0, friendsTool: 2, firing: true, fireActionId: 1,
        sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false });
      sim.tick(50);
      if (!sim.createSnapshot().friends!.building!.pieces.length) break;
    }
    const snapshot = sim.createSnapshot();
    expect(snapshot.friends!.building!.pieces).toHaveLength(0); expect(snapshot.friends!.frontier!.mined).toBe(0);
    expect(snapshot.friends!.frontier!.interaction!.contacts.at(-1)?.broken).toBe(true); expect(player.weaponStates[0].magazineAmmo).toBe(ammo);
    transfer(snapshot.elapsedMs);
    expect(guest.decode(host.motion('guest', snapshot))!.friends!.building!.pieces).toHaveLength(0);
    const saved = JSON.parse(exportFriendsWorld({ building: snapshot.friends!.building!, frontier: snapshot.friends!.frontier!, progress: snapshot.friends!.progress }));
    expect(saved.building.pieces).toHaveLength(0); expect(saved.frontier.interaction).toBeUndefined();
  });
});
