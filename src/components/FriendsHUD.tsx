import { FriendsSoaringHUD } from './FriendsSoaringHUD';
import { caveAt } from '../game/world/FriendsCave';
import { descentRoomAt, nearbyCaveLift, CAVE_DESCENT_ROOMS } from '../game/world/FriendsCaveDescent';
import { fishingBoatInteraction } from '../game/world/FriendsFishingBoat';
import { retreatSeatPrompt, retreatSwitchPrompt } from '../game/multiplayer/FriendsRetreats';
import { nearbyCrane, craneHookInteraction } from '../game/multiplayer/FriendsCrane';
import { scenicSeatPrompt, scenicControlNearby } from '../game/multiplayer/FriendsScenicService';
import { campfireSeatPrompt, isCampfireSeat } from '../game/multiplayer/FriendsCampfireSeats';
import { campfireNearby } from '../game/multiplayer/FriendsCampfireSimulation';
import type { CoopPlayerSnapshot, CoopSnapshot } from '../game/multiplayer/CoopSimulation';
import { nearbyFriendsCaveTreasure, friendsVehicleFloor, vehicleLocal } from '../game/multiplayer/FriendsExpedition';
import { FriendsHaulingCompass } from './FriendsHaulingCompass';
import { haulingInteraction } from '../game/multiplayer/FriendsHauling';

