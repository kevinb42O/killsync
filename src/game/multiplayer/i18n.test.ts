import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COOP_LANGUAGE_STORAGE_KEY,
  coopAmmoTypeKey,
  coopGasStateKey,
  coopImprintStatDescriptionKey,
  coopImprintStatNameKey,
  coopRunPhaseKey,
  coopText,
  isCoopTextKey,
  localizeCoopSignalingMessage,
  normalizeCoopLanguage,
  readCoopLanguage,
  writeCoopLanguage,
} from './i18n';

describe('co-op localization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects Russian and safely defaults unsupported values to English', () => {
    expect(normalizeCoopLanguage('ru')).toBe('ru');
    expect(normalizeCoopLanguage('de')).toBe('en');
    expect(normalizeCoopLanguage(undefined)).toBe('en');
  });

  it('interpolates semantic message parameters per client language', () => {
    expect(coopText('en', 'purchase.credits', { amount: 125 })).toBe('Need 125 more credits.');
    expect(coopText('ru', 'purchase.credits', { amount: 125 })).toBe('Не хватает кредитов: 125.');
  });

  it('recognizes only catalog-backed semantic keys', () => {
    expect(isCoopTextKey('objective.secureUplink')).toBe(true);
    expect(isCoopTextKey('host supplied display text')).toBe(false);
  });

  it('localizes gameplay phases, units, ammo, gas, and Imprint definitions', () => {
    expect(coopText('ru', coopRunPhaseKey('checkpoint'))).toBe('Промежуточная эвакуация');
    expect(coopText('ru', 'unit.meters', { value: 42 })).toBe('42 м');
    expect(coopText('ru', coopAmmoTypeKey('arc_cell'))).toBe('Дуговые ячейки');
    expect(coopText('ru', coopGasStateKey('spreading'))).toBe('Распространяется');
    expect(coopText('ru', coopImprintStatNameKey('handling'))).toBe('Обращение');
    expect(coopText('ru', coopImprintStatDescriptionKey('reach'))).toBe('Личная дистанция притяжения предметов.');
    expect(coopText('ru', 'deployment.district', { sector: '07' })).toBe('Неоновый район 07');
    expect(coopText('en', 'deployment.clickToDeploy')).toBe('Click to deploy');
    expect(coopText('en', 'deployment.welcome')).toBe('Welcome,');
  });

  it('localizes legacy signaling messages both before and during a match', () => {
    expect(localizeCoopSignalingMessage('ru', 'Operative Raven is connecting…', 'status')).toBe('Боец Raven подключается…');
    expect(localizeCoopSignalingMessage('ru', 'This squad is full.', 'error')).toBe('В этом отряде нет свободных мест.');
    expect(localizeCoopSignalingMessage('ru', 'Signal broker is busy. Try again in a moment.', 'error')).toBe('Сервис связи занят. Повторите попытку через минуту.');
  });

  it('persists a per-client language preference', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    writeCoopLanguage('ru');
    expect(values.get(COOP_LANGUAGE_STORAGE_KEY)).toBe('ru');
    expect(readCoopLanguage()).toBe('ru');
  });
});
