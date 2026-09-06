/**
 * Host-owned co-op run pacing.  This module deliberately contains no renderer,
 * browser, or transport code so the entire session arc can be tested with a
 * fixed seed.
 */
import { findClearRunPosition } from './runPlacement';
import type { RunPlacementExclusion } from './runPlacement';
import type { CoopTextKey } from './i18n';

export type CoopRunPhase = 'insertion' | 'contract' | 'mini_boss' | 'checkpoint' | 'final_boss' | 'exfil' | 'success' | 'failed';
export type CoopObjectiveKind = 'uplink' | 'elite_hunt';
export type CoopBossKind = 'neural_overlord' | 'void_architect' | 'singularity';

export interface CoopObjectiveSnapshot {
  id: number;
  kind: CoopObjectiveKind;
  titleKey: CoopTextKey;
  descriptionKey: CoopTextKey;
  x: number;
  y: number;
  progress: number;
  required: number;
  /** For Elite Hunt this points at the tracked enemy; for Uplink it is absent. */
  targetEnemyId?: number;
  completed: boolean;
  contested?: boolean;
  occupants?: number;
}

export interface CoopBossSnapshot {
  id: number;
  kind: CoopBossKind;
  nameKey: CoopTextKey;
  health: number;
  maxHealth: number;
  phase: number;
  x: number;
  y: number;
}

export interface CoopExfilSnapshot {
  x: number;
  y: number;
  radius: number;
  holdProgressMs: number;
  holdRequiredMs: number;
  remainingMs: number;
}

export interface CoopRunSnapshot {
  phase: CoopRunPhase;
  elapsedMs: number;
  contractIndex: number;
  bossesDefeated: number;
  objective?: CoopObjectiveSnapshot;
  boss?: CoopBossSnapshot;
  exfil?: CoopExfilSnapshot;
  /** Safe staging window before the normal encounter director is released. */
  insertionRemainingMs?: number;
  insertionDurationMs?: number;
  /** Semantic text key localized independently by each client. */
  noticeKey: CoopTextKey;
}

export const COOP_INSERTION_DURATION_MS = 12_000;
export const COOP_UPLINK_RADIUS = 155;
export const COOP_BOSS_BASE_HEALTH: Readonly<Record<CoopBossKind, number>> = Object.freeze({
  neural_overlord: 4_800,
  void_architect: 9_500,
  singularity: 34_000,
});
const EXFIL_MS = 90_000;
const EXFIL_HOLD_MS = 12_000;
export const COOP_CHECKPOINT_DECISION_MS = 20_000;
export const COOP_CHECKPOINT_HOLD_MS = 5_000;

/** Total boss durability grows, while durability per operator falls modestly.
 * This rewards adding teammates without making a four-player focus-fire squad
 * erase a contract boss at solo speed. */
export function coopBossHealth(kind: CoopBossKind, playerCount: number) {
  const members = Math.max(1, Math.min(4, Math.trunc(playerCount)));
  return Math.round(COOP_BOSS_BASE_HEALTH[kind] * (1 + (members - 1) * .70));
}

export function coopObjectiveEliteHealth(baseHealth: number, playerCount: number) {
  const members = Math.max(1, Math.min(4, Math.trunc(playerCount)));
  return Math.round(baseHealth * (1 + (members - 1) * .75));
}

/** A tiny deterministic state machine. Simulation owns all positional and
 * combat validation; this director only decides which beat is currently live. */
export class CoopRunDirector {
  private phase: CoopRunPhase = 'insertion';
  private contractIndex = 0;
  private bossesDefeated = 0;
  private objective?: CoopObjectiveSnapshot;
  private boss?: CoopBossSnapshot;
  private exfil?: CoopExfilSnapshot;
  private noticeKey: CoopTextKey = 'objective.dropIn';
  private nextId = 1;

  constructor(private readonly seed: number, private readonly stationExclusions: readonly RunPlacementExclusion[] = []) {}

  get currentPhase() { return this.phase; }
  get currentObjective() { return this.objective; }
  get currentBoss() { return this.boss; }
  get currentExfil() { return this.exfil; }

  /** Starts the first contract after the short opening horde. */
  advanceInsertion(elapsedMs: number, centre: { x: number; y: number }) {
    if (this.phase !== 'insertion' || elapsedMs < COOP_INSERTION_DURATION_MS) return false;
    this.startContract(centre);
    return true;
  }

