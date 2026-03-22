export const MAX_ACCOUNT_LEVEL = 100;

export type XPBreakdownItem = {
  label: string;
  value: number;
};

export const getAccountXPRequired = (level: number) => {
  if (level >= MAX_ACCOUNT_LEVEL) return 0;
  return Math.floor(180 + Math.pow(level, 1.28) * 42);
};

export const applyAccountXP = (startLevel: number, startXP: number, gainedXP: number) => {
  let level = startLevel;
  let xp = startXP;
  let remaining = Math.max(0, Math.floor(gainedXP));

  while (remaining > 0 && level < MAX_ACCOUNT_LEVEL) {
    const required = getAccountXPRequired(level);
    const toNext = required - xp;
    const add = Math.min(remaining, toNext);
    xp += add;
    remaining -= add;

    if (xp >= required) {
      level += 1;
      xp = 0;
    }
  }

  if (level >= MAX_ACCOUNT_LEVEL) {
    level = MAX_ACCOUNT_LEVEL;
    xp = 0;
    remaining = 0;
  }

  return { level, xp, overflow: remaining };
};

export const createDeathXPBreakdown = (wavesCleared: number, kills: number): XPBreakdownItem[] => {
  const wavesXP = wavesCleared * 50;
  const killXP = kills * 4;
  return [
    { label: 'Kill XP', value: killXP },
    { label: 'Waves Cleared XP', value: wavesXP }
  ];
};

export const createExfillXPBreakdown = (params: {
  wavesCleared: number;
  kills: number;
  level: number;
  coins: number;
  dataCores: number;
  weaponCount: number;
  weaponLevelTotal: number;
  upgradeCount: number;
}): XPBreakdownItem[] => {
  const wavesXP = params.wavesCleared * 100;
  const killXP = params.kills * 5;
  const exfillBonusXP = 250;
  const levelXP = params.level * 30;
  const weaponCountXP = params.weaponCount * 40;
  const weaponMasteryXP = params.weaponLevelTotal * 20;
  const coinsXP = Math.floor(params.coins * 0.15);
  const coreXP = params.dataCores * 125;
  const upgradeXP = params.upgradeCount * 18;

  return [
    { label: 'Exfill Bonus XP', value: exfillBonusXP },
    { label: 'Kill XP', value: killXP },
    { label: 'Waves Cleared XP', value: wavesXP },
    { label: 'Level Reached XP', value: levelXP },
    { label: 'Weapons Collected XP', value: weaponCountXP },
    { label: 'Weapon Mastery XP', value: weaponMasteryXP },
    { label: 'Gold Extracted XP', value: coinsXP },
    { label: 'Data Core XP', value: coreXP },
    { label: 'Upgrade Picks XP', value: upgradeXP }
  ];
};

export const sumXPBreakdown = (items: XPBreakdownItem[]) => {
  return items.filter(item => item.value > 0).reduce((sum, item) => sum + item.value, 0);
};
