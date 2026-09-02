import type { CoopPassiveModuleId } from './CoopPassiveModules';

export interface CoopPlayerRunStats {
  playerId: string;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  firearmDamage: number;
  passiveDamage: number;
  bossDamage: number;
  damageTaken: number;
  revives: number;
  clutchSaves: number;
  creditsEarned: number;
  creditsSpent: number;
  selfReviveUsed: boolean;
  passiveDamageById: Partial<Record<CoopPassiveModuleId, number>>;
}

export interface CoopPlayerResult extends CoopPlayerRunStats { label: string; color: string; medal: string; }
export interface CoopRunResultsSnapshot { success: boolean; durationMs: number; contractsCompleted: number; bossesDefeated: number; players: CoopPlayerResult[]; }

export function createRunStats(playerId: string): CoopPlayerRunStats {
  return { playerId, kills: 0, shotsFired: 0, shotsHit: 0, firearmDamage: 0, passiveDamage: 0, bossDamage: 0, damageTaken: 0, revives: 0, clutchSaves: 0, creditsEarned: 0, creditsSpent: 0, selfReviveUsed: false, passiveDamageById: {} };
}

export function awardMedals(players: Array<CoopPlayerRunStats & { label: string; color: string }>): CoopPlayerResult[] {
  const leader = (field: keyof CoopPlayerRunStats) => Math.max(0, ...players.map(player => Number(player[field]) || 0));
  const reviveLead = leader('revives'), bossLead = leader('bossDamage'), passiveLead = leader('passiveDamage'), gunLead = leader('firearmDamage');
  return players.map(player => {
    const medal = player.clutchSaves > 0 ? 'CLUTCH EXTRACTOR'
      : player.revives > 0 && player.revives === reviveLead ? 'GUARDIAN ANGEL'
        : player.bossDamage > 0 && player.bossDamage === bossLead ? 'BOSS BREAKER'
          : player.passiveDamage > 0 && player.passiveDamage === passiveLead ? 'ORBITAL BLENDER'
            : player.firearmDamage === gunLead && gunLead > 0 ? 'ARSENAL EXPERT' : 'SQUAD SURVIVOR';
    return { ...player, medal };
  });
}
