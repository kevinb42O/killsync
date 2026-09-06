import * as THREE from 'three';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';

/** Stamp interval in ms — how often we drop a new trail ring per player. */
const STAMP_INTERVAL_MS = 80;

/** How long (ms) each ring lingers before fully fading. */
const RING_LIFE_MS = 520;

/** Minimum movement distance (world units) to qualify for a stamp. */
const MIN_MOVE_DIST = 4;

/**
 * Keep the newest ring behind the operator instead of directly beneath the
 * first-person camera. This is slightly larger than the player's collision
 * radius, with enough extra room for the ring's outer edge.
 */
const TRAIL_BACK_OFFSET = 30;

/** Max concurrent trail rings in the shared pool. */
const POOL_SIZE = 72;

const WALK_COLOR = new THREE.Color(0x38bdf8);   // Ice blue  — calm walk
const SPRINT_COLOR = new THREE.Color(0xfbbf24);  // Amber     — sprint
const SLIDE_COLOR = new THREE.Color(0xf97316);   // Orange    — slide

// Shared geometry for all trail rings (cheap RingGeometry, flat on ground)
const TRAIL_GEOMETRY = new THREE.RingGeometry(5.5, 8.5, 24);
TRAIL_GEOMETRY.rotateX(-Math.PI / 2);

interface TrailRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  ownerId?: string;
}

interface PlayerTrailState {
  lastStampMs: number;
  lastX: number;
  lastY: number;
}

/**
 * OperatorTrailSystem
 *
 * Renders subtle, fading ground-ring footprints behind every operator as they
 * move. Colour differentiates movement mode:
 *   Walk/jog → ice blue | Sprint → amber | Slide → orange
 *
 * Airborne operators do not leave ground trails. Besides being physically
 * misleading, stamping an additive orange ring below the first-person camera
 * made jumps read as a brief red flash on the floor.
 *
 * Performance:
 * - Fixed pool of POOL_SIZE ring meshes — zero allocation per frame.
 * - Flat RingGeometry, additive blending, no depth write.
 * - Stamp interval throttled to ~80 ms per player.
 */
export class OperatorTrailSystem {
  private readonly pool: TrailRing[];
  private poolHead = 0;
  private readonly playerState = new Map<string, PlayerTrailState>();

  constructor(private readonly scene: THREE.Scene) {
    this.pool = Array.from({ length: POOL_SIZE }, () => {
      const mat = new THREE.MeshBasicMaterial({
        color: WALK_COLOR.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(TRAIL_GEOMETRY, mat);
      mesh.position.y = 0.6;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, mat, life: 0, maxLife: RING_LIFE_MS };
    });
  }

  update(
    players: CoopPlayerSnapshot[],
    elapsedMs: number,
    deltaMs: number,
    hiddenPlayerId?: string,
  ): void {
    // Age all active rings
    for (const ring of this.pool) {
      if (ring.ownerId === hiddenPlayerId) {
        ring.life = 0;
        ring.mesh.visible = false;
        ring.mat.opacity = 0;
        continue;
      }
      if (ring.life <= 0) continue;
      ring.life -= deltaMs;
      if (ring.life <= 0) {
        ring.mesh.visible = false;
        ring.mat.opacity = 0;
      } else {
        const t = ring.life / ring.maxLife;
        ring.mat.opacity = Math.pow(t, 0.55) * 0.34;
      }
    }

    // Stamp new rings for alive, moving players
    for (const player of players) {
      // The camera-owning operator must not put translucent geometry into its
      // own floor stack. Teammate trails remain visible world-space cues.
      if (player.id === hiddenPlayerId) {
        this.playerState.delete(player.id);
        continue;
      }
      if (player.lifeState !== 'alive') {
        this.playerState.delete(player.id);
        continue;
      }

      let state = this.playerState.get(player.id);
      if (!state) {
        state = { lastStampMs: -Infinity, lastX: player.x, lastY: player.y };
        this.playerState.set(player.id, state);
      }

      const dx = player.x - state.lastX;
      const dy = player.y - state.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const timeSinceStamp = elapsedMs - state.lastStampMs;

      // Keep the trail origin caught up while airborne, but never stamp the
      // floor. Resetting the interval also prevents a ring popping on the
      // exact landing frame from movement accumulated during the jump.
      if (player.z > 0.4) {
        state.lastStampMs = elapsedMs;
        state.lastX = player.x;
        state.lastY = player.y;
        continue;
      }

      if (dist < MIN_MOVE_DIST || timeSinceStamp < STAMP_INTERVAL_MS) continue;

      state.lastStampMs = elapsedMs;
      state.lastX = player.x;
      state.lastY = player.y;

      const inverseDistance = 1 / dist;
      this.stamp(
        player.id,
        player.x - dx * inverseDistance * TRAIL_BACK_OFFSET,
        player.y - dy * inverseDistance * TRAIL_BACK_OFFSET,
        player.sliding,
        player.sprinting
      );
    }

    // Prune departed players
    for (const id of this.playerState.keys()) {
      if (!players.some(p => p.id === id)) this.playerState.delete(id);
    }
  }

  dispose(): void {
    for (const ring of this.pool) {
      this.scene.remove(ring.mesh);
      ring.mat.dispose();
    }
    this.pool.length = 0;
    this.playerState.clear();
  }

  private stamp(ownerId: string, x: number, y: number, isSlide: boolean, isSprint: boolean): void {
    const ring = this.pool[this.poolHead % POOL_SIZE];
    this.poolHead++;

    const color = isSlide ? SLIDE_COLOR : isSprint ? SPRINT_COLOR : WALK_COLOR;
    ring.mat.color.copy(color);
    ring.ownerId = ownerId;
    ring.life = RING_LIFE_MS;
    ring.maxLife = RING_LIFE_MS;
    ring.mat.opacity = 0.34;
    ring.mesh.position.set(x, 0.6, y);
    ring.mesh.visible = true;
    const s = 0.82 + Math.random() * 0.36;
    ring.mesh.scale.set(s, 1, s);
  }
}
