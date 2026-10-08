import { frontierTrees } from './FriendsFrontier';
import { collidePhysicalCargo } from './FriendsHauling';
import { FriendsTerrain, FRIENDS_STEP_HEIGHT } from '../world/FriendsTerrain';
import { friendsBuildFloor, friendsWalkFloor, friendsInclineConnects, friendsBuildCeiling, resolveFriendsBuildCollisions } from './FriendsBuilding';
import { friendsWorldFloor, friendsVehicleFloor, friendsVehicleCeiling, FRIENDS_FLIGHT_CEILING, resolveFriendsVehicleCollisions, type FriendsSnapshot } from './FriendsExpedition';
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
  private terrain = new FriendsTerrain();
  private terrainRevision = -1;
  private friends?: FriendsSnapshot;
  private lastRedeployEventId = -1;

  constructor(private readonly playerId: string) {}

  /** A Friends world import replaces the terrain beneath the same players. */
  resetWorld() {
    this.pending = [];
    this.motion = undefined;
    this.latestTick = -1;
    this.lifeState = undefined;
    this.terrainRevision = -1;
    this.friends = undefined;
    this.correction = { x: 0, y: 0, z: 0 };
  }

  reconcile(snapshot: CoopSnapshot) {
    const player = snapshot.players.find(candidate => candidate.id === this.playerId);
    const nextWorldId = snapshot.world?.id || 'neon_bastion';
    const rewound = snapshot.tick < this.latestTick;
    if (rewound) this.lastRedeployEventId = -1;
    const redeployId = snapshot.combatEvents.reduce((latest, event) => event.kind === 'player_redeployed' && event.playerId === this.playerId ? Math.max(latest, event.id) : latest, this.lastRedeployEventId);
    const redeployed = redeployId > this.lastRedeployEventId;
    this.lastRedeployEventId = redeployId;
    const reset = rewound || redeployed || player?.lifeState !== this.lifeState || snapshot.matchState !== 'active' || nextWorldId !== this.worldId;
    this.latestTick = snapshot.tick;
    this.lifeState = player?.lifeState;
    this.structures = snapshot.structures || [];
    this.friends = snapshot.friends;
    const terrain = snapshot.friends?.frontier?.terrain;
    if (terrain && terrain.revision !== this.terrainRevision) { this.terrain.restore(terrain); this.terrainRevision = terrain.revision; }
    this.worldId = nextWorldId;
    if (reset) { this.pending = []; this.motion = undefined; this.correction = { x: 0, y: 0, z: 0 }; }
    if (!player || player.lifeState !== 'alive') return;
    // Keep a passenger and its moving deck on the same interpolated timeline.
    // Ground prediction cannot replay a pilot’s remote vehicle motion.
    const onLoad=this.friends?.building?.pieces.some(p=>p.attachment&&Math.abs((friendsBuildFloor([p],player.x,player.y,player.z,0)??Infinity)-player.z)<2);
    const vehicleFloor = this.friends && friendsVehicleFloor(this.friends.vehicles, player.x, player.y, player.z);
    if (this.friends && !player.friendsDevFlight && (onLoad || player.friendsSeat || this.friends.hauling?.ropes.some(r => r.id === player.id) || this.friends.vehicles.some(v => v.pilotId === player.id) || (vehicleFloor !== undefined && Math.abs(player.z - vehicleFloor) < 2))) { this.pending = []; this.motion = undefined; this.correction = { x: 0, y: 0, z: 0 }; return; }
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
        friendsDevFlight: motion.friendsDevFlight, angle: motion.angle, sprinting: motion.sprinting, sliding: motion.sliding, crouching: motion.crouching, jetFuel: motion.jetFuel, jetActive: motion.jetActive,
        motion: {
          ...player.motion,
          velocityX: motion.velocityX,
          velocityY: motion.velocityY,
          coyoteMs: motion.coyoteMs,
          jumpBufferMs: motion.jumpBufferMs,
          bufferedJumpSequence: motion.bufferedJumpSequence,
          lastJumpInputSequence: motion.lastJumpInputSequence,
          slideMs: motion.slideMs,
          slideHeld: motion.slideHeld,
          verticalVelocity: motion.verticalVelocity,
          lastJumpSequence: motion.lastJumpSequence,
          lastWallJumpSequence: motion.lastWallJumpSequence,
          lastDoubleJumpSequence: motion.lastDoubleJumpSequence,
          wallJumpDirectionX: motion.wallJumpDirectionX,
          wallJumpDirectionY: motion.wallJumpDirectionY,
          airActionConsumedSinceGrounded: motion.airActionConsumedSinceGrounded,
          jetIgnitedThisAirTime: motion.jetIgnitedThisAirTime,
          jetLaunchFloor: motion.jetLaunchFloor,
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
        let collided = this.friends ? resolveFriendsVehicleCollisions(this.friends.vehicles, position, motion.z, radius) : false;
        if (this.friends?.hauling) collided = collidePhysicalCargo(this.friends.hauling.cargo, position, motion.z, radius) || collided;
        if (this.friends?.frontier) {
          collided = this.terrain.collide(position, motion.z, radius, 50, FRIENDS_STEP_HEIGHT, (x,y,top)=>friendsInclineConnects(this.friends?.building?.pieces??[],position,motion.z,x,y,top)) || collided;
          const cx = Math.floor(position.x / 512), cy = Math.floor(position.y / 512), removed = new Set(this.friends.frontier.harvested);
          const trees = [...this.friends.frontier.planted]; for (let a = cx-1; a <= cx+1; a++) for (let b = cy-1; b <= cy+1; b++) trees.push(...frontierTrees(a,b));
          for (const t of trees) { if (removed.has(t.id) || !this.terrain.supports(t.x,t.y,t.z) || motion.z >= t.z + 180*t.scale || motion.z+50 < t.z) continue; const dx=position.x-t.x,dy=position.y-t.y,d=Math.hypot(dx,dy),extent=radius+10*t.scale; if(d<extent){position.x=t.x+(d>.001?dx/d:1)*extent;position.y=t.y+(d>.001?dy/d:0)*extent;collided=true;} }
        }
        if (this.friends?.building) collided = resolveFriendsBuildCollisions(this.friends.building.pieces, position, motion.z, radius) || collided;
        if (motion.z > 34) return collided;
        for (const structure of this.structures) {
          if (structure.state === 'destroying') continue;
          collided = resolveBarricadeCollision(position, radius, structure) || collided;
        }
        return collided;
      },
      (position, radius) => {
        const terrainContact = this.friends?.frontier && this.terrain.wallContact(position, motion.z, radius);
        if (terrainContact) return terrainContact;
        if (this.friends?.building) { const test = { ...position }; if (resolveFriendsBuildCollisions(this.friends.building.pieces, test, motion.z, radius + 2, 50, 0)) { const d = Math.hypot(test.x - position.x, test.y - position.y); if (d > .001) return { normalX: (test.x - position.x) / d, normalY: (test.y - position.y) / d }; } }
        if (motion.z > 34) return undefined;
        for (const structure of this.structures) {
          if (structure.state === 'destroying') continue;
          const contact = getBarricadeWallContact(position, radius, structure);
          if (contact) return contact;
        }
        return undefined;
      },
      (position, radius) => {
        let floor = this.friends ? friendsWorldFloor(this.friends.vehicles, position.x, position.y, motion.z) : undefined;
        const ground = this.friends?.frontier && this.terrain.floor(position.x, position.y, motion.z);
        if (ground !== undefined) floor = Math.max(floor ?? -Infinity, ground);
        const creative = this.friends?.building && friendsWalkFloor(this.friends.building.pieces, position.x, position.y, motion.z, radius, this.friends?.frontier?this.terrain:undefined);
        if (creative !== undefined) floor = Math.max(floor ?? -Infinity, creative);
        for (const structure of this.structures) {
          if (structure.state === 'destroying') continue;
          const top = getStructureWalkableTop(structure, position.x, position.y, radius);
          if (top !== undefined) floor = Math.max(floor ?? 0, top);
        }
        return floor;
      },
      this.worldId,
      this.friends ? { elevationAware: true, devFlightAllowed: true, ceiling: FRIENDS_FLIGHT_CEILING, stepHeight: FRIENDS_STEP_HEIGHT, volumetric: Boolean(this.friends.frontier), boardingFloor: position => friendsVehicleFloor(this.friends!.vehicles, position.x, position.y, position.z), overhead: position => { const a = friendsVehicleCeiling(this.friends!.vehicles, position.x, position.y, position.z), b = friendsBuildCeiling(this.friends!.building?.pieces || [], position.x, position.y, position.z); return Math.min(a ?? Infinity, b ?? Infinity, this.friends?.frontier ? this.terrain.ceiling(position.x, position.y, position.z) ?? Infinity : Infinity); } } : undefined,
    );
  }
}
