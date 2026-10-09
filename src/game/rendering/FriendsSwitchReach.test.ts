import {describe,it,expect} from 'vitest';
import {switchReachBlend,switchPalmTarget} from './FriendsSwitchReach';
import {RETREAT_SWITCH} from '../world/FriendsRetreatSites';
describe('switch hand contact',()=>{
 it('reaches the physical rocker, holds briefly and retracts smoothly',()=>{
   expect(switchReachBlend(0)).toBe(0);expect(switchReachBlend(.11)).toBeCloseTo(.5);
   expect(switchReachBlend(.22)).toBe(1);expect(switchReachBlend(.30)).toBe(1);
   expect(switchReachBlend(.52)).toBeCloseTo(.5);expect(switchReachBlend(.72)).toBe(0);
   expect(switchPalmTarget.toArray()).toEqual([RETREAT_SWITCH.x,RETREAT_SWITCH.z,RETREAT_SWITCH.y]);
 });
});
