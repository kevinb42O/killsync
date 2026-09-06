import { describe, expect, it } from 'vitest';
import { COOP_BUY_STATION_STOCK } from '../game/multiplayer/CoopBuyStation';
import { coopShopItemsForCategory, resolveCoopShopKey } from './CoopShopMenu';

describe('Counter-Strike-style co-op shop keys', () => {
  it('maps the root digits to five categories and zero to close', () => {
    expect(resolveCoopShopKey(null, '1', COOP_BUY_STATION_STOCK)).toEqual({ type: 'category', categoryId: 'health_armor' });
    expect(resolveCoopShopKey(null, '4', COOP_BUY_STATION_STOCK)).toEqual({ type: 'category', categoryId: 'support' });
    expect(resolveCoopShopKey(null, '5', COOP_BUY_STATION_STOCK)).toEqual({ type: 'category', categoryId: 'reinforcements' });
    expect(resolveCoopShopKey(null, '0', COOP_BUY_STATION_STOCK)).toEqual({ type: 'close' });
  });

  it('maps reinforcement digits only to eliminated operator ids supplied by the arena', () => {
    expect(resolveCoopShopKey('reinforcements', '1', COOP_BUY_STATION_STOCK, ['guest-a', 'guest-b'])).toEqual({ type: 'redeploy', targetPlayerId: 'guest-a' });
    expect(resolveCoopShopKey('reinforcements', '2', COOP_BUY_STATION_STOCK, ['guest-a', 'guest-b'])).toEqual({ type: 'redeploy', targetPlayerId: 'guest-b' });
    expect(resolveCoopShopKey('reinforcements', '3', COOP_BUY_STATION_STOCK, ['guest-a', 'guest-b'])).toEqual({ type: 'none' });
  });

  it('maps submenu digits to purchases and navigation keys to Back', () => {
    expect(resolveCoopShopKey('ammunition', '1', COOP_BUY_STATION_STOCK)).toEqual({ type: 'purchase', itemId: 'selected_ammo' });
    expect(resolveCoopShopKey('ammunition', '2', COOP_BUY_STATION_STOCK)).toEqual({ type: 'purchase', itemId: 'full_ammo' });
    expect(resolveCoopShopKey('ammunition', '0', COOP_BUY_STATION_STOCK)).toEqual({ type: 'back' });
    expect(resolveCoopShopKey('ammunition', 'Escape', COOP_BUY_STATION_STOCK)).toEqual({ type: 'back' });
    expect(resolveCoopShopKey('ammunition', 'Backspace', COOP_BUY_STATION_STOCK)).toEqual({ type: 'back' });
    expect(resolveCoopShopKey('ammunition', 'f', COOP_BUY_STATION_STOCK)).toEqual({ type: 'close' });
  });

  it('keeps all twelve stocked products reachable without global product keys', () => {
    const allItems = ['health_armor', 'ammunition', 'equipment', 'support'].flatMap(category =>
      coopShopItemsForCategory(category as Parameters<typeof coopShopItemsForCategory>[0], COOP_BUY_STATION_STOCK));
    expect(new Set(allItems)).toEqual(new Set(COOP_BUY_STATION_STOCK));
    expect(allItems).toHaveLength(12);
  });
});
