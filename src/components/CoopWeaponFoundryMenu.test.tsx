import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COOP_WEAPON_SLOTS } from '../game/combat/coopFirearms';
import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
import { coopText } from '../game/multiplayer/i18n';
import { CoopWeaponFoundryMenu } from './CoopWeaponFoundryMenu';

describe('localized co-op Weapon Foundry', () => {
  it('renders Russian weapon metadata without raw ammo identifiers or English abbreviations', () => {
    const player = {
      coins: 5_000,
      weaponStates: COOP_WEAPON_SLOTS.map(weaponId => ({ weaponId, level: 1 })),
    } as unknown as CoopPlayerSnapshot;
    const markup = renderToStaticMarkup(<CoopWeaponFoundryMenu
      player={player}
      message={null}
      tr={(key, params) => coopText('ru', key, params)}
      onForge={() => undefined}
      onClose={() => undefined}
    />);

    for (const text of ['Оружейная кузница', 'Пистолетные патроны', 'Винтовочные патроны', 'Ружейные патроны', 'Дуговые ячейки', 'Патроны для ПП', 'УР. 1', 'КР']) expect(markup).toContain(text);
    for (const leak of ['PISTOL AMMO', 'RIFLE AMMO', 'ARC CELL', '>LV ', ' CR<']) expect(markup).not.toContain(leak);
  });
});
