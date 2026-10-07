import { caveAt, CAVE_ENTRANCE, CAVE_TREASURES, nearbyCaveTreasure } from '../game/world/FriendsCave';
import { Compass, Radio, TrainFront, Plane, MapPin } from 'lucide-react';
import type { CoopPlayerSnapshot, CoopSnapshot } from '../game/multiplayer/CoopSimulation';
import { FRONTIER_SITES } from '../game/world/FriendsTerrain';
import { friendsVehicleFloor, vehicleLocal } from '../game/multiplayer/FriendsExpedition';
import { FRIENDS_HUB, insideFriendsCombat } from '../game/world/FriendsRegion';

export function FriendsHUD({ snapshot, player, interactionLabel }: { snapshot: CoopSnapshot; player?: CoopPlayerSnapshot; interactionLabel: string }) {
  const expedition = snapshot.friends;
  if (!expedition || !player) return null;
  const vehicle = expedition.vehicles.find(v => { const floor = friendsVehicleFloor([v], player.x, player.y, player.z); return floor !== undefined && Math.abs(player.z - floor) < 2; });
  const aircraft = expedition.vehicles.find(v => v.kind === 'aircraft')!;
  const cockpit = vehicleLocal(aircraft, player.x, player.y);
  const piloting = aircraft.pilotId === player.id;
  const canPilot = !aircraft.pilotId && Math.abs(player.z - aircraft.z) < 22 && cockpit.x > 55 && cockpit.x < 165 && Math.abs(cockpit.y) < 55;
  const nearestPlace = [{name:'OPEN FRONTIER',...FRIENDS_HUB},...FRONTIER_SITES].sort((a, b) => Math.hypot(player.x - a.x, player.y - a.y) - Math.hypot(player.x - b.x, player.y - b.y))[0];
  const cave=caveAt(player.x,player.y,player.z);
  const treasure=nearbyCaveTreasure(player,expedition.progress.openedTreasures);
  const prompt = piloting ? 'Release pilot controls' : canPilot ? 'Pilot the Sunskiff' : treasure ? `Open ${treasure.name} · ${treasure.gold.toLocaleString('en-US')} gold` : '';
  return <>
    <aside className="friends-hud pointer-events-none">
      <div className="friends-hud__eyebrow"><Compass size={12} /> SUNLINE FRONTIER <span>HOST SAVES WORLD PROGRESS</span></div>
      <strong>{cave || (Math.hypot(player.x-CAVE_ENTRANCE.x,player.y-CAVE_ENTRANCE.y)<280 ? CAVE_ENTRANCE.name : nearestPlace.name)}</strong>
      <div className="friends-hud__progress"><MapPin size={12} /> {(expedition.frontier?.discovered?.length || 0)}/4 survey sites <Radio size={12} /> {expedition.frontier ? `${expedition.frontier.chopped} trees · ${expedition.frontier.mined} blocks mined` : expedition.progress.restored ? 'Valley signal restored' : `${expedition.progress.signals.length}/3 recordings`}</div>
      <div className="friends-hud__progress">◈ {(expedition.progress.caveGold||0).toLocaleString('en-US')} gold · shared crew treasury · {(expedition.progress.openedTreasures||[]).length}/{CAVE_TREASURES.length} chests</div>
      <small>{cave ? `L flashlight · Mouse aims beam · ${Math.max(0,Math.round((672-player.z)/12))} m below arrival · G field pack → Return to arrival` : expedition.frontier ? `L flashlight · 1 axe · 2 pickaxe · G field pack · B build · M atlas` : `Build together · B construction · M map · F interact`}</small><div className="friends-hud__safety">{insideFriendsCombat(player.x, player.y, player.z) && expedition.salvageState === 'active' ? '◇ COMBAT RESERVE · step outside to retreat' : '○ FRONTIER · SAFE TO EXPLORE'}</div>
    </aside>
    {snapshot.elapsedMs < expedition.noticeUntilMs && <div className="friends-notice pointer-events-none"><Radio size={15} /><p>{expedition.notice}</p></div>}
    {vehicle && <div className="friends-ride pointer-events-none">{vehicle.kind === 'train' ? <TrainFront size={16} /> : <Plane size={16} />}<div><strong>{piloting ? 'SUNSKIFF · PILOT' : vehicle.kind === 'train' ? 'SUNLINE · ON BOARD' : 'SUNSKIFF · CREW'}</strong><small>{piloting ? 'Move: fly · jump: ascend · crouch: descend · sprint: boost' : vehicle.kind === 'train' ? expedition.transport?.held ? 'Held · G opens train controls' : 'Your railway · walk freely · jump off anywhere' : 'Walk freely · shoot from the cabin · jump out anytime'}</small></div></div>}
    {prompt && <div className="friends-interact pointer-events-none"><kbd>{interactionLabel}</kbd>{prompt}</div>}
  </>;
}