  startContract(centre: { x: number; y: number }) {
    if (this.phase !== 'insertion' && this.phase !== 'mini_boss') return;
    const kind = this.contractIndex === 0 ? 'uplink' : 'elite_hunt';
    const offset = this.offset(this.contractIndex + 1, 560);
    const { x, y } = findClearRunPosition({ x: centre.x + offset.x, y: centre.y + offset.y }, COOP_UPLINK_RADIUS, this.stationExclusions);
    this.objective = kind === 'uplink'
      ? { id: this.nextId++, kind, titleKey: 'objective.secureUplink', descriptionKey: 'objective.districtUplink', x, y, progress: 0, required: 100, completed: false, contested: false, occupants: 0 }
      : { id: this.nextId++, kind, titleKey: 'objective.huntElite', descriptionKey: 'objective.huntEliteDescription', x, y, progress: 0, required: 1, completed: false };
    this.phase = 'contract';
    this.noticeKey = this.objective.titleKey;
  }

  setEliteTarget(enemyId: number) {
    if (this.phase === 'contract' && this.objective?.kind === 'elite_hunt') this.objective.targetEnemyId = enemyId;
  }

  trackEliteTarget(enemyId: number, x: number, y: number) {
    if (this.objective?.targetEnemyId !== enemyId) return;
    this.objective.x = x; this.objective.y = y;
  }

  updateUplink(deltaMs: number, occupants: number, contested: boolean) {
    if (this.objective?.kind !== 'uplink' || this.phase !== 'contract') return false;
    this.objective.occupants = occupants;
    this.objective.contested = contested;
    if (contested || occupants <= 0) return false;
    return this.addUplinkProgress(Math.max(0, deltaMs) / 300 * (1 + Math.min(1.5, (occupants - 1) * .5)));
  }

  addUplinkProgress(amount: number) {
    if (this.phase !== 'contract' || this.objective?.kind !== 'uplink' || this.objective.completed) return false;
    this.objective.progress = Math.min(this.objective.required, this.objective.progress + Math.max(0, amount));
    if (this.objective.progress < this.objective.required) return false;
    this.completeObjective();
    return true;
  }

  completeEliteTarget(enemyId: number) {
    if (this.phase !== 'contract' || this.objective?.kind !== 'elite_hunt' || this.objective.targetEnemyId !== enemyId) return false;
    this.objective.progress = this.objective.required;
    this.completeObjective();
    return true;
  }

  private completeObjective() {
    if (!this.objective) return;
    const offset = this.offset(this.contractIndex + 4, 620);
    const position = findClearRunPosition({ x: this.objective.x + offset.x, y: this.objective.y + offset.y }, 170, this.stationExclusions);
    this.objective.completed = true;
    this.objective = undefined;
    this.phase = 'mini_boss';
    const kind: CoopBossKind = this.contractIndex === 0 ? 'neural_overlord' : 'void_architect';
    this.noticeKey = 'objective.contractComplete';
    // Simulation sets final health/position after it scales to the live squad.
    this.boss = { id: this.nextId++, kind, nameKey: bossNameKey(kind), health: 0, maxHealth: 0, phase: 1, ...position };
  }

  activateBoss(health: number, x: number, y: number) {
    if (!this.boss) return;
    this.boss.health = health; this.boss.maxHealth = health; this.boss.x = x; this.boss.y = y;
    this.noticeKey = 'objective.bossDetected';
  }

  updateBoss(health: number, x: number, y: number) {
    if (!this.boss) return;
    this.boss.health = Math.max(0, health); this.boss.x = x; this.boss.y = y;
    const ratio = this.boss.maxHealth > 0 ? this.boss.health / this.boss.maxHealth : 1;
    this.boss.phase = ratio <= .20 ? 3 : ratio <= .55 ? 2 : 1;
  }

  completeBoss(centre: { x: number; y: number }) {
    if (this.phase === 'mini_boss') {
      this.boss = undefined;
      this.bossesDefeated++;
      this.contractIndex++;
      if (this.contractIndex <= 2) {
        const offset = this.offset(this.contractIndex + 9, 260);
        this.phase = 'checkpoint';
        this.exfil = { ...findClearRunPosition({ x: centre.x + offset.x, y: centre.y + offset.y }, 120, this.stationExclusions), radius: 100, holdProgressMs: 0, holdRequiredMs: COOP_CHECKPOINT_HOLD_MS, remainingMs: COOP_CHECKPOINT_DECISION_MS };
        this.noticeKey = 'objective.exfilMove';
        return 'checkpoint' as const;
      }
      return undefined;
    }
    if (this.phase === 'final_boss') {
      this.boss = undefined;
      this.bossesDefeated++;
      const offset = this.offset(7, 330);
      this.phase = 'exfil';
      this.exfil = { ...findClearRunPosition({ x: centre.x + offset.x, y: centre.y + offset.y }, 120, this.stationExclusions), radius: 100, holdProgressMs: 0, holdRequiredMs: EXFIL_HOLD_MS, remainingMs: EXFIL_MS };
      this.noticeKey = 'objective.exfilMove';
      return 'exfil' as const;
    }
    return undefined;
  }

