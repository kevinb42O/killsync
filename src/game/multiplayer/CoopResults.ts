import type { CoopPassiveModuleId } from './CoopPassiveModules';
import type { CoopTextKey } from './i18n';

export interface CoopPlayerRunStats {
  playerId: string;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  firearmDamage: number;
  passiveDamage: number;
  engineeringDamage: number;
  /** Optional for backward-compatible saved result frames. */
  engineeringHealing?: number;
  structureDamageAbsorbed: number;
  structuresBuilt: number;
  structuresLost: number;
  chargesRefunded: number;
  bossDamage: number;
  damageTaken: number;
  revives: number;
  clutchSaves: number;
  creditsEarned: number;
  creditsSpent: number;
  selfReviveUsed: boolean;
  dataCoresExtracted: number;
  passiveDamageById: Partial<Record<CoopPassiveModuleId, number>>;
}

export interface CoopPlayerResult extends CoopPlayerRunStats { label: string; color: string; medalKey: CoopTextKey; }
export interface CoopRunResultsSnapshot {
  runId: string;
  success: boolean;
  /** True only when every remaining squad member was fully eliminated. A
   * missed objective/extraction can fail the run without destroying Imprints. */
  squadWiped: boolean;
  durationMs: number;
  contractsCompleted: number;
  bossesDefeated: number;
  players: CoopPlayerResult[];
}

export function createRunStats(playerId: string): CoopPlayerRunStats {
  return { playerId, kills: 0, shotsFired: 0, shotsHit: 0, firearmDamage: 0, passiveDamage: 0, engineeringDamage: 0, engineeringHealing: 0, structureDamageAbsorbed: 0, structuresBuilt: 0, structuresLost: 0, chargesRefunded: 0, bossDamage: 0, damageTaken: 0, revives: 0, clutchSaves: 0, creditsEarned: 0, creditsSpent: 0, selfReviveUsed: false, dataCoresExtracted: 0, passiveDamageById: {} };
}

export function awardMedals(players: Array<CoopPlayerRunStats & { label: string; color: string }>): CoopPlayerResult[] {
  const leader = (field: keyof CoopPlayerRunStats) => Math.max(0, ...players.map(player => Number(player[field]) || 0));
  const reviveLead = leader('revives'), bossLead = leader('bossDamage'), passiveLead = leader('passiveDamage'), gunLead = leader('firearmDamage');
  const engineeringLead = Math.max(0, ...players.map(player => player.engineeringDamage + (player.engineeringHealing || 0) + player.structureDamageAbsorbed));
  return players.map(player => {
    const medalKey: CoopTextKey = player.clutchSaves > 0 ? 'result.medal.clutch'
      : player.revives > 0 && player.revives === reviveLead ? 'result.medal.guardian'
        : player.bossDamage > 0 && player.bossDamage === bossLead ? 'result.medal.boss'
          : engineeringLead >= 250 && player.engineeringDamage + (player.engineeringHealing || 0) + player.structureDamageAbsorbed === engineeringLead ? 'result.medal.engineer'
          : player.passiveDamage > 0 && player.passiveDamage === passiveLead ? 'result.medal.passive'
            : player.firearmDamage === gunLead && gunLead > 0 ? 'result.medal.arsenal' : 'result.medal.survivor';
    return { ...player, medalKey };
  });
}
