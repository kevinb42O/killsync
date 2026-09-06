import { describe, expect, it } from 'vitest';
import {
  COOP_BASELINE_CALIBRATION_POINTS,
  COOP_IMPRINT_SCHEMA_VERSION,
  coopImprintModifiers,
  coopImprintRankCost,
  createCoopImprintProfile,
  getCoopOperatorImprint,
  normalizeCoopImprintLoadout,
  normalizeCoopImprintProfile,
  purchaseCoopImprintRank,
  settleCoopImprintRun,
} from './CoopImprint';

describe('co-op Operator Imprints', () => {
  it('clamps untrusted network loadouts to the legal stat caps', () => {
    const value = normalizeCoopImprintLoadout({ operatorId: '../bad', generation: -3, ranks: { power: 99, vitality: 4.8, mobility: -2, handling: Infinity, reach: 3 } });
    expect(value).toEqual({ operatorId: 'phantom', generation: 1, ranks: { power: 10, vitality: 4, mobility: 0, handling: 0, reach: 3 } });
    expect(normalizeCoopImprintLoadout({ operatorId: '__proto__' }).operatorId).toBe('phantom');
  });

  it('uses bounded, readable authoritative modifiers', () => {
    expect(coopImprintModifiers({ power: 10, vitality: 10, mobility: 8, handling: 10, reach: 10 })).toEqual({
      damageMultiplier: 1.4, maxHealth: 170, movementMultiplier: 1.16, handlingDurationMultiplier: .75, pickupRadiusMultiplier: 2.2,
    });
  });

  it('charges escalating rank costs', () => {
    expect([0, 2, 3, 5, 6, 8].map(coopImprintRankCost)).toEqual([1, 1, 2, 2, 3, 4]);
  });

  it('gives a fresh operator one spendable baseline point exactly once', () => {
    let profile = createCoopImprintProfile();
    expect(getCoopOperatorImprint(profile, 'phantom').unspentPoints).toBe(COOP_BASELINE_CALIBRATION_POINTS);
    profile = purchaseCoopImprintRank(profile, 'phantom', 'power');
    expect(getCoopOperatorImprint(profile, 'phantom')).toMatchObject({ unspentPoints: 0, ranks: { power: 1 } });
    expect(getCoopOperatorImprint(profile, 'phantom')).toMatchObject({ unspentPoints: 0, ranks: { power: 1 } });
  });

  it('migrates an existing Imprint with one non-repeating baseline point', () => {
    const profile = normalizeCoopImprintProfile({
      schemaVersion: 1, revision: 4, settledRunIds: ['legacy-run'],
      career: { lifetimeExtractions: 1, lifetimeWipes: 0, highestDepth: 2 },
      imprints: { phantom: { operatorId: 'phantom', generation: 1, ranks: { power: 1, vitality: 0, mobility: 0, handling: 0, reach: 0 }, unspentPoints: 0, successfulExtractions: 1, highestDepth: 2 } },
    });
    expect(profile.schemaVersion).toBe(COOP_IMPRINT_SCHEMA_VERSION);
    expect(getCoopOperatorImprint(profile, 'phantom')).toMatchObject({ unspentPoints: COOP_BASELINE_CALIBRATION_POINTS, ranks: { power: 1 } });
    expect(getCoopOperatorImprint(normalizeCoopImprintProfile(profile), 'phantom')).toMatchObject({ unspentPoints: COOP_BASELINE_CALIBRATION_POINTS, ranks: { power: 1 } });
  });

  it('settles a run once and spends extracted cores on ranks', () => {
    let profile = purchaseCoopImprintRank(createCoopImprintProfile(), 'phantom', 'reach');
    profile = settleCoopImprintRun(profile, { runId: 'run-1', operatorId: 'phantom', success: true, squadWiped: false, extractedCores: 3, depth: 3 });
    profile = settleCoopImprintRun(profile, { runId: 'run-1', operatorId: 'phantom', success: true, squadWiped: false, extractedCores: 3, depth: 3 });
    expect(getCoopOperatorImprint(profile, 'phantom').unspentPoints).toBe(3);
    profile = purchaseCoopImprintRank(profile, 'phantom', 'power');
    expect(getCoopOperatorImprint(profile, 'phantom')).toMatchObject({ unspentPoints: 2, ranks: { power: 1, reach: 1 } });
  });

  it('destroys combat calibration on a wipe but preserves career history', () => {
    let profile = settleCoopImprintRun(createCoopImprintProfile(), { runId: 'win', operatorId: 'phantom', success: true, squadWiped: false, extractedCores: 2, depth: 3 });
    profile = purchaseCoopImprintRank(profile, 'phantom', 'vitality');
    profile = settleCoopImprintRun(profile, { runId: 'wipe', operatorId: 'phantom', success: false, squadWiped: true, extractedCores: 8, depth: 2 });
    expect(getCoopOperatorImprint(profile, 'phantom')).toMatchObject({ generation: 2, unspentPoints: 1, successfulExtractions: 0, ranks: { vitality: 0 } });
    expect(profile.career).toEqual({ lifetimeExtractions: 1, lifetimeWipes: 1, highestDepth: 3 });
  });

  it('preserves installed ranks after a failed mission when the squad survives', () => {
    let profile = purchaseCoopImprintRank(createCoopImprintProfile(), 'phantom', 'handling');
    profile = settleCoopImprintRun(profile, { runId: 'missed-exfil', operatorId: 'phantom', success: false, squadWiped: false, extractedCores: 9, depth: 2 });
    expect(getCoopOperatorImprint(profile, 'phantom')).toMatchObject({ generation: 1, unspentPoints: 0, ranks: { handling: 1 } });
    expect(profile.career).toEqual({ lifetimeExtractions: 0, lifetimeWipes: 0, highestDepth: 2 });
    expect(profile.settledRunIds).toContain('missed-exfil');
  });
});
