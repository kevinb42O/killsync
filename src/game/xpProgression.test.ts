import { describe, expect, it } from 'vitest';
import {
  MAX_ACCOUNT_LEVEL,
  applyAccountXP,
  createDeathXPBreakdown,
  createExfillXPBreakdown,
  getAccountXPRequired,
  sumXPBreakdown
} from './xpProgression';

describe('xp progression', () => {
  it('returns required XP of 0 at max level', () => {
    expect(getAccountXPRequired(MAX_ACCOUNT_LEVEL)).toBe(0);
  });

  it('applies XP without leveling if below threshold', () => {
    const res = applyAccountXP(1, 0, 50);
    expect(res.level).toBe(1);
    expect(res.xp).toBe(50);
    expect(res.overflow).toBe(0);
  });

  it('levels up exactly at threshold', () => {
    const req = getAccountXPRequired(1);
    const res = applyAccountXP(1, 0, req);
    expect(res.level).toBe(2);
    expect(res.xp).toBe(0);
    expect(res.overflow).toBe(0);
  });

  it('carries remainder XP after level up', () => {
    const req = getAccountXPRequired(1);
    const res = applyAccountXP(1, 0, req + 25);
    expect(res.level).toBe(2);
    expect(res.xp).toBe(25);
    expect(res.overflow).toBe(0);
  });

  it('does not progress beyond max level', () => {
    const res = applyAccountXP(MAX_ACCOUNT_LEVEL, 0, 100000);
    expect(res.level).toBe(MAX_ACCOUNT_LEVEL);
    expect(res.xp).toBe(0);
    expect(res.overflow).toBe(0);
  });

  it('clamps negative/float gained XP inputs', () => {
    const negative = applyAccountXP(10, 10, -25);
    expect(negative.level).toBe(10);
    expect(negative.xp).toBe(10);

    const floatInput = applyAccountXP(3, 0, 12.8);
    expect(floatInput.xp).toBe(12);
  });

  it('handles multi-level jumps in one reward burst', () => {
    const req1 = getAccountXPRequired(1);
    const req2 = getAccountXPRequired(2);
    const req3 = getAccountXPRequired(3);
    const res = applyAccountXP(1, 0, req1 + req2 + req3 + 17);
    expect(res.level).toBe(4);
    expect(res.xp).toBe(17);
    expect(res.overflow).toBe(0);
  });

  it('caps and discards overflow when crossing max level', () => {
    const nearCapLevel = MAX_ACCOUNT_LEVEL - 1;
    const required = getAccountXPRequired(nearCapLevel);
    const res = applyAccountXP(nearCapLevel, required - 5, 1000000);
    expect(res.level).toBe(MAX_ACCOUNT_LEVEL);
    expect(res.xp).toBe(0);
    expect(res.overflow).toBe(0);
  });
});

describe('xp breakdown rewards', () => {
  it('calculates death reward only from kills and time', () => {
    const breakdown = createDeathXPBreakdown(120000, 50);
    expect(breakdown).toEqual([
      { label: 'Kill XP', value: 200 },
      { label: 'Survival Time XP', value: 240 }
    ]);
    expect(sumXPBreakdown(breakdown)).toBe(440);
  });

  it('calculates exfill reward with all channels', () => {
    const breakdown = createExfillXPBreakdown({
      timeMs: 180000,
      kills: 120,
      level: 14,
      coins: 3000,
      dataCores: 3,
      weaponCount: 6,
      weaponLevelTotal: 16,
      upgradeCount: 22
    });

    const lookup = Object.fromEntries(breakdown.map(item => [item.label, item.value]));
    expect(lookup['Exfill Bonus XP']).toBe(250);
    expect(lookup['Kill XP']).toBe(600);
    expect(lookup['Survival Time XP']).toBe(396);
    expect(lookup['Level Reached XP']).toBe(420);
    expect(lookup['Weapons Collected XP']).toBe(240);
    expect(lookup['Weapon Mastery XP']).toBe(320);
    expect(lookup['Gold Extracted XP']).toBe(450);
    expect(lookup['Data Core XP']).toBe(375);
    expect(lookup['Upgrade Picks XP']).toBe(396);
    expect(sumXPBreakdown(breakdown)).toBe(3447);
  });

  it('filters non-positive values in total sum', () => {
    const total = sumXPBreakdown([
      { label: 'A', value: 10 },
      { label: 'B', value: 0 },
      { label: 'C', value: -5 },
      { label: 'D', value: 4 }
    ]);
    expect(total).toBe(14);
  });

  it('supports zeroed exfill input safely', () => {
    const breakdown = createExfillXPBreakdown({
      timeMs: 0,
      kills: 0,
      level: 1,
      coins: 0,
      dataCores: 0,
      weaponCount: 0,
      weaponLevelTotal: 0,
      upgradeCount: 0
    });
    const lookup = Object.fromEntries(breakdown.map(item => [item.label, item.value]));
    expect(lookup['Exfill Bonus XP']).toBe(250);
    expect(lookup['Kill XP']).toBe(0);
    expect(lookup['Survival Time XP']).toBe(0);
    expect(sumXPBreakdown(breakdown)).toBeGreaterThan(0);
  });
});