export function FriendsHUD({ snapshot, player, interactionLabel, tool = 6, toolbeltVisible = false, resumeControlVisible = false, rowboatHint, boatThirdPerson=false, onToggleBoatView, gliderEquipped=false }: { snapshot: CoopSnapshot; player?: CoopPlayerSnapshot; interactionLabel: string; tool?:number; toolbeltVisible?: boolean; resumeControlVisible?: boolean; rowboatHint?: string; boatThirdPerson?:boolean; onToggleBoatView?:()=>void; gliderEquipped?:boolean }) {
  const expedition = snapshot.friends;
  if (!expedition || !player || isCampfireSeat(player.friendsSeat)) return null;
  const service=expedition.scenicRailway;
  const seatPrompt=retreatSeatPrompt(player,snapshot.players,expedition.retreats)??campfireSeatPrompt(player,snapshot.players)??scenicSeatPrompt(player,expedition.vehicles,service?.seats);
  const vehicle = expedition.vehicles.find(v => { if(player.friendsSeat?.vehicleId===v.id)return true; const floor = friendsVehicleFloor([v], player.x, player.y, player.z); return floor !== undefined && Math.abs(player.z - floor) < 2; });
  const fishingBoat=expedition.vehicles.find(v=>v.kind==='fishingBoat');
  const sailing=fishingBoat?.pilotId===player.id;
  const boatPrompt=fishingBoat&&fishingBoatInteraction(fishingBoat,player)?sailing?'Stop sailing · release helm':'Take fishing boat helm':undefined;
  const aircraft = expedition.vehicles.find(v => v.kind === 'aircraft')!;
  const cockpit = vehicleLocal(aircraft, player.x, player.y);
  const piloting = aircraft.pilotId === player.id;
  const canPilot = !aircraft.pilotId && Math.abs(player.z - aircraft.z) < 22 && cockpit.x > 55 && cockpit.x < 165 && Math.abs(cockpit.y) < 55;
  const caveName=caveAt(player.x,player.y,player.z+30),caveRoom=descentRoomAt(player),caveLift=nearbyCaveLift(player,expedition.progress.openedTreasures);
  const found=CAVE_DESCENT_ROOMS.filter(r=>expedition.progress.openedTreasures?.includes(`${r.id}-cache`)).length;
  const treasure=nearbyFriendsCaveTreasure(player,expedition.progress.openedTreasures,undefined,expedition.building?.pieces);
  const hauling=expedition.hauling, haulingFeedback=hauling?.feedback[player.id];
  const miningFeedback=expedition.frontier?.feedback[player.id];
  const cargoTarget=hauling && haulingInteraction(hauling.cargo,player,expedition.vehicles,hauling.delivered,hauling.completedCargoIds);
  const crane=nearbyCrane(expedition.building?.pieces??[],player);
  const hook=hauling&&craneHookInteraction([...(hauling.cranes??[]),...(hauling.aircraftWinch?[hauling.aircraftWinch]:[])],hauling.cargo,player);
  const seatLabel = seatPrompt && !isCampfireSeat(seatPrompt.seat) ? player.friendsSeat ? 'Stand up' : seatPrompt.label : seatPrompt?.label;
  const lightPrompt=retreatSwitchPrompt(player,expedition.retreats);
  const fishing=expedition.fishing;
  const handsAvailable=(tool===6||tool===7)&&!player.friendsSeat&&!player.motion?.swimming&&!player.friendsDevFlight&&!fishing?.fish.some(f=>f.ownerId===player.id||f.tetheredBy===player.id)&&!fishing?.casts.some(c=>c.playerId===player.id);
  const nearbyFish=handsAvailable&&fishing?.fish.some(f=>f.phase==='dry'&&Math.hypot(f.x-player.x,f.y-player.y,f.z-player.z-8)<55);
  const prompt = sailing ? boatPrompt : nearbyFish ? 'Pick up fish' : boatPrompt ? boatPrompt : lightPrompt ? lightPrompt.label : crane ? 'Freight crane controls' : hook?hook.label:scenicControlNearby(player,expedition.vehicles) ? 'Train speed controls' : seatLabel ? seatLabel : piloting ? 'Release pilot controls' : canPilot ? 'Pilot the Sunskiff' : cargoTarget ? cargoTarget.label : treasure ? `Recover ${treasure.name} · ${treasure.description??'Expedition supplies'}` : caveLift ? caveLift.label : '';
  const trainDock = !player.friendsDevFlight && vehicle?.scenic;
  return <>
    <FriendsSoaringHUD player={player} timeMs={snapshot.elapsedMs} equipped={gliderEquipped}/>
    {hauling && <FriendsHaulingCompass hauling={hauling} player={player}/>}
    <div className={trainDock ? 'friends-train-dock pointer-events-none' : 'friends-context'} data-toolbelt-visible={toolbeltVisible} data-resume-visible={resumeControlVisible}>
    {caveName && !vehicle && <div className="friends-cave-journal" role="status"><strong>{caveName}</strong><span>{Math.max(0,Math.round((608-player.z)/12))} m below entrance · {found}/8 discoveries</span><small>{caveRoom?caveRoom.detail:'Follow the copper lights to the Silent Well. The old haul road continues below.'}</small></div>}
    {haulingFeedback && snapshot.elapsedMs < haulingFeedback.until && <div className="friends-hauling-feedback" role="status">{haulingFeedback.message}</div>}
    {miningFeedback && snapshot.elapsedMs < miningFeedback.until && <div className="frontier-feedback" role="status">{miningFeedback.message}</div>}
    {sailing && <div className="friends-rowboat-hint">Forward / reverse · left / right steer · {interactionLabel} release helm &amp; walk</div>}
    {sailing && onToggleBoatView && <button type="button" className="friends-boat-view" aria-pressed={boatThirdPerson} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onToggleBoatView();}}> {boatThirdPerson?'First-person sailing view':'Third-person sailing view'} <kbd>O</kbd></button>}
    {rowboatHint && <div className="friends-rowboat-hint">{rowboatHint}</div>}
    {player.friendsDevFlight && <div className="friends-ride pointer-events-none">Free flight · C settings</div>}
    {!player.friendsDevFlight && vehicle && vehicle.kind!=='rowboat' && <div className="friends-ride pointer-events-none">
      {vehicle.kind==='fishingBoat' ? sailing?'Fishing boat · helm':'Fishing boat · fishing deck' : piloting ? 'Sunskiff · pilot' : vehicle.scenic ? 'Grand Traverse' : vehicle.kind === 'train' ? 'Sunline' : 'Sunskiff'}
      {vehicle.scenic && service && <span> · {service.blocked?'Track obstructed':service.held?'Held':service.dwell>0?'Boarding':Math.round(service.speed/12*3.6)+' km/h'} · Next: {service.nextStation}</span>}
      {!vehicle.scenic && vehicle.kind === 'train' && expedition.transport?.held && <span> · Held</span>}
    </div>}
    {!player.friendsSoaring && prompt && <div className="friends-interact pointer-events-none"><kbd>{interactionLabel}</kbd><span>{prompt}{campfireNearby(player)&&<small> · K add wood</small>}</span></div>}
    </div>
  </>;
}