  /** A unanimous early-extraction vote expressed spatially: every living
   * operator must hold the beacon. If the window expires, the squad breaches
   * deeper and the authored campaign continues unchanged. */
  updateCheckpoint(deltaMs: number, livingInZone: number, livingPlayers: number) {
    if (this.phase !== 'checkpoint' || !this.exfil) return undefined;
    this.exfil.remainingMs = Math.max(0, this.exfil.remainingMs - Math.max(0, deltaMs));
    if (livingPlayers > 0 && livingInZone === livingPlayers) this.exfil.holdProgressMs = Math.min(this.exfil.holdRequiredMs, this.exfil.holdProgressMs + Math.max(0, deltaMs));
    else this.exfil.holdProgressMs = Math.max(0, this.exfil.holdProgressMs - Math.max(0, deltaMs) * .5);
    if (this.exfil.holdProgressMs >= this.exfil.holdRequiredMs) {
      this.phase = 'success'; this.noticeKey = 'objective.extracted'; return 'success' as const;
    }
    if (livingPlayers <= 0) { this.phase = 'failed'; this.noticeKey = 'objective.squadWiped'; return 'failed' as const; }
    if (this.exfil.remainingMs <= 0) {
      this.phase = 'mini_boss'; this.exfil = undefined; this.noticeKey = 'objective.stationPrepare'; return 'continue' as const;
    }
    return undefined;
  }

  startFinalBoss(centre: { x: number; y: number }) {
    if (this.phase !== 'mini_boss' || this.contractIndex !== 2) return false;
    const offset = this.offset(6, 720);
    this.phase = 'final_boss';
    this.boss = { id: this.nextId++, kind: 'singularity', nameKey: bossNameKey('singularity'), health: 0, maxHealth: 0, phase: 1, ...findClearRunPosition({ x: centre.x + offset.x, y: centre.y + offset.y }, 170, this.stationExclusions) };
    this.noticeKey = 'objective.finalBreach';
    return true;
  }

  updateExfil(deltaMs: number, livingInZone: number, livingPlayers: number) {
    if (this.phase !== 'exfil' || !this.exfil) return undefined;
    this.exfil.remainingMs = Math.max(0, this.exfil.remainingMs - deltaMs);
    // One player can hold the beacon; the full living squad accelerates it.
    if (livingInZone > 0) {
      const multiplier = 1 + Math.min(1.5, Math.max(0, livingInZone - 1) * .5);
      this.exfil.holdProgressMs = Math.min(this.exfil.holdRequiredMs, this.exfil.holdProgressMs + deltaMs * multiplier);
    } else {
      this.exfil.holdProgressMs = Math.max(0, this.exfil.holdProgressMs - deltaMs * .25);
    }
    if (this.exfil.holdProgressMs >= this.exfil.holdRequiredMs) {
      this.phase = 'success'; this.noticeKey = 'objective.extracted'; return 'success' as const;
    }
    if (this.exfil.remainingMs <= 0 || livingPlayers <= 0) {
      this.phase = 'failed'; this.noticeKey = 'objective.exfilLost'; return 'failed' as const;
    }
    return undefined;
  }

  fail() { if (this.phase !== 'success') { this.phase = 'failed'; this.noticeKey = 'objective.squadWiped'; } }

  snapshot(elapsedMs: number): CoopRunSnapshot {
    return {
      phase: this.phase, elapsedMs, contractIndex: this.contractIndex, bossesDefeated: this.bossesDefeated,
      objective: this.objective && { ...this.objective },
      boss: this.boss && { ...this.boss },
      exfil: this.exfil && { ...this.exfil }, noticeKey: this.noticeKey,
      insertionRemainingMs: this.phase === 'insertion' ? Math.max(0, COOP_INSERTION_DURATION_MS - elapsedMs) : undefined,
      insertionDurationMs: this.phase === 'insertion' ? COOP_INSERTION_DURATION_MS : undefined,
    };
  }

  private offset(index: number, distance: number) {
    const angle = ((this.seed + index * 0x9e3779b9) >>> 0) / 0x1_0000_0000 * Math.PI * 2;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  }
}

function bossNameKey(kind: CoopBossKind): CoopTextKey {
  return `boss.${kind}` as CoopTextKey;
}
