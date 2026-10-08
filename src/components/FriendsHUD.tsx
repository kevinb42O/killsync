import { scenicSeatPrompt, scenicControlNearby } from '../game/multiplayer/FriendsScenicService';
import { nearbyCaveTreasure } from '../game/world/FriendsCave';
import { TrainFront, Plane } from 'lucide-react';
import type { CoopPlayerSnapshot, CoopSnapshot } from '../game/multiplayer/CoopSimulation';
import { friendsVehicleFloor, vehicleLocal } from '../game/multiplayer/FriendsExpedition';
import { FriendsHaulingCompass } from './FriendsHaulingCompass';
import { haulingInteraction } from '../game/multiplayer/FriendsHauling';

export function FriendsHUD({ snapshot, player, interactionLabel, onMission }: { snapshot: CoopSnapshot; player?: CoopPlayerSnapshot; interactionLabel: string; onMission?:(cargoId:string)=>void }) {
  const expedition = snapshot.friends;
  if (!expedition || !player) return null;
  const service=expedition.scenicRailway;
  const seatPrompt=scenicSeatPrompt(player,expedition.vehicles,service?.seats);
  const vehicle = expedition.vehicles.find(v => { if(player.friendsSeat?.vehicleId===v.id)return true; const floor = friendsVehicleFloor([v], player.x, player.y, player.z); return floor !== undefined && Math.abs(player.z - floor) < 2; });
  const aircraft = expedition.vehicles.find(v => v.kind === 'aircraft')!;
  const cockpit = vehicleLocal(aircraft, player.x, player.y);
  const piloting = aircraft.pilotId === player.id;
  const canPilot = !aircraft.pilotId && Math.abs(player.z - aircraft.z) < 22 && cockpit.x > 55 && cockpit.x < 165 && Math.abs(cockpit.y) < 55;
  const treasure=nearbyCaveTreasure(player,expedition.progress.openedTreasures);
  const hauling=expedition.hauling, haulingFeedback=hauling?.feedback[player.id];
  const cargoTarget=hauling && haulingInteraction(hauling.cargo,player,expedition.vehicles,hauling.delivered,hauling.completedCargoIds);
  const prompt = scenicControlNearby(player,expedition.vehicles) ? 'Train speed controls' : seatPrompt ? seatPrompt.label : piloting ? 'Release pilot controls' : canPilot ? 'Pilot the Sunskiff' : cargoTarget ? cargoTarget.label : treasure ? `Open ${treasure.name} · ${treasure.gold.toLocaleString('en-US')} gold` : '';
  return <>
    {hauling && <FriendsHaulingCompass hauling={hauling} player={player} interactionLabel={interactionLabel} onMission={onMission}/>}
    {haulingFeedback && snapshot.elapsedMs < haulingFeedback.until && <div className="friends-hauling-feedback" role="status">{haulingFeedback.message}</div>}
    {player.friendsDevFlight && <div className="friends-ride pointer-events-none"><Plane size={16} /><div><strong>DEV FREE FLIGHT · C SETTINGS</strong><small>Move toward your view · Space rise · Ctrl descend · Shift boost</small></div></div>}
    {!player.friendsDevFlight && vehicle && <div className="friends-ride pointer-events-none">{vehicle.kind === 'train' ? <TrainFront size={16} /> : <Plane size={16} />}<div><strong>{piloting ? 'SUNSKIFF · PILOT' : vehicle.scenic ? 'GRAND TRAVERSE · '+(player.friendsSeat?'SEATED':'ON BOARD') : vehicle.kind === 'train' ? 'SUNLINE · ON BOARD' : 'SUNSKIFF · CREW'}</strong><small>{piloting ? 'Move: fly · jump: ascend · crouch: descend · sprint: boost' : vehicle.scenic && service ? `${service.chapter} · ${service.blocked?'Track obstructed':service.held?'Held':service.dwell>0?'Boarding':Math.round(service.speed/12*3.6)+' km/h'} · Next: ${service.nextStation} · F sit / stand` : vehicle.kind === 'train' ? expedition.transport?.held ? 'Held · G opens train controls' : 'Your railway · walk freely · jump off anywhere' : 'Walk freely · shoot from the cabin · jump out anytime'}</small></div></div>}
    {prompt && <div className="friends-interact pointer-events-none"><kbd>{interactionLabel}</kbd>{prompt}</div>}
  </>;
}
