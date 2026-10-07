import type { CoopPlayerSeed } from './CoopSimulation';
import { normalizeCoopImprintLoadout } from './CoopImprint';

export const FRIENDS_OPERATOR_ID = 'solar_guard' as const;

/** Friends has one character. Never write these session defaults to progression. */
export function friendsMenuPlayer(player: CoopPlayerSeed): CoopPlayerSeed {
  return { ...player, skinId: FRIENDS_OPERATOR_ID, operatorId: FRIENDS_OPERATOR_ID,
    imprint: normalizeCoopImprintLoadout(undefined, FRIENDS_OPERATOR_ID),
  };
}
