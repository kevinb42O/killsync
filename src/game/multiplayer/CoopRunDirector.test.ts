import { describe, expect, it } from 'vitest';
import { CoopRunDirector } from './CoopRunDirector';

describe('CoopRunDirector', () => {
  it('moves deterministically from contracts through bosses to extraction', () => {
    const director = new CoopRunDirector(123);
    const centre = { x: 6000, y: 6000 };
    expect(director.advanceInsertion(44_999, centre)).toBe(false);
    expect(director.advanceInsertion(45_000, centre)).toBe(true);
    expect(director.currentObjective?.kind).toBe('uplink');
    expect(director.addUplinkProgress(100)).toBe(true);
    expect(director.currentPhase).toBe('mini_boss');
    director.activateBoss(100, 6100, 6100);
    expect(director.completeBoss(centre)).toBe('station');

    director.startContract(centre);
    expect(director.currentObjective?.kind).toBe('elite_hunt');
    director.setEliteTarget(88);
    expect(director.completeEliteTarget(88)).toBe(true);
    director.activateBoss(100, 6100, 6100);
    expect(director.completeBoss(centre)).toBe('station');
    expect(director.startFinalBoss(centre)).toBe(true);
    director.activateBoss(100, 6100, 6100);
    expect(director.completeBoss(centre)).toBe('exfil');
    expect(director.currentPhase).toBe('exfil');
    expect(director.updateExfil(12_000, 2, 2)).toBe('success');
  });

  it('loses extraction when its timer expires', () => {
    const director = new CoopRunDirector(5);
    const centre = { x: 6000, y: 6000 };
    director.advanceInsertion(45_000, centre);
    director.addUplinkProgress(100);
    director.activateBoss(100, 6000, 6000);
    director.completeBoss(centre);
    director.startContract(centre);
    director.setEliteTarget(3);
    director.completeEliteTarget(3);
    director.activateBoss(100, 6000, 6000);
    director.completeBoss(centre);
    director.startFinalBoss(centre);
    director.activateBoss(100, 6000, 6000);
    director.completeBoss(centre);
    expect(director.updateExfil(90_000, 0, 2)).toBe('failed');
  });
});
