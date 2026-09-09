import type { CoopPlayerSnapshot, CoopSnapshot } from './CoopSimulation';
import { getBarricadeWallContact, getStructureWalkableTop, resolveBarricadeCollision, type CoopStructureSnapshot } from './CoopFieldEngineering';
import { advancePlayerMovement, COOP_STEP_MS, type PlayerMotionState } from './playerMovement';
import type { MultiplayerInputFrame } from './protocol';
import type { WorldId } from '../world/WorldDefinitions';

export class LocalPlayerPrediction {
  private pending: MultiplayerInputFrame[] = [];
  private motion?: PlayerMotionState;
  private latestTick = -1;
  private lifeState?: CoopPlayerSnapshot['lifeState'];
  private structures: CoopStructureSnapshot[] = [];
  private correction = { x: 0, y: 0, z: 0 };
  private worldId: WorldId = 'neon_bastion';

  constructor(private readonly playerId: string) {}

  reconcile(snapshot: CoopSnapshot) {
    const player = snapshot.players.find(candidate => candidate.id === this.playerId);
    const nextWorldId = snapshot.world?.id || 'neon_bastion';
    const reset = snapshot.tick < this.latestTick || player?.lifeState !== this.lifeState || snapshot.matchState !== 'active' || nextWorldId !== this.worldId;
    this.latestTick = snapshot.tick;
    this.lifeState = player?.lifeState;
    this.structures = snapshot.structures || [];
    this.worldId = nextWorldId;
    if (reset) { this.pending = []; this.motion = undefined; this.correction = { x: 0, y: 0, z: 0 }; }
    if (!player || player.lifeState !== 'alive') return;
    const previous = this.motion;
    this.pending = this.pending.filter(input => input.sequence > (player.lastProcessedInput ?? -1));
    this.motion = { ...player, verticalVelocity: 0, lastJumpSequence: -1, slideAngle: player.angle, ...player.motion };
    for (const input of this.pending) this.advance(this.motion, input, COOP_STEP_MS);
    if (previous) {
      const offset = { x: previous.x + this.correction.x - this.motion.x, y: previous.y + this.correction.y - this.motion.y, z: previous.z + this.correction.z - this.motion.z };
      this.correction = Math.hypot(offset.x, offset.y, offset.z) < 120 ? offset : { x: 0, y: 0, z: 0 };
    }
  }

  step(input: MultiplayerInputFrame) {
    if (!this.motion || this.lifeState !== 'alive' || this.pending.length >= 30) return;
    this.pending.push({ ...input });
    this.advance(this.motion, input, COOP_STEP_MS);
  }

  present(snapshot: CoopSnapshot, input: MultiplayerInputFrame, remainderMs: number, deltaMs: number): CoopSnapshot {
    if (!this.motion || this.lifeState !== 'alive') return snapshot;
    const motion = { ...this.motion };
    if (this.pending.length < 30) this.advance(motion, { ...input, jumpPressed: false }, Math.min(COOP_STEP_MS, remainderMs));
    const decay = Math.exp(-Math.max(0, deltaMs) / 70);
    this.correction.x *= decay; this.correction.y *= decay; this.correction.z *= decay;
    return {
      ...snapshot,
      players: snapshot.players.map(player => player.id !== this.playerId || player.lifeState !== 'alive' ? player : {
        ...player, x: motion.x + this.correction.x, y: motion.y + this.correction.y, z: motion.z + this.correction.z,
        angle: motion.angle, sprinting: motion.sprinting, sliding: motion.sliding, crouching: motion.crouching, jetFuel: motion.jetFuel, jetActive: motion.jetActive,
        motion: {
          ...player.motion,
          verticalVelocity: motion.verticalVelocity,
          lastJumpSequence: motion.lastJumpSequence,
          lastWallJumpSequence: motion.lastWallJumpSequence,
          lastDoubleJumpSequence: motion.lastDoubleJumpSequence,
          wallJumpDirectionX: motion.wallJumpDirectionX,
          wallJumpDirectionY: motion.wallJumpDirectionY,
          airActionConsumedSinceGrounded: motion.airActionConsumedSinceGrounded,
          jetIgnitedThisAirTime: motion.jetIgnitedThisAirTime,
          airborneMs: motion.airborneMs,
          groundedMs: motion.groundedMs,
          jetFuel: motion.jetFuel,
          jetActive: motion.jetActive,
          slideAngle: motion.slideAngle,
        },
      }),
    };
  }

  private advance(motion: PlayerMotionState, input: MultiplayerInputFrame, deltaMs: number) {
    advancePlayerMovement(
      motion,
      input,
      deltaMs,
      (position, radius) => {
        if (motion.z > 34) return false;
        let collided = false;
        for (const structure of this.structures) {
          if (structure.state === 'destroying') continue;
          collided = resolveBarricadeCollision(position, radius, structure) || collided;
        }
        return collided;
      },
      (position, radius) => {
        if (motion.z > 34) return undefined;
        for (const structure of this.structures) {
          if (structure.state === 'destroying') continue;
          const contact = getBarricadeWallContact(position, radius, structure);
          if (contact) return contact;
        }
        return undefined;
      },
      (position, radius) => {
        let floor: number | undefined;
        for (const structure of this.structures) {
          if (structure.state === 'destroying') continue;
          const top = getStructureWalkableTop(structure, position.x, position.y, radius);
          if (top !== undefined) floor = Math.max(floor ?? 0, top);
        }
        return floor;
      },
      this.worldId,
    );
  }
}
