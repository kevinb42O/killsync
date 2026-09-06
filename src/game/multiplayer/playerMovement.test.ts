import { describe, expect, it } from 'vitest';
import { getBarricadeWallContact, resolveBarricadeCollision, type CoopStructureSnapshot } from './CoopFieldEngineering';
import {
  advancePlayerMovement,
  COOP_CAMERA_OVERHEAD_SAFETY_MARGIN,
  COOP_DOUBLE_JUMP_MAX_VELOCITY,
  COOP_FIRST_PERSON_EYE_HEIGHT,
  COOP_PLAYER_RADIUS,
  COOP_STEP_MS,
  COOP_WALL_JUMP_VELOCITY,
  type PlayerMotionState,
} from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { WORLD_SKYBRIDGE_ELEVATION, WORLD_TRANSIT_LINES } from '../world/WorldLayout';

const input = (sequence: number, jumpPressed: boolean, overrides: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: sequence * COOP_STEP_MS,
  movement: 1, aimAngle: 0, aimPitch: 0, selectedSlot: 0, firing: false, sprinting: false,
  sliding: false, reviving: false, jumpPressed, dashPressed: false, ...overrides,
});

const motion = (): PlayerMotionState => ({
  x: 964, y: 1_000, z: 20, angle: 0, sprinting: false, sliding: false, crouching: false,
  verticalVelocity: -100, lastJumpSequence: -1, slideAngle: 0,
});

const barricade: CoopStructureSnapshot = {
  id: 1, type: 'barricade', ownerId: 'host', ownerColor: '#22d3ee', x: 1_000, y: 1_000,
  angle: Math.PI / 2, health: 520, maxHealth: 520, state: 'active', createdAtMs: 0, expiresAtMs: 120_000,
};

const resolveStructure = (position: { x: number; y: number }, radius: number) =>
  resolveBarricadeCollision(position, radius, barricade);
const resolveStructureContact = (position: { x: number; y: number }, radius: number) =>
  getBarricadeWallContact(position, radius, barricade);

describe('co-op player movement', () => {
  it('wall-jumps while airborne and pressing into a solid structure', () => {
    const player = motion();

    advancePlayerMovement(player, input(1, true), COOP_STEP_MS, resolveStructure);

    expect(player.verticalVelocity).toBeCloseTo(COOP_WALL_JUMP_VELOCITY - 1550 * COOP_STEP_MS / 1000);
    expect(player.z).toBeGreaterThan(20);
    expect(player.x).toBeCloseTo(1_000 - 17 - COOP_PLAYER_RADIUS);
    expect(player.lastWallJumpSequence).toBe(1);
    expect(player.wallJumpDirectionX).toBeCloseTo(-1);
    expect(player.wallJumpDirectionY).toBeCloseTo(0);
  });

  it('uses the single air action as a bounded double jump away from walls', () => {
    const player = motion();

    advancePlayerMovement(player, input(1, true), COOP_STEP_MS);

    expect(player.lastDoubleJumpSequence).toBe(1);
    expect(player.airActionConsumedSinceGrounded).toBe(true);
    expect(player.verticalVelocity).toBeGreaterThan(0);
    expect(player.verticalVelocity).toBeLessThan(COOP_DOUBLE_JUMP_MAX_VELOCITY);
  });

  it('allows only one wall-jump before touching the real floor again', () => {
    const player = motion();
    advancePlayerMovement(player, input(1, true), COOP_STEP_MS, resolveStructure);
    player.verticalVelocity = -100;

    advancePlayerMovement(player, input(2, true), COOP_STEP_MS, resolveStructure);

    expect(player.verticalVelocity).toBeLessThan(-100);
    expect(player.lastWallJumpSequence).toBe(1);
  });

  it('restores one wall-jump only after an authoritative floor landing', () => {
    const player = motion();
    advancePlayerMovement(player, input(1, true), COOP_STEP_MS, resolveStructure);
    player.z = .01;
    player.verticalVelocity = -100;
    advancePlayerMovement(player, input(2, false, { movement: 0 }), COOP_STEP_MS, resolveStructure);
    expect(player.z).toBe(0);
    expect(player.airActionConsumedSinceGrounded).toBe(false);

    player.z = 20;
    player.verticalVelocity = -100;
    player.x = 964;
    advancePlayerMovement(player, input(3, true), COOP_STEP_MS, resolveStructure);

    expect(player.lastWallJumpSequence).toBe(3);
    expect(player.verticalVelocity).toBeGreaterThan(0);
  });

  it('wall-jumps from resting contact while facing and moving away from the structure', () => {
    const player = motion();

    advancePlayerMovement(player, input(1, true, { aimAngle: 32768 }), COOP_STEP_MS, resolveStructure, resolveStructureContact);

    expect(player.x).toBeLessThan(964);
    expect(player.verticalVelocity).toBeGreaterThan(0);
    expect(player.wallJumpDirectionX).toBeCloseTo(-1);
  });

  it('does not allow a double jump after spending the air action on a wall-jump', () => {
    const player = motion();
    advancePlayerMovement(player, input(1, true), COOP_STEP_MS, resolveStructure);
    player.verticalVelocity = -100;
    player.x = 800;

    advancePlayerMovement(player, input(2, true), COOP_STEP_MS);

    expect(player.verticalVelocity).toBeLessThan(-100);
    expect(player.lastDoubleJumpSequence).toBeUndefined();
  });

  it('does not allow a wall-jump after spending the air action on a double jump', () => {
    const player = motion();
    player.x = 800;
    advancePlayerMovement(player, input(1, true), COOP_STEP_MS);
    player.verticalVelocity = -100;
    player.x = 964;

    advancePlayerMovement(player, input(2, true), COOP_STEP_MS, resolveStructure, resolveStructureContact);

    expect(player.verticalVelocity).toBeLessThan(-100);
    expect(player.lastWallJumpSequence).toBeUndefined();
  });

  it('caps an early double jump instead of stacking two full launch velocities', () => {
    const player = motion();
    player.verticalVelocity = 550;
    player.x = 800;

    advancePlayerMovement(player, input(1, true), COOP_STEP_MS);

    expect(player.verticalVelocity).toBeCloseTo(COOP_DOUBLE_JUMP_MAX_VELOCITY - 1550 * COOP_STEP_MS / 1000);
  });

  it('keeps every legal double-jump camera safely below overhead infrastructure', () => {
    let maximumPlayerHeight = 0;
    for (let doubleJumpStep = 1; doubleJumpStep <= 24; doubleJumpStep++) {
      const player: PlayerMotionState = {
        ...motion(), x: 6_100, y: 6_000, z: 0, verticalVelocity: 0,
      };
      for (let step = 0; step < 90; step++) {
        const jumpPressed = step === 0 || step === doubleJumpStep;
        advancePlayerMovement(player, input(step === doubleJumpStep ? 2 : 1, jumpPressed, { movement: 0 }), COOP_STEP_MS);
        maximumPlayerHeight = Math.max(maximumPlayerHeight, player.z);
      }
    }
    const lowestOverheadUnderside = Math.min(
      WORLD_SKYBRIDGE_ELEVATION - 7,
      ...WORLD_TRANSIT_LINES.map(line => line.elevation - 4.5),
    );

    expect(maximumPlayerHeight + COOP_FIRST_PERSON_EYE_HEIGHT + COOP_CAMERA_OVERHEAD_SAFETY_MARGIN)
      .toBeLessThan(lowestOverheadUnderside);
  });
});
