import type { FriendsTransportSave } from './FriendsExpedition';
import type { FrontierSnapshot } from './FriendsFrontier';
import { CoopSimulation, type CoopPlayerSeed } from './CoopSimulation';
import type { FriendsProgress } from './FriendsExpedition';
import type { FriendsBuildingSnapshot } from './FriendsBuilding';
import type { FriendsProjectSnapshot } from './FriendsProjects';

/** The separate mode entry point reuses proven combat and transport code.
 * Survival construction never creates an expedition or loads its save. */
export class FriendsSimulation extends CoopSimulation {
  constructor(players: CoopPlayerSeed[], seed = 0xdecafbad, progress?: FriendsProgress, building?: FriendsBuildingSnapshot, projects?: FriendsProjectSnapshot, frontier?: FrontierSnapshot, transport?: FriendsTransportSave) {
    super(players, seed, undefined, 'friends_frontier', 'friends', progress, building, projects, frontier, transport);
  }
}
