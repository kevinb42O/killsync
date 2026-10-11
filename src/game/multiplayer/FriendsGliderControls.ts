import type { CoopPlayerSnapshot, CoopSnapshot } from './CoopSimulation';
export const GLIDER_TOOL=13;
/** An inflated wing cannot be stowed while its pilot is suspended in the air,
 * including deployment and collision recovery, not only steady flight. */
export function gliderEquipmentLocked(player:CoopPlayerSnapshot|undefined){
  const wing=player?.friendsSoaring;
  return Boolean(wing&&wing.phase!=='landed'&&(wing.phase==='flying'||wing.phase==='collapsed'||wing.agl>.5));
}
export function gliderAvailable(player:CoopPlayerSnapshot|undefined,snapshot:CoopSnapshot|undefined){
  if(!player||player.lifeState!=='alive'||player.friendsSeat||player.motion?.swimming||player.carryingHostage)return false;
  const friends=snapshot?.friends;
  return Boolean(friends&&!friends.vehicles.some(v=>v.pilotId===player.id)
    &&!friends.hauling?.playerRopes?.some(r=>r.id===player.id||r.playerId===player.id));
}
