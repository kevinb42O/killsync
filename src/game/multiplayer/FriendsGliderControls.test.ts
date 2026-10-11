import { describe,it,expect } from 'vitest';
import { gliderAvailable,gliderEquipmentLocked,GLIDER_TOOL } from './FriendsGliderControls';
import { sanitizeFriendsTool } from './protocol';
import { createSoaringState } from './FriendsSoaring';
import type { CoopPlayerSnapshot,CoopSnapshot } from './CoopSimulation';
const p=(extra:Partial<CoopPlayerSnapshot>={})=>({id:'pilot',lifeState:'alive',...extra} as CoopPlayerSnapshot);
const world=(vehicles:any[]=[],playerRopes:any[]=[])=>({friends:{vehicles,hauling:{playerRopes}}} as CoopSnapshot);
describe('Fun-bar glider equipment',()=>{
  it('allows selecting equipment on foot but locks flying, deployment and recovery',()=>{
    expect(gliderEquipmentLocked(p())).toBe(false);
    for(const state of [{phase:'flying',agl:0},{phase:'collapsed',agl:0},{phase:'inflating',agl:20}]){
      expect(gliderEquipmentLocked(p({friendsSoaring:{...createSoaringState(0),...state} as any}))).toBe(true);
    }
    expect(gliderEquipmentLocked(p({friendsSoaring:{...createSoaringState(0),phase:'landed',agl:0}}))).toBe(false);
    expect(gliderEquipmentLocked(p({friendsSoaring:{...createSoaringState(0),phase:'landed',agl:12}}))).toBe(false);
  });
  it('refuses deployment while seated, swimming, piloting or carrying a teammate',()=>{
    expect(gliderAvailable(p(),world())).toBe(true);
    expect(gliderAvailable(p({friendsSeat:{vehicleId:'seat',index:0}}),world())).toBe(false);
    expect(gliderAvailable(p({motion:{swimming:true} as any}),world())).toBe(false);
    expect(gliderAvailable(p(),world([{pilotId:'pilot'}]))).toBe(false);
    expect(gliderAvailable(p(),world([],[{id:'pilot',playerId:'friend'}]))).toBe(false);
    expect(gliderAvailable(p(),world([],[{id:'friend',playerId:'pilot'}]))).toBe(false);
  });
  it('preserves glider/dynamite slots but makes malformed tool values harmless',()=>{
    expect(sanitizeFriendsTool(GLIDER_TOOL)).toBe(13);expect(sanitizeFriendsTool(12)).toBe(12);
    for(const n of [99,-1,1.5,NaN,Infinity])expect(sanitizeFriendsTool(n)).toBe(6);
    expect(sanitizeFriendsTool(undefined)).toBe(0);
  });
});
